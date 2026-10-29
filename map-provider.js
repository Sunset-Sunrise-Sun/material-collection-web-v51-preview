/* Host adapter for the frozen v1.0.0 map. Vendor script/data remain byte-identical. */
(() => {
 'use strict';
 const resource = name => new URL('assets/maps/' + name, document.baseURI).href;
 let componentLoad;
 function loadComponent() {
  if (customElements.get('gz-district-map')) return Promise.resolve();
  if (!componentLoad) componentLoad = new Promise((resolve, reject) => {
   const script = document.createElement('script');
   const timer = setTimeout(() => {script.remove();reject(new Error('map script timeout'));}, 12000);
   script.src = resource('gz-district-map.js');
   script.onload = () => {clearTimeout(timer);customElements.get('gz-district-map') ? resolve() : reject(new Error('map registration failed'));};
   script.onerror = () => {clearTimeout(timer);reject(new Error('map script unavailable'));};
   document.head.append(script);
  });
  return componentLoad;
 }
 async function json(name, signal) {
  const response = await fetch(resource(name), {signal});
  if (!response.ok) throw new Error('map resource unavailable');
  return response.json();
 }
 const node = (tag, className, text) => {
  const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;
 };
 window.ResearchMapSlot.register(async ({container, context}) => {
  container.dataset.integrationState='loading';
  const loading=node('p','map-fallback','正在载入广州11区地图；报告与其他图表可独立阅读。');container.append(loading);
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
  let metrics,geometry;
  try {[,metrics,geometry]=await Promise.all([loadComponent(),json('district_metrics.json',controller.signal),json('gz_districts_11.geojson',controller.signal)]);}
  finally {clearTimeout(timer);controller.abort();}
  if(metrics.meta?._fixture || metrics.districts?.length!==11 || metrics.metrics?.length!==8 || geometry.features?.length!==11) throw new Error('unexpected map contract');
  const codes=new Set(metrics.districts.map(d=>String(d.adcode)));
  if(codes.size!==11 || geometry.features.some(f=>!codes.has(String(f.properties.adcode)))) throw new Error('district mismatch');
  const map=node('gz-district-map');map.id='guangzhou-district-map';map.setAttribute('aria-label','广州11区人口结构与供给代理交互地图');
  const bars=node('section','gz-linked-bars');bars.setAttribute('aria-label','与地图联动的区级指标条形图');
  const title=node('h5','gz-bars-title');title.id='gz-bars-title';bars.setAttribute('aria-labelledby',title.id);
  const unit=node('p','chart-unit'), order=node('p','gz-order-note','区序沿用v2床位图，切换指标不重新排序；条长仅表示当前指标，不表示推广优先级。');
  const rows=node('div','gz-bar-rows'), status=node('p','chart-detail','点击地图行政区或条形，查看相同指标与区级详情。');status.id='gz-map-selection';status.setAttribute('role','status');
  const source=node('details','chart-source'), summary=node('summary',null,'证据核查：当前指标的口径、来源与限制');
  const sourceBody=node('div','gz-source-body');source.append(summary,sourceBody);
  const boundary = metrics.meta?.boundary || {};
  const attribution = node('p', 'map-attribution', '边界层：© OpenStreetMap contributors（ODbL 1.0）；来源与关系 ID 见指标详情。');
  attribution.id = 'map-boundary-attribution';
  const review = node('p', 'map-review-note', '边界为 OpenStreetMap 社区数据，非官方勘定界线；坐标系按 OSM 的 WGS84 记录；地图审核/审图号未取得，本候选仅供内部评审与离线验收，未发布到正式站点。');
  map.setAttribute('aria-describedby', attribution.id);
  bars.append(title,unit,order,rows,status,source);
  container.replaceChildren(map, attribution, review, bars);
  const orderNames=context.districtOrder || [];
  const districts=[...metrics.districts].sort((a,b)=>orderNames.indexOf(a.name.replace(/区$/,''))-orderNames.indexOf(b.name.replace(/区$/,'')));
  const valueOf=(d,id)=>d.missingMetrics?.includes(id)||!Number.isFinite(d.values[id])?null:d.values[id];
  const currentMetric=()=>metrics.metrics.find(m=>m.id===map.metric);
  const formatted=(d,m)=>{const v=valueOf(d,m.id);return v===null?'缺失':v.toFixed(m.decimals)+' '+m.unit;};
  function selection(code) {
   const m=currentMetric(), district=metrics.districts.find(d=>String(d.adcode)===code);
   rows.querySelectorAll('button').forEach(row=>{const on=row.dataset.adcode===code;row.classList.toggle('selected',on);row.setAttribute('aria-pressed',String(on));});
   status.textContent=district?`${district.name} · ${m.label}：${formatted(district,m)}；${m.years}。${m.qualityNote}`:'点击地图行政区或条形，查看相同指标与区级详情。';
   container.dataset.selected=code || '';
  }
  function renderBars() {
   const m=currentMetric();if(!m)return;
   container.dataset.metric=m.id;
   title.textContent=m.label+' · 地图联动';unit.textContent=m.years+' · '+m.unit;
   const max=Math.max(0,...districts.map(d=>valueOf(d,m.id)).filter(v=>v!==null));
   rows.replaceChildren();
   for(const d of districts) {
    const v=valueOf(d,m.id),button=node('button','density-row gz-linked-row');button.type='button';button.dataset.adcode=String(d.adcode);button.dataset.value=v===null?'missing':String(v);
    button.title=d.name+'：'+(v===null?'缺失（不是0）':String(v)+' '+m.unit)+'；'+m.years;
    button.setAttribute('aria-label',d.name+'，'+m.label+'，'+formatted(d,m));button.setAttribute('aria-describedby',status.id);button.setAttribute('aria-pressed','false');
    const track=node('span','density-track'),fill=node('span');track.setAttribute('aria-hidden','true');fill.style.width=v===null||!max?'0%':(v/max*100)+'%';track.append(fill);
    button.append(node('span','district-label',d.name.replace(/区$/,'')),track,node('strong',null,v===null?'缺失':v.toFixed(m.decimals)));
    button.addEventListener('click',()=>{selection(String(d.adcode));map.select(d.adcode,{source:'api'});});
    button.addEventListener('pointerenter',()=>map.highlight(d.adcode));button.addEventListener('pointerleave',()=>map.highlight(null));
    button.addEventListener('focus',()=>map.highlight(d.adcode));button.addEventListener('blur',()=>map.highlight(null));rows.append(button);
   }
   sourceBody.replaceChildren(...[
    '分子：'+m.numerator,'分母：'+m.denominator,'来源：'+m.source,'解释边界：'+m.qualityNote,
    '边界：'+(boundary.sourceName||'OpenStreetMap contributors')+'；许可：'+(boundary.license||'ODbL 1.0')+'；坐标系：'+(boundary.crs||'WGS84（OSM 声明）'),
    '边界审核：'+(boundary.reviewNote||'地图审核/审图号未取得；非官方勘定界线。')
   ].map(text=>node('p',null,text)));
   selection(map.getState().selected);
  }
  const onSelect=e=>{if(e.detail.source==='map')selection(e.detail.adcode);};
  const onReset=()=>selection(map.getState().selected);
  const onReady=()=>{container.dataset.integrationState='ready';renderBars();};
  map.addEventListener('gzmap:ready',onReady);map.addEventListener('gzmap:select',onSelect);map.addEventListener('gzmap:metricchange',renderBars);map.addEventListener('gzmap:reset',onReset);
  const onHover=e=>rows.querySelectorAll('button').forEach(row=>row.classList.toggle('map-hover',row.dataset.adcode===e.detail.adcode));map.addEventListener('gzmap:hover',onHover);
  map.focusRule=null;
  const desktopLabelOffsets={'440103':[-55,20],'440104':[10,-55],'440105':[45,55],'440106':[55,-20],'440111':[0,-85],'440112':[55,35]};
  const mobileLabelOffsets={'440103':[-70,40],'440104':[-35,-30],'440105':[40,60],'440106':[75,-30],'440111':[0,-110],'440112':[65,45],'440113':[0,25]};
  const applyLabelOffsets=()=>{map.labelOffsets=window.matchMedia('(max-width:560px)').matches?mobileLabelOffsets:desktopLabelOffsets;};
  applyLabelOffsets();
  const onLabelResize=()=>applyLabelOffsets();
  window.addEventListener('resize',onLabelResize);
  map.data=metrics;map.geometry=geometry;map.metric=metrics.meta.defaultMetric;map.heightMode=metrics.meta.defaultHeightMode;
  renderBars();
  return ()=>{
   window.removeEventListener('resize',onLabelResize);map.removeEventListener('gzmap:ready',onReady);map.removeEventListener('gzmap:select',onSelect);map.removeEventListener('gzmap:metricchange',renderBars);map.removeEventListener('gzmap:reset',onReset);map.removeEventListener('gzmap:hover',onHover);map.destroy();
  };
 });
})();


