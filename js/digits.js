const Digits = (() => {

  // ── Storage ──
  const MAX_TICKS = 5000;
  let ticks = [];
  let digits = [];
  let callbacks = [];

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
    callbacks.forEach(fn => fn(d, price));
  }

  function onTick(fn) { callbacks.push(fn); return () => { callbacks = callbacks.filter(f => f !== fn); }; }

  function getTicks(n) { return n ? ticks.slice(-n) : ticks; }
  function getDigits(n) { return n ? digits.slice(-n) : digits; }
  function count() { return digits.length; }

  // ── Frequencies ──
  function digitFrequencies(arr) {
    const freq = Array(10).fill(0);
    arr.forEach(d => { if (d >= 0 && d <= 9) freq[d]++; });
    const total = arr.length || 1;
    return freq.map((c, d) => ({ digit: d, count: c, pct: (c / total * 100) }));
  }

  // ── Rolling frequencies ──
  function rollingFrequencies(window) {
    const recent = digits.slice(-window);
    return digitFrequencies(recent);
  }

  // ── Even / Odd ──
  function evenOdd(arr) {
    const even = arr.filter(d => d % 2 === 0).length;
    const total = arr.length || 1;
    return { even, odd: total - even, evenPct: even / total * 100, oddPct: (total - even) / total * 100 };
  }

  // ── Streaks ──
  function streaks(arr) {
    if (arr.length < 2) return { current: 1, max: 1, direction: null };
    let max = 1, cur = 1, curDir = null;
    for (let i = 1; i < arr.length; i++) {
      const same = arr[i] === arr[i - 1];
      const up = arr[i] > arr[i - 1];
      const down = arr[i] < arr[i - 1];
      if (same) { cur++; if (cur > max) max = cur; curDir = 'same'; }
      else { cur = 1; curDir = up ? 'up' : 'down'; }
    }
    return { current: cur, max, direction: curDir };
  }

  // ── Transition matrix ──
  function transitionMatrix(arr) {
    const m = Array.from({ length: 10 }, () => Array(10).fill(0));
    const rowTotal = Array(10).fill(0);
    for (let i = 1; i < arr.length; i++) {
      const from = arr[i - 1], to = arr[i];
      if (from >= 0 && from <= 9 && to >= 0 && to <= 9) { m[from][to]++; rowTotal[from]++; }
    }
    return m.map((row, f) => ({
      from: f,
      total: rowTotal[f],
      probs: row.map((c, t) => ({ to: t, count: c, pct: rowTotal[f] ? (c / rowTotal[f] * 100) : 0 })),
    }));
  }

  // ── Alternation (even/odd flips) ──
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
    const first = recent[0], last = recent[recent.length - 1];
    return last - first;
  }

  // ── Volatility ──
  function digitVolatility(arr, window) {
    if (arr.length < 3) return 0;
    const seg = arr.slice(-window);
    const mean = seg.reduce((s, v) => s + v, 0) / seg.length;
    const variance = seg.reduce((s, v) => s + (v - mean) ** 2, 0) / seg.length;
    return Math.sqrt(variance);
  }

  // ── Chi-square test for uniformity ──
  function chiSquareUniform(arr) {
    const freq = Array(10).fill(0);
    arr.forEach(d => { if (d >= 0 && d <= 9) freq[d]++; });
    const n = arr.length;
    const expected = n / 10;
    if (expected < 5) return { chi2: 0, p: 1, uniform: true, note: 'Sample too small' };
    const chi2 = freq.reduce((s, o) => s + ((o - expected) ** 2) / expected, 0);
    // Approximate p-value using chi2 distribution with 9 df
    const p = 1 - chi2CDF(chi2, 9);
    return { chi2, p, df: 9, uniform: p > 0.05, note: p > 0.05 ? 'Distribution appears uniform' : 'Distribution deviates from uniform' };
  }

  function chi2CDF(x, k) {
    if (x <= 0) return 0;
    if (x > 100) return 1;
    // Simple approximation using regularized gamma
    return lowerRegularizedGamma(k / 2, x / 2);
  }

  function lowerRegularizedGamma(a, x) {
    if (x < a + 1) {
      let sum = 1 / a, term = 1 / a;
      for (let n = 1; n < 100; n++) {
        term *= x / (a + n);
        sum += term;
        if (term < 1e-10) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    }
    // Continued fraction for x >= a + 1
    return 1 - upperRegularizedGamma(a, x);
  }

  function upperRegularizedGamma(a, x) {
    let f = 1 + (1 - a) / x;
    if (Math.abs(f) < 1e-10) f = 1e-10;
    let c = 1 / f, d = f, h = c;
    for (let i = 1; i < 100; i++) {
      const n = 2 * i;
      let an = -i * (i - a);
      let bn = x + n + 1 - a;
      d = bn + an * d; if (Math.abs(d) < 1e-10) d = 1e-10; d = 1 / d;
      c = bn + an / c; if (Math.abs(c) < 1e-10) c = 1e-10;
      const del = c * d;
      h *= del;
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

  // ── Distribution comparison (two-window) ──
  function distributionChange(windowSmall, windowLarge) {
    const small = digits.slice(-windowSmall);
    const large = digits.slice(-windowLarge, -windowSmall || undefined);
    if (small.length < 20 || large.length < 20) return null;
    const fSmall = digitFrequencies(small);
    const fLarge = digitFrequencies(large);
    const changes = fSmall.map((s, i) => ({ digit: i, before: fLarge[i].pct, after: s.pct, change: s.pct - fLarge[i].pct }));
    const maxChange = changes.reduce((m, c) => Math.abs(c.change) > Math.abs(m) ? c.change : m, 0);
    return { changes, maxChange, direction: maxChange > 0 ? 'increasing' : 'decreasing' };
  }

  // ── Over / Under Analysis ──
  function overUnderAnalysis(threshold) {
    if (digits.length < 30) return null;
    const recent = digits.slice(-100);
    const total = recent.length;
    const over = recent.filter(d => d > threshold).length;
    const under = recent.filter(d => d < threshold).length;
    const equal = recent.filter(d => d === threshold).length;
    const overPct = over / total * 100;
    const underPct = under / total * 100;
    const equalPct = equal / total * 100;

    // Rolling trend
    const half = recent.slice(-50);
    const halfOver = half.filter(d => d > threshold).length;
    const halfUnder = half.filter(d => d < threshold).length;
    const trend = halfOver > halfUnder ? 'over_trending' : halfUnder > halfOver ? 'under_trending' : 'balanced';

    // Consecutive
    const last = recent[recent.length - 1];
    let consec = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      if ((recent[i] > threshold) === (last > threshold)) consec++;
      else break;
    }

    let bias = 'neutral';
    let strength = 'moderate';
    if (overPct > 60) { bias = 'over'; strength = 'strong'; }
    else if (overPct > 55) { bias = 'over'; strength = 'moderate'; }
    else if (underPct > 60) { bias = 'under'; strength = 'strong'; }
    else if (underPct > 55) { bias = 'under'; strength = 'moderate'; }

    return {
      threshold,
      window: total,
      over: { count: over, pct: overPct },
      under: { count: under, pct: underPct },
      equal: { count: equal, pct: equalPct },
      trend,
      consecutive: consec,
      bias,
      strength,
      estimated: bias === 'neutral' ? 'Balanced — no clear bias' : bias.toUpperCase() + ' bias (' + strength + ') — ' +
        (bias === 'over' ? overPct.toFixed(1) : underPct.toFixed(1)) + '% of last ' + total + ' ticks',
      evidence: 'Based on last ' + total + ' ticks. Over/Under ratio: ' + over + '/' + under +
        '. Recent trend: ' + trend + '. Current streak: ' + consec + '.',
    };
  }

  // ── Even / Odd Analysis ──
  function evenOddAnalysis() {
    if (digits.length < 30) return null;
    const recent = digits.slice(-100);
    const eo = evenOdd(recent);
    const alt = alternations(recent);
    const streak = streaks(recent);

    // Confidence based on sample size and consistency
    const delta = Math.abs(eo.evenPct - eo.oddPct);
    let confidence = Math.min(80, 40 + delta * 0.8);
    let bias = 'neutral';
    if (eo.evenPct > 58) bias = 'even';
    else if (eo.oddPct > 58) bias = 'odd';

    // Alternation rate (random = ~50%)
    const altDesc = alt.rate > 60 ? 'High alternation rate — frequent even/odd flips' :
      alt.rate < 35 ? 'Low alternation rate — longer runs of same parity' :
      'Moderate alternation rate — near random';

    return {
      window: recent.length,
      even: { count: eo.even, pct: eo.evenPct },
      odd: { count: eo.odd, pct: eo.oddPct },
      alternation: { rate: alt.rate, flips: alt.count, description: altDesc },
      streak,
      bias,
      confidence: Math.round(confidence),
      estimated: bias === 'neutral' ? 'Even/Odd distribution is balanced' :
        bias.toUpperCase() + ' bias — ' + (bias === 'even' ? eo.evenPct.toFixed(1) : eo.oddPct.toFixed(1)) + '% of last ' + recent.length + ' ticks',
      evidence: 'Even: ' + eo.even + ' (' + eo.evenPct.toFixed(1) + '%), Odd: ' + eo.odd + ' (' + eo.oddPct.toFixed(1) + '%). ' +
        'Alternation: ' + alt.flips + '/' + alt.total + ' (' + alt.rate.toFixed(1) + '%). ' + altDesc + '.',
    };
  }

  // ── Matches / Differs Analysis ──
  function matchesDiffersAnalysis() {
    if (digits.length < 10) return null;
    const recent = digits.slice(-100);
    if (recent.length < 2) return null;

    let matches = 0, differs = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] === recent[i - 1]) matches++;
      else differs++;
    }
    const total = matches + differs;
    const matchPct = matches / total * 100;
    const differPct = differs / total * 100;

    // Recent (last 20)
    const last20 = recent.slice(-20);
    let m20 = 0, d20 = 0;
    for (let i = 1; i < last20.length; i++) {
      if (last20[i] === last20[i - 1]) m20++;
      else d20++;
    }
    const t20 = m20 + d20 || 1;
    const m20Pct = m20 / t20 * 100;

    // Streak
    let consecMatch = 0;
    for (let i = recent.length - 1; i >= 1; i--) {
      if (recent[i] === recent[i - 1]) consecMatch++;
      else break;
    }

    // Frequency of each digit changing
    const freq = digitFrequencies(recent);
    const mostFreq = freq.slice().sort((a, b) => b.count - a.count).slice(0, 3);

    const delta = Math.abs(matchPct - differPct);
    let confidence = Math.min(75, 30 + delta * 0.7);
    let bias = matchPct > 55 ? 'matches' : differPct > 55 ? 'differs' : 'neutral';

    return {
      window: total + 1,
      matches: { count: matches, pct: matchPct, recentPct: m20Pct },
      differs: { count: differs, pct: differPct, recentPct: 100 - m20Pct },
      consecutiveMatches: consecMatch,
      mostFrequentDigits: mostFreq,
      bias,
      confidence: Math.round(confidence),
      estimated: bias === 'neutral' ? 'Matches/Differs distribution is balanced' :
        bias.toUpperCase() + ' bias — ' + (bias === 'matches' ? matchPct.toFixed(1) : differPct.toFixed(1)) + '% ' + bias +
        ' in last ' + (total + 1) + ' ticks',
      evidence: 'Matches: ' + matches + ' (' + matchPct.toFixed(1) + '%), Differs: ' + differs + ' (' + differPct.toFixed(1) + '%). ' +
        'Recent window: ' + m20Pct.toFixed(1) + '% matches. Consecutive matches: ' + consecMatch + '. ' +
        'Most frequent digits: ' + mostFreq.map(d => d.digit + ' (' + d.pct.toFixed(1) + '%)').join(', ') + '.',
    };
  }

  // ── Combined recommendation ──
  function generateRecommendation() {
    if (digits.length < 50) return [];

    const recs = [];

    // Over/Under for thresholds 3, 5, 7
    [3, 5, 7].forEach(t => {
      const oa = overUnderAnalysis(t);
      if (!oa || oa.bias === 'neutral') return;
      recs.push({
        type: 'Over/Under',
        detail: 'Over ' + t + ' / Under ' + t,
        direction: oa.bias === 'over' ? 'OVER ' + t : 'UNDER ' + t,
        confidence: Math.round(oa.bias === 'over' ? oa.over.pct : oa.under.pct),
        strength: oa.strength,
        evidence: oa.evidence,
        explanation: 'The last ' + oa.window + ' ticks show ' +
          (oa.bias === 'over' ? oa.over.pct.toFixed(1) + '% of digits > ' + t : oa.under.pct.toFixed(1) + '% of digits < ' + t) +
          '. Recent trend: ' + oa.trend + '. Current streak: ' + oa.consecutive + '.',
        risk: oa.strength === 'strong' ? 'Low' : 'Medium',
        time: Date.now(),
      });
    });

    // Even/Odd
    const eo = evenOddAnalysis();
    if (eo && eo.bias !== 'neutral') {
      recs.push({
        type: 'Even/Odd',
        detail: 'Even / Odd',
        direction: eo.bias === 'even' ? 'EVEN' : 'ODD',
        confidence: eo.confidence,
        strength: eo.confidence > 65 ? 'strong' : 'moderate',
        evidence: eo.evidence,
        explanation: 'Even/Odd analysis indicates ' + eo.bias.toUpperCase() + ' bias with ' + eo.confidence + '% confidence. ' +
          (eo.bias === 'even' ? eo.even.pct.toFixed(1) + '% even' : eo.odd.pct.toFixed(1) + '% odd') +
          ' over last ' + eo.window + ' ticks. ' + eo.alternation.description + '.',
        risk: eo.confidence > 65 ? 'Low' : 'Medium',
        time: Date.now(),
      });
    }

    // Matches/Differs
    const md = matchesDiffersAnalysis();
    if (md && md.bias !== 'neutral') {
      recs.push({
        type: 'Matches/Differs',
        detail: 'Matches / Differs',
        direction: md.bias === 'matches' ? 'MATCHES' : 'DIFFERS',
        confidence: md.confidence,
        strength: md.confidence > 50 ? 'moderate' : 'weak',
        evidence: md.evidence,
        explanation: 'Matches/Differs analysis shows ' + md.bias.toUpperCase() + ' bias. ' +
          (md.bias === 'matches' ? md.matches.pct.toFixed(1) + '% matches' : md.differs.pct.toFixed(1) + '% differs') +
          ' over last ' + md.window + ' ticks. Recent window: ' + md.matches.recentPct.toFixed(1) + '% matches. ' +
          'Top digits: ' + md.mostFrequentDigits.map(d => d.digit).join(', ') + '.',
        risk: 'Medium',
        time: Date.now(),
      });
    }

    // Sort by confidence descending
    recs.sort((a, b) => b.confidence - a.confidence);
    return recs.slice(0, 5);
  }

  // ── Summary statistics ──
  function summary() {
    if (digits.length < 10) return null;
    const freq = digitFrequencies(digits.slice(-200));
    const eo = evenOdd(digits.slice(-200));
    const chi2 = chiSquareUniform(digits.slice(-200));
    const vol = digitVolatility(digits, 50);
    const trans = transitionMatrix(digits.slice(-100));
    const alt = alternations(digits.slice(-100));
    const mostCommon = freq.slice().sort((a, b) => b.count - a.count).slice(0, 3);
    const leastCommon = freq.slice().sort((a, b) => a.count - b.count).slice(0, 3);

    return {
      totalTicks: digits.length,
      recentWindow: Math.min(200, digits.length),
      frequencies: freq,
      evenOdd: eo,
      uniformity: chi2,
      volatility: vol,
      alternation: alt,
      mostCommon,
      leastCommon,
      transitionMat: trans,
      mean: digits.slice(-200).reduce((s, d) => s + d, 0) / Math.min(200, digits.length),
    };
  }

  return {
    storeTick, onTick, getTicks, getDigits, count, getLastDigit,
    digitFrequencies, rollingFrequencies, evenOdd, streaks,
    transitionMatrix, alternations, momentum, digitVolatility,
    chiSquareUniform, distributionChange,
    overUnderAnalysis, evenOddAnalysis, matchesDiffersAnalysis,
    generateRecommendation, summary,
  };
})();
