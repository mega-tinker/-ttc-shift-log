/* The UI reads a hydrated cache. Every acknowledged write awaits one atomic
 * IndexedDB commit. Legacy localStorage is read only, never a write fallback. */
(function(root){
  'use strict';
  const PREFIX='ttcShiftRecordsV4', META=PREFIX+'SpareboardV1';
  const KEYS=[PREFIX,PREFIX+'DraftV18',PREFIX+'RecoveryV18',PREFIX+'DeletedV18',META,META+'Transaction',META+'Recovery',META+'DeletedDaysV1'];
  const clone=x=>JSON.parse(JSON.stringify(x));
  function request(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  function done(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Storage transaction aborted.'));tx.onerror=()=>{};});}
  function open(name){return new Promise((resolve,reject)=>{
    if(!root.indexedDB)return reject(Error('IndexedDB is unavailable. Existing data is unchanged.'));
    const r=root.indexedDB.open(name,1);let blocked=false;
    r.onupgradeneeded=()=>{for(const s of ['records','photos','metadata'])r.result.createObjectStore(s);};
    r.onerror=()=>reject(r.error);r.onblocked=()=>{blocked=true;reject(Error('Close other TTC tabs and reload.'));};
    r.onsuccess=()=>{if(blocked){r.result.close();return;}resolve(r.result);};
  });}
  async function digest(s){const bytes=new TextEncoder().encode(s);return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
  function photoBlob(data){const comma=data.indexOf(','),binary=root.atob(data.slice(comma+1));return new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:data.slice(5,comma).split(';')[0]});}
  async function photoURL(p){const a=new Uint8Array(await p.blob.arrayBuffer());let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return p.prefix+root.btoa(s);}
  async function pack(values){
    const photos=new Map(),encoded={};
    for(const [key,raw] of Object.entries(values)){
      const parts=[];let start=0;
      for(const m of raw.matchAll(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/]*={0,2}/g)){
        const data=m[0],id=await digest(data),p={blob:photoBlob(data),prefix:data.slice(0,data.indexOf(',')+1)};
        if(await photoURL(p)!==data)throw Error('A photo is not canonical base64. Export the legacy data before continuing.');
        parts.push(raw.slice(start,m.index),{photo:id});start=m.index+data.length;photos.set(id,p);
      }
      parts.push(raw.slice(start));encoded[key]=parts;
    }
    return {encoded,photos};
  }
  async function unpack(encoded,photos){const urls=new Map();for(const [id,p]of photos)urls.set(id,await photoURL(p));const out={};for(const [k,parts]of Object.entries(encoded))out[k]=parts.map(p=>typeof p==='string'?p:(urls.has(p.photo)?urls.get(p.photo):(()=>{throw Error('Missing stored photo.');})())).join('');return out;}
  function validate(values){
    if(values[PREFIX]!==undefined)root.TTC.validate(JSON.parse(values[PREFIX]));
    if(values[META]!==undefined)root.Spareboard.validate(JSON.parse(values[META]));
  }
  async function create({name='ttc-shift-log:'+root.location.pathname.replace(/[^/]*$/,''),legacy=root.localStorage,allowLegacy=()=>false}={}){
    const db=await open(name);let invalid=false;
    db.onversionchange=()=>{invalid=true;db.close();};
    async function read(){const tx=db.transaction(['records','photos','metadata'],'readonly'),end=done(tx);const [encoded,photoKeys,photoValues,head]=await Promise.all([request(tx.objectStore('records').get('values')),request(tx.objectStore('photos').getAllKeys()),request(tx.objectStore('photos').getAll()),request(tx.objectStore('metadata').get('head'))]);await end;return {values:encoded?await unpack(encoded,new Map(photoKeys.map((k,i)=>[k,photoValues[i]]))):{},head};}
    let loaded=await read(),revision=loaded.head?.revision||0,cache=loaded.values,committed=clone(cache),tail=Promise.resolve(),busy=0,epoch=0;
    const api={getItem:k=>Object.hasOwn(cache,k)?cache[k]:null,setItem(k,v){if(!KEYS.includes(k))throw Error('Unknown storage key');cache[k]=String(v);},removeItem(k){delete cache[k];},get busy(){return busy>0;},idle:()=>tail,close:()=>db.close(),
      async flush(){
        const values=clone(cache),expectedEpoch=epoch;busy++;
        const task=tail.then(async()=>{
          if(expectedEpoch!==epoch)throw Error('A previous save failed. Review the entry and retry saving.');
          if(invalid)throw Error('Storage changed in another tab. Reload before saving.');
          if(JSON.stringify(values)===JSON.stringify(committed))return;
          validate(values);const packed=await pack(values);
          const tx=db.transaction(['records','photos','metadata'],'readwrite'),end=done(tx);let conflict=false,writeError;
          const m=tx.objectStore('metadata'),r=m.get('head');
          r.onsuccess=()=>{
            if((r.result?.revision||0)!==revision){conflict=true;tx.abort();return;}
            try{tx.objectStore('records').put(packed.encoded,'values');
            // Content addressed blobs are reused by active data, drafts, trash and recovery.
            // Retain unreferenced blobs for this preview; no automatic data cleanup.
            for(const [id,p]of packed.photos)tx.objectStore('photos').put(p,id);
            m.put({revision:revision+1,migration:'verified',legacyPreserved:true},'head');
            }catch(e){writeError=e;tx.abort();}
          };
          try{await end;}catch(e){if(conflict){invalid=true;throw Error('Another tab saved changes. Reload before saving; your entry is still on screen.');}throw writeError||e;}
          revision++;committed=values;
        });
        tail=task.catch(()=>{});
        try{await task;}catch(e){if(expectedEpoch===epoch){cache=clone(committed);epoch++;}throw e;}finally{busy--;}
      }
    };
    try{if(!loaded.head){
      const candidate={};for(const k of KEYS){const raw=legacy.getItem(k);if(raw!==null)candidate[k]=raw;}
      if(Object.keys(candidate).length&&await allowLegacy(candidate)){
        // Recover an interrupted legacy pair in memory only. Never edit legacy keys.
        const memory={getItem:k=>candidate[k]??null,setItem:(k,v)=>candidate[k]=v,removeItem:k=>{delete candidate[k];}};
        root.Spareboard.recover(memory);validate(candidate);cache=candidate;
      }else cache={[PREFIX]:'[]'};
      await api.flush();loaded=await read();
      if(JSON.stringify(loaded.values)!==JSON.stringify(cache))throw Error('Migration verification failed. Legacy data remains available.');
    }}catch(e){db.close();throw e;}
    // Existing corrupt records remain available to the application's raw export
    // and replace-from-backup recovery UI. Never silently start an empty database.
    return api;
  }
  root.TTCStorage=Object.freeze({create,KEYS,pack,unpack});
})(typeof window!=='undefined'?window:globalThis);
