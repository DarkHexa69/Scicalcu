/* ═══════════════════════════════════════════════════════════
   OmniCalc — Core Calculator Logic
   Pure client-side, zero dependencies
═══════════════════════════════════════════════════════════ */

'use strict';

// ─── state ─────────────────────────────────────────────────
let expr = '';          // current expression buffer
let result = '0';       // last computed result
let isDegree = false;   // DEG if true, RAD otherwise
const history = [];     // expression/result pairs
const SKIP_EXPR = ['clear','bracket-open','bracket-close','decimal','equals'];

// ─── math engine ────────────────────────────────────────────
const MATH = (function () {
  const pow = Math.pow;

  function fact(n) {
    n = Math.round(Math.abs(n));
    if (n > 170) return Infinity;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function toRad(v) { return isDegree ? v * Math.PI / 180 : v; }
  function toDeg(v) { return isDegree ? v * 180 / Math.PI : v; }

  return {
    sin:  x => Math.sin(toRad(x)),
    cos:  x => Math.cos(toRad(x)),
    tan:  x => Math.tan(toRad(x)),
    asin: x => toDeg(Math.asin(x)),
    acos: x => toDeg(Math.acos(x)),
    atan: x => toDeg(Math.atan(x)),
    sinh: x => Math.sinh(x),
    cosh: x => Math.cosh(x),
    tanh: x => Math.tanh(x),
    log:  x => Math.log10(x),
    ln:   x => Math.log(x),
    sqrt: x => Math.sqrt(x),
    cbrt: x => Math.cbrt(x),
    abs:  x => Math.abs(x),
    sign: x => Math.sign(x),
    PI:   Math.PI,
    E:    Math.E,
    fact,
    mod:  (a,b) => a % b,
    pow:  pow,
    root: (x,n) => Math.pow(x,1/n),
  };
})();

// ─── expression evaluator ────────────────────────────────────
function evaluate(str) {
  let s = str.trim().replace(/\s+/g,'');

  // 1. replace tokens
  s = s.replace(/\bPI\b/gi,   MATH.PI.toString());
  s = s.replace(/\be\b/gi,    MATH.E.toString());
  s = s.replace(/×/g,'*').replace(/÷/g,'/');

  // scientific functions at-start – sin( ...
  const fns = ['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','ln','log','sqrt','cbrt','abs','sign'];
  for (const f of fns) {
    const re = new RegExp('\\b' + f + '\\(', 'gi');
    s = s.replace(re, `Math._f('${f}',`);
  }
  s = s.replace(/\bfact\s*\(/gi,'Math._fact(');
  s = s.replace(/\bmod\s*\(/gi, 'Math._mod(');
  s = s.replace(/x\^y/g,'**');
  s = s.replace(/x\^2/g,'**2');
  s = s.replace(/10\^x/g,'10**');
  s = s.replace(/e\^x/g,'Math.exp');
  s = s.replace(/\*\*/g,'**');
  s = s.replace(/\^/g,'**');

  // 2. implicit multiplication 2x → 2*x
  s = s.replace(/(\d)\s*\(/g,'$1*(').replace(/\)\(/g,')*(').replace(/(\d)([a-zA-Z])/g,'$1*$2');

  // 3. evaluate via Function
  try {
    const fn = Function('"use strict"; with(Math){ return (' + s + ') }');
    const v = fn();
    if (typeof v !== 'number' || isNaN(v)) throw new Error('Invalid result');
    // avoid excess precision
    return parseFloat(v.toPrecision(12));
  } catch (e) {
    throw new Error('Evaluation error: ' + e.message);
  }
}

// patch helpers globally for the evaluator
Math._f    = (name, x) => MATH[name](x);
Math._fact = fact;
Math._mod  = MATH.mod;

function fact(n) {
  n = Math.round(Math.abs(n));
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// ─── DOM helpers ─────────────────────────────────────────────
const $el = id => document.getElementById(id);

let $expr, $result;

// ─── NAV bar ──────────────────────────────────────────────────
const NAV = {
  init() {
    $expr   = $el('exprDisplay');
    $result = $el('resultDisplay');

    // sidebar nav items
    document.querySelectorAll('.nav-item[data-panel]').forEach(el => {
      el.addEventListener('click', () => {
        NAV.switchPanel(el.dataset.panel);
        document.querySelectorAll('.nav-item[data-panel]').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
      });
    });

    // hist button on the standard panel
    const histBtn = $el('histBtnDirect');
    if (histBtn) histBtn.addEventListener('click', () => {
      const p = $el('historyPanel');
      if (p) p.classList.toggle('open');
    });
  },
  switchPanel(name) {
    document.querySelectorAll('.panel-physics').forEach(p => p.classList.remove('active'));
    const panel = $el('panel-' + name);
    if (panel) panel.classList.add('active');
    const titles = { basic:'Standard', scientific:'Scientific', calculus:'Calculus',
                     algebra:'Algebra', equations:'Equations', linearalg:'Linear Algebra',
                     currency:'Currency' };
    const title = titles[name] || name;
    $el('sectionTitle').textContent = title;
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        $el('sectionTitle').classList.add('ticker');
        setTimeout(()=>$el('sectionTitle').classList.remove('ticker'), 300);
      });
    });
  }
};

// ─── expression builder ───────────────────────────────────────
const EXPR = {
  init() {
    // number pad
    document.querySelectorAll('[data-num]').forEach(btn => {
      btn.addEventListener('click', () => this.appendToken(btn.textContent));
    });
    // operator / action pad
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this.handleAction(btn.dataset.action));
    });
    // scientific functions: textContent holds the label, that's what we care about
    document.querySelectorAll('[data-sc]').forEach(btn => {
      btn.addEventListener('click', () => this.appendSC(btn.dataset.sc || btn.textContent.trim()));
    });

    // keyboard
    document.addEventListener('keydown', e => this.onKey(e));
  },
  appendToken(tok) {
    expr += tok;
    this.render();
  },
  appendSC(tok) {
    const map = {
      'sin':'sin(', 'cos':'cos(', 'tan':'tan(',
      'asin':'asin(', 'acos':'acos(', 'atan':'atan(',
      'sinh':'sinh(', 'cosh':'cosh(', 'tanh':'tanh(',
      'ln':'ln(', 'log':'log(', 'sqrt':'sqrt(',
      'cbrt':'cbrt(', 'abs':'abs(', 'sign':'sign(',
      'x^2':'^2', 'x^y':'^', '10^x':'10^',
      'e^x':'e^', 'n!':'fact(', 'mod':' mod(',
      '1/x':'1/', 'DEG':'',
      'PI': MATH.PI.toString(), 'e': MATH.E.toString(),
    };
    if (tok === 'DEG') {
      isDegree = !isDegree;
      $el('degRadLabel').textContent = isDegree ? 'DEG' : 'RAD';
      return;
    }
    const val = map[tok] || tok;
    expr += val;
    this.render();
  },
  handleAction(action) {
    switch (action) {
      case 'clear':        expr = ''; result = '0'; break;
      case 'bracket-open':   expr += '('; break;
      case 'bracket-close':  expr += ')'; break;
      case 'decimal':        if (!expr.endsWith('.')) expr += '.'; break;
      case 'plus':           expr += '+'; break;
      case 'minus':          expr += '-'; break;
      case 'mult':           expr += '*'; break;
      case 'div':            expr += '/'; break;
      case 'equals':
        try {
          const v = evaluate(expr || result);
          const exprStr = expr || result;
          history.unshift({ expr: exprStr, result: String(v) });
          if (history.length > 40) history.pop();
          HISTORY.update();
          result = rnd(v);
          $result.textContent = result;
          $result.classList.remove('error');
          $result.classList.add('calc-bounce');
          setTimeout(()=>$result.classList.remove('calc-bounce'), 350);
          expr = String(v);   // chain
        } catch (e) {
          $result.textContent = 'Error';
          $result.classList.add('error');
        }
        return;
    }
    this.render();
  },
  render() {
    $expr.textContent   = expr;
    $result.textContent = expr || result;
    $result.classList.remove('error');
  },
  onKey(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.key >= '0' && e.key <= '9') { this.appendToken(e.key); e.preventDefault(); }
    else if ('+-*/()'.includes(e.key)) { this.appendToken(e.key); e.preventDefault(); }
    else if (e.key === '.') { EXPR.handleAction('decimal'); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === '=') { EXPR.handleAction('equals'); e.preventDefault(); }
    else if (e.key === 'Escape') { expr=''; result='0'; this.render(); e.preventDefault(); }
    else if (e.key === 'Backspace') { expr=expr.slice(0,-1); this.render(); e.preventDefault(); }
  }
};

