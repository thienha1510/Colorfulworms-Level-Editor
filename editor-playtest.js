/* A persistent, same-origin Cocos instance for rapid map playtests. */
window.CWPlaytestClient = function (api) {
  'use strict';
  const panel = document.querySelector('#gameTestPanel');
  const frame = document.querySelector('#gameTestFrame');
  const status = document.querySelector('#gameTestStatus');
  const navStatus = document.querySelector('#gameWarmStatus');
  const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  let loaded = false, ready = false, visible = false, level = 1, requestId = 0, timeout = null, returnFocus = null;
  let startup = true, editorLevel = null, preparedRaw = null, dirtyRun = false, latestSession = null, bootRequestId = 0;
  let advanceTimer = null, completedRequest = null, bootDeadline = 0, timedOutRequest = null;
  panel.inert = true;
  const bootMap = JSON.stringify({XSize:6,YSize:8,Arrows:[{Indices:[0,1,2]},{Indices:[12,13,14]}],chuanSong:[],blackHole:[],yaoShi:[]});
  function cancelAdvance() { clearTimeout(advanceTimer); advanceTimer = null; }
  function send(type, extra = {}) {
    frame.contentWindow?.postMessage({ type, token, ...extra }, location.origin);
  }
  function setStatus(text) { status.textContent = text; navStatus.textContent = text; }
  function sessionFor(id, bootstrap = false) {
    const raw = bootstrap ? bootMap : api.mapForLevel(id);
    if (!raw) throw new Error('Level ' + id + ' chưa có map. Hãy nạp hoặc thiết kế map trước khi chơi.');
    return { token, start: id, maps: { [id]: raw }, engineOnly: bootstrap, energy: true, requestId: ++requestId, at: Date.now() };
  }
  function showPanel() {
    if (!visible) { returnFocus = document.activeElement; editorLevel = api.suspendEditor(); }
    visible = true; dirtyRun = true; panel.inert = false;
    panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('testing-game');
    document.querySelector('#gameTestClose').focus();
    send('cw-playtest-audio', { active: true });
  }
  function begin(id, show, bootstrap = false) {
    cancelAdvance(); completedRequest = null; timedOutRequest = null; panel.dataset.completed = 'false';
    const session = sessionFor(id, bootstrap);
    latestSession = session; preparedRaw = session.maps[id]; dirtyRun = false;
    level = id; ready = false; panel.dataset.ready = 'false';
    panel.dataset.failed = 'false'; frame.removeAttribute('aria-disabled');
    document.querySelector('#gameTestTitle').textContent = 'Chơi thử · Level ' + id;
    document.querySelector('#gameTestFrame').title = 'Game thật — level ' + id;
    if (show) {
      showPanel();
    }
    setStatus(loaded ? 'Đang cập nhật bàn chơi…' : 'Đang nạp sẵn engine trong nền…');
    if(!loaded)bootDeadline=Date.now()+45000;
    document.querySelector('#gameTestLoading').hidden = false;
    document.querySelector('#gameTestReload').hidden = true;
    document.querySelector('#gameTestLoading strong').textContent='Chuẩn bị bản chơi thử';
    document.querySelector('#gameTestLoading p').textContent='Đang cập nhật bàn chơi vào engine đã nạp sẵn…';
    clearTimeout(timeout);
    const budget=startup?Math.max(1,bootDeadline-Date.now()):30000;
    const ticket=session.requestId;
    timeout = setTimeout(() => {
      if (!ready&&requestId===ticket) {
        timedOutRequest=ticket; send('cw-playtest-abort');
        setStatus('Không chuẩn bị được game trong '+(startup?'45':'30')+' giây. Bấm Tải lại game để thử lại.');
        document.querySelector('#gameTestReload').hidden = false;
        document.querySelector('#gameTestLoading strong').textContent='Chưa chuẩn bị được game';
        document.querySelector('#gameTestLoading p').textContent='Đã dừng chờ. Bấm Tải lại game trên thanh công cụ để thử lại.';
      }
    }, budget);
    try {
      const raw=JSON.stringify(session);localStorage.setItem('cw_playtest_session:'+token,raw);
      try{localStorage.setItem('cw_playtest_session',raw);}catch{}
    }
    catch (error) { throw new Error('Không lưu được phiên test: ' + error.message); }
    if (!loaded) {
      loaded = true;
      startup = true;
      bootRequestId = session.requestId;
      frame.src = 'game/index.html?playtest=1&prewarm=' + (show ? '0' : '1') + '&startLevel=' + id + '&token=' + encodeURIComponent(token);
    } else send('cw-playtest-play', { session, standby: !show });
    return session;
  }
  function close() {
    cancelAdvance();
    visible = false; panel.inert = true;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('testing-game');
    send('cw-playtest-audio', { active: false });
    send('cw-playtest-pause');
    if (editorLevel != null) { api.restoreEditor(editorLevel); editorLevel = null; }
    returnFocus?.focus?.();
    setTimeout(() => prepare(level), 150);
  }
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.token !== token) return;
    const data = event.data;
    if (data.type === 'cw-playtest-close') { close(); return; }
    if (data.requestId !== requestId || data.requestId === timedOutRequest) return;
    if (data.type === 'cw-playtest-won') {
      if (!visible || !ready || panel.dataset.failed === 'true' || data.level !== level || completedRequest === requestId) return;
      completedRequest = requestId; panel.dataset.completed = 'true'; dirtyRun = true;
      const next = api.nextMapLevel(level);
      if (next == null) { setStatus('Đã hoàn thành map cuối trong project · có thể Chơi lại map.'); return; }
      setStatus('Đã hoàn thành Level ' + level + ' · chuyển sang Level ' + next + ' sau 1 giây…');
      const finishedRequest = requestId;
      advanceTimer = setTimeout(() => {
        advanceTimer = null;
        if (visible && requestId === finishedRequest && completedRequest === finishedRequest) {
          const nextLevel = api.nextMapLevel(level);
          if (nextLevel != null) play(nextLevel);
          else setStatus('Đã hoàn thành map cuối trong project · có thể Chơi lại map.');
        }
      }, 1000);
    } else if (data.type === 'cw-playtest-lost') {
      if (completedRequest === requestId) return;
      panel.dataset.failed = 'true'; frame.setAttribute('aria-disabled', 'true'); dirtyRun = true;
      setStatus('Đã thua · bấm Chơi lại map để bắt đầu lại.');
    } else if (data.type === 'cw-playtest-ready') {
      clearTimeout(timeout); ready = true;
      const elapsed = Math.round(data.elapsedMs);
      setStatus(latestSession?.engineOnly?'Engine đã nạp sẵn · sẵn sàng nhận map':'Level ' + data.level + ' sẵn sàng · ' + elapsed + ' ms' + (startup ? ' · phiên đầu' : ' · dùng lại engine'));
      startup = false;
      dirtyRun = visible;
      document.querySelector('#gameTestLoading').hidden = true;
      document.querySelector('#gameTestReload').hidden = true;
      panel.dataset.ready = 'true';
      panel.dataset.level = String(data.level);
      panel.dataset.elapsedMs = String(elapsed);
      if (!visible) send('cw-playtest-pause');
    } else if (data.type === 'cw-playtest-error') {
      clearTimeout(timeout);
      setStatus('Không mở được map: ' + data.error);
      document.querySelector('#gameTestReload').hidden = false;
    }
  });
  document.querySelector('#gameTestClose').onclick = close;
  document.querySelector('#gameTestRestart').onclick = () => play(level);
  document.querySelector('#gameTestPrev').onclick = () => play(level - 1);
  document.querySelector('#gameTestNext').onclick = () => play(level + 1);
  document.querySelector('#gameTestReload').onclick = () => { loaded = false; startup = true; play(level); };
  frame.addEventListener('load', () => {
    send('cw-playtest-audio', { active: visible });
    if (latestSession && latestSession.requestId !== bootRequestId) send('cw-playtest-play', { session: latestSession, standby: !visible });
  });
  addEventListener('pagehide',()=>{try{localStorage.removeItem?.('cw_playtest_session:'+token);}catch{}});
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && visible) { event.preventDefault(); close(); } });
  function play(id) {
    cancelAdvance();
    try {
      api.beforePlay();
      if (loaded && ready && !dirtyRun && id === level && preparedRaw === api.mapForLevel(id)) {
        showPanel();
        send('cw-playtest-resume');
        setStatus('Level ' + id + ' sẵn sàng · map đã chuẩn bị');
        document.querySelector('#gameTestLoading').hidden = true;
        return;
      }
      panel.dataset.ready = 'false'; begin(id, true);
    }
    catch (error) { api.status(error.message, true); setStatus(error.message); }
  }
  function warm() {
    if (loaded) return;
    const id = api.firstMapLevel();
    try { begin(id||1, false, !id); } catch { /* Explicit Play will display any storage error. */ }
  }
  function prepare(id) {
    if (visible || !id) return;
    const raw = api.mapForLevel(id);
    if (!raw || loaded && id === level && raw === preparedRaw && !dirtyRun) return;
    try { begin(id, false); } catch { /* Explicit Play will display any storage error. */ }
  }
  document.querySelector('#playFrom').addEventListener('change', event => prepare(Number(event.target.value)));
  // Start immediately even when the project has no maps. The tiny boot map
  // never enters project data; it creates only the reusable native controller.
  warm();
  return { play, warm, prepare, close };
};
