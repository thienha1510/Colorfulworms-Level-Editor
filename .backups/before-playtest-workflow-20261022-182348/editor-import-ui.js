/* Colorful Worms: import preview, recovery and workspace navigation. */
window.CWEditorImportUI = function (api) {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const backupKey = 'cwEditor.project.beforeImport.v1';
  const dialog = $('#importDialog');
  let plan = null, pendingManifest = null, backup = null, busy = false;
  function message(text, error = false) {
    $('#importStatus').textContent = text;
    $('#importStatus').classList.toggle('err', error);
  }
  function setBusy(value) {
    busy = value;
    $('#importPanel').setAttribute('aria-busy', String(value));
    for (const selector of ['#fileDir', '#fileMaps', '#fileProj', '#importConfirm', '#importCancel', '#importRelated', '#undoImport']) $(selector).disabled = value;
  }
  function refresh() {
    const project = api.getProject();
    if (!project) return;
    const count = project.levels.filter(level => level.m).length;
    $('#workspaceCount').textContent = count + ' / ' + project.levels.length + ' level có map';
    $('#emptyGuide').hidden = count > 0;
    $('#levelJump').min = project.cfg.start;
    $('#levelJump').max = project.cfg.start + project.cfg.count - 1;
    $('#undoImport').hidden = !backup;
  }
  function addListLine(text) {
    const line = document.createElement('li');
    line.textContent = text;
    $('#importWarnings').append(line);
  }
  function preview(next) {
    plan = next;
    $('#importWarnings').replaceChildren();
    $('#importRelated').hidden = next.kind !== 'manifest';
    $('#importConfirm').hidden = next.kind === 'manifest';
    $('#importConfirm').disabled = false;
    $('#importWarningTitle').hidden = !(next.warnings.length || next.missing?.length);
    $('#importSource').textContent = next.label;
    if (next.kind === 'manifest') {
      pendingManifest = next.manifest;
      $('#importTitle').textContent = 'Đã nhận danh sách ' + next.manifest.entries.length + ' màn';
      $('#importDescription').textContent = 'File này chỉ chứa tên map. Chọn thư mục chứa các file .txt tương ứng để xem và chỉnh sửa. Project hiện tại được giữ nguyên.';
      $('#importSummary').textContent = 'Bước tiếp theo: chọn thư mục game-level';
    } else if (next.kind === 'project') {
      $('#importTitle').textContent = 'Mở project đã lưu';
      const count = next.project.levels.filter(level => level.map != null).length;
      $('#importSummary').textContent = next.project.levels.length + ' level · ' + count + ' map';
      $('#importDescription').textContent = 'Project này sẽ thay project đang mở. Bạn có thể khôi phục bằng nút Hoàn tác lần nạp.';
      $('#importConfirm').textContent = 'Mở project';
    } else {
      const project = api.getProject(), ids = new Set(next.levels.map(level => level.levelid));
      const replace = project.levels.filter(level => ids.has(level.levelid) && level.m).length;
      const first = next.levels[0].levelid, last = next.levels.at(-1).levelid;
      $('#importTitle').textContent = 'Sẵn sàng nạp ' + next.levels.length + ' map';
      $('#importSummary').textContent = 'Level ' + first + '–' + last + (next.missing.length ? ' · thiếu ' + next.missing.length + ' map' : ' · đủ dữ liệu');
      $('#importDescription').textContent = 'Tự điều chỉnh số level. Giữ mục tiêu độ khó và các level ngoài phạm vi nạp.' + (replace ? ' Sẽ thay ' + replace + ' map cùng số level; có thể hoàn tác sau khi nạp.' : '');
      $('#importConfirm').textContent = 'Nạp ' + next.levels.length + ' map';
    }
    const warnings = [...(next.missing || []), ...next.warnings];
    warnings.slice(0, 25).forEach(addListLine);
    if (warnings.length > 25) addListLine('Và ' + (warnings.length - 25) + ' thông báo khác.');
    if (!dialog.open) dialog.showModal();
  }
  async function selectFiles(event, directory) {
    const files = [...event.target.files];
    event.target.value = '';
    if (!files.length) return;
    if (busy || api.isBusy()) { message('Hãy dừng Sync trước khi nạp dữ liệu.', true); return; }
    setBusy(true);
    message('Đang đọc ' + files.length + ' file…');
    try {
      const project = api.getProject();
      const next = await CWImportData.prepare(files, {
        directory,
        manifest: directory ? pendingManifest : null,
        startLevel: api.selectedLevel(),
        bundle: project.cfg.bundle || 'game-level'
      });
      // Validate conversion before presenting any action that could change the project.
      if (next.kind === 'maps') next.levels.forEach(level => { level.converted = api.fromMap(level.map, level.name + '.txt'); });
      if (next.kind === 'project') api.fromSaved(next.project);
      setBusy(false);
      preview(next);
      message('Đã đọc dữ liệu. Kiểm tra thông tin rồi xác nhận nạp.');
    } catch (error) { message('Chưa nạp dữ liệu: ' + error.message, true); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!plan || busy || plan.kind === 'manifest') return;
    if (api.isBusy()) { message('Hãy dừng Sync trước khi nạp dữ liệu.', true); return; }
    const current = api.getProject();
    let next;
    setBusy(true);
    try {
      if (plan.kind === 'project') next = api.fromSaved(plan.project);
      else {
        const allIds = [...current.levels.map(level => level.levelid), ...plan.levels.map(level => level.levelid)];
        const start = Math.min(...allIds), count = Math.max(...allIds) - start + 1;
        if (count > 500) throw new Error('Gộp dữ liệu sẽ vượt quá 500 level. Hãy mở một project riêng trước khi nạp.');
        next = api.createProject({ ...current.cfg, start, count }, current.curve);
        const old = new Map(current.levels.map(level => [level.levelid, level]));
        next.levels.forEach(level => { if (old.has(level.levelid)) Object.assign(level, old.get(level.levelid)); });
        const targets = new Map(next.levels.map(level => [level.levelid, level]));
        for (let index = 0; index < plan.levels.length; index++) {
          const imported = plan.levels[index], level = targets.get(imported.levelid);
          // Never modify shared level objects until the entire import succeeds.
          const replacement = { ...level, m: imported.converted, name: imported.name, wenname: imported.wenname, source: 'file', edited: false };
          api.updateLevel(replacement, api.scoreMap(replacement.m));
          targets.set(imported.levelid, replacement);
          if (index % 8 === 0) {
            $('#importProgress').textContent = 'Đang nạp ' + (index + 1) + ' / ' + plan.levels.length + ' map…';
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        next.levels = next.levels.map(level => targets.get(level.levelid));
      }
      backup = api.toSaved();
      try { localStorage.setItem(backupKey, JSON.stringify(backup)); }
      catch { /* The in-memory undo remains available if browser storage is full. */ }
      const count = next.levels.filter(level => level.m).length;
      api.setProject(next);
      pendingManifest = null;
      dialog.close();
      $('#importProgress').textContent = '';
      message('Đã nạp thành công. Project có ' + count + ' map. Bấm một level để chỉnh sửa; dùng Lưu project để giữ bản sao.');
      api.status('Đã nạp ' + count + ' map.');
      refresh();
    } catch (error) {
      $('#importProgress').textContent = 'Chưa nạp: ' + error.message;
      message('Chưa thay đổi project: ' + error.message, true);
    }
    finally { setBusy(false); }
  }
  $('#fileDir').onchange = event => selectFiles(event, true);
  $('#fileMaps').onchange = $('#fileProj').onchange = event => { pendingManifest = null; selectFiles(event, false); };
  $('#importConfirm').onclick = commit;
  $('#importCancel').onclick = () => { pendingManifest = null; plan = null; dialog.close(); message('Đã hủy nạp. Project hiện tại được giữ nguyên.'); };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); else { pendingManifest = null; plan = null; } });
  $('#importRelated').onclick = () => { dialog.close(); $('#fileDir').click(); };
  $('#undoImport').onclick = () => {
    if (!backup || busy || api.isBusy()) return;
    try {
      const restored = api.fromSaved(backup);
      api.setProject(restored);
      backup = null;
      try { localStorage.removeItem(backupKey); } catch {}
      refresh();
      message('Đã khôi phục project trước lần nạp gần nhất.');
    } catch (error) { message('Không khôi phục được: ' + error.message, true); }
  };
  function jump() {
    const id = Number($('#levelJump').value), project = api.getProject();
    if (!project.levels.some(level => level.levelid === id)) { message('Không có level ' + id + ' trong project.', true); return; }
    api.openLevel(id);
  }
  $('#jumpLevel').onclick = jump;
  $('#levelJump').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); jump(); }
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); $('#projSave').click(); }
  });
  $('#storageOrigin').textContent = 'Tự lưu tại ' + location.host + '. Dùng Lưu project để chuyển trình duyệt hoặc địa chỉ.';
  try {
    const saved = localStorage.getItem(backupKey);
    if (saved) { backup = JSON.parse(saved); CWImportData.validateProject(backup); }
  } catch { backup = null; }
  refresh();
  return { refresh };
};
