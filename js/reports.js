const Reports = (() => {

  function getScoreColor(v) {
    if (v >= 70) return '#22c55e';
    if (v >= 50) return '#eab308';
    if (v >= 30) return '#f97316';
    return '#ef4444';
  }

  function getScoreGrade(v) {
    if (v >= 80) return 'Very Strong';
    if (v >= 65) return 'Strong';
    if (v >= 50) return 'Moderate';
    if (v >= 35) return 'Weak';
    return 'Poor';
  }

  function healthScores(signal, candles) {
    if (!signal || !candles || candles.length < 30) return null;

    const ind = Indicators;
    const rsi = ind.rsi(candles);
    const adx = ind.adx(candles);
    const bb = ind.bollinger(candles);
    const atrV = ind.atr(candles);
    const stoch = ind.stochastic(candles);
    const cci = ind.cci(candles);
    const mom = ind.momentum(candles);

    // Trend Score: ADX + EMA slope + HH/HL
    let trendScore = 50;
    if (adx.adx > 25) trendScore += 20;
    if (adx.adx > 40) trendScore += 10;
    if (signal.structure) {
      if (signal.structure.higherHighs) trendScore += 10;
      if (signal.structure.higherLows) trendScore += 10;
    }
    trendScore = Math.min(100, Math.max(0, trendScore));

    // Momentum Score: RSI + CCI + MACD + Mom
    let momScore = 50;
    if (rsi.value > 40 && rsi.value < 60) momScore += 10; // neutral zone = healthy
    if (rsi.value > 50) momScore += 5;
    if (cci > 0) momScore += 5;
    if (cci > 50) momScore += 5;
    if (mom > 0) momScore += 5;
    if (signal.indicators.macd > 0) momScore += 10;
    momScore = Math.min(100, Math.max(0, momScore));

    // Vol Score: BB width + ATR + ADX
    let volScore = 50;
    if (bb.width < 2) volScore -= 15;
    if (bb.width > 6) volScore += 10;
    if (adx.adx > 30) volScore += 10;
    if (adx.adx < 20) volScore -= 10;
    volScore = Math.min(100, Math.max(0, volScore));

    // Signal quality: confidence + pattern count + votes
    let sigScore = 50;
    sigScore += signal.confidence * 0.3;
    const pc = (signal.patterns || []).length;
    if (pc > 0) sigScore += Math.min(20, pc * 5);
    if (signal.bullVotes + signal.bearVotes > 3) sigScore += 10;
    sigScore = Math.min(100, Math.max(0, sigScore));

    // Structure score
    let structScore = 50;
    if (signal.structure) {
      if (signal.structure.trend === 'uptrend' || signal.structure.trend === 'downtrend') structScore += 15;
      if (signal.structure.higherHighs && signal.structure.higherLows) structScore += 10;
      if (signal.structure.lowerHighs && signal.structure.lowerLows) structScore += 10;
    }
    structScore = Math.min(100, Math.max(0, structScore));

    // Risk score (inverted — higher = safer)
    let riskScore = 65;
    if (bb.width > 8) riskScore -= 15;
    if (adx.adx > 45) riskScore -= 10;
    if (atrV > 0.01) riskScore -= 10;
    if (rsi.value > 75 || rsi.value < 25) riskScore -= 10;
    riskScore = Math.min(100, Math.max(0, riskScore));

    // Confidence: average of all
    const confidenceScore = Math.round((trendScore + momScore + volScore + sigScore + structScore + riskScore) / 6);

    return {
      overall: confidenceScore,
      scores: [
        { label: 'Trend', value: Math.round(trendScore), desc: adx.trend + ' (' + adx.adx.toFixed(1) + ' ADX)' },
        { label: 'Momentum', value: Math.round(momScore), desc: 'RSI ' + rsi.value.toFixed(1) + ' | CCI ' + cci.toFixed(1) },
        { label: 'Volatility', value: Math.round(volScore), desc: 'BB ' + bb.width + '% | ATR ' + atrV.toFixed(4) },
        { label: 'Signal Quality', value: Math.round(sigScore), desc: signal.confidence + '% confidence | ' + (signal.patterns || []).length + ' patterns' },
        { label: 'Structure', value: Math.round(structScore), desc: signal.structure.trend + ' | HH:' + signal.structure.higherHighs + ' HL:' + signal.structure.higherLows },
        { label: 'Risk Safety', value: Math.round(riskScore), desc: getScoreGrade(riskScore) + ' risk level' },
      ],
      explanation: 'Overall market health is ' + getScoreGrade(confidenceScore).toLowerCase() + ' (' + confidenceScore + '/100). ' +
        'Trend is ' + adx.trend + ' (ADX ' + adx.adx.toFixed(1) + '). ' +
        (rsi.value > 70 ? 'RSI indicates overbought conditions. ' : rsi.value < 30 ? 'RSI indicates oversold conditions. ' : 'RSI is in neutral territory. ') +
        (bb.width > 6 ? 'Volatility is elevated — wider price swings expected. ' : bb.width < 2 ? 'Volatility is low — potential breakout ahead. ' : 'Volatility is moderate. ') +
        'Signal confidence: ' + signal.confidence + '%.'
    };
  }

  function marketSummary(signal, candles) {
    if (!signal || !candles || candles.length < 30) return null;

    const ind = Indicators;
    const rsi = ind.rsi(candles);
    const adx = ind.adx(candles);
    const bb = ind.bollinger(candles);
    const stoch = ind.stochastic(candles);
    const cci = ind.cci(candles);
    const mom = ind.momentum(candles);
    const last = candles[candles.length - 1];

    const trendDesc = signal.structure.trend === 'uptrend' ? 'uptrend with higher highs and higher lows' :
      signal.structure.trend === 'downtrend' ? 'downtrend with lower highs and lower lows' : 'ranging with no clear directional bias';

    const momDesc = mom > 1 ? 'positive momentum' : mom > 0 ? 'slightly positive momentum' : mom > -1 ? 'slightly negative momentum' : 'negative momentum';

    const volDesc = bb.width > 6 ? 'high volatility with wide Bollinger Bands' : bb.width < 2 ? 'low volatility with narrowing Bollinger Bands (squeeze)' : 'moderate volatility levels';

    const srDesc = 'Support near ' + bb.lower.toFixed(4) + ' (lower Bollinger Band), resistance near ' + bb.upper.toFixed(4) + ' (upper Bollinger Band)';

    const patternDesc = (signal.patterns || []).length > 0 ?
      'Dominant patterns: ' + signal.patterns.slice(0, 3).map(p => p.pattern + ' (' + p.type + ')').join(', ') :
      'No significant candlestick patterns detected';

    const agreement = signal.confidence > 65 ? 'Most indicators are in agreement, increasing signal reliability.' :
      signal.confidence > 45 ? 'Indicators show mixed signals — exercise caution.' :
      'Indicators are largely in disagreement — avoid high-conviction trades.';

    const bias = signal.type === 'BUY' ? 'bullish bias. Look for long entries on pullbacks.' :
      signal.type === 'SELL' ? 'bearish bias. Look for short entries on rallies.' :
      'neutral bias. Wait for clearer directional signals.';

    const invalidation = 'This analysis is invalidated if: price breaks below ' + bb.lower.toFixed(4) + ' (for bullish view) or above ' + bb.upper.toFixed(4) + ' (for bearish view), or if RSI diverges significantly from price action.';

    return {
      summary: [
        'The market is in a ' + trendDesc + '.',
        'Momentum is ' + momDesc + ' (Momentum: ' + mom.toFixed(2) + '%, RSI: ' + rsi.value.toFixed(1) + ', CCI: ' + cci.toFixed(1) + ').',
        'Volatility is ' + volDesc + '.',
        srDesc + '.',
        patternDesc + '.',
        agreement,
        'Current bias: ' + bias,
      ],
      invalidation,
      lastPrice: last.close,
      timestamp: Date.now(),
    };
  }

  function signalReport(signal) {
    if (!signal) return null;
    return {
      type: signal.type,
      confidence: signal.confidence,
      entryZone: signal.entryZone,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      rr: signal.rr,
      riskRating: signal.riskRating,
      price: signal.price,
      reasons: signal.reasons,
      indicators: signal.indicators,
      structure: signal.structure,
    };
  }

  function indicatorReports(signal, candles) {
    if (!signal || !candles || candles.length < 30) return [];
    const ind = Indicators;
    const rsi = ind.rsi(candles);
    const macd = ind.macd(candles);
    const bb = ind.bollinger(candles);
    const atrV = ind.atr(candles);
    const adx = ind.adx(candles);
    const stoch = ind.stochastic(candles);
    const ema20 = ind.ema(candles, 20);
    const sma20 = ind.sma(candles, 20);
    const vwap = ind.vwap(candles);
    const cci = ind.cci(candles);
    const mom = ind.momentum(candles);
    const sar = ind.psar(candles);
    const last = candles[candles.length - 1];

    const emaBull = ema20 !== null && last.close > ema20;
    const smaBull = sma20 !== null && last.close > sma20;
    const priceAboveVwap = last.close > vwap;

    const bullishCount = [
      rsi.value > 50, macd.bullish, emaBull, smaBull, priceAboveVwap,
      cci > 0, mom > 0, sar.trend === 'up', stoch.k > 50,
    ].filter(Boolean).length;

    const indicators = [
      { name: 'RSI', value: rsi.value.toFixed(1), status: rsi.overbought ? 'Overbought' : rsi.oversold ? 'Oversold' : 'Neutral', bullish: rsi.value > 50, contribution: rsi.overbought ? 'Suggests potential reversal down' : rsi.oversold ? 'Suggests potential reversal up' : 'Neutral zone — no extreme signal' },
      { name: 'MACD', value: macd.macd.toFixed(2), status: macd.bullish ? 'Bullish' : 'Bearish', bullish: macd.bullish, contribution: macd.bullish ? 'Bullish cross — positive momentum' : 'Bearish cross — negative momentum' },
      { name: 'Bollinger Bands', value: bb.width.toFixed(1) + '%', status: bb.width > 6 ? 'Wide' : bb.width < 2 ? 'Tight' : 'Normal', bullish: null, contribution: bb.width > 6 ? 'High volatility environment' : bb.width < 2 ? 'Squeeze — breakout imminent' : 'Normal volatility' },
      { name: 'ATR', value: atrV.toFixed(4), status: atrV > 0.005 ? 'Elevated' : 'Normal', bullish: null, contribution: 'Measures average price range — ' + (atrV > 0.005 ? 'wider stops recommended' : 'normal position sizing') },
      { name: 'ADX', value: adx.adx.toFixed(1), status: adx.trend === 'strong' ? 'Strong trend' : adx.trend === 'weak' ? 'Weak trend' : 'Moderate', bullish: null, contribution: 'Trend strength: ' + adx.adx.toFixed(1) + ' — ' + (adx.adx > 25 ? 'trending conditions' : 'ranging/choppy conditions') },
      { name: 'Stochastic', value: stoch.k.toFixed(1), status: stoch.overbought ? 'Overbought' : stoch.oversold ? 'Oversold' : 'Neutral', bullish: stoch.k > 50, contribution: stoch.overbought ? 'Overbought — watch for reversal' : stoch.oversold ? 'Oversold — watch for bounce' : 'Neutral — no extreme' },
      { name: 'Parabolic SAR', value: sar.sar.toFixed(4), status: 'Trend: ' + sar.trend, bullish: sar.trend === 'up', contribution: 'SAR is ' + (sar.trend === 'up' ? 'below price — bullish bias' : 'above price — bearish bias') },
      { name: 'CCI', value: cci.toFixed(1), status: cci > 100 ? 'Overbought' : cci < -100 ? 'Oversold' : 'Neutral', bullish: cci > 0, contribution: cci > 100 ? 'Strong bullish momentum — overextended' : cci < -100 ? 'Strong bearish momentum — oversold' : 'Neutral' },
      { name: 'Momentum', value: (mom >= 0 ? '+' : '') + mom.toFixed(2) + '%', status: mom > 0 ? 'Positive' : 'Negative', bullish: mom > 0, contribution: mom > 0 ? 'Price momentum is positive' : 'Price momentum is negative' },
      { name: 'VWAP', value: vwap.toFixed(4), status: priceAboveVwap ? 'Price above' : 'Price below', bullish: priceAboveVwap, contribution: priceAboveVwap ? 'Price above VWAP — bullish intraday bias' : 'Price below VWAP — bearish intraday bias' },
    ];

    return { indicators, bullishCount, totalCount: 9 };
  }

  function patternReport(patterns) {
    if (!patterns || patterns.length === 0) return [];
    return patterns.map(p => {
      let significance = 'low';
      let detail = p.detail || '';
      if (['Morning Star', 'Evening Star', 'Three White Soldiers', 'Three Black Crows', 'Bullish Engulfing', 'Bearish Engulfing'].includes(p.pattern)) significance = 'high';
      else if (['Hammer', 'Shooting Star', 'Tweezer Bottom', 'Tweezer Top'].includes(p.pattern)) significance = 'medium';
      return {
        pattern: p.pattern,
        type: p.type,
        detail: detail || (p.type === 'bullish' ? 'Bullish reversal signal' : p.type === 'bearish' ? 'Bearish reversal signal' : 'Neutral pattern'),
        significance,
        action: significance === 'high' ? 'Strong signal — worth acting on' : significance === 'medium' ? 'Notable — seek confirmation' : 'Minor — context dependent',
      };
    });
  }

  function riskAnalysis(signal, candles) {
    if (!signal || !candles || candles.length < 30) return null;
    const ind = Indicators;
    const bb = ind.bollinger(candles);
    const adx = ind.adx(candles);
    const atrV = ind.atr(candles);
    const rsi = ind.rsi(candles);

    const volDesc = bb.width > 6 ? 'High — market making wide swings' : bb.width > 3 ? 'Moderate — normal trading range' : 'Low — market compressing';
    const trendDesc = adx.adx > 25 ? 'Strong — directional moves likely to persist' : adx.adx > 20 ? 'Moderate — trend developing' : 'Weak — choppy, range-bound';
    const sigReliability = signal.confidence > 70 ? 'High — multiple indicators aligned' : signal.confidence > 50 ? 'Medium — partial alignment' : 'Low — conflicting signals';

    let maxRisk = 2.0;
    if (signal.riskRating === 'High') maxRisk = 0.5;
    else if (signal.riskRating === 'Medium') maxRisk = 1.0;
    else maxRisk = 2.0;

    let patience = 'Trade Now';
    if (signal.riskRating === 'High' || bb.width > 6) patience = 'Wait for Confirmation';
    else if (signal.confidence < 55) patience = 'Wait for Better Setup';

    return {
      marketVolatility: volDesc,
      trendStrength: trendDesc,
      signalReliability: sigReliability,
      recommendedMaxRisk: maxRisk.toFixed(1) + '%',
      uncertainty: signal.riskRating === 'High' ? 'Elevated — multiple risk factors present' : signal.riskRating === 'Medium' ? 'Moderate — standard precautions apply' : 'Low — conditions are favorable',
      patienceLevel: patience,
      atr: atrV.toFixed(4),
      bbWidth: bb.width.toFixed(1) + '%',
      rsi: rsi.value.toFixed(1),
    };
  }

  return { healthScores, marketSummary, signalReport, indicatorReports, patternReport, riskAnalysis, getScoreColor };
})();
