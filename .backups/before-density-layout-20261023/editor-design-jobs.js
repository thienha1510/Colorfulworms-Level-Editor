/* Background job entry points, shared with Node verification. */
(function(root){
 'use strict';
 const engine=typeof module!=='undefined'&&module.exports?require('./editor-engine.js'):root.CWEditorEngine;
 const designer=typeof module!=='undefined'&&module.exports?require('./editor-exit-design.js'):root.CWExitDesign;
 async function run(kind,input,options={},onProgress=()=>{}){
  const mode=options.mode||'any';let map,result;
  if(kind==='generate'){
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
  }else if(kind==='optimize')result=await designer.optimize(engine,input,{...options,onProgress});
  else if(kind==='target')map=(await engine.X(input,options.target,options.iterations||6000,options.seed,(iteration)=>onProgress({iteration}),null)).m;
  else if(kind==='harder'||kind==='easier')map=(await engine.W(input,options.iterations||1500,options.seed,null,(iteration)=>onProgress({iteration}),kind==='harder'?1:-1,null)).m;
  else throw Error('Tác vụ chỉnh map không hợp lệ.');
  if(result)map=result.map;
  if(!map?.worms?.length)throw Error('Map chưa có giun. Dùng Tự tạo trước.');
  const analysis=designer.analyze(engine,map,mode);
  if(!analysis.matches)throw Error(mode==='any'?'Map kết quả không giải được hoặc có hình giun không hợp lệ. Map cũ được giữ nguyên.':'Kết quả làm sai nhịp đã chọn hoặc có thể bị kẹt. Map cũ được giữ nguyên. Dùng Tự tạo hoặc đổi thiết lập.');
  const quality=engine.evaluate(map,analysis.simulation);if(!quality)throw Error('Không chấm được map. Map cũ được giữ nguyên.');
  return{map,analysis,quality};
 }
 const api={run};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWDesignJobs=api;
})(typeof globalThis!=='undefined'?globalThis:window);
