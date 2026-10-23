/* Explicit map save, exit analysis and constrained design tools. */
window.CWEditorWorkflow = function (api) {
  'use strict';
  const $ = selector => document.querySelector(selector);
  let busy = false, signal = null, currentId = null;
  function setBusy(value) {
    busy = value; api.setBusy(value);
    for (const selector of ['#exitOptimize', '#exitGenerate', '#exitMode', '#edSave']) $(selector).disabled = value;
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
      $('#exitFullFlow').textContent = 'Nhịp đường giải gợi ý: ' + (result.flow.join(' → ') || 'Chưa có đường giải');
      $('#exitTarget').hidden = mode !== 'progressive';
      $('#exitTarget').textContent = 'Nhịp theo trình tự gợi ý: ' + result.expected.join(' → ');
      $('#exitConstraint').textContent = mode === 'any' ? 'Giữ cách chơi hiện tại. Dãy trên là số giun có thể ra trước mỗi lượt trong đường giải kiểm tra.' : result.matches ?
        'Đạt trình tự mở đường bằng thân giun. Theo gợi ý: 1 → 2 → 3…; mọi nước thoát hợp lệ đều giải hết. Đi khác gợi ý có thể đổi nhịp. Gần hết màn, số lựa chọn giảm theo số giun còn lại.' :
        result.firstMismatch >= 0 ? 'Chưa đạt: lượt ' + (result.firstMismatch + 1) + ' cần ' + result.expected[result.firstMismatch] + ' giun ra được, hiện có ' + (result.flow[result.firstMismatch] || 0) + '.' :
        'Chưa đạt mở đường thật: cần bố cục không có băng, khóa, bom hoặc vật thể phụ. Dùng Tự tạo.';
      $('#exitConstraint').classList.toggle('err', !result.safe || mode !== 'any' && !result.matches);
      $('#exitOrder').textContent = result.result.order.map((index,step) => (step+1)+': Giun '+(index+1)).join(' → ') || 'Chưa có đường giải';
      $('#exitShowFirst').disabled = !result.result.order.length;
      $('#exitShowFirst').onclick = () => { if (result.result.order.length) api.selectWorm(result.result.order[0]); };
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
    const id = api.getLevel();
    if (id !== currentId) {
      currentId = id;
      const design = api.getDesign() || {};
      $('#exitMode').value = design.exitMode === 'progressive' ? 'progressive' : 'any';
      $('#exitWorkStatus').textContent = '';

    }
    syncModeControls(); refresh();
    const idToPrepare = id;
    setTimeout(() => window.__cwGame?.prepare(idToPrepare), 250);
  }
  async function design(generate) {
    if (busy || api.isBusy() || !api.getMap()) return;
    const id = api.getLevel(), mode = $('#exitMode').value;
    signal = { stop: false }; setBusy(true);
    try {
      let best = null;
      const attempts = generate ? 4 : 1;
      for (let attempt = 0; attempt < attempts && !signal.stop; attempt++) {
        const map = generate ? api.createMap(attempt, mode) : api.getMap();
        const result = await CWExitDesign.optimize(api.engine, map, {
          mode, iterations: 6000, seed: 'level-' + id + '-' + attempt + '-' + Date.now(), signal,
          onProgress: state => { $('#exitWorkStatus').textContent = (generate ? 'Tạo mẫu ' + (attempt + 1) + '/4 · ' : '') + state.iteration + '/' + state.total + ' · ' + state.score + ' điểm · ' + state.exits + ' giun ra ban đầu'; }
        });
        if (result.analysis.matches && (!best || result.quality.score > best.quality.score)) best = result;
        if (best || !generate) break;
      }
      if (signal.stop || api.getLevel() !== id) { $('#exitWorkStatus').textContent = 'Đã dừng. Map hiện tại được giữ nguyên.'; return; }
      if (!best) throw new Error('Chưa tìm được map đúng nhịp và giải được. Thử Tự tạo hoặc tăng kích thước bàn.');
      api.replaceMap(best.map);
      api.setDesign({ exitMode: mode });
      $('#exitWorkStatus').textContent = 'Đã áp dụng · ' + best.quality.score + ' điểm · ' + best.analysis.free.length + ' giun ra ban đầu. Có thể Hoàn tác; bấm Lưu map để xác nhận bản xuất.';
      refresh();
    } catch (error) { $('#exitWorkStatus').textContent = error.message; }
    finally { setBusy(false); }
  }
  $('#exitOptimize').onclick = () => design(false);
  $('#exitGenerate').onclick = () => design(true);
  $('#exitStop').onclick = () => { if (signal) signal.stop = true; };
  function syncModeControls() {
    const progressive = $('#exitMode').value === 'progressive';
    for (const id of ['auIce','auLock','auBomb','auPortal','auHole','auStraight','auBias']) for (const suffix of ['', 'Out']) $('#'+id+suffix).disabled = progressive;
    $('#auFit').disabled = progressive;
    if (progressive) $('#auFit').checked = false;
    $('#exitBlockerHint').hidden = !progressive;
  }
  $('#exitMode').onchange = () => { api.setDesign({ exitMode: $('#exitMode').value }); syncModeControls(); if (api.refreshBoard) api.refreshBoard(); else refresh(); };
  $('#edDlg').addEventListener('close', () => { if (signal) signal.stop = true; currentId = null; });
  $('#edSave').onclick = () => api.saveMap(false);
  $('#table').addEventListener('click', event => {
    const button = event.target.closest('[data-edit-level]');
    if (button) api.openLevel(Number(button.dataset.editLevel));
  });
  return { opened, refresh, isBusy: () => busy, stop: () => { if(signal)signal.stop=true; } };
};
