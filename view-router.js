/* V3 chapter views. DOM content is mounted once to retain tables, disclosures and map integration. */
(() => {
 'use strict';
 let active='home',applying=false,lastHash='',options={},saveFrame=0,revision=0;
 const panels=()=>[...document.querySelectorAll('.track-section')];
 function hashId(hash){try{return decodeURIComponent((hash||'#home').slice(1));}catch{return 'home';}}
 function save(){if(applying)return;history.replaceState({...history.state,researchViewsV3:true,scrollY:Math.round(window.scrollY)},'',location.href);}
 function resolve(hash){
  options.ensureTarget?.(hash);
  const id=hashId(hash);let target=document.getElementById(id);
  if(id==='main')target=document.getElementById(active);
  const panel=target?.closest('.track-section')||document.getElementById('home');
  return {panel,target:target||panel};
 }
 function apply(hash,{restore=null,focus=true}={}){
  const run=++revision;applying=true;const {panel,target}=resolve(hash);active=panel.id;
  panels().forEach(p=>{p.hidden=p!==panel;p.classList.toggle('active-view',p===panel);});
  document.dispatchEvent(new CustomEvent('research:viewchange',{detail:{view:active}}));
  let p=target;while(p&&p!==panel.parentElement){if(p.tagName==='DETAILS')p.open=true;p=p.parentElement;}
  const root=target===panel;
  const top=restore!==null?restore:root?0:Math.max(0,target.getBoundingClientRect().top+window.scrollY-105);
  window.scrollTo({top,behavior:'instant'});
  document.querySelectorAll('#chapter-nav>a,.top-quick a').forEach(a=>{const current=a.hash==='#'+active;a.classList.toggle('active',current);if(current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const title=active==='home'?'研究总览':active==='references'?'参考文献':panel.querySelector('.chapter-header h2')?.textContent||'研究';
  document.title=title+' · 从场景清单到审慎试点';
  document.querySelector('#current-view-label').textContent=active==='home'?'研究总览':title;
  document.querySelector('#reading-label').textContent=active==='home'?'总览阅读进度':'本页阅读进度';
  const back=document.querySelector('.back-top');back.href='#'+active;back.setAttribute('aria-label','返回本页顶部');
  if(focus){const focusTarget=root?(panel.querySelector('h1,h2')||panel):target;focusTarget.setAttribute('tabindex','-1');focusTarget.focus({preventScroll:true});}
  options.onClose?.();lastHash=location.hash;
  requestAnimationFrame(()=>{if(run!==revision)return;window.scrollTo({top,behavior:'instant'});applying=false;options.onUpdate?.();save();});
 }
 function navigate(hash){
  if(!hash||hash[0]!=='#')return;
  save();if(location.hash!==hash)history.pushState({researchViewsV3:true,scrollY:0},'',hash);
  else history.replaceState({...history.state,scrollY:0},'',location.href);
  apply(hash);
 }
 function init(config={}){
  options=config;history.scrollRestoration='manual';
  const existing=history.state;
  history.replaceState({...existing,researchViewsV3:true,scrollY:existing?.researchViewsV3?existing.scrollY:0},'',location.href);
  document.addEventListener('click',e=>{
   const a=e.target.closest('a[href^="#"]');if(!a||a.hasAttribute('data-audit-target')||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
   e.preventDefault();
   if(a.classList.contains('citation')||a.classList.contains('intro-citation')){
    const destination=document.querySelector(a.hash);const origin=a.closest('[data-source-index]')?.id||a.id||active;
    const back=destination?.querySelector('.reference-back');if(back)back.href='#'+origin;
   }
   navigate(a.hash||'#home');
  },true);
  addEventListener('popstate',e=>{apply(location.hash,{restore:e.state?.researchViewsV3?e.state.scrollY:null});});
  addEventListener('hashchange',()=>{if(location.hash===lastHash)return;history.replaceState({researchViewsV3:true,scrollY:0},'',location.href);apply(location.hash);});
  addEventListener('scroll',()=>{if(applying||saveFrame)return;saveFrame=requestAnimationFrame(()=>{saveFrame=0;save();});},{passive:true});
  addEventListener('pagehide',save);
  apply(location.hash||'#home',{restore:existing?.researchViewsV3?existing.scrollY:null,focus:false});
 }
 window.ResearchRouter=Object.freeze({init,navigate,get active(){return active;}});
})();