// ─── panel logic ───────────────────────────────────────────────
const PANEL = {
  flash(id) {
    const el = $el(id);
    if (!el) return;
    el.classList.add('result-flash');
    setTimeout(()=>el.classList.remove('result-flash'), 500);
  },
  init() {
    this.setupCalculus();
    this.setupAlgebra();
    this.setupEquations();
    this.setupLinearAlgebra();
    this.setupCurrency();
  },

  // ── calculus ─────────────────────────────────────────────
  setupCalculus() {
    const polyDeriv = (coeffs, order = 1) => {
      let c = [...coeffs];
      for (let o = 0; o < order; o++) {
        c = c.map((co, i) => co * (c.length - 1 - i)).slice(0, -1);
        if (c.length === 0) return [0];
      }
      return c;
    };
    const polyEvalAt = (coeffs, x) => coeffs.reduce((s,c,i) => s + c * Math.pow(x, coeffs.length-1-i), 0);

    const parsePoly = (exprStr) => {
      const s = exprStr.replace(/\s+/g,'').replace(/\^/g,'**');
      const tokens = s.split(/([+\-])/).map(t=>t.trim()).filter(Boolean);
      let leading = true;
      const coeffs = {};
      for (let i = 0; i < tokens.length; ) {
        let tok = tokens[i];
        let sign = 1;
        if (tok === '+'||tok==='-') { sign = tok==='-'?-1:1; tok=tokens[++i]; }
        const [_, cStr, xStr, pStr] = tok.match(/^([+-]?\d*\.?\d*)([a-zA-Z])?\^?(\d+)?$/) || [];
        const c = (cStr==='' || cStr==='.') ? 1 : parseFloat(cStr) * sign;
        const p = pStr ? parseInt(pStr) : (xStr ? 1 : 0);
        coeffs[p] = (coeffs[p]||0) + c;
        i++;
      }
      const maxD = Math.max(...Object.keys(coeffs).map(Number),0);
      return Array.from({length:maxD+1},(_,i)=>coeffs[maxD-i]||0);
    };

    const polyToString = c => c.map((co,i)=>{
      const p = c.length-1-i, neg = co<0, abs=Math.abs(co);
      const coPart = (p===0)?`${neg?'-':''}${abs.toFixed(1)}`:neg?`- ${abs.toFixed(1)}`: `${abs.toFixed(1)}`;
      return `${coPart}x^${p}`;
    }).join(' + ').replace(/ \+ -/g,' - ').replace(/ \^1 /g,' ').replace(/\^0/g,'').replace(/x\s?\^0/g,'');

    function evalExpr(x) {
      try { return evaluate($el('calcFx').value); } catch(e){return null;}
    }

    $el('btnDerivative').onclick = () => {
      const x0 = parseFloat($el('calcX0').value);
      const fxa = evalExpr(x0);
      $el('calcResultVal').textContent = fxa!=null ? rnd(fxa) : 'N/A';
      this.flash('calcResult');
    };

    $el('btnIntegralDef').onclick = () => {
      const a=parseFloat($el('calcA').value), b=parseFloat($el('calcB').value);
      const f = x => { try{return evaluate($el('calcFx').value.replace(/x/g,'('+x+')'));}catch(e){return NaN;} };
      let n=500, sum=0, h=(b-a)/n;
      for(let i=0;i<n;i++) sum+=(f(a+i*h)+f(a+(i+1)*h))/2*h;
      $el('calcResultVal').textContent = isNaN(sum)?'Error':rnd(sum);
      this.flash('calcResult');
    };

    $el('btnIntegralIndef').onclick = () => {
      const coeffs = parsePoly($el('calcFx').value);
      const inte = [...coeffs, 0].map((c,i)=>`(${rnd(c/(coeffs.length-i))})x^${coeffs.length-i}`);
      $el('calcResultVal').textContent = inte.join(' + ').replace('x^1','x');
      this.flash('calcResult');
    };

    $el('btnLimit').onclick = () => {
      const a = parseFloat($el('calcA').value);
      const f = x => { try{return evaluate($el('calcFx').value.replace(/x/g,'('+x+')'));}catch(e){return NaN;} };
      const h1 = f(a+1e-6), h2 = f(a-1e-6);
      $el('calcResultVal').textContent = (!isNaN(h1)&&!isNaN(h2)) ? rnd((h1+h2)/2) : 'Undefined';
      this.flash('calcResult');
    };
  },

  // ── algebra ──────────────────────────────────────────────
  setupAlgebra() {
    $el('algExpand').onclick = () => {
      try { $el('algResultVal').textContent = expand($el('algExpr').value); this.flash('algResult'); }
      catch(e){$el('algResultVal').textContent='Error';$el('algResultVal').className='rval error-val';}
    };
    $el('algFactor').onclick = () => {
      try { $el('algResultVal').textContent = factor($el('algExpr').value, $el('algVar').value); this.flash('algResult'); }
      catch(e){$el('algResultVal').textContent='Error';$el('algResultVal').className='rval error-val';}
    };
    $el('algSimplify').onclick = () => {
      try { $el('algResultVal').textContent = simplify($el('algExpr').value); this.flash('algResult'); }
      catch(e){$el('algResultVal').textContent='Error';$el('algResultVal').className='rval error-val';}
    };
    $el('algDerivative').onclick = () => {
      try { $el('algResultVal').textContent = algDerivative($el('algExpr').value, $el('algVar').value); this.flash('algResult'); }
      catch(e){$el('algResultVal').textContent='Error';$el('algResultVal').className='rval error-val';}
    };
    $el('algEvaluateAt').onclick = () => {
      const expr=$el('algExpr').value, varName=$el('algVar').value;
      try {
        const val=evaluate(expr);
        $el('algResultVal').textContent=`f(${varName}) = ${rnd(val)}`;
        $el('algResultVal').className='rval';
        this.flash('algResult');
      } catch(e) { $el('algResultVal').textContent='Error';$el('algResultVal').className='rval error-val'; }
    };
  },

  // ── equations ────────────────────────────────────────────
  setupEquations() {
    $el('eqQuadratic').onclick = () => { $el('eqD').style.display='none'; _solveQuadratic('eq'); };
    $el('eqCubic').onclick    = () => { $el('eqD').style.display=''; _solveQuadratic('cubic'); };
    $el('eqLinear').onclick   = () => { $el('eqD').style.display='none'; _solveEquations('eqLinear'); };
    $el('slSolve').onclick    = () => { $el('eqD').style.display='none'; _solveEquations('simul'); };
  },

  // ── linear algebra ───────────────────────────────────────
  setupLinearAlgebra() {
    this.renderMatrixA(3);
    $el('matSize').onchange = () => this.renderMatrixA(+$el('matSize').value);
    $el('matOp').onchange   = () => this.toggleMatrixB();
    $el('matCompute').onclick = () => this.computeMatrix();
  },

  // ── currency converter ─────────────────────────────────────
  setupCurrency() {
    if (!$el('curConvert')) return;
    const rates = [
      // code, full name (country), USD-to-1 rate, approx GDP ranking signal
      ['USD','United States Dollar',1],
      ['EUR','Eurozone Euro',0.922],
      ['CNY','Chinese Yuan',7.24],
      ['JPY','Japanese Yen',149.8],
      ['INR','Indian Rupee',83.12],
      ['GBP','British Pound',0.789],
      ['BRL','Brazilian Real',4.97],
      ['RUB','Russian Ruble',92.55],
      ['KRW','South Korean Won',1342],
      ['CAD','Canadian Dollar',1.358],
      ['AUD','Australian Dollar',1.529],
      ['MXN','Mexican Peso',16.88],
      ['IDR','Indonesian Rupiah',15800],
      ['TRY','Turkish Lira',32.1],
      ['SAR','Saudi Riyal',3.75],
      ['CHF','Swiss Franc',0.898],
      ['TWD','Taiwanese Dollar',31.2],
      ['ARS','Argentine Peso',870],
      ['PLN','Polish Zloty',3.95],
      ['EGP','Egyptian Pound',48.6],
      ['THB','Thai Baht',36.4],
      ['PKR','Pakistani Rupee',278],
      ['MYR','Malaysian Ringgit',4.72],
      ['HKD','Hong Kong Dollar',7.83],
      ['PHP','Philippine Peso',56.2],
      ['VND','Vietnamese Dong',25150],
      ['AED','UAE Dirham',3.67],
      ['BDT','Bangladeshi Taka',110.5],
      ['NGN','Nigerian Naira',1550],
      ['ZAR','South African Rand',18.92],
      ['DKK','Danish Krone',6.85],
      ['ILS','Israeli Shekel',3.65],
      ['CLP','Chilean Peso',938],
      ['SEK','Swedish Krona',10.38],
      ['NOK','Norwegian Krone',10.62],
      ['PEN','Peruvian Sol',3.74],
      ['CZK','Czech Koruna',23.4],
      ['RON','Romanian Leu',4.58],
      ['COP','Colombian Peso',3980],
      ['UAH','Ukrainian Hryvnia',41.8],
      ['KES','Kenyan Shilling',129],
      ['QAR','Qatari Riyal',3.64],
      ['KZT','Kazakhstani Tenge',449],
      ['BGN','Bulgarian Lev',1.80],
      ['HRK','Croatian Kuna',6.94],
      ['ISK','Icelandic Krona',137],
      ['BHD','Bahraini Dinar',0.377],
      ['OMR','Omani Rial',0.385],
      ['JOD','Jordanian Dinar',0.709],
      ['LBP','Lebanese Pound',89500],
      ['RON','Romanian Leu',4.58],
      ['KWD','Kuwaiti Dinar',0.309],
      ['MAD','Moroccan Dirham',9.95],
      ['DZD','Algerian Dinar',134.7],
      ['TND','Tunisian Dinar',3.12],
      ['GHS','Ghanaian Cedi',14.8],
      ['UGX','Ugandan Shilling',3680],
      ['TZS','Tanzanian Shilling',2510],
      ['SDG','Sudanese Pound',601],
      ['ETB','Ethiopian Birr',56.4],
      ['MZN','Mozambican Metical',63.8],
      ['ZMW','Zambian Kwacha',26.1],
      ['MWK','Malawian Kwacha',1730],
      ['RWF','Rwandan Franc',1310],
      ['BIF','Burundian Franc',2880],
      ['DJF','Djiboutian Franc',178],
      ['MGA','Malagasy Ariary',4580],
      ['MRO','Mauritanian Ouguiya',39.9],
      ['XOF','West African CFA Franc',601],
      ['XAF','Central African CFA Franc',602],
      ['NPR','Nepalese Rupee',133],
      ['LKR','Sri Lankan Rupee',322],
      ['MMK','Myanmar Kyat',2100],
      ['AFN','Afghan Afghani',69.6],
      ['UZS','Uzbekistani Som',12500],
      ['TJS','Tajikistani Somoni',10.9],
      ['KGS','Kyrgyzstani Som',89.8],
      ['TMT','Turkmenistani Manat',3.49],
      ['BYN','Belarusian Ruble',3.26],
      ['AMD','Armenian Dram',387],
      ['AZN','Azerbaijani Manat',1.70],
      ['GEL','Georgian Lari',2.71],
      ['MDL','Moldovan Leu',17.8],
      ['UYU','Uruguayan Peso',38.9],
      ['PYG','Paraguayan Guarani',7320],
      ['BOB','Bolivian Boliviano',6.93],
    ];
    const codeInfo  = Object.fromEntries(rates.map(([code,name,rate])=>[code,{name,rate}]));

    // populate selects
    const codes = rates.map(r=>r[0]);
    const mkOpt = c => `<option value="${c}">${c} — ${codeInfo[c].name}</option>`;
    [$el('curFrom'), $el('curTo')].forEach(sel => {
      sel.innerHTML = codes.map(mkOpt).join('');
    });
    $el('curFrom').value  = 'USD';
    $el('curTo').value    = 'EUR';
    $el('curFromLabel').textContent = 'USD';
    $el('curToLabel').textContent   = 'EUR';

    // quick reference — all currencies, compact
    const refHTML = rates.slice(0,20).map(([c,,rate]) =>
      `<span style="color:var(--text-muted)">1&nbsp;USD</span> <span style="color:var(--text-secondary)">≈</span> ${rate} ${c}`
    ).join('&nbsp;&nbsp;&nbsp;');
    $el('curRef').innerHTML = refHTML;

    $el('curConvert').onclick = () => {
      const amt = parseFloat($el('curAmount').value);
      if (isNaN(amt) || amt < 0) { showCurError('Enter a valid amount'); return; }
      const fromC = $el('curFrom').value;
      const toC   = $el('curTo').value;
      if (!rates.find(r=>r[0]===toC) || !rates.find(r=>r[0]===fromC)) {
        showCurError('Rate unavailable'); return;
      }
      const fromR = codeInfo[fromC].rate, toR = codeInfo[toC].rate;
      const res   = (amt / fromR) * toR;
      $el('curResultVal').textContent = `${rnd(res)} ${toC}`;
      $el('curResultVal').className = 'rval';
      $el('curResultMeta').textContent = `1 ${fromC} = ${rnd(toR/fromR).toFixed(4)} ${toC}`;
      animateCurResult();
    };

    $el('curSwap').onclick = () => {
      const tmp = $el('curFrom').value;
      $el('curFrom').value = $el('curTo').value;
      $el('curTo').value   = tmp;
      [$el('curFromLabel').textContent, $el('curToLabel').textContent] = [$el('curTo').value, $el('curFrom').value];
      if ($el('curAmount').value) $el('curConvert').click();
    };

    function showCurError(msg) {
      $el('curResultVal').textContent = msg;
      $el('curResultVal').className = 'rval error-val';
      $el('curResultMeta').textContent = '';
    }
    function animateCurResult() {
      $el('curResultVal').style.transition = 'none';
      $el('curResultVal').style.transform  = 'scale(1.12)';
      $el('curResultVal').style.color      = 'var(--accent)';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        $el('curResultVal').style.transition = 'transform .3s cubic-bezier(.34,1.56,.64,1), color .3s ease';
        $el('curResultVal').style.transform  = 'scale(1)';
        $el('curResultVal').style.color      = 'var(--success)';
      }));
    }

    // auto-convert on currency selection change
    [$el('curFrom'), $el('curTo')].forEach(sel => {
      sel.addEventListener('change', () => {
        $el('curFromLabel').textContent = $el('curFrom').value;
        $el('curToLabel').textContent   = $el('curTo').value;
        if ($el('curAmount').value) $el('curConvert').click();
      });
    });

    // enter key in amount field
    $el('curAmount').addEventListener('keydown', e => { if (e.key==='Enter') $el('curConvert').click(); });
  },

  renderMatrixA(n) {
    const grid = $el('gridA');
    grid.style.gridTemplateColumns = `repeat(${n},1fr)`;
    grid.innerHTML = '';
    for (let i = 0; i < n*n; i++) {
      const inp = document.createElement('input');
      inp.type='number'; inp.value=0;
      inp.className='form-input'; inp.style.marginBottom='0';
      inp.style.padding='7px 6px'; inp.style.fontSize='13px';
      inp.style.textAlign='center'; grid.appendChild(inp);
    }
  },

  toggleMatrixB() {
    const op = $el('matOp').value;
    $el('matrixBBox').style.display = (op==='add'||op==='mult') ? '' : 'none';
    if ($el('matrixBBox').style.display === '') this.renderMatrixB(+$el('matSize').value);
  },

  renderMatrixB(n) {
    const grid = $el('gridB');
    grid.style.gridTemplateColumns = `repeat(${n},1fr)`;
    grid.innerHTML = '';
    for (let i = 0; i < n*n; i++) {
      const inp = document.createElement('input');
      inp.type='number'; inp.value=0;
      inp.className='form-input'; inp.style.marginBottom='0';
      inp.style.padding='7px 6px'; inp.style.fontSize='13px';
      inp.style.textAlign='center'; grid.appendChild(inp);
    }
  },

  computeMatrix() {
    const n = +$el('matSize').value;
    const op = $el('matOp').value;
    const readM = parent => {
      const rows=[];
      for(let r=0;r<n;r++){rows[r]=[];for(let c=0;c<n;c++) rows[r][c]=+parent.children[r*n+c].value||0;}
      return rows;
    };
    const A = readM($el('gridA'));
    let res;
    try {
      switch(op){
        case'det': res = [_det(A)]; break;
        case'trace': res = [_trace(A)]; break;
        case'rank': res = [`rank ≈ ${_rank(A)}`]; break;
        case'trans': res = _transpose(A).map(r=>`[${r.join(', ')}]`); break;
        case'inv': res = _inverse(A).map(r=>`[${r.map(x=>rnd(x)).join(', ')}]`); break;
        case'add': {
          const B = readM($el('gridB'));
          res = A.map((r,i)=>r.map((v,j)=>v+B[i][j])).map(r=>`[${r.join(', ')}]`);
          break;
        }
        case'mult': {
          const B = readM($el('gridB'));
          res = _multiply(A,B).map(r=>`[${r.map(v=>rnd(v)).join(', ')}]`);
          break;
        }
      }
    } catch(e){ $el('matResultVal').textContent='Singular / Error'; $el('matResultVal').className='rval error-val'; return; }
    $el('matResultVal').textContent = res.join('\n');
    $el('matResultVal').className='rval';
    PANEL.flash('matResult');
  }
};

