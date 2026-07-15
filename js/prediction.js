/**
 * Volatility Strategy Prediction Engine
 * Analyzes current market conditions, matches to strategies,
 * and produces predictions based on confluence of factors.
 */

const Prediction = (() => {

  // ---- Strategy definitions ----
  const STRATEGIES = [
    {
      id: 'breakout_pullback',
      name: 'Breakout Pullback',
      description: 'Wait for breakout above resistance, enter on pullback to support-turned-resistance.',
      volatility: ['high'],
      trend: ['uptrend', 'downtrend'],
      patterns: ['Bullish Engulfing', 'Bearish Engulfing', 'Three White Soldiers', 'Three Black Crows'],
      minConfidence: 60,
    },
    {
      id: 'trend_continuation',
      name: 'Trend Continuation',
      description: 'Enter on dips in strong uptrend or bounces in strong downtrend.',
      volatility: ['medium', 'high'],
      trend: ['uptrend', 'downtrend'],
      patterns: ['Hammer', 'Shooting Star', 'Bullish Harami', 'Bearish Harami'],
      minConfidence: 55,
    },
    {
      id: 'volatility_squeeze',
      name: 'Volatility Squeeze',
      description: 'Bollinger Bands narrowing signals impending expansion. Enter on first breakout candle.',
      volatility: ['low'],
      trend: ['neutral'],
      patterns: ['Doji', 'Spinning Top', 'Marubozu'],
      minConfidence: 50,
    },
    {
      id: 'reversal_range',
      name: 'Range Reversal',
      description: 'Oversold/overbought conditions at range extremes. Fade the move back to mean.',
      volatility: ['low', 'medium'],
      trend: ['neutral', 'bearish_divergence', 'bullish_divergence'],
      patterns: ['Morning Star', 'Evening Star', 'Hammer', 'Shooting Star', 'Doji'],
      minConfidence: 65,
    },
    {
      id: 'momentum_break',
      name: 'Momentum Break',
      description: 'Strong momentum (CCI > 100 or < -100) with trend confirmation. Ride the wave.',
      volatility: ['medium', 'high'],
      trend: ['uptrend', 'downtrend'],
      patterns: ['Marubozu', 'Three White Soldiers', 'Three Black Crows'],
      minConfidence: 60,
    },
    {
      id: 'mean_reversion',
      name: 'Mean Reversion',
      description: 'Price far from VWAP or EMA with extreme RSI. Expect snap-back to average.',
      volatility: ['low', 'medium'],
      trend: ['neutral'],
      patterns: ['Doji', 'Spinning Top'],
      minConfidence: 55,
    },
  ];

  /**
   * Determine volatility regime from indicators
   */
  function analyzeVolatility(ind, candles) {
    const bb = ind.bollinger(candles);
    const atrV = ind.atr(candles);
    const adx = ind.adx(candles);
    const pa = ind.priceAction(candles);

    let regime = 'medium';
    let reasons = [];
    let score = 0;

    // BB width
    if (bb.width < 2) { regime = 'low'; reasons.push('BB tight (' + bb.width + '%)'); score -= 1; }
    else if (bb.width > 8) { regime = 'high'; reasons.push('BB wide (' + bb.width + '%)'); score += 1; }
    else { reasons.push('BB moderate (' + bb.width + '%)'); }

    // ADX
    if (adx.trend === 'weak') { score -= 1; reasons.push('ADX weak (' + adx.adx + ')'); }
    else if (adx.trend === 'strong') { score += 1; reasons.push('ADX strong (' + adx.adx + ')'); }
    else { reasons.push('ADX moderate (' + adx.adx + ')'); }

    // Consolidation
    if (pa.consolidation) { score -= 1; reasons.push('Price consolidating'); }
    if (pa.breakoutUp || pa.breakoutDown) { score += 1; reasons.push(pa.breakoutUp ? 'Breakout up' : 'Breakout down'); }

    if (score <= -1) regime = 'low';
    else if (score >= 1) regime = 'high';
    else regime = 'medium';

    return { regime, score, reasons, bbWidth: bb.width, adx: adx.adx, atr: atrV };
  }

  /**
   * Match current conditions to strategies
   */
  function matchStrategies(vol, signal, candles) {
    if (!signal) return [];

    const matches = [];
    const struct = signal.structure || {};
    const patterns = signal.patterns || [];
    const patternNames = patterns.map(p => p.pattern);

    for (const s of STRATEGIES) {
      let score = 0;
      let matchedReasons = [];

      // Volatility match
      if (s.volatility.includes(vol.regime)) { score += 2; matchedReasons.push('Volatility: ' + vol.regime); }

      // Trend match
      if (s.trend.includes(struct.trend)) { score += 2; matchedReasons.push('Trend: ' + struct.trend); }

      // Pattern match
      const matchedPatterns = patternNames.filter(pn => s.patterns.includes(pn));
      if (matchedPatterns.length > 0) { score += matchedPatterns.length * 2; matchedReasons.push('Pattern: ' + matchedPatterns.join(', ')); }

      // Signal confidence
      if (signal.confidence >= s.minConfidence) { score += 1; matchedReasons.push('Confidence: ' + signal.confidence + '%'); }

      // Additional factors
      if (signal.type === 'BUY' && ['uptrend', 'bullish_divergence'].includes(struct.trend)) score += 1;
      if (signal.type === 'SELL' && ['downtrend', 'bearish_divergence'].includes(struct.trend)) score += 1;

      if (score >= 4) {
        matches.push({
          ...s,
          matchScore: score,
          reasons: matchedReasons,
          direction: signal.type,
          directionColor: signal.type === 'BUY' ? 'text-green-400' : signal.type === 'SELL' ? 'text-red-400' : 'text-yellow-400',
        });
      }
    }

    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches;
  }

  /**
   * Full prediction run
   */
  function predict(candles, signal) {
    if (!candles || candles.length < 50) {
      return { status: 'insufficient_data', message: 'Need at least 50 candles' };
    }

    const ind = Indicators;
    const vol = analyzeVolatility(ind, candles);
    const strategies = matchStrategies(vol, signal, candles);
    const rsi = ind.rsi(candles);
    const bb = ind.bollinger(candles);
    const adx = ind.adx(candles);
    const last = candles[candles.length - 1];

    // Overall prediction
    let direction = 'NEUTRAL';
    let confidence = 50;
    let bias = 'neutral';

    if (strategies.length > 0) {
      const top = strategies[0];
      if (top.direction === 'BUY' && top.matchScore >= 5) { direction = 'BULLISH'; confidence = 60 + top.matchScore * 3; bias = 'bullish'; }
      else if (top.direction === 'SELL' && top.matchScore >= 5) { direction = 'BEARISH'; confidence = 60 + top.matchScore * 3; bias = 'bearish'; }
    }

    // Volatility prediction: where is volatility heading?
    let volOutlook = 'stable';
    if (vol.regime === 'low' && vol.bbWidth < 2) volOutlook = 'expansion_soon';
    else if (vol.regime === 'high' && adx.trend === 'strong') volOutlook = 'trending';
    else if (vol.regime === 'medium' && vol.bbWidth < 3) volOutlook = 'contraction';

    return {
      status: 'ready',
      timestamp: Date.now(),
      price: last.close,
      direction,
      confidence: Math.min(confidence, 95),
      bias,
      volatility: vol,
      strategies: strategies.slice(0, 4),
      volOutlook,
      conditions: {
        rsi: rsi.value,
        bbWidth: bb.width,
        adx: adx.adx,
        patternCount: (signal?.patterns || []).length,
        bullVotes: signal?.bullVotes || 0,
        bearVotes: signal?.bearVotes || 0,
      },
    };
  }

  /**
   * Extract last digit (0-9) from a price tick
   */
  function getLastDigit(price) {
    if (price == null) return null;
    const str = String(price);
    const parts = str.split('.');
    if (parts.length < 2) return parseInt(parts[0].slice(-1), 10);
    // Use the first decimal digit
    return parseInt(parts[1][0], 10);
  }

  return { predict, analyzeVolatility, matchStrategies, getLastDigit, STRATEGIES };
})();
