/**
 * Candlestick Pattern Recognition
 * Detects patterns on the last N candles and returns descriptions.
 *
 * A candle: { open, high, low, close, time }
 */

const Patterns = (() => {

  // Helper
  const body = c => Math.abs(c.close - c.open);
  const upperWick = c => c.high - Math.max(c.open, c.close);
  const lowerWick = c => Math.min(c.open, c.close) - c.low;
  const totalRange = c => c.high - c.low;
  const isBullish = c => c.close > c.open;
  const isBearish = c => c.close < c.open;
  const avgBody = (candles, n) => candles.slice(-n).reduce((s, c) => s + body(c), 0) / n;
  const avgRange = (candles, n) => candles.slice(-n).reduce((s, c) => s + totalRange(c), 0) / n;

  function detect(candles) {
    if (candles.length < 5) return [];
    const found = [];
    const c = candles; // shorthand
    const i = candles.length - 1; // last candle index

    // 1. Doji — open ≈ close
    if (body(c[i]) <= totalRange(c[i]) * 0.1 && totalRange(c[i]) > 0) {
      found.push({ pattern: 'Doji', idx: i, type: 'neutral', detail: 'Open and close are nearly equal, indicating indecision.' });
    }

    // 2. Hammer — small body, long lower wick, little upper wick (downtrend context ideally)
    if (body(c[i]) <= totalRange(c[i]) * 0.33 && lowerWick(c[i]) >= body(c[i]) * 2 && upperWick(c[i]) <= body(c[i]) * 0.5) {
      found.push({ pattern: 'Hammer', idx: i, type: 'bullish', detail: 'Long lower wick after a downtrend suggests reversal potential.' });
    }

    // 3. Hanging Man — same shape as hammer but after uptrend
    if (body(c[i]) <= totalRange(c[i]) * 0.33 && lowerWick(c[i]) >= body(c[i]) * 2 && upperWick(c[i]) <= body(c[i]) * 0.5 && i >= 3) {
      // check if preceding candles are bullish trend
      const preBull = candles.slice(Math.max(0, i - 3), i).every(c => isBullish(c) || body(c) < totalRange(c) * 0.3);
      if (preBull) found.push({ pattern: 'Hanging Man', idx: i, type: 'bearish', detail: 'Hammer-like shape at top of uptrend — potential top reversal.' });
    }

    // 4. Shooting Star — small body, long upper wick, small lower wick (after uptrend)
    if (body(c[i]) <= totalRange(c[i]) * 0.33 && upperWick(c[i]) >= body(c[i]) * 2 && lowerWick(c[i]) <= body(c[i]) * 0.5) {
      found.push({ pattern: 'Shooting Star', idx: i, type: 'bearish', detail: 'Long upper wick at highs suggests rejection and potential reversal.' });
    }

    // 5. Bullish Engulfing
    if (i >= 1 && isBearish(c[i - 1]) && isBullish(c[i]) &&
        c[i].close > c[i - 1].open && c[i].open < c[i - 1].close &&
        body(c[i]) > body(c[i - 1]) * 0.5) {
      found.push({ pattern: 'Bullish Engulfing', idx: i, type: 'bullish', detail: 'Bullish candle fully engulfs previous bearish candle.' });
    }

    // 6. Bearish Engulfing
    if (i >= 1 && isBullish(c[i - 1]) && isBearish(c[i]) &&
        c[i].open > c[i - 1].close && c[i].close < c[i - 1].open &&
        body(c[i]) > body(c[i - 1]) * 0.5) {
      found.push({ pattern: 'Bearish Engulfing', idx: i, type: 'bearish', detail: 'Bearish candle fully engulfs previous bullish candle.' });
    }

    // 7. Bullish Harami
    if (i >= 1 && isBearish(c[i - 1]) && isBullish(c[i]) &&
        c[i].open > c[i - 1].close && c[i].close < c[i - 1].open &&
        body(c[i]) < body(c[i - 1]) * 0.7) {
      found.push({ pattern: 'Bullish Harami', idx: i, type: 'bullish', detail: 'Small bullish candle contained within previous bearish body.' });
    }

    // 8. Bearish Harami
    if (i >= 1 && isBullish(c[i - 1]) && isBearish(c[i]) &&
        c[i].open < c[i - 1].close && c[i].close > c[i - 1].open &&
        body(c[i]) < body(c[i - 1]) * 0.7) {
      found.push({ pattern: 'Bearish Harami', idx: i, type: 'bearish', detail: 'Small bearish candle contained within previous bullish body.' });
    }

    // 9. Morning Star — bearish, small middle (doji), bullish
    if (i >= 2 && isBearish(c[i - 2]) && isBullish(c[i]) &&
        body(c[i - 1]) <= totalRange(c[i - 1]) * 0.2 &&
        c[i - 1].close < c[i - 2].close && c[i].close > (c[i - 2].open + c[i - 2].close) / 2) {
      found.push({ pattern: 'Morning Star', idx: i, type: 'bullish', detail: 'Bearish candle, followed by indecision doji, then strong bullish — reversal.' });
    }

    // 10. Evening Star — bullish, small middle (doji), bearish
    if (i >= 2 && isBullish(c[i - 2]) && isBearish(c[i]) &&
        body(c[i - 1]) <= totalRange(c[i - 1]) * 0.2 &&
        c[i - 1].close > c[i - 2].close && c[i].close < (c[i - 2].open + c[i - 2].close) / 2) {
      found.push({ pattern: 'Evening Star', idx: i, type: 'bearish', detail: 'Bullish candle, followed by doji, then strong bearish — reversal.' });
    }

    // 11. Tweezer Bottom — consecutive candles with same low
    if (i >= 1 && Math.abs(c[i].low - c[i - 1].low) / (c[i].high - c[i].low) < 0.02 &&
        isBearish(c[i - 1]) && isBullish(c[i])) {
      found.push({ pattern: 'Tweezer Bottom', idx: i, type: 'bullish', detail: 'Consecutive candles with equal lows — support forming.' });
    }

    // 12. Tweezer Top — consecutive candles with same high
    if (i >= 1 && Math.abs(c[i].high - c[i - 1].high) / (c[i].high - c[i].low) < 0.02 &&
        isBullish(c[i - 1]) && isBearish(c[i])) {
      found.push({ pattern: 'Tweezer Top', idx: i, type: 'bearish', detail: 'Consecutive candles with equal highs — resistance forming.' });
    }

    // 13. Three White Soldiers — three consecutive long bullish candles
    if (i >= 2 && isBullish(c[i]) && isBullish(c[i - 1]) && isBullish(c[i - 2]) &&
        c[i].close > c[i - 1].close && c[i - 1].close > c[i - 2].close &&
        body(c[i]) > avgBody(candles, 10) * 0.8 &&
        body(c[i - 1]) > avgBody(candles, 10) * 0.8 &&
        body(c[i - 2]) > avgBody(candles, 10) * 0.8) {
      found.push({ pattern: 'Three White Soldiers', idx: i, type: 'bullish', detail: 'Three strong consecutive bullish candles — strong uptrend.' });
    }

    // 14. Three Black Crows — three consecutive long bearish candles
    if (i >= 2 && isBearish(c[i]) && isBearish(c[i - 1]) && isBearish(c[i - 2]) &&
        c[i].close < c[i - 1].close && c[i - 1].close < c[i - 2].close &&
        body(c[i]) > avgBody(candles, 10) * 0.8 &&
        body(c[i - 1]) > avgBody(candles, 10) * 0.8 &&
        body(c[i - 2]) > avgBody(candles, 10) * 0.8) {
      found.push({ pattern: 'Three Black Crows', idx: i, type: 'bearish', detail: 'Three strong consecutive bearish candles — strong downtrend.' });
    }

    // 15. Spinning Top — small body with wicks on both sides
    if (body(c[i]) <= totalRange(c[i]) * 0.5 && body(c[i]) >= totalRange(c[i]) * 0.1 &&
        upperWick(c[i]) >= body(c[i]) * 0.5 && lowerWick(c[i]) >= body(c[i]) * 0.5) {
      found.push({ pattern: 'Spinning Top', idx: i, type: 'neutral', detail: 'Small body with wicks both sides — market uncertainty.' });
    }

    // 16. Marubozu — no wicks (or very small)
    if (body(c[i]) >= totalRange(c[i]) * 0.9 && totalRange(c[i]) > 0) {
      found.push({ pattern: isBullish(c[i]) ? 'Bullish Marubozu' : 'Bearish Marubozu', idx: i, type: isBullish(c[i]) ? 'bullish' : 'bearish', detail: 'Full-bodied candle with no wicks — strong conviction.' });
    }

    return found;
  }

  return { detect };
})();