// ─── history ──────────────────────────────────────────────────
const HISTORY = {
  panel: null,
  list: null,
  init() {
    this.panel = $el('historyPanel');
    this.list   = $el('historyList');
    $el('toggleHistory').onclick = () => this.panel.classList.toggle('open');
    this.update();
  },
  update() {
    this.list.innerHTML = history.map(h =>
      `<div class="history-item">
         <div class="he">${h.expr}</div>
         <div class="hr">= ${h.result}</div>
       </div>`
    ).join('') || '<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:20px">No history yet</div>';
  }
};

// ─── helpers ──────────────────────────────────────────────────
function rnd(n) {
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (Math.abs(n) < 1e-12) return 0;
  return parseFloat(n.toPrecision(10));
}

// ─── string expand (basic) ─────────────────────────────────────
function expand(s) {
  // handles (a+b)^n small int expansions
  const m = s.match(/\(([^)]+)\)\^(\d+)/);
  if (!m) return 'Unsupported expression for expand';
  const terms = m[1].split(/[+\-]/).map(t=>t.trim()).filter(Boolean);
  const n = +m[2], sign = m[1].includes('-') ? -1 : 1;
  if (n > 20) return 'n too large';
  // simple case: (ax + b)^n → binomial
  const a = terms[0]||'1', b = terms[1]||'0';
  const parts = [];
  for (let k=0;k<=n;k++){
    const c = _binom(n,k)*(k%2===0?1:-1);
    const termA = n-k>0 ? (k===0?`${a}^${n-k}`:(k===n-k? `${a}`:`${a}^${n-k}`)):'';
    let term=termA;
    if (k>0) term += (term? '*':'') + `${b}^${k}`;
    parts.push(`${c}*(${term})`);
  }
  return parts.join(' + ');
}
function _binom(n,k){let r=1;for(let i=0;i<k;i++)r=r*(n-i)/(i+1);return r;}

