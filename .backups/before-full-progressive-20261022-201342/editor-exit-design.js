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
    let alternate = null;
    if (mode === 'progressive' && result.Fs[0] === 1 && result.Fs[1] === 2) {
      let step = 0;
      alternate = engine.run(simulation, (choices, state) => step++ === 1 ? choices.find(index => index !== result.order[1]) : engine.choose(choices, state));
    }
    let penalty = 0;
    if (mode === 'one' || mode === 'progressive') penalty += Math.abs(free.length - 1) * 1000;
    if (mode === 'many') penalty += Math.max(0, 3 - free.length) * 1000;
    if (mode === 'progressive') {
      penalty += Math.abs((result.Fs[1] || 0) - 2) * 400 + Math.abs((result.Fs[2] || 0) - 3) * 200;
      if (alternate) penalty += Math.abs((alternate.Fs[2] || 0) - 3) * 200;
    }
    const selfFacing = map.worms.map((worm, index) => {
      if (worm.cells.length < 2) return index;
      const [head, neck] = worm.cells, dx = head[0] - neck[0], dy = head[1] - neck[1];
      return worm.cells.some(cell => dx !== 0 ? cell[1] === head[1] && (cell[0] - head[0]) * dx > 0 : cell[0] === head[0] && (cell[1] - head[1]) * dy > 0) ? index : -1;
    }).filter(index => index >= 0);
    const safe = map.worms.length > 0 && !selfFacing.length && result.solved && result.booms === 0 && (!alternate || alternate.solved && alternate.booms === 0);
    return { free, flow: result.Fs, result, alternate, penalty, safe, selfFacing, matches: safe && penalty === 0, simulation };
  }
  function seedIce(engine, input, mode) {
    const map = clone(input), base = analyze(engine, map, mode);
    if (base.matches || !base.safe || !['one', 'progressive'].includes(mode)) return map;
    const initial = base.free.filter(index => !map.worms[index].bomb && !map.worms[index].lock);
    if (initial.length < (mode === 'progressive' ? 5 : 1)) return map;
    const selected = initial.slice(0, mode === 'progressive' ? 5 : 1), selectedSet = new Set(selected);
    for (const index of initial) if (!selectedSet.has(index)) map.worms[index].ice = mode === 'progressive' ? 3 : 1;
    if (mode === 'progressive') {
      selected.slice(1, 3).forEach(index => { map.worms[index].ice = 1; });
      selected.slice(3, 5).forEach(index => { map.worms[index].ice = 2; });
      // Cover newly opened routes for both choices at the second move.
      for (let pass = 0; pass < 3; pass++) for (const second of selected.slice(1, 3)) {
        let step = 0;
        engine.run(engine.simulate(map), (choices, state) => {
          if (step < 3) for (const index of choices) {
            if (!selectedSet.has(index) && !map.worms[index].bomb && !map.worms[index].lock) map.worms[index].ice = Math.max(map.worms[index].ice, 3);
          }
          const requested = step === 0 ? selected[0] : step === 1 ? second : -1;
          step++;
          return choices.includes(requested) ? requested : engine.choose(choices, state);
        });
      }
    }
    return analyze(engine, map, mode).matches ? map : clone(input);
  }
  async function optimize(engine, input, options = {}) {
    if (!input?.worms?.length) throw new Error('Map chưa có giun. Dùng Tự tạo để tạo map trước.');
    const mode = options.mode || 'one', iterations = Math.max(1, Math.min(50000, options.iterations || 8000));
    const rnd = random(options.seed || 'exit-design');
    let map = options.allowIce ? seedIce(engine, input, mode) : clone(input), current = analyze(engine, map, mode);
    if (current.selfFacing.length) throw new Error('Có giun chĩa đầu vào thân. Đảo đầu các giun được cảnh báo trước khi tối ưu.');
    if (!current.safe) throw new Error('Map hiện tại phải giải được và không nổ bom trước khi tối ưu.');
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
  const api = { analyze, optimize, seedIce };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CWExitDesign = api;
})(typeof window !== 'undefined' ? window : globalThis);
