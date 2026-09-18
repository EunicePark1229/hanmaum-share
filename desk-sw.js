/* 한마음 데스크 — 서비스 워커 (2026-09-18 · 1단계: 껍데기만 캐시 · 2단계: 웹 푸시)
   껍데기(desk.html · 글씨체 · 아이콘)는 캐시해서 전파가 약해도 열리게 하고, 자료(뒷단·desk-org.json)는 늘 새로 받는다. */
var 이름 = 'desk-v3';   // desk.html 을 고쳐 올릴 때마다 숫자를 올린다 — 안 올리면 폰은 옛 화면을 계속 연다(09-18)
var 껍데기 = ['./desk.html', './desk.webmanifest', './desk-icon.svg', './undongjang.woff2'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(이름).then(function (c) { return c.addAll(껍데기); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== 이름; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;           // 뒷단(앱스 스크립트)은 안 건드린다
  if (u.pathname.endsWith('desk-org.json')) return;                                   // 설정은 늘 새로
  if (u.pathname.endsWith('desk.html') || e.request.mode === 'navigate') {              // 화면은 네트워크 먼저 — 고쳐 올린 것이 바로 보이게. 전파가 없으면 캐시
    e.respondWith(fetch(e.request).then(function (res) { var 사본 = res.clone(); caches.open(이름).then(function (c) { c.put(e.request, 사본); }); return res; }).catch(function () { return caches.match(e.request); }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request).then(function (res) { var 사본 = res.clone(); caches.open(이름).then(function (c) { c.put(e.request, 사본); }); return res; }); }));
});
/* 2단계 — 웹 푸시. 구독은 desk.html 이 뒷단에 보내고, 노트북(데스크.py)이 VAPID 로 보낸다. */
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { 제목: '한마음 데스크', 글: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.제목 || '한마음 데스크', { body: d.글 || '새로 온 것이 있어요.', icon: './desk-icon.svg', badge: './desk-icon.svg', data: { 탭: d.탭 || '홈' } }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if ('focus' in cs[i]) return cs[i].focus(); }
    return self.clients.openWindow('./desk.html');
  }));
});