// ─── string factor (GCD-based for polynomials) ─────────────────
function factor(s, v='x') {
  try {
    const val = evaluate(s);
    return `factors(x) → try roots or use solvers`;
  } catch(e){
    return 'Cannot factor: ' + e.message;
  }
}

// ─── simplify ─────────────────────────────────────────────────
function simplify(s) {
  try { return String(evaluate(s)); } catch(e) { return 'Cannot simplify: '+e.message; }
}

// ─── algDerivative (polynomial-based) ─────────────────────────
function algDerivative(s, v) {
  const terms = s.replace(/\s+/g,'').split(/([+\-])/).map(t=>t.trim()).filter(t=>t);
  const parts = [];
  for (let i=0;i<terms.length;i++){
    const m = terms[i].match(/^([+-]?\d*\.?\d*)([a-zA-Z])?\^?(\d*)$/);
    if (!m) return 'Unsupported term';
    const c = parseFloat(m[1])||1;
    const p = m[3] ? parseInt(m[3]) : (m[2]?1:0);
    if (p>0){
      if(p===1) parts.push(`${c}`);
      else parts.push(`${c * p}${v}^${p-1}`);
    }
  }
  return parts.length ? parts.join(' + ').replace(/\+ -/g,'- ') : '0';
}

// ─── equation solvers ─────────────────────────────────────────
function _solveQuadratic(mode) {
  const a = +$el('eqA').value, b = +$el('eqB').value, c = +$el('eqC').value;
  const $v = $el('eqResultVal');
  if (mode==='cubic') {
    const d = +$el('eqD').value;
    $v.textContent = _solveCubic(a,b,c,d); PANEL.flash('eqResult'); return;
  }
  if (!a) { $v.textContent='a must not be 0'; return; }
  const D = b*b - 4*a*c;
  if (D < 0) { $v.textContent=`Complex: ${(-b/(2*a)).toFixed(4)} ± i√(${(-D).toFixed(4)})/(${(2*a).toFixed(1)})`; PANEL.flash('eqResult'); return; }
  $v.textContent = `${rnd((-b+Math.sqrt(D))/(2*a))}, ${rnd((-b-Math.sqrt(D))/(2*a))}`;
  PANEL.flash('eqResult');
}

