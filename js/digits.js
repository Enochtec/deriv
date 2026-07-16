const Digits = (() => {

  const MAX_TICKS = 3000;
  let ticks = [];
  let digits = [];
  let callbacks = [];
  let cache = { trans1: null, trans2: null, trans3: null, freq: null, count: 0, time: 0 };

  function getLastDigit(price) {
    if (price == null) return null;
    const s = String(price);
    const p = s.split('.');
    if (p.length < 2) return parseInt(p[0].slice(-1), 10);
    return parseInt(p[1][0], 10);
  }

  function storeTick(price) {
    const d = getLastDigit(price);
    if (d === null || d === undefined) return;
    ticks.push({ price, digit: d, time: Date.now() });
    digits.push(d);
    if (ticks.length > MAX_TICKS) { ticks = ticks.slice(-MAX_TICKS); digits = digits.slice(-MAX_TICKS); }
    invalidateCache();
    callbacks.forEach(fn => fn(d, price));
  }

  function onTick(fn) { callbacks.push(fn); return () => { callbacks = callbacks.filter(f => f !== fn); }; }
  function getTicks(n) { return n ? ticks.slice(-n) : ticks; }
  function getDigits(n) { return n ? digits.slice(-n) : digits; }
  function count() { return digits.length; }
  function invalidateCache() { cache.count = 0; }

  function digitFrequencies(arr) {
    const freq = Array(10).fill(0);
    arr.forEach(d => { if (d >= 0 && d <= 9) freq[d]++; });
    const total = arr.length || 1;
    return freq.map((c, d) => ({ digit: d, count: c, pct: (c / total * 100) }));
  }

  function rollingFrequencies(window) {
    return digitFrequencies(digits.slice(-window));
  }

  function evenOdd(arr) {
    const even = arr.filter(d => d % 2 === 0).length;
    const total = arr.length || 1;
    return { even, odd: total - even, evenPct: even / total * 100, oddPct: (total - even) / total * 100 };
  }

  // ── Transition matrices (1st, 2nd, 3rd order) ──
  function transitionMatrix1(arr) {
    const m = Array.from({ length: 10 }, () => Array(10).fill(0));
    const total = Array(10).fill(0);
    for (let i = 1; i < arr.length; i++) {
      const f = arr[i - 1], t = arr[i];
      if (f >= 0 && f <= 9 && t >= 0 && t <= 9) { m[f][t]++; total[f]++; }
    }
    return m.map((row, f) => ({
      from: f, total: total[f],
      probs: row.map((c, t) => ({ to: t, count: c, pct: total[f] ? (c / total[f] * 100) : 0 })),
    }));
  }

  function transitionMatrix2(arr) {
    const m = {};
    const total = {};
    for (let i = 2; i < arr.length; i++) {
      const key = arr[i - 2] * 10 + arr[i - 1];
      const t = arr[i];
      if (t < 0 || t > 9) continue;
      if (!m[key]) { m[key] = Array(10).fill(0); total[key] = 0; }
      m[key][t]++; total[key]++;
    }
    return { matrix: m, totals: total };
  }

  function transitionMatrix3(arr) {
    const m = {};
    const total = {};
    for (let i = 3; i < arr.length; i++) {
      const key = arr[i - 3] * 100 + arr[i - 2] * 10 + arr[i - 1];
      const t = arr[i];
      if (t < 0 || t > 9) continue;
      if (!m[key]) { m[key] = Array(10).fill(0); total[key] = 0; }
      m[key][t]++; total[key]++;
    }
    return { matrix: m, totals: total };
  }

  // ── Build all matrices with caching ──
  function getCachedMatrices() {
    const current = digits.length;
    if (cache.count === current && Date.now() - cache.time < 500) return cache;
    const arr = digits.slice(-500);
    cache.trans1 = transitionMatrix1(arr);
    cache.trans2 = transitionMatrix2(arr);
    cache.trans3 = transitionMatrix3(arr);
    cache.freq = digitFrequencies(arr);
    cache.count = current;
    cache.time = Date.now();
    return cache;
  }

  // ── N-gram pattern detection ──
  function commonPatterns(arr, n) {
    const patterns = {};
    for (let i = n; i <= arr.length; i++) {
      const seq = arr.slice(i - n, i).join('');
      patterns[seq] = (patterns[seq] || 0) + 1;
    }
    return Object.entries(patterns)
      .map(([seq, count]) => ({ seq, count, pct: count / (arr.length - n + 1) * 100 }))
      .sort((a, b) => b.count - a.count);
  }

  // ── Autocorrelation at lag 1 ──
  function digitAutocorrelation(arr) {
    if (arr.length < 10) return 0;
    const n = arr.length;
    const mean = arr.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 1; i < n; i++) {
      num += (arr[i] - mean) * (arr[i - 1] - mean);
      den += (arr[i] - mean) ** 2;
    }
    return den > 0 ? num / den : 0;
  }

  // ── Streaks ──
  function streaks(arr) {
    if (arr.length < 2) return { current: 1, max: 1, direction: null };
    let max = 1, cur = 1, curDir = null;
    for (let i = 1; i < arr.length; i++) {
      const same = arr[i] === arr[i - 1];
      const up = arr[i] > arr[i - 1];
      if (same) { cur++; if (cur > max) max = cur; curDir = 'same'; }
      else { cur = 1; curDir = up ? 'up' : 'down'; }
    }
    return { current: cur, max, direction: curDir };
  }

  // ── Alternation ──
  function alternations(arr) {
    if (arr.length < 2) return { rate: 0, count: 0 };
    let flips = 0;
    for (let i = 1; i < arr.length; i++) {
      if ((arr[i] % 2) !== (arr[i - 1] % 2)) flips++;
    }
    return { rate: flips / (arr.length - 1) * 100, count: flips, total: arr.length - 1 };
  }

  // ── Momentum ──
  function momentum(arr, window) {
    if (arr.length < window + 1) return 0;
    const recent = arr.slice(-window);
    return recent[recent.length - 1] - recent[0];
  }

  // ── Volatility ──
  function digitVolatility(arr, window) {
    if (arr.length < 3) return 0;
    const seg = arr.slice(-window);
    const mean = seg.reduce((s, v) => s + v, 0) / seg.length;
    return Math.sqrt(seg.reduce((s, v) => s + (v - mean) ** 2, 0) / seg.length);
  }

  // ── Chi-square uniformity ──
  function chiSquareUniform(arr) {
    const freq = Array(10).fill(0);
    arr.forEach(d => { if (d >= 0 && d <= 9) freq[d]++; });
    const n = arr.length;
    const expected = n / 10;
    if (expected < 5) return { chi2: 0, p: 1, uniform: true, note: 'Sample too small' };
    const chi2 = freq.reduce((s, o) => s + ((o - expected) ** 2) / expected, 0);
    return { chi2, p: 1 - chi2CDF(chi2, 9), df: 9, uniform: (1 - chi2CDF(chi2, 9)) > 0.05 };
  }

  function chi2CDF(x, k) {
    if (x <= 0) return 0;
    if (x > 100) return 1;
    return lowerRegularizedGamma(k / 2, x / 2);
  }

  function lowerRegularizedGamma(a, x) {
    if (x < a + 1) {
      let sum = 1 / a, term = 1 / a;
      for (let n = 1; n < 100; n++) { term *= x / (a + n); sum += term; if (term < 1e-10) break; }
      return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    }
    return 1 - upperRegularizedGamma(a, x);
  }

  function upperRegularizedGamma(a, x) {
    let f = 1 + (1 - a) / x;
    if (Math.abs(f) < 1e-10) f = 1e-10;
    let c = 1 / f, d = f, h = c;
    for (let i = 1; i < 100; i++) {
      const n = 2 * i;
      let an = -i * (i - a), bn = x + n + 1 - a;
      d = bn + an * d; if (Math.abs(d) < 1e-10) d = 1e-10; d = 1 / d;
      c = bn + an / c; if (Math.abs(c) < 1e-10) c = 1e-10;
      const del = c * d; h *= del;
      if (Math.abs(del - 1) < 1e-10) break;
    }
    return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  }

  function logGamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) { y++; ser += c[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // ── Over / Under Analysis (with binomial test) ──
  function overUnderAnalysis(threshold) {
    if (digits.length < 30) return null;
    const recent = digits.slice(-200);
    const total = recent.length;
    const over = recent.filter(d => d > threshold).length;
    const under = recent.filter(d => d < threshold).length;
    const equal = recent.filter(d => d === threshold).length;
    const overPct = over / total * 100;
    const underPct = under / total * 100;

    const half = recent.slice(-100);
    const halfOver = half.filter(d => d > threshold).length;
    const halfUnder = half.filter(d => d < threshold).length;
    const trend = halfOver > halfUnder ? 'over_trending' : halfUnder > halfOver ? 'under_trending' : 'balanced';

    const last = recent[recent.length - 1];
    let consec = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      if ((recent[i] > threshold) === (last > threshold)) consec++;
      else break;
    }

    // Binomial test: probability of observed over count under H0 (p=0.5)
    const nTrials = over + under;
    const k = Math.max(over, under);
    const pValue = nTrials > 0 ? binomialPValue(k, nTrials, 0.5) : 1;

    let bias = 'neutral', strength = 'moderate';
    if (overPct > 60 && pValue < 0.05) { bias = 'over'; strength = 'strong'; }
    else if (overPct > 55 && pValue < 0.1) { bias = 'over'; strength = 'moderate'; }
    else if (underPct > 60 && pValue < 0.05) { bias = 'under'; strength = 'strong'; }
    else if (underPct > 55 && pValue < 0.1) { bias = 'under'; strength = 'moderate'; }
    else if (overPct > 52 || underPct > 52) { bias = overPct > underPct ? 'over' : 'under'; strength = 'weak'; }

    return {
      threshold, window: total,
      over: { count: over, pct: overPct },
      under: { count: under, pct: underPct },
      equal: { count: equal, pct: equal / total * 100 },
      trend, consecutive: consec, bias, strength,
      pValue: pValue.toFixed(4),
      estimated: bias === 'neutral' ? 'Balanced' : bias.toUpperCase() + ' (' + strength + ') — ' +
        (bias === 'over' ? overPct.toFixed(1) : underPct.toFixed(1)) + '%',
      evidence: over + '/' + under + ' over/under. ' +
        'p=' + pValue.toFixed(4) + (pValue < 0.05 ? ' (significant)' : ' (not significant)') +
        '. Streak: ' + consec + '. Trend: ' + trend + '.',
    };
  }

  function binomialPValue(k, n, p) {
    let sum = 0;
    for (let i = k; i <= n; i++) {
      sum += binomialProb(i, n, p);
      if (sum > 1) break;
    }
    return Math.min(1, sum * 2); // two-tailed
  }

  function binomialProb(k, n, p) {
    if (k < 0 || k > n) return 0;
    return Math.exp(logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }

  // ── Even / Odd Analysis ──
  function evenOddAnalysis() {
    if (digits.length < 30) return null;
    const recent = digits.slice(-200);
    const eo = evenOdd(recent);
    const alt = alternations(recent);
    const streak = streaks(recent);
    const delta = Math.abs(eo.evenPct - eo.oddPct);
    const nTrials = eo.even + eo.odd;
    const k = Math.max(eo.even, eo.odd);
    const pValue = nTrials > 0 ? binomialPValue(k, nTrials, 0.5) : 1;

    let confidence = Math.min(90, Math.round(40 + delta * 0.8 + (pValue < 0.05 ? 20 : 0)));
    let bias = 'neutral';
    if (eo.evenPct > 58 && pValue < 0.1) bias = 'even';
    else if (eo.oddPct > 58 && pValue < 0.1) bias = 'odd';
    else if (eo.evenPct > 52) bias = eo.evenPct > eo.oddPct ? 'even' : 'odd';

    const altDesc = alt.rate > 60 ? 'High alternation rate' : alt.rate < 35 ? 'Low alternation rate' : 'Moderate alternation';

    return {
      window: recent.length,
      even: { count: eo.even, pct: eo.evenPct },
      odd: { count: eo.odd, pct: eo.oddPct },
      alternation: { rate: alt.rate, flips: alt.count, description: altDesc },
      streak, bias, confidence,
      pValue: pValue.toFixed(4),
      estimated: bias === 'neutral' ? 'Balanced' : bias.toUpperCase() + ' (' + eo[bias === 'even' ? 'evenPct' : 'oddPct'].toFixed(1) + '%)',
      evidence: eo.even + '/' + eo.odd + ' even/odd. p=' + pValue.toFixed(4) +
        '. Alternation: ' + alt.flips + '/' + alt.total + '. ' + altDesc + '.',
    };
  }

  // ── Matches / Differs Analysis ──
  function matchesDiffersAnalysis() {
    if (digits.length < 10) return null;
    const recent = digits.slice(-200);
    if (recent.length < 2) return null;
    let matches = 0, differs = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] === recent[i - 1]) matches++; else differs++;
    }
    const total = matches + differs;
    const matchPct = matches / total * 100;
    const differPct = differs / total * 100;

    const last20 = recent.slice(-20);
    let m20 = 0, d20 = 0;
    for (let i = 1; i < last20.length; i++) {
      if (last20[i] === last20[i - 1]) m20++; else d20++;
    }
    const t20 = m20 + d20 || 1;
    const m20Pct = m20 / t20 * 100;

    let consecMatch = 0;
    for (let i = recent.length - 1; i >= 1; i--) {
      if (recent[i] === recent[i - 1]) consecMatch++; else break;
    }

    const freq = digitFrequencies(recent);
    const mostFreq = freq.slice().sort((a, b) => b.count - a.count).slice(0, 3);

    const delta = Math.abs(matchPct - differPct);
    const k = Math.max(matches, differs);
    const pValue = total > 0 ? binomialPValue(k, total, 0.5) : 1;
    let confidence = Math.min(85, Math.round(30 + delta * 0.7 + (pValue < 0.05 ? 15 : 0)));
    let bias = matchPct > 55 && pValue < 0.1 ? 'matches' : differPct > 55 && pValue < 0.1 ? 'differs' : 'neutral';
    if (bias === 'neutral' && (matchPct > 52 || differPct > 52)) bias = matchPct > differPct ? 'matches' : 'differs';

    return {
      window: total + 1,
      matches: { count: matches, pct: matchPct, recentPct: m20Pct },
      differs: { count: differs, pct: differPct, recentPct: 100 - m20Pct },
      consecutiveMatches: consecMatch, mostFrequentDigits: mostFreq,
      bias, confidence, pValue: pValue.toFixed(4),
      estimated: bias === 'neutral' ? 'Balanced' : bias.toUpperCase() + ' (' + (bias === 'matches' ? matchPct.toFixed(1) : differPct.toFixed(1)) + '%)',
      evidence: matches + '/' + differs + ' match/differ. p=' + pValue.toFixed(4) +
        '. Recent: ' + m20Pct.toFixed(1) + '% matches. Streak: ' + consecMatch + '.',
    };
  }

  // ── Summary ──
  function summary() {
    if (digits.length < 10) return null;
    const arr = digits.slice(-200);
    const freq = digitFrequencies(arr);
    const eo = evenOdd(arr);
    const chi2 = chiSquareUniform(arr);
    const vol = digitVolatility(digits, 50);
    const trans = transitionMatrix1(digits.slice(-200));
    const alt = alternations(arr);
    const mostCommon = freq.slice().sort((a, b) => b.count - a.count).slice(0, 3);
    const leastCommon = freq.slice().sort((a, b) => a.count - b.count).slice(0, 3);
    return {
      totalTicks: digits.length, recentWindow: arr.length,
      frequencies: freq, evenOdd: eo, uniformity: chi2,
      volatility: vol, alternation: alt, mostCommon, leastCommon,
      transitionMat: trans,
      mean: arr.reduce((s, d) => s + d, 0) / arr.length,
    };
  }

  // ════════════════════════════════════════════════
  //  PREDICTION ENGINE — Ensemble of 6 strategies
  // ════════════════════════════════════════════════
  function predictNextDigit() {
    if (digits.length < 20) return null;

    const arr = digits;
    const last = arr[arr.length - 1];
    const last2 = arr.length >= 2 ? arr[arr.length - 2] : -1;
    const last3 = arr.length >= 3 ? arr[arr.length - 3] : -1;
    const caches = getCachedMatrices();

    // ── Strategy 1: 1st-order Markov ──
    const s1 = Array(10).fill(0);
    if (caches.trans1[last] && caches.trans1[last].total > 5) {
      caches.trans1[last].probs.forEach(p => { s1[p.to] = p.pct; });
    }

    // ── Strategy 2: 2nd-order Markov ──
    const s2 = Array(10).fill(0);
    if (last2 >= 0) {
      const key = last2 * 10 + last;
      const row = caches.trans2.matrix[key];
      const total2 = caches.trans2.totals[key] || 0;
      if (row && total2 > 3) {
        for (let i = 0; i < 10; i++) s2[i] = (row[i] / total2) * 100;
      }
    }

    // ── Strategy 3: 3rd-order Markov ──
    const s3 = Array(10).fill(0);
    if (last2 >= 0 && last3 >= 0) {
      const key = last3 * 100 + last2 * 10 + last;
      const row = caches.trans3.matrix[key];
      const total3 = caches.trans3.totals[key] || 0;
      if (row && total3 > 2) {
        for (let i = 0; i < 10; i++) s3[i] = (row[i] / total3) * 100;
      }
    }

    // ── Strategy 4: Frequency bias (last 500) ──
    const s4 = caches.freq.map(f => f.pct);

    // ── Strategy 5: Recent frequency (last 50) ──
    const recent50 = digitFrequencies(arr.slice(-50));
    const s5 = recent50.map(f => f.pct);

    // ── Strategy 6: Reversion / spread detection ──
    const s6 = Array(10).fill(0);
    const gap = Math.abs(last - (arr.length >= 2 ? arr[arr.length - 2] : last));
    if (gap >= 5) {
      // Big jump → expect correction toward middle digits
      const mid = last > 5 ? last - 3 : last + 3;
      for (let i = 0; i < 10; i++) s6[i] = Math.max(0, 10 - Math.abs(i - mid));
    } else {
      // Small gap → momentum continuation
      for (let i = 0; i < 10; i++) s6[i] = Math.max(0, 10 - Math.abs(i - last));
    }
    const s6Sum = s6.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < 10; i++) s6[i] = (s6[i] / s6Sum) * 100;

    // ── Weighted ensemble ──
    // Weights: s1=0.25, s2=0.20, s3=0.10, s4=0.15, s5=0.15, s6=0.15
    // Adjust based on data availability
    let w1 = 0.25, w2 = 0.20, w3 = 0.10, w4 = 0.15, w5 = 0.15, w6 = 0.15;

    // If high-order Markov has too little data, redistribute weight
    if (caches.trans2.totals[last2 * 10 + last] < 3) { w2 = 0; w1 += 0.20; }
    if (last2 < 0 || caches.trans3.totals[last3 * 100 + last2 * 10 + last] < 2) { w3 = 0; w5 += 0.10; }

    const combined = Array(10).fill(0);
    for (let i = 0; i < 10; i++) {
      combined[i] = s1[i] * w1 + s2[i] * w2 + s3[i] * w3 + s4[i] * w4 + s5[i] * w5 + s6[i] * w6;
    }

    let bestDigit = 0, bestScore = 0, totalScore = 0;
    combined.forEach((s, i) => { totalScore += s; if (s > bestScore) { bestScore = s; bestDigit = i; } });

    const sorted = [...combined].sort((a, b) => b - a);
    const margin = sorted[0] - sorted[1];
    const entropy = combined.reduce((s, v) => { const p = v / totalScore; return p > 0 ? s - p * Math.log2(p) : s; }, 0);
    const maxEntropy = Math.log2(10);
    const normalizedEntropy = entropy / maxEntropy;

    // Agreement between top strategies
    const topStrategies = [s1, s2, s3, s4, s5, s6].map(s => {
      let b = 0, bs = 0;
      s.forEach((v, i) => { if (v > bs) { bs = v; b = i; } });
      return b;
    });
    const agreement = topStrategies.filter(s => s === bestDigit).length / topStrategies.length;

    // Confidence: blend margin + agreement + (1 - entropy) + strategy count
    const confidence = Math.min(97, Math.round(
      25 + margin * 2.0 +
      agreement * 30 +
      (1 - normalizedEntropy) * 20 +
      (w2 > 0 ? 5 : 0) +
      (w3 > 0 ? 5 : 0)
    ));

    const reasons = [];
    if (s1[bestDigit] > 0) reasons.push('1st-order Markov: ' + bestDigit + ' follows ' + last + ' in ' + s1[bestDigit].toFixed(1) + '% of cases');
    if (s2[bestDigit] > 0 && w2 > 0) reasons.push('2nd-order: pattern ' + last2 + '-' + last + ' → ' + bestDigit + ' (' + s2[bestDigit].toFixed(1) + '%)');
    if (s3[bestDigit] > 0 && w3 > 0) reasons.push('3rd-order: sequence ' + last3 + '-' + last2 + '-' + last + ' → ' + bestDigit + ' (' + s3[bestDigit].toFixed(1) + '%)');
    if (s4[bestDigit] > 0) reasons.push('Long-term freq: digit ' + bestDigit + ' (' + s4[bestDigit].toFixed(1) + '% of last 500)');
    if (s5[bestDigit] > 0) reasons.push('Short-term freq: digit ' + bestDigit + ' (' + s5[bestDigit].toFixed(1) + '% of last 50)');
    if (agreement > 0.5) reasons.push('Ensemble agreement: ' + Math.round(agreement * 100) + '% of models agree');
    if (confidence > 85) reasons.push('High confidence signal — statistical bias detected');

    return {
      digit: bestDigit, confidence, reasons,
      overUnder: bestDigit > 5 ? 'OVER' : bestDigit < 5 ? 'UNDER' : 'EQUAL',
      evenOdd: bestDigit % 2 === 0 ? 'EVEN' : 'ODD',
      matchesDiffers: last !== undefined ? (bestDigit === last ? 'MATCHES' : 'DIFFERS') : '—',
      currentDigit: last, margin: margin.toFixed(2), agreement: Math.round(agreement * 100),
      combinedScores: combined.map((s, i) => ({ digit: i, score: s })),
      _accuracy: null,
    };
  }

  // ── Track actual prediction accuracy ──
  const predictionHistory = [];

  function recordPredictionResult(predictedDigit, actualDigit) {
    predictionHistory.push({ predicted: predictedDigit, actual: actualDigit, time: Date.now() });
    if (predictionHistory.length > 200) predictionHistory.splice(0, predictionHistory.length - 200);
  }

  function getAccuracy(window) {
    const relevant = window ? predictionHistory.slice(-window) : predictionHistory;
    if (relevant.length < 5) return null;
    const correct = relevant.filter(r => r.predicted === r.actual).length;
    return {
      total: relevant.length,
      correct,
      pct: (correct / relevant.length * 100).toFixed(1),
      byType: null,
    };
  }

  return {
    storeTick, onTick, getTicks, getDigits, count, getLastDigit,
    digitFrequencies, rollingFrequencies, evenOdd, streaks,
    alternations, momentum, digitVolatility,
    chiSquareUniform, predictionHistory, recordPredictionResult, getAccuracy,
    overUnderAnalysis, evenOddAnalysis, matchesDiffersAnalysis,
    summary, predictNextDigit, invalidateCache,
    transitionMatrix1,
  };
})();