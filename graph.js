/* ══════════════════════════════════════════════════════════════
   OmniCalc — Graph Plotter
   Pure client-side canvas rendering, zero dependencies
   Handles:
   - Individual X/Y coordinate point plotting
   - Function plotting (e.g. sin(x), x^2, 1/x)
   - Pan (drag) and zoom (scroll)
════════════════════════════════════════════════════════════ */

'use strict';

// ─── config ────────────────────────────────────────────────────
const PAD_LEFT   = 60;   // y-axis label area
const PAD_BOTTOM = 40;   // x-axis label area
const PAD_TOP    = 30;
const PAD_RIGHT  = 20;
const NUM_GRID   = 10;   // grid divisions per axis

// ─── state ─────────────────────────────────────────────────────
let points = [];          // {x, y}
let curves = [];          // {fn, color, lw}
let viewX  = [-10, 10];   // current x-range
let viewY  = null;        // null = auto-fit

// ─── canvas & ctx ─────────────────────────────────────────────
const canvas = $el('graphCanvas');
const ctx    = canvas.getContext('2d');
let isDragging = false;
let dragStartX  = 0, dragStartY = 0;
let viewStartX0 = 0, viewStartX1 = 0, viewStartY0 = 0, viewStartY1 = 0;

// ─── coordinate transforms ────────────────────────────────────
function w2s(x, y) {     // world → screen
  const sx = PAD_LEFT + (x - viewX[0]) / (viewX[1] - viewX[0]) * (canvas.width  - PAD_LEFT - PAD_RIGHT);
  const sy = canvas.height - PAD_BOTTOM
             - (y - viewY[0]) / (viewY[1] - viewY[0]) * (canvas.height - PAD_TOP - PAD_BOTTOM);
  return [sx, sy];
}
function s2w(sx, sy) {   // screen → world
  const x = viewX[0] + (sx - PAD_LEFT) / (canvas.width  - PAD_LEFT - PAD_RIGHT) * (viewX[1] - viewX[0]);
  const y = viewY[0] + (1 - (sy - PAD_TOP) / (canvas.height - PAD_TOP - PAD_BOTTOM)) * (viewY[1] - viewY[0]);
  return [x, y];
}

// ─── auto-fit Y ───────────────────────────────────────────────
function autoFitY() {
  if (points.length === 0 && curves.length === 0) { viewY = [-10, 10]; return; }
  let mn = Infinity, mx = -Infinity;
  points.forEach(p => { mn = Math.min(mn, p.y); mx = Math.max(mx, p.y); });
  curves.forEach(curve => {
    for (let x = viewX[0]; x <= viewX[1]; x += (viewX[1]-viewX[0])/300) {
      try {
        const y = evalFunction(curve.fn, x);
        if (isFinite(y)) { mn = Math.min(mn, y); mx = Math.max(mx, y); }
      } catch(e) {}
    }
  });
  const pad = (mx - mn) * 0.12 || 2;
  viewY = [mn - pad, mx + pad];
}

// ─── math evaluator (same structure as calculator.js) ─────────
function evalFunction(expr, x) {
  let s = String(expr).replace(/\s+/g,'').replace(/×/g,'*').replace(/÷/g,'/');
  s = s.replace(/\bPI\b/gi, Math.PI.toString());
  s = s.replace(/\be\b/gi,    Math.E.toString());
  // replace x
  s = s.replace(/(?<![a-zA-Z])x(?![a-zA-Z])/g, `(${x})`);
  // sin, cos, tan…
  ['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','ln','log','sqrt','cbrt','abs','sign'].forEach(f => {
    s = s.replace(new RegExp('\\b'+f+'\\(','g'), `Math.${f}(`);
  });
  s = s.replace(/x\^2/g, '**2').replace(/x\^y/g, '**').replace(/\^/g, '**');
  // implicit multiply
  s = s.replace(/(\d)\s*\(/g,'$1*(').replace(/\)\(/g,')*(').replace(/(\d)([a-zA-Z])/g,'$1*$2');
  const fn = Function('"use strict"; with(Math){ return (' + s + ') }');
  return fn();
}

// ─── drawing ──────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawAxes();
  drawCurves();
  drawPoints();
}

