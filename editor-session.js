/* A map editing session has an opening snapshot and an explicit save checkpoint. */
(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  function create() {
    let id = null, initial = null, saved = null;
    return {
      begin(level, snapshot) { id = level; initial = copy(snapshot); saved = copy(snapshot); },
      get level() { return id; },
      dirty(snapshot) { return id != null && JSON.stringify(snapshot) !== JSON.stringify(saved); },
      save(snapshot) { saved = copy(snapshot); },
      reset() { return copy(initial); },
      discard() { return copy(saved); },
      end() { id = null; initial = saved = null; }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { create };
  else root.CWMapSession = { create };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof window !== 'undefined') window.CWEditorSessionUI = function (api) {
  'use strict';
  const $ = selector => document.querySelector(selector), session = CWMapSession.create();
  const dialog = $('#editorLeaveDialog');
  let pending = null;
  function refresh() {
    if (session.level == null) return;
    const dirty = session.dirty(api.snapshot());
    $('#edSaveState').textContent = dirty ? 'Có thay đổi chưa lưu' : 'Map đã lưu · có thể đóng';
    $('#edSaveState').classList.toggle('dirty', dirty);
    $('#edReset').disabled = JSON.stringify(api.snapshot()) === JSON.stringify(session.reset());
  }
  function opened() {
    if (session.level !== api.level()) session.begin(api.level(), api.snapshot());
    refresh();
  }
  function settle(save) {
    const action = pending;
    if (!action) return;
    if (save) api.save();
    else api.restore(session.discard(), false);
    pending = null; dialog.close(); action();
  }
  function guard(action) {
    if (session.level == null || !session.dirty(api.snapshot())) return false;
    if (!pending) {
      api.stop(); pending = action;
      $('#editorLeaveText').textContent = 'Level ' + session.level + ' có thay đổi chưa lưu. Bạn có muốn lưu lại hay không?';
      dialog.showModal(); $('#editorLeaveKeep').focus();
    }
    return true;
  }
  $('#editorLeaveSave').onclick = () => settle(true);
  $('#editorLeaveDiscard').onclick = () => settle(false);
  $('#editorLeaveKeep').onclick = () => { pending = null; dialog.close(); };
  dialog.addEventListener('cancel', () => { pending = null; });
  $('#edReset').onclick = () => {
    api.stop(); api.restore(session.reset(), true); refresh();
    api.status('Đã Reset về trạng thái lúc mở level. Bấm Lưu map nếu muốn lưu bản này.');
  };
  function showPanel(name) {
    $('#edDlg').dataset.panel = name;
    for (const item of document.querySelectorAll('[data-editor-panel]')) item.setAttribute('aria-pressed', String(item.dataset.editorPanel === name));
    api.resize();
  }
  for (const button of document.querySelectorAll('[data-editor-panel]')) button.onclick = () => showPanel(button.dataset.editorPanel);
  for (const selector of ['#tools', '#issues']) $(selector).addEventListener('click', event => {
    if (event.target.closest('button,li[data-k]') && matchMedia('(max-width:1100px)').matches) showPanel('board');
  });
  window.addEventListener('beforeunload', event => {
    if (session.level != null && session.dirty(api.snapshot())) { event.preventDefault(); event.returnValue = ''; }
  });
  return {
    opened, refresh, guard, showPanel,
    saved() { session.save(api.snapshot()); refresh(); },
    end() { session.end(); pending = null; },
    dirty: () => session.level != null && session.dirty(api.snapshot())
  };
};