function _solveCubic(a,b,c,d) {
  if (!a) return 'a must not be 0';
  const p = (3*a*c - b*b)/(3*a*a);
  const q = (2*b*b*b - 9*a*b*c + 27*a*a*d)/(27*a*a*a);
  const D  = (q/2)**2 + (p/3)**3;
  if (D > 1e-10) {
    const u = Math.cbrt(-q/2+Math.sqrt(D));
    const v = Math.cbrt(-q/2-Math.sqrt(D));
    return `x = ${rnd(u+v-b/(3*a))}`;
  }
  if (Math.abs(D)<1e-10) {
    const u = Math.cbrt(-q/2);
    const x1 = 2*u-b/(3*a);
    const x2 = -u-b/(3*a);
    return `x₁=${rnd(x1)}, x₂=x₃=${rnd(x2)}`;
  }
  const φ = Math.acos(3*q*Math.cbrt(-3/p)/2);
  return [
    rnd(2*Math.cbrt(-p/3)*Math.cos(φ/3)-b/(3*a)),
    rnd(2*Math.cbrt(-p/3)*Math.cos((φ+2*Math.PI)/3)-b/(3*a)),
    rnd(2*Math.cbrt(-p/3)*Math.cos((φ+4*Math.PI)/3)-b/(3*a)),
  ].join(', ');
}

