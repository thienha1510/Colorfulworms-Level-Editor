/* Match the native sand board to the editor map, including shared zoom/pan transforms. */
(function(root){
 'use strict';
 function bounds(width,height,cell=35){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<2||height<2||width>80||height>80)return null;
  const padding=cell*1.25;return{width:width*cell+padding*2,height:height*cell+padding*2,padding};
 }
 function apply(controller,cc){
  if(!controller?.view||!cc?.UITransform)return false;
  const size=bounds(controller.nowX,controller.nowY,controller.off||35),view=controller.view,board=view['bgArea/bg3'];
  if(!size||!board)return false;
  const transform=board.getComponent(cc.UITransform);if(!transform)return false;
  transform.setContentSize(size.width,size.height);board.setPosition(0,0,0);board.setScale(1,1,1);board.active=true;
  // The native ring/hole is disabled for editor tests; its prefab decoration
  // otherwise remains in the middle of arbitrary-sized maps.
  for(const path of ['bgArea/bg3/dongkou','bgArea/bg3/cj3/zj'])if(view[path])view[path].active=false;
  const inner=view['bgArea/bg3/cj3'];
  if(inner){const widget=cc.Widget&&inner.getComponent(cc.Widget);widget?.updateAlignment();}
  const height=controller.node.getComponent(cc.UITransform)?.height||1334;
  const scale=.99*Math.min(700/size.width,Math.max(200,height-450)/size.height);
  for(const key of ['area','roleArea','handArea','itemArea','xunHuanArea','bgArea'])if(view[key])view[key].setScale(scale,scale,1);
  if(view.area)view.area.scale2=scale;
  if(view['bgArea/bg2'])view['bgArea/bg2'].setScale(1/scale,1/scale,1);
  controller.baseScale=scale;controller.nowScale=1;
  return true;
 }
 const api={bounds,apply};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CWPlaytestLayout=api;
})(typeof globalThis!=='undefined'?globalThis:window);
