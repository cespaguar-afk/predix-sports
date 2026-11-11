// v2: La interfaz se actualiza por red. Los feeds nunca se guardan en el
// service worker; GitHub Pages sirve las copias públicas del proveedor.
const CACHE='predix-shell-v4';
const STATIC=['./','./index.html','./styles.css','./src/main.js','./src/data.js','./src/model.js','./src/stats.js','./src/nba-details.js','./src/storage.js','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png','./assets/favicon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('predix-shell-')&&k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
// Entrega inmediatamente la interfaz local; actualiza su copia sin bloquear el arranque.
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.pathname.includes('/feeds/'))return;
  const network=fetch(request).then(response=>{
    if(response.ok){
      const copy=response.clone();
      return caches.open(CACHE).then(cache=>cache.put(request,copy)).then(()=>response);
    }
    return response;
  });
  event.waitUntil(network.catch(()=>{}));
  event.respondWith(caches.match(request).then(cached=>cached||network).catch(async()=>{
    if(request.mode==='navigate'){
      const fallback=await caches.match('./index.html');
      if(fallback)return fallback;
    }
    return Response.error();
  }));
});