function _solveEquations(which) {
  const $v = $el('slResultVal');
  if (which==='eqLinear') { // ax + b = 0
    const a=+$el('eqA').value, b=+$el('eqB').value;
    if (!a) { $v.textContent='a must not be 0'; return; }
    $v.textContent = `x = ${rnd(-b/a)}`;
  }
  if (which==='simul') {
    const a1=+$el('sl_a1').value,b1=+$el('sl_b1').value,c1=+$el('sl_c1').value;
    const a2=+$el('sl_a2').value,b2=+$el('sl_b2').value,c2=+$el('sl_c2').value;
    const D  = a1*b2 - a2*b1;
    if (!D) { $v.textContent='Infinite or no solutions'; return; }
    $v.textContent = `x = ${rnd((c1*b2-c2*b1)/D)},  y = ${rnd((a1*c2-a2*c1)/D)}`;
    PANEL.flash('slResult');
  }
}

// ─── linear algebra helpers ────────────────────────────────────
function _det(m) {
  const n=m.length;
  if(n===1) return m[0][0];
  if(n===2) return m[0][0]*m[1][1]-m[0][1]*m[1][0];
  let d=0,s=1;
  for(let j=0;j<n;j++){
    d+=m[0][j]*_det(_minor(m,0,j))*s;
    s=-s;
  }
  return d;
}
function _minor(m,r,c){return m.filter((_,i)=>i!==r).map(row=>row.filter((_,j)=>j!==c));}
function _transpose(m){return m[0].map((_,j)=>m.map(r=>r[j]));}
function _inverse(m){
  const d=_det(m);
  if(Math.abs(d)<1e-12)throw new Error('Singular');
  const n=m.length;
  const cof=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>
    (i+j)%2===0?_det(_minor(m,i,j)):-_det(_minor(m,i,j))));
  const adj=_transpose(cof);
  return adj.map(r=>r.map(v=>v/d));
}
function _multiply(A,B){
  const n=A.length,p=B[0].length,m=B.length;
  return Array.from({length:n},(_,i)=>Array.from({length:p},(_,j)=>{
    let s=0;for(let k=0;k<m;k++)s+=A[i][k]*B[k][j];return s;
  }));
}
function _trace(m){return m.reduce((s,r,i)=>s+r[i],0);}
function _rank(m){
  const n=m.length,rows=m.map(r=>[...r]);
  let r=0;
  for(let col=0;col<n&&r<n;col++){
    let piv=r;
    while(piv<n&&Math.abs(rows[piv][col])<1e-12)piv++;
    if(piv===n)continue;
    [rows[r],rows[piv]]=[rows[piv],rows[r]];
    const lead=rows[r][col];
    for(let i=r+1;i<n;i++){
      const factor=rows[i][col]/lead;
      for(let j=col;j<n;j++)rows[i][j]-=factor*rows[r][j];
    }
    r++;
  }
  return r;
}

// expose for graph.js
window._rank = _rank;

// ─── init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  NAV.init();
  EXPR.init();
  PANEL.init();
  HISTORY.init();
});