function drawGrid() {
  const xRange = viewX[1] - viewX[0];
  const yRange = viewY[1] - viewY[0];
  const xStep  = niceStep(xRange / NUM_GRID);
  const yStep  = niceStep(yRange / NUM_GRID);

  ctx.save();
  ctx.strokeStyle = '#1e212e';
  ctx.lineWidth   = 0.5;
  ctx.font        = '11px monospace';
  ctx.fillStyle    = '#5c6078';

  const xStart = Math.ceil(viewX[0] / xStep) * xStep;
  const yStart = Math.ceil(viewY[0] / yStep) * yStep;

  // vertical grid lines + x labels
  for (let x = xStart; x <= viewX[1] + 1e-9; x += xStep) {
    const [sx] = w2s(x, 0);
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, canvas.height - PAD_BOTTOM); ctx.stroke();
    if (Math.abs(x) < 1e-9) continue;
    const label = Math.abs(x) < 100 ? rnd(x) : x.toExponential(1);
    ctx.fillText(label, sx - 14, canvas.height - PAD_BOTTOM + 20);
  }
  // horizontal grid lines + y labels
  for (let y = yStart; y <= viewY[1] + 1e-9; y += yStep) {
    const [, sy] = w2s(0, y + yStep);
    ctx.beginPath(); ctx.moveTo(PAD_LEFT, sy); ctx.lineTo(canvas.width - PAD_RIGHT, sy); ctx.stroke();
    if (Math.abs(y) < 1e-9) continue;
    const label = Math.abs(y) < 100 ? rnd(y) : y.toExponential(1);
    ctx.fillText(label, 4, sy + 4);
  }
  ctx.restore();
}

function drawAxes() {
  const [ox, oy] = w2s(0, 0);
  ctx.save();
  // x-axis
  if (oy > PAD_TOP && oy < canvas.height - PAD_BOTTOM) {
    ctx.strokeStyle = '#3a3e52'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(PAD_LEFT, oy); ctx.lineTo(canvas.width - PAD_RIGHT, oy); ctx.stroke();
  }
  // y-axis
  if (ox > PAD_LEFT && ox < canvas.width - PAD_RIGHT) {
    ctx.strokeStyle = '#3a3e52'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ox, PAD_TOP); ctx.lineTo(ox, canvas.height - PAD_BOTTOM); ctx.stroke();
  }
  // axis labels
  ctx.fillStyle = '#9094a8'; ctx.font = 'bold 12px monospace';
  ctx.fillText('x', canvas.width - PAD_RIGHT + 4, oy + 4);
  ctx.fillText('y', ox - 4, PAD_TOP - 6);

  // tick scale labels
  ctx.fillStyle = '#5c6078'; ctx.font = '10px monospace';
  const xStep = niceStep((viewX[1]-viewX[0])/NUM_GRID);
  const yStep = niceStep((viewY[1]-viewY[0])/NUM_GRID);
  for (let x = Math.ceil(viewX[0]/xStep)*xStep; x<=viewX[1]; x+=xStep) {
    const [sx] = w2s(x,0);
    if (Math.abs(x)>1e-9) ctx.fillText(x.toFixed(1), sx-12, Math.min(oy+12, canvas.height-PAD_BOTTOM+2));
  }
  for (let y = Math.ceil(viewY[0]/yStep)*yStep; y<=viewY[1]; y+=yStep) {
    const [,sy] = w2s(0,y);
    if (Math.abs(y)>1e-9) ctx.fillText(rnd(y), ox+4, sy+4);
  }
  ctx.restore();
}

function drawPoints() {
  points.forEach(p => {
    const [sx, sy] = w2s(p.x, p.y);
    ctx.save();
    // glow
    ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(61,214,140,0.25)'; ctx.fill();
    // dot
    ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI*2);
    ctx.fillStyle = '#3dd68c'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    // label
    ctx.fillStyle = '#e4e6f0'; ctx.font = '11px monospace';
    ctx.fillText(`(${rnd(p.x)}, ${rnd(p.y)})`, sx+8, sy-8);
    ctx.restore();
  });
}

