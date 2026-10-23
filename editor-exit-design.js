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
    const expected = mode === 'waves' ? waveFlow(map.worms.length) : targetFlow(map.worms.length);
    const penalty = mode !== 'any' ? expected.reduce((sum, count, step) => sum + Math.abs((result.Fs[step] || 0) - count) * 200, 0) : 0;
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
    const plain = safe && map.worms.every(worm => !worm.lock && !worm.bomb && !worm.area) &&
      !(map.portals?.length || map.holes?.length || map.keys?.length) &&
      simulation.paths.every(path => path.end === 'exit');
    const groups = waveGroups(map.worms.length);
    const waveCertified = plain && groups.every(group => map.worms.filter(worm => worm.ice === group.start).length === group.count) &&
      dependencies(simulation).every((parents,index) => [...parents].every(parent => map.worms[parent].ice < map.worms[index].ice));
    const certified = mode === 'waves' ? waveCertified : plain && map.worms.every(worm => !worm.ice);
    const matches = safe && (mode === 'any' || penalty === 0 && free.length === 1 && certified);
    const firstMismatch = expected.findIndex((count, step) => result.Fs[step] !== count);
    return { free, flow: result.Fs, expected, firstMismatch, result, penalty, safe, selfFacing, certified, matches, simulation, groups };
  }
  function targetFlow(count) {
    return Array.from({ length: count }, (_, step) => Math.min(step + 1, count - step));
  }
  function waveGroups(count) {
    const groups = [];
    for (let start=0, width=1; start<count; width++) {
      const size=Math.min(width,count-start); groups.push({number:width,start,count:size}); start+=size;
    }
    return groups;
  }
  function waveFlow(count) {
    return waveGroups(count).flatMap(group => Array.from({length:group.count},(_,index)=>group.count-index));
  }
  function applyWaves(engine, input, options={}) {
    const map=clone(input);
    if (map.worms.some(w=>w.lock||w.bomb||w.area) || map.portals.length || map.keys.length || map.holes.length) return null;
    map.worms.forEach(w=>{w.ice=0;});
    const base=analyze(engine,map,'any'); if(!base.safe)return null;
    const deps=dependencies(base.simulation), removed=new Set(), assigned=new Set();
    const rnd=random(options.seed||'waves');
    const followers=map.worms.map(()=>[]);deps.forEach((parents,index)=>parents.forEach(parent=>followers[parent].push(index)));
    const memo=new Map();function depth(index){if(memo.has(index))return memo.get(index);const value=1+Math.max(0,...followers[index].map(depth));memo.set(index,value);return value;}
    map.worms.forEach((_,index)=>depth(index));
    for(const group of waveGroups(map.worms.length)) {
      const pool=map.worms.map((_,index)=>index).filter(index=>!assigned.has(index)&&[...deps[index]].every(parent=>removed.has(parent)));
      if(pool.length<group.count)return null;
      for(let slot=0;slot<group.count;slot++) {
        let best=-1,most=-1;
        for(const candidate of pool) {
          if(assigned.has(candidate))continue;
          const released=deps.reduce((sum,parents,index)=>sum+(!assigned.has(index)&&parents.has(candidate)&&[...parents].every(parent=>parent===candidate||removed.has(parent))?1:0),0)+depth(candidate)*10+rnd()*.01;
          if(released>most){most=released;best=candidate;}
        }
        map.worms[best].ice=group.start; assigned.add(best); removed.add(best);
      }
    }
    return analyze(engine,map,'waves').matches?map:null;
  }
  function parallelWaveMap(input,options,count,seed) {
    const rnd=random(seed),min=Math.max(2,options.minLen||2),max=Math.max(min,options.maxLen||12);
    const peak=Math.max(...waveGroups(count).map(g=>g.count));
    const layouts=[];
    for(const rotate of [false,true])for(let band=3;band>=1;band--) {
      const W=rotate?input.YSize:input.XSize,H=rotate?input.XSize:input.YSize,lanes=Math.floor(H/band),perLane=Math.floor(W/min);
      if(lanes>=Math.min(peak,count)&&lanes*perLane>=count)layouts.push({rotate,W,H,band,lanes,perLane});
    }
    if(!layouts.length)return null;
    layouts.forEach(layout=>{const used=Math.min(layout.lanes,count);const sizes=Array(used).fill(0);let left=count;while(left)for(let i=0;i<used&&left;i++)if(sizes[i]<layout.perLane){sizes[i]++;left--;}layout.coverage=sizes.reduce((sum,size)=>{const slot=Math.floor(layout.W/size);return sum+Array.from({length:size},(_,j)=>Math.min(max,(j===size-1?layout.W-j*slot:slot)*layout.band)).reduce((a,b)=>a+b,0);},0)+rnd()*.01;});
    layouts.sort((a,b)=>b.coverage-a.coverage);
    const layout=layouts[0],{rotate,W,band,lanes,perLane}=layout;
    const used=Math.min(lanes,count),sizes=Array(used).fill(0);let left=count;
    while(left)for(let i=0;i<used&&left;i++)if(sizes[i]<perLane){sizes[i]++;left--;}
    const map=clone(input);map.worms=[];map.portals=[];map.keys=[];map.holes=[];
    sizes.forEach((size,lane)=>{
      const slot=Math.floor(W/size),flip=rnd()<.5,flipY=rnd()<.5;
      for(let j=0;j<size;j++) {
        const width=j===size-1?W-j*slot:slot;
        const length=Math.min(max,width*band),cells=[];
        for(let row=0;row<band&&cells.length<length;row++)for(let col=0;col<width&&cells.length<length;col++) {
          let x=j*slot+(row%2?width-1-col:col),y=lane*band+(flipY?band-1-row:row);
          if(flip)x=W-1-x;
          cells.push(rotate?[y,x]:[x,y]);
        }
        map.worms.push({cells,color:null,ice:0,lock:0,bomb:0,area:0,extra:{}});
      }
    });
    for(let i=map.worms.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[map.worms[i],map.worms[j]]=[map.worms[j],map.worms[i]];}
    return map;
  }
  function generateWaves(engine,input,options={}) {
    const count=Math.max(1,Math.floor(options.count||input.worms.length||Math.floor(input.XSize*input.YSize/(Math.max(2,options.minLen||2)*2))));
    if(count*Math.max(2,options.minLen||2)>input.XSize*input.YSize)throw new Error('Bàn không đủ ô cho '+count+' giun. Giảm số giun / chiều dài tối thiểu hoặc tăng bàn.');
    for(let attempt=0;attempt<16;attempt++) {
      options.onProgress?.({iteration:attempt,total:16});
      const seed=String(options.seed||'waves')+'|wave-'+attempt;
      const min=Math.max(2,options.minLen||2), max=Math.max(min,options.maxLen||12),lengthLimit=attempt<8?max:attempt<20?Math.min(max,min+2):min;
      if(attempt>=8){const structured=parallelWaveMap(input,options,count,seed);if(structured){const timed=applyWaves(engine,structured,{seed});if(timed)return timed;}continue;}
      const map=clone(input);map.portals=[];map.keys=[];map.holes=[];
      map.worms=engine.generate({W:map.XSize,H:map.YSize,minLen:min,maxLen:lengthLimit,count,straight:options.straight??.35,bias:-.95,extend:attempt<8,seed});
      if(map.worms.length!==count)continue;
      const timed=applyWaves(engine,map,{seed});if(timed)return timed;
    }
    throw new Error('Chưa tạo được '+count+' giun theo đợt 1, 2, 3… mà không bị kẹt. Giảm số giun / chiều dài tối thiểu, tăng bàn hoặc đổi seed. Map cũ được giữ nguyên.');
  }
  async function optimize(engine, input, options = {}) {
    if (!input?.worms?.length) throw new Error('Map chưa có giun. Dùng Tự tạo để tạo map trước.');
    const mode = options.mode || 'any', iterations = Math.max(1, Math.min(50000, options.iterations || 8000));
    const rnd = random(options.seed || 'exit-design');
    let map = clone(input), current = analyze(engine, map, mode);
    if (current.selfFacing.length) throw new Error('Có giun chĩa đầu vào thân. Đảo đầu các giun được cảnh báo trước khi tối ưu.');
    if (!current.safe) throw new Error('Map hiện tại phải giải được và không nổ bom trước khi tối ưu.');
    if (mode === 'waves') {
      const timed=applyWaves(engine,input,options);
      if(!timed)throw new Error('Bố cục hiện tại chưa mở được theo đợt. Dùng Tự tạo; map cũ được giữ nguyên.');
      const analysis=analyze(engine,timed,'waves');
      return {map:timed,analysis,quality:engine.evaluate(timed,analysis.simulation),attempts:0};
    }
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
      if(options.deadline && Date.now()>options.deadline)break;
      options.onProgress?.({iteration:attempt,total:240,bestCount});
      const occupied = new Int32Array(W * H).fill(-1), reserved = new Uint8Array(W * H), bodies = [], expanded = new Set();
      // Dense maps need short tails; maxLen is a limit, not a required length.
      const lengthLimit = attempt < 8 ? max : attempt < 40 ? Math.min(max, min + 2) : min;
      function candidates(parent, limit) {
        const starts = [];
        if (parent < 0) {
          for (let k = 0; k < 200; k++) {let x=Math.floor(rnd()*W),y=Math.floor(rnd()*H),dir=Math.floor(rnd()*4);if(options.boundaryRoot){if(dir===0)x=W-1;if(dir===1)x=0;if(dir===2)y=H-1;if(dir===3)y=0;}starts.push([x,y,dir]);}
        } else for (const [px,py] of bodies[parent]) for (let dir = 0; dir < 4; dir++) {
          const [dx,dy] = directions[dir];
          for (let distance = 1; distance < Math.max(W,H); distance++) {
            const x = px-dx*distance, y = py-dy*distance, nx = x-dx, ny = y-dy;
            if (!inside(nx,ny)) break;
            if (occupied[y*W+x] < 0 && !reserved[y*W+x] && occupied[ny*W+nx] < 0 && !reserved[ny*W+nx]) starts.push([x,y,dir]);
          }
        }
        const seen = new Set(), found = [];
        let ordered=shuffle(starts);
        if(options.compact&&parent>=0){ordered=ordered.map(start=>({start,cost:Math.min(...bodies[parent].map(([x,y])=>Math.abs(x-start[0])+Math.abs(y-start[1])))+rnd()*(parent===0?1:3)})).sort((a,b)=>a.cost-b.cost).map(value=>value.start);}
        for (const [x,y,dir] of ordered) {
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
  const api = { analyze, optimize, targetFlow, generateProgressive, waveGroups, waveFlow, applyWaves, generateWaves };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CWExitDesign = api;
})(typeof window !== 'undefined' ? window : globalThis);
