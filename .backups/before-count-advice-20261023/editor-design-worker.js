/* Runs map generation away from the UI thread. Termination cancels the job. */
importScripts('editor-progressive-quality.js?v=20261023-fixed-board','editor-engine.js?v=20261023-fixed-board','editor-exit-design.js?v=20261023-fixed-board','editor-density.js?v=20261023-fixed-board','editor-progressive-patterns.js?v=20261023-fixed-board','editor-progressive-generator.js?v=20261023-fixed-board','editor-auto-generate.js?v=20261023-fixed-board','editor-design-jobs.js?v=20261023-fixed-board');
self.onmessage=async function(event){
 const {id,kind,map,options}=event.data;
 try{
  const result=await CWDesignJobs.run(kind,map,options,progress=>self.postMessage({id,type:'progress',progress}));
  self.postMessage({id,type:'result',result});
 }catch(error){self.postMessage({id,type:'error',error:error?.message||String(error)});}
};
