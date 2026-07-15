/**
 * Chart Module — TradingView Lightweight Charts integration.
 * Supports candlestick, line, and area chart types.
 * Renders markers for pattern detections.
 */

const ChartModule = (() => {
  let chart = null;
  let candleSeries = null;
  let lineSeries = null;
  let areaSeries = null;
  let currentType = 'candle';
  let resizeObserver = null;

  function init(container) {
    chart = LightweightCharts.createChart(container, {
      layout: {
        background: { type: 'solid', color: '#0c0c14' },
        textColor: '#4a4a5a',
        fontSize: 10,
        fontFamily: 'JetBrains Mono',
      },
      grid: {
        vertLines: { color: '#181825' },
        horzLines: { color: '#181825' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#2a2a3a', width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#1c1c2a' },
        horzLine: { color: '#2a2a3a', width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: '#1c1c2a' },
      },
      rightPriceScale: {
        borderColor: '#181825',
        borderVisible: true,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#181825',
        borderVisible: true,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: { vertTouchDrag: false },
    });

    chart.applyOptions({
      watermark: {
        visible: true,
        text: 'Deriv Signal Engine',
        color: '#181825',
        fontSize: 14,
        horzAlign: 'left',
        vertAlign: 'bottom',
      },
    });

    candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    lineSeries = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 4 },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    lineSeries.applyOptions({ visible: false });

    areaSeries = chart.addAreaSeries({
      lineColor: '#3b82f6',
      topColor: '#3b82f620',
      bottomColor: '#3b82f604',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 4 },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    areaSeries.applyOptions({ visible: false });

    // Resize
    resizeObserver = new ResizeObserver(() => {
      if (chart) chart.resize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);

    return { chart, candleSeries, lineSeries, areaSeries };
  }

  function _toChartData(candles) {
    return candles.map(c => ({
      time: Math.floor(c.time / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  }

  function _toLineData(candles) {
    return candles.map(c => ({
      time: Math.floor(c.time / 1000),
      value: c.close,
    }));
  }

  function setData(candles) {
    if (!chart || !candles || candles.length === 0) return;

    const cd = _toChartData(candles);
    const ld = _toLineData(candles);

    candleSeries.setData(cd);
    lineSeries.setData(ld);
    areaSeries.setData(ld);

    chart.timeScale().fitContent();
  }

  function updateLast(candle) {
    if (!candle || !chart) return;
    const point = {
      time: Math.floor(candle.time / 1000),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    };
    if (currentType === 'candle') candleSeries.update(point);
    else if (currentType === 'line') lineSeries.update({ time: point.time, value: point.close });
    else areaSeries.update({ time: point.time, value: point.close });
  }

  function setChartType(type) {
    currentType = type;
    if (!chart) return;
    candleSeries.applyOptions({ visible: type === 'candle' });
    lineSeries.applyOptions({ visible: type === 'line' });
    areaSeries.applyOptions({ visible: type === 'area' });
  }

  function setMarkers(markers) {
    if (!candleSeries) return;
    // markers: [{ time: <unix ts>, position: 'aboveBar'|'belowBar', color: string, shape: 'arrowUp'|'arrowDown'|'circle', text: string }]
    candleSeries.setMarkers(markers || []);
  }

  function addIndicatorLine(options) {
    if (!chart) return null;
    const s = chart.addLineSeries({
      color: options.color || '#888',
      lineWidth: options.width || 1,
      lineStyle: options.style || LightweightCharts.LineStyle.Solid,
      priceFormat: { type: 'price', precision: 4 },
      lastValueVisible: false,
      priceLineVisible: false,
      title: options.label || '',
    });
    return s;
  }

  function destroy() {
    if (resizeObserver) resizeObserver.disconnect();
    if (chart) {
      chart.remove();
      chart = null;
      candleSeries = null;
      lineSeries = null;
      areaSeries = null;
    }
  }

  return { init, setData, updateLast, setChartType, setMarkers, addIndicatorLine, destroy };
})();
