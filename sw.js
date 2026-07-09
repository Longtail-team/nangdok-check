/* 전래동화 출석체크 - 최소 서비스워커
   목적: '홈 화면에 추가' 가능한 앱으로 인식되게 하고,
        래퍼 껍데기(아이콘/매니페스트)를 캐시해 빠르게 뜨게 함.
   주의: 출석 앱 본체(google.com)는 캐시하지 않음 → 항상 최신 데이터. */
var CACHE = "nangdok-shell-v1";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).catch(function(){}));
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ if(k!==CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  var url = new URL(req.url);
  // 같은 사이트(래퍼)만 캐시 처리. 그 외(구글 출석앱 등)는 그냥 통과.
  if(url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(function(hit){
      return hit || fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
        return res;
      }).catch(function(){ return caches.match("./index.html"); });
    })
  );
});
