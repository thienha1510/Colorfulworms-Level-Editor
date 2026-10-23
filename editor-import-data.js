/* Colorful Worms: file import validation. Existing game and map rules are unchanged. */
(function (root) {
  'use strict';
  const MAX_LEVELS = 500;
  const enemySpeed=typeof module!=='undefined'&&module.exports?require('./game/cw-enemy-speed.js'):root.CWEnemySpeed;
  const pathOf = file => (file.webkitRelativePath || file.name).replace(/\\/g, '/');
  const stem = name => name.replace(/\.(txt|json)$/i, '');
  const isMap = value => value && !Array.isArray(value) && Number.isInteger(value.XSize) && Number.isInteger(value.YSize) && value.XSize >= 2 && value.XSize <= 200 && value.YSize >= 2 && value.YSize <= 200 && Array.isArray(value.Arrows) && value.Arrows.every(arrow => arrow && Array.isArray(arrow.Indices) && arrow.Indices.length >= 2 && arrow.Indices.every(Number.isInteger)) && ['chuanSong', 'blackHole', 'yaoShi'].every(key => value[key] == null || Array.isArray(value[key]) && value[key].every(group => Array.isArray(group) && group.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))));
  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const idOf = value => { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw new Error('Số level phải là số nguyên dương.'); return id; };
  function validateProject(value) {
    if (!value || Array.isArray(value) || !Array.isArray(value.levels) || !value.levels.length) throw new Error('Đây không phải project đã lưu. Hãy chọn thư mục chứa các map hoặc file tạo bởi nút Lưu project.');
    if (value.levels.length > MAX_LEVELS) throw new Error('Mỗi project hỗ trợ tối đa 500 level.');
    const ids = new Set();
    for (const level of value.levels) {
      const id = idOf(level.levelid);
      if (ids.has(id)) throw new Error('Project bị trùng level ' + id + '.');
      ids.add(id);
      if (typeof level.levelid !== 'number') throw new Error('levelid trong project phải là số.');
      if (!Number.isFinite(level.target) || level.target < 0 || level.target > 100) throw new Error('Mục tiêu của level ' + id + ' không hợp lệ.');
      if (typeof level.name !== 'string' || !level.name.trim() || typeof level.wenname !== 'string') throw new Error('Tên map hoặc bundle của level ' + id + ' không hợp lệ.');
      if (level.map != null) {
        let map;
        try { map = typeof level.map === 'string' ? JSON.parse(level.map) : null; } catch { throw new Error('Map trong level ' + id + ' bị lỗi JSON.'); }
        if (!isMap(map)) throw new Error('Map trong level ' + id + ' thiếu XSize, YSize hoặc Arrows hợp lệ.');
        try { enemySpeed.read(map); } catch(error) { throw new Error('Level '+id+': '+error.message); }
      }
    }
    const sorted = [...ids].sort((a, b) => a - b);
    if (sorted.at(-1) - sorted[0] + 1 > MAX_LEVELS) throw new Error('Phạm vi project vượt quá 500 level.');
    if (value.cfg && (!Number.isInteger(value.cfg.start) || value.cfg.start !== sorted[0] || !Number.isInteger(value.cfg.count) || value.cfg.count !== sorted.at(-1) - sorted[0] + 1)) throw new Error('Thiết lập số level không khớp với danh sách level trong project.');
    return { ...value, cfg: value.cfg || { start: sorted[0], count: sorted.at(-1) - sorted[0] + 1 } };
  }
  function entriesOf(value) {
    const list = Array.isArray(value) ? value : value && Array.isArray(value.level) ? value.level : null;
    if (!list || !list.length || list.length > MAX_LEVELS) throw new Error('Danh sách màn phải có từ 1 đến 500 mục.');
    const ids = new Set();
    return list.map((entry, index) => {
      const levelid = idOf(entry.levelid == null ? index + 1 : entry.levelid);
      if (ids.has(levelid)) throw new Error('Danh sách bị trùng level ' + levelid + '.');
      ids.add(levelid);
      if (typeof entry.name !== 'string' || !entry.name.trim() || typeof entry.wenname !== 'string' || !entry.wenname.trim()) throw new Error('Mục ' + (index + 1) + ' thiếu name hoặc wenname.');
      if (/[\\/]/.test(entry.name) || /(^|[\\/])\.\.([\\/]|$)/.test(entry.wenname)) throw new Error('Tên hoặc đường dẫn map không hợp lệ ở level ' + levelid + '.');
      return { levelid, name: stem(entry.name), wenname: entry.wenname.replace(/\\/g, '/') };
    });
  }
  function manifestRank(name) {
    if (/^level2\.json$/i.test(name)) return 0;
    if (/^level_entries.*\.json$/i.test(name)) return 1;
    if (/^level\.json$/i.test(name)) return 2;
    return 9;
  }
  async function prepare(files, options = {}) {
    files = [...files];
    if (!files.length) throw new Error('Chưa chọn file nào.');
    const records = [], warnings = [], manifests = [], projects = [];
    for (const file of files) {
      const path = pathOf(file), name = path.split('/').at(-1), rank = manifestRank(name);
      if (!/\.(txt|json)$/i.test(name)) continue;
      if (options.directory && /\.json$/i.test(name) && rank === 9 && !/^(project|colorful-worms-project.*)\.json$/i.test(name)) continue;
      let value;
      try { value = JSON.parse(await file.text()); }
      catch { warnings.push(name + ': JSON không hợp lệ.'); continue; }
      if (value && !Array.isArray(value) && Array.isArray(value.levels)) { projects.push({ name, value: validateProject(value) }); continue; }
      if (Array.isArray(value) || value && Array.isArray(value.level)) { manifests.push({ name, path, rank, entries: entriesOf(value) }); continue; }
      if (isMap(value)) { enemySpeed.read(value); records.push({ path, name: stem(name), map: value }); }
      else warnings.push(name + ': không phải map, danh sách màn hoặc project.');
    }
    if (projects.length > 1) throw new Error('Có nhiều file project. Hãy chọn riêng project cần mở.');
    if (projects.length) return { kind: 'project', label: projects[0].name, project: projects[0].value, warnings };
    manifests.sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path));
    const manifest = options.manifest || manifests[0];
    if (manifests.length > 1) warnings.push('Có nhiều danh sách; sử dụng ' + manifest.name + '.');
    if (manifest && !records.length) return { kind: 'manifest', label: manifest.name, manifest, warnings, levels: [] };
    const levels = [], missing = [];
    if (manifest) {
      for (const entry of manifest.entries) {
        let matches = records.filter(record => record.path.endsWith('/' + entry.wenname + '/' + entry.name + '.txt') || record.path === entry.wenname + '/' + entry.name + '.txt' || record.path.endsWith('/' + entry.wenname + '/' + entry.name + '.json'));
        if (!matches.length) matches = records.filter(record => record.name === entry.name);
        if (matches.length === 1) levels.push({ ...entry, map: matches[0].map });
        else missing.push('Level ' + entry.levelid + ': ' + (matches.length ? 'trùng tên map ' : 'thiếu ') + entry.wenname + '/' + entry.name + '.txt');
      }
    } else {
      records.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
      for (let index = 0; index < records.length; index++) {
        const record = records[index], number = record.name.match(/(?:^|_)(\d+)$/), parts = record.path.split('/');
        levels.push({ levelid: number ? idOf(number[1]) : (options.startLevel || 1) + index, name: record.name, wenname: parts.length > 1 ? parts.at(-2) : (options.bundle || 'game-level'), map: record.map });
      }
    }
    if (!levels.length) throw new Error(['Không tìm thấy map có thể nạp.', ...missing.slice(0, 3), ...warnings.slice(0, 3)].join(' '));
    const ids = levels.map(level => level.levelid);
    if (new Set(ids).size !== ids.length) throw new Error('Có nhiều map cùng số level. Hãy chọn một bộ map hoặc dùng danh sách level_entries.json.');
    if (levels.length > MAX_LEVELS || Math.max(...ids) - Math.min(...ids) + 1 > MAX_LEVELS) throw new Error('Phạm vi nạp vượt quá 500 level. Hãy chọn bộ map nhỏ hơn.');
    levels.sort((a, b) => a.levelid - b.levelid);
    return { kind: 'maps', label: manifest ? manifest.name : (options.directory ? 'Thư mục level' : 'Các file map'), levels, missing, warnings };
  }
  const api = { prepare, validateProject, isMap, escapeHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CWImportData = api;
})(typeof window !== 'undefined' ? window : globalThis);
