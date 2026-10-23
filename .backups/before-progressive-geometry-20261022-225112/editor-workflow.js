/* Explicit map save, exit analysis and constrained design tools. */
window.CWEditorWorkflow = function (api) {
  'use strict';
  const $ = selector => document.querySelector(selector);
  let busy = false, signal = null, currentId = null;
  function setBusy(value) {
    busy = value; api.setBusy(value);
    for (const selector of ['#exitOptimize', '#exitGenerate', '#exitMode', '#exitAllowIce', '#edSave']) $(selector).disabled = value;
    $('#exitStop').hidden = !value;
    $('#board').style.pointerEvents = value ? 'none' : '';
    $('#tools').inert = value;
    $('#autoCard').inert = value;
  }
  function refresh() {
    if (!api.getMap() || !$('#edDlg').open) return;
    try {
      const map = api.getMap(), mode = $('#exitMode').value;
      const result = CWExitDesign.analyze(api.engine, map, mode);
      $('#exitCount').textContent = result.free.length + ' / ' + map.worms.length + ' giun ra được ngay';
      $('#exitFlow').textContent = result.flow.slice(0, 12).join(' → ') + (result.flow.length > 12 ? ' → …' : '') || 'Chưa có đường giải';
      $('#exitFullFlow').textContent = 'Nhịp thực tế: ' + (result.flow.join(' → ') || 'Chưa có đường giải');
      $('#exitTarget').hidden = mode !== 'progressive';
      $('#exitTarget').textContent = 'Nhịp cần đạt: ' + result.expected.join(' → ');
      $('#exitConstraint').textContent = mode === 'any' ? 'Giữ cách chơi hiện tại. Dãy trên là số giun có thể ra trước mỗi lượt trong đường giải kiểm tra.' : result.matches ?
        'Đạt nhịp mở dần đến hết màn, với mọi lựa chọn giun. Khi gần hết màn, số lựa chọn giảm theo số giun còn lại.' :
        result.firstMismatch >= 0 ? 'Chưa đạt: lượt ' + (result.firstMismatch + 1) + ' cần ' + result.expected[result.firstMismatch] + ' giun ra được, hiện có ' + (result.flow[result.firstMismatch] || 0) + '.' :
        'Đường giải kiểm tra đúng nhịp, nhưng bố cục chưa bảo đảm cho mọi lựa chọn. Dùng Tự tạo để tạo bố cục phù hợp.';
      $('#exitConstraint').classList.toggle('err', !result.safe || mode !== 'any' && !result.matches);
      $('#exitFreeList').replaceChildren();
      result.free.slice(0, 16).forEach(index => {
        const button = document.createElement('button');
        button.className = 'mini'; button.type = 'button'; button.textContent = 'Giun ' + (index + 1);
        button.onclick = () => api.selectWorm(index);
        $('#exitFreeList').append(button);
      });
    } catch (error) { $('#exitConstraint').textContent = error.message; }
  }
  function opened() {
    const design = api.getDesign() || {};
    $('#exitMode').value = design.exitMode === 'progressive' ? 'progressive' : 'any';
    $('#exitAllowIce').checked = design.allowIce !== false;
    const id = api.getLevel();
    if (id !== currentId) {
      currentId = id;
      const design = api.getDesign() || {};
      $('#exitMode').value = design.exitMode === 'progressive' ? 'progressive' : 'any';
      $('#exitAllowIce').checked = design.allowIce !== false;
      $('#exitWorkStatus').textContent = '';

    }
    refresh();
    const idToPrepare = id;
    setTimeout(() => window.__cwGame?.prepare(idToPrepare), 250);
  }
  async function design(generate) {
    if (busy || api.isBusy() || !api.getMap()) return;
    const id = api.getLevel(), mode = $('#exitMode').value, allowIce = $('#exitAllowIce').checked;
    signal = { stop: false }; setBusy(true);
    try {
      let best = null;
      const attempts = generate ? 4 : 1;
      for (let attempt = 0; attempt < attempts && !signal.stop; attempt++) {
        if (generate && mode === 'progressive' && !allowIce) throw new Error('Tự tạo nhịp mở dần cần thiết lập băng. Bật tùy chọn băng trước khi tạo.');
        const map = generate ? api.createMap(attempt, mode) : api.getMap();
        const result = await CWExitDesign.optimize(api.engine, map, {
          mode, allowIce, iterations: 6000, seed: 'level-' + id + '-' + attempt + '-' + Date.now(), signal,
          onProgress: state => { $('#exitWorkStatus').textContent = (generate ? 'Tạo mẫu ' + (attempt + 1) + '/4 · ' : '') + state.iteration + '/' + state.total + ' · ' + state.score + ' điểm · ' + state.exits + ' giun ra ban đầu'; }
        });
        if (result.analysis.matches && (!best || result.quality.score > best.quality.score)) best = result;
        if (best || !generate) break;
      }
      if (signal.stop || api.getLevel() !== id) { $('#exitWorkStatus').textContent = 'Đã dừng. Map hiện tại được giữ nguyên.'; return; }
      if (!best) throw new Error('Chưa tìm được map đạt ràng buộc. Thử Tự tạo hoặc cho phép thêm băng.');
      api.replaceMap(best.map);
      api.setDesign({ exitMode: mode, allowIce });
      $('#exitWorkStatus').textContent = 'Đã áp dụng · ' + best.quality.score + ' điểm · ' + best.analysis.free.length + ' giun ra ban đầu. Có thể Hoàn tác; bấm Lưu map để xác nhận bản xuất.';
      refresh();
    } catch (error) { $('#exitWorkStatus').textContent = error.message; }
    finally { setBusy(false); }
  }
  $('#exitOptimize').onclick = () => design(false);
  $('#exitGenerate').onclick = () => design(true);
  $('#exitStop').onclick = () => { if (signal) signal.stop = true; };
  $('#exitMode').onchange = $('#exitAllowIce').onchange = () => { api.setDesign({ exitMode: $('#exitMode').value, allowIce: $('#exitAllowIce').checked }); refresh(); };
  $('#edDlg').addEventListener('close', () => { if (signal) signal.stop = true; currentId = null; });
  $('#edSave').onclick = () => api.saveMap(false);
  $('#table').addEventListener('click', event => {
    const button = event.target.closest('[data-edit-level]');
    if (button) api.openLevel(Number(button.dataset.editLevel));
  });
  return { opened, refresh, isBusy: () => busy, stop: () => { if(signal)signal.stop=true; } };
};
