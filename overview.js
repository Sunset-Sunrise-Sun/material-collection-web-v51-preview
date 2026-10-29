/* Overview layer; report content and audit rows remain authoritative. No chart dependencies. */
(() => {
 'use strict';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let data=null, report=null, helpers=null;
 const fmt=(v,d)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:d??0,maximumFractionDigits:d??0});
 const percent=r=>(r.reportedPercent>0?'+':'')+r.reportedPercent.toFixed(r.precision)+'%';
 function moduleHeader(title,section,label='数据概览') {return `<div class="viz-heading"><div><span class="section-kicker">${label}</span><h5>${esc(title)}</h5></div><a href="#${section.startsWith('s-4-1-')?'original-'+section:section}">对应正文 ↗</a></div>`;}
 function notes(d){return `<div class="chart-reading"><p class="chart-finding"><span>一句话发现</span>${esc(d.finding)}</p><p>${esc(d.explanation)}</p><p class="chart-boundary"><strong>解释边界</strong> ${esc(d.boundary)}</p></div><p class="chart-provenance">${esc(d.sourceLabel||d.source)}</p><details class="chart-source"><summary>数据口径与来源</summary><p>${esc(d.source)}</p>${d.formula?`<p>计算口径：${esc(d.formula)}</p>`:''}</details>`;}
 function original(blocks,label='展开完整原文与报告原图',id='') {
  const figures=blocks.filter(b=>b.type==='image').map(b=>helpers.figure(b)).join('');
  const prose=blocks.filter(b=>b.type!=='image').map(b=>b.type==='paragraph'?helpers.paragraph(b):'').join('');
  const summary=figures?label.replace('与报告原图',''):label;
  return figures+`<details class="full-argument" ${id?`id="${id}"`:''}><summary>${summary}</summary><div class="original-prose">${prose}</div></details>`;
 }
 function missing(section,topic){return helpers.placeholder(section,topic);}
 function mapSlot(){return `<section class="map-integration" aria-label="广州11区交互地图与供给代理"><div><span class="section-kicker">空间视角 / 区级交互（2.5D 地图）</span><p>广州市研究区域与区级供给</p></div><p class="map-reading-note">先在地图选择行政区，再对照同源条形与区详情。可切换8个指标；颜色与高度表达同一个指标。支持滚轮/按钮缩放、拖拽平移、重置；键盘 Enter 选中、Esc 清除。第2章保留<a href="#chapter-2">原报告区位图 ↗</a>。</p><div id="guangzhou-map-slot" data-map-slot="guangzhou" aria-label="广州地图组件"><p class="map-fallback">地图加载中；以下原报告图表与正文可独立阅读。</p></div><p class="map-reading-note">本模块是区级人口结构与供给代理的补充展示，未替代v2正文与原图。地图仅显示区际差异，不据此得出推广优先级或因果结论。地图按交付数据的小数位显示，下方保留原V3数值记录；不以地图新口径重算原报告相关统计。</p><aside class="map-quality" aria-label="地图数据质量与研究边界"><p><strong>阅读前提</strong>：仅区级描述，不代表街镇供需匹配，不推定需求缺口、实际服务能力或AI效果；统计相关不构成因果。</p><ul><li>备案床位为2026-09-23快照，分母为2025年末户籍60+人口，跨年配对；备案床位不等于实际可用床位。</li><li>机构点位、饭堂数量和医疗机构数量不等于服务能力。养老机构有2条区划归属冲突；长者饭堂有2组同址重复记录；基层医疗名录为2023-11，时点较旧。</li><li>边界层为 OpenStreetMap（ODbL 1.0，© OpenStreetMap contributors），已替换原 DataV 层；非官方勘定界线，坐标系按 OSM 的 WGS84 记录；地图审核/审图号尚未取得，本轮仅内部评审/离线候选，不用于精确量测，未发布到正式站点。</li><li>“重点关注区”规则尚未提供，本图不标注；条形保留v2区序，不新增排名。床位密度敏感度指标只作分母口径对照。</li></ul></aside></section>`;}

 function densityChart() {
  if(!data?.density)return missing('4.1.1','区级床位密度交互图');const d=data.density;
  return `<section class="viz-module density-module" aria-label="区级床位代理密度交互图">${moduleHeader(d.title,d.sourceSection)}<p class="chart-unit">${d.year} · ${esc(d.unit)} · 项目组名录床位口径</p><div class="density-axis" aria-hidden="true"><span></span><div><span>0</span><span>20</span><span>40</span><span>60</span><span>80</span></div><span></span></div><div class="density-chart" style="--median:${d.median/80*100}%">${d.rows.map((r,i)=>`<button type="button" class="density-row" data-density="${i}" aria-label="${r.district}区，2025年床位供给代理密度${r.value.toFixed(2)}床每千名户籍60岁及以上人口" aria-describedby="density-detail"><span class="district-label">${r.district}</span><span class="density-track" aria-hidden="true"><span style="width:${r.value/80*100}%"></span></span><strong>${r.value.toFixed(2)}</strong></button>`).join('')}</div><div class="chart-legend"><span class="legend-line"></span>11区中位数 ${d.median.toFixed(2)} <span class="legend-hint">悬停、Tab聚焦或点按条形查看数值</span></div><p class="chart-detail" id="density-detail" role="status">选择一个行政区，查看数值、年份与分母。</p>${notes(d)}</section>`;
 }
 function annualChart(){
  if(!data?.annual)return missing('4.1.3','年度供给变化图');const d=data.annual;
  return `<section class="viz-module annual-module" aria-label="2024至2025年度变化条形图">${moduleHeader(d.title,d.sourceSection)}<p class="chart-unit">${esc(d.unit)} · 仅比较两个年度端点</p><div class="chart-legend"><span class="legend-square positive"></span>增加<span class="legend-square negative"></span>减少<span class="legend-hint">颜色与正负号共同区分方向</span></div><div class="annual-axis" aria-hidden="true"><span></span><div><span>−20%</span><span>0</span><span>+40%</span><span>+100%</span></div><span></span></div><div class="annual-chart">${d.rows.map((r,i)=>{const p=r.reportedPercent,pos=p>=0;return `<button type="button" class="annual-row ${pos?'is-positive':'is-negative'} ${r.group==='人口背景'?'context-row':''}" data-annual="${i}" aria-label="${esc(r.label)}，2024年${r.before}${esc(r.unit)}，2025年${r.after}${esc(r.unit)}，变化${percent(r)}" aria-describedby="annual-detail"><span class="annual-label">${esc(r.label)}${r.group==='人口背景'?'<small>人口背景</small>':''}</span><span class="annual-track" aria-hidden="true"><span style="left:${pos?20/120*100:(20+p)/120*100}%;width:${Math.abs(p)/120*100}%"></span></span><strong>${percent(r)}</strong></button>`}).join('')}</div><p class="chart-detail" id="annual-detail" role="status">悬停、Tab聚焦或点按指标，查看两个年度原值与单位。</p>${notes(d)}<details class="chart-source"><summary>查看年度原值表（含报告变化率）</summary><div class="source-table-scroll" tabindex="0"><table class="source-data-table"><caption>v2报告4.1.3原值；单位按指标分别列示</caption><thead><tr><th>指标</th><th>单位</th><th>2024</th><th>2025</th><th>报告变化率</th></tr></thead><tbody>${d.rows.map(r=>`<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.unit)}</td><td>${fmt(r.before,r.id==='bedDensity'?2:0)}</td><td>${fmt(r.after,r.id==='bedDensity'?2:0)}</td><td>${percent(r)}</td></tr>`).join('')}</tbody></table></div></details></section>`;
 }
 function correlations(){if(!data?.correlations)return missing('4.1.1','相关统计概览');const d=data.correlations;return `<section class="viz-module correlation-module" aria-label="报告相关统计结果">${moduleHeader(d.title,d.sourceSection,'相关统计 / 原报告结果')}<p class="chart-unit">${esc(d.method)} · ${d.n}个行政区 · 原报告结果，未重新计算</p><div class="correlation-list">${d.rows.map(r=>`<div><strong>${esc(r.indicator)}</strong><span>ρ = ${r.rho.toFixed(3)}</span><span>p = ${r.p.toFixed(3)}</span><span>n = ${d.n}</span></div>`).join('')}</div>${notes(d)}${missing('4.1.1','动态散点图 · 待同口径11区完整配对表')}</section>`;}
 function scenarioCards(block){return `<div class="scenario-overview" aria-label="七个场景证据概览"><p class="overview-instruction">先看证据状态，再进入完整审计。卡片与下表读取同一份原始审计数据。</p><div class="scenario-cards">${block.rows.map(r=>{const [id,...name]=r[0].split(' ');return `<a class="scenario-card" data-audit-target="${id}" href="#audit-${id}" aria-label="${id} ${esc(name.join(' '))}：定位并展开原审计行"><div><strong>${id}</strong><span class="decision-tag decision-${r[4][0]}">${esc(r[4])}</span></div><h5>${esc(name.join(' '))}</h5><span class="card-level">${esc(r[1])}</span><p>${esc(r[2]).replace(/\n/g,' ')}</p><span class="card-action">查看证据、缺口与条件 ↗</span></a>`}).join('')}</div></div>`;}

 function comparison(){
  const rows=report.chapters.flatMap(c=>c.blocks).find(b=>b.type==='audit').rows;
  return `<section class="comparison-module" aria-label="S1与S5证据对照">${moduleHeader('同为L3，下一步为何不同？','s-4-2','典型场景 / 证据对照')}<p class="overview-instruction">证据层级说明记录到了哪一步；决策状态仍取决于缺口与验证条件。以下支持判断、缺口、下一步直接复用审计表。</p><div class="comparison-grid">${['S1','S5'].map((id,i)=>{const r=rows.find(x=>x[0].startsWith(id+' '));return `<article class="comparison-column"><div class="comparison-title"><strong>${id}</strong><div><h5>${esc(r[0].slice(3))}</h5><span>${esc(r[1])} · ${esc(r[4])}</span></div></div><dl><dt>当前证据支持</dt><dd>${esc(r[2]).replace(/\n/g,' ')}</dd><dt>为何不等于AI效果已验证</dt><dd class="comparison-boundary">${esc(data?.comparison?.[id]?.why||'现有运行证据不能替代AI与非AI方案的可比效果评价。')}</dd></dl><details class="comparison-extra"><summary>展开缺口与验证条件</summary><dl><dt>仍存缺口</dt><dd>${esc(r[3])}</dd><dt>下一阶段验证条件</dt><dd>${esc(r[5]).replace(/\n/g,' ')}</dd></dl></details><a href="#original-s-4-2-${i+1}">展开${i===0?'4.2.1':'4.2.2'}完整论证 ↓</a></article>`}).join('')}</div></section>`;
 }
 function fieldCards(){
  const blocks=report.chapters[3].blocks;
  return `<section class="field-overview" aria-label="田野观察主题概览"><p class="visible-limit">单点单次、小样本的探索性材料：以下只提炼原报告观察与政策启示，不代表广州老年人总体，不证明因果关系。</p><div class="field-cards">${(data?.fieldThemes||[]).map((t,i)=>{const h=blocks.find(b=>b.number===t.section);return `<a class="field-card" href="#original-${h.id}"><span class="field-index">0${i+1} / ${t.section}</span><h5>${esc(h.text)}</h5><p><small>观察线索</small>${esc(t.observation)}</p><p><small>对应政策启示</small>${esc(t.implication)}</p><span class="card-action">展开完整观察 ↓</span></a>`}).join('')}</div><p class="overview-provenance">摘要依据4.4的四个观察主题及5.2的探索性政策启示；完整观察与论证见下方对应原文。</p></section>`;
 }
 function governance(){return `<section class="governance-module" aria-label="建议的治理流程图">${moduleHeader('以证据约束推进，以监测形成反馈','s-5-3','治理建议 / 尚非已实施成效')}<p class="overview-instruction">依据5.3—5.4整理。箭头表示报告建议的推进、分流与反馈关系，不表示项目已经实施或取得效果。</p><div class="governance-owners"><a href="#s-5-3-1"><strong>责任分工贯穿全程 ↗</strong></a><p>市级民政统筹 · 卫健部门负责医疗类应用合规与评价 · 区级监管</p><p>机构与服务方实施 · 技术供应商保障 · 一线人员支持 · 独立评估方核验</p></div><ol class="governance-stages"><li><a href="#s-5-4-1"><small>01 / 先澄清</small><strong>证据核验</strong><span>统一口径、项目台账与真实需求</span></a></li><li><a href="#s-5-4-2"><small>02 / 条件具备后</small><strong>受控验证</strong><span>明确参照、结局指标与人工备援</span></a></li><li><a href="#s-5-4-3"><small>03 / 可复核评价</small><strong>效果评价</strong><span>核验效果、全生命周期成本与风险</span></a></li></ol><div class="flow-down" aria-hidden="true">↓</div><div class="governance-decision"><a href="#s-5-4-3"><strong>推广决策</strong><span>依据运行与效果证据，决定扩围、限制、整改或退出</span></a></div><svg class="flow-branch" viewBox="0 0 800 35" preserveAspectRatio="none" aria-hidden="true"><path d="M400 0V13H190V34M400 13H610V34" fill="none" stroke="currentColor" stroke-width="1"/><path d="M186 29L190 34L194 29M606 29L610 34L614 29" fill="none" stroke="currentColor"/></svg><div class="governance-outcomes"><a href="#s-5-4-3"><small>效果明确、成本可控、风险可承受</small><strong>有条件扩围与持续监测</strong><span>保留推广条件、责任边界，定期更新证据状态。</span></a><a href="#s-5-3-4"><small>效果不明确、指标不达标或存在安全风险</small><strong>限制、整改、暂停或退出</strong><span>安全风险立即暂停；整改后仍不达标则退出并做好服务接续。</span></a></div><div class="governance-feedback"><span aria-hidden="true">↺</span><p>持续监测与事后评估 → 反馈政策、采购与准入标准 → 更新证据和下一轮决策</p><a href="#s-5-3-4">查看整改退出机制 ↗</a></div><p class="overview-provenance">对应原文：5.3.1责任分工、5.3.3验收、5.3.4整改退出、5.4分阶段路线。三阶段的原时间区间与折叠交互保留在5.4。</p></section>`;}

 function resultSection(h,blocks){
  const n=h.number;const originalId='original-'+h.id;
  if(n==='4.1.1')return `<details class="map-original-record" id="v2-density-record" open><summary>证据核查：展开原V3床位图与原始数值记录</summary>${densityChart()}</details>`+`<p class="visible-limit">原报告三组相关均未达到统计显著水平（n=11），不能作因果解释。动态散点待同口径完整配对表。</p><details class="analysis-disclosure" open><summary>展开相关统计、解释与缺数说明</summary>${correlations()}</details>`+original(blocks,'展开完整原文与报告原图',originalId);
  if(n==='4.1.2')return `<div class="finding-callout"><span class="section-kicker">关键发现 · 按原报告</span><p>越秀、天河落入“高龄化率高、床位密度低”象限。</p><small>区级组合类型只提供结构线索，不能直接推定实际照护需求缺口。</small></div>`+original(blocks,'展开完整原文与报告原图',originalId);
  if(n==='4.1.3')return annualChart()+`<p class="visible-limit">研究边界：上门服务以人次计，不能换算为受益人数；床位结构变化与AI效果应分别判断。</p>`+original(blocks,'展开完整原文与报告原图',originalId);
  if(n.startsWith('4.2.'))return original(blocks,'展开本场景完整原文论证',originalId);
  if(n.startsWith('4.4.'))return original(blocks,'展开本主题完整观察与论证',originalId);
  return blocks.map(b=>b.type==='paragraph'?helpers.paragraph(b):b.type==='image'?helpers.figure(b):'').join('');
 }
 function results(chapter,hp){
  helpers=hp;const bs=chapter.blocks;let out='<div class="result-entry"><p>先看关键发现与图表，按需展开分析，再核查原文与来源。区级供给、场景证据与单次田野分别解释。</p><nav aria-label="研究结果三个层级"><a href="#s-4-1"><small>01</small>空间与供给 ↓</a><a href="#s-4-2"><small>02</small>场景与证据 ↓</a><a href="#s-4-4"><small>03</small>田野观察与治理 ↓</a></nav></div>';
  for(let i=0;i<bs.length;i++){
   const b=bs[i];
   if(b.type==='heading'){
    if(['4.1','4.2','4.4'].includes(b.number))out+=`<div class="result-layer-marker">${{'4.1':'第一层 · 空间与供给','4.2':'第二层 · 场景与证据','4.4':'第三层 · 田野观察与治理'}[b.number]}</div>`;
    out+=helpers.heading(b);
    if(b.number==='4.1')out+=mapSlot();
    if(b.number==='4.2')out+=comparison();
    if(b.level===4){const group=[];while(i+1<bs.length&&bs[i+1].type!=='heading')group.push(bs[++i]);out+=resultSection(b,group);}
   }else if(b.type==='audit')out+=scenarioCards(b)+`<details class="audit-table-disclosure" id="audit-table-disclosure"><summary>展开完整审计表与筛选 · S1—S7</summary>${helpers.audit(b)}</details>`;
   else if(b.type==='paragraph'){out+=helpers.paragraph(b);if(b.sourceIndex===81)out+=fieldCards();}
   else if(b.type==='image')out+=helpers.figure(b);
  }

  out+=`<section class="result-governance-bridge" aria-label="从田野观察进入治理讨论"><div class="evidence-types"><p><strong>研究观察</strong><span>单点单次田野提供探索性线索。</span></p><p><strong>已有证据</strong><span>部署、有限运行与非AI基线各有证明边界。</span></p><p><strong>预期价值</strong><span>效率、响应与可及性的潜力仍有前提。</span></p><p><strong>待验证假设</strong><span>AI增量效果、成本与持续使用需可比评价。</span></p></div><p class="overview-provenance">以上区分对应4.2—4.4与5.5，不把观察或预期价值改写为已验证效果。</p><div class="governance-mini-flow" aria-label="建议的治理过程"><a href="#s-5-4-1">证据核验</a><span aria-hidden="true">→</span><a href="#s-5-4-2">受控验证</a><span aria-hidden="true">→</span><a href="#s-5-4-3">效果评价</a><span aria-hidden="true">→</span><a href="#s-5-4-3">推广决策</a></div><p class="visible-limit">治理过程属于研究建议，尚非已经实施或取得效果的事实。</p><div class="governance-bridge-links"><a href="#s-5-4">查看三阶段实施路线图 ↗</a><a href="#s-5-3">核查责任、权益与整改退出机制 ↗</a></div></section>`;
  return out;
 }
 function activate(){
  const density=document.querySelector('.density-chart');
  const annual=document.querySelector('.annual-chart');
  const select=(container,selector,callback)=>{if(!container)return;for(const event of ['pointerover','focusin','click'])container.addEventListener(event,e=>{const el=e.target.closest(selector);if(el)callback(el);});};
  select(density,'[data-density]',el=>{const r=data.density.rows[Number(el.dataset.density)];document.querySelector('#density-detail').textContent=`${r.district}区 · ${data.density.year}年 · ${r.value.toFixed(2)} ${data.density.unit}；分子为项目组名录床位（代理值）。`;density.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===el));});
  select(annual,'[data-annual]',el=>{const r=data.annual.rows[Number(el.dataset.annual)];document.querySelector('#annual-detail').textContent=`${r.label}：2024年 ${fmt(r.before,r.id==='bedDensity'?2:0)} → 2025年 ${fmt(r.after,r.id==='bedDensity'?2:0)} ${r.unit}；报告变化率 ${percent(r)}。`;annual.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===el));});
  let mapStarted=false,lastView='';
  const mapVisible=()=>{const visible=!document.querySelector('#chapter-4')?.hidden;if(!visible){lastView='';return;}try{if(!mapStarted){window.ResearchMapSlot?.mount(document.querySelector('#guangzhou-map-slot'),{section:'4.1',city:'广州市',scope:'区级供给结构，非街镇供需匹配',baseline:report.sourceSha256,districtOrder:data.density.rows.map(r=>r.district)});mapStarted=true;}else if(lastView!=='chapter-4'){requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));}}catch{}lastView='chapter-4';};
  document.querySelectorAll('#report-content details').forEach(d=>{
   if(d.querySelector('.viz-module,.report-figure,figure,.density-chart,.annual-chart,.correlation-module')) d.open=true;
  });
  document.addEventListener('research:viewchange',mapVisible);mapVisible();
 }
 window.ResearchOverview={configure(r,d){report=r;data=d;},results,activate,governance};
})();
