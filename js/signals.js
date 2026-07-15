/**
 * Signal Generation Engine
 * Combines indicators, patterns, and price action into structured signals.
 *
 * A signal is only emitted when multiple independent conditions converge.
 * Confidence = fraction of conditions voting in agreement.
 * This is not a prediction — it's a measure of confluence.
 */

const Signals = (() => {
  const signalHistory = [];

  function evaluate(candles) {
    if (!candles || candles.length < 50) return null;

    const ind = Indicators;
    const last = candles[candles.length - 1];

    // Compute all indicators
    const rsiVal = ind.rsi(candles);
    const macdVal = ind.macd(candles);
    const bb = ind.bollinger(candles);
    const atrVal = ind.atr(candles);
    const adxVal = ind.adx(candles);
    const stoch = ind.stochastic(candles);
    const cciVal = ind.cci(candles);
    const mom = ind.momentum(candles);
    const sar = ind.psar(candles);
    const ichi = ind.ichimoku(candles);
    const donch = ind.donchian(candles);
    const vwapVal = ind.vwap(candles);
    const ema20 = ind.ema(candles, 20);
    const ema50 = ind.ema(candles, 50);
    const struct = ind.marketStructure(candles);
    const sr = ind.supportResistance(candles);
    const pa = ind.priceAction(candles);

    // Patterns
    const patterns = Patterns.detect(candles);
    const bullPatterns = patterns.filter(p => p.type === 'bullish').length;
    const bearPatterns = patterns.filter(p => p.type === 'bearish').length;

    // ---- Voting system ----
    const bullVotes = [];
    const bearVotes = [];
    let reasons = [];

    // RSI
    if (rsiVal.oversold) { bullVotes.push('RSI oversold'); reasons.push('RSI ' + rsiVal.value + ' — oversold'); }
    else if (rsiVal.overbought) { bearVotes.push('RSI overbought'); reasons.push('RSI ' + rsiVal.value + ' — overbought'); }

    // MACD
    if (macdVal.bullish) { bullVotes.push('MACD bullish'); reasons.push('MACD histogram rising'); }
    else if (macdVal.bearish) { bearVotes.push('MACD bearish'); reasons.push('MACD histogram falling'); }

    // Bollinger
    if (last.close <= bb.lower * 1.01) { bullVotes.push('BB lower band touch'); reasons.push('Price at BB lower band'); }
    else if (last.close >= bb.upper * 0.99) { bearVotes.push('BB upper band touch'); reasons.push('Price at BB upper band'); }

    // Stochastic
    if (stoch.oversold) { bullVotes.push('Stochastic oversold'); reasons.push('Stoch K ' + stoch.k + ' — oversold'); }
    else if (stoch.overbought) { bearVotes.push('Stochastic overbought'); reasons.push('Stoch K ' + stoch.k + ' — overbought'); }

    // CCI
    if (cciVal < -100) { bullVotes.push('CCI oversold'); reasons.push('CCI ' + cciVal + ' — oversold'); }
    else if (cciVal > 100) { bearVotes.push('CCI overbought'); reasons.push('CCI ' + cciVal + ' — overbought'); }

    // Parabolic SAR
    if (sar.trend === 'up') { bullVotes.push('SAR bullish'); reasons.push('Parabolic SAR bullish'); }
    else if (sar.trend === 'down') { bearVotes.push('SAR bearish'); reasons.push('Parabolic SAR bearish'); }

    // Ichimoku
    if (ichi.cloudBullish) { bullVotes.push('Ichimoku bullish'); reasons.push('Price above cloud'); }
    else if (ichi.cloudBearish) { bearVotes.push('Ichimoku bearish'); reasons.push('Price below cloud'); }

    // Market structure
    if (struct.trend === 'uptrend') { bullVotes.push('Uptrend'); reasons.push('Higher highs/lows'); }
    else if (struct.trend === 'downtrend') { bearVotes.push('Downtrend'); reasons.push('Lower highs/lows'); }

    // Price action
    if (pa.breakoutUp) { bullVotes.push('Breakout up'); reasons.push('Breakout above resistance'); }
    else if (pa.breakoutDown) { bearVotes.push('Breakout down'); reasons.push('Breakout below support'); }
    if (pa.consolidation) { reasons.push('Consolidating'); }

    // Momentum
    if (mom > 0) { bullVotes.push('Positive momentum'); reasons.push('Momentum +' + mom.toFixed(2) + '%'); }
    else if (mom < 0) { bearVotes.push('Negative momentum'); reasons.push('Momentum ' + mom.toFixed(2) + '%'); }

    // EMA relationship
    if (ema20 && ema50 && last.close > ema20 && ema20 > ema50) { bullVotes.push('EMA bullish alignment'); reasons.push('Price > EMA20 > EMA50'); }
    else if (ema20 && ema50 && last.close < ema20 && ema20 < ema50) { bearVotes.push('EMA bearish alignment'); reasons.push('Price < EMA20 < EMA50'); }

    // Donchian
    if (last.close >= donch.upper * 0.995) { bearVotes.push('Donchian upper'); reasons.push('At Donchian resistance'); }
    else if (last.close <= donch.lower * 1.005) { bullVotes.push('Donchian lower'); reasons.push('At Donchian support'); }

    // Patterns
    if (bullPatterns > bearPatterns) { bullVotes.push('Bullish patterns (' + bullPatterns + ')'); }
    else if (bearPatterns > bullPatterns) { bearVotes.push('Bearish patterns (' + bearPatterns + ')'); }

    // ---- Determine signal ----
    const bullCount = bullVotes.length;
    const bearCount = bearVotes.length;
    const total = Math.max(bullCount + bearCount, 1);

    let type = 'WAIT';
    let confidence = 0;
    let entryZone = null;
    let stopLoss = null;
    let takeProfit = null;
    let rr = null;

    if (bullCount > bearCount && bullCount >= 3) {
      type = 'BUY';
      confidence = Math.round((bullCount / total) * 100);
      entryZone = last.close;
      stopLoss = Math.min(last.close - atrVal * 1.5, sr.support);
      takeProfit = last.close + atrVal * (bullCount / total) * 5;
      if (stopLoss && atrVal > 0) rr = +(((takeProfit - entryZone) / (entryZone - stopLoss))).toFixed(2);
    } else if (bearCount > bullCount && bearCount >= 3) {
      type = 'SELL';
      confidence = Math.round((bearCount / total) * 100);
      entryZone = last.close;
      stopLoss = Math.max(last.close + atrVal * 1.5, sr.resistance);
      takeProfit = last.close - atrVal * (bearCount / total) * 5;
      if (stopLoss && atrVal > 0) rr = +(((entryZone - takeProfit) / (stopLoss - entryZone))).toFixed(2);
    }

    // ---- Risk assessment ----
    let riskRating = 'Medium';
    if (adxVal.trend === 'weak' && bb.width > 5) riskRating = 'High';
    else if (adxVal.trend === 'strong' && bb.width < 3) riskRating = 'Low';
    else if (!adxVal.trend || adxVal.trend === 'moderate') riskRating = 'Medium';

    const maxRisk = atrVal > 0 ? +(atrVal * 1.5).toFixed(2) : '—';

    const signal = {
      type,
      confidence,
      timestamp: Date.now(),
      time: new Date().toISOString(),
      price: last.close,
      reasons: reasons.slice(0, 8),
      bullVotes: bullCount,
      bearVotes: bearCount,
      bulletin: bullVotes.slice(0, 4),
      bearline: bearVotes.slice(0, 4),
      entryZone: entryZone ? +entryZone.toFixed(4) : '—',
      stopLoss: stopLoss ? +stopLoss.toFixed(4) : '—',
      takeProfit: takeProfit ? +takeProfit.toFixed(4) : '—',
      rr,
      riskRating,
      maxRisk,
      patterns: patterns,
      indicators: { rsi: rsiVal.value, macd: macdVal.macd, bbWidth: bb.width, atr: atrVal, adx: adxVal.adx, stochK: stoch.k },
      structure: struct,
      volatility: atrVal > 0 ? 'Medium' : 'Low',
    };

    return signal;
  }

  function addHistory(signal) {
    signalHistory.unshift(signal);
    if (signalHistory.length > 200) signalHistory.pop();
  }

  function getHistory() { return signalHistory; }
  function clearHistory() { signalHistory.length = 0; }

  return { evaluate, addHistory, getHistory, clearHistory };
})();
