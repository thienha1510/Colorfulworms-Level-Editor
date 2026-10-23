window.CWEnemySpeedUI=function(api){
 'use strict';
 const $=s=>document.querySelector(s),speed=CWEnemySpeed,slider=$('#enemySpeed'),output=$('#enemySpeedValue');
 const format=value=>value.toLocaleString('vi-VN',{maximumFractionDigits:2});
 function show(multiplier){
  const description=multiplier<=.5?'quái đi rất chậm':multiplier<1?'quái đi chậm':multiplier===1?'quái đi bình thường':multiplier<3?'quái đi nhanh':'quái đi rất nhanh';
  output.textContent='x'+format(multiplier)+' - '+description;
  slider.setAttribute('aria-valuetext',output.textContent);
 }
 function refresh(){const map=api.getMap();if(!map)return;const multiplier=speed.readMap(map);slider.value=String(speed.toSlider(multiplier));show(multiplier);}
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
 return{refresh};
};
