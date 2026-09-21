/* 한마음 데스크 — 서비스 워커 (2026-09-18 · 1단계: 껍데기만 캐시 · 2단계: 웹 푸시)
   껍데기(desk.html · 글씨체 · 아이콘)는 캐시해서 전파가 약해도 열리게 하고, 자료(뒷단·desk-org.json)는 늘 새로 받는다. */
var 이름 = 'desk-v19';   // desk.html 을 고쳐 올릴 때마다 숫자를 올린다 — 안 올리면 폰은 옛 화면을 계속 연다(09-18)
var 껍데기 = ['./desk.html', './desk.webmanifest', './desk-192.png', './boss-192.png', './paperlogy-4.woff2', './paperlogy-7.woff2'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(이름).then(function (c) { return c.addAll(껍데기); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== 이름; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;           // 다른 origin(앱스 스크립트)은 안 건드린다
  if (u.pathname.endsWith('desk-org.json')) return;                                   // 설정은 늘 새로
  // 뒷단이 같은 origin 일 때(GN — 워커가 앱도 뒷단도 낸다) ?p=desk 같은 자료 요청이 캐시에 앉아 옛 대화가 보였다(2026-09-21 유니스 「보낸 게 없어져」).
  // 캐시는 껍데기(글씨체·아이콘·매니페스트)만 — 물음표가 붙은 요청과 그 밖의 경로는 늘 네트워크
  if (u.search || !/\.(png|woff2|webmanifest|svg|ico)$/.test(u.pathname)) {
    if (!(u.pathname.endsWith('desk.html') || e.request.mode === 'navigate')) return;
  }
  if (u.pathname.endsWith('desk.html') || e.request.mode === 'navigate') {              // 화면은 네트워크 먼저 — 고쳐 올린 것이 바로 보이게. 전파가 없으면 캐시
    e.respondWith(fetch(e.request).then(function (res) { var 사본 = res.clone(); caches.open(이름).then(function (c) { c.put(e.request, 사본); }); return res; }).catch(function () { return caches.match(e.request); }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request).then(function (res) { var 사본 = res.clone(); caches.open(이름).then(function (c) { c.put(e.request, 사본); }); return res; }); }));
});
/* 2단계 — 웹 푸시. 구독은 desk.html 이 뒷단에 보내고, 노트북(데스크.py)이 VAPID 로 보낸다. */
// 뒷단에 한 줄 남기기 — 푸시 짐에 든 열쇠(k)·뒷단 주소로. 진단용이라 실패해도 조용히 넘어간다
function 기록(d, 무엇, 상세) {
  if (!d || !d.뒷단 || !d.k) return Promise.resolve();
  return fetch(d.뒷단, { method: 'POST', body: JSON.stringify({ k: d.k, 종류: '기록', 무엇: 무엇, 상세: 상세 || '' }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }).catch(function () {});
}
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { 제목: '한마음 데스크', 글: e.data ? e.data.text() : '' }; }
  var 자료 = { 탭: d.탭 || '홈', k: d.k || '', 뒷단: d.뒷단 || '' };
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.제목 || '한마음 데스크', { body: d.글 || '새로 온 것이 있어요.', icon: './desk-192.png', badge: './desk-192.png', tag: 'desk', renotify: true, data: 자료 }),
    기록(자료, '푸시받음', (d.제목 || '') + ' · sw ' + 이름)
  ]));
});
self.addEventListener('notificationclick', function (e) {
  var d = (e.notification && e.notification.data) || {};
  e.notification.close();
  // 09-18 유니스 「알림 눌렀는데 데스크 화면이 안 나왔어」 두 번 — 어디서 막히는지 단계마다 뒷단에 남긴다.
  // 데스크 창이 있으면 앞으로(앞으로 와서 보이는지까지 확인), 없거나 안 보이면 새로 연다.
  var 주소 = new URL('./desk.html?열림=알림&탭=' + encodeURIComponent(d.탭 || '홈'), self.registration.scope).href;   // 앱이 「알림으로 열렸다」를 기록에 남기게 — 손으로 연 것과 구별(09-18 15:0x)
  var 열기 = function (왜) { return self.clients.openWindow(주소).then(function (w) { return 기록(d, '알림눌림', '새로 엶(' + 왜 + ') → ' + (w ? 'ok' : 'null')); }, function (err) { return 기록(d, '알림눌림', '새로 열기 실패(' + 왜 + '): ' + String(err && err.message || err).slice(0, 80)); }); };
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    var 데스크 = cs.filter(function (c) { return (c.url || '').indexOf('desk.html') >= 0; });
    var 보이는 = 데스크.filter(function (c) { return c.visibilityState === 'visible'; });
    // 09-18 14:35 실측 — focus() 뒤 0.4초 기다렸다가 openWindow 를 부르니 「Not allowed to open a window」. 누른 순간의 허용은 짧다.
    // 그래서 보이는 창이 있을 때만 앞으로 가져오고, 아니면(창이 뒤에 숨어 있어도) 기다리지 않고 바로 새로 연다.
    if (보이는.length && 'focus' in 보이는[0]) return 보이는[0].focus().then(function () { return 기록(d, '알림눌림', '보이는 창 앞으로'); }, function (err) { return 열기('앞으로 실패: ' + String(err && err.message || err).slice(0, 60)); });
    return 열기(데스크.length ? '창은 있으나 숨어 있음 ' + 데스크.length : '창 없음 · 같은 사이트 창 ' + cs.length);
  }).catch(function (err) { return 열기('matchAll 실패: ' + String(err && err.message || err).slice(0, 60)); }));
});
