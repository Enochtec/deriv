// ── Sidebar Toggle ──
window.toggleSidebar = function() {
  document.body.classList.toggle('sidebar-open');
};

const App = (() => {
  let candles = [];
  let connected = false;
  let lastTick = 0;
  let loading = false;
  let initialLoadDone = false;
  let digCallbacks = [];
  let digitsVisible = false;
  let digitsCache = null;
  let digitsCacheTime = 0;

  const TF_MAP = { 60: '1m', 120: '2m', 300: '5m', 900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d' };

  function init() {
    const cfg = window.__DC__;
    if (!cfg || !cfg.appId) { log('ERROR: No app_id'); return; }

    document.querySelectorAll('.nav-link[data-page]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        closeSidebar();
        const page = el.dataset.page;
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        if (page === 'dashboard') { digitsVisible = false; return; }
        const target = document.getElementById('page-' + page);
        if (target) target.classList.remove('hidden');
        document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
        if (page === 'digits') { digitsVisible = true; renderDigitsDashboard(); }
      });
    });
    document.querySelectorAll('.page-close').forEach(btn => {
      btn.addEventListener('click', () => {
        digitsVisible = false;
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        document.querySelector('.nav-link[data-page="dashboard"]').click();
      });
    });

    const marketSel = document.getElementById('marketSelect');
    const tfSel = document.getElementById('timeframeSelect');
    const chartTypeSel = document.getElementById('chartType');

    marketSel.addEventListener('change', () => {
      const sym = marketSel.value;
      DerivAPI.subscribe(sym);
      loadCandles(sym, +tfSel.value);
      document.getElementById('footerMarket').textContent = sym;
    });
    tfSel.addEventListener('change', () => { loadCandles(marketSel.value, +tfSel.value); });
    chartTypeSel.addEventListener('change', () => { ChartModule.setChartType(chartTypeSel.value); });

    document.getElementById('digPredictBtn').addEventListener('click', startDigitPrediction);

    ChartModule.init(document.getElementById('chartContainer'));

    DerivAPI.on('tick', onTick);
    DerivAPI.on('candles', onCandles);
    DerivAPI.on('status', onStatus);
    DerivAPI.on('error', (msg) => { log(msg); });
    DerivAPI.connect(cfg.appId);

    setTimeout(() => {
      if (!connected && !initialLoadDone) {
        log('Still not connected after 10s');
        document.getElementById('connStatus').innerHTML = '<span class="status-dot bg-red-500"></span>Timeout';
      }
    }, 10000);

    setInterval(() => {
      document.getElementById('footerTime').textContent = new Date().toLocaleTimeString();
    }, 1000);

    setInterval(() => { if (digitsVisible) renderDigitsDashboard(); }, 3000);
    setInterval(updateSignalBar, 3000);

    log('Initialized');
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
  }

  function onStatus(status) {
    connected = status.connected;
    const el = document.getElementById('connStatus');
    if (status.connected) {
      el.innerHTML = '<span class="status-dot bg-green-500"></span>Online';
      if (!initialLoadDone) {
        initialLoadDone = true;
        const ms = document.getElementById('marketSelect');
        const ts = document.getElementById('timeframeSelect');
        loadCandles(ms.value, +ts.value);
        log('Connected');
      }
    } else if (status.connecting) {
      el.innerHTML = '<span class="status-dot bg-yellow-500"></span>Connecting...';
    } else {
      el.innerHTML = '<span class="status-dot bg-yellow-500"></span>Reconnecting...';
    }
  }

  function onTick(tick) {
    lastTick = tick.quote || tick.tick;
    document.getElementById('priceDisplay').textContent = lastTick.toFixed(4);
    Digits.storeTick(lastTick);
    if (digCallbacks.length > 0) { const cbs = digCallbacks.slice(); digCallbacks = []; cbs.forEach(fn => fn(Digits.getLastDigit(lastTick))); }
    if (candles.length > 0) {
      const last = candles[candles.length - 1];
      last.close = tick.quote;
      last.high = Math.max(last.high, tick.quote);
      last.low = Math.min(last.low, tick.quote);
      ChartModule.updateLast(last);
    }
  }

  function onCandles(data) {
    if (!data.prices || data.prices.length === 0) { log('No candles'); return; }
    candles = data.prices.map((p, i) => ({
      time: (data.times[i] || 0) * 1000,
      open: p.open, high: p.high, low: p.low, close: p.close, volume: p.volume || 0,
    }));
    candles.sort((a, b) => a.time - b.time);
    ChartModule.setData(candles);
    document.getElementById('footerCandles').textContent = candles.length + ' candles';
    log('Loaded ' + candles.length + ' candles');
  }

  async function loadCandles(symbol, granularity) {
    if (loading) return;
    loading = true;
    const data = await DerivAPI.fetchCandles(symbol, granularity, 200);
    if (data.prices && data.prices.length > 0) onCandles(data);
    else log('No candle data');
    loading = false;
  }

  function updateSignalBar() {
    if (candles.length < 30) return;
    const signal = Signals.evaluate(candles);
    if (!signal) return;
    Signals.addHistory(signal);
    const el = document.getElementById('signalIndicator');
    el.className = 'font-semibold whitespace-nowrap';
    const c = signal.type === 'BUY' ? 'text-green-400' : signal.type === 'SELL' ? 'text-red-400' : 'text-yellow-400';
    el.innerHTML = '<span class="' + c + '">' + signal.type + '</span>';
    document.getElementById('signalConfidence').textContent = signal.confidence + '% confidence';
    document.getElementById('signalVolatility').textContent = 'ADX: ' + signal.indicators.adx.toFixed(1) + ' | RSI: ' + signal.indicators.rsi.toFixed(1);
  }

  // ── Digits Dashboard (cached, class-based) ──
  function renderDigitsDashboard() {
    if (digitsCache && Date.now() - digitsCacheTime < 1000) return;
    const sum = Digits.summary();
    if (!sum) return;
    digitsCache = sum;
    digitsCacheTime = Date.now();

    // Digit Frequency
    const freq = sum.frequencies;
    const maxFreq = Math.max(...freq.map(f => f.count), 1);
    const hmEl = document.getElementById('digHeatmap');
    hmEl.innerHTML = freq.map(f => {
      const intensity = f.count / maxFreq;
      const r = Math.round(20 + intensity * 55);
      const g = Math.round(15 + (1 - intensity) * 25);
      const b = Math.round(35 + intensity * 85);
      const tc = intensity > 0.65 ? '#f0f0f5' : intensity > 0.3 ? '#b0b0bf' : '#707080';
      return '<div class="dig-cell" style="background:rgb(' + r + ',' + g + ',' + b + ');color:' + tc + '">' + f.digit + '</div>';
    }).join('');

    // Over/Under
    const oa5 = Digits.overUnderAnalysis(5);
    const ouEl = document.getElementById('digOverUnder');
    if (!oa5) { ouEl.textContent = 'Collecting data...'; }
    else {
      const biasCls = oa5.bias === 'over' ? 'text-green-400' : oa5.bias === 'under' ? 'text-red-400' : 'text-gray-400';
      ouEl.innerHTML =
        '<div class="' + biasCls + ' font-mono text-base font-bold mb-1">' + oa5.over.pct.toFixed(1) + '% / ' + oa5.under.pct.toFixed(1) + '%</div>' +
        '<div class="' + biasCls + ' text-xs mb-1.5">' + oa5.estimated + '</div>' +
        '<div class="text-[11px] text-gray-600 leading-relaxed">' + oa5.evidence + '</div>';
    }

    // Even/Odd
    const eo = Digits.evenOddAnalysis();
    const eoEl = document.getElementById('digEvenOdd');
    if (!eo) { eoEl.textContent = 'Collecting data...'; }
    else {
      const biasCls = eo.bias === 'even' ? 'text-green-400' : eo.bias === 'odd' ? 'text-red-400' : 'text-gray-400';
      const ew = Math.round(eo.even.pct);
      eoEl.innerHTML =
        '<div class="flex items-center gap-3 mb-1.5">' +
          '<div><div class="text-[10px] text-gray-600 mb-0.5">EVEN</div><div class="font-mono text-sm font-bold ' + (eo.even.pct > 50 ? 'text-green-400' : 'text-gray-500') + '">' + eo.even.pct.toFixed(1) + '%</div></div>' +
          '<div><div class="text-[10px] text-gray-600 mb-0.5">ODD</div><div class="font-mono text-sm font-bold ' + (eo.odd.pct > 50 ? 'text-red-400' : 'text-gray-500') + '">' + eo.odd.pct.toFixed(1) + '%</div></div>' +
          '<div class="flex-1"><div class="progress-bar"><div class="progress-fill bg-green-400" style="width:' + ew + '%"></div><div class="progress-fill bg-red-400" style="width:' + (100 - ew) + '%"></div></div></div>' +
        '</div>' +
        '<div class="' + biasCls + ' text-xs mb-1">' + eo.estimated + '</div>' +
        '<div class="text-[11px] text-gray-600 leading-relaxed">' + eo.evidence + '</div>';
    }

    // Matches/Differs
    const md = Digits.matchesDiffersAnalysis();
    const mdEl = document.getElementById('digMatchesDiffers');
    if (!md) { mdEl.textContent = 'Collecting data...'; }
    else {
      const biasCls = md.bias === 'matches' ? 'text-green-400' : md.bias === 'differs' ? 'text-red-400' : 'text-gray-400';
      const mw = Math.round(md.matches.pct);
      mdEl.innerHTML =
        '<div class="flex items-center gap-3 mb-1.5">' +
          '<div><div class="text-[10px] text-gray-600 mb-0.5">MATCH</div><div class="font-mono text-sm font-bold ' + (md.matches.pct > 50 ? 'text-green-400' : 'text-gray-500') + '">' + md.matches.pct.toFixed(1) + '%</div></div>' +
          '<div><div class="text-[10px] text-gray-600 mb-0.5">DIFFER</div><div class="font-mono text-sm font-bold ' + (md.differs.pct > 50 ? 'text-red-400' : 'text-gray-500') + '">' + md.differs.pct.toFixed(1) + '%</div></div>' +
          '<div class="flex-1"><div class="progress-bar"><div class="progress-fill bg-green-400" style="width:' + mw + '%"></div><div class="progress-fill bg-red-400" style="width:' + (100 - mw) + '%"></div></div></div>' +
        '</div>' +
        '<div class="' + biasCls + ' text-xs mb-1">' + md.estimated + '</div>' +
        '<div class="text-[11px] text-gray-600 leading-relaxed">' + md.evidence + '</div>';
    }

    // Transition Matrix
    const trans = sum.transitionMat;
    const trEl = document.getElementById('digTransitions');
    if (trans && trans.length > 0) {
      let html = '<div class="trans-grid">';
      html += '<div></div>';
      for (let t = 0; t <= 9; t++) html += '<div class="trans-cell header">' + t + '</div>';
      trans.forEach(row => {
        html += '<div class="trans-row-label">' + row.from + '</div>';
        row.probs.forEach(p => {
          const intensity = p.total > 0 ? Math.min(1, p.pct / 30) : 0;
          const r = Math.round(10 + intensity * 60);
          const g = Math.round(10 + (1 - intensity) * 25);
          const b = Math.round(30 + intensity * 90);
          const tc = p.pct > 15 ? '#e8e8ed' : '#9ca3af';
          html += '<div class="trans-cell" style="background:rgb(' + r + ',' + g + ',' + b + ');color:' + tc + '">' + (p.pct > 0 ? p.pct.toFixed(0) : '') + '</div>';
        });
      });
      html += '</div>';
      trEl.innerHTML = html;
    }
  }

  // ── Digit Prediction Handler ──
  function startDigitPrediction() {
    const market = document.getElementById('digMarketSelect').value;
    const mode = document.getElementById('digPredType').value;

    // Switch market if different
    const mainMarket = document.getElementById('marketSelect');
    if (mainMarket.value !== market) {
      mainMarket.value = market;
      mainMarket.dispatchEvent(new Event('change'));
    }

    const pred = Digits.predictNextDigit();
    if (!pred) {
      document.getElementById('digPredictStatus').textContent = 'Not enough data — need at least 20 ticks';
      return;
    }

    document.getElementById('digPredictBtn').disabled = true;
    const statusEl = document.getElementById('digPredictStatus');
    statusEl.textContent = 'Waiting for next tick...';

    const resultEl = document.getElementById('digResultDisplay');
    const infoEl = document.getElementById('digResultInfo');

    resultEl.textContent = pred.digit;
    resultEl.className = 'text-7xl sm:text-8xl font-bold mono text-yellow-400 leading-none';
    infoEl.innerHTML = '<div class="text-yellow-400 font-semibold text-xs md:text-sm mb-2">Prediction: ' + pred.digit + '</div>' +
      '<div class="text-gray-600 text-[11px] md:text-xs leading-relaxed">' + pred.reasons.join('<br>') + '</div>' +
      '<div class="text-gray-600 text-[11px] md:text-xs mt-2">Confidence: ' + pred.confidence + '%</div>';

    digCallbacks.push((actualDigit) => {
      document.getElementById('digPredictBtn').disabled = false;
      let correct = false, resultLabel = '';

      if (mode === 'overunder') {
        const ps = pred.digit > 5 ? 'OVER' : pred.digit < 5 ? 'UNDER' : 'EQUAL';
        const as = actualDigit > 5 ? 'OVER' : actualDigit < 5 ? 'UNDER' : 'EQUAL';
        correct = ps === as;
        resultLabel = 'Over/Under: Predicted ' + ps + ' (' + pred.digit + ')';
      } else if (mode === 'evenodd') {
        const pp = pred.digit % 2 === 0 ? 'EVEN' : 'ODD';
        const ap = actualDigit % 2 === 0 ? 'EVEN' : 'ODD';
        correct = pp === ap;
        resultLabel = 'Even/Odd: Predicted ' + pp + ' (' + pred.digit + ')';
      } else {
        const pm = pred.digit === pred.currentDigit ? 'MATCHES' : 'DIFFERS';
        const am = actualDigit === pred.currentDigit ? 'MATCHES' : 'DIFFERS';
        correct = pm === am;
        resultLabel = 'Matches/Differs: Predicted ' + pm + ' (' + pred.digit + ')';
      }

      Digits.recordPredictionResult(pred.digit, actualDigit);
      const acc = Digits.getAccuracy(50);
      const accStr = acc ? ' | Accuracy (last 50): ' + acc.pct + '%' : '';

      setTimeout(() => {
        resultEl.textContent = actualDigit;
        resultEl.className = 'text-7xl sm:text-8xl font-bold mono leading-none digit-pulse ' + (correct ? 'text-green-400' : 'text-red-400');
        statusEl.textContent = correct ? '✓ Correct' : '✗ Incorrect';
        infoEl.innerHTML = '<div class="font-semibold text-xs md:text-sm mb-2 ' + (correct ? 'text-green-400' : 'text-red-400') + '">' +
          (correct ? '✓ Correct!' : '✗ Incorrect') + ' — ' + resultLabel + '</div>' +
          '<div class="text-gray-600 text-[11px] md:text-xs">Actual digit: ' + actualDigit + accStr + '</div>' +
          '<div class="text-gray-600 text-[11px] md:text-xs leading-relaxed mt-2">' + pred.reasons.join('<br>') + '</div>' +
          '<div class="text-gray-600 text-[11px] md:text-xs mt-2">Confidence: ' + pred.confidence + '%</div>';
      }, 800);
    });
  }

  function log(msg) {
    const panel = document.getElementById('logPanel');
    if (!panel) return;
    const line = document.createElement('div');
    line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
