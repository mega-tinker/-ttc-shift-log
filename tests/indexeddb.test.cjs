const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {IDBFactory}=require('fake-indexeddb'),{JSDOM}=require('jsdom'),{webcrypto}=require('crypto');
const T=require('../core.js'),S=require('../spareboard.js');
const KEY=S.SHIFT,photo='data:image/jpeg;base64,'+Buffer.from('synthetic photo bytes').toString('base64');
const record={id:'one',date:'2026-11-12',routes:'999',crew:'9999',run:'99',bus:'9999',scheduledStart:'08:00',scheduledFinish:'16:00',actualFinish:'16:13',actualFinishDay:0,notes:'test',photos:[{id:'p',data:photo,keep:true}]};
const read=n=>fs.readFileSync(require('path').join(__dirname,'..',n),'utf8');
function environment(indexedDB=new IDBFactory()){
 const values=new Map(),legacy={getItem:k=>values.get(k)??null,setItem(){throw Error('Legacy writes prohibited');},removeItem(){throw Error('Legacy deletion prohibited');}};
 const ctx={indexedDB,crypto:webcrypto,TextEncoder,Blob,atob,btoa,TTC:T,Spareboard:S,location:{pathname:'/test/'},localStorage:legacy};vm.createContext(ctx);vm.runInContext(read('storage.js'),ctx);return {ctx,values,legacy,create:opts=>ctx.TTCStorage.create(opts)};
}
test('migration preserves every raw key and photo byte; restart is idempotent; large data bypasses localStorage',async()=>{
 const e=environment(),raw=JSON.stringify([record]),metadata={version:1,days:[S.blankDay(record.date)],links:[{id:'one',date:record.date}],holidays:[{date:record.date,minutes:480,notes:'holiday'}]};
 e.values.set(KEY,raw);e.values.set(S.KEY,JSON.stringify(metadata));e.values.set(KEY+'DraftV18',JSON.stringify({photos:record.photos}));e.values.set(KEY+'RecoveryV18',raw);
 const original=JSON.stringify([...e.values]);let a=await e.create({allowLegacy:()=>true});
 for(const [k,v]of e.values)assert.equal(a.getItem(k),v);assert.equal(JSON.stringify([...e.values]),original);
 a.setItem(KEY,JSON.stringify([{...record,notes:'x'.repeat(6*1024*1024)}]));await a.flush();a.close();
 a=await e.create({allowLegacy:()=>{throw Error('Migration repeated');}});assert.equal(JSON.parse(a.getItem(KEY))[0].notes.length,6*1024*1024);assert.equal(JSON.parse(a.getItem(KEY))[0].photos[0].data,photo);assert.equal(JSON.stringify([...e.values]),original);a.close();
});
test('declining shared legacy data starts isolated test database',async()=>{const e=environment();e.values.set(KEY,JSON.stringify([record]));const a=await e.create();assert.equal(a.getItem(KEY),'[]');assert.ok(e.values.get(KEY).includes('one'));a.close();});
test('corrupt migration leaves no marker; interrupted journal recovers in memory only',async()=>{
 const e=environment();e.values.set(KEY,'broken');await assert.rejects(e.create({allowLegacy:()=>true}));
 const before=JSON.stringify([record]),meta=JSON.stringify(S.empty());e.values.set(KEY,before);e.values.set(S.KEY,meta);e.values.set(S.JOURNAL,JSON.stringify({beforeShift:before,beforeMeta:null,afterShift:'[]',afterMeta:meta}));
 const a=await e.create({allowLegacy:()=>true});assert.equal(a.getItem(KEY),before);assert.equal(a.getItem(S.KEY),null);assert.equal(e.values.get(S.KEY),meta);assert.ok(e.values.has(S.JOURNAL));a.close();
});
test('quota abort rolls back records and metadata; concurrent tabs cannot overwrite',async()=>{
 const e=environment(),a=await e.create(),b=await e.create();a.setItem(KEY,JSON.stringify([record]));await a.flush();b.setItem(KEY,'[]');b.setItem(S.KEY,JSON.stringify(S.empty()));await assert.rejects(b.flush(),/Another tab/);b.close();
 const proto=require('fake-indexeddb').IDBObjectStore.prototype,put=proto.put;proto.put=function(){throw new DOMException('Full','QuotaExceededError');};
 a.setItem(KEY,'[]');a.setItem(S.KEY,JSON.stringify(S.empty()));try{await assert.rejects(a.flush(),/Full/);}finally{proto.put=put;}
 assert.equal(JSON.parse(a.getItem(KEY)).length,1);assert.equal(a.getItem(S.KEY),null);a.close();const c=await e.create();assert.equal(JSON.parse(c.getItem(KEY)).length,1);c.close();
});
test('interrupted migration retries atomically without losing legacy or duplicating records',async()=>{
 const e=environment();e.values.set(KEY,JSON.stringify([record]));e.values.set(S.KEY,JSON.stringify(S.empty()));
 const proto=require('fake-indexeddb').IDBObjectStore.prototype,put=proto.put;let writes=0;
 proto.put=function(...args){if(++writes===2)throw Error('Interrupted migration');return put.apply(this,args);};
 try{await assert.rejects(e.create({allowLegacy:()=>true}),/Interrupted migration/);}finally{proto.put=put;}
 const a=await e.create({allowLegacy:()=>true});assert.equal(a.getItem(KEY),e.values.get(KEY));assert.equal(a.getItem(S.KEY),e.values.get(S.KEY));a.close();
});
test('a queued draft cannot resurrect a failed record save',async()=>{
 const e=environment(),a=await e.create(),proto=require('fake-indexeddb').IDBObjectStore.prototype,put=proto.put;let fail=true;
 proto.put=function(...args){if(fail){fail=false;throw Error('Quota');}return put.apply(this,args);};
 a.setItem(KEY,JSON.stringify([record]));const first=a.flush();a.setItem(KEY+'DraftV18','{}');const queued=a.flush();
 try{const results=await Promise.allSettled([first,queued]);assert.ok(results.every(r=>r.status==='rejected'));}finally{proto.put=put;}
 assert.equal(a.getItem(KEY),'[]');a.close();const b=await e.create();assert.equal(b.getItem(KEY),'[]');b.close();
});
async function ui(){
 const dom=new JSDOM(read('index.html'),{url:'https://example.test/ttc-shift-log-test/',runScripts:'outside-only'}),w=dom.window;
 await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
 Object.defineProperty(w,'indexedDB',{value:new IDBFactory()});Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{TextEncoder,Blob,atob,btoa});
 const alerts=[],downloads=[];w.confirm=()=>true;w.alert=x=>alerts.push(x);w.scrollTo=()=>{};w.URL.createObjectURL=b=>{downloads.push(b);return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 for(const n of ['core.js','spareboard.js','storage.js','app.js'])w.eval(read(n));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const wait=async()=>{for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,5));if(w.TTCStore&&!w.TTCStore.busy&&!w.document.querySelector('main').inert)return;}throw Error('UI did not become ready');};await wait();
 return {dom,w,alerts,downloads,wait,$:id=>w.document.getElementById(id),rows:()=>JSON.parse(w.TTCStore.getItem(KEY)),meta:()=>JSON.parse(w.TTCStore.getItem(S.KEY)||'null')};
}
test('integrated UI: save/edit 13-minute OT, holiday, backup roundtrip, delete/undo, recovery and photos',async()=>{
 const u=await ui(),{w,$,wait,rows,meta}=u;
 const fields=async data=>{for(const [k,v]of Object.entries(data))$(k).value=v;};
 await fields({date:record.date,routes:'999',crew:'9999',run:'99',bus:'9999',scheduledStart:'08:00',scheduledFinish:'16:00',actualFinish:'16:13'});
 await $('shiftForm').onsubmit({preventDefault(){}});await wait();assert.equal(rows().length,1,$('saveMessage').textContent);assert.equal(rows()[0].paidOt,'0:13');assert.equal(rows()[0].paid,'8:00');
 await w.document.querySelector('.rich-shift-card .edit-btn').onclick();await fields({notes:'Edited'});await $('shiftForm').onsubmit({preventDefault(){}});await wait();assert.equal(rows()[0].notes,'Edited');
 $('assignmentType').value='holiday';$('assignmentType').dispatchEvent(new w.Event('change'));await wait();await $('saveHolidayOnly').onclick();await wait();assert.equal(meta().holidays.length,1);assert.equal(rows().length,1);
 // Inject a synthetic camera payload through the same persisted boundary, then export/import through the real UI.
 const r=rows();r[0].photos=record.photos;w.TTCStore.setItem(KEY,JSON.stringify(r));await w.TTCStore.flush();
 await $('exportJson').onclick();const full=JSON.parse(await u.downloads.at(-1).text());assert.equal(full.records[0].photos[0].data,photo);assert.equal(full.spareboard.holidays.length,1);
 Object.defineProperty($('importJson'),'files',{configurable:true,value:[{text:async()=>JSON.stringify(full)}]});await $('importJson').onchange({target:$('importJson')});await $('replaceImport').onclick();await wait();assert.equal(rows()[0].photos[0].data,photo);assert.equal(meta().holidays.length,1);
 await w.document.querySelector('.rich-shift-card .edit-btn').onclick();await wait();await $('deleteEditingShift').onclick();await wait();assert.equal(rows().length,0,JSON.stringify(u.alerts)+' '+$('saveMessage').textContent);await $('undoDelete').onclick();await wait();assert.equal(rows().length,1);
 await $('downloadRecovery').onclick();const recovery=JSON.parse(await u.downloads.at(-1).text());assert.equal(recovery.records[0].photos[0].data,photo);
 assert.equal(w.localStorage.length,0,'UI never writes legacy storage');assert.ok($('dataError').classList.contains('hidden'),$('dataError').textContent);
 w.TTCStore.close();u.dom.window.close();
});
test('UI quota failure retains the entry and never reports a saved shift',async()=>{
 const u=await ui(),{$,w}=u;
 for(const [k,v]of Object.entries({date:record.date,routes:'999',crew:'9999',run:'99',bus:'9999',scheduledStart:'08:00',scheduledFinish:'16:00',notes:'Keep my unsaved entry'}))$(k).value=v;
 const proto=require('fake-indexeddb').IDBObjectStore.prototype,put=proto.put;proto.put=()=>{throw Error('Storage full');};
 try{await $('shiftForm').onsubmit({preventDefault(){}});await u.wait();}finally{proto.put=put;}
 assert.equal(u.rows().length,0);assert.equal($('notes').value,'Keep my unsaved entry');assert.match($('saveMessage').textContent,/Could not complete save/);
 w.TTCStore.close();u.dom.window.close();
});
