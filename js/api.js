/**
 * Deriv API Module — WebSocket connection, market data.
 * No authentication needed for tick/candle data.
 * Always auto-reconnects.
 */

const DerivAPI = (() => {
  let ws = null;
  let reconnectTimer = null;
  let config = { appId: '', symbol: 'R_75' };
  const listeners = {};
  let reqId = 1;
  const pending = new Map();

  function on(event, fn) {
    (listeners[event] || (listeners[event] = [])).push(fn);
    return () => { listeners[event] = listeners[event].filter(f => f !== fn); };
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(fn => { try { fn(data); } catch(e) { /* */ } });
  }

  function connect(appId) {
    _cleanup();
    config.appId = appId;
    emit('status', { connected: false, connecting: true });
    _open();
  }

  function _cleanup() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (ws) { try { ws.onclose = null; ws.close(); } catch(e) {} ws = null; }
    pending.forEach((p) => p.reject(new Error('Connection closed')));
    pending.clear();
  }

  function _open() {
    const url = `wss://ws.derivws.com/websockets/v3?app_id=${config.appId}`;
    try { ws = new WebSocket(url); } catch (e) { emit('error', 'WS create: ' + e.message); _scheduleReconnect(); return; }

    ws.onopen = () => {
      emit('status', { connected: true });
      send({ ticks: config.symbol, subscribe: 1 });
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        _handle(msg);
      } catch (e) { /* */ }
    };

    ws.onclose = (ev) => {
      ws = null;
      emit('status', { connected: false });
      emit('error', 'Socket closed (code=' + ev.code + ')');
      _scheduleReconnect();
    };

    ws.onerror = () => {
      emit('error', 'Socket error');
    };
  }

  function _handle(msg) {
    if (msg.msg_type === 'tick' && msg.tick) {
      emit('tick', msg.tick);
      return;
    }

    if (msg.msg_type === 'candles' && msg.candles) {
      if (msg.req_id && pending.has(msg.req_id)) { _resolvePending(msg); return; }
      const prices = msg.candles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
      const times = msg.candles.map(c => c.epoch);
      emit('candles', { prices, times });
      return;
    }

    if (msg.msg_type === 'history' && msg.history) {
      _resolvePending(msg);
      emit('candles', { prices: msg.history.prices || [], times: msg.history.times || [] });
      return;
    }

    if (msg.msg_type === 'forget') return;

    if (msg.error) {
      _rejectPending(msg);
      emit('error', msg.error.message || 'API error');
    }
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function _request(obj) {
    return new Promise((resolve, reject) => {
      const id = reqId++;
      obj.req_id = id;
      pending.set(id, { resolve, reject });
      send(obj);
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error('Timeout')); }
      }, 10000);
    });
  }

  function _resolvePending(msg) {
    const p = pending.get(msg.req_id);
    if (p) { p.resolve(msg); pending.delete(msg.req_id); }
  }

  function _rejectPending(msg) {
    const p = pending.get(msg.req_id);
    if (p) { p.reject(msg); pending.delete(msg.req_id); }
  }

  function _scheduleReconnect() {
    clearTimeout(reconnectTimer);
    const delay = 2000;
    reconnectTimer = setTimeout(() => {
      if (config.appId) _open();
    }, delay);
  }

  // ---- Public ----

  function subscribe(symbol) {
    config.symbol = symbol;
    send({ forget_all: 'ticks' });
    send({ ticks: symbol, subscribe: 1 });
  }

  function fetchCandles(symbol, granularity, count = 200) {
    const end = Math.floor(Date.now() / 1000);
    const start = end - (granularity * count);
    return _request({
      ticks_history: symbol, adjust_start_time: 1, end: 'latest', start: start,
      style: 'candles', granularity: granularity, count: count,
    }).then(res => {
      if (res.candles) {
        return {
          prices: res.candles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close })),
          times: res.candles.map(c => c.epoch),
        };
      }
      return { prices: [], times: [] };
    }).catch(() => ({ prices: [], times: [] }));
  }

  async function fetchCandlesDeep(symbol, granularity, targetCount = 400) {
    const batch = 200;
    const end = Math.floor(Date.now() / 1000);
    let allPrices = [], allTimes = [];

    for (let i = 0; i < Math.ceil(targetCount / batch); i++) {
      const res = await _request({
        ticks_history: symbol, adjust_start_time: 1,
        end: end - (granularity * batch * i),
        start: end - (granularity * batch * (i + 1)),
        style: 'candles', granularity: granularity, count: batch,
      }).catch(() => null);

      if (res?.candles) {
        const bp = res.candles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
        const bt = res.candles.map(c => c.epoch);
        allPrices = [...bp, ...allPrices];
        allTimes = [...bt, ...allTimes];
      }
    }
    return { prices: allPrices, times: allTimes };
  }

  return {
    connect, subscribe, on, send,
    fetchCandles, fetchCandlesDeep,
    get connected() { return ws && ws.readyState === WebSocket.OPEN; },
  };
})();
