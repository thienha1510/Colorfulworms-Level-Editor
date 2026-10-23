/* Exit-count constraints for editor maps. Uses the editor's gameplay simulator. */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function random(seed) {
    let state = 2166136261;
    for (const letter of String(seed)) state = Math.imul(state ^ letter.charCodeAt(0), 16777619);
    return () => { state += 0x6D2B79F5; let value = Math.imul(state ^ state >>> 15, state | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
  }
  function analyze(engine, map, mode = 'any') {
    const simulation = engine.simulate(map);
    const result = engine.run(simulation, engine.choose);
    const free = simulation.paths.map((path, index) => !simulation.block0[index] && !map.worms[index].ice && !map.worms[index].lock && path.end !== 'loop' && path.end !== 'bad' ? index : -1).filter(index => index >= 0);
    const expected = targetFlow(map.worms.length);
    let penalty = 0;
    if (mode === 'progressive') {
      penalty = expected.reduce((sum, count, step) => sum + Math.abs((result.Fs[step] || 0) - count) * 200, 0);
    }
    const selfFacing = map.worms.map((worm, index) => {
      if (worm.cells.length < 2) return index;
      const [head, neck] = worm.cells, dx = head[0] - neck[0], dy = head[1] - neck[1];
      return worm.cells.some(cell => dx !== 0 ? cell[1] === head[1] && (cell[0] - head[0]) * dx > 0 : cell[0] === head[0] && (cell[1] - head[1]) * dy > 0) ? index : -1;
    }).filter(index => index >= 0);
    const geometryValid = !simulation.I.overlaps.length && map.worms.every(worm => worm.cells.every(([x,y], index) =>
      Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < map.XSize && y >= 0 && y < map.YSize &&
      (!index || Math.abs(x - worm.cells[index - 1][0]) + Math.abs(y - worm.cells[index - 1][1]) === 1)));
    const safe = map.worms.length > 0 && geometryValid && !selfFacing.length && result.solved && result.booms === 0;
    // A sampled solution is insufficient: certify the release schedule and all routes.
    // Only the first worm is forced; any other released worm may be kept until last.
    const roots = map.worms.map((worm, index) => worm.ice === 0 ? index : -1).filter(index => index >= 0);
    const timers = map.worms.map(worm => worm.ice).sort((a, b) => a - b);
    const certified = safe && roots.length === 1 && timers.every((timer, index) => timer === Math.floor((index + 1) / 2)) &&
      map.worms.every(worm => !worm.lock && !worm.bomb) &&
      simulation.paths.every((path, index) => path.end !== 'bad' && path.end !== 'loop' &&
        path.blockers.every(cell => index !== roots[0] && simulation.I.wormAt[cell] === roots[0]));
    const matches = safe && (mode !== 'progressive' || penalty === 0 && certified);
    const firstMismatch = expected.findIndex((count, step) => result.Fs[step] !== count);
    return { free, flow: result.Fs, expected, firstMismatch, result, penalty, safe, selfFacing, certified, matches, simulation };
  }
  function targetFlow(count) {
    return Array.from({ length: count }, (_, step) => Math.min(step + 1, count - step));
  }
  function seedIce(engine, input, mode) {
    const map = clone(input), base = analyze(engine, map, mode);
    if (base.matches || !base.safe || mode !== 'progressive') return map;
    if (map.worms.some(worm => worm.bomb || worm.lock)) return map;
    // Re-time ice only when geometry proves that every later choice is safe.
    const root = base.simulation.paths.findIndex((path, index) => !base.simulation.block0[index] &&
      path.end !== 'bad' && path.end !== 'loop' && base.simulation.paths.every(other =>
        other.end !== 'bad' && other.end !== 'loop' && other.blockers.every(cell => base.simulation.I.wormAt[cell] === index)));
    if (root < 0) return map;
    const order = [root, ...base.result.order.filter(index => index !== root)];
    order.forEach((index, rank) => { map.worms[index].ice = Math.floor((rank + 1) / 2); });
    return analyze(engine, map, mode).matches ? map : clone(input);
  }
  async function optimize(engine, input, options = {}) {
    if (!input?.worms?.length) throw new Error('Map chưa có giun. Dùng Tự tạo để tạo map trước.');
    const mode = options.mode || 'any', iterations = Math.max(1, Math.min(50000, options.iterations || 8000));
    const rnd = random(options.seed || 'exit-design');
    let map = options.allowIce ? seedIce(engine, input, mode) : clone(input), current = analyze(engine, map, mode);
    if (current.selfFacing.length) throw new Error('Có giun chĩa đầu vào thân. Đảo đầu các giun được cảnh báo trước khi tối ưu.');
    if (!current.safe) throw new Error('Map hiện tại phải giải được và không nổ bom trước khi tối ưu.');
    if (mode === 'progressive') {
      if (!current.matches) throw new Error(options.allowIce ?
        'Hình giun hiện tại chưa bảo đảm nhịp mở dần cho mọi lựa chọn. Dùng Tự tạo để tạo bố cục phù hợp; map hiện tại chưa thay đổi.' :
        'Map chưa đạt nhịp mở dần. Bật cho phép thiết lập băng rồi thử lại, hoặc dùng Tự tạo.');
      return { map, analysis: current, quality: engine.evaluate(map, current.simulation), attempts: 0 };
    }
    let quality = engine.evaluate(map, current.simulation), currentCost = current.penalty - quality.st.meanRF * 1.5 - quality.score;
    let best = { map: clone(map), analysis: current, quality, cost: currentCost }, attempts = 0;
    for (let iteration = 0; iteration < iterations; iteration++) {
      if (options.signal?.stop) break;
      const chosen = new Set(), flips = rnd() < .12 ? 2 : 1;
      while (chosen.size < Math.min(flips, map.worms.length)) chosen.add(Math.floor(rnd() * map.worms.length));
      chosen.forEach(index => map.worms[index].cells.reverse());
      const candidate = analyze(engine, map, mode);
      let accepted = false;
      if (candidate.safe) {
        const nextQuality = engine.evaluate(map, candidate.simulation);
        const cost = candidate.penalty - nextQuality.st.meanRF * 1.5 - nextQuality.score;
        const heat = 1.5 + 5 * (1 - iteration / iterations);
        if (cost <= currentCost || rnd() < Math.exp((currentCost - cost) / heat)) {
          current = candidate; quality = nextQuality; currentCost = cost; accepted = true;
          if (cost < best.cost) best = { map: clone(map), analysis: candidate, quality: nextQuality, cost };
        }
      }
      if (!accepted) chosen.forEach(index => map.worms[index].cells.reverse());
      attempts++;
      if (iteration % 80 === 0) {
        options.onProgress?.({ iteration, total: iterations, score: best.quality.score, exits: best.analysis.free.length, matches: best.analysis.matches });
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      // Restart from the best feasible candidate without losing the best result.
      if (iteration && iteration % 1800 === 0) { map = clone(best.map); currentCost = best.cost; }
    }
    best.analysis = analyze(engine, best.map, mode);
    best.quality = engine.evaluate(best.map, best.analysis.simulation);
    return { map: best.map, analysis: best.analysis, quality: best.quality, attempts };
  }
  // Boundary heads have no forward obstacles. Grow only the tails, then schedule
  // one initial release and two per move. This proves the curve for any choices.
  function generateProgressive(input, options = {}) {
    const W = input.XSize, H = input.YSize, min = Math.max(2, Math.floor(options.minLen || 2)), max = Math.max(min, Math.floor(options.maxLen || min));
    const count = Math.max(1, Math.floor(options.count || input.worms.length || Math.min(W + H, Math.floor(W * H / min))));
    if (count * min > W * H) throw new Error('Bàn không đủ ô cho số giun và chiều dài tối thiểu này. Giảm số giun hoặc tăng bàn.');
    const rnd = random(options.seed || 'progressive');
    const shuffle = values => { for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; } return values; };
    const starts = [];
    for (let y = 1; y < H - 1; y++) starts.push([[0, y], [1, y]], [[W - 1, y], [W - 2, y]]);
    for (let x = 1; x < W - 1; x++) starts.push([[x, 0], [x, 1]], [[x, H - 1], [x, H - 2]]);
    for (let attempt = 0; attempt < 60; attempt++) {
      const occupied = new Set(), bodies = [], targets = [];
      for (const start of shuffle(starts.slice())) {
        if (bodies.length === count) break;
        if (start.some(([x, y]) => occupied.has(y * W + x))) continue;
        bodies.push(start.map(cell => cell.slice()));
        start.forEach(([x, y]) => occupied.add(y * W + x));
        targets.push(min + Math.floor(rnd() * (max - min + 1)));
      }
      if (bodies.length !== count) continue;
      function grow(body) {
        const [x, y] = body[body.length - 1];
        const next = shuffle([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]])
          .find(([a, b]) => a >= 0 && a < W && b >= 0 && b < H && !occupied.has(b * W + a));
        if (!next) return false;
        body.push(next); occupied.add(next[1] * W + next[0]); return true;
      }
      // Give every worm its minimum before filling the remaining space.
      for (let length = 2; length < min; length++) for (const body of shuffle(bodies.slice())) if (body.length < min) grow(body);
      if (bodies.some(body => body.length < min)) continue;
      for (let length = min; length < max; length++) for (const index of shuffle(bodies.map((_, i) => i))) if (bodies[index].length < targets[index]) grow(bodies[index]);
      const map = clone(input);
      map.portals = []; map.holes = []; map.keys = [];
      map.worms = shuffle(bodies).map((cells, index) => ({ cells, color: null, ice: Math.floor((index + 1) / 2), lock: 0, bomb: 0, area: 0, extra: {} }));
      return map;
    }
    throw new Error('Chưa xếp đủ giun cho nhịp mở dần. Giảm số giun hoặc chiều dài tối thiểu, hoặc tăng kích thước bàn.');
  }
  const api = { analyze, optimize, seedIce, targetFlow, generateProgressive };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CWExitDesign = api;
})(typeof window !== 'undefined' ? window : globalThis);
