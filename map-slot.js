/* Map integration boundary: the provider owns its module; report code only mounts this slot. */
(() => {
 'use strict';
 let renderer = null, host = null, context = null, cleanup = null, revision = 0;
 const fallback = message => {
  if (!host) return;
  host.replaceChildren();
  const note = document.createElement('p');note.className='map-fallback';note.setAttribute('role','status');
  note.textContent=message;host.append(note);
 };
 async function render() {
  if (!host || !renderer) return;
  const run=++revision;
  if(typeof cleanup==='function') {try{cleanup();}catch{}}cleanup=null;
  const canvas=document.createElement('div');canvas.className='map-provider-canvas';
  host.replaceChildren(canvas);host.setAttribute('aria-busy','true');
  try {
   const result=await renderer({container:canvas,context:Object.freeze({...context})});
   if(run!==revision){if(typeof result==='function')result();return;}
   cleanup=typeof result==='function'?result:null;
  } catch {
   if(run===revision)fallback('地图暂不可用；区级图表、审计与报告正文仍可正常阅读。');
  } finally {if(run===revision&&host)host.setAttribute('aria-busy','false');}
 }
 window.ResearchMapSlot=Object.freeze({
  register(provider){if(typeof provider!=='function')throw new TypeError('地图provider必须是函数');renderer=provider;void render();},
  mount(container,metadata){if(!container)return;host=container;context=metadata;host.dataset.mapSlotVersion='1';if(renderer)void render();},
  unmount(){revision++;if(typeof cleanup==='function'){try{cleanup();}catch{}}cleanup=null;host=null;context=null;}
 });
})();
