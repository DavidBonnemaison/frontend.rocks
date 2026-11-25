export const BOOTSTRAP_JS = String.raw`
(function () {
  'use strict';
  var cfg = window.__frConfig;
  var trace = [];
  var consoleEntries = [];
  var inputResolver = null;
  window.__trace = trace;
  window.__params = cfg.params;
  window.__origins = cfg.origins;

  function send(msg) {
    msg.channel = cfg.channel;
    msg.runId = cfg.runId;
    parent.postMessage(msg, cfg.parentOrigin || '*');
  }

  function stringify(v) {
    if (typeof v === 'string') return v;
    try { var s = JSON.stringify(v); return s === undefined ? String(v) : s; } catch (e) { return String(v); }
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level] ? console[level].bind(console) : function () {};
    console[level] = function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) parts.push(stringify(arguments[i]));
      consoleEntries.push({ level: level, text: parts.join(' ') });
      original.apply(null, arguments);
    };
  });
  window.addEventListener('error', function (e) {
    consoleEntries.push({ level: 'error', text: 'Uncaught ' + (e && e.message ? e.message : 'error') });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    consoleEntries.push({ level: 'error', text: 'Unhandled rejection: ' + stringify(r && r.message ? r.message : r) });
  });

  function settle() {
    var throttled = false;
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return fonts.then(function () {
      return new Promise(function (resolve) {
        var done = false;
        var timer = setTimeout(function () { if (!done) { done = true; throttled = true; resolve(); } }, 1000);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { if (!done) { done = true; clearTimeout(timer); resolve(); } });
        });
      });
    }).then(function () {
      return new Promise(function (resolve) { setTimeout(resolve, 0); });
    }).then(function () {
      if (throttled) throw new Error('FR_RAF_THROTTLED');
    });
  }

  // Wait for the caller to replay trusted input steps when configured.
  function waitForInput() {
    if (!cfg.awaitInput) return Promise.resolve();
    return settle().then(function () {
      return new Promise(function (resolve) {
        inputResolver = resolve;
        if (cfg.standalone) {
          window.__frAwaitingInput = cfg.runId;
          window.__frInputDone = function () { window.__frAwaitingInput = null; var r = inputResolver; inputResolver = null; if (r) r(); };
        } else {
          send({ type: 'fr:awaiting-input' });
        }
      });
    });
  }

  function toJson(value, label) {
    var s = JSON.stringify(value);
    if (s === undefined) throw new Error('FR_NOT_JSON: ' + label + ' returned undefined or a function');
    return JSON.parse(s);
  }

  function presentSafely(ctx) {
    if (typeof window.__frPresent !== 'function') return Promise.resolve(null);
    return Promise.resolve().then(function () { return window.__frPresent(ctx); }).then(function (p) {
      var s = JSON.stringify(p);
      return s !== undefined && s.length <= cfg.presentMaxChars ? JSON.parse(s) : null;
    }, function () { return null; });
  }

  function observeNow(injectedConsole) {
    var ctx = null;
    return waitForInput().then(settle).then(function () {
      ctx = {
        doc: document, win: window, params: cfg.params, settle: settle,
        trace: trace, console: consoleEntries.concat(injectedConsole || [])
      };
      if (typeof window.__frObserve !== 'function') throw new Error('FR_NO_OBSERVE');
      return window.__frObserve(ctx);
    }).then(function (value) {
      var json = toJson(value, 'observe');
      return presentSafely(ctx).then(function (presented) {
        return { ok: true, value: json, presented: presented, trace: JSON.parse(JSON.stringify(trace)), console: consoleEntries.slice() };
      });
    }).catch(function (err) {
      var trace2 = [];
      try { trace2 = JSON.parse(JSON.stringify(trace)); } catch (e) {}
      return { ok: false, error: String(err && err.message ? err.message : err), trace: trace2, console: consoleEntries.slice() };
    });
  }

  window.addEventListener('message', function (e) {
    if (cfg.parentOrigin && e.origin !== cfg.parentOrigin) return;
    var msg = e.data;
    if (!msg || msg.channel !== cfg.channel || msg.runId !== cfg.runId) return;
    if (msg.type === 'fr:input-done') {
      var r = inputResolver; inputResolver = null; if (r) r();
      return;
    }
    if (msg.type !== 'fr:observe') return;
    observeNow(msg.injectedConsole).then(function (result) { send({ type: 'fr:result', result: result }); });
  });

  window.addEventListener('load', function () {
    if (cfg.standalone) {
      observeNow([]).then(function (result) { window.__frResult = result; });
    } else {
      send({ type: 'fr:loaded' });
    }
  });
})();
`;
