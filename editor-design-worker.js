/* Runs map generation away from the UI thread. Termination cancels the job. */
importScripts('game/cw-enemy-speed.js?v=20261023-quarter-speed5','editor-progressive-quality.js?v=20261023-progressive-min10','editor-engine.js?v=20261023-quarter-speed5','editor-exit-design.js?v=20261023-progressive-min10','editor-density.js?v=20261023-progressive-min10','editor-progressive-patterns.js?v=20261023-progressive-min10','editor-progressive-generator.js?v=20261023-progressive-min10','editor-auto-generate.js?v=20261023-progressive-min10','editor-design-jobs.js?v=20261023-progressive-min10');
self.onmessage=async function(event){
 const {id,kind,map,options}=event.data;
 try{
  const result=await CWDesignJobs.run(kind,map,options,progress=>self.postMessage({id,type:'progress',progress}));
  self.postMessage({id,type:'result',result});
 }catch(error){self.postMessage({id,type:'error',error:error?.message||String(error)});}
};
