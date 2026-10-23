/* Exit-count constraints for editor maps. Uses the editor's gameplay simulator. */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function random(seed) {
    let state = 2166136261;
    for (const letter of String(seed)) state = Math.imul(state ^ letter.charCodeAt(0), 16777619);
    return () => { state += 0x6D2B79F5; let value = Math.imul(state ^ state >>> 15, state | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
  }
  function dependencies(simulation) {
    return simulation.paths.map(path => new Set(path.blockers.map(cell => simulation.I.wormAt[cell])));
  }
  function releaseChooser(simulation, fallback) {
    const deps = dependencies(simulation), removed = new Set();
    return (choices, state) => {
      let best = [], most = -1;
      for (const choice of choices) {
        let released = 0;
        deps.forEach((parents, index) => {
          if (!removed.has(index) && parents.has(choice) && [...parents].every(parent => parent === choice || removed.has(parent))) released++;
        });
        if (released > most) { best = [choice]; most = released; }
        else if (released === most) best.push(choice);
      }
      const chosen = fallback(best, state); removed.add(chosen); return chosen;
    };
  }
  function analyze(engine, map, mode = 'any') {
    const simulation = engine.simulate(map);
    const result = engine.run(simulation, mode === 'progressive' ? releaseChooser(simulation, engine.choose) : engine.choose);
    const free = simulation.paths.map((path, index) => !simulation.block0[index] && !map.worms[index].ice && !map.worms[index].lock && path.end !== 'loop' && path.end !== 'bad' ? index : -1).filter(index => index >= 0);
    const expected = targetFlow(map.worms.length);
    const penalty = mode === 'progressive' ? expected.reduce((sum, count, step) => sum + Math.abs((result.Fs[step] || 0) - count) * 200, 0) : 0;
    const selfFacing = map.worms.map((worm, index) => {
      if (worm.cells.length < 2) return index;
      const [head, neck] = worm.cells, dx = head[0] - neck[0], dy = head[1] - neck[1];
      return worm.cells.some(cell => dx !== 0 ? cell[1] === head[1] && (cell[0] - head[0]) * dx > 0 : cell[0] === head[0] && (cell[1] - head[1]) * dy > 0) ? index : -1;
    }).filter(index => index >= 0);
    const geometryValid = !simulation.I.overlaps.length && map.worms.every(worm => worm.cells.every(([x,y], index) =>
      Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < map.XSize && y >= 0 && y < map.YSize &&
      (!index || Math.abs(x - worm.cells[index - 1][0]) + Math.abs(y - worm.cells[index - 1][1]) === 1)));
    const safe = map.worms.length > 0 && geometryValid && !selfFacing.length && result.solved && result.booms === 0;
    // In a plain geometric puzzle, removing an available worm only removes
    // dependencies. A complete topological order proves every legal choice safe.
    // Timers, keys, bombs and portals need additional state; never certify them
    // as the physical release sequence, even if one sampled play matches its count.
    const certified = safe && map.worms.every(worm => !worm.ice && !worm.lock && !worm.bomb && !worm.area) &&
      !(map.portals?.length || map.holes?.length || map.keys?.length) &&
      simulation.paths.every(path => path.end === 'exit');
    const matches = safe && (mode !== 'progressive' || penalty === 0 && free.length === 1 && certified);
    const firstMismatch = expected.findIndex((count, step) => result.Fs[step] !== count);
    return { free, flow: result.Fs, expected, firstMismatch, result, penalty, safe, selfFacing, certified, matches, simulation };
  }
  function targetFlow(count) {
    return Array.from({ length: count }, (_, step) => Math.min(step + 1, count - step));
  }
  async function optimize(engine, input, options = {}) {
    if (!input?.worms?.length) throw new Error('Map chưa có giun. Dùng Tự tạo để tạo map trước.');
    const mode = options.mode || 'any', iterations = Math.max(1, Math.min(50000, options.iterations || 8000));
    const rnd = random(options.seed || 'exit-design');
    let map = clone(input), current = analyze(engine, map, mode);
    if (current.selfFacing.length) throw new Error('Có giun chĩa đầu vào thân. Đảo đầu các giun được cảnh báo trước khi tối ưu.');
    if (!current.safe) throw new Error('Map hiện tại phải giải được và không nổ bom trước khi tối ưu.');
    if (mode === 'progressive') {
      if (!current.matches) throw new Error('Map chưa có trình tự mở đường bằng thân giun đạt nhịp 1 → 2 → 3… hoặc còn blocker phụ. Dùng Tự tạo; map hiện tại chưa thay đổi.');
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
  // Build a dependency DAG in reverse: new bodies cannot enter any earlier
  // escape corridor. Each expansion adds two worms blocked by its parent and
  // already expanded ancestors. Expanding these parents first yields 1,2,3…;
  // every other legal ordering remains solvable because dependencies only vanish.
  function generateProgressive(input, options = {}) {
    const W = input.XSize, H = input.YSize;
    const min = Math.max(2, Math.floor(options.minLen || 2)), max = Math.max(min, Math.floor(options.maxLen || min));
    const count = Math.max(1, Math.floor(options.count || input.worms.length || Math.min(W + H, Math.floor(W * H / (min * 2)))));
    if (count * min > W * H) throw new Error('Bàn không đủ ô cho số giun và chiều dài tối thiểu này. Giảm số giun hoặc tăng bàn.');
    const rnd = random(options.seed || 'progressive'), directions = [[1,0],[-1,0],[0,1],[0,-1]];
    const inside = (x,y) => x >= 0 && y >= 0 && x < W && y < H;
    const shuffle = values => { for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; } return values; };
    let bestCount = 0;
    for (let attempt = 0; attempt < 240; attempt++) {
      const occupied = new Int32Array(W * H).fill(-1), reserved = new Uint8Array(W * H), bodies = [], expanded = new Set();
      // Dense maps need short tails; maxLen is a limit, not a required length.
      const lengthLimit = attempt < 8 ? max : attempt < 40 ? Math.min(max, min + 2) : min;
      function candidates(parent, limit) {
        const starts = [];
        if (parent < 0) {
          for (let k = 0; k < 200; k++) starts.push([Math.floor(rnd()*W), Math.floor(rnd()*H), Math.floor(rnd()*4)]);
        } else for (const [px,py] of bodies[parent]) for (let dir = 0; dir < 4; dir++) {
          const [dx,dy] = directions[dir];
          for (let distance = 1; distance < Math.max(W,H); distance++) {
            const x = px-dx*distance, y = py-dy*distance, nx = x-dx, ny = y-dy;
            if (!inside(nx,ny)) break;
            if (occupied[y*W+x] < 0 && !reserved[y*W+x] && occupied[ny*W+nx] < 0 && !reserved[ny*W+nx]) starts.push([x,y,dir]);
          }
        }
        const seen = new Set(), found = [];
        for (const [x,y,dir] of shuffle(starts)) {
          const [dx,dy] = directions[dir], nx = x-dx, ny = y-dy, key = (y*W+x)*4+dir;
          if (seen.has(key)) continue; seen.add(key);
          if (!inside(nx,ny) || occupied[y*W+x] >= 0 || reserved[y*W+x] || occupied[ny*W+nx] >= 0 || reserved[ny*W+nx]) continue;
          const path = [], deps = new Set();
          for (let a=x+dx,b=y+dy; inside(a,b); a+=dx,b+=dy) {
            const cell = b*W+a; path.push(cell); if (occupied[cell] >= 0) deps.add(occupied[cell]);
          }
          if (parent < 0 ? deps.size : !deps.has(parent) || [...deps].some(id => id !== parent && !expanded.has(id))) continue;
          const body = [[x,y],[nx,ny]], taken = new Set([y*W+x,ny*W+nx,...path]);
          const target = min + Math.floor(rnd()*(lengthLimit-min+1));
          while (body.length < target) {
            const [a,b] = body[body.length-1];
            const next = shuffle(directions.map(([u,v]) => [a+u,b+v])).find(([u,v]) => inside(u,v) && occupied[v*W+u] < 0 && !reserved[v*W+u] && !taken.has(v*W+u));
            if (!next) break; body.push(next); taken.add(next[1]*W+next[0]);
          }
          if (body.length >= min) found.push({body,path});
          if (found.length >= limit) break;
        }
        return found;
      }
      function put(candidate) {
        const index = bodies.length; bodies.push(candidate.body);
        for (const [x,y] of candidate.body) occupied[y*W+x] = index;
        for (const cell of candidate.path) reserved[cell] = 1;
      }
      const roots = candidates(-1,20); if (!roots.length) continue;
      put(roots[0]);
      while (bodies.length < count) {
        const parents = shuffle(bodies.map((_,index) => index).filter(index => !expanded.has(index)));
        let added = false;
        for (const parent of parents) {
          const firsts = candidates(parent,24); if (!firsts.length) continue;
          if (count-bodies.length === 1) { put(firsts[0]); expanded.add(parent); added = true; break; }
          for (const first of firsts.slice(0,12)) {
            const oldOccupied = occupied.slice(), oldReserved = reserved.slice(), oldLength = bodies.length;
            put(first);
            const seconds = candidates(parent,8);
            if (seconds.length) { put(seconds[0]); expanded.add(parent); added = true; break; }
            bodies.length = oldLength; occupied.set(oldOccupied); reserved.set(oldReserved);
          }
          if (added) break;
        }
        if (!added) break;
      }
      bestCount = Math.max(bestCount, bodies.length);
      if (bodies.length !== count) continue;
      const map = clone(input); map.portals = []; map.holes = []; map.keys = [];
      // Shuffle IDs so the recommended order is computed from geometry, not IDs.
      map.worms = shuffle(bodies).map(cells => ({cells,color:null,ice:0,lock:0,bomb:0,area:0,extra:{}}));
      return map;
    }
    throw new Error('Chưa xếp được '+count+' giun với chuỗi mở đường thật (tốt nhất '+bestCount+'). Giảm số giun / chiều dài tối thiểu, tăng bàn hoặc đổi seed. Map cũ được giữ nguyên.');
  }
  const api = { analyze, optimize, targetFlow, generateProgressive };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CWExitDesign = api;
})(typeof window !== 'undefined' ? window : globalThis);
