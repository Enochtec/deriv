/**
 * Technical Indicator Library
 * All functions take an array of candles ({ open, high, low, close, time })
 * and return computed values.
 */

const Indicators = (() => {
  // ---- RSI ----
  function rsi(candles, period = 14) {
    if (candles.length < period + 1) return { value: 50, overbought: false, oversold: false };
    const closes = candles.map(c => c.close);
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gains += d; else losses -= d;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    if (avgLoss === 0) return { value: 100, overbought: true, oversold: false };
    let rs = avgGain / avgLoss;
    let rsi = 100 - 100 / (1 + rs);
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      const g = d >= 0 ? d : 0;
      const l = d >= 0 ? 0 : -d;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
      if (avgLoss === 0) { rsi = 100; continue; }
      rs = avgGain / avgLoss;
      rsi = 100 - 100 / (1 + rs);
    }
    return { value: +rsi.toFixed(2), overbought: rsi > 70, oversold: rsi < 30 };
  }

  // ---- EMA ----
  function ema(candles, period = 14) {
    if (candles.length < period) return null;
    const closes = candles.map(c => c.close);
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) ema = (closes[i] - ema) * k + ema;
    return +ema.toFixed(4);
  }

  // ---- SMA ----
  function sma(candles, period = 20) {
    if (candles.length < period) return null;
    const closes = candles.map(c => c.close);
    const sum = closes.slice(-period).reduce((a, b) => a + b, 0);
    return +(sum / period).toFixed(4);
  }

  // ---- MACD ----
  function macd(candles) {
    if (candles.length < 35) return { macd: 0, signal: 0, histogram: 0, bullish: false, bearish: false };
    const closes = candles.map(c => c.close);
    const _ema = (data, p) => {
      const k = 2 / (p + 1);
      let val = data.slice(0, p).reduce((a, b) => a + b, 0) / p;
      for (let i = p; i < data.length; i++) val = (data[i] - val) * k + val;
      return val;
    };
    const ema12 = _ema(closes, 12);
    const ema26 = _ema(closes, 26);
    const m = ema12 - ema26;
    // build MACD line
    const macdLine = [];
    for (let i = 0; i < closes.length; i++) {
      const sub = closes.slice(0, i + 1);
      if (sub.length < 26) continue;
      const e12 = _ema(sub, 12);
      const e26 = _ema(sub, 26);
      macdLine.push(e12 - e26);
    }
    const sig = _ema(macdLine.slice(-9), 9);
    const hist = m - sig;
    return {
      macd: +m.toFixed(4),
      signal: +sig.toFixed(4),
      histogram: +hist.toFixed(4),
      bullish: m > sig,
      bearish: m < sig,
    };
  }

  // ---- Bollinger Bands ----
  function bollinger(candles, period = 20, std = 2) {
    if (candles.length < period) return { upper: 0, middle: 0, lower: 0, width: 0, percentB: 0.5 };
    const closes = candles.map(c => c.close);
    const mid = closes.slice(-period).reduce((a, b) => a + b, 0) / period;
    const sqDiffs = closes.slice(-period).map(v => (v - mid) ** 2);
    const sd = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / period);
    const upper = mid + sd * std;
    const lower = mid - sd * std;
    const last = closes[closes.length - 1];
    const width = ((upper - lower) / mid) * 100;
    const pB = upper === lower ? 0.5 : (last - lower) / (upper - lower);
    return { upper: +upper.toFixed(4), middle: +mid.toFixed(4), lower: +lower.toFixed(4), width: +width.toFixed(2), percentB: +pB.toFixed(2) };
  }

  // ---- ATR ----
  function atr(candles, period = 14) {
    if (candles.length < period + 1) return 0;
    const tr = [];
    for (let i = 1; i < candles.length; i++) {
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - candles[i - 1].close);
      const lc = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(hl, hc, lc));
    }
    const atr = tr.slice(-period).reduce((a, b) => a + b, 0) / period;
    return +atr.toFixed(4);
  }

  // ---- ADX ----
  function adx(candles, period = 14) {
    if (candles.length < period + 2) return { adx: 25, plusDI: 25, minusDI: 25, trend: 'neutral' };
    const tr = [], plusDM = [], minusDM = [];
    for (let i = 1; i < candles.length; i++) {
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - candles[i - 1].close);
      const lc = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(hl, hc, lc));
      const up = candles[i].high - candles[i - 1].high;
      const dn = candles[i - 1].low - candles[i].low;
      plusDM.push(up > dn && up > 0 ? up : 0);
      minusDM.push(dn > up && dn > 0 ? dn : 0);
    }
    const sum = arr => arr.slice(-period).reduce((a, b) => a + b, 0);
    const tr14 = sum(tr.slice(-period));
    if (tr14 === 0) return { adx: 25, plusDI: 25, minusDI: 25, trend: 'neutral' };
    const pDI = (sum(plusDM.slice(-period)) / tr14) * 100;
    const mDI = (sum(minusDM.slice(-period)) / tr14) * 100;
    const dx = Math.abs(pDI - mDI) / (pDI + mDI) * 100;
    // Simplified ADX (single period)
    const adxVal = dx;
    return { adx: +adxVal.toFixed(2), plusDI: +pDI.toFixed(2), minusDI: +mDI.toFixed(2), trend: adxVal < 25 ? 'weak' : adxVal < 50 ? 'moderate' : 'strong' };
  }

  // ---- Stochastic ----
  function stochastic(candles, period = 14, smoothK = 3) {
    if (candles.length < period + smoothK) return { k: 50, d: 50, overbought: false, oversold: false };
    const lows = candles.map(c => c.low);
    const highs = candles.map(c => c.high);
    const closes = candles.map(c => c.close);
    const kRaw = [];
    for (let i = period - 1; i < candles.length; i++) {
      const low = Math.min(...lows.slice(i - period + 1, i + 1));
      const high = Math.max(...highs.slice(i - period + 1, i + 1));
      if (high === low) { kRaw.push(50); continue; }
      kRaw.push(((closes[i] - low) / (high - low)) * 100);
    }
    const k = kRaw.slice(-smoothK).reduce((a, b) => a + b, 0) / smoothK;
    const d = k; // simplified
    return { k: +k.toFixed(2), d: +d.toFixed(2), overbought: k > 80, oversold: k < 20 };
  }

  // ---- VWAP ----
  function vwap(candles) {
    if (candles.length < 1) return 0;
    let cumVol = 0, cumTP = 0;
    for (const c of candles) {
      const tp = (c.high + c.low + c.close) / 3;
      const vol = c.volume || (c.high - c.low);
      cumTP += tp * vol;
      cumVol += vol;
    }
    return cumVol === 0 ? candles[candles.length - 1].close : +(cumTP / cumVol).toFixed(4);
  }

  // ---- CCI ----
  function cci(candles, period = 20) {
    if (candles.length < period) return 0;
    const tp = candles.map(c => (c.high + c.low + c.close) / 3);
    const mean = tp.slice(-period).reduce((a, b) => a + b, 0) / period;
    const mad = tp.slice(-period).reduce((sum, v) => sum + Math.abs(v - mean), 0) / period;
    if (mad === 0) return 0;
    return +((tp[tp.length - 1] - mean) / (0.015 * mad)).toFixed(2);
  }

  // ---- Momentum ----
  function momentum(candles, period = 10) {
    if (candles.length <= period) return 0;
    const closes = candles.map(c => c.close);
    return +((closes[closes.length - 1] - closes[closes.length - 1 - period]) / closes[closes.length - 1 - period] * 100).toFixed(3);
  }

  // ---- Parabolic SAR ----
  function psar(candles, afStart = 0.02, afIncrement = 0.02, afMax = 0.2) {
    if (candles.length < 3) return { sar: candles[candles.length - 1]?.close || 0, trend: 'neutral' };
    let isLong = true;
    let af = afStart;
    let ep = candles[0].high;
    let sar = candles[0].low;
    for (let i = 1; i < candles.length; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];
      if (isLong) {
        sar = sar + af * (ep - sar);
        if (sar > prev.low) sar = prev.low;
        if (sar > curr.low) sar = curr.low;
        if (curr.low < sar) { isLong = false; sar = ep; ep = curr.low; af = afStart; }
        else {
          if (curr.high > ep) { ep = curr.high; af = Math.min(af + afIncrement, afMax); }
        }
      } else {
        sar = sar + af * (ep - sar);
        if (sar < prev.high) sar = prev.high;
        if (sar < curr.high) sar = curr.high;
        if (curr.high > sar) { isLong = true; sar = ep; ep = curr.high; af = afStart; }
        else {
          if (curr.low < ep) { ep = curr.low; af = Math.min(af + afIncrement, afMax); }
        }
      }
    }
    return { sar: +sar.toFixed(4), trend: isLong ? 'up' : 'down' };
  }

  // ---- Ichimoku Cloud ----
  function ichimoku(candles) {
    if (candles.length < 52) return { tenkan: null, kijun: null, senkouA: null, senkouB: null, cloudBullish: false, cloudBearish: false };
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const closes = candles.map(c => c.close);
    const h9 = Math.max(...highs.slice(-9)), l9 = Math.min(...lows.slice(-9));
    const tenkan = (h9 + l9) / 2;
    const h26 = Math.max(...highs.slice(-26)), l26 = Math.min(...lows.slice(-26));
    const kijun = (h26 + l26) / 2;
    const h52 = Math.max(...highs.slice(-52)), l52 = Math.min(...lows.slice(-52));
    const senkouB = (h52 + l52) / 2;
    const senkouA = (tenkan + kijun) / 2;
    const last = closes[closes.length - 1];
    return {
      tenkan: +tenkan.toFixed(4), kijun: +kijun.toFixed(4),
      senkouA: +senkouA.toFixed(4), senkouB: +senkouB.toFixed(4),
      cloudBullish: last > senkouA && last > senkouB,
      cloudBearish: last < senkouA && last < senkouB,
    };
  }

  // ---- Donchian Channels ----
  function donchian(candles, period = 20) {
    if (candles.length < period) return { upper: 0, middle: 0, lower: 0 };
    const highs = candles.slice(-period).map(c => c.high);
    const lows = candles.slice(-period).map(c => c.low);
    const upper = Math.max(...highs);
    const lower = Math.min(...lows);
    const middle = (upper + lower) / 2;
    return { upper: +upper.toFixed(4), middle: +middle.toFixed(4), lower: +lower.toFixed(4) };
  }

  // ---- Market Structure (HH/HL/LH/LL) ----
  function marketStructure(candles, lookback = 10) {
    if (candles.length < lookback * 2) return { trend: 'neutral', higherHighs: false, higherLows: false, lowerHighs: false, lowerLows: false };
    const segment = candles.slice(-lookback);
    const highs = segment.map(c => c.high);
    const lows = segment.map(c => c.low);
    const hh = highs[highs.length - 1] > highs[highs.length - 2];
    const hl = lows[lows.length - 1] > lows[lows.length - 2];
    const lh = highs[highs.length - 1] < highs[highs.length - 2];
    const ll = lows[lows.length - 1] < lows[lows.length - 2];
    let trend = 'neutral';
    if (hh && hl) trend = 'uptrend';
    else if (lh && ll) trend = 'downtrend';
    else if (hh && !hl) trend = 'bearish_divergence';
    else if (!hh && hl) trend = 'bullish_divergence';
    return { trend, higherHighs: hh, higherLows: hl, lowerHighs: lh, lowerLows: ll };
  }

  // ---- Support / Resistance (simple pivot) ----
  function supportResistance(candles, lookback = 30) {
    if (candles.length < lookback) return { support: 0, resistance: 0 };
    const segment = candles.slice(-lookback);
    const highs = segment.map(c => c.high);
    const lows = segment.map(c => c.low);
    // Cluster near key levels (simplified: use min/max of extremes)
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);
    const mid = (support + resistance) / 2;
    const width = ((resistance - support) / mid) * 100;
    return { support: +support.toFixed(4), resistance: +resistance.toFixed(4), width: +width.toFixed(2) };
  }

  // ---- Price Action ----
  function priceAction(candles) {
    if (candles.length < 5) return { consolidation: false, breakoutUp: false, breakoutDown: false, pullback: false };
    const closes = candles.map(c => c.close);
    const last5 = candles.slice(-5);
    const range = Math.max(...last5.map(c => c.high)) - Math.min(...last5.map(c => c.low));
    const avgBody = last5.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / 5;
    const tight = range < (avgBody * 2); // consolidation
    const prev4 = candles.slice(-5, -1);
    const prevRange = Math.max(...prev4.map(c => c.high)) - Math.min(...prev4.map(c => c.low));
    const breakoutUp = prev4.every(c => c.close < c.open) && closes[closes.length - 1] > candles[candles.length - 2].high;
    const breakoutDown = prev4.every(c => c.close > c.open) && closes[closes.length - 1] < candles[candles.length - 2].low;
    const pullback = candles.length >= 10 && closes[closes.length - 1] < closes[closes.length - 2] &&
      closes.slice(-5, -1).every(c => c > candles[candles.length - 6]?.close);
    return { consolidation: tight, breakoutUp, breakoutDown, pullback, range: +range.toFixed(4) };
  }

  return {
    rsi, ema, sma, macd, bollinger, atr, adx, stochastic,
    vwap, cci, momentum, psar, ichimoku, donchian,
    marketStructure, supportResistance, priceAction,
  };
})();
