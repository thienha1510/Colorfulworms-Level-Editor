/* Background job entry points, shared with Node verification. */
(function(root){
 'use strict';
 const engine=typeof module!=='undefined'&&module.exports?require('./editor-engine.js'):root.CWEditorEngine;
 const designer=typeof module!=='undefined'&&module.exports?require('./editor-exit-design.js'):root.CWExitDesign;
 const density=typeof module!=='undefined'&&module.exports?require('./editor-density.js'):root.CWMapDensity;
 async function run(kind,input,options={},onProgress=()=>{}){
  const mode=options.mode||'any';let map,result;
  if(kind==='generate'){
   const minimum=Math.max(0,Math.min(95,Number(options.minCoverage)||0));
   const area=input.XSize*input.YSize;
   if(options.count&&options.maxLen&&options.count*options.maxLen<area*minimum/100)
    throw Error('Số giun × chiều dài tối đa chỉ phủ được '+Math.floor(100*options.count*options.maxLen/area)+'% bàn, thấp hơn yêu cầu '+minimum+'%. Tăng Số giun / Giun dài nhất, giảm kích thước bàn hoặc giảm Độ phủ tối thiểu. Map cũ được giữ nguyên.');
   const originalSeed=String(options.seed||'map');let best=null,bestCoverage=-1,lastError=null;
   const attempts=minimum?8:1,deadline=Date.now()+12000;
   for(let attempt=0;attempt<attempts;attempt++){
    if(attempt&&Date.now()>deadline)break;
    options={...options,deadline,seed:attempt?originalSeed+'|coverage-'+attempt:originalSeed};
    onProgress({iteration:attempt,total:attempts});
    try{

   if(mode==='progressive')map=designer.generateProgressive(input,{...options,onProgress});
   else if(mode==='waves')map=designer.generateWaves(engine,input,{...options,onProgress});
   else{
    map=JSON.parse(JSON.stringify(input));
    map.worms=engine.generate({...options,W:map.XSize,H:map.YSize});
    if(options.count&&map.worms.length!==options.count)throw Error('Chỉ xếp được '+map.worms.length+'/'+options.count+' giun. Giảm số giun / chiều dài tối thiểu hoặc tăng bàn. Map cũ được giữ nguyên.');
    const flags=options.blockers||{ice:0,lock:0,bomb:0,portal:0,hole:0};
    engine.addBlockers(map,flags,engine.random(engine.hash(options.seed+'|blockers')));
    if(options.fitTarget!=null)map=(await engine.X(map,options.fitTarget,6000,options.seed,(iteration)=>onProgress({iteration}),null)).m;
   }
    if(minimum){map=density.grow(engine,designer,map,options);}
    const coverage=density.measure(map);
    if(coverage.percent>bestCoverage){best=map;bestCoverage=coverage.percent;}
    if(coverage.percent>=minimum)break;
    }catch(error){lastError=error;}
   }
   if(!best)throw lastError||Error('Không tạo được map với thiết lập này.');
   map=best;
   if(bestCoverage+1e-9<minimum)throw Error('Bố cục tốt nhất phủ '+Math.floor(bestCoverage)+'% / yêu cầu '+minimum+'%. Không áp dụng map quá trống. Tăng Giun dài nhất / Số giun, giảm kích thước bàn hoặc giảm Độ phủ tối thiểu. Map cũ được giữ nguyên.');
  }else if(kind==='optimize')result=await designer.optimize(engine,input,{...options,onProgress});
  else if(kind==='target')map=(await engine.X(input,options.target,options.iterations||6000,options.seed,(iteration)=>onProgress({iteration}),null)).m;
  else if(kind==='harder'||kind==='easier')map=(await engine.W(input,options.iterations||1500,options.seed,null,(iteration)=>onProgress({iteration}),kind==='harder'?1:-1,null)).m;
  else throw Error('Tác vụ chỉnh map không hợp lệ.');
  if(result)map=result.map;
  if(!map?.worms?.length)throw Error('Map chưa có giun. Dùng Tự tạo trước.');
  const analysis=designer.analyze(engine,map,mode);
  if(!analysis.matches)throw Error(mode==='any'?'Map kết quả không giải được hoặc có hình giun không hợp lệ. Map cũ được giữ nguyên.':'Kết quả làm sai nhịp đã chọn hoặc có thể bị kẹt. Map cũ được giữ nguyên. Dùng Tự tạo hoặc đổi thiết lập.');
  const quality=engine.evaluate(map,analysis.simulation);if(!quality)throw Error('Không chấm được map. Map cũ được giữ nguyên.');
  return{map,analysis,quality,coverage:density.measure(map)};
 }
 const api={run};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWDesignJobs=api;
})(typeof globalThis!=='undefined'?globalThis:window);
