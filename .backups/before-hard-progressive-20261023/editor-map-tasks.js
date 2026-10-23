/* One cancellable worker per editor task; late messages never apply a map. */
(function(root){
 'use strict';
 function create(options={}){
  let pending=null,sequence=0;
  function stop(){if(!pending)return;const old=pending;pending=null;old.worker.terminate();const error=new Error('Đã dừng. Map cũ được giữ nguyên.');error.name='AbortError';old.reject(error);}
  function run(kind,map,settings,onProgress=()=>{}){
   if(pending)return Promise.reject(new Error('Đang chạy tác vụ chỉnh map. Bấm Dừng trước khi bắt đầu tác vụ khác.'));
   return new Promise((resolve,reject)=>{
    let worker;
    try{const WorkerClass=options.WorkerClass||root.Worker;worker=new WorkerClass(options.url||'editor-design-worker.js?v=20261023-progressive50a');}
    catch(error){reject(new Error('Không khởi động được bộ tạo map: '+error.message));return;}
    const id=++sequence;pending={worker,id,reject};
    function finish(error,result){if(pending?.id!==id)return;pending=null;worker.terminate();if(error)reject(error);else resolve(result);}
    worker.onmessage=event=>{if(pending?.id!==id||event.data?.id!==id)return;const data=event.data;if(data.type==='progress')onProgress(data.progress);else if(data.type==='result')finish(null,data.result);else if(data.type==='error')finish(new Error(data.error));};
    worker.onerror=event=>{event.preventDefault?.();finish(new Error('Không chạy được bộ tạo map: '+(event.message||'Không tải được worker. Thử Ctrl+F5.')));};
    worker.onmessageerror=()=>finish(new Error('Không đọc được kết quả tạo map. Map cũ được giữ nguyên.'));
    try{worker.postMessage({id,kind,map,options:settings});}catch(error){finish(error);}
   });
  }
  return{run,stop,get busy(){return!!pending;}};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports=create;else root.CWMapTasks=create;
})(typeof globalThis!=='undefined'?globalThis:window);
