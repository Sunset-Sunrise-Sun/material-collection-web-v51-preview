'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let report;
const citationFirst = new Map();
function prose(text) {
  return esc(text).replace(/\[(\d+(?:[-–—,，、]\d+)*)\]/g, (match, range) => {
    const first = Number(range.match(/\d+/)[0]);
    if (first < 1 || first > report.references.length) return match;
    const id = citationFirst.has(first) ? '' : ` id="cite-${first}"`;
    if (id) citationFirst.set(first, `cite-${first}`);
    return `<a${id} class="citation" href="#ref-${first}" aria-label="参考文献 ${esc(range)}" title="查看参考文献 ${esc(range)}">${match}</a>`;
  });
}
function paragraph(block) { return `<p id="source-p-${block.sourceIndex}" data-source-index="${block.sourceIndex}">${prose(block.text)}</p>`; }
function heading(block) { return `<h${block.level} id="${block.id}" data-source-index="${block.sourceIndex}"><span class="heading-number">${block.number}</span>${esc(block.text)}</h${block.level}>`; }
const figureMeta = {
 'assets/image1.png': ['原报告第2章另附图：广州11区高龄人口结构与床位密度（探索性）', '此图嵌入于原报告研究区域一节，按原图保留，数据口径待进一步复核。'],
 'assets/image2.png': ['图1 广州市研究区位图', '从 v2 报告原件提取。'],
 'assets/image3.png': ['图 广州11区床位供给代理密度', '原图保留。床位与人口的统计口径按原报告，尚未完成深度复核。'],
 'assets/image4.png': ['图 广州11区高龄人口结构与床位密度气泡图', '原图保留。区级探索性分析不等于街镇级供需匹配。']
};
function figure(block) {
  const [title, note] = figureMeta[block.src] || ['报告原图', '从原件提取'];
  const html = `<figure class="report-figure" data-source-index="${block.sourceIndex}"><button class="figure-button" type="button" data-figure="${esc(block.src)}" data-title="${esc(title)}" aria-label="放大查看：${esc(title)}"><img src="${esc(block.src)}" alt="${esc(title)}" width="${({'assets/image1.png':1267,'assets/image2.png':1265,'assets/image3.png':1269,'assets/image4.png':1122})[block.src]||1200}" height="${({'assets/image1.png':803,'assets/image2.png':958,'assets/image3.png':652,'assets/image4.png':711})[block.src]||800}" loading="lazy" decoding="async"><span>查看原图 ↗</span></button><figcaption>${esc(title)}<br>${esc(note)}</figcaption></figure>`;
  return block.src.endsWith('image1.png') ? `<details class="original-extra" open><summary>原稿在本节另附的探索性散点图（位置待核）</summary>${html}</details>` : html;
}
function placeholder(chapter, topic) {
  return `<div class="figure-placeholder" role="note" data-placeholder="${chapter}"><span class="placeholder-icon" aria-hidden="true">▧</span><div><strong>${esc(topic)}</strong><small>对应章节 ${esc(chapter)} · 后续补图可直接替换此组件；正文按原报告保留。</small></div><span class="placeholder-state">待补充</span></div>`;
}
function framework(blocks, decision) {
  return `<div class="framework-grid ${decision ? 'decision-grid' : ''}" aria-label="${decision ? 'A—D场景决策分类' : 'L1—L3证据成熟度定义'}">${blocks.map(b => `<div class="framework-item" data-source-index="${b.sourceIndex}"><span class="framework-code" aria-hidden="true">${esc(b.text.match(/^(L\d|[A-D])/)[0])}</span><p>${prose(b.text)}</p></div>`).join('')}</div>`;
}
function audit(block) {
 return `<div class="audit-module" data-source-index="${block.sourceIndex}"><div class="audit-intro"><span>按 v2 审计表原始顺序展示 · 可展开查看缺口与条件</span><span id="audit-count" class="audit-count" role="status">显示 7 / 7 个场景</span></div><form class="audit-filters" id="audit-filters" role="search" aria-label="筛选场景审计表"><label>搜索场景或证据<input id="audit-search" type="search" placeholder="例如：认知、告警、成本" autocomplete="off"></label><label>证据层级<select id="level-filter"><option value="">全部层级</option><option value="L2">L2 采购与部署</option><option value="L3">L3 实际运行</option></select></label><label>决策状态<select id="decision-filter"><option value="">全部状态</option><option value="A">A 继续调查</option><option value="B">B 设计验证方案</option><option value="C">C 条件后试点</option><option value="D">D 暂缓判断</option></select></label><button class="reset-filter" type="reset">重置筛选</button></form><div class="audit-table-wrap" tabindex="0" role="region" aria-label="S1至S7场景审计表，窄屏可左右滚动"><table class="audit-table"><caption>表1 场景证据审计汇总表 · 展开行内详情可查看完整的主要缺口与下一阶段条件</caption><thead><tr><th scope="col">应用场景</th><th scope="col">最高层级</th><th scope="col">状态</th><th scope="col">可支持的判断 / 审计详情</th></tr></thead><tbody id="audit-rows"></tbody></table></div><p id="audit-empty" class="audit-empty" hidden>没有符合条件的场景。请更换关键词或重置筛选。</p><div class="boundary-note">表中的“最高层级”描述当前证据状态；L3 不自动证明 AI 效果。S3、S5 包含非 AI 运行基线，须核实人工与 AI 的功能边界。</div></div>`;
}
function timeline(blocks) {
 let html='<div class="timeline" aria-label="三阶段治理路线图">';
 for (let i=0;i<blocks.length;i++) {
  const b=blocks[i];
  if(b.type==='heading') {
   const time = ['0—6个月','6—18个月','18个月以后'][Number(b.number.split('.').at(-1))-1];
   html+=`<details class="timeline-stage" ${i===0?'open':''}><summary><span class="stage-time">${time}</span><h4 id="${b.id}" class="stage-title" data-source-index="${b.sourceIndex}"><small>${b.number} · 实施路线</small>${esc(b.text)}</h4></summary><div class="stage-prose">`;
   while (i+1<blocks.length && blocks[i+1].type!=='heading') {i++;html+=paragraph(blocks[i]);}
   html+='</div></details>';
  }
 }
 return html+'</div>';
}
function renderChapter(chapter) {
 const toc=chapter.blocks.filter(b=>b.type==='heading' && b.level===3);
 let html=`<section hidden class="chapter track-section" id="${chapter.id}" aria-labelledby="${chapter.id}-title"><header class="chapter-header"><span class="chapter-no" aria-hidden="true">0${chapter.number}</span><div><div class="chapter-label">第${chapter.number}章 / RESEARCH</div><h2 id="${chapter.id}-title">${esc(chapter.title)}</h2></div>${toc.length?`<details class="chapter-tools"><summary>本章目录</summary><ul>${toc.map(b=>`<li><a href="#${b.id}">${b.number} ${esc(b.text)}</a></li>`).join('')}</ul></details>`:''}</header><div class="chapter-body">`;
 if(chapter.number===1 && window.ResearchIntroduction) return html+window.ResearchIntroduction.render(chapter,{heading,paragraph})+'</div></section>';
 if(chapter.number===4 && window.ResearchOverview) return html+window.ResearchOverview.results(chapter,{heading,paragraph,figure,audit,prose,placeholder})+'</div></section>';
 if(chapter.number===4) html+='<div class="boundary-note">阅读边界：空间结果来自11区汇总数据；场景审计区分部署、运行与效果；田野结果来自单点单次的小样本观察。以下正文与判断保留原报告表述。</div>';
 const blocks=chapter.blocks;
 for(let i=0;i<blocks.length;i++) {
  const b=blocks[i];
  if(b.type==='heading') {
   html+=heading(b);
   if(b.number==='5.3')html+=window.ResearchOverview?.governance()||'';
   if(b.number==='3.2.1' || b.number==='3.2.2') {
    if(blocks[i+1]?.type==='paragraph'){html+=paragraph(blocks[++i]);}
    const group=[];while(blocks[i+1]?.type==='paragraph' && /^(L[123]：|[A-D]类)/.test(blocks[i+1].text))group.push(blocks[++i]);
    html+=framework(group,b.number==='3.2.2');
   }
   if(b.number==='5.4') {
    const group=[];while(i+1<blocks.length && !(blocks[i+1].type==='heading'&&blocks[i+1].level===3))group.push(blocks[++i]);
    html+=timeline(group);
   }
  }else if(b.type==='paragraph')html+=paragraph(b);
  else if(b.type==='image')html+=figure(b);
  else if(b.type==='audit')html+=audit(b);
  // Original captions are rendered with their images or table, avoiding duplicate captions.
  if(chapter.number===4 && b.sourceIndex===68) html+=placeholder('4.1.3','2024—2025年养老供给结构变化图');
 }

 return html+'</div></section>';
}
function renderAudit() {
 const block=report.chapters.flatMap(c=>c.blocks).find(b=>b.type==='audit');
 const search=$('#audit-search').value.trim().toLocaleLowerCase();
 const level=$('#level-filter').value;const decision=$('#decision-filter').value;
 const openIds=new Set($$('.audit-detail[open]').map(e=>e.dataset.scenario));
 const rows=block.rows.filter(r=>(!search||r.join(' ').toLocaleLowerCase().includes(search))&&(!level||r[1].startsWith(level))&&(!decision||r[4].startsWith(decision)));
 $('#audit-rows').innerHTML=rows.map(r=>{
  const [id,...name]=r[0].split(' '); const level=r[1].slice(0,2);const state=r[4].slice(0,1);
  return `<tr id="audit-${id}" tabindex="-1" data-scenario="${id}"><td data-label="应用场景"><span class="scenario-id">${id}</span><span class="scenario-name">${esc(name.join(' '))}</span></td><td data-label="最高层级"><span class="level-badge">${level}</span>${esc(r[1].slice(3))}</td><td data-label="状态"><span class="decision-badge decision-${state}">${state}</span><br>${esc(r[4].slice(2))}</td><td data-label="可支持的判断">${prose(r[2]).replace(/\n/g,'<br>')}<details class="audit-detail" data-scenario="${id}" ${openIds.has(id)?'open':''}><summary>主要缺口与下一阶段条件</summary><dl><dt>主要缺口</dt><dd>${prose(r[3])}</dd><dt>下一阶段条件</dt><dd>${prose(r[5])}</dd></dl></details></td></tr>`;
 }).join('');
 $('#audit-count').textContent=`显示 ${rows.length} / 7 个场景`;
 $('#audit-empty').hidden=rows.length>0;
}
function closeMenu() {$('#sidebar').classList.remove('open');$('#menu-toggle').setAttribute('aria-expanded','false');$('#nav-scrim').hidden=true;}
function revealTarget() {
 if(!location.hash)return;
 let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
 const target=document.getElementById(id);if(!target)return;
 let parent=target;let revealed=false;
 while(parent){if(parent.tagName==='DETAILS'&&!parent.open){parent.open=true;revealed=true;}parent=parent.parentElement;}
 if(revealed)requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));
}
function updateScroll() {
 const range=document.documentElement.scrollHeight-innerHeight;
 const amount=range>0?Math.round(scrollY/range*100):0;
 $('#progress-bar').style.width=amount+'%';$('#mini-progress').style.width=amount+'%';
 $('.progress-track').setAttribute('aria-valuenow',amount);$('#progress-text').textContent=amount+'%';
 const active=window.ResearchRouter?.active||'home';
 $$('#chapter-nav>a').forEach(a=>{const current=a.hash==='#'+active;a.classList.toggle('active',current);if(current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
}
async function init() {
 const response=await fetch('content.json');if(!response.ok)throw new Error('正文载入失败：'+response.status);
 report=await response.json();
 let visualData=null;try{const v=await fetch('visual-data.json');if(v.ok)visualData=await v.json();}catch{}
 window.ResearchOverview?.configure(report,visualData);
 $('#chapter-nav').insertAdjacentHTML('beforeend',report.chapters.map(c=>`<a href="#${c.id}"><span class="nav-number">0${c.number}</span><span>${esc(c.title)}</span></a>`).join('')+'<a href="#references"><span class="nav-number">文</span><span>参考文献</span></a>');
 $('#report-content').innerHTML=report.chapters.map(renderChapter).join('');
 $('#reference-list').innerHTML=report.references.map((r,i)=>`<li id="ref-${i+1}">${esc(r)}${citationFirst.has(i+1)?` <a class="reference-back" href="#${citationFirst.get(i+1)}" aria-label="返回文献${i+1}首次引用">返回引用 ↑</a>`:''}</li>`).join('');
 $$('.intro-citation').forEach((a,i)=>{a.id='intro-ref-'+i;});
 renderAudit();
 window.ResearchOverview?.activate();
 document.addEventListener('click',e=>{
  const internal=e.target.closest('a[href^="#"]');
  if(internal){const target=document.getElementById(internal.hash.slice(1));if(target?.tagName==='DETAILS')target.open=true;}
  const card=e.target.closest('[data-audit-target]');
  if(card){e.preventDefault();$('#audit-search').value='';$('#level-filter').value='';$('#decision-filter').value='';renderAudit();const row=document.getElementById('audit-'+card.dataset.auditTarget);if(row){row.querySelector('details').open=true;row.classList.add('audit-selected');window.ResearchRouter.navigate('#'+row.id);row.focus({preventScroll:true});}return;}
  const row=e.target.closest('#audit-rows tr');if(row&&!e.target.closest('a,button,summary,details,input,select')){const details=row.querySelector('details');details.open=!details.open;}
 });
 $('#audit-filters').addEventListener('submit',e=>e.preventDefault());
 $('#audit-search').addEventListener('input',renderAudit);$('#level-filter').addEventListener('change',renderAudit);$('#decision-filter').addEventListener('change',renderAudit);
 $('#audit-filters').addEventListener('reset',()=>setTimeout(renderAudit,0));
 $('#menu-toggle').addEventListener('click',()=>{const open=!$('#sidebar').classList.contains('open');$('#sidebar').classList.toggle('open',open);$('#menu-toggle').setAttribute('aria-expanded',String(open));$('#nav-scrim').hidden=!open;});
 $('#nav-scrim').addEventListener('click',closeMenu);
 $('#chapter-nav').addEventListener('click',e=>{if(e.target.closest('a'))closeMenu();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#sidebar').classList.contains('open')){closeMenu();$('#menu-toggle').focus();}});
 document.addEventListener('click',e=>{const button=e.target.closest('[data-figure]');if(!button)return;$('#dialog-image').src=button.dataset.figure;$('#dialog-image').alt=button.dataset.title;$('#figure-dialog-title').textContent=button.dataset.title;$('#dialog-caption').textContent='v2 报告原图 · 按原件保留，数据口径尚未深度复核。';$('#figure-dialog').showModal();});
 $('#close-figure').addEventListener('click',()=>$('#figure-dialog').close());
 $('#figure-dialog').addEventListener('click',e=>{if(e.target===$('#figure-dialog')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
 let ticking=false;addEventListener('scroll',()=>{if(!ticking){requestAnimationFrame(()=>{updateScroll();ticking=false;});ticking=true;}},{passive:true});
 addEventListener('resize',()=>{if(innerWidth>800)closeMenu();updateScroll();});

 document.addEventListener('toggle',()=>requestAnimationFrame(updateScroll),true);
 $$('.report-figure img').forEach(img=>img.addEventListener('load',updateScroll));
 $$('.track-section').forEach((panel,i,panels)=>{if(panel.id==='home')return;panel.insertAdjacentHTML('beforeend',`<nav class="view-pagination" aria-label="章节切换">${i>0?`<a href="#${panels[i-1].id}">← ${i===1?'研究总览':panels[i-1].querySelector('h2')?.textContent||'上一章'}</a>`:'<span></span>'}<a href="#home">返回研究总览</a>${i<panels.length-1?`<a href="#${panels[i+1].id}">${panels[i+1].querySelector('h2')?.textContent||'下一章'} →</a>`:'<span></span>'}</nav>`);});
 window.ResearchRouter.init({onUpdate:updateScroll,onClose:closeMenu,ensureTarget(hash){if(hash.startsWith('#audit-S')&&!document.getElementById(hash.slice(1))){$('#audit-search').value='';$('#level-filter').value='';$('#decision-filter').value='';renderAudit();}}});
}
init().catch(error=>{console.error(error);$('#report-content').innerHTML='<div class="error-panel"><p>正文暂时无法载入。请通过本地 HTTP 服务打开网页，或重新载入。</p><button type="button" id="reload-page">重新载入</button></div>';$('#reload-page').addEventListener('click',()=>location.reload());});
