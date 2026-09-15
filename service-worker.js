const CACHE='ttc-shift-log-v18.1';
const ASSETS=['./','./index.html','./styles.css?v=18.1','./core.js?v=18.1','./app.js?v=18.1','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ttc-shift-log-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).then(response=>{if(!response.ok)throw Error('Unavailable');return response;}).catch(()=>caches.match('./index.html')));
 else event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});
