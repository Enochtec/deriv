const App = (() => {
  let candles = [];
  let currentSignal = null;
  let currentPatterns = [];
  let analysisTimer = null;
  let connected = false;
  let lastTick = 0;
  let loading = false;
  let analyzing = false;
  let initialLoadDone = false;

  const TF_MAP = { 60: '1m', 120: '2m', 300: '5m', 900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d' };
  const SYMBOLS = ['R_10','R_25','R_50','R_75','R_100','BOOM300','BOOM500','BOOM1000','CRASH300','CRASH500','CRASH1000','JD50','STPRNG','frxEURUSD','frxGBPUSD'];

  function init() {
    const cfg = window.__DC__;
    if (!cfg || !cfg.appId) { log('ERROR: No app_id'); return; }

    document.querySelectorAll('.nav-link[data-page]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const page = el.dataset.page;
        if (page === 'dashboard') {
          document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
          return;
        }
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        const target = document.getElementById('page-' + page);
        if (target) target.classList.remove('hidden');
        document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
        if (page === 'markets') renderMarketsPage();
        if (page === 'history') renderHistoryPage();
        if (page === 'digits') renderDigitsDashboard();
      });
    });
    document.querySelectorAll('.page-close').forEach(btn => {
      btn.addEventListener('click', () => {
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

    document.getElementById('clearLogBtn').addEventListener('click', () => {
      document.getElementById('logPanel').innerHTML = '';
    });

    ChartModule.init(document.getElementById('chartContainer'));

    DerivAPI.on('tick', onTick);
    DerivAPI.on('candles', onCandles);
    DerivAPI.on('status', onStatus);
    DerivAPI.on('error', (msg) => { log(msg); });
    DerivAPI.connect(cfg.appId);

    setTimeout(() => {
      if (!connected && !initialLoadDone) {
        log('Still not connected after 10s — check console');
        document.getElementById('connStatus').innerHTML = '<span class="status-dot bg-red-500"></span>Timeout';
      }
    }, 10000);

    analysisTimer = setInterval(runAnalysis, 3000);

    setInterval(() => {
      document.getElementById('footerTime').textContent = new Date().toLocaleTimeString();
    }, 1000);

    // Digits auto-refresh
    setInterval(renderDigitsDashboard, 2000);

    log('Initialized');
  }

  function onStatus(status) {
    connected = status.connected;
    const el = document.getElementById('connStatus');
    if (status.connected) {
      el.innerHTML = '<span class="status-dot bg-green-500"></span>Online';
      document.getElementById('settingsStatus').textContent = 'Connected';
      if (!initialLoadDone) {
        initialLoadDone = true;
        const ms = document.getElementById('marketSelect');
        const ts = document.getElementById('timeframeSelect');
        loadCandles(ms.value, +ts.value);
        log('Connected');
      }
    } else if (status.connecting) {
      el.innerHTML = '<span class="status-dot bg-yellow-500"></span>Connecting...';
      document.getElementById('settingsStatus').textContent = 'Connecting...';
    } else {
      el.innerHTML = '<span class="status-dot bg-yellow-500"></span>Reconnecting...';
      document.getElementById('settingsStatus').textContent = 'Reconnecting...';
    }
  }

  function onTick(tick) {
    lastTick = tick.quote || tick.tick;
    document.getElementById('priceDisplay').textContent = lastTick.toFixed(4);
    Digits.storeTick(lastTick);
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

  // Analysis pipeline
  function runAnalysis() {
    if (analyzing || candles.length < 30) return;
    analyzing = true;

    const steps = ['download','indicators','sr','patterns','volatility','trend','signal','final'];
    const labels = {
      download: 'Downloading market data',
      indicators: 'Calculating indicators',
      sr: 'Detecting support & resistance',
      patterns: 'Identifying candlestick patterns',
      volatility: 'Measuring volatility',
      trend: 'Evaluating trend strength',
      signal: 'Generating signals',
      final: 'Producing final analysis',
    };

    showPipeline(steps, labels);

    // Run actual analysis after brief pipeline display
    setTimeout(() => {
      const signal = Signals.evaluate(candles);
      if (signal) {
        currentSignal = signal;
        currentPatterns = signal.patterns || [];
        Signals.addHistory(signal);
        renderReport(signal);
        showReport();
        log('Signal: ' + signal.type + ' (' + signal.confidence + '%)');
      }
      hidePipeline();
      analyzing = false;
    }, 2000);
  }

  function showPipeline(steps, labels) {
    const pipeEl = document.getElementById('analysisPipeline');
    const reportEl = document.getElementById('reportContent');
    pipeEl.classList.remove('hidden');
    reportEl.classList.add('hidden');

    steps.forEach((s, i) => {
      const el = pipeEl.querySelector('[data-step="' + s + '"]');
      if (!el) return;
      el.className = 'step-item';
      const label = el.querySelector('.step-label');
      if (label) label.textContent = labels[s];
      setTimeout(() => {
        el.className = 'step-item active';
        setTimeout(() => {
          el.className = 'step-item done';
          const check = el.querySelector('.step-label');
          if (check) check.textContent = labels[s] + ' ✓';
        }, Math.max(100, 600 - i * 50));
      }, i * 120);
    });
  }

  function hidePipeline() {
    document.getElementById('analysisPipeline').classList.add('hidden');
  }

  function showReport() {
    document.getElementById('reportContent').classList.remove('hidden');
  }

  // Report rendering
  function renderReport(signal) {
    if (!signal) return;

    const health = Reports.healthScores(signal, candles);
    const summary = Reports.marketSummary(signal, candles);
    const sigRep = Reports.signalReport(signal);
    const indRep = Reports.indicatorReports(signal, candles);
    const patRep = Reports.patternReport(signal.patterns);
    const risk = Reports.riskAnalysis(signal, candles);

    renderHealth(health);
    renderSummary(summary);
    renderSignalReport(sigRep);
    renderIndicatorsReport(indRep);
    renderPatternReport(patRep);
    renderRisk(risk);
  }

  function renderHealth(health) {
    const section = document.getElementById('reportHealth');
    const grid = document.getElementById('healthScores');
    const expl = document.getElementById('healthExplanation');
    if (!health) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    grid.innerHTML = health.scores.map(s =>
      '<div class="score-card">' +
      '<div class="score-label">' + s.label + '</div>' +
      '<div class="score-value" style="color:' + Reports.getScoreColor(s.value) + '">' + s.value + '</div>' +
      '<div class="score-bar"><div class="score-bar-fill" style="width:' + s.value + '%;background:' + Reports.getScoreColor(s.value) + '"></div></div>' +
      '<div class="score-desc">' + s.desc + '</div></div>'
    ).join('');
    expl.textContent = health.explanation;
  }

  function renderSummary(summary) {
    const section = document.getElementById('reportSummary');
    const textEl = document.getElementById('summaryText');
    const invEl = document.getElementById('summaryInvalidation');
    if (!summary) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    textEl.innerHTML = summary.summary.map(s => '<div class="summary-bullet">' + s + '</div>').join('');
    invEl.innerHTML = '<div class="invalidation-label">Invalidation Conditions</div><div class="text-gray-600">' + summary.invalidation + '</div>';
  }

  function renderSignalReport(sig) {
    const section = document.getElementById('reportSignal');
    const body = document.getElementById('signalReportBody');
    if (!sig) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    const c = sig.type === 'BUY' ? '#22c55e' : sig.type === 'SELL' ? '#ef4444' : '#eab308';
    let html = '<div style="border-left:3px solid ' + c + ';padding-left:10px;margin-bottom:10px">';
    html += '<div style="font-size:14px;font-weight:700;color:' + c + '">' + sig.type + '</div>';
    html += '<div style="font-size:22px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + c + '">' + sig.confidence + '%</div></div>';

    html += '<div class="scd-grid">';
    html += '<span class="scd-label">Entry Zone</span><span class="scd-value">' + sig.entryZone + '</span>';
    html += '<span class="scd-label">Stop Loss</span><span class="scd-value" style="color:#ef4444">' + sig.stopLoss + '</span>';
    html += '<span class="scd-label">Take Profit</span><span class="scd-value" style="color:#22c55e">' + sig.takeProfit + '</span>';
    html += '<span class="scd-label">R:R Ratio</span><span class="scd-value">1:' + sig.rr + '</span>';
    html += '<span class="scd-label">Risk Rating</span><span class="scd-value" style="color:' + (sig.riskRating === 'High' ? '#ef4444' : sig.riskRating === 'Low' ? '#22c55e' : '#eab308') + '">' + sig.riskRating + '</span>';
    html += '<span class="scd-label">Price</span><span class="scd-value">' + sig.price.toFixed(4) + '</span>';
    html += '</div>';

    html += '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #1c1c2e">';
    html += '<div style="font-size:9px;color:#6b7280;margin-bottom:4px">REASONS</div>';
    sig.reasons.forEach(r => { html += '<div style="font-size:10px;color:#9ca3af;padding:2px 0">· ' + r + '</div>'; });
    html += '</div>';
    body.innerHTML = html;
  }

  function renderIndicatorsReport(ind) {
    const section = document.getElementById('reportIndicators');
    const body = document.getElementById('indicatorReports');
    if (!ind || !ind.indicators) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    body.innerHTML = ind.indicators.map(i => {
      const c = i.bullish === true ? '#22c55e' : i.bullish === false ? '#ef4444' : '#9ca3af';
      const statusC = i.status === 'Overbought' || i.status === 'Bearish' || i.status === 'Overbought' ? '#ef4444' :
        i.status === 'Oversold' || i.status === 'Bullish' ? '#22c55e' : '#9ca3af';
      return '<div class="indicator-report">' +
        '<div class="ir-header"><span class="ir-name">' + i.name + '</span><span class="ir-value" style="color:' + c + '">' + i.value + '</span></div>' +
        '<div class="ir-status"><span style="color:' + statusC + '">' + i.status + '</span></div>' +
        '<div class="ir-contribution">' + i.contribution + '</div></div>';
    }).join('');
  }

  function renderPatternReport(patterns) {
    const section = document.getElementById('reportPatterns');
    const body = document.getElementById('patternReportBody');
    if (!patterns || patterns.length === 0) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    body.innerHTML = patterns.map(p => {
      const pc = p.type === 'bullish' ? '#22c55e' : p.type === 'bearish' ? '#ef4444' : '#9ca3af';
      const sc = p.significance === 'high' ? '#ef4444' : p.significance === 'medium' ? '#eab308' : '#6b7280';
      return '<div class="pattern-card">' +
        '<div class="pc-name" style="color:' + pc + '">' + (p.type === 'bullish' ? '↑ ' : p.type === 'bearish' ? '↓ ' : '— ') + p.pattern + '</div>' +
        '<div class="pc-detail">' + p.detail + '</div>' +
        '<div class="pc-significance"><span style="color:' + sc + '">' + p.significance.toUpperCase() + ' significance</span></div>' +
        '<div class="pc-significance" style="color:#6b7280">' + p.action + '</div></div>';
    }).join('');
  }

  function renderRisk(risk) {
    const section = document.getElementById('reportRisk');
    const body = document.getElementById('riskReportBody');
    if (!risk) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');

    const data = [
      { label: 'Market Volatility', value: risk.marketVolatility, desc: 'ATR: ' + risk.atr + ' | BB: ' + risk.bbWidth },
      { label: 'Trend Strength', value: risk.trendStrength, desc: '' },
      { label: 'Signal Reliability', value: risk.signalReliability, desc: '' },
      { label: 'Recommended Max Risk', value: risk.recommendedMaxRisk, desc: 'Per trade' },
      { label: 'Uncertainty', value: risk.uncertainty, desc: '' },
      { label: 'Patience Level', value: risk.patienceLevel, desc: 'RSI: ' + risk.rsi },
    ];
    body.innerHTML = data.map(d =>
      '<div class="risk-card"><div class="rc-header">' + d.label + '</div><div class="rc-value" style="color:' + (d.value.includes('High') || d.value.includes('Wait') ? '#eab308' : d.value.includes('Low') || d.value.includes('Trade') ? '#22c55e' : '#9ca3af') + '">' + d.value + '</div>' + (d.desc ? '<div class="rc-desc">' + d.desc + '</div>' : '') + '</div>'
    ).join('');
  }

  // ── Digits Dashboard ──
  function renderDigitsDashboard() {
    const count = Digits.count();
    document.getElementById('digTotalTicks').textContent = count;

    const sum = Digits.summary();
    if (!sum) return;

    document.getElementById('digMeanDigit').textContent = sum.mean ? sum.mean.toFixed(2) : '—';
    document.getElementById('digUniformity').textContent = sum.uniformity.uniform ? 'Uniform' : 'Biased';
    document.getElementById('digUniformity').style.color = sum.uniformity.uniform ? '#6b7280' : '#eab308';
    document.getElementById('digVolatility').textContent = sum.volatility.toFixed(2);

    // Tick stream
    const recent = Digits.getTicks(30);
    const streamEl = document.getElementById('digTickStream');
    streamEl.innerHTML = recent.map(t => {
      const c = t.digit > 5 ? '#22c55e' : t.digit > 3 ? '#eab308' : '#ef4444';
      const bg = t.digit > 5 ? '#22c55e20' : t.digit > 3 ? '#eab30820' : '#ef444420';
      return '<div class="dig-tick" style="background:' + bg + ';color:' + c + '">' + t.digit + '</div>';
    }).join('');

    // Heatmap
    const freq = sum.frequencies;
    const maxFreq = Math.max(...freq.map(f => f.count), 1);
    const hmEl = document.getElementById('digHeatmap');
    hmEl.innerHTML = freq.map(f => {
      const intensity = f.count / maxFreq;
      const r = Math.round(20 + intensity * 50);
      const g = Math.round(20 + (1 - intensity) * 30);
      const b = Math.round(40 + intensity * 80);
      const c = intensity > 0.7 ? '#e8e8ed' : intensity > 0.4 ? '#9ca3af' : '#6b7280';
      return '<div class="dig-cell" style="background:rgb(' + r + ',' + g + ',' + b + ');color:' + c + '">' + f.digit + '</div>';
    }).join('');

    // Over/Under
    const oa5 = Digits.overUnderAnalysis(5);
    const oa3 = Digits.overUnderAnalysis(3);
    const oa7 = Digits.overUnderAnalysis(7);
    const ouEl = document.getElementById('digOverUnder');
    if (!oa5) { ouEl.textContent = 'Need more ticks (minimum 30)'; }
    else {
      let html = '';
      [oa3, oa5, oa7].forEach(oa => {
        if (!oa) return;
        const c = oa.bias === 'over' ? '#22c55e' : oa.bias === 'under' ? '#ef4444' : '#9ca3af';
        html += '<div class="dig-rec" style="border-color:' + c + '">';
        html += '<div style="font-size:11px;font-weight:600;color:' + c + '">Over ' + oa.threshold + ' / Under ' + oa.threshold + ': <span style="font-weight:700">' + oa.estimated.split(' — ')[0] + '</span></div>';
        html += '<div style="font-size:9px;color:#6b7280;margin-top:3px">' + oa.estimated + '</div>';
        html += '<div style="font-size:9px;color:#6b7280;margin-top:2px">' + oa.evidence + '</div></div>';
      });
      ouEl.innerHTML = html;
    }

    // Even/Odd
    const eo = Digits.evenOddAnalysis();
    const eoEl = document.getElementById('digEvenOdd');
    if (!eo) { eoEl.textContent = 'Need more ticks'; }
    else {
      const ec = eo.bias === 'even' ? '#22c55e' : eo.bias === 'odd' ? '#ef4444' : '#9ca3af';
      let html = '<div class="flex items-center gap-4 mb-2">';
      html += '<div><div style="font-size:9px;color:#6b7280">EVEN</div><div style="font-size:16px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + (eo.even.pct > 50 ? '#22c55e' : '#6b7280') + '">' + eo.even.pct.toFixed(1) + '%</div></div>';
      html += '<div><div style="font-size:9px;color:#6b7280">ODD</div><div style="font-size:16px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + (eo.odd.pct > 50 ? '#ef4444' : '#6b7280') + '">' + eo.odd.pct.toFixed(1) + '%</div></div>';
      html += '<div style="flex:1"><div style="height:6px;background:#1c1c2e;border-radius:3px;overflow:hidden;display:flex">';
      const ew = Math.round(eo.even.pct);
      html += '<div style="width:' + ew + '%;background:#22c55e;border-radius:3px 0 0 3px"></div>';
      html += '<div style="width:' + (100 - ew) + '%;background:#ef4444;border-radius:0 3px 3px 0"></div></div></div></div>';
      html += '<div class="dig-rec" style="border-color:' + ec + '"><div style="font-size:10px;font-weight:600;color:' + ec + '">' + eo.estimated + '</div>';
      html += '<div style="font-size:9px;color:#6b7280;margin-top:2px">Confidence: ' + eo.confidence + '% | ' + eo.alternation.description + '</div>';
      html += '<div style="font-size:9px;color:#6b7280;margin-top:2px">' + eo.evidence + '</div></div>';
      eoEl.innerHTML = html;
    }

    // Matches/Differs
    const md = Digits.matchesDiffersAnalysis();
    const mdEl = document.getElementById('digMatchesDiffers');
    if (!md) { mdEl.textContent = 'Need more ticks'; }
    else {
      const mc = md.bias === 'matches' ? '#22c55e' : md.bias === 'differs' ? '#ef4444' : '#9ca3af';
      let html = '<div class="flex items-center gap-4 mb-2">';
      html += '<div><div style="font-size:9px;color:#6b7280">MATCHES</div><div style="font-size:16px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + (md.matches.pct > 50 ? '#22c55e' : '#6b7280') + '">' + md.matches.pct.toFixed(1) + '%</div></div>';
      html += '<div><div style="font-size:9px;color:#6b7280">DIFFERS</div><div style="font-size:16px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + (md.differs.pct > 50 ? '#ef4444' : '#6b7280') + '">' + md.differs.pct.toFixed(1) + '%</div></div>';
      html += '<div style="flex:1"><div style="height:6px;background:#1c1c2e;border-radius:3px;overflow:hidden;display:flex">';
      html += '<div style="width:' + Math.round(md.matches.pct) + '%;background:#22c55e;border-radius:3px 0 0 3px"></div>';
      html += '<div style="width:' + Math.round(100 - md.matches.pct) + '%;background:#ef4444;border-radius:0 3px 3px 0"></div></div></div></div>';
      html += '<div class="dig-rec" style="border-color:' + mc + '"><div style="font-size:10px;font-weight:600;color:' + mc + '">' + md.estimated + '</div>';
      html += '<div style="font-size:9px;color:#6b7280;margin-top:2px">Confidence: ' + md.confidence + '% | Recent: ' + md.matches.recentPct.toFixed(1) + '% matches</div>';
      html += '<div style="font-size:9px;color:#6b7280;margin-top:2px">' + md.evidence + '</div></div>';
      mdEl.innerHTML = html;
    }

    // Recommendations
    const recs = Digits.generateRecommendation();
    const recEl = document.getElementById('digRecommendations');
    if (recs.length === 0) { recEl.innerHTML = '<div style="color:#6b7280;font-size:10px">Insufficient data for recommendations — need 50+ ticks with clear bias.</div>'; }
    else {
      recEl.innerHTML = recs.map(r => {
        const c = r.direction.startsWith('OVER') || r.direction.startsWith('EVEN') || r.direction === 'MATCHES' ? '#22c55e' :
          r.direction.startsWith('UNDER') || r.direction.startsWith('ODD') || r.direction === 'DIFFERS' ? '#ef4444' : '#eab308';
        const riskC = r.risk === 'Low' ? '#22c55e' : r.risk === 'Medium' ? '#eab308' : '#ef4444';
        return '<div class="dig-rec" style="border-color:' + c + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:11px;font-weight:600;color:' + c + '">' + r.direction + '</span>' +
          '<span style="font-size:12px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + c + '">' + r.confidence + '%</span></div>' +
          '<div style="font-size:9px;color:#6b7280;margin-top:2px">Type: ' + r.type + ' | Strength: ' + r.strength + ' | Risk: <span style="color:' + riskC + '">' + r.risk + '</span></div>' +
          '<div style="font-size:9px;color:#6b7280;margin-top:2px">' + r.explanation + '</div></div>';
      }).join('');
    }

    // Transition matrix
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
          const g = Math.round(10 + (1 - intensity) * 30);
          const b = Math.round(30 + intensity * 90);
          const tc = p.pct > 15 ? '#e8e8ed' : '#9ca3af';
          html += '<div class="trans-cell" style="background:rgb(' + r + ',' + g + ',' + b + ');color:' + tc + '">' + (p.pct > 0 ? p.pct.toFixed(0) : '') + '</div>';
        });
      });
      html += '</div>';
      trEl.innerHTML = html;
    }
  }

  // Page renderers
  function renderMarketsPage() {
    const grid = document.getElementById('marketsGrid');
    grid.innerHTML = SYMBOLS.map(sym =>
      '<div class="bg-[#0d0d1a] border border-[#1c1c2e] rounded-lg p-2.5 cursor-pointer hover:border-blue-800" onclick="document.getElementById(\'marketSelect\').value=\'' + sym + '\';document.getElementById(\'marketSelect\').dispatchEvent(new Event(\'change\'));document.querySelector(\'.page-close\').click()">' +
      '<div class="text-xs font-semibold text-gray-200">' + sym + '</div>' +
      '<div class="text-[9px] text-gray-600">' + (sym.startsWith('R') ? 'Volatility' : sym.startsWith('BOOM') ? 'Boom' : sym.startsWith('CRASH') ? 'Crash' : sym === 'JD50' ? 'Jump' : sym === 'STPRNG' ? 'Step Index' : 'Forex') + '</div></div>'
    ).join('');
  }

  function renderHistoryPage() {
    const body = document.getElementById('signalHistoryBody');
    const history = Signals.getHistory().slice(0, 50);
    if (history.length === 0) { body.innerHTML = '<div class="text-gray-600 text-xs">No signals yet.</div>'; return; }
    body.innerHTML = history.map(s => {
      const c = s.type === 'BUY' ? 'text-green-400' : s.type === 'SELL' ? 'text-red-400' : 'text-yellow-400';
      return '<div class="grid grid-cols-[80px_1fr_60px_70px_70px_60px] text-[11px] py-1.5 border-b border-[#14141f]">' +
        '<span class="text-gray-600">' + new Date(s.timestamp).toLocaleTimeString() + '</span>' +
        '<span class="' + c + ' font-semibold">' + s.type + '</span>' +
        '<span class="mono">' + s.confidence + '%</span>' +
        '<span class="mono text-gray-300">' + (s.entryZone !== '—' ? s.entryZone : '—') + '</span>' +
        '<span class="mono text-gray-500">' + (s.stopLoss !== '—' ? s.stopLoss : '—') + '</span>' +
        '<span class="text-gray-600">—</span></div>';
    }).join('');
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
