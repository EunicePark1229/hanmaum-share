/* 한마음 데스크 — 서비스 워커 (2026-09-18 · 1단계: 껍데기만 캐시 · 2단계: 웹 푸시)
   껍데기(desk.html · 글씨체 · 아이콘)는 캐시해서 전파가 약해도 열리게 하고, 자료(뒷단·desk-org.json)는 늘 새로 받는다. */
var 이름 = 'desk-v6';   // desk.html 을 고쳐 올릴 때마다 숫자를 올린다 — 안 올리면 폰은 옛 화면을 계속 연다(09-18)
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
// 뒷단에 한 줄 남기기 — 푸시 짐에 든 열쇠(k)·뒷단 주소로. 진단용이라 실패해도 조용히 넘어간다
function 기록(d, 무엇, 상세) {
  if (!d || !d.뒷단 || !d.k) return Promise.resolve();
  return fetch(d.뒷단, { method: 'POST', body: JSON.stringify({ k: d.k, 종류: '기록', 무엇: 무엇, 상세: 상세 || '' }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } }).catch(function () {});
}
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { 제목: '한마음 데스크', 글: e.data ? e.data.text() : '' }; }
  var 자료 = { 탭: d.탭 || '홈', k: d.k || '', 뒷단: d.뒷단 || '' };
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.제목 || '한마음 데스크', { body: d.글 || '새로 온 것이 있어요.', icon: './desk-icon.svg', badge: './desk-icon.svg', tag: 'desk', renotify: true, data: 자료 }),
    기록(자료, '푸시받음', (d.제목 || '') + ' · sw ' + 이름)
  ]));
});
self.addEventListener('notificationclick', function (e) {
  var d = (e.notification && e.notification.data) || {};
  e.notification.close();
  // 09-18 유니스 「알림 눌렀는데 데스크 화면이 안 나왔어」 두 번 — 어디서 막히는지 단계마다 뒷단에 남긴다.
  // 데스크 창이 있으면 앞으로(앞으로 와서 보이는지까지 확인), 없거나 안 보이면 새로 연다.
  var 주소 = new URL('./desk.html', self.registration.scope).href;
  var 열기 = function (왜) { return self.clients.openWindow(주소).then(function (w) { return 기록(d, '알림눌림', '새로 엶(' + 왜 + ') → ' + (w ? 'ok' : 'null')); }, function (err) { return 기록(d, '알림눌림', '새로 열기 실패(' + 왜 + '): ' + String(err && err.message || err).slice(0, 80)); }); };
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    var 데스크 = cs.filter(function (c) { return (c.url || '').indexOf('desk.html') >= 0; });
    if (!데스크.length) return 열기('창 없음 · 같은 사이트 창 ' + cs.length);
    if (!('focus' in 데스크[0])) return 열기('focus 없음');
    // 09-18 14:22 실측(삼성 인터넷) — focus() 가 「됐다」고 답하는데 창은 hidden 그대로였다(브라우저 자체가 앞으로 안 옴).
    // 「됐다」를 안 믿고, 잠깐 뒤 실제로 보이는지 다시 재서 안 보이면 새로 연다
    return 데스크[0].focus().then(function () {
      return new Promise(function (ok) { setTimeout(ok, 400); }).then(function () { return self.clients.matchAll({ type: 'window', includeUncontrolled: true }); }).then(function (다시) {
        var 보임 = 다시.some(function (c) { return (c.url || '').indexOf('desk.html') >= 0 && c.visibilityState === 'visible'; });
        if (보임) return 기록(d, '알림눌림', '있던 창 앞으로 · 보임');
        return 열기('앞으로 했는데 안 보임');
      });
    }, function (err) { return 열기('앞으로 실패: ' + String(err && err.message || err).slice(0, 60)); });
  }).catch(function (err) { return 열기('matchAll 실패: ' + String(err && err.message || err).slice(0, 60)); }));
});
