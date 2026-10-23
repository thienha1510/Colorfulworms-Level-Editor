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
  function send(type, extra = {}) {
    frame.contentWindow?.postMessage({ type, token, ...extra }, location.origin);
  }
  function setStatus(text) { status.textContent = text; navStatus.textContent = text; }
  function sessionFor(id) {
    const raw = api.mapForLevel(id);
    if (!raw) throw new Error('Level ' + id + ' chưa có map. Hãy nạp hoặc thiết kế map trước khi chơi.');
    return { token, start: id, maps: { [id]: raw }, energy: true, requestId: ++requestId, at: Date.now() };
  }
  function showPanel() {
    if (!visible) { returnFocus = document.activeElement; editorLevel = api.suspendEditor(); }
    visible = true; dirtyRun = true;
    panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('testing-game');
    document.querySelector('#gameTestClose').focus();
  }
  function begin(id, show) {
    const session = sessionFor(id);
    latestSession = session; preparedRaw = session.maps[id]; dirtyRun = false;
    level = id; ready = false; panel.dataset.ready = 'false';
    document.querySelector('#gameTestTitle').textContent = 'Chơi thử · Level ' + id;
    document.querySelector('#gameTestFrame').title = 'Game thật — level ' + id;
    if (show) {
      showPanel();
    }
    setStatus(loaded ? 'Đang đưa map vào phiên game…' : 'Chuẩn bị engine lần đầu…');
    document.querySelector('#gameTestLoading').hidden = false;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (!ready) { setStatus('Game chưa sẵn sàng. Bấm Tải lại game để thử lại.'); document.querySelector('#gameTestReload').hidden = false; }
    }, 45000);
    try { localStorage.setItem('cw_playtest_session', JSON.stringify(session)); }
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
    visible = false;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('testing-game');
    send('cw-playtest-pause');
    if (editorLevel != null) { api.restoreEditor(editorLevel); editorLevel = null; }
    returnFocus?.focus?.();
    setTimeout(() => prepare(level), 150);
  }
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.token !== token) return;
    const data = event.data;
    if (data.type === 'cw-playtest-close') { close(); return; }
    if (data.requestId !== requestId) return;
    if (data.type === 'cw-playtest-ready') {
      clearTimeout(timeout); ready = true;
      const elapsed = Math.round(data.elapsedMs);
      setStatus('Level ' + data.level + ' sẵn sàng · ' + elapsed + ' ms' + (startup ? ' · phiên đầu' : ' · dùng lại engine'));
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
  document.querySelector('#gameTestReload').onclick = () => { loaded = false; play(level); };
  frame.addEventListener('load', () => {
    if (latestSession && latestSession.requestId !== bootRequestId) send('cw-playtest-play', { session: latestSession, standby: !visible });
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && visible) { event.preventDefault(); close(); } });
  function play(id) {
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
    if (id) try { begin(id, false); } catch { /* Explicit Play will display any storage error. */ }
  }
  function prepare(id) {
    if (visible || !id) return;
    const raw = api.mapForLevel(id);
    if (!raw || loaded && id === level && raw === preparedRaw && !dirtyRun) return;
    try { begin(id, false); } catch { /* Explicit Play will display any storage error. */ }
  }
  document.querySelector('#playFrom').addEventListener('change', event => prepare(Number(event.target.value)));
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2000 });
  else setTimeout(warm, 600);
  return { play, warm, prepare, close };
};
