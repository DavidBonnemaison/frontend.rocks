/**
 * Client-side network shim injected into sandboxed Experiment iframes when `network.mode === 'shim'`.
 *
 * URL convention shared with `scripts/proof/test-server.ts` (`network.mode === 'server'`):
 * fixtures always request `window.__origins.self + '/__api/<experiment-id>' + path` or
 * `window.__origins.cross + '/__api/<experiment-id>' + path`. In shim mode, this script
 * strips the leading `/__api/<experiment-id>` prefix from the URL pathname before looking
 * up the route by `(origin, method, path)`, so the exact same fixture code works in both modes.
 */
export const NETWORK_SHIM_JS = String.raw`
(function () {
  'use strict';
  var cfg = window.__frConfig || {};
  var routes = (cfg.network && Array.isArray(cfg.network.routes)) ? cfg.network.routes : [];
  var networkLog = [];
  window.__network = networkLog;

  function record(entry) {
    networkLog.push(entry);
    if (Array.isArray(window.__trace)) {
      window.__trace.push(entry);
    }
  }

  function resolveRequest(rawUrl, rawMethod) {
    var parsed = new URL(String(rawUrl), 'https://self.test/');
    var origin = parsed.origin === 'https://cross.test' ? 'cross' : 'self';
    var method = String(rawMethod || 'GET').toUpperCase();
    var path = parsed.pathname.replace(/^\/__api\/[a-z0-9-]+/, '') || '/';
    return { origin: origin, method: method, path: path };
  }

  function findRoute(info) {
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      if (r.origin === info.origin && r.method === info.method && r.path === info.path) {
        return r;
      }
    }
    return null;
  }

  function makeAbortError() {
    if (typeof DOMException === 'function') {
      return new DOMException('Aborted', 'AbortError');
    }
    var err = new Error('Aborted');
    err.name = 'AbortError';
    return err;
  }

  window.fetch = function (input, init) {
    var rawUrl = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
    var rawMethod = (init && init.method) || (typeof input === 'object' && input && input.method) || 'GET';
    var info = resolveRequest(rawUrl, rawMethod);
    var signal = (init && init.signal) || (typeof input === 'object' && input && input.signal) || null;

    record({ type: 'fetch:start', method: info.method, path: info.path, origin: info.origin });

    var route = findRoute(info);
    if (!route) {
      record({ type: 'fetch:unmatched', method: info.method, path: info.path, origin: info.origin });
      return Promise.reject(new TypeError('FR_NO_ROUTE ' + info.method + ' ' + info.path));
    }

    if (signal && signal.aborted) {
      record({ type: 'fetch:abort', method: info.method, path: info.path, origin: info.origin });
      return Promise.reject(makeAbortError());
    }

    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = null;

      function onAbort() {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        record({ type: 'fetch:abort', method: info.method, path: info.path, origin: info.origin });
        reject(makeAbortError());
      }

      if (signal && typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onAbort);
        }
        record({ type: 'fetch:end', method: info.method, path: info.path, origin: info.origin, status: route.status });
        var body = route.body !== undefined ? route.body : null;
        resolve(new Response(body, { status: route.status, headers: route.headers || {} }));
      }, route.delayMs || 0);
    });
  };

  function ShimXHR() {
    this.readyState = 0;
    this.status = 0;
    this.statusText = '';
    this.responseText = '';
    this.response = '';
    this.onload = null;
    this.onerror = null;
    this.onabort = null;
    this.onreadystatechange = null;
    this.onloadend = null;
    this._method = 'GET';
    this._url = '';
    this._headers = {};
    this._responseHeaders = {};
    this._listeners = { load: [], error: [], abort: [], readystatechange: [], loadend: [] };
    this._timer = null;
    this._aborted = false;
    this._info = null;
  }

  ShimXHR.UNSENT = 0;
  ShimXHR.OPENED = 1;
  ShimXHR.HEADERS_RECEIVED = 2;
  ShimXHR.LOADING = 3;
  ShimXHR.DONE = 4;

  ShimXHR.prototype._emit = function (type) {
    var ev = { type: type, target: this, currentTarget: this };
    var prop = this['on' + type];
    if (typeof prop === 'function') prop.call(this, ev);
    var list = this._listeners[type];
    if (list) {
      for (var i = 0; i < list.length; i++) list[i].call(this, ev);
    }
  };

  ShimXHR.prototype._setState = function (state) {
    this.readyState = state;
    this._emit('readystatechange');
  };

  ShimXHR.prototype.addEventListener = function (type, fn) {
    if (this._listeners[type] && typeof fn === 'function') {
      this._listeners[type].push(fn);
    }
  };

  ShimXHR.prototype.removeEventListener = function (type, fn) {
    var list = this._listeners[type];
    if (!list) return;
    var idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  };

  ShimXHR.prototype.open = function (method, url) {
    this._method = String(method || 'GET').toUpperCase();
    this._url = String(url || '');
    this._aborted = false;
    this._setState(1);
  };

  ShimXHR.prototype.setRequestHeader = function (name, value) {
    this._headers[String(name).toLowerCase()] = String(value);
  };

  ShimXHR.prototype.getResponseHeader = function (name) {
    var key = String(name).toLowerCase();
    var headers = this._responseHeaders;
    for (var k in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, k) && k.toLowerCase() === key) {
        return headers[k];
      }
    }
    return null;
  };

  ShimXHR.prototype.getAllResponseHeaders = function () {
    var out = [];
    for (var k in this._responseHeaders) {
      if (Object.prototype.hasOwnProperty.call(this._responseHeaders, k)) {
        out.push(k.toLowerCase() + ': ' + this._responseHeaders[k]);
      }
    }
    return out.join('\r\n');
  };

  ShimXHR.prototype.abort = function () {
    if (this._aborted || this.readyState === 4) return;
    this._aborted = true;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._info) {
      record({ type: 'xhr:abort', method: this._info.method, path: this._info.path, origin: this._info.origin });
    }
    this.status = 0;
    this._setState(4);
    this._emit('abort');
    this._emit('loadend');
  };

  ShimXHR.prototype.send = function () {
    var self = this;
    var info = resolveRequest(this._url, this._method);
    this._info = info;
    record({ type: 'xhr:start', method: info.method, path: info.path, origin: info.origin });

    var route = findRoute(info);
    if (!route) {
      record({ type: 'xhr:unmatched', method: info.method, path: info.path, origin: info.origin });
      this._timer = setTimeout(function () {
        if (self._aborted) return;
        self._timer = null;
        self.status = 0;
        self._setState(4);
        self._emit('error');
        self._emit('loadend');
      }, 0);
      return;
    }

    this._timer = setTimeout(function () {
      if (self._aborted) return;
      self._timer = null;
      self.status = route.status;
      self._responseHeaders = route.headers || {};
      self._setState(2);
      var text = route.body !== undefined ? route.body : '';
      self.responseText = text;
      self.response = text;
      self._setState(3);
      record({ type: 'xhr:end', method: info.method, path: info.path, origin: info.origin, status: route.status });
      self._setState(4);
      self._emit('load');
      self._emit('loadend');
    }, route.delayMs || 0);
  };

  window.XMLHttpRequest = ShimXHR;
})();
`;
