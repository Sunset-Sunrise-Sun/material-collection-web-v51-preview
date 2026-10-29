/*!
 * gz-district-map.js — 广州市 11 区养老供给结构 2.5D 交互地图组件
 * 版本：1.0.0（2026-10-28）
 *
 * 单文件、零依赖、无网络请求；Shadow DOM 封装全部样式。
 * 用法：
 *   <script src="src/gz-district-map.js"></script>
 *   <gz-district-map id="gzmap"></gz-district-map>
 *   <script>
 *     const el = document.getElementById('gzmap');
 *     el.data = metricsJson;      // 必填：data/district_metrics.json
 *     el.geometry = geojson;      // 必填：data/gz_districts_11.geojson
 *   </script>
 *
 * 也可用便捷挂载：window.mountGuangzhouDistrictMap(container, options)
 *
 * 契约依据：docs/内部规格_组件契约.md（冻结契约 v1.0）
 * 数据边界：仅区级；供给密度为代理指标；缺失一律显示“缺失”，不以 0 代替。
 */
(function (global) {
  'use strict';

  var TAG = 'gz-district-map';
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* 防重复定义：脚本被重复加载时直接返回。 */
  if (global.__GZ_DISTRICT_MAP_LOADED__) { return; }
  global.__GZ_DISTRICT_MAP_LOADED__ = true;

  /* =====================================================================
   * 1. 常量与配色
   * ===================================================================== */

  var VIEW_BUDGET = 1000;          // 基准 viewBox 高度（用户单位），挤出高度以此为准
  var PAD_LR = 36;                 // 左右留白（≥32）
  var PAD_TOP = 34;                // 上留白（≥32）
  var PAD_BOTTOM = 34;             // 下留白基数（实际再叠加最大挤出高度）
  var H_MIN = 2;                   // metric 模式最小挤出高度
  var H_MAX = 34;                  // metric 模式最大挤出高度
  var H_FLAT = 6;                  // flat 模式统一厚度
  var ZOOM_MIN = 1;
  var ZOOM_MAX = 6;
  var WHEEL_NOTCH = 1.12;          // 每档滚轮缩放倍率（契约 1.08–1.2）
  var HOVER_LIFT = 6;              // 悬停上浮（5–7）
  var LABEL_PX = 11;               // 标签在屏幕上的目标字号（px），实际用户单位按渲染比例反算
  var PAN_KEEP = 0.75;             // 内容至少保留 75% 在可视区内

  /* 每指标单色相顺序色带（浅 → 深，6 站线性插值）；不用红绿对立色。 */
  var METRIC_RAMPS = {
    bedDensity:           ['#eef5fc', '#cfe3f5', '#a7cbea', '#77aedb', '#4a8dc6', '#1f5f97'], // 蓝
    elderly80Share:       ['#f4f0fb', '#e0d5f3', '#c6b2e8', '#a98bd9', '#8a63c4', '#6a3fa6'], // 紫
    elderly60Share:       ['#ecf7f8', '#cfe9ec', '#a8d5da', '#7bbcc5', '#4b9daa', '#1f7683'], // 青
    elderly65Share:       ['#eef1fa', '#d5dcf1', '#b5c0e4', '#909dd3', '#6b78bd', '#48549e'], // 靛
    mealDensity:          ['#fdf4ea', '#fae3c9', '#f4c99d', '#eda96b', '#e0863c', '#b96217'], // 橙
    institutionDensity:   ['#eef7f1', '#d3ecda', '#aedcbc', '#82c798', '#56ad73', '#2f8750'], // 绿
    primaryCareDensity:   ['#f8f2ea', '#eadcc8', '#d9c0a0', '#c4a077', '#a97f4f', '#80592f'], // 赭
    bedDensitySensitivity:['#fbeef4', '#f3d5e3', '#e6adc7', '#d67ea5', '#bf5183', '#99335f']  // 玫
  };
  var FALLBACK_RAMP = ['#f1f4f8', '#d9e1ea', '#bcc8d6', '#99a9bd', '#74889f', '#4d6178'];

  /* 指标附加标签（敏感性指标 = 口径对照，不与主指标混用排名） */
  var METRIC_TAG = { sensitivity: '口径对照' };

  /* 标签默认偏移（单位：字号的 em；宿主 labelOffsets 以 SVG 用户单位覆盖）。
     18–21 单位字号下 11 个区名互不重叠，仅中心 4 个小区向空侧错开，并用虚线引线指回质心。 */
  var DEFAULT_LABEL_OFFSETS = {
    '440103': [-1.6, 0.8],    // 荔湾区：向西南空侧
    '440104': [-1.1, -1.5],   // 越秀区：向西北（白云南缘，加引线）
    '440105': [0.8, 0.4],     // 海珠区：向东南（本区岛体内）
    '440106': [0, -0.6],      // 天河区：略上移，避开东侧深色柱体
    '440112': [0.25, 0]       // 黄埔区：略东移，与天河区标签留出间距
  };

  /* 契约要求的固定免责表述 */
  var FOOT_MAIN = '仅区级数据；供给密度为代理指标，不代表服务需求、服务能力或供需匹配程度。边界非官方勘定界线，仅作示意。';
  var FOOT_FOCUS_OFF = '重点关注区规则未配置，本图不标注。';

  var FONT_STACK = 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';

  /* =====================================================================
   * 2. 工具函数
   * ===================================================================== */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }
  function round2(v) { return Math.round(v * 100) / 100; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbToHex(r, g, b) {
    var f = function (v) { return ('0' + clamp(Math.round(v), 0, 255).toString(16)).slice(-2); };
    return '#' + f(r) + f(g) + f(b);
  }

  /* 两色线性插值，t ∈ [0,1] */
  function mixColor(a, b, t) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
  }

  /* 加深（侧面描边用），amount 为与黑色混合的比例 */
  function darken(hex, amount) { return mixColor(hex, '#000000', amount); }
  /* 提亮（悬停时顶面提亮用），amount 为与白色混合的比例 */
  function lighten(hex, amount) { return mixColor(hex, '#ffffff', amount); }

  /* RGB ↔ HSL（仅用于生成“同色相、更暗”的侧面颜色，避免浅色指标被压成灰色） */
  function rgbToHsl(r, g, b) {
    var rn = r / 255, gn = g / 255, bn = b / 255;
    var max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    var l = (max + min) / 2;
    var d = max - min;
    var h = 0, s = 0;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn) { h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; }
      else if (max === gn) { h = ((bn - rn) / d + 2) / 6; }
      else { h = ((rn - gn) / d + 4) / 6; }
    }
    return [h, s, l];
  }

  function hslToHex(h, s, l) {
    function hue2rgb(p, q, t) {
      if (t < 0) { t += 1; }
      if (t > 1) { t -= 1; }
      if (t < 1 / 6) { return p + (q - p) * 6 * t; }
      if (t < 1 / 2) { return q; }
      if (t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
      return p;
    }
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return rgbToHex(r * 255, g * 255, b * 255);
  }

  /* 侧面颜色：保持色相与饱和度，把明度压到 0.62 倍（下限 0.16）。
     浅色端（如 #eef5fc）因此仍是同色相的中蓝，而不是灰。 */
  function shadeSide(hex) {
    var c = hexToRgb(hex);
    var hsl = rgbToHsl(c[0], c[1], c[2]);
    var l = clamp(hsl[2] * 0.62, 0.16, 0.86);
    var s = clamp(hsl[1] * 1.06, 0, 1);
    return hslToHex(hsl[0], s, l);
  }

  /* WCAG 相对亮度，用于标签文字配色决策 */
  function relLuminance(hex) {
    var c = hexToRgb(hex);
    var lin = c.map(function (v) {
      var s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  /* 顺序色带取色：t ∈ [0,1] */
  function rampColor(ramp, t) {
    var x = clamp(t, 0, 1) * (ramp.length - 1);
    var i = Math.min(Math.floor(x), ramp.length - 2);
    return mixColor(ramp[i], ramp[i + 1], x - i);
  }

  /* 指标数值格式化：按 metric.decimals，缺失返回 null（绝不返回 0） */
  function fmtValue(value, decimals) {
    if (!isFiniteNum(value)) { return null; }
    var d = isFiniteNum(decimals) ? decimals : 1;
    return value.toFixed(d);
  }

  /* 整数千分位 */
  function fmtCount(v) {
    if (!isFiniteNum(v)) { return null; }
    try { return v.toLocaleString('zh-CN'); } catch (e) { return String(v); }
  }

  function svgEl(name, attrs) {
    var node = document.createElementNS(SVGNS, name);
    if (attrs) { for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) { node.setAttribute(k, attrs[k]); } } }
    return node;
  }

  /* 射线法判断点是否在（多环）面内，用于给标签挑选“实际背景色” */
  function pointInRings(x, y, rings) {
    var inside = false;
    for (var r = 0; r < rings.length; r++) {
      var pts = rings[r];
      var n = pts.length;
      for (var i = 0, j = n - 1; i < n; j = i++) {
        var xi = pts[i][0], yi = pts[i][1];
        var xj = pts[j][0], yj = pts[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
    }
    return inside;
  }

  function medianOf(arr) {    if (!arr.length) { return null; }
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* 读取某区的某项指标：values 为 null 或 missingMetrics 命中 → 缺失（null） */
  function readMetric(district, metricId) {
    if (!district || !district.values) { return null; }
    if (district.missingMetrics && district.missingMetrics.indexOf(metricId) >= 0) { return null; }
    var v = district.values[metricId];
    return isFiniteNum(v) ? v : null;
  }

  /* =====================================================================
   * 3. 样式（Shadow DOM 内，全部以 .gz 作用域隔离）
   * ===================================================================== */

  var CSS = [
    ':host{display:block;position:relative;',
    'font-family:' + FONT_STACK + ';',
    'color:#1b2430;font-size:13px;line-height:1.5;',
    '--gz-line:#d3dae3;--gz-ink:#1b2430;--gz-muted:#5b6675;--gz-accent:#1f5f97;--gz-accent-ink:#0f3f66;',
    '--gz-accent-soft:#eaf2fa;--gz-warn-bg:#fff7e6;--gz-warn-line:#e9c07a;--gz-warn-ink:#7a4a06;}',
    ':host([hidden]){display:none}',
    '*,*::before,*::after{box-sizing:border-box}',
    '.gz{display:block}',
    'h2,h3,h4,p,ul{margin:0}',
    'ul{padding-left:1.1em}',
    'code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em;background:#f2f5f9;padding:0 3px;border-radius:3px}',

    /* ---- 头部 ---- */
    '.head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px 16px;flex-wrap:wrap}',
    '.title{font-size:16px;font-weight:700;letter-spacing:.2px}',
    '.subtitle{margin-top:2px;font-size:11.5px;color:var(--gz-muted)}',
    '.head-ctl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.seg{display:inline-flex;border:1px solid var(--gz-line);border-radius:999px;overflow:hidden;background:#fff}',
    '.seg-btn{appearance:none;border:0;background:transparent;color:#41505f;font:inherit;font-size:12px;',
    'min-height:32px;padding:0 12px;cursor:pointer;white-space:nowrap}',
    '.seg-btn[aria-pressed="true"]{background:var(--gz-accent-soft);color:var(--gz-accent-ink);font-weight:700;box-shadow:inset 0 -3px 0 var(--gz-accent)}',
    '.btn{appearance:none;font:inherit;font-size:12px;min-height:32px;padding:0 12px;border-radius:999px;',
    'border:1px solid var(--gz-line);background:#fff;color:#31414f;cursor:pointer;white-space:nowrap}',
    '.btn:hover{background:#f4f7fb;border-color:#b9c5d3}',
    'button:focus-visible,.pill:focus-visible,.zbtn:focus-visible,.more-toggle:focus-visible{outline:2px solid var(--gz-accent);outline-offset:2px}',

    /* ---- 指标胶囊 ---- */
    '.metricbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}',
    '.pills{display:flex;flex-wrap:wrap;gap:6px;min-width:0}',
    '.pills[hidden]{display:none}',
    '.pill{appearance:none;font:inherit;font-size:12.5px;min-height:32px;padding:0 11px;border-radius:999px;',
    'border:1px solid var(--gz-line);background:#fff;color:#31414f;cursor:pointer;white-space:nowrap;',
    'flex:0 0 auto;display:inline-flex;align-items:center;gap:5px}',
    '.pill:hover{background:#f4f7fb;border-color:#b9c5d3}',
    '.pill[aria-pressed="true"]{border-color:var(--gz-accent);background:var(--gz-accent-soft);color:var(--gz-accent-ink);',
    'font-weight:700;box-shadow:inset 0 -3px 0 var(--gz-accent)}',
    '.pill-tag{font-size:10px;font-weight:600;line-height:1;padding:2px 4px;border-radius:4px;',
    'background:#eef1f5;color:#4c5866;border:1px solid #dbe1e8}',
    '.pill[aria-pressed="true"] .pill-tag{background:#fff;color:var(--gz-accent-ink);border-color:#bcd3e6}',
    '.more-toggle{background:#f7f9fc}',
    '.more-toggle[aria-expanded="true"]{background:#eef2f7}',

    /* ---- 提示条 ---- */
    '.fixture{margin-top:10px;padding:8px 10px;border-radius:8px;font-size:12.5px;font-weight:600;',
    'background:#fdecec;border:1px solid #e9a3a3;color:#8a2020}',
    '.alert{margin-top:8px;padding:8px 10px;border-radius:8px;font-size:12.5px;',
    'background:var(--gz-warn-bg);border:1px solid var(--gz-warn-line);color:var(--gz-warn-ink)}',
    '[hidden]{display:none!important}',

    /* ---- 主体布局 ---- */
    '.main{display:grid;grid-template-columns:minmax(0,62fr) minmax(0,38fr);gap:14px;margin-top:12px;align-items:start}',
    '.mapside{min-width:0}',
    '.sidecol{display:flex;flex-direction:column;gap:10px;min-width:0}',

    /* ---- 地图 ---- */
    '.mapwrap{position:relative;background:#f6f8fb;border:1px solid var(--gz-line);border-radius:10px;',
    'overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.mapwrap.is-size-lg{height:clamp(400px,62vh,580px)}',
    '.map{display:block;width:100%;height:100%;font-family:' + FONT_STACK + ';',
    'cursor:grab;outline:none;background:transparent}',
    '.map.is-grabbing{cursor:grabbing}',
    '.map:focus-visible{outline:2px solid var(--gz-accent);outline-offset:-2px}',
    '.wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
    'font-size:12.5px;color:var(--gz-muted);background:#f6f8fb;padding:16px;text-align:center}',

    /* ---- SVG 图元 ---- */
    '.district{cursor:pointer;transform-box:view-box;transition:transform .14s ease-out}',
    '.district:hover,.district.is-highlight{transform:translateY(-' + HOVER_LIFT + 'px)}',
    '.district .top{stroke-linejoin:round;stroke-width:.9;transition:stroke .15s ease}',
    '.district .side{stroke-linejoin:round;stroke-width:.5}',
    '.district:hover .top{stroke-width:1.7}',
    /* 悬停/外部高亮：顶面提亮（同色相提亮，不引入第二个变量） */
    '.district:hover .top,.district.is-highlight .top{fill:var(--gz-top-hover,#ffffff)}',
    '.district.is-missing:hover .top,.district.is-missing.is-highlight .top{fill:url(#gz-hatch)}',
    '.district.is-missing .top{stroke:#5a6472!important;stroke-dasharray:4 3;stroke-width:1.1}',
    '.district:focus{outline:none}',
    '.lbl{font-size:var(--gz-lbl-size,17px);font-weight:700;text-anchor:middle;dominant-baseline:central;',
    'paint-order:stroke;stroke-linejoin:round;stroke-width:3.2;pointer-events:none}',
    '.lead{stroke:#8a97a6;stroke-width:.8;stroke-dasharray:2 3;pointer-events:none}',
    '.sel-outline{fill:none;stroke:#0b2a4a;stroke-width:2.8;stroke-linejoin:round;pointer-events:none;',
    'filter:url(#gz-sel-glow)}',
    '.foc-outline{fill:none;stroke:#b45309;stroke-width:2.6;stroke-dasharray:7 4;stroke-linejoin:round;pointer-events:none}',

    /* ---- 缩放按钮 ---- */
    '.zoom{position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:6px;z-index:2}',
    '.zbtn{appearance:none;width:34px;height:34px;border-radius:8px;border:1px solid #c3ccd8;background:#fffffff2;',
    'color:#22303d;font:inherit;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;',
    'justify-content:center;box-shadow:0 1px 3px #1b243014}',
    '.zbtn:hover{background:#fff;border-color:#a9b6c5}',
    '.mapcap{position:absolute;left:8px;bottom:8px;z-index:2;font-size:10.5px;color:#6b7887;',
    'background:#ffffffcc;border-radius:6px;padding:3px 6px;pointer-events:none}',

    /* ---- tooltip ---- */
    '.tip{position:fixed;z-index:2147483000;left:0;top:0;max-width:240px;padding:7px 9px;border-radius:7px;',
    'background:#101a26eb;color:#fff;font-size:12px;line-height:1.45;pointer-events:none;',
    'box-shadow:0 6px 20px #0b1a2a33;transform:translate(-9999px,-9999px)}',
    '.tip-name{font-weight:700;font-size:12.5px}',
    '.tip-val{font-weight:700;font-size:13px;margin-top:1px}',
    '.tip-unit{font-weight:400;opacity:.82;font-size:11.5px;margin-left:4px}',
    '.tip-miss{font-weight:700;color:#ffd9a8}',
    '.tip-hint{margin-top:3px;opacity:.72;font-size:11px}',

    /* ---- 图例 ---- */
    '.legend{border:1px solid var(--gz-line);border-radius:10px;background:#fff;padding:10px 12px;font-size:12px}',
    '.leg-head{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}',
    '.leg-name{font-weight:700;font-size:12.5px}',
    '.leg-tag{font-size:10px;font-weight:600;padding:2px 4px;border-radius:4px;background:#eef1f5;',
    'color:#4c5866;border:1px solid #dbe1e8}',
    '.leg-meta{margin-top:2px;color:var(--gz-muted);font-size:11.5px}',
    '.bandrow{display:flex;align-items:center;gap:6px;margin-top:8px}',
    '.band{position:relative;flex:1 1 auto;height:11px;border-radius:3px;border:1px solid #00000014}',
    '.band-med{position:absolute;top:-3px;width:2px;height:17px;background:#22303d;border-radius:1px}',
    '.band-cap{position:absolute;top:-3px;width:0;height:17px;border-left:2px solid #5b6675;transform:translateX(-1px)}',
    '.leg-tick{font-variant-numeric:tabular-nums;color:#31414f;font-size:11px;min-width:2.2em}',
    '.leg-tick.r{text-align:right}',
    '.leg-sub{margin-top:2px;font-size:10.5px;color:var(--gz-muted)}',
    '.leg-h{margin-top:6px;font-size:11.5px;color:#31414f}',
    '.leg-miss{margin-top:6px;display:flex;align-items:center;gap:6px;font-size:11.5px;color:#31414f}',
    '.sw-miss{flex:0 0 auto;width:22px;height:11px;border-radius:3px;border:1px dashed #5a6472;',
    'background:repeating-linear-gradient(45deg,#cfd6df 0 3px,#8b95a3 3px 5px)}',
    '.leg-src{margin-top:6px;font-size:11px;color:var(--gz-muted);border-top:1px dashed #e2e8ef;padding-top:6px}',
    '.leg-q{margin-top:3px;font-size:10.5px;color:#6b4d1f;background:#fdf8ee;border:1px solid #f0e3c8;',
    'border-radius:6px;padding:5px 7px}',

    /* ---- 详情面板 ---- */
    '.panel{border:1px solid var(--gz-line);border-radius:10px;background:#fff;padding:12px;font-size:12.5px;min-width:0}',
    '.panel h3{font-size:13.5px;font-weight:700;margin-bottom:4px}',
    '.panel h4{font-size:12px;font-weight:700;color:#31414f;margin:12px 0 5px;',
    'padding-bottom:3px;border-bottom:1px solid #eef2f7}',
    '.guide{color:#31414f;margin-bottom:2px}',
    '.kbd{display:inline-block;font-size:10.5px;padding:1px 4px;border:1px solid #ccd5df;border-bottom-width:2px;',
    'border-radius:4px;background:#f7f9fc;color:#31414f}',
    '.sel-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}',
    '.sel-head .code{font-size:11px;color:var(--gz-muted);font-variant-numeric:tabular-nums}',
    '.badge-focus{font-size:10.5px;font-weight:700;padding:2px 6px;border-radius:5px;',
    'background:#eef2f7;color:#26374a;border:1px solid #c3ccd8}',
    '.bigval{display:flex;align-items:baseline;gap:6px;margin-top:8px}',
    '.bigval .num{font-size:26px;font-weight:700;letter-spacing:-.4px;font-variant-numeric:tabular-nums;color:#122b45}',
    '.bigval .unit{font-size:11.5px;color:var(--gz-muted)}',
    '.bigval .num.is-missing{font-size:18px;color:#8a2020}',
    '.valyears{font-size:11.5px;color:var(--gz-muted);margin-top:1px}',
    '.tbl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;font-size:12px}',
    '.tbl .k{color:#31414f;min-width:0}',
    '.tbl .v{text-align:right;font-variant-numeric:tabular-nums;color:#122b45;white-space:nowrap}',
    '.tbl .v.miss{color:#8a2020;font-weight:600}',
    '.tbl .v .u{color:var(--gz-muted);font-size:10.5px;margin-left:3px}',
    '.row-tag{font-size:9.5px;padding:1px 4px;border-radius:3px;background:#eef1f5;color:#4c5866;',
    'border:1px solid #dbe1e8;margin-left:4px;white-space:nowrap}',
    '.hint{font-size:10.5px;color:var(--gz-muted);margin-top:4px}',
    '.flaglist{font-size:11.5px;color:#4a3a1d;background:#fdf9f1;border:1px solid #f0e6d2;',
    'border-radius:6px;padding:6px 8px 6px 20px}',
    '.flaglist li{margin:1px 0}',
    '.okline{font-size:11.5px;color:var(--gz-muted)}',
    '.metric-why{font-size:11.5px;color:#31414f;margin-top:4px}',
    '.metric-why dt{font-weight:700;color:#4a5867;font-size:10.5px;margin-top:4px}',
    '.metric-why dd{margin:0}',
    '.foot{margin-top:10px;padding-top:8px;border-top:1px solid #e6ebf1;font-size:11px;color:var(--gz-muted);line-height:1.6}',
    '.foot .foot-focus{color:#8a5a12}',

    /* ---- 无障碍播报区 ---- */
    '.live{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;',
    'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}',

    /* ---- < 900px：单栏 ---- */
    '@media (max-width:899px){',
    '.main{grid-template-columns:minmax(0,1fr);gap:10px}',
    '.mapwrap.is-size-lg{height:clamp(320px,50vh,440px)}',
    '.legend{font-size:12px}',
    '.head-ctl{gap:6px}',
    '.foot{font-size:10.5px}',
    '}',
    '@media (max-width:599px){',
    '.title{font-size:15px}',
    '.metricbar{gap:6px}',
    '.pills{flex-wrap:wrap;overflow:visible;padding-bottom:0;',
    '-webkit-overflow-scrolling:touch;scrollbar-width:thin}',
    '.pills::-webkit-scrollbar{height:4px}',
    '.pills::-webkit-scrollbar-thumb{background:#c9d3de;border-radius:2px}',
    '.zbtn{width:38px;height:38px}',
    '.zoom{gap:6px;right:6px;bottom:6px}',
    '.seg-btn,.btn,.pill{min-height:36px}',
    '.bigval .num{font-size:23px}',
    '}',
    '@media (prefers-reduced-motion:reduce){',
    '.district{transition:none}',
    '}'
  ].join('');

  /* =====================================================================
   * 4. 组件类
   * ===================================================================== */

  var GzDistrictMap = class GzDistrictMap extends HTMLElement {
    static get observedAttributes() { return ['metric', 'height-mode']; }

    constructor() {
      super();
      this._destroyed = false;
      this._data = null;
      this._geometry = null;
      this._requestedMetric = null;
      this._metricId = null;
      this._heightMode = 'metric';
      this._focusRule = null;
      this._labelOffsets = null;

      this._geo = null;
      this._geoSource = null;
      this._records = [];              // [{adcode,name,data,rings,topD,label:[x,y],maxSy,el,sideEl,topEl,labelEl,leadEl}]
      this._recByCode = Object.create(null);
      this._metrics = [];
      this._metricById = Object.create(null);
      this._stats = { min: null, max: null, median: null, missing: 0, values: [] };
      this._selected = null;
      this._hovered = null;
      this._focusCode = null;
      this._focusCodes = [];
      this._focusReasons = Object.create(null);
      this._vb = [0, 0, 1000, 1000];
      this._vmScale = 1;
      this._readyFired = false;
      this._raf = 0;
      this._vcTimer = 0;
      this._pointers = new Map();
      this._pan = null;
      this._pinch = null;
      this._pinchUsed = false;
      this._downInfo = null;
      this._lastPanEnd = 0;
      this._suppressClickUntil = 0;
      this._renderPending = false;
      this._renderTimer = 0;
      this._ro = null;

      this.attachShadow({ mode: 'open' });
      this._buildSkeleton();
      this._bindEvents();
    }

    /* ---------------- 生命周期 ---------------- */

    connectedCallback() {
      this._scheduleRender();
      this._observeSize();
    }

    disconnectedCallback() {
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
    }

    attributeChangedCallback(name, oldV, newV) {
      if (oldV === newV) { return; }
      if (name === 'metric') { this.setMetric(newV || ''); }
      else if (name === 'height-mode') { this.setHeightMode(newV || ''); }
    }

    /* ---------------- 公共属性 ---------------- */

    get data() { return this._data; }
    set data(v) {
      this._data = v && typeof v === 'object' ? v : null;
      this._metrics = (this._data && Array.isArray(this._data.metrics)) ? this._data.metrics : [];
      this._metricById = Object.create(null);
      for (var i = 0; i < this._metrics.length; i++) { this._metricById[this._metrics[i].id] = this._metrics[i]; }
      this._scheduleRender();
    }

    get geometry() { return this._geometry; }
    set geometry(v) {
      this._geometry = v && typeof v === 'object' && Array.isArray(v.features) ? v : null;
      this._scheduleRender();
    }

    get metric() { return this._metricId; }
    set metric(v) {
      if (v == null || v === '') { this._requestedMetric = null; this._scheduleRender(); return; }
      this.setMetric(String(v));
    }

    get heightMode() { return this._heightMode; }
    set heightMode(v) { this.setHeightMode(String(v)); }

    get focusRule() { return this._focusRule; }
    set focusRule(fn) {
      this._focusRule = typeof fn === 'function' ? fn : null;
      /* 规则变化立即反映到 getState()/徽标/页脚（不依赖异步渲染时机），
         便于宿主注入规则后同步读取状态。 */
      if (this._geo && this._records && this._records.length) {
        this._updateFocus();
        this._renderPanel();
      } else {
        this._scheduleRender();
      }
    }

    get labelOffsets() { return this._labelOffsets; }
    set labelOffsets(obj) {
      this._labelOffsets = (obj && typeof obj === 'object') ? obj : null;
      if (this._geo) { this._applyLabelPositions(); }
    }

    /* ---------------- 公共方法 ---------------- */

    setMetric(id) {
      if (this._destroyed) { return this; }
      if (!this._metricById[id]) {
        if (id) { console.warn('[gz-district-map] 未知指标 id，已忽略：' + id); }
        return this;
      }
      if (this._metricId === id) { return this; }
      this._requestedMetric = id;
      this._metricId = id;
      this._applyMetric();
      var m = this._metricById[id];
      this._dispatch('gzmap:metricchange', { metricId: id, metric: m });
      return this;
    }

    setHeightMode(mode) {
      if (this._destroyed) { return this; }
      if (mode !== 'metric' && mode !== 'flat') {
        console.warn('[gz-district-map] heightMode 只接受 "metric" | "flat"，已忽略：' + mode);
        return this;
      }
      if (this._heightMode === mode) { return this; }
      this._heightMode = mode;
      this._applyMetric();
      return this;
    }

    select(adcode, opts) {
      if (this._destroyed) { return this; }
      if (!this._metricById[this._metricId]) { return this; }
      var source = (opts && opts.source) || 'api';
      var code = adcode == null ? null : String(adcode);
      if (code !== null && !this._recByCode[code]) {
        console.warn('[gz-district-map] 未知 adcode，已忽略：' + code);
        return this;
      }
      if (this._selected === code) { return this; }
      this._selected = code;
      this._updateSelectionUi();
      var rec = code ? this._recByCode[code] : null;
      var v = rec ? readMetric(rec.data, this._metricId) : null;
      this._dispatch('gzmap:select', {
        adcode: code,
        name: rec ? rec.name : null,
        metricId: this._metricId,
        value: v,
        source: source
      });
      if (rec) {
        var fv = fmtValue(v, this._metricById[this._metricId].decimals);
        this._announce(fv === null
          ? '已选中' + rec.name + '，当前指标数据缺失（无数据，非 0）'
          : '已选中' + rec.name + '，' + this._metricById[this._metricId].label + ' ' + fv + ' ' + (this._metricById[this._metricId].unit || ''));
      } else {
        this._announce('已清空选中');
      }
      return this;
    }

    highlight(adcode) {
      if (this._destroyed) { return this; }
      var code = adcode == null ? null : String(adcode);
      if (code !== null && !this._recByCode[code]) { return this; }
      if (this._hovered === code) { return this; }
      if (this._hovered && this._recByCode[this._hovered]) {
        this._recByCode[this._hovered].el.classList.remove('is-highlight');
      }
      this._hovered = code;
      if (code) { this._recByCode[code].el.classList.add('is-highlight'); }
      return this;
    }

    resetView() {
      if (this._destroyed) { return this; }
      var had = !!this._selected;
      var prev = this._selected;
      this._selected = null;
      if (this._geo) { this._setViewBox(this._geo.baseViewBox.slice(), { force: true }); }
      this._updateSelectionUi();
      if (prev) { this._dispatch('gzmap:select', { adcode: null, name: null, metricId: this._metricId, value: null, source: 'api' }); }
      this._dispatch('gzmap:reset', { metricId: this._metricId, clearedSelection: had });
      this._announce('已恢复默认视图' + (had ? '并清空选中' : ''));
      return this;
    }

    resetAll() {
      if (this._destroyed) { return this; }
      var defMetric = (this._data && this._data.meta && this._data.meta.defaultMetric) || (this._metrics[0] && this._metrics[0].id);
      var defHeight = (this._data && this._data.meta && this._data.meta.defaultHeightMode) || 'metric';
      var changedMetric = false;
      if (defMetric && this._metricById[defMetric] && this._metricId !== defMetric) {
        this._requestedMetric = defMetric;
        this._metricId = defMetric;
        changedMetric = true;
      }
      if (defHeight === 'flat' || defHeight === 'metric') { this._heightMode = defHeight; }
      var had = !!this._selected;
      this._selected = null;
      if (this._geo) { this._setViewBox(this._geo.baseViewBox.slice(), { force: true }); }
      this._applyMetric();
      this._updateSelectionUi();
      if (changedMetric) {
        this._dispatch('gzmap:metricchange', { metricId: this._metricId, metric: this._metricById[this._metricId] });
      }
      this._dispatch('gzmap:reset', { metricId: this._metricId, clearedSelection: had });
      this._announce('已重置为默认指标、默认高度与默认视图');
      return this;
    }

    focusDistrict(adcode) {
      if (this._destroyed) { return this; }
      var code = String(adcode);
      var rec = this._recByCode[code];
      if (!rec) { console.warn('[gz-district-map] focusDistrict 未知 adcode：' + code); return this; }
      this._setRovingFocus(code);
      this._ensureVisible(code);
      try { rec.el.focus({ preventScroll: false }); } catch (e) { rec.el.focus(); }
      return this;
    }

    getState() {
      return {
        metricId: this._metricId,
        heightMode: this._heightMode,
        selected: this._selected,
        viewBox: this._vb.slice(0, 4).map(round2),
        focusDistricts: this._focusCodes.slice(),
        missingCount: this._stats.missing
      };
    }

    destroy() {
      if (this._destroyed) { return; }
      this._destroyed = true;
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
      if (this._renderTimer) { clearTimeout(this._renderTimer); this._renderTimer = 0; }
      if (this._vcTimer) { clearTimeout(this._vcTimer); this._vcTimer = 0; }
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      this._pointers.clear();
      try { this.shadowRoot.innerHTML = ''; } catch (e) { /* 忽略 */ }
    }

    /* ---------------- DOM 骨架 ---------------- */

    _buildSkeleton() {
      var root = this.shadowRoot;
      var html = '' +
        '<style>' + CSS + '</style>' +
        '<div class="gz" part="root">' +
        '  <div class="head">' +
        '    <div class="head-txt">' +
        '      <h2 class="title" id="gz-title">广州市 11 区养老供给结构（区级）</h2>' +
        '      <p class="subtitle" id="gz-subtitle">数据：2025 户籍人口 / 2026-09 养老机构名录</p>' +
        '    </div>' +
        '    <div class="head-ctl">' +
        '      <div class="seg" role="group" aria-label="2.5D 高度模式">' +
        '        <button type="button" class="seg-btn" data-hmode="metric" aria-pressed="true" aria-label="2.5D 高度按指标值">2.5D 高度：按指标</button>' +
        '        <button type="button" class="seg-btn" data-hmode="flat" aria-pressed="false" aria-label="2.5D 高度统一厚度，不表示指标">统一</button>' +
        '      </div>' +
        '      <button type="button" class="btn" data-act="reset-view" aria-label="重置视图：恢复默认缩放并清空选中">重置视图</button>' +
        '    </div>' +
        '  </div>' +
        '  <div class="metricbar" role="group" aria-label="指标选择">' +
        '    <div class="pills" id="gz-pills-primary"></div>' +
        '    <div class="pills" id="gz-pills-more" hidden></div>' +
        '    <button type="button" class="pill more-toggle" id="gz-more" aria-expanded="false" aria-controls="gz-pills-more">更多指标</button>' +
        '  </div>' +
        '  <div class="fixture" id="gz-fixture" hidden></div>' +
        '  <div class="alert" id="gz-alert" hidden></div>' +
        '  <div class="main">' +
        '    <div class="mapside">' +
        '      <div class="mapwrap is-size-lg" id="gz-mapwrap">' +
        '        <svg class="map" id="gz-svg" viewBox="0 0 712 1000" preserveAspectRatio="xMidYMid meet" ' +
        '             role="group" aria-labelledby="gz-title" aria-describedby="gz-svg-desc" tabindex="-1">' +
        '          <desc id="gz-svg-desc">广州市 11 个市辖区的 2.5D 挤出地图。每个区可聚焦，按 Enter 选中。</desc>' +
        '          <defs id="gz-defs"></defs>' +
        '          <g id="gz-gmap"></g>' +
        '          <g id="gz-goverlay"></g>' +
        '          <g id="gz-glabels"></g>' +
        '        </svg>' +
        '        <div class="wait" id="gz-wait">等待数据（需同时设置 .data 与 .geometry）</div>' +
        '        <div class="zoom" role="group" aria-label="缩放控制">' +
        '          <button type="button" class="zbtn" data-act="zoom-in" aria-label="放大">＋</button>' +
        '          <button type="button" class="zbtn" data-act="zoom-out" aria-label="缩小">－</button>' +
        '          <button type="button" class="zbtn" data-act="zoom-reset" aria-label="恢复默认缩放比例">⟲</button>' +
        '        </div>' +
        '        <div class="mapcap" aria-hidden="true">无底图 · 边界仅示意</div>' +
        '        <div class="tip" id="gz-tip" hidden></div>' +
        '      </div>' +
        '    </div>' +
        '    <div class="sidecol">' +
        '      <div class="legend" id="gz-legend"></div>' +
        '      <aside class="panel" id="gz-panel" aria-label="区详情面板"></aside>' +
        '    </div>' +
        '  </div>' +
        '  <div class="live" id="gz-live" aria-live="polite"></div>' +
        '  <p class="foot" id="gz-foot"></p>' +
        '</div>';
      root.innerHTML = html;

      var q = function (sel) { return root.querySelector(sel); };
      this._mapwrap = q('#gz-mapwrap');
      this._svg = q('#gz-svg');
      this._defs = q('#gz-defs');
      this._gmap = q('#gz-gmap');
      this._glabels = q('#gz-glabels');
      this._goverlay = q('#gz-goverlay');
      this._tip = q('#gz-tip');
      this._wait = q('#gz-wait');
      this._legend = q('#gz-legend');
      this._panel = q('#gz-panel');
      this._alert = q('#gz-alert');
      this._fixtureBar = q('#gz-fixture');
      this._foot = q('#gz-foot');
      this._live = q('#gz-live');
      this._pillsPrimary = q('#gz-pills-primary');
      this._pillsMore = q('#gz-pills-more');
      this._moreBtn = q('#gz-more');
      this._segBtns = root.querySelectorAll('.seg-btn');
      this._resetBtn = q('[data-act="reset-view"]');
      this._zoomBtns = root.querySelectorAll('.zbtn');
      this._titleEl = q('#gz-title');
      this._subtitleEl = q('#gz-subtitle');
      this._selOutline = svgEl('path', { class: 'sel-outline', d: '' });
      this._focOutline = svgEl('path', { class: 'foc-outline', d: '' });
      this._goverlay.appendChild(this._selOutline);
      this._goverlay.appendChild(this._focOutline);
      this._buildDefs();
    }

    _buildDefs() {
      var defs = this._defs;
      /* 缺失值斜线底纹 */
      var pat = svgEl('pattern', { id: 'gz-hatch', patternUnits: 'userSpaceOnUse', width: 7, height: 7, patternTransform: 'rotate(45)' });
      pat.appendChild(svgEl('rect', { width: 7, height: 7, fill: '#eef1f5' }));
      pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#8b95a3', 'stroke-width': 2.2 }));
      defs.appendChild(pat);
      /* 选中外发光 */
      var f = svgEl('filter', { id: 'gz-sel-glow', x: '-25%', y: '-25%', width: '150%', height: '150%' });
      var ds = svgEl('feDropShadow', { dx: 0, dy: 0, stdDeviation: 4.5, 'flood-color': '#0b2a4a', 'flood-opacity': .55 });
      f.appendChild(ds);
      defs.appendChild(f);
    }

    /* ---------------- 事件绑定 ---------------- */

    _bindEvents() {
      var self = this;
      var root = this.shadowRoot;
      var svg = this._svg;

      /* 高度模式 / 重置 / 更多指标 / 缩放 */
      root.querySelectorAll('.seg-btn').forEach(function (b) {
        b.addEventListener('click', function () { self.setHeightMode(b.getAttribute('data-hmode')); });
      });
      this._resetBtn.addEventListener('click', function () { self.resetView(); });
      this._moreBtn.addEventListener('click', function () { self._toggleMore(); });
      this._zoomBtns.forEach(function (b) {
        b.addEventListener('click', function () {
          var act = b.getAttribute('data-act');
          if (act === 'zoom-in') { self._zoomAtPoint(1.5, null); }
          else if (act === 'zoom-out') { self._zoomAtPoint(1 / 1.5, null); }
          else { self.resetView(); }
        });
      });

      /* 指针：拖动平移 / 双指捏合 / 悬停 */
      svg.addEventListener('pointerdown', function (e) { self._onPointerDown(e); });
      svg.addEventListener('pointermove', function (e) { self._onPointerMove(e); });
      svg.addEventListener('pointerup', function (e) { self._onPointerUp(e); });
      svg.addEventListener('pointercancel', function (e) { self._onPointerUp(e); });
      svg.addEventListener('pointerleave', function (e) { self._onPointerLeave(e); });
      svg.addEventListener('wheel', function (e) { self._onWheel(e); }, { passive: false });
      svg.addEventListener('dblclick', function (e) { self._zoomAtPoint(1.6, e); });
      svg.addEventListener('click', function (e) { self._onClick(e); });
      svg.addEventListener('keydown', function (e) { self._onKeyDown(e); });
      /* 焦点描边：SVG 元素的 focus 事件不冒泡，用捕获阶段监听确保能收到 */
      svg.addEventListener('focus', function (e) {
        var g = e.target && e.target.closest ? e.target.closest('.district') : null;
        if (g) { self._showFocusOutline(g.getAttribute('data-adcode')); }
      }, true);
      svg.addEventListener('blur', function () {
        self._showFocusOutline(null);
      }, true);
      svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      /* 整块组件的 Esc：清空选中并聚焦地图 */
      this.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          var had = !!self._selected;
          self._selected = null;
          self._updateSelectionUi();
          if (had) {
            self._dispatch('gzmap:select', { adcode: null, name: null, metricId: self._metricId, value: null, source: 'map' });
          }
          self._announce('已清空选中');
          try { self._svg.focus({ preventScroll: true }); } catch (err) { self._svg.focus(); }
        }
      });
    }

    _observeSize() {
      if (this._ro || typeof ResizeObserver === 'undefined') { return; }
      var self = this;
      var lastW = 0, lastH = 0;
      this._ro = new ResizeObserver(function (entries) {
        if (self._destroyed) { return; }
        var box = entries && entries[0] && entries[0].contentRect;
        var w = box ? Math.round(box.width) : 0;
        var h = box ? Math.round(box.height) : 0;
        if (w === lastW && h === lastH) { return; }
        lastW = w; lastH = h;
        /* viewBox 为几何用户单位，与容器像素尺寸解耦；容器尺寸变化时，未缩放视图对齐基准，
           已缩放视图保持（preserveAspectRatio 自适应），并重排标签字号/引线、收起 tooltip。 */
        if (!self._geo) { return; }
        if (self._vmScale <= 1.0001) { self._setViewBox(self._geo.baseViewBox.slice(), { silent: true }); }
        self._applyLabelPositions();
        self._hideTip();
      });
      this._ro.observe(this._mapwrap);
    }

    /* ---------------- 渲染调度 ---------------- */

    /* 渲染调度：优先下一帧；同时挂 60ms 兜底定时器，避免个别环境（后台标签页、
       无头模式的帧循环暂停）下 rAF 不送达导致渲染永久挂起。run 幂等。 */
    _scheduleRender() {
      if (this._destroyed || this._renderPending) { return; }
      this._renderPending = true;
      var self = this;
      var done = false;
      var run = function () {
        if (done || self._destroyed) { return; }
        done = true;
        self._renderPending = false;
        if (self._raf) { cancelAnimationFrame(self._raf); self._raf = 0; }
        if (self._renderTimer) { clearTimeout(self._renderTimer); self._renderTimer = 0; }
        self._render();
      };
      if (typeof requestAnimationFrame === 'function' && !document.hidden) {
        this._raf = requestAnimationFrame(run);
      }
      this._renderTimer = setTimeout(run, 60);
    }

    _render() {
      if (this._destroyed) { return; }
      var data = this._data;
      var geo = this._geometry;

      if (!data || !Array.isArray(data.districts) || !data.metrics || !geo) {
        this._wait.hidden = false;
        return;
      }
      this._wait.hidden = true;

      /* 标题 / 副标题（可被 meta 覆盖） */
      var city = (data.meta && data.meta.city) || '广州市';
      this._titleEl.textContent = city + ' 11 区养老供给结构（区级）';
      var gen = (data.meta && data.meta.generatedAt) ? String(data.meta.generatedAt).slice(0, 10) : '';
      this._subtitleEl.textContent = '数据：2025 户籍人口 / 2026-09 养老机构名录' + (gen ? '（数据构建 ' + gen + '）' : '');

      /* 指标解析（未知则回落到 meta.defaultMetric / 首个指标） */
      this._resolveMetricId();

      /* 几何（首次或几何对象变化时才重建） */
      if (this._geoSource !== geo) {
        this._geoSource = geo;
        this._geo = this._buildGeo(geo);
        this._buildDistrictDom();
        this._setViewBox(this._geo.baseViewBox.slice(), { force: true, silent: true });
      }
      if (!this._geo) { this._wait.hidden = false; return; }

      /* 记录表：数据侧 11 区与几何侧按 adcode 对齐 */
      this._records = [];
      this._recByCode = Object.create(null);
      for (var i = 0; i < this._geo.districts.length; i++) {
        var gr = this._geo.districts[i];
        var d = null;
        for (var j = 0; j < data.districts.length; j++) {
          if (String(data.districts[j].adcode) === gr.adcode) { d = data.districts[j]; break; }
        }
        var rec = {
          adcode: gr.adcode,
          name: gr.name,
          data: d,
          rings: gr.rings,
          topD: gr.topD,
          label: gr.label,
          maxSy: gr.maxSy,
          el: gr.el, sideEl: gr.sideEl, topEl: gr.topEl, labelEl: gr.labelEl, leadEl: gr.leadEl,
          lastH: null
        };
        this._records.push(rec);
        this._recByCode[gr.adcode] = rec;
      }
      this._applyLabelPositions();
      this._updateFixtureBar();
      this._applyMetric();
      this._buildNeighbors();
      /* 键盘 Tab 落点：保持上次焦点区，否则回落到数据第一区 */
      var focusCode = (this._focusCode && this._recByCode[this._focusCode]) ? this._focusCode : this._records[0].adcode;
      this._setRovingFocus(focusCode, true);

      if (!this._readyFired) {
        this._readyFired = true;
        this._dispatch('gzmap:ready', { districtCount: this._records.length, metricId: this._metricId });
      }
    }

    _resolveMetricId() {
      var ids = this._metrics.map(function (m) { return m.id; });
      var candidate = this._requestedMetric || (this._data && this._data.meta && this._data.meta.defaultMetric) || ids[0];
      if (ids.indexOf(candidate) < 0) {
        if (this._requestedMetric) { console.warn('[gz-district-map] 未知指标 id，回落默认：' + this._requestedMetric); }
        candidate = (this._data && this._data.meta && ids.indexOf(this._data.meta.defaultMetric) >= 0)
          ? this._data.meta.defaultMetric : ids[0];
      }
      this._metricId = candidate;
      var hm = (this._data && this._data.meta && this._data.meta.defaultHeightMode);
      if (!this._heightModeSet && (hm === 'flat' || hm === 'metric')) { this._heightMode = hm; }
      this._heightModeSet = true;
    }

    /* ---------------- 几何 / 投影 ---------------- */

    _buildGeo(geo) {
      var self = this;
      var feats = (geo.features || []).filter(function (f) {
        return f && f.geometry && f.geometry.type && f.geometry.coordinates && f.properties && f.properties.adcode != null;
      });

      /* 均值纬度（局部等距圆柱投影：x ∝ lng·cos(meanLat), y ∝ -lat） */
      var sumLat = 0, nLat = 0;
      feats.forEach(function (f) {
        f.geometry.coordinates.forEach(function (poly) {
          (poly || []).forEach(function (ring) {
            (ring || []).forEach(function (pt) { sumLat += pt[1]; nLat++; });
          });
        });
      });
      var meanLat = nLat ? sumLat / nLat : 23.13;
      var kx = Math.cos(meanLat * Math.PI / 180);
      var proj = function (lng, lat) { return [lng * kx, -lat]; };

      /* 原始包围盒 */
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      var rawRings = [];
      feats.forEach(function (f) {
        var rings = [];
        f.geometry.coordinates.forEach(function (poly) {
          (poly || []).forEach(function (ring) {
            var pts = [];
            for (var i = 0; i < ring.length; i++) {
              var p = proj(ring[i][0], ring[i][1]);
              if (i === ring.length - 1 && ring.length > 3) { break; }  /* 去掉闭合重复点 */
              pts.push(p);
              if (p[0] < minX) { minX = p[0]; }
              if (p[0] > maxX) { maxX = p[0]; }
              if (p[1] < minY) { minY = p[1]; }
              if (p[1] > maxY) { maxY = p[1]; }
            }
            if (pts.length >= 3) { rings.push(pts); }
          });
        });
        rawRings.push({ f: f, rings: rings });
      });

      var rawW = maxX - minX, rawH = maxY - minY;
      var padL = PAD_LR, padR = PAD_LR, padT = PAD_TOP, padB = PAD_BOTTOM + H_MAX;
      var s = Math.min((VIEW_BUDGET - padL - padR) / rawW, (VIEW_BUDGET - padT - padB) / rawH);
      var vw = rawW * s + padL + padR;
      var vh = rawH * s + padT + padB;

      var districts = rawRings.map(function (item) {
        var f = item.f, pr = f.properties;
        var rings = item.rings.map(function (pts) {
          return pts.map(function (p) { return [round2(padL + (p[0] - minX) * s), round2(padT + (p[1] - minY) * s)]; });
        });
        /* 顶面 path */
        var dParts = [];
        rings.forEach(function (pts) {
          var d = 'M' + pts[0][0] + ',' + pts[0][1];
          for (var i = 1; i < pts.length; i++) { d += 'L' + pts[i][0] + ',' + pts[i][1]; }
          dParts.push(d + 'Z');
        });
        /* 标签锚点：properties.centroid（缺省 center → 包围盒中心） */
        var anchor = pr.centroid || pr.center;
        var label;
        if (anchor && isFiniteNum(anchor[0]) && isFiniteNum(anchor[1])) {
          var ap = proj(anchor[0], anchor[1]);
          label = [round2(padL + (ap[0] - minX) * s), round2(padT + (ap[1] - minY) * s)];
        } else {
          var xs = [], ys = [];
          rings.forEach(function (pts) { pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
          label = [round2((Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2),
                   round2((Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2)];
        }
        var maxSy = 0;
        rings.forEach(function (pts) { pts.forEach(function (p) { if (p[1] > maxSy) { maxSy = p[1]; } }); });

        return {
          adcode: String(pr.adcode),
          name: pr.name || String(pr.adcode),
          rings: rings,
          topD: dParts.join(' '),
          label: label,
          maxSy: maxSy,
          el: null, sideEl: null, topEl: null, labelEl: null, leadEl: null
        };
      });

      /* 绘制顺序：按最大 y 升序（北 → 南），近处压远处 */
      var drawOrder = districts.slice().sort(function (a, b) { return a.maxSy - b.maxSy; });

      return {
        baseViewBox: [0, 0, round2(vw), round2(vh)],
        districts: districts,
        drawOrder: drawOrder.map(function (d) { return d.adcode; }),
        scale: s
      };
    }

    _buildDistrictDom() {
      var self = this;
      var geo = this._geo;
      this._gmap.textContent = '';
      this._glabels.textContent = '';

      var byCode = Object.create(null);
      geo.districts.forEach(function (d) { byCode[d.adcode] = d; });

      geo.drawOrder.forEach(function (code) {
        var d = byCode[code];
        var g = svgEl('g', {
          class: 'district',
          'data-adcode': d.adcode,
          'data-name': d.name,
          role: 'button',
          tabindex: '-1',
          'aria-pressed': 'false'
        });
        var side = svgEl('path', { class: 'side', d: '', 'aria-hidden': 'true' });
        var top = svgEl('path', { class: 'top', d: d.topD, 'aria-hidden': 'true' });
        g.appendChild(side);
        g.appendChild(top);
        self._gmap.appendChild(g);
        d.el = g; d.sideEl = side; d.topEl = top;
      });

      /* 标签层（最后绘制，不参与点击） */
      geo.districts.forEach(function (d) {
        var lead = svgEl('line', { class: 'lead', x1: d.label[0], y1: d.label[1], x2: d.label[0], y2: d.label[1], visibility: 'hidden' });
        var t = svgEl('text', { class: 'lbl', x: d.label[0], y: d.label[1] });
        t.textContent = d.name;
        self._glabels.appendChild(lead);
        self._glabels.appendChild(t);
        d.leadEl = lead; d.labelEl = t;
      });

      /* 首个区作为 Tab 落点（roving tabindex） */
      if (geo.districts.length) { this._setRovingFocus(geo.districts[0].adcode, true); }
    }

    /* 标签布局：字号按实际渲染比例自适应（屏幕上约 11px），偏移按字号等比缩放。
       这样桌面/移动端都能读到 11 个区名，且中心 4 个小区靠 offsets + 引线错开。 */
    _effScale() {
      if (!this._geo) { return 0.55; }
      var base = this._geo.baseViewBox;
      var w = this._mapwrap.clientWidth || 0;
      var h = this._mapwrap.clientHeight || 0;
      if (w <= 2 || h <= 2) { return 0.55; }
      return Math.min(w / base[2], h / base[3]);
    }

    _applyLabelPositions() {
      if (!this._geo) { return; }
      var scale = this._effScale();
      var fs = round2(clamp(LABEL_PX / scale, 14, 30));   /* 屏幕字号 ≈ LABEL_PX，用户单位随比例反算 */
      this._labelFont = fs;
      this._svg.style.setProperty('--gz-lbl-size', fs + 'px');
      var halo = round2(Math.max(2.4, fs * 0.17));
      var user = this._labelOffsets || null;

      this._geo.districts.forEach(function (d) {
        var dx = 0, dy = 0;
        if (user && user[d.adcode]) {
          dx = Number(user[d.adcode][0]) || 0;
          dy = Number(user[d.adcode][1]) || 0;
        } else if (DEFAULT_LABEL_OFFSETS[d.adcode]) {
          dx = DEFAULT_LABEL_OFFSETS[d.adcode][0] * fs;
          dy = DEFAULT_LABEL_OFFSETS[d.adcode][1] * fs;
        }
        var lx = round2(d.label[0] + dx);
        var ly = round2(d.label[1] + dy);
        if (!d.labelEl) { return; }
        d.labelEl.setAttribute('x', lx);
        d.labelEl.setAttribute('y', ly);
        d.labelEl.setAttribute('stroke-width', halo);
        var needLead = Math.sqrt(dx * dx + dy * dy) > fs * 1.0;
        d.leadEl.setAttribute('x1', d.label[0]);
        d.leadEl.setAttribute('y1', d.label[1]);
        d.leadEl.setAttribute('x2', lx);
        d.leadEl.setAttribute('y2', ly);
        d.leadEl.setAttribute('visibility', needLead ? 'visible' : 'hidden');
      });
      this._applyLabelColors();
    }

    /* 标签文字配色按“标签实际压在哪个区/是否落在空白处”决定，保证深底白字、浅底深字 */
    _applyLabelColors() {
      if (!this._geo) { return; }
      var self = this;
      this._records.forEach(function (rec) {
        if (!rec.labelEl) { return; }
        var lx = Number(rec.labelEl.getAttribute('x'));
        var ly = Number(rec.labelEl.getAttribute('y'));
        var bg = null;
        for (var i = 0; i < self._records.length; i++) {
          if (pointInRings(lx, ly, self._records[i].rings)) { bg = self._records[i]; }
        }
        var fill = bg ? bg.fillColor : null;
        var lum = fill ? relLuminance(fill) : 1;
        if (!fill || lum > 0.44) {
          rec.labelEl.setAttribute('fill', '#16202b');
          rec.labelEl.setAttribute('stroke', '#ffffff');
          rec.labelEl.setAttribute('stroke-opacity', '0.94');
        } else {
          rec.labelEl.setAttribute('fill', '#ffffff');
          rec.labelEl.setAttribute('stroke', '#101a26');
          rec.labelEl.setAttribute('stroke-opacity', '0.62');
        }
      });
    }

    /* 空间最近邻 + 连通性修补，保证 11 区方向键全可达 */
    _buildNeighbors() {
      var pts = (this._geo.districts).map(function (d) {
        var xs = [], ys = [];
        d.rings.forEach(function (ring) { ring.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
        return {
          adcode: d.adcode,
          x: (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2,
          y: (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2
        };
      });
      var DIRS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      var DIR_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      var neighbors = Object.create(null);

      /* 第一步：60° 锥内最近邻 */
      pts.forEach(function (a) {
        var map = Object.create(null);
        Object.keys(DIRS).forEach(function (key) {
          var dx = DIRS[key][0], dy = DIRS[key][1];
          var best = null;
          pts.forEach(function (b) {
            if (b.adcode === a.adcode) { return; }
            var vx = b.x - a.x, vy = b.y - a.y;
            var len = Math.sqrt(vx * vx + vy * vy) || 1;
            var dot = (vx / len) * dx + (vy / len) * dy;
            if (dot < 0.5) { return; }
            var score = len / Math.max(dot, 0.001);
            if (!best || score < best.score) { best = { code: b.adcode, score: score }; }
          });
          map[key] = best ? best.code : null;
        });
        neighbors[a.adcode] = map;
      });

      /* 第二步：BFS 检查可达性，把不可达区接到最近的可达区（双向边），
         以满足“方向键需保证 11 区都可达”。 */
      var start = pts[0].adcode;
      var reachedSet = Object.create(null);
      var bfs = function () {
        var q = [start];
        reachedSet = Object.create(null);
        reachedSet[start] = true;
        while (q.length) {
          var code = q.shift();
          var map = neighbors[code] || {};
          for (var i = 0; i < DIR_KEYS.length; i++) {
            var n = map[DIR_KEYS[i]];
            if (n && !reachedSet[n] && neighbors[n]) { reachedSet[n] = true; q.push(n); }
          }
        }
      };
      bfs();
      var guard = 0;
      while (Object.keys(reachedSet).length < pts.length && guard++ < 40) {
        var bestPair = null;
        pts.forEach(function (a) {
          if (!reachedSet[a.adcode]) { return; }
          pts.forEach(function (b) {
            if (reachedSet[b.adcode]) { return; }
            var d = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
            if (!bestPair || d < bestPair.d) { bestPair = { a: a, b: b, d: d }; }
          });
        });
        if (!bestPair) { break; }
        var vx = bestPair.b.x - bestPair.a.x;
        var vy = bestPair.b.y - bestPair.a.y;
        var key, rev;
        if (Math.abs(vx) >= Math.abs(vy)) {
          key = vx > 0 ? 'ArrowRight' : 'ArrowLeft';
          rev = vx > 0 ? 'ArrowLeft' : 'ArrowRight';
        } else {
          key = vy > 0 ? 'ArrowDown' : 'ArrowUp';
          rev = vy > 0 ? 'ArrowUp' : 'ArrowDown';
        }
        neighbors[bestPair.a.adcode][key] = bestPair.b.adcode;
        neighbors[bestPair.b.adcode][rev] = bestPair.a.adcode;
        bfs();
      }

      /* 第三步：仍无方向键出口的（极端情况）用数据顺序兜底 */
      var order = pts.map(function (p) { return p.adcode; });
      pts.forEach(function (a, ai) {
        var map = neighbors[a.adcode];
        var prev = order[(ai - 1 + order.length) % order.length];
        var next = order[(ai + 1) % order.length];
        if (!map.ArrowLeft && !map.ArrowRight && !map.ArrowUp && !map.ArrowDown) {
          map.ArrowLeft = prev; map.ArrowRight = next;
        }
      });

      this._neighbors = neighbors;
      this._orderCodes = order;
    }

    /* ---------------- 指标应用 ---------------- */

    _applyMetric() {
      if (this._destroyed || !this._geo || !this._metricId) { return; }
      this._computeStats(this._metricId);
      this._updateHeightBtns();
      this._updatePills();
      this._updateDistrictVisuals();
      this._updateLegend();
      this._updateAlert();
      this._updateFocus();
      this._updateSelectionUi();
      this._updateFoot();
      this._updateSvgDesc();
    }

    _updateHeightBtns() {
      var mode = this._heightMode;
      this._segBtns.forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-hmode') === mode ? 'true' : 'false');
      });
    }

    _computeStats(metricId) {
      var values = [];
      var missing = 0;
      var rows = [];
      for (var i = 0; i < this._records.length; i++) {
        var v = readMetric(this._records[i].data, metricId);
        rows.push({ adcode: this._records[i].adcode, name: this._records[i].name, value: v });
        if (v === null) { missing++; } else { values.push(v); }
      }
      var min = values.length ? Math.min.apply(null, values) : null;
      var max = values.length ? Math.max.apply(null, values) : null;
      this._stats = { min: min, max: max, median: medianOf(values), missing: missing, values: values, rows: rows };
    }

    _metricNorm(v) {
      var st = this._stats;
      if (!isFiniteNum(v) || st.min === null) { return 0; }
      if (st.max === st.min) { return 1; }
      return clamp((v - st.min) / (st.max - st.min), 0, 1);
    }

    _ramp() {
      var m = this._metricById[this._metricId];
      return (m && METRIC_RAMPS[m.id]) || FALLBACK_RAMP;
    }

    _buildSidePath(rings, h) {
      var parts = [];
      for (var r = 0; r < rings.length; r++) {
        var pts = rings[r];
        var len = pts.length;
        for (var i = 0; i < len; i++) {
          var a = pts[i], b = pts[(i + 1) % len];
          parts.push('M' + a[0] + ',' + a[1] + 'L' + b[0] + ',' + b[1] +
            'L' + b[0] + ',' + round2(b[1] + h) + 'L' + a[0] + ',' + round2(a[1] + h) + 'Z');
        }
      }
      return parts.join('');
    }

    _updateDistrictVisuals() {
      var metric = this._metricById[this._metricId];
      if (!metric) { return; }
      var ramp = this._ramp();
      var self = this;
      var decimals = metric.decimals;

      this._records.forEach(function (rec) {
        var v = readMetric(rec.data, self._metricId);
        var fv = fmtValue(v, decimals);
        var isMissing = fv === null;
        var g = rec.el, top = rec.topEl, side = rec.sideEl;

        if (isMissing) {
          g.classList.add('is-missing');
          g.setAttribute('aria-pressed', self._selected === rec.adcode ? 'true' : 'false');
          g.setAttribute('aria-label', rec.name + '，' + metric.label + ' 数据缺失（无数据，非 0），' + (metric.years || ''));
          top.setAttribute('fill', 'url(#gz-hatch)');
          top.setAttribute('stroke', '#5a6472');
          side.setAttribute('d', '');
          side.style.display = 'none';
          rec.lastH = null;
          rec.fillColor = '#e8ecf1';   /* hatch 底色偏浅灰，标签按浅底处理 */
          return;
        }

        g.classList.remove('is-missing');
        g.setAttribute('aria-pressed', self._selected === rec.adcode ? 'true' : 'false');
        g.setAttribute('aria-label', rec.name + '，' + metric.label + ' ' + fv + (metric.unit ? ' ' + metric.unit : '') + '，' + (metric.years || ''));
        side.style.display = '';

        var t = self._metricNorm(v);
        var color = rampColor(ramp, t);
        var depthH = self._heightMode === 'metric'
          ? round2(H_MIN + Math.sqrt(t) * (H_MAX - H_MIN))
          : H_FLAT;

        if (rec.lastH !== depthH) {
          side.setAttribute('d', self._buildSidePath(rec.rings, depthH));
          rec.lastH = depthH;
        }
        top.setAttribute('fill', color);
        top.setAttribute('stroke', '#ffffff');
        g.style.setProperty('--gz-top-hover', lighten(color, 0.16));   /* 悬停提亮色 */
        var sideColor = shadeSide(color);
        side.setAttribute('fill', sideColor);
        side.setAttribute('stroke', shadeSide(darken(color, 0.18)));
        rec.fillColor = color;
      });

      /* 标签配色依最终底色重算（含被偏移到邻区上方的标签） */
      this._applyLabelColors();
    }

    /* ---------------- 图例 ---------------- */

    _updateLegend() {
      var metric = this._metricById[this._metricId];
      if (!metric) { this._legend.textContent = ''; return; }
      var ramp = this._ramp();
      var st = this._stats;
      var dec = isFiniteNum(metric.decimals) ? metric.decimals : 1;
      var grad = 'linear-gradient(90deg,' + ramp.join(',') + ')';
      var isSens = metric.group === 'sensitivity';
      var missingNames = st.rows.filter(function (r) { return r.value === null; }).map(function (r) { return r.name; });

      var minTxt = st.min === null ? '—' : st.min.toFixed(dec);
      var maxTxt = st.max === null ? '—' : st.max.toFixed(dec);
      var medTxt = st.median === null ? '—' : st.median.toFixed(dec);
      var medPct = (st.min === null || st.max === null || st.max === st.min) ? 50 : ((st.median - st.min) / (st.max - st.min)) * 100;

      var heightTxt = this._heightMode === 'metric'
        ? '高度：按指标值 √ 归一（' + H_MIN + '–' + H_MAX + ' 用户单位），与颜色表达同一指标。'
        : '高度：统一厚度 ' + H_FLAT + ' 用户单位，仅作视觉层次，不表示指标数值。';

      var html = '' +
        '<div class="leg-head"><span class="leg-name">' + esc(metric.label) + '</span>' +
        (isSens ? '<span class="leg-tag">口径对照</span>' : '') + '</div>' +
        '<div class="leg-meta">' + esc(metric.years || '') + ' · 单位：' + esc(metric.unit || '—') +
        ' · 小数位 ' + dec + '</div>' +
        '<div class="bandrow">' +
        '  <span class="leg-tick">' + minTxt + '</span>' +
        '  <span class="band" style="background:' + grad + '">' +
        '    <span class="band-med" style="left:' + round2(medPct) + '%" title="11 区中位数 ' + medTxt + '"></span>' +
        '  </span>' +
        '  <span class="leg-tick r">' + maxTxt + '</span>' +
        '</div>' +
        '<div class="leg-sub">色带左端 = 11 区最小值，右端 = 11 区最大值；黑标 = 11 区中位数 ' + medTxt +
        (st.missing ? '（缺失区不参与 min/max）' : '') + '</div>' +
        '<div class="leg-h">' + esc(heightTxt) + '</div>' +
        (st.missing
          ? '<div class="leg-miss"><span class="sw-miss" aria-hidden="true"></span>' +
            '<span>缺失数据（非 0）：' + esc(missingNames.join('、')) + '</span></div>'
          : '') +
        '<div class="leg-src">来源：' + esc(metric.source || '—') + '</div>' +
        '<div class="leg-q">口径提示：' + esc(metric.qualityNote || '—') + '</div>';
      this._legend.innerHTML = html;
    }

    _updateAlert() {
      var st = this._stats;
      if (!st.missing) { this._alert.hidden = true; this._alert.textContent = ''; return; }
      var names = st.rows.filter(function (r) { return r.value === null; }).map(function (r) { return r.name; });
      this._alert.hidden = false;
      this._alert.textContent = '本指标有 ' + st.missing + ' 个区缺失数据：' + names.join('、') + '。缺失不等于 0。';
    }

    _updateFixtureBar() {
      var fx = !!(this._data && this._data.meta && this._data.meta._fixture);
      if (fx) {
        this._fixtureBar.hidden = false;
        this._fixtureBar.textContent = '测试夹具（合成）数据：仅用于演示缺失值渲染，禁止用于研究展示。';
      } else {
        this._fixtureBar.hidden = true;
        this._fixtureBar.textContent = '';
      }
    }

    _updateSvgDesc() {
      var desc = this.shadowRoot.querySelector('#gz-svg-desc');
      if (!desc) { return; }
      var metric = this._metricById[this._metricId];
      desc.textContent = '广州市 11 个市辖区 2.5D 挤出地图，当前指标：' + (metric ? metric.label : '') +
        '。每区为可聚焦按钮，方向键在区间移动，Enter 选中，Esc 清空选中。无底图，边界仅作示意。';
    }

    /* ---------------- 指标胶囊 ---------------- */

    _updatePills() {
      if (!this._metrics.length) { this._pillsPrimary.textContent = ''; this._pillsMore.textContent = ''; return; }
      var self = this;
      var primary = this._metrics.filter(function (m) { return m.primary; });
      var rest = this._metrics.filter(function (m) { return !m.primary; });
      var primaryHtml = primary.map(function (m) { return self._pillHtml(m); }).join('');
      var moreHtml = rest.map(function (m) { return self._pillHtml(m); }).join('');
      if (this._pillsPrimary.innerHTML !== primaryHtml) { this._pillsPrimary.innerHTML = primaryHtml; }
      if (this._pillsMore.innerHTML !== moreHtml) { this._pillsMore.innerHTML = moreHtml; }
      this._moreBtn.textContent = '更多指标（' + rest.length + '）';
      this._moreBtn.hidden = rest.length === 0;

      this.shadowRoot.querySelectorAll('.pill[data-metric]').forEach(function (b) {
        var id = b.getAttribute('data-metric');
        b.setAttribute('aria-pressed', id === self._metricId ? 'true' : 'false');
        b.onclick = function () { self.setMetric(id); };
      });

      /* 当前指标在“更多”里时自动展开，保证选中态可见 */
      if (rest.some(function (m) { return m.id === self._metricId; })) { this._setMore(true); }
    }

    _pillHtml(m) {
      var tag = (m.group === 'sensitivity') ? '<span class="pill-tag">' + esc(METRIC_TAG.sensitivity) + '</span>' : '';
      return '<button type="button" class="pill" data-metric="' + esc(m.id) + '" aria-pressed="false" ' +
        'aria-label="切换到指标：' + esc(m.label) + '（' + esc(m.unit || '') + '；' + esc(m.years || '') + '）" ' +
        'title="' + esc(m.label) + '">' + esc(m.shortLabel || m.label) + tag + '</button>';
    }

    _toggleMore() { this._setMore(this._pillsMore.hidden); }
    _setMore(open) {
      this._pillsMore.hidden = !open;
      this._moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      this._moreBtn.textContent = (open ? '收起更多指标' : '更多指标（' + this._metrics.filter(function (m) { return !m.primary; }).length + '）');
    }

    /* ---------------- 选中 / 高亮 UI ---------------- */

    _updateSelectionUi() {
      var self = this;
      var metric = this._metricById[this._metricId];
      this._records.forEach(function (rec) {
        var on = self._selected === rec.adcode;
        rec.el.classList.toggle('is-selected', on);
        rec.el.setAttribute('aria-pressed', on ? 'true' : 'false');
        rec.topEl.setAttribute('stroke-width', on ? '1.2' : '');
        if (on) { self._selOutline.setAttribute('d', rec.topD); }
      });
      if (!this._selected) { this._selOutline.setAttribute('d', ''); }
      this._renderPanel();
    }

    _showFocusOutline(code) {
      this._focusCode = code;
      var rec = code ? this._recByCode[code] : null;
      this._focOutline.setAttribute('d', rec ? rec.topD : '');
      if (code) { this._setRovingFocus(code); }
    }

    _setRovingFocus(code, silent) {
      var self = this;
      this._focusCode = code;
      this._records.forEach(function (rec) {
        rec.el.setAttribute('tabindex', rec.adcode === code ? '0' : '-1');
      });
      if (!silent) { /* 仅在键盘导航时保持当前焦点 */ }
    }

    /* ---------------- 详情面板 ---------------- */

    _renderPanel() {
      var metric = this._metricById[this._metricId];
      if (!metric) { this._panel.innerHTML = ''; return; }
      var rec = this._selected ? this._recByCode[this._selected] : null;
      if (!rec) { this._panel.innerHTML = this._panelIdleHtml(metric); return; }
      this._panel.innerHTML = this._panelDetailHtml(rec, metric);
    }

    _panelIdleHtml(metric) {
      var bounds = (this._data && this._data.meta && Array.isArray(this._data.meta.boundariesOfUse))
        ? this._data.meta.boundariesOfUse.slice(0, 3) : [];
      if (!bounds.length) {
        bounds = [
          '只呈现区级数据，不生成街镇级需求分布。',
          '供给密度是代理指标，不能用于判断服务需求、可达性或服务满足程度。',
          '统计相关不代表因果。'
        ];
      }
      var mm = (this._data && this._data.meta && this._data.meta.missingData) || null;
      return '' +
        '<h3>区级供给结构 · 使用说明</h3>' +
        '<p class="guide">点击地图中的区查看详情；或按 <span class="kbd">Tab</span> 进入地图，用 <span class="kbd">方向键</span> 在 11 区之间移动，' +
        '<span class="kbd">Enter</span> 选中，<span class="kbd">Esc</span> 清空选中。</p>' +
        '<h4>当前指标说明</h4>' +
        '<div class="metric-why"><dl>' +
        '<dt>指标</dt><dd>' + esc(metric.label) + '（' + esc(metric.years || '') + '；单位：' + esc(metric.unit || '—') + '）</dd>' +
        '<dt>分子</dt><dd>' + esc(metric.numerator || '—') + '</dd>' +
        '<dt>分母</dt><dd>' + esc(metric.denominator || '—') + '</dd>' +
        '<dt>来源</dt><dd>' + esc(metric.source || '—') + '</dd>' +
        '</dl></div>' +
        '<h4>数据边界</h4>' +
        '<ul>' + bounds.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
        (mm && mm.note ? '<h4>缺失数据说明</h4><p class="hint">' + esc(mm.note) + '</p>' : '');
    }

    _panelDetailHtml(rec, metric) {
      var d = rec.data;
      var v = readMetric(d, this._metricId);
      var fv = fmtValue(v, metric.decimals);
      var isMissing = fv === null;
      var isFocus = this._focusCodes.indexOf(rec.adcode) >= 0;
      var reason = this._focusReasons[rec.adcode] || '';

      var bigVal = isMissing
        ? '<div class="bigval"><span class="num is-missing">—（缺失）</span></div>'
        : '<div class="bigval"><span class="num">' + esc(fv) + '</span><span class="unit">' + esc(metric.unit || '') + '</span></div>';

      /* 全部指标小表 */
      var metricRows = this._metrics.map(function (m) {
        var mv = d ? readMetric(d, m.id) : null;
        var mfv = fmtValue(mv, m.decimals);
        var tagTxt = m.group === 'sensitivity' ? '<span class="row-tag">口径对照</span>' : '';
        return '<div class="k">' + esc(m.label) + tagTxt + '</div>' +
          '<div class="v' + (mfv === null ? ' miss' : '') + '">' +
          (mfv === null ? '—（缺失）' : esc(mfv) + '<span class="u">' + esc(m.unit || '') + '</span>') + '</div>';
      }).join('');

      /* 原始计数表 */
      var rawSpec = [
        ['totalPopulation2025', '户籍总人口', '人'],
        ['population60Plus2025', '60+ 人口', '人'],
        ['population65Plus2025', '65+ 人口', '人'],
        ['population80Plus2025', '80+ 人口', '人'],
        ['registeredBeds2026', '备案床位（2026）', '床'],
        ['eldercareInstitutions2026', '养老机构数（2026）', '家'],
        ['elderCareMealSites2025', '长者饭堂点数（2025）', '个'],
        ['primaryCareInstitutions2023', '基层医疗机构数（2023）', '家']
      ];
      var raw = (d && d.raw) || {};
      var rawRows = rawSpec.map(function (spec) {
        var rv = fmtCount(raw[spec[0]]);
        return '<div class="k">' + esc(spec[1]) + '</div><div class="v' + (rv === null ? ' miss' : '') + '">' +
          (rv === null ? '—（缺失）' : esc(rv) + '<span class="u">' + esc(spec[2]) + '</span>') + '</div>';
      }).join('');
      var area = fmtCount(d && d.areaKm2Geometric);
      rawRows += '<div class="k">几何面积</div><div class="v' + (area === null ? ' miss' : '') + '">' +
        (area === null ? '—（缺失）' : esc(area) + '<span class="u">km²</span>') + '</div>';

      var flags = (d && Array.isArray(d.flags)) ? d.flags : [];
      var flagHtml = flags.length
        ? '<ul class="flaglist">' + flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>'
        : '<p class="okline">本区无质量提示标记。</p>';

      return '' +
        '<div class="sel-head"><h3>' + esc(rec.name) + '</h3>' +
        '<span class="code">adcode ' + esc(rec.adcode) + '</span>' +
        (isFocus ? '<span class="badge-focus" title="' + esc(reason) + '">重点关注区（规则）</span>' : '') +
        '</div>' +
        bigVal +
        '<p class="valyears">' + esc(metric.label) + ' · ' + esc(metric.years || '') + '</p>' +
        (isFocus && reason ? '<p class="hint">规则说明：' + esc(reason) + '</p>' : '') +
        '<h4>全部 8 项指标</h4><div class="tbl">' + metricRows + '</div>' +
        '<h4>原始计数（原始值，仅展示不重算）</h4><div class="tbl">' + rawRows + '</div>' +
        '<p class="hint">面积为边界文件几何量算值，含水域且口径待核（天河区差异较大），不参与任何密度计算。</p>' +
        '<h4>质量提示</h4>' + flagHtml +
        '<h4>数据来源与口径</h4>' +
        '<p class="hint">来源：' + esc(metric.source || '—') + '</p>' +
        '<p class="hint">分子：' + esc(metric.numerator || '—') + '；分母：' + esc(metric.denominator || '—') + '</p>' +
        '<p class="leg-q" style="margin-top:6px">口径提示：' + esc(metric.qualityNote || '—') + '</p>';
    }

    /* ---------------- 重点关注区 ---------------- */

    _updateFocus() {
      this._focusCodes = [];
      this._focusReasons = Object.create(null);
      var rule = this._focusRule;
      if (typeof rule === 'function') {
        for (var i = 0; i < this._records.length; i++) {
          var rec = this._records[i];
          var r = null;
          try { r = rule(rec.data); } catch (e) { r = null; }
          if (r && r.isFocus) {
            this._focusCodes.push(rec.adcode);
            this._focusReasons[rec.adcode] = String(r.reason || '');
          }
        }
      }
      /* 标记徽标（选中时才在面板显示，见 _renderPanel） */
      var self = this;
      this._records.forEach(function (rec) {
        if (rec.el) { rec.el.classList.toggle('is-focus', self._focusCodes.indexOf(rec.adcode) >= 0); }
      });
      this._updateFoot();
    }

    _updateFoot() {
      var note = '';
      if (!this._focusCodes.length && typeof this._focusRule !== 'function') {
        note = ' <span class="foot-focus">' + esc(FOOT_FOCUS_OFF) + '</span>';
      } else if (typeof this._focusRule === 'function' && !this._focusCodes.length) {
        note = ' <span class="foot-focus">重点关注区规则已接入，但本指标下无区命中。</span>';
      } else if (this._focusCodes.length) {
        note = ' <span class="foot-focus">重点关注区由外部 focusRule 判定（' + this._focusCodes.length + ' 个区），非本组件预设。</span>';
      }
      var boundary = '';
      if (this._data && this._data.meta && this._data.meta.boundary) {
        var b = this._data.meta.boundary;
        boundary = ' 边界：' + (b.sourceName || '第三方公开边界') + '（' + (b.license || '许可待核') + '）；' + (b.crs || '坐标系待核') + '；不叠加底图。';
      }
      this._foot.innerHTML = esc(FOOT_MAIN) + note + '<br>' + esc(boundary.trim());
    }

    /* ---------------- 视图 / 缩放 / 平移 ---------------- */

    _setViewBox(vb, opts) {
      if (!this._geo) { return; }
      var opt = opts || {};
      var clamped = this._clampViewBox(vb);
      var prev = this._vb;
      this._vb = clamped;
      this._vmScale = this._geo.baseViewBox[2] / clamped[2];
      this._svg.setAttribute('viewBox', clamped.map(round2).join(' '));
      if (opt.force || Math.abs(prev[0] - clamped[0]) > 0.01 || Math.abs(prev[2] - clamped[2]) > 0.01) {
        if (!opt.silent) { this._scheduleViewChange(); }
      }
      /* 选中描边层随视图不变（同坐标系），无需重算 */
    }

    _clampViewBox(vb) {
      var base = this._geo.baseViewBox;
      var bw = base[2], bh = base[3];
      var w = clamp(vb[2], bw / ZOOM_MAX, bw);
      var h = clamp(vb[3], bh / ZOOM_MAX, bh);
      var x = vb[0], y = vb[1];
      if (w >= bw - 1e-6) { x = base[0]; } else { x = clamp(x, base[0] - 0.25 * w, base[0] + bw - PAN_KEEP * w); }
      if (h >= bh - 1e-6) { y = base[1]; } else { y = clamp(y, base[1] - 0.25 * h, base[1] + bh - PAN_KEEP * h); }
      return [x, y, w, h];
    }

    _scheduleViewChange() {
      if (this._vcTimer) { return; }
      var self = this;
      this._vcTimer = setTimeout(function () {
        self._vcTimer = 0;
        if (self._destroyed) { return; }
        self._dispatch('gzmap:viewchange', {
          viewBox: self._vb.slice(0, 4).map(round2),
          zoom: round2(self._vmScale)
        });
      }, 100);
    }

    _clientToUser(clientX, clientY) {
      var ctm = this._svg.getScreenCTM();
      if (!ctm) { return null; }
      var pt = this._svg.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      try { return pt.matrixTransform(ctm.inverse()); } catch (e) { return null; }
    }

    /* 以某点为中心缩放到指定倍数（clientX/Y 为 null 表示视口中心） */
    _zoomToScale(targetScale, clientX, clientY) {
      if (!this._geo) { return; }
      var base = this._geo.baseViewBox;
      var cur = base[2] / this._vb[2];
      var next = clamp(targetScale, ZOOM_MIN, ZOOM_MAX);
      if (Math.abs(next - cur) < 0.0005) { return; }
      var rect = this._mapwrap.getBoundingClientRect();
      var cx = (clientX == null) ? rect.left + rect.width / 2 : clientX;
      var cy = (clientY == null) ? rect.top + rect.height / 2 : clientY;
      var p = this._clientToUser(cx, cy);
      if (!p) { return; }
      var w = base[2] / next;
      var h = base[3] / next;
      var nx = p.x - (p.x - this._vb[0]) * (w / this._vb[2]);
      var ny = p.y - (p.y - this._vb[1]) * (h / this._vb[3]);
      this._setViewBox([nx, ny, w, h]);
    }

    _zoomAtPoint(factor, ev) {
      var cur = this._geo ? this._geo.baseViewBox[2] / this._vb[2] : 1;
      this._zoomToScale(cur * factor, ev ? ev.clientX : null, ev ? ev.clientY : null);
    }

    /* 保证某区在当前视口内（键盘导航用） */
    _ensureVisible(code) {
      var rec = this._recByCode[code];
      if (!rec || !this._geo) { return; }
      var xs = [], ys = [];
      rec.rings.forEach(function (pts) { pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var vb = this._vb.slice();
      var mx = vb[2] * 0.06, my = vb[3] * 0.06;
      if (x0 < vb[0] + mx) { vb[0] = x0 - mx; }
      else if (x1 > vb[0] + vb[2] - mx) { vb[0] = x1 - vb[2] + mx; }
      if (y0 < vb[1] + my) { vb[1] = y0 - my; }
      else if (y1 > vb[1] + vb[3] - my) { vb[1] = y1 - vb[3] + my; }
      if (vb[0] !== this._vb[0] || vb[1] !== this._vb[1]) { this._setViewBox(vb); }
    }

    /* ---------------- 指针交互 ---------------- */

    _onPointerDown(e) {
      if (!this._geo) { return; }
      if (e.pointerType === 'mouse' && e.button !== 0) { return; }
      /* 记录按下位置与命中的区：即使浏览器把 click 目标重定向到 <svg>，
         也能按“按下时命中的区 + 位移<阈值”正确判定为点击选中。 */
      var downG = e.target && e.target.closest ? e.target.closest('.district') : null;
      this._downInfo = {
        district: downG ? downG.getAttribute('data-adcode') : null,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        pointerType: e.pointerType
      };
      this._suppressClickUntil = 0;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        this._pan = { x: e.clientX, y: e.clientY, vb: this._vb.slice(), moved: false, captured: false };
        this._pinch = null;
        /* 注意：此处不立即 setPointerCapture——一旦捕获，随后的 click 会被重定向到 <svg>，
           导致“点击区选中”失效。改为真正开始拖动时才捕获。 */
      } else if (this._pointers.size === 2) {
        var ps = Array.from(this._pointers.values());
        this._pinch = {
          dist: Math.sqrt(Math.pow(ps[0].x - ps[1].x, 2) + Math.pow(ps[0].y - ps[1].y, 2)) || 1,
          scale: this._geo.baseViewBox[2] / this._vb[2],
          mid: [(ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2]
        };
        this._pinchUsed = false;
        this._pan = null;
        if (this._downInfo) { this._downInfo.moved = true; }   /* 多指手势不产生选中 */
      }
    }

    _onPointerMove(e) {
      var rec = this._pointers.get(e.pointerId);
      if (rec) { rec.x = e.clientX; rec.y = e.clientY; }

      /* 双指捏合 */
      if (this._pinch && this._pointers.size >= 2) {
        var ps = Array.from(this._pointers.values());
        var d = Math.sqrt(Math.pow(ps[0].x - ps[1].x, 2) + Math.pow(ps[0].y - ps[1].y, 2)) || 1;
        var mid = [(ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2];
        if (Math.abs(d - this._pinch.dist) > 2) {
          this._pinchUsed = true;
          if (this._downInfo) { this._downInfo.moved = true; }
          this._zoomToScale(this._pinch.scale * (d / this._pinch.dist), mid[0], mid[1]);
        }
        return;
      }

      /* 拖动平移 */
      if (this._pan && this._pointers.size === 1) {
        var dxc = e.clientX - this._pan.x;
        var dyc = e.clientY - this._pan.y;
        if (!this._pan.moved && Math.sqrt(dxc * dxc + dyc * dyc) < 4) { return; }
        if (!this._pan.moved) {
          this._pan.moved = true;
          if (this._downInfo) { this._downInfo.moved = true; }
          /* 真正开始拖动后才捕获指针，保证纯点击仍能命中区元素 */
          try { this._svg.setPointerCapture(e.pointerId); this._pan.captured = true; } catch (err) { /* 忽略 */ }
          this._pan.vb = this._vb.slice();
          var u0s = this._clientToUser(this._pan.x, this._pan.y);
          if (u0s) { this._pan.u0 = u0s; }
        }
        this._mapwrap.classList.add('is-grabbing');
        this._svg.classList.add('is-grabbing');
        var u0 = this._pan.u0 || this._clientToUser(this._pan.x, this._pan.y);
        var u1 = this._clientToUser(e.clientX, e.clientY);
        if (!u0 || !u1) { return; }
        var vb = this._pan.vb.slice();
        vb[0] -= (u1.x - u0.x);
        vb[1] -= (u1.y - u0.y);
        this._setViewBox(vb);
        this._hideTip();
        return;
      }

      /* 悬停 */
      if (e.pointerType === 'mouse' && this._pointers.size === 0) {
        this._handleHover(e);
      }
    }

    _onPointerUp(e) {
      var wasPanning = this._pan && this._pan.moved;
      var pinchUsed = !!this._pinchUsed;
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) { this._pinch = null; }
      if (this._pointers.size === 0) {
        this._pan = null;
        this._svg.classList.remove('is-grabbing');
        this._mapwrap.classList.remove('is-grabbing');
        try { this._svg.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        if (wasPanning || pinchUsed) {
          this._lastPanEnd = Date.now();
          this._suppressClickUntil = Date.now() + 400;   /* 拖拽/捏合结束后不误选、也不误清空 */
        }
        this._pinchUsed = false;
      }
    }

    _handleHover(e) {
      var g = e.target && e.target.closest ? e.target.closest('.district') : null;
      if (!g) {
        if (this._hovered && this._hoveredByPointer) {
          this._hoveredByPointer = false;
          this._hideTip();
          this._dispatch('gzmap:hover', { adcode: null, name: null, value: null, clientX: e.clientX, clientY: e.clientY });
          this.highlight(null);
        }
        return;
      }
      var code = g.getAttribute('data-adcode');
      var rec = this._recByCode[code];
      if (!rec) { return; }
      var v = readMetric(rec.data, this._metricId);
      this._hoveredByPointer = true;
      if (this._hovered !== code) { this.highlight(code); }
      this._showTip(rec, v, e.clientX, e.clientY);
      this._dispatch('gzmap:hover', { adcode: code, name: rec.name, value: v, clientX: e.clientX, clientY: e.clientY });
    }

    _onPointerLeave(e) {
      var hadHover = this._hovered;
      this._hideTip();
      if (hadHover) {
        this.highlight(null);
        this._dispatch('gzmap:hover', { adcode: null, name: null, value: null, clientX: e ? e.clientX : null, clientY: e ? e.clientY : null });
      }
    }

    _onWheel(e) {
      if (!this._geo) { return; }
      e.preventDefault();
      var delta = e.deltaY;
      if (e.deltaMode === 1) { delta *= 16; } else if (e.deltaMode === 2) { delta *= 100; }
      var factor = Math.pow(WHEEL_NOTCH, -delta / 100);
      this._zoomAtPoint(factor, e);
      this._hideTip();
    }

    _onClick(e) {
      if (this._suppressClickUntil) {
        var within = Date.now() < this._suppressClickUntil;
        this._suppressClickUntil = 0;
        if (within) { return; }
      }
      if (Date.now() - this._lastPanEnd < 300) { return; }
      /* 优先使用事件目标；若浏览器把 click 重定向到 <svg>（指针捕获等），
         回退到“按下时命中的区 + 位移小于阈值”的判定，保证真实鼠标单击一定能选中。 */
      var g = e.target && e.target.closest ? e.target.closest('.district') : null;
      var code = g ? g.getAttribute('data-adcode') : null;
      if (!code && this._downInfo && !this._downInfo.moved) {
        var dx = e.clientX - this._downInfo.x;
        var dy = e.clientY - this._downInfo.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) { code = this._downInfo.district; }
      }
      this._downInfo = null;
      if (!code) {
        if (this._selected) { this.select(null, { source: 'map' }); }
        return;
      }
      this.select(code, { source: 'map' });
    }

    _onKeyDown(e) {
      var g = e.target && e.target.closest ? e.target.closest('.district') : null;
      if (!g) { return; }
      var code = g.getAttribute('data-adcode');
      var map = (this._neighbors && this._neighbors[code]) || null;
      var key = e.key;

      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        e.preventDefault();
        this.select(code, { source: 'map' });
        return;
      }
      if (key === 'Escape' || key === 'Esc') { return; } /* 由宿主监听器统一处理 */

      var target = null;
      if (key === 'Home') { target = this._orderCodes && this._orderCodes[0]; }
      else if (key === 'End') { target = this._orderCodes && this._orderCodes[this._orderCodes.length - 1]; }
      else if (map && map[key]) { target = map[key]; }
      if (target) {
        e.preventDefault();
        var rec = this._recByCode[target];
        if (rec) {
          this._setRovingFocus(target);
          this._ensureVisible(target);
          try { rec.el.focus({ preventScroll: false }); } catch (err) { rec.el.focus(); }
        }
      }
    }

    /* ---------------- tooltip ---------------- */

    _showTip(rec, value, clientX, clientY) {
      var metric = this._metricById[this._metricId];
      var fv = fmtValue(value, metric.decimals);
      var html;
      if (fv === null) {
        html = '<div class="tip-name">' + esc(rec.name) + '</div>' +
          '<div class="tip-val tip-miss">缺失（无数据，非 0）</div>' +
          '<div class="tip-hint">' + esc(metric.label) + '</div>' +
          '<div class="tip-hint">点击查看详情</div>';
      } else {
        html = '<div class="tip-name">' + esc(rec.name) + '</div>' +
          '<div class="tip-val">' + esc(fv) + '<span class="tip-unit">' + esc(metric.unit || '') + '</span></div>' +
          '<div class="tip-hint">' + esc(metric.label) + ' · ' + esc(metric.years || '') + '</div>' +
          '<div class="tip-hint">点击查看详情</div>';
      }
      this._tip.innerHTML = html;
      this._tip.hidden = false;
      this._placeTip(clientX, clientY);
    }

    _placeTip(clientX, clientY) {
      var pad = 14;
      var rect = this._tip.getBoundingClientRect();
      var w = rect.width || 180;
      var h = rect.height || 64;
      var vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      var vh = window.innerHeight || document.documentElement.clientHeight || 768;
      var x = clientX + pad;
      var y = clientY + pad;
      if (x + w + 8 > vw) { x = Math.max(8, clientX - w - pad); }
      if (y + h + 8 > vh) { y = Math.max(8, clientY - h - pad); }
      this._tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }

    _hideTip() {
      this._tip.hidden = true;
      this._hoveredByPointer = false;
    }

    /* ---------------- 播报 / 事件 ---------------- */

    _announce(text) {
      if (!this._live) { return; }
      this._live.textContent = text;
    }

    _dispatch(type, detail) {
      var ev;
      try {
        ev = new CustomEvent(type, { detail: detail, bubbles: true, composed: true });
      } catch (e) {
        ev = document.createEvent('CustomEvent');
        ev.initCustomEvent(type, true, true, detail);
      }
      this.dispatchEvent(ev);
    }
  };

  /* =====================================================================
   * 5. 注册与便捷挂载
   * ===================================================================== */

  if (!global.customElements) {
    console.warn('[gz-district-map] 当前环境不支持 Custom Elements，组件未注册。');
    return;
  }
  if (!global.customElements.get(TAG)) {
    global.customElements.define(TAG, GzDistrictMap);
  }
  global.GzDistrictMap = global.customElements.get(TAG) || GzDistrictMap;

  global.mountGuangzhouDistrictMap = function mountGuangzhouDistrictMap(container, options) {
    if (!container || typeof container.appendChild !== 'function') {
      throw new Error('[gz-district-map] mountGuangzhouDistrictMap 需要一个容器元素');
    }
    var el = document.createElement(TAG);
    var opt = options || {};
    if (opt.id) { el.id = opt.id; }
    if (opt.className) { el.className = opt.className; }
    container.appendChild(el);
    if (opt.data) { el.data = opt.data; }
    if (opt.geometry) { el.geometry = opt.geometry; }
    if (opt.metric) { el.metric = opt.metric; }
    if (opt.heightMode) { el.heightMode = opt.heightMode; }
    if (Object.prototype.hasOwnProperty.call(opt, 'focusRule')) { el.focusRule = opt.focusRule; }
    if (opt.labelOffsets) { el.labelOffsets = opt.labelOffsets; }
    return el;
  };

})(typeof window !== 'undefined' ? window : this);
