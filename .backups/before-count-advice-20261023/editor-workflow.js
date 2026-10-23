/* Map design UI, with a single cancellable task and a visible terminal result. */
window.CWEditorWorkflow=function(api){
 'use strict';
 const $=selector=>document.querySelector(selector),tasks=CWMapTasks();
 const modes=new Set(['any','progressive']);
 let lastMode='any';
 function unavailable(){if(api.toast)api.toast('Đang trong quá trình phát triển');else{const node=$('#toast');node.textContent='Đang trong quá trình phát triển';node.hidden=false;setTimeout(()=>node.hidden=true,2200);}}
 let busy=false,sequence=0,currentId=null,disabled=new Map();
 const constrained=()=>$('#exitMode').value!=='any';
 function report(text,error=false){api.status(text,error);const mirror=$('#exitWorkStatus');mirror.textContent=text;mirror.classList.toggle('err',error);}
 function setBusy(value){
  busy=value;api.setBusy(value);
  const ids=['exitOptimize','exitGenerate','exitMode','progressiveDifficulty','edSave','undo','redo','edReset','edPrev','edNext','tabEdit','tabPlay','edPlayGame'];
  if(value){disabled=new Map(ids.map(id=>[id,$('#'+id).disabled]));ids.forEach(id=>$('#'+id).disabled=true);}
  else{disabled.forEach((was,id)=>$('#'+id).disabled=was);disabled.clear();}
  $('#exitStop').hidden=$('#mapTaskStop').hidden=!value;
  $('#board').style.pointerEvents=value?'none':'';
  $('#tools').inert=$('#autoCard').inert=value;
  const right=$('#edDlg').querySelector('.colR');if(right)right.inert=value;
  $('#edDlg').setAttribute('aria-busy',String(value));
  if(!value){syncModeControls();api.refreshControls?.();refresh();}else refresh();
 }
 function refresh(){
  if(!api.getMap()||!$('#edDlg').open)return;
  try{
   const map=api.getMap(),mode=$('#exitMode').value,r=CWExitDesign.analyze(api.engine,map,mode);
   const observation=mode==='progressive'?api.engine.evaluate(map,r.simulation)?.observation:null;
   $('#progressiveGeometry').hidden=!observation;
   if(observation)$('#progressiveGeometry').textContent='Trung vị '+observation.medianTurns+' khúc/con · '+observation.directions+' hướng đầu · '+Math.round(100*observation.interiorHeads)+'% đầu nằm trong bàn. Bấm quét từ 4 phía: ít nhất '+observation.bestScanMistakes+'/'+map.worms.length+' lượt bị chặn. Giun dài nhất chiếm '+Math.round(observation.maxWormShare*100)+'% bàn.';
   $('#exitCount').textContent=(busy?'Map đang sửa: ':'')+r.free.length+' / '+map.worms.length+' giun ra được ngay';
   $('#exitFlow').textContent=r.flow.slice(0,12).join(' → ')+(r.flow.length>12?' → …':'')||'Chưa có đường giải';
   $('#exitFullFlow').textContent='Số giun thoát được trước mỗi nước: '+(r.flow.join(' → ')||'Chưa có đường giải');
   $('#exitTarget').hidden=mode==='any';
   $('#exitTarget').textContent=mode==='waves'?'Các đợt: '+r.groups.map(g=>g.count).join(' → ')+' con. Thoát hết đợt mới mở đợt tiếp.':'Nhịp theo trình tự gợi ý: '+r.expected.join(' → ');
   let message;
   if(mode==='any')message='Tự do: giữ cách chơi hiện tại, không ép số lựa chọn hoặc chia đợt.';
   else if(r.matches)message=mode==='waves'?'Đạt theo đợt. Hết 1 con → mở 2 con; hết cả 2 → mở 3 con… Thứ tự trong cùng đợt tùy chọn; đợt cuối lấy số giun còn lại.':'Đạt tăng lựa chọn sau mỗi con theo gợi ý: 1 → 2 → 3… Đi khác gợi ý có thể đổi nhịp, nhưng mọi nước thoát hợp lệ đều giải hết.';
   else if(r.firstMismatch>=0)message='Map đang sửa chưa dùng chế độ đã chọn: nước '+(r.firstMismatch+1)+' cần '+r.expected[r.firstMismatch]+' con thoát được, hiện có '+(r.flow[r.firstMismatch]||0)+'. Bấm Tự tạo để tạo bố cục mới đúng chế độ.';
   else message='Nhịp khớp nhưng chưa chứng nhận được cơ chế đã chọn. Dùng Tự tạo.';
   if(busy)message='Đang tự tạo và kiểm tra bố cục mới. Các số liệu bên trên thuộc map đang sửa.';
   $('#exitConstraint').textContent=message;$('#exitConstraint').classList.toggle('err',!busy&&!r.safe);
   $('#exitOrder').textContent=r.result.order.map((index,step)=>(step+1)+': '+(index+1)).join(' → ')||'Chưa có đường giải';
   $('#exitShowFirst').disabled=busy||!r.result.order.length;
   $('#exitShowFirst').onclick=()=>{if(r.result.order.length){api.selectWorm(r.result.order[0]);report('Đã chọn giun '+(r.result.order[0]+1)+' — bước đầu của trình tự gợi ý.');}};
   $('#exitFreeList').replaceChildren();
   r.free.forEach(index=>{const button=document.createElement('button');button.className='mini exit-number';button.type='button';button.textContent=String(index+1);button.title='Chọn giun '+(index+1);button.setAttribute('aria-label','Chọn giun '+(index+1));button.disabled=busy;button.onclick=()=>{api.selectWorm(index);report('Đã chọn giun '+(index+1)+', có đường thoát ngay.');};$('#exitFreeList').append(button);});
  }catch(error){$('#exitConstraint').textContent=error.message;$('#exitConstraint').classList.add('err');report('LỖI · Không phân tích được map: '+error.message,true);}
 }
 function syncModeControls(){
  const mode=$('#exitMode').value,limited=mode!=='any';
  $('#progressiveDifficultyBox').hidden=mode!=='progressive';
  for(const id of ['auIce','auLock','auBomb','auPortal','auHole','auStraight','auBias'])for(const suffix of ['','Out'])$('#'+id+suffix).disabled=limited;
  $('#auFit').disabled=limited;if(limited)$('#auFit').checked=false;
  $('#exitBlockerHint').hidden=mode==='any';
  $('#exitBlockerHint').textContent=mode==='waves'?'Theo đợt dùng băng của game để chỉ mở đợt sau khi đợt trước thoát hết. Bộ tạo tự đặt lượt băng; không thêm khóa, bom, cổng hoặc hố.':'Tăng lựa chọn dùng thân giun chặn đường, không thêm băng, khóa, bom, cổng hoặc hố. Đi theo trình tự gợi ý để đúng nhịp.';
 }
 function opened(){
  const id=api.getLevel();if(id!==currentId){currentId=id;$('#exitWorkStatus').textContent='';}
  const design=api.getDesign(),original=api.getMap()?.worms.length||design?.originalWormCount||150;$('#progressiveDifficulty').value=['hard','very-hard'].includes(design?.progressiveDifficulty)?design.progressiveDifficulty:(original>=32?'very-hard':'hard');
  const mode=design?.exitMode;lastMode=modes.has(mode)?mode:'any';$('#exitMode').value=lastMode;if(mode==='waves')unavailable();syncModeControls();refresh();
  setTimeout(()=>window.__cwGame?.prepare(id),250);
 }
 async function execute(kind,{auto=false}={}){
  if(busy||api.isBusy()||!api.getMap())return;
  if($('#exitMode').value==='waves'){$('#exitMode').value=lastMode;unavailable();return;}
  const id=api.getLevel(),ticket=++sequence,mode=$('#exitMode').value;
  const labels={generate:'tạo map',optimize:'tối ưu map',target:'chỉnh tới mục tiêu',harder:'làm khó hơn',easier:'làm dễ hơn'};
  if(mode==='progressive'){labels.optimize='tối ưu độ phức tạp';labels.target='tái thiết kế theo mức Khó/Rất khó';labels.harder='tạo lại ở mức Rất khó';labels.easier='tạo lại ở mức Khó';}
  const label=labels[kind];setBusy(true);report('0% · Đang '+label+'… Có thể bấm Dừng.',true);
  try{
   const generation=api.getGeneration(mode);
   const map=kind==='generate'?generation.map:api.getMap();
   const options={...generation.options,minCoverage:100,autoTune:kind==='generate',mode,iterations:kind==='harder'||kind==='easier'?1500:6000,target:api.getTarget(),seed:generation.options.seed};
   const result=await tasks.run(kind,map,options,progress=>{
    if(ticket!==sequence||!busy)return;
    if(progress.stage==='refine')report(Math.min(99,Math.round(10+80*progress.iteration/progress.total))+'% · Đang biến đổi đầu/thân giun và kiểm chứng độ khó… Có thể bấm Dừng.',true);
    if(progress.stage==='weave')report(Math.min(99,Math.round(5+90*(progress.cells||0)/Math.max(1,progress.area||1)))+'% · Đang đan thân giun và kiểm tra độ khó · bố cục '+(progress.attempt+1)+'… Có thể bấm Dừng.',true);
    if(progress.stage==='adjust')report('0% · Đang kéo dài giun để lấp kín bàn, giữ đúng số giun và nhịp thoát… Có thể bấm Dừng.',true);
    if(progress.stage==='construct')report('0% · Đang dựng bố cục lấp đầy'+(generation.options.count||generation.options.originalCount?' với đúng '+(generation.options.count||generation.options.originalCount)+' giun':'')+' và kiểm chứng đường giải… Có thể bấm Dừng.',true);
   });
   if(ticket!==sequence||api.getLevel()!==id)return;
   if(kind==='generate'&&mode==='progressive'&&result.map.worms.length>150)throw Error('Tăng lựa chọn chỉ hỗ trợ tối đa 150 giun. Map cũ được giữ nguyên.');
   if(result.map.XSize!==map.XSize||result.map.YSize!==map.YSize)throw Error('Kết quả sai kích thước bàn: yêu cầu '+map.XSize+' × '+map.YSize+'. Map cũ được giữ nguyên.');
   const required=kind==='generate'?CWAutoGenerate.resolveCount(generation.map,{...generation.options,mode}).count:mode==='progressive'?api.getMap().worms.length:0;
   if(required&&result.map.worms.length!==required)throw Error('Kết quả không đúng '+required+' giun yêu cầu. Map cũ được giữ nguyên.');
   const unchanged=JSON.stringify(result.map)===JSON.stringify(api.getMap());
   if(result.progressiveDifficulty)$('#progressiveDifficulty').value=result.progressiveDifficulty;
   if(!unchanged)api.replaceMap(result.map,{auto});api.setDesign({...api.getDesign(),exitMode:mode,...(mode==='progressive'?{progressiveDifficulty:$('#progressiveDifficulty').value}:{} )});
   if(result.autoAdjusted&&result.settings){
    const values={auW:result.map.XSize,auH:result.map.YSize,auMin:result.settings.minLen,auMax:result.settings.maxLen,auCount:kind==='generate'?(generation.options.count?result.map.worms.length:0):$('#auCount').value};
    if(mode==='any')for(const[key,value]of Object.entries(result.settings.blockers||{}))values['au'+key[0].toUpperCase()+key.slice(1)]=value;
    for(const[id,value]of Object.entries(values)){const control=$('#'+id),out=$('#'+id+'Out');control.max=String(Math.max(Number(control.max)||0,value));control.value=out.value=String(value);out.max=control.max;}
   }
   let outcome=unchanged?'100% · Đã kiểm tra '+label+': không có thay đổi phù hợp hơn. Map hiện tại được giữ nguyên.':'100% · Đã '+label+': '+result.map.worms.length+' giun · '+result.quality.score+' điểm · '+result.analysis.free.length+' con thoát được ban đầu'+(result.coverage?' · Phủ '+Math.round(result.coverage.percent)+'% bàn':'');
   if(result.autoAdjusted)outcome+=' · Giữ bàn '+result.map.XSize+' × '+result.map.YSize+' và đúng '+result.map.worms.length+' giun · Đã tự cân chỉnh chiều dài '+result.settings.minLen+'–'+result.settings.maxLen+' ô';
   report(outcome+(unchanged?'':'. Bấm Lưu map để cập nhật bản xuất.'));refresh();
   if(!unchanged)setTimeout(()=>window.__cwGame?.prepare(id),0);
  }catch(error){if(ticket===sequence&&api.getLevel()===id)report(error.name==='AbortError'?'ĐÃ DỪNG · Map cũ được giữ nguyên.':'LỖI · '+error.message,error.name!=='AbortError');}
  finally{if(ticket===sequence)setBusy(false);}
 }
 function stop(silent=false){if(!busy)return;sequence++;tasks.stop();setBusy(false);if(!silent)report('ĐÃ DỪNG · Map cũ được giữ nguyên.');}
 $('#auDensePreset').onclick=()=>{for(const[id,value]of [['auMin',2],['auMax',80],['auCount',0],['auCoverage',100]]){$('#'+id).value=value;$('#'+id+'Out').value=value;}api.refreshControls?.();report('Đã đặt chiều dài 2–80 ô, giữ số giun map gốc (nếu có) và lấp kín 100% bàn. Bấm Tự tạo để tạo map; bản đang sửa chưa thay đổi.');};
 for(const id of ['auCoverage','auCoverageOut'])$('#'+id).oninput=()=>{const value=100;$('#auCoverage').value=$('#auCoverageOut').value=value;};
 $('#exitOptimize').onclick=()=>execute('optimize');$('#exitGenerate').onclick=()=>execute('generate');
 $('#exitStop').onclick=$('#mapTaskStop').onclick=()=>stop();
 $('#edSync').onclick=()=>execute('target');$('#edHarder').onclick=()=>execute('harder');$('#edEasier').onclick=()=>execute('easier');$('#edRegen').onclick=()=>execute('generate');
 $('#progressiveDifficulty').onchange=()=>{api.setDesign({...api.getDesign(),progressiveDifficulty:$('#progressiveDifficulty').value});report('Đã chọn '+$('#progressiveDifficulty').selectedOptions[0].textContent+'. Bấm Tự tạo; chỉ nhận map đạt độ phức tạp này.');};
 $('#exitMode').onchange=()=>{if($('#exitMode').value==='waves'){$('#exitMode').value=lastMode;unavailable();return;}lastMode=$('#exitMode').value;api.setDesign({...api.getDesign(),exitMode:lastMode});syncModeControls();api.refreshGenerationControls?.();if(api.refreshBoard)api.refreshBoard();else refresh();report('Đã chọn '+$('#exitMode').selectedOptions[0].textContent+(lastMode==='progressive'?' · Giữ nguyên kích thước bàn và số giun hiện tại; tối đa hỗ trợ 150 giun.':'.')+' Bấm Tự tạo để tạo bố cục mới.');};
 $('#edDlg').addEventListener('close',()=>{stop(true);currentId=null;});
 $('#edDlg').addEventListener('keydown',event=>{if(busy&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopImmediatePropagation();report('0% · Đang chỉnh map… Bấm Dừng trước khi lưu.',true);}},true);
 $('#edSave').onclick=()=>{try{api.saveMap(false);}catch(error){report('LỖI · Không lưu được map: '+error.message,true);}};
 $('#table').addEventListener('click',event=>{const button=event.target.closest('[data-edit-level]');if(button)api.openLevel(Number(button.dataset.editLevel));});
 return{opened,refresh,isBusy:()=>busy,stop:()=>stop(true),generateAuto:()=>execute('generate',{auto:true})};
};
