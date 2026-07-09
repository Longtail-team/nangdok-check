/* 전래동화 출석체크 - 서비스워커
   목적: '홈 화면에 추가' 가능하게 + 아이콘/매니페스트 캐시.
   주의: index.html(진입 페이지)은 '네트워크 우선'으로 항상 최신을 받음
        → EXEC 주소/리다이렉트 로직을 바꿔도 폰에 바로 반영됨. */
var CACHE = "nangdok-shell-v2";   // ← 버전 올리면 옛 캐시 자동 삭제
var ASSETS = [
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).catch(function(){}));
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
  if(url.origin !== self.location.origin) return;  // 구글 출석앱 등은 그냥 통과

  // 진입 페이지(HTML)는 네트워크 우선 → 항상 최신 리다이렉트 로직
  if(req.mode === "navigate" || (req.headers.get("accept")||"").indexOf("text/html") !== -1){
    e.respondWith(fetch(req).catch(function(){ return caches.match("./index.html"); }));
    return;
  }
  // 아이콘/매니페스트 등 정적자원은 캐시 우선
  e.respondWith(
    caches.match(req).then(function(hit){
      return hit || fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); }).catch(function(){});
        return res;
      });
    })
  );
});