function drawCurves() {
  curves.forEach(({ fn, color, lw }) => {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round';
    ctx.beginPath();
    let moved = false;
    const steps = canvas.width;
    for (let s = 0; s <= steps; s++) {
      const sx = PAD_LEFT + (s / steps) * (canvas.width - PAD_LEFT - PAD_RIGHT);
      const [wx] = s2w(sx, 0);
      let y;
      try { y = evalFunction(fn, wx); } catch(e) { y = NaN; }
      if (!isFinite(y)) { if (moved) ctx.stroke(), ctx.beginPath(), moved=false; continue; }
      const [, sy] = w2s(0, y);
      if (sy < PAD_TOP - 50 || sy > canvas.height + 50) { moved && ctx.stroke(), ctx.beginPath(), moved=false; continue; }
      if (!moved) ctx.moveTo(sx, sy), moved = true;
      else ctx.lineTo(sx, sy);
    }
    if (moved) ctx.stroke();
    // legend
    ctx.fillStyle = color; ctx.font = '11px monospace';
    ctx.fillText(`f(x) = ${fn}`, PAD_LEFT + 8, PAD_TOP + 16);
    ctx.restore();
  });
}

// ─── nice axis step ─────────────────────────────────────────────
function niceStep(range) {
  const rough = range / NUM_GRID;
  const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice  = [1,2,5,10,20,50];
  for (const n of nice) { if (n * mag >= rough * 0.8) return n * mag; }
  return rough;
}

