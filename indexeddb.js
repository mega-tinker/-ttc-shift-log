/* TTC Shift Log v19.3.0 — isolated IndexedDB storage foundation.
 * NOT wired to production UI yet. Legacy localStorage remains authoritative.
 * No automatic migration or deletion occurs when this file is loaded.
 */
(function(root){
  'use strict';
  const DB_NAME='ttc-shift-log-v19';
  const DB_VERSION=1;
  const STORES={records:'records',photos:'photos',metadata:'metadata'};
  function request(req){
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('IndexedDB request failed'));
    });
  }
  function open(){
    if(!root.indexedDB)return Promise.reject(Error('IndexedDB unavailable on this device'));
    return new Promise((resolve,reject)=>{
      const req=root.indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORES.records))db.createObjectStore(STORES.records,{keyPath:'id'});
        if(!db.objectStoreNames.contains(STORES.photos))db.createObjectStore(STORES.photos,{keyPath:'id'});
        if(!db.objectStoreNames.contains(STORES.metadata))db.createObjectStore(STORES.metadata);
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('Cannot open IndexedDB'));
      req.onblocked=()=>reject(Error('Close other TTC Shift Log tabs and retry'));
    });
  }
  function transaction(db,stores,mode,work){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(stores,mode);
      let result;
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(tx.error||Error('IndexedDB transaction aborted; no changes committed'));
      tx.onerror=()=>{}; // onabort provides the final failure
      try{result=work(tx);}catch(err){try{tx.abort();}catch(_){}reject(err);}
    });
  }
  async function listRecords(db){
    return transaction(db,[STORES.records],'readonly',tx=>request(tx.objectStore(STORES.records).getAll()))
      .then(p=>p); // transaction result is a promise resolved after commit
  }
  async function getRecord(db,id){
    return transaction(db,[STORES.records],'readonly',tx=>request(tx.objectStore(STORES.records).get(id)));
  }
  async function getPhoto(db,id){
    return transaction(db,[STORES.photos],'readonly',tx=>request(tx.objectStore(STORES.photos).get(id)));
  }
  async function getMetadata(db,key){
    return transaction(db,[STORES.metadata],'readonly',tx=>request(tx.objectStore(STORES.metadata).get(key)));
  }
  function putRecord(db,record){
    if(!record||typeof record.id!=='string'||!record.id)throw Error('Record requires an ID');
    return transaction(db,[STORES.records],'readwrite',tx=>tx.objectStore(STORES.records).put(record));
  }
  function deleteRecord(db,id){
    return transaction(db,[STORES.records],'readwrite',tx=>tx.objectStore(STORES.records).delete(id));
  }
  function putPhoto(db,id,recordId,blob,properties={}){
    if(typeof id!=='string'||!id||typeof recordId!=='string'||!recordId||!(blob instanceof Blob))throw Error('Invalid photo');
    return transaction(db,[STORES.photos],'readwrite',tx=>tx.objectStore(STORES.photos).put({id,recordId,blob,...properties}));
  }
  function deletePhoto(db,id){
    return transaction(db,[STORES.photos],'readwrite',tx=>tx.objectStore(STORES.photos).delete(id));
  }
  function putMetadata(db,key,value){
    return transaction(db,[STORES.metadata],'readwrite',tx=>tx.objectStore(STORES.metadata).put(value,key));
  }
  /* Atomic replacement for a record and its new photo blobs.
   * Callers must ensure deleted-photo IDs are correct and that no legacy data is removed.
   */
  function saveBundle(db,record,photos=[],deletedPhotoIds=[]){
    if(!record||typeof record.id!=='string'||!record.id)throw Error('Record requires an ID');
    for(const p of photos)if(!p||typeof p.id!=='string'||p.recordId!==record.id||!(p.blob instanceof Blob))throw Error('Invalid photo bundle');
    return transaction(db,[STORES.records,STORES.photos],'readwrite',tx=>{
      const r=tx.objectStore(STORES.records),p=tx.objectStore(STORES.photos);
      r.put(record);
      photos.forEach(photo=>p.put(photo));
      deletedPhotoIds.forEach(id=>p.delete(id));
    });
  }
  root.TTCIndexedDB=Object.freeze({DB_NAME,DB_VERSION,STORES,open,listRecords,getRecord,getPhoto,getMetadata,putRecord,deleteRecord,putPhoto,deletePhoto,putMetadata,saveBundle});
})(typeof window!=='undefined'?window:globalThis);
