window.CWEnemySpeedUI=function(api){
 'use strict';
 const $=s=>document.querySelector(s),speed=CWEnemySpeed,slider=$('#enemySpeed'),output=$('#enemySpeedValue'),minus=$('#enemySpeedMinus'),plus=$('#enemySpeedPlus');
 const format=value=>String(Number(value.toFixed(2)));
 function show(multiplier){
  const description=multiplier<=.5?'quái đi rất chậm':multiplier<1?'quái đi chậm':multiplier===1?'quái đi bình thường':multiplier<3?'quái đi nhanh':'quái đi rất nhanh';
  output.textContent='x'+format(multiplier)+' - '+description;
  slider.setAttribute('aria-valuetext',output.textContent);
 }
 function refresh(){const map=api.getMap();if(!map)return;const multiplier=speed.readMap(map);slider.value=String(speed.toSlider(multiplier));show(multiplier);minus.disabled=multiplier<=speed.MIN;plus.disabled=multiplier>=speed.MAX;}
 function commit(value){
  if(api.isBusy()){refresh();return;}
  try{
   const map=api.getMap();if(!map)return;
   const multiplier=speed.fromSlider(value);
   if(Math.abs(speed.readMap(map)-multiplier)<1e-12){refresh();return;}
   api.pushUndo();speed.setMap(map,multiplier);api.changed();refresh();
   api.status('Đã đặt tốc độ quái ×'+format(multiplier)+'. Bấm Lưu map để cập nhật bản xuất.');
   api.prepare?.();
  }catch(error){api.status('LỖI · '+error.message,true);refresh();}
 }
 slider.oninput=()=>{try{show(speed.fromSlider(Number(slider.value)));}catch(error){api.status(error.message,true);}};
 slider.onchange=()=>commit(Number(slider.value));
 minus.onclick=()=>{const map=api.getMap();if(map)commit(Math.max(speed.MIN,(Math.ceil(speed.readMap(map)/speed.STEP)-1)*speed.STEP));};
 plus.onclick=()=>{const map=api.getMap();if(map)commit(Math.min(speed.MAX,(Math.floor(speed.readMap(map)/speed.STEP)+1)*speed.STEP));};
 return{refresh};
};