// ─── mouse events ──────────────────────────────────────────────
canvas.addEventListener('mousedown', e => {
  isDragging = true;
  dragStartX  = e.offsetX; dragStartY = e.offsetY;
  viewStartX0 = viewX[0]; viewStartX1 = viewX[1];
  viewStartY0 = viewY[0]; viewStartY1 = viewY[1];
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('mousemove', e => {
  const [wx, wy] = s2w(e.offsetX, e.offsetY);
  $el('coordBox').textContent = `x: ${rnd(wx)}   y: ${rnd(wy)}`;
  const tip = $el('tooltip');
  tip.style.display = 'block';
  tip.style.left = (e.offsetX + 14) + 'px';
  tip.style.top  = (e.offsetY - 28) + 'px';
  tip.textContent = `${rnd(wx)},  ${rnd(wy)}`;

  if (!isDragging) return;
  const dx = (e.offsetX - dragStartX) / (canvas.width - PAD_LEFT - PAD_RIGHT) * (viewStartX1 - viewStartX0);
  const dy = (e.offsetY - dragStartY) / (canvas.height - PAD_TOP - PAD_BOTTOM) * (viewStartY1 - viewStartY0);
  viewX = [viewStartX0 - dx, viewStartX1 - dx];
  viewY = [viewStartY0 + dy, viewStartY1 + dy];
  draw();
}, { passive: true });
canvas.addEventListener('mouseup',   () => { isDragging = false; canvas.style.cursor='crosshair'; });
canvas.addEventListener('mouseleave',() => {
  isDragging = false; canvas.style.cursor='crosshair';
  const t=$el('tooltip'); if(t) t.style.display='none';
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const [mx, my] = [e.offsetX, e.offsetY];
  const [wx0, wy0] = s2w(mx, my);
  const factor = e.deltaY < 0 ? 0.85 : 1.18;
  const xR = viewX[1]-viewX[0];
  const newX = [wx0+xR*(1-factor)*(mx-PAD_LEFT)/(canvas.width-PAD_LEFT-PAD_RIGHT),
                wx0+xR*(factor-1)*(mx-PAD_LEFT)/(canvas.width-PAD_LEFT-PAD_RIGHT)+xR*factor];
  const yR = viewY[1]-viewY[0];
  const newY = [wy0+yR*(1-factor)*(my-PAD_TOP)/(canvas.height-PAD_TOP-PAD_BOTTOM),
                wy0+yR*(factor-1)*(my-PAD_TOP)/(canvas.height-PAD_TOP-PAD_BOTTOM)+yR*factor];
  viewX=newX; viewY=newY;
  draw();
}, { passive: false });

// ─── point list (coordinate input) ────────────────────────────
function addPointRow() {
  const container = $el('pointList');
  const row = document.createElement('div');
  row.className = 'coord-row';
  const numEl = document.createElement('span');
  numEl.className = 'point-num';
  numEl.textContent = points.length + 1;
  const xIn = document.createElement('input'); xIn.type='number'; xIn.placeholder='x';
  const yIn = document.createElement('input'); yIn.placeholder='y'; yIn.type='number';
  const btn = document.createElement('button'); btn.className='btn-del'; btn.textContent='✕';
  btn.onclick = () => { container.removeChild(row); rebuildPoints(); };
  // enter to commit
  yIn.addEventListener('keydown', e => { if(e.key==='Enter'){rebuildPoints();replotAll();} });
  row.appendChild(numEl); row.appendChild(xIn); row.appendChild(yIn); row.appendChild(btn);
  container.appendChild(row);
}

function rebuildPoints() {
  const rows = document.querySelectorAll('.coord-row');
  points = [];
  rows.forEach(row => {
    const xs = row.querySelectorAll('input')[0].value;
    const ys = row.querySelectorAll('input')[1].value;
    if (xs!==''&&ys!=='') points.push({x:+xs, y:+ys});
  });
  updateDump();
}

function updateDump() {
  const dump = $el('coordDump');
  dump.textContent = points.length
    ? points.map(p => `(${rnd(p.x)}, ${rnd(p.y)})`).join('\n')
    : 'No points';
  updateStats();
}

function updateStats() {
  const $v = $el('statVal');
  if (points.length === 0) { $v.textContent='—'; return; }
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  const xm=xs.reduce((s,v)=>s+v,0)/xs.length;
  const ym=ys.reduce((s,v)=>s+v,0)/ys.length;
  const sx=xs.reduce((s,v)=>s+(v-xm)**2,0)/(xs.length-1||1);
  const sy=ys.reduce((s,v)=>s+(v-ym)**2,0)/(ys.length-1||1);
  const r=(xs.reduce((s,v,i)=>s+(v-xm)*(ys[i]-ym),0))/Math.sqrt(sx*sy+1e-9);
  $v.innerHTML = `
    <span style="color:#9094a8">Points:</span> ${points.length}<br/>
    <span style="color:#9094a8">Mean:</span> (${rnd(xm)}, ${rnd(ym)})<br/>
    <span style="color:#9094a8">Std Dev X/Y:</span> ${rnd(Math.sqrt(sx*1))} / ${rnd(Math.sqrt(sy*1))}<br/>
    <span style="color:#9094a8">Correlation r:</span> ${rnd(r)}
  `;
}

function replotAll() {
  rebuildPoints();
  autoFitY();
  draw();
  updateDump();
  $el('statVal').textContent =
    points.length ? `${points.length} points  ·  y∈[${rnd(viewY[0])}, ${rnd(viewY[1])}]` : 'No data';
}

// ─── public ────────────────────────────────────────────────────
function GRAPH_init() {
  // add 3 empty point rows
  for (let i = 0; i < 3; i++) addPointRow();
  updateDump();

  $el('btnAddPoint').onclick   = addPointRow;
  $el('btnPlotFunc').onclick   = () => plotFunction();
  $el('btnClearAll').onclick   = () => {
    points = []; curves = [];
    $el('pointList').innerHTML = '';
    for (let i = 0; i < 3; i++) addPointRow();
    updateDump(); autoFitY(); draw();
    $el('statVal').textContent = 'No data';
  };

  // initial plot
  autoFitY(); draw();
}

function plotFunction() {
  const expr = $el('funcExpr').value.trim();
  if (!expr) return;
  const color = $el('colorPicker').value;
  const lw    = +$el('lineWidthPicker').value;
  curves.push({ fn: expr, color, lw });
  try {
    evalFunction(expr, 1); // validate
  } catch (e) {
    $el('statVal').className = 'rval error-val';
    $el('statVal').textContent = 'Error: ' + e.message;
    curves.pop(); return;
  }
  replotAll();
  $el('statVal').className = 'rval';
  $el('statVal').textContent =
    `f(x)=${expr}  ·  x∈[${$el('xRangeMin').value}, ${$el('xRangeMax').value}]`;
}

// set x-range when user submits range
$el('xRangeMin').addEventListener('change', ()=>{ if(!curves.length) replotAll(); });
$el('xRangeMax').addEventListener('change', ()=>{ if(!curves.length) replotAll(); });

// ─── $el helper ────────────────────────────────────────────────
function $el(id) { return document.getElementById(id); }

// ─── num pretty ─────────────────────────────────────────────────
function rnd(n) {
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (Math.abs(n) < 1e-14) return 0;
  return parseFloat(n.toPrecision(8));
}

// ─── DOM ready ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  GRAPH_init();
});
