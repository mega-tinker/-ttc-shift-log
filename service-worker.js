const CACHE='ttc-shift-log:'+self.registration.scope+':v19.2.2';
const ASSETS=['./','./index.html','./styles.css?v=19.2.2','./core.js?v=19.2.2','./spareboard.js?v=19.2.2','./app.js?v=19.2.2','./storage.js?v=19.2.2','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;
 if(event.request.mode==='navigate')event.respondWith(caches.open(CACHE).then(cache=>cache.match('./index.html')));
 else event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request)).then(hit=>hit||fetch(event.request)));
});
