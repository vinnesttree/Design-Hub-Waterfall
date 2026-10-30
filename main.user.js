// ==UserScript==
// @name         Engineering Design Hub - Reservation Waterfall
// @namespace    https://designhub-manager.unl.edu/
// @version      1.4.0
// @description  Dark-mode Gantt chart of tool reservations on the Agenda and Tools pages of UNL reservation sites (Engineering Design Hub, Innovation Studio, ...) - ordered rows, dynamic tool colors, hide idle tools, settings and minimize
// @match        *://*.unl.edu/admin/agenda/*
// @match        *://*.unl.edu/agenda/*
// @match        *://*.unl.edu/tools*
// @match        *://*.unl.edu/admin/tools*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  SITES — the waterfall runs on unl.edu sites built on UNL's
  //  reservations app (github.com/unl/reservations), such as the
  //  Engineering Design Hub and Innovation Studio managers. A site that
  //  isn't listed here uses DEFAULT_SITE. Each site keeps its own
  //  settings and saved tools.
  //
  //  rowLabel — what each waterfall row is called:
  //      'model'  the Model column. Design Hub names each printer there.
  //      'tool'   "Tool · Model", or just the Tool when Model is empty.
  //               Innovation Studio puts the maker in Model (its laser
  //               cutters are all "Epilog"), so Model alone would merge
  //               different machines into one row.
  //
  //  models — rows appear on the waterfall in exactly this order, top to
  //  bottom; other rows come after them, A–Z. With "Sort rows by tool
  //  type" on (the default), rows are grouped by tool and this order
  //  applies within each group. Use the row names the waterfall shows.
  //  Rows with no reservations today are hidden unless you click
  //  "SHOW ALL RESERVATIONS".
  //
  //  toolIds — tool ID → row name. The script saves each tool's ID and
  //  row name whenever you open the Tools page (/tools/) or the admin
  //  Tools page (/admin/tools/, which lists every tool), so this is
  //  normally empty. Add a tool here only if neither page shows it to
  //  you. Entries here win over saved ones.
  //      123: 'Ada',
  //      124: { model: 'Hull', tool: 'Prusa MK4' },
  //  The saved tools are listed in the waterfall settings.
  // ═══════════════════════════════════════════════════════════════════
  const SITES = {
    'designhub-manager.unl.edu': {
      rowLabel: 'model',
      models: [
        'Ada',
        'Archimedes',
        'Faraday',
        'Hull',
        'Pearlman',
        'Bernouli',
        'Clarke',
        'Euler',
        'Johnson',
        'Ohm',
        'Emmy',
        'Hedy',
        'Mark',
        'Ochoa',
        'Kapany',
        'Maiman',
        'GoldenBee',
        'GorgeousSquid',
        'TangibleRabbit',
      ],
      toolIds: {
      },
    },
    'innovationstudio-manager.unl.edu': {
      rowLabel: 'tool',
      models: [
      ],
      toolIds: {
      },
    },
  };
  const DEFAULT_SITE = { rowLabel: 'tool', models: [], toolIds: {} };

  const SITE     = SITES[location.hostname] || DEFAULT_SITE;
  const MODELS   = SITE.models;
  const TOOL_IDS = SITE.toolIds;

  // ═══════════════════════════════════════════════════════════════════
  //  TOOL COLOR PALETTE — colors are assigned to tools in the order
  //  they are first encountered. Add more colors if needed.
  // ═══════════════════════════════════════════════════════════════════
  const PALETTE = [
    '#ff4444', '#3b9eff', '#22d47b', '#ff9f1c',
    '#c77dff', '#ff6b9d', '#00e5d4', '#ffdd00',
  ];

  // ═══════════════════════════════════════════════════════════════════
  //  SETTINGS — saved in this site's localStorage, along with the tools
  //  found so far. "Minimized" is kept in sessionStorage only, so it
  //  resets when the tab is closed.
  // ═══════════════════════════════════════════════════════════════════
  var SETTINGS_KEY  = 'edh-wf-settings';
  var TOOLS_KEY     = 'edh-wf-tools';
  var MINIMIZED_KEY = 'edh-wf-minimized';
  var DEFAULTS = { toolsPage: true, agendaPage: true, showIdle: false, sortByType: true };

  var settings = loadSettings();
  var page     = null;   // 'tools' | 'admintools' | 'agenda'
  var mounted  = null;   // the chart currently on the page

  function loadSettings() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (e) {}
    var s = {};
    Object.keys(DEFAULTS).forEach(function(k) {
      s[k] = saved && typeof saved[k] === 'boolean' ? saved[k] : DEFAULTS[k];
    });
    return s;
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }
  // { "<tool id>": { tool: 'Prusa MK4', model: 'Ada', reservable: true,
  //                  checked: <ms timestamp of the reservable check> }, ... }
  function loadSavedTools() {
    var saved = null, out = {};
    try { saved = JSON.parse(localStorage.getItem(TOOLS_KEY)); } catch (e) {}
    if (saved && typeof saved === 'object') {
      Object.keys(saved).forEach(function(id) {
        var t = saved[id];
        if (/^\d+$/.test(id) && t && typeof t.model === 'string') {
          out[id] = { tool: String(t.tool || 'Other'), model: t.model };
          if (typeof t.reservable === 'boolean') out[id].reservable = t.reservable;
          if (typeof t.checked === 'number')     out[id].checked    = t.checked;
        }
      });
    }
    return out;
  }
  function saveSavedTools(saved) {
    try { localStorage.setItem(TOOLS_KEY, JSON.stringify(saved)); } catch (e) {}
  }
  function isMinimized() {
    try { return sessionStorage.getItem(MINIMIZED_KEY) === '1'; } catch (e) { return false; }
  }
  function storeMinimized(v) {
    try {
      if (v) sessionStorage.setItem(MINIMIZED_KEY, '1');
      else   sessionStorage.removeItem(MINIMIZED_KEY);
    } catch (e) {}
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PARSE RESERVATIONS (Scoped to target table)
  // ═══════════════════════════════════════════════════════════════════
  function parseReservations(targetTable) {
    var rows = targetTable.querySelectorAll('tbody tr');
    var out  = [];

    rows.forEach(function(row) {
      var cells = row.querySelectorAll('td');
      if (cells.length < 4) return;

      var name     = cells[0].textContent.trim();
      var tool     = cells[1].textContent.trim();
      var model    = cells[2].textContent.trim();
      var timeText = cells[3].textContent.trim();

      // Ensure we are parsing a time block (looks for the en-dash or hyphen)
      var splitChar = timeText.indexOf('\u2013') !== -1 ? '\u2013' : '-';
      var parts    = timeText.split(splitChar).map(function(s){ return s.trim(); });

      if (parts.length < 2) return;

      var start = parseDT(parts[0]);
      var end   = parseDT(parts[1].replace(/\n[\s\S]*/, '').trim());

      if (!start || !end) return;
      model = rowName(tool, model);   // same names as the saved tool list
      out.push({ name: name, label: name.split(' ')[0], tool: tool, model: model, start: start, end: end });
    });

    return out;
  }

  function parseDT(str) {
    str = str.replace(/\s+/g, ' ').trim();
    var m = str.match(/^(\w{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (!m) return null;
    var MO = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    var h = parseInt(m[3], 10);
    var ap = m[5].toLowerCase();
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return new Date(new Date().getFullYear(), MO[m[1]], parseInt(m[2],10), h, parseInt(m[4],10));
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TOOLS PAGE — map tool IDs to row names, then load each tool's
  //  day from GET /tools/<id>/reservations.json (no login needed)
  // ═══════════════════════════════════════════════════════════════════
  // /tools/ links each tool to /tools/<id>/reserve/ and /admin/tools/ to
  // /admin/tools/<id>/edit/ (checkable tools use /edit_checkable/ and are
  // skipped); both tables have the Model in the third column.
  var TOOL_LINKS = {
    tools:      /\/tools\/(\d+)\/reserve\/?(?:[?#]|$)/,
    admintools: /\/admin\/tools\/(\d+)\/edit\/?(?:[?#]|$)/
  };

  function findModel(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < MODELS.length; i++) {
      if (MODELS[i].toLowerCase() === lower) return MODELS[i];
    }
    for (var j = 0; j < MODELS.length; j++) {
      var word = MODELS[j].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('\\b' + word + '\\b', 'i').test(text)) return MODELS[j];
    }
    return null;
  }

  // The row a tool is drawn on (see rowLabel in SITES). Called with the
  // Tool and Model columns, which read the same on every page.
  var ROW_SEP = ' \u00b7 ';
  function rowName(tool, model) {
    if (SITE.rowLabel === 'model') return findModel(model) || model || tool;
    var text = model ? tool + ROW_SEP + model : tool;
    return findModel(text) || text;
  }

  // The Model part of a row name, for the tooltip ('' if the row is just the tool).
  function modelPart(row, tool) {
    if (row.indexOf(tool + ROW_SEP) === 0) return row.slice((tool + ROW_SEP).length);
    return row === tool ? '' : row;
  }

  // Only rows in a table whose third column is headed "Model" are read.
  function scrapeTools(doc, re) {
    var found = [], seen = {};

    doc.querySelectorAll('a[href]').forEach(function(a) {
      var m   = a.getAttribute('href').match(re);
      var row = a.closest('tr');
      if (!m || !row || seen[m[1]]) return;
      var head = row.closest('table').querySelectorAll('thead th');
      if (head.length < 3 || head[2].textContent.trim() !== 'Model') return;
      var cells = row.querySelectorAll('td');
      if (cells.length < 3) return;
      var tool  = cells[1].textContent.trim();
      var model = cells[2].textContent.trim();
      seen[m[1]] = true;
      found.push({ id: m[1], tool: tool, model: rowName(tool, model) });
    });

    return found;
  }

  // Tool name, row name and reservable flag, for "did anything shown change?"
  function toolsKey(saved) {
    return JSON.stringify(Object.keys(saved).map(function(id) {
      return [id, saved[id].tool, saved[id].model, saved[id].reservable];
    }));
  }

  // /tools/ only links tools that take reservations, so its tools are saved
  // as reservable. /admin/tools/ lists every tool without saying, so its
  // tools keep the flag they had (checked later by verifyReservable).
  // Returns true if the saved list changed.
  function saveFoundTools(found, replace, reservable) {
    if (!found.length) return false;
    var before = loadSavedTools();
    var saved  = replace ? {} : loadSavedTools();
    found.forEach(function(t) {
      var old = before[t.id] || {};
      saved[t.id] = { tool: t.tool, model: t.model };
      if (reservable) {
        saved[t.id].reservable = true;
        saved[t.id].checked    = Date.now();
      } else if (typeof old.reservable === 'boolean') {
        saved[t.id].reservable = old.reservable;
        saved[t.id].checked    = old.checked;
      }
    });
    saveSavedTools(saved);
    return toolsKey(saved) !== toolsKey(before);
  }

  // /admin/tools/ lists every tool, so it replaces the saved list. /tools/
  // only lists tools you are authorized to use, so it adds to it.
  function rememberPageTools() {
    var re = TOOL_LINKS[page];
    if (re) saveFoundTools(scrapeTools(document, re), page === 'admintools', page === 'tools');
  }

  // The agenda has no tool IDs, so it reads /admin/tools/ in the background.
  // Without the Manage Resources permission that page is a 404 and the saved
  // list is used as is.
  function refreshToolsFromAdmin() {
    return fetch(location.origin + '/admin/tools/', { cache: 'no-store' })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function(html) {
        var doc   = new DOMParser().parseFromString(html, 'text/html');
        var found = scrapeTools(doc, TOOL_LINKS.admintools);
        if (!found.length) throw new Error('no tools found');
        return saveFoundTools(found, true, false);
      });
  }

  // "Requires Reservation?" on /admin/tools/<id>/edit/ is the flag the Tools
  // page shows as "Reservation not required". Needs Manage Resources, like
  // /admin/tools/ itself.
  function fetchReservable(id) {
    return fetch(location.origin + '/admin/tools/' + encodeURIComponent(id) + '/edit/', { cache: 'no-store' })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function(html) {
        var box = new DOMParser().parseFromString(html, 'text/html').getElementById('is-reservable');
        if (!box) throw new Error('no "Requires Reservation?" checkbox');
        return box.hasAttribute('checked');
      });
  }

  // Runs fn on each item, at most `limit` at a time, and resolves to the
  // results in order. fn must handle its own errors.
  function mapLimit(items, limit, fn) {
    var results = [], next = 0;
    function worker() {
      if (next >= items.length) return Promise.resolve();
      var i = next++;
      return fn(items[i]).then(function(r) { results[i] = r; }).then(worker);
    }
    var workers = [];
    for (var w = 0; w < limit; w++) workers.push(worker());
    return Promise.all(workers).then(function() { return results; });
  }

  // Checks saved tools whose flag is missing or over a day old, four edit
  // pages at a time. Resolves true if any flag changed.
  var RECHECK_MS = 24 * 3600 * 1000;
  function verifyReservable() {
    var saved = loadSavedTools();
    var ids = Object.keys(saved).filter(function(id) {
      var t = saved[id];
      return typeof t.reservable !== 'boolean' || typeof t.checked !== 'number' ||
             Date.now() - t.checked > RECHECK_MS;
    });
    var changed = false;

    // Each result is saved as it arrives, so leaving the page keeps what was checked.
    return mapLimit(ids, 4, function(id) {
      return fetchReservable(id).then(
        function(r) {
          var current = loadSavedTools();
          if (!current[id]) return;
          if (current[id].reservable !== r) changed = true;
          current[id].reservable = r;
          current[id].checked    = Date.now();
          saveSavedTools(current);
        },
        function(err) { console.warn('EDH Waterfall: could not check /admin/tools/' + id + '/edit/', err); }
      );
    }).then(function() { return changed; });
  }

  function forgetTools(tools) {
    var saved = loadSavedTools();
    tools.forEach(function(t) { delete saved[t.id]; });
    saveSavedTools(saved);
  }

  // Saved tools plus TOOL_IDS: [{ id, tool, model, reservable, manual }]
  function knownTools() {
    var saved = loadSavedTools();
    var byId = {}, list = [];

    Object.keys(saved).forEach(function(id) {
      byId[id] = { id: id, tool: saved[id].tool, model: saved[id].model,
                   reservable: saved[id].reservable, manual: false };
      list.push(byId[id]);
    });

    Object.keys(TOOL_IDS).forEach(function(id) {
      var v     = TOOL_IDS[id];
      var model = typeof v === 'string' ? v : v && v.model;
      if (!model) return;
      var tool = (v && v.tool) || (byId[id] && byId[id].tool) || 'Other';
      if (byId[id]) {
        byId[id].model = model; byId[id].tool = tool; byId[id].manual = true;
      } else {
        byId[id] = { id: String(id), tool: tool, model: model, manual: true };
        list.push(byId[id]);
      }
    });

    return list;
  }

  // Waterfalls only use tools known to take reservations (or set in
  // TOOL_IDS); "Reservation not required" and not-yet-checked tools are left out.
  function isShown(t) {
    return t.manual || t.reservable === true;
  }

  // Row names whose saved tools are all "Reservation not required", so
  // even a MODELS entry with that name gets no idle row.
  function notReservableModels() {
    var tools = knownTools();
    return uniq(tools.filter(function(t) { return t.reservable === false && !t.manual; })
                     .map(function(t) { return t.model; }))
      .filter(function(m) { return !tools.some(function(t) { return t.model === m && isShown(t); }); });
  }

  // An unknown ID redirects to /tools/ ("That tool does not exist"); that
  // error is marked .missing so the tool can be dropped from the saved list.
  function fetchReservations(id, day) {
    var url = location.origin + '/tools/' + encodeURIComponent(id) + '/reservations.json' +
              '?time=' + encodeURIComponent(ymd(day) + ' 12:00');
    return fetch(url, { cache: 'no-store' })
      .then(function(res) {
        if (res.redirected && /^\/tools\/?$/.test(new URL(res.url).pathname)) {
          var err = new Error('tool ' + id + ' does not exist');
          err.missing = true;
          throw err;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(rows) {
        if (!Array.isArray(rows)) throw new Error('unexpected response');
        return rows;
      });
  }

  // Rails sends ISO 8601 ("2026-10-27T14:00:00.000-05:00"); the fallback
  // covers Ruby's "2026-10-27 14:00:00 -0500" / "... UTC" forms.
  function parseTime(v) {
    if (!v) return null;
    var d = new Date(v);
    if (isNaN(d)) {
      var m = String(v).match(/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d(?::\d\d(?:\.\d+)?)?)\s*(UTC|Z|[+-]\d\d:?\d\d)?$/);
      if (m) {
        var tz = !m[3] ? '' : (m[3] === 'UTC' || m[3] === 'Z') ? 'Z' : m[3].replace(/^([+-]\d\d):?(\d\d)$/, '$1:$2');
        d = new Date(m[1] + 'T' + m[2] + tz);
      }
    }
    return isNaN(d) ? null : d;
  }

  // The JSON has no user names, so bars show the reservation title or its time span.
  function toReservation(row, tool) {
    var start = parseTime(row.start_time);
    var end   = parseTime(row.end_time);
    if (!start || !end) return null;
    var training = !!row.is_training;
    var title    = row.title ? String(row.title).trim() : '';
    return {
      name:  title || (training ? 'Training' : 'Reserved'),
      label: title || (fmtH(start) + '\u2013' + fmtH(end)),
      note:  training ? 'Training reservation' : '',
      tool:  tool.tool,
      model: tool.model,
      start: start,
      end:   end
    };
  }

  // MODELS first, in that order, then the other rows A–Z.
  function orderModels(models) {
    return MODELS.filter(function(m){ return models.indexOf(m) !== -1; })
      .concat(models.filter(function(m){ return MODELS.indexOf(m) === -1; }).sort(compareNames));
  }

  // A–Z, ignoring case, with numbers in order ("#2" before "#10").
  function compareNames(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  function uniq(list) {
    return list.filter(function(v, i) { return v && list.indexOf(v) === i; });
  }

  // Machine type (the Tool column, e.g. "Prusa MK4") of each row, from
  // the saved tools and the reservations being drawn.
  function machineTypes(reservations) {
    var types = {};
    knownTools().forEach(function(t) { if (!types[t.model]) types[t.model] = t.tool; });
    reservations.forEach(function(r) { if (!types[r.model]) types[r.model] = r.tool; });
    return types;
  }

  // Groups rows by machine type, A-Z. Rows keep their order within a type,
  // and rows whose type isn't known go last.
  function sortByType(models, types) {
    return models
      .map(function(m, i) { return { m: m, i: i, t: (types[m] || '').toLowerCase() }; })
      .sort(function(a, b) {
        if (!a.t !== !b.t) return a.t ? -1 : 1;
        return compareNames(a.t, b.t) || a.i - b.i;
      })
      .map(function(x) { return x.m; });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CHART BOUNDS
  // ═══════════════════════════════════════════════════════════════════
  function agendaDay() {
    var h1 = document.querySelector('h1.dcf-txt-h3');
    if (h1) {
      var dateStr = h1.textContent.replace(/Today's Agenda/i, '').trim();
      var parsed = new Date(dateStr);
      if (!isNaN(parsed)) return parsed;
    }
    return new Date();
  }

  function dayBounds(base) {
    var CS = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
    var CE = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 59, 59, 999);
    return { CS: CS, CE: CE, totalMs: CE - CS };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TOOL → COLOR MAP
  // ═══════════════════════════════════════════════════════════════════
  function buildColorMap(reservations) {
    var tools = [];
    reservations.forEach(function(r) {
      if (tools.indexOf(r.tool) === -1) tools.push(r.tool);
    });
    var map = {};
    tools.forEach(function(t, i) { map[t] = PALETTE[i % PALETTE.length]; });
    return { map: map, tools: tools };
  }

  function grad(hex) {
    return 'linear-gradient(180deg,' + shift(hex,22) + ' 0%,' + hex + ' 55%,' + shift(hex,-18) + ' 100%)';
  }
  function shift(hex, pct) {
    var n = parseInt(hex.replace('#',''),16);
    var r=(n>>16)&255, g=(n>>8)&255, b=n&255, f=1+pct/100;
    return 'rgb('+cl(r*f)+','+cl(g*f)+','+cl(b*f)+')';
  }
  function cl(v){ return Math.min(255,Math.max(0,Math.round(v))); }

  // ═══════════════════════════════════════════════════════════════════
  //  STYLES
  // ═══════════════════════════════════════════════════════════════════
  function ensureStyles() {
    if (document.getElementById('edh-wf-style')) return;
    var styleEl = document.createElement('style');
    styleEl.id = 'edh-wf-style';
    styleEl.textContent =
      '#edh-wf *{box-sizing:border-box}' +
      '#edh-wf{font-family:"Work Sans","Segoe UI",sans-serif;background:#080808;border:1px solid #1f1f1f;border-radius:8px;overflow:hidden;margin:2em 0 2.6em;box-shadow:0 0 0 1px #161616,0 12px 40px rgba(0,0,0,.85);color:#d8d8d8}' +
      '#edh-wf-hdr{display:flex;flex-wrap:wrap;gap:.5em;align-items:center;justify-content:space-between;padding:.7em 1.25em;background:#0e0e0e;border-bottom:2px solid #ff4444}' +
      '#edh-wf-hdr h2{margin:0;font-size:.82em;font-weight:700;text-transform:uppercase;letter-spacing:.13em;color:#fff}' +
      '#edh-wf-hdr h2 em{font-style:normal;color:#ff4444}' +
      '#edh-wf-hdr .edh-sub{margin-left:.8em;color:#777;font-weight:600;letter-spacing:.08em}' +
      '#edh-wf-hdr .edh-hbtns{display:flex;align-items:center;gap:.4em}' +
      '#edh-wf-btn,#edh-wf .edh-hbtn{background:#161616;border:1px solid #2e2e2e;color:#777;font-size:.7em;font-family:inherit;line-height:1.4;margin:0;padding:.35em 1em;border-radius:4px;cursor:pointer;letter-spacing:.07em;transition:all .15s}' +
      '#edh-wf .edh-hbtn{min-width:2.4em;padding:.35em .6em;font-size:.8em;line-height:1.2}' +
      '#edh-wf-btn:hover,#edh-wf .edh-hbtn:hover{background:#222;color:#fff;border-color:#555}' +
      '#edh-wf.edh-min #edh-wf-btn,#edh-wf.edh-min #edh-wf-msg,#edh-wf.edh-min #edh-wf-leg,#edh-wf.edh-min #edh-wf-chart{display:none}' +
      '#edh-wf-msg{padding:.5em 1.25em;background:#0b0b0b;border-bottom:1px solid #1a1a1a;font-size:.72em;color:#888}' +
      '#edh-wf-msg:empty{display:none}' +
      '#edh-wf-msg.err{color:#ff8a8a}' +
      '#edh-wf-leg{display:flex;flex-wrap:wrap;gap:.35em 1.6em;padding:.6em 1.25em;background:#0b0b0b;border-bottom:1px solid #1a1a1a;font-size:.73em;align-items:flex-start}' +
      '#edh-wf-leg:empty{display:none}' +
      '.edh-leg-tool{display:flex;align-items:center;gap:.4em;color:#bbb;white-space:nowrap}' +
      '.edh-leg-sw{width:11px;height:11px;border-radius:2px;flex-shrink:0}' +
      '.edh-leg-extra{display:flex;align-items:center;gap:.4em;color:#999;white-space:nowrap;font-size:.92em;margin-left:.2em}' +
      '.edh-leg-extra .edh-leg-sw{opacity:.85}' +
      '.edh-leg-divider{width:1px;height:1.1em;background:#2a2a2a;margin:0 .3em;align-self:center}' +
      '#edh-wf-chart{overflow-x:auto;padding:.55em 1.25em 1.25em}' +
      '#edh-wf-inner{min-width:700px;position:relative;--lw:96px}' +
      '#edh-wf-axis{height:24px;position:relative;margin-left:var(--lw);border-bottom:1px solid #222;margin-bottom:.2em}' +
      '.edh-atick{position:absolute;transform:translateX(-50%);font-size:.63em;color:#fff;white-space:nowrap;padding-bottom:3px}' +
      '.edh-atick::after{content:"";display:block;width:1px;height:5px;background:#333;margin:0 auto}' +
      '.edh-sec{font-size:.63em;font-weight:700;text-transform:uppercase;letter-spacing:.11em;color:#333;padding:.45em 0 .2em var(--lw);border-top:1px solid #161616;margin-top:.25em}' +
      '.edh-empty{font-size:.72em;color:#555;padding:.9em 0 .4em var(--lw)}' +
      '.edh-row{display:flex;align-items:flex-start;min-height:36px;border-bottom:1px solid #111;position:relative;transition:background .1s}' +
      '.edh-row:hover{background:#0d0d0d}' +
      '.edh-row:last-child{border-bottom:none}' +
      '.edh-lbl{width:var(--lw);flex-shrink:0;font-size:.75em;color:#3a3a3a;text-align:right;padding:9px .75em 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.edh-lbl.on{color:#ddd;font-weight:600}' +
      '.edh-track{flex:1;position:relative;min-height:36px;overflow:hidden}' +
      '.edh-gl{position:absolute;top:0;bottom:0;width:1px;background:#161616;pointer-events:none}' +
      '.edh-now{position:absolute;top:0;bottom:0;width:2px;background:#ff4444;opacity:.8;z-index:6;pointer-events:none}' +
      '.edh-bar{position:absolute;height:22px;border-radius:3px;display:flex;align-items:center;padding:0 6px;font-size:.65em;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.13);transition:filter .12s,transform .1s}' +
      '.edh-bar:hover{filter:brightness(1.3) saturate(1.1);transform:scaleY(1.09);z-index:10}' +
      '#edh-tip{position:fixed;z-index:999999;background:#0e0e0e;border:1px solid #282828;border-radius:6px;padding:.55em .9em;font-size:.77em;font-family:"Work Sans","Segoe UI",sans-serif;color:#ccc;line-height:1.75;max-width:235px;pointer-events:none;display:none;box-shadow:0 10px 30px rgba(0,0,0,.8)}' +
      '#edh-tip .tn{font-weight:700;color:#fff;font-size:1.06em;margin-bottom:.1em}' +
      '#edh-tip .tt{font-weight:600;font-size:.92em}' +
      '#edh-tip .td{color:#cccccc;font-size:.88em}' +
      '#edh-tip .tg{color:#22d47b;font-size:.88em}' +
      '#edh-tip .tx{color:#ffdd00;font-size:.88em}' +
      '#edh-set-ov{position:fixed;inset:0;z-index:1000000;background:rgba(0,0,0,.65);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow-y:auto}' +
      '#edh-set{width:100%;max-width:560px;font-family:"Work Sans","Segoe UI",sans-serif;font-size:16px;line-height:1.4;background:#080808;border:1px solid #1f1f1f;border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px #161616,0 12px 40px rgba(0,0,0,.85);color:#d8d8d8;text-align:left}' +
      '#edh-set *{box-sizing:border-box}' +
      '#edh-set .edh-set-hdr{display:flex;align-items:center;justify-content:space-between;padding:.7em 1.25em;background:#0e0e0e;border-bottom:2px solid #ff4444}' +
      '#edh-set h2{margin:0;font-family:inherit;font-size:.82em;font-weight:700;text-transform:uppercase;letter-spacing:.13em;color:#fff}' +
      '#edh-set h2 em{font-style:normal;color:#ff4444}' +
      '#edh-set .edh-hbtn{background:#161616;border:1px solid #2e2e2e;color:#999;font-size:.9em;font-family:inherit;line-height:1.2;margin:0;min-width:2.2em;padding:.25em .5em;border-radius:4px;cursor:pointer}' +
      '#edh-set .edh-hbtn:hover{background:#222;color:#fff;border-color:#555}' +
      '#edh-set .edh-set-body{padding:.4em 1.25em 1.25em;font-size:.85em}' +
      '#edh-set h3{margin:1.2em 0 .3em;font-family:inherit;font-size:.78em;font-weight:700;text-transform:uppercase;letter-spacing:.11em;color:#777}' +
      '#edh-set label.edh-set-opt{display:flex;gap:.75em;align-items:flex-start;margin:0;padding:.6em 0;border-bottom:1px solid #151515;color:#ddd;font-size:1em;font-weight:400;cursor:pointer}' +
      '#edh-set label.edh-set-opt input{appearance:auto;-webkit-appearance:checkbox;position:static;opacity:1;width:16px;height:16px;flex-shrink:0;margin:.15em 0 0;accent-color:#ff4444;cursor:pointer}' +
      '#edh-set label.edh-set-opt small{display:block;margin-top:.15em;color:#888;font-size:.85em}' +
      '#edh-set p.edh-set-note{margin:.8em 0 0;color:#888;font-size:.85em;line-height:1.5}' +
      '#edh-set code{font-family:Consolas,Menlo,monospace;color:#ccc;background:#141414;padding:0 .3em;border-radius:3px}' +
      '#edh-set table.edh-set-ids{width:100%;margin:.4em 0 0;border-collapse:collapse;font-size:.9em;background:transparent}' +
      '#edh-set table.edh-set-ids th,#edh-set table.edh-set-ids td{padding:.35em .5em;border:none;border-bottom:1px solid #151515;background:transparent;color:#ccc;text-align:left;vertical-align:top}' +
      '#edh-set table.edh-set-ids th{color:#666;font-size:.8em;font-weight:700;text-transform:uppercase;letter-spacing:.08em}' +
      '#edh-set table.edh-set-ids td.edh-id{font-family:Consolas,Menlo,monospace;color:#fff}' +
      '#edh-set table.edh-set-ids small{color:#777}' +
      '#edh-set .edh-set-btn{margin:.9em 0 0;background:#161616;border:1px solid #2e2e2e;color:#999;font-size:.8em;font-family:inherit;line-height:1.4;padding:.4em 1em;border-radius:4px;cursor:pointer;letter-spacing:.05em}' +
      '#edh-set .edh-set-btn:hover{background:#222;color:#fff;border-color:#555}';
    document.head.appendChild(styleEl);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  BUILD CHART — returns { el, setData, setMessage, setShowAll,
  //  isMinimized }. Rows are drawn once setData() supplies the
  //  reservations and the rows to list, in order.
  // ═══════════════════════════════════════════════════════════════════
  function buildChart(opts) {
    ensureStyles();
    ensureTip();

    var bounds   = dayBounds(opts.day);
    var CS       = bounds.CS, CE = bounds.CE, totalMs = bounds.totalMs;
    var TICK     = 3 * 3600 * 1000;
    var showingAll = !!opts.showAll;
    var minimized  = isMinimized();
    var loaded     = false;

    var reservations = [], models = [], activeSet = {}, colorMap = {}, types = {};

    var wrap = document.createElement('div');
    wrap.id = 'edh-wf';
    wrap.innerHTML =
      '<div id="edh-wf-hdr"><h2>\ud83d\udcc5 Reservation <em>Waterfall</em>' +
        (opts.subtitle ? '<span class="edh-sub">' + esc(opts.subtitle) + '</span>' : '') + '</h2>' +
        '<div class="edh-hbtns">' +
          '<button type="button" id="edh-wf-btn">' + (showingAll ? 'ACTIVE ONLY' : 'SHOW ALL RESERVATIONS') + '</button>' +
          '<button type="button" class="edh-hbtn" data-act="settings" title="Waterfall settings" aria-label="Waterfall settings">\u2699</button>' +
          '<button type="button" class="edh-hbtn" data-act="min"></button>' +
        '</div></div>' +
      '<div id="edh-wf-msg" role="status"></div>' +
      '<div id="edh-wf-leg"></div>' +
      '<div id="edh-wf-chart"><div id="edh-wf-inner"></div></div>';

    var inner  = wrap.querySelector('#edh-wf-inner');
    var leg    = wrap.querySelector('#edh-wf-leg');
    var msg    = wrap.querySelector('#edh-wf-msg');
    var allBtn = wrap.querySelector('#edh-wf-btn');
    var minBtn = wrap.querySelector('[data-act="min"]');

    var axis = document.createElement('div');
    axis.id = 'edh-wf-axis';
    for (var t = 0; t <= totalMs; t += TICK) {
      var tick = document.createElement('div');
      tick.className = 'edh-atick';
      tick.style.left = (t / totalMs * 100) + '%';
      tick.textContent = fmtH(new Date(CS.getTime() + t));
      axis.appendChild(tick);
    }
    inner.appendChild(axis);

    function setData(res, rowModels) {
      reservations = res;
      models       = rowModels;
      types        = machineTypes(res);
      loaded       = true;
      activeSet    = {};
      reservations.forEach(function(r){
        if (r.end > CS && r.start < CE) activeSet[r.model] = true;
      });
      // Label column: about 6.5px a character, 96-260px. Longer names are
      // cut off; hovering a label shows all of it.
      var longest = models.reduce(function(n, m) { return Math.max(n, m.length); }, 0);
      inner.style.setProperty('--lw', Math.max(96, Math.min(260, Math.ceil(longest * 6.5) + 12)) + 'px');
      var cm = buildColorMap(reservations);
      colorMap = cm.map;
      renderLegend(leg, cm.tools, colorMap);
      renderRows();
    }

    function setMessage(text, isError) {
      msg.textContent = text || '';
      msg.className   = isError ? 'err' : '';
    }

    function renderRows() {
      inner.querySelectorAll('.edh-row,.edh-sec,.edh-empty').forEach(function(el){ el.remove(); });
      var ordered = settings.sortByType ? sortByType(models, types) : models;
      var activeModels = ordered.filter(function(m){ return activeSet[m]; });
      activeModels.forEach(function(m){ appendRow(m, true); });

      if (showingAll) {
        var idleModels = ordered.filter(function(m){ return !activeSet[m]; });
        if (idleModels.length) {
          appendSec('\u25cb  No reservations today');
          idleModels.forEach(function(m){ appendRow(m, false); });
        }
      } else if (loaded && !activeModels.length) {
        var empty = document.createElement('div');
        empty.className = 'edh-empty';
        empty.textContent = 'No reservations today.';
        inner.appendChild(empty);
      }
    }

    function appendSec(label) {
      var s = document.createElement('div');
      s.className = 'edh-sec';
      s.textContent = label;
      inner.appendChild(s);
    }

    function appendRow(model, isActive) {
      var res = reservations.filter(function(r) {
        return r.model === model && r.end > CS && r.start < CE;
      });

      var row  = document.createElement('div');
      row.className = 'edh-row';

      var lbl = document.createElement('div');
      lbl.className = 'edh-lbl' + (isActive ? ' on' : '');
      lbl.textContent = model;
      lbl.title = model;
      row.appendChild(lbl);

      var track = document.createElement('div');
      track.className = 'edh-track';
      if (!isActive) track.style.opacity = '.28';

      for (var gt = 0; gt <= totalMs; gt += TICK) {
        var gl = document.createElement('div');
        gl.className = 'edh-gl';
        gl.style.left = (gt / totalMs * 100) + '%';
        track.appendChild(gl);
      }

      var now = new Date();
      if (now >= CS && now <= CE) {
        var nl = document.createElement('div');
        nl.className = 'edh-now';
        nl.style.left = ((now - CS) / totalMs * 100) + '%';
        track.appendChild(nl);
      }

      var sorted = res.slice().sort(function(a,b){ return a.start - b.start; });
      var laneEnd = [];
      sorted.forEach(function(r) {
        var barStart = r.start < CS ? CS : r.start;
        var barEnd   = r.end   > CE ? CE : r.end;
        var lane = -1;
        for (var i = 0; i < laneEnd.length; i++) {
          if (laneEnd[i] <= barStart) { lane = i; break; }
        }
        if (lane === -1) { lane = laneEnd.length; laneEnd.push(null); }
        laneEnd[lane] = barEnd;

        var left  = ((barStart - CS) / totalMs * 100);
        var width = Math.max(((barEnd - barStart) / totalMs * 100), 0.35);

        var bar = document.createElement('div');
        bar.className = 'edh-bar';
        bar.style.left       = left + '%';
        bar.style.width      = width + '%';
        bar.style.top        = (lane * 26 + 4) + 'px';
        bar.style.background = grad(colorMap[r.tool] || PALETTE[0]);

        var label = r.label;
        if (r.start < CS) label = '\u25c4 ' + label;
        if (r.end   > CE) label = label + ' \u25ba';
        bar.textContent = label;

        (function(res, color){
          bar.addEventListener('mouseenter', function(e){ showTip(e, res, color); });
        })(r, colorMap[r.tool] || PALETTE[0]);
        bar.addEventListener('mousemove',  moveTip);
        bar.addEventListener('mouseleave', hideTip);
        track.appendChild(bar);
      });

      var h = Math.max(36, laneEnd.length * 26 + 8);
      track.style.minHeight = h + 'px';
      row.style.minHeight   = h + 'px';
      row.appendChild(track);
      inner.appendChild(row);
    }

    function setShowAll(v) {
      showingAll = v;
      allBtn.textContent = showingAll ? 'ACTIVE ONLY' : 'SHOW ALL RESERVATIONS';
      renderRows();
    }

    function applyMinimized() {
      wrap.classList.toggle('edh-min', minimized);
      minBtn.textContent = minimized ? '+' : '\u2212';
      minBtn.title = minimized ? 'Expand the waterfall' : 'Minimize the waterfall until this tab is closed';
      minBtn.setAttribute('aria-label', minBtn.title);
      minBtn.setAttribute('aria-expanded', String(!minimized));
    }

    allBtn.addEventListener('click', function() { setShowAll(!showingAll); });
    wrap.querySelector('[data-act="settings"]').addEventListener('click', openSettings);
    minBtn.addEventListener('click', function() {
      minimized = !minimized;
      storeMinimized(minimized);
      applyMinimized();
      if (minimized) hideTip();
      else if (opts.onExpand) opts.onExpand();
    });
    applyMinimized();

    return {
      el: wrap,
      setData: setData,
      setMessage: setMessage,
      setShowAll: setShowAll,
      redraw: renderRows,
      isMinimized: function() { return minimized; }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  LEGEND
  // ═══════════════════════════════════════════════════════════════════
  function renderLegend(legDiv, tools, colorMap) {
    legDiv.innerHTML = '';
    if (!tools.length) return;
    var primary = tools.slice(0, 2);
    var extra   = tools.slice(2);

    primary.forEach(function(t, i) {
      if (i > 0) {
        var div = document.createElement('div');
        div.className = 'edh-leg-divider';
        legDiv.appendChild(div);
      }
      var d = document.createElement('div');
      d.className = 'edh-leg-tool';
      d.innerHTML = '<span class="edh-leg-sw" style="background:' + colorMap[t] + '"></span>' + esc(t);
      legDiv.appendChild(d);
    });

    if (extra.length) {
      var sep = document.createElement('div');
      sep.className = 'edh-leg-divider';
      legDiv.appendChild(sep);

      extra.forEach(function(t, i) {
        if (i > 0) {
          var div2 = document.createElement('div');
          div2.className = 'edh-leg-extra';
          legDiv.appendChild(div2);
        }
        var d = document.createElement('div');
        d.className = 'edh-leg-extra';
        d.innerHTML = '<span class="edh-leg-sw" style="background:' + colorMap[t] + '"></span>' + esc(t);
        legDiv.appendChild(d);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TOOLTIP
  // ═══════════════════════════════════════════════════════════════════
  function ensureTip() {
    if (document.getElementById('edh-tip')) return;
    var tip = document.createElement('div');
    tip.id = 'edh-tip';
    document.body.appendChild(tip);
  }
  function showTip(e, r, color) {
    var tip = document.getElementById('edh-tip');
    var dur = Math.round((r.end - r.start) / 60000);
    var model = modelPart(r.model, r.tool);
    tip.innerHTML =
      '<div class="tn">' + esc(r.name) + '</div>' +
      '<div class="tt"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + color + ';vertical-align:middle;margin-right:5px"></span>' + esc(r.tool) + '</div>' +
      (model ? '<div>Model: <strong style="color:#fff">' + esc(model) + '</strong></div>' : '') +
      '<div class="td">' + fmtDT(r.start) + ' \u2192 ' + fmtDT(r.end) + '</div>' +
      '<div class="tg">\u23f1 ' + dur + ' min\u00a0(' + (dur/60).toFixed(1) + ' hr)</div>' +
      (r.note ? '<div class="tx">' + esc(r.note) + '</div>' : '');
    tip.style.display = 'block';
    moveTip(e);
  }
  function moveTip(e) {
    var tip = document.getElementById('edh-tip');
    if (!tip) return;
    var x = e.clientX + 16, y = e.clientY - 10;
    if (x + 245 > window.innerWidth)  x = e.clientX - 255;
    if (y + 145 > window.innerHeight) y = e.clientY - 155;
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  }
  function hideTip() {
    var tip = document.getElementById('edh-tip');
    if (tip) tip.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SETTINGS PAGE — opened from the ⚙ button on the chart or from the
  //  Tampermonkey menu (the only way back in once the chart is off).
  //  Changes save and apply immediately.
  // ═══════════════════════════════════════════════════════════════════
  function openSettings() {
    ensureStyles();
    closeSettings();

    var ov = document.createElement('div');
    ov.id = 'edh-set-ov';
    ov.innerHTML =
      '<div id="edh-set" role="dialog" aria-modal="true" aria-labelledby="edh-set-title">' +
        '<div class="edh-set-hdr"><h2 id="edh-set-title">\u2699 Waterfall <em>Settings</em></h2>' +
          '<button type="button" class="edh-hbtn" data-act="close" title="Close" aria-label="Close settings">\u00d7</button></div>' +
        '<div class="edh-set-body">' +
          '<h3>Show the waterfall on</h3>' +
          optHtml('toolsPage', 'Tools page' + (page === 'tools' ? ' (this page)' : ''),
                  location.host + '/tools/ \u2014 loads each saved tool\u2019s reservations.json (no login needed)') +
          optHtml('agendaPage', 'Agenda page' + (page === 'agenda' ? ' (this page)' : ''),
                  '/admin/agenda/ \u2014 built from the Today\u2019s Reservations table; SHOW ALL lists every saved tool that takes reservations') +
          '<h3>Chart</h3>' +
          optHtml('sortByType', 'Sort rows by tool type',
                  'Groups rows by the Tool column (e.g. all Prusa MK4s together), A–Z. Off: rows follow the models list in the script, then A–Z') +
          optHtml('showIdle', 'Show idle tools by default',
                  'Start in SHOW ALL RESERVATIONS mode instead of active only') +
          '<p class="edh-set-note">Settings and saved tools are kept separately for each site (' +
            esc(location.host) + ' here). Changes are saved right away. To hide the chart just for now, use ' +
            '<code>\u2212</code> on its header: it stays minimized until you close this tab. ' +
            'While the waterfall is turned off, reopen these settings from the Tampermonkey menu ' +
            '(\u2699 Waterfall settings).</p>' +
          '<div id="edh-set-tools">' + savedToolsHtml() + '</div>' +
        '</div>' +
      '</div>';

    ov.querySelectorAll('input[data-key]').forEach(function(input) {
      input.addEventListener('change', function() {
        var key = input.getAttribute('data-key');
        settings[key] = input.checked;
        saveSettings();
        applySettings();
        if (key === 'showIdle' && mounted) mounted.setShowAll(settings.showIdle);
        if (key === 'sortByType' && mounted) mounted.redraw();
      });
    });
    ov.querySelector('[data-act="close"]').addEventListener('click', closeSettings);
    ov.addEventListener('click', function(e) {
      if (e.target === ov) closeSettings();
      if (e.target.closest('[data-act="forget"]')) {
        saveSavedTools({});
        ov.querySelector('#edh-set-tools').innerHTML = savedToolsHtml();
      }
    });
    document.addEventListener('keydown', onSettingsKey);

    document.body.appendChild(ov);
    ov.querySelector('input').focus();
  }

  function closeSettings() {
    var ov = document.getElementById('edh-set-ov');
    if (ov) ov.remove();
    document.removeEventListener('keydown', onSettingsKey);
  }
  function onSettingsKey(e) {
    if (e.key === 'Escape') closeSettings();
  }

  function optHtml(key, label, hint) {
    return '<label class="edh-set-opt"><input type="checkbox" data-key="' + key + '"' + (settings[key] ? ' checked' : '') + '>' +
           '<span>' + esc(label) + '<small>' + esc(hint) + '</small></span></label>';
  }

  function savedToolsHtml() {
    var tools = knownTools();
    var html = '<h3>Saved tools (tool ID \u2192 row)</h3>';
    if (!tools.length) {
      html += '<p class="edh-set-note">No tools saved yet.</p>';
    } else {
      html += '<table class="edh-set-ids"><thead><tr><th>Tool ID</th><th>Tool</th><th>Row</th></tr></thead><tbody>';
      tools.forEach(function(t) {
        var note = t.manual ? 'from toolIds' :
                   t.reservable === false ? 'reservation not required, hidden' :
                   t.reservable !== true ? 'not checked yet, hidden' : '';
        html += '<tr><td class="edh-id">' + esc(t.id) + '</td><td>' + esc(t.tool) + '</td><td>' + esc(t.model) +
                (note ? ' <small>(' + note + ')</small>' : '') + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '<p class="edh-set-note">Tools are saved whenever you open the Tools page or the admin Tools page ' +
      '(/admin/tools/). The Agenda page also reads /admin/tools/ in the background, if your account can open it. ' +
      'The admin page lists every tool, so reading it replaces this list. The Tools page only ' +
      'lists tools you are authorized to use, so it adds to the list.</p>' +
      '<p class="edh-set-note">The waterfalls leave out tools that don’t require a reservation. Tools linked ' +
      'from the Tools page take reservations; any other tool is checked on its admin edit page ' +
      '(“Requires Reservation?”) at most once a day, and stays hidden until it has been checked.</p>';
    if (Object.keys(loadSavedTools()).length) {
      html += '<button type="button" class="edh-set-btn" data-act="forget">Forget saved tools</button>';
    }
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  FORMAT HELPERS
  // ═══════════════════════════════════════════════════════════════════
  function fmtH(d) {
    var h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? 'pm' : 'am';
    if (h > 12) h -= 12; if (h === 0) h = 12;
    return m ? h + ':' + (m < 10 ? '0'+m : m) + ap : h + ap;
  }
  function fmtDT(d) {
    var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mo[d.getMonth()] + ' ' + d.getDate() + ' ' + fmtH(d);
  }
  function fmtDay(d) {
    var dn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return dn[d.getDay()] + ' ' + mo[d.getMonth()] + ' ' + d.getDate();
  }
  function ymd(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  MOUNT — Agenda page (Hardened to specifically grab the
  //  'Today's Reservations' table)
  // ═══════════════════════════════════════════════════════════════════
  function mountAgenda() {
    // 1. Find the header specifically labeled "Today's Reservations"
    var resHeader = document.getElementById('todays-reservations');
    if (!resHeader) {
      console.warn("EDH Waterfall Error: Could not find Today's Reservations on this page.");
      return null;
    }

    // 2. The table should directly follow the header in the HTML DOM.
    // Fallback: the table described by that header. (Not the next
    // dcf-table: on a day with no reservations there is no table, and that
    // would be Today's Events.)
    var table = resHeader.nextElementSibling;
    if (!table || table.tagName !== 'TABLE') {
      table = document.querySelector('table[aria-describedby="todays-reservations"]');
    }

    // 3. Parse and build
    var reservations = table ? parseReservations(table) : [];
    if (reservations.length === 0) {
      console.log("EDH Waterfall: No valid reservations were found today.");
      // We don't return here so it can still draw an empty grid showing "No reservations today"
    }

    // Rows: MODELS, then every saved tool that takes reservations, then
    // anything else reserved today.
    function rows() {
      var off = notReservableModels();
      var models = MODELS
        .concat(knownTools().filter(isShown).map(function(t) { return t.model; }))
        .filter(function(m) { return off.indexOf(m) === -1; })
        .concat(reservations.map(function(r) { return r.model; }));
      return orderModels(uniq(models));
    }

    var chart = buildChart({ day: agendaDay(), showAll: settings.showIdle });
    chart.setData(reservations, rows());
    if (table) table.parentNode.insertBefore(chart.el, table);
    else resHeader.parentNode.insertBefore(chart.el, resHeader.nextSibling);

    refreshToolsFromAdmin()
      .then(function(changed) {
        if (changed) chart.setData(reservations, rows());
        return verifyReservable();
      })
      .then(function(changed) {
        if (changed) chart.setData(reservations, rows());
      })
      .catch(function(err) {
        console.warn('EDH Waterfall: could not read /admin/tools/, using the saved tool list.', err);
      });
    return chart;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  MOUNT — Tools page. Only saved tools that take reservations (and
  //  TOOL_IDS) that loaded get rows, so "idle" never means "not checked".
  //  While minimized, nothing is fetched until the chart is expanded.
  // ═══════════════════════════════════════════════════════════════════
  function mountTools() {
    var anchor = document.getElementById('tools-list-table');
    if (!anchor) {
      console.warn("EDH Waterfall Error: Could not find the tool list on this page.");
      return null;
    }

    var day     = new Date();
    var started = false;
    var chart   = buildChart({
      day: day,
      subtitle: fmtDay(day),
      showAll: settings.showIdle,
      onExpand: load
    });
    anchor.parentNode.insertBefore(chart.el, anchor);

    function load() {
      if (started) return;
      started = true;

      var tools = knownTools().filter(isShown);
      if (!tools.length) {
        chart.setMessage('No tools found on this page or saved yet.');
        chart.setData([], []);
        return;
      }

      // Six at a time: some sites have close to a hundred tools.
      chart.setMessage('Loading reservations for ' + tools.length + ' tools\u2026');
      mapLimit(tools, 6, function(t) {
        return fetchReservations(t.id, day).then(
          function(rows) { return { tool: t, rows: rows }; },
          function(err)  {
            console.warn('EDH Waterfall: could not load /tools/' + t.id + '/reservations.json (' + t.model + ')', err);
            return { tool: t, error: err || true };
          });
      }).then(function(results) {
        var reservations = [], models = [], failed = [], missing = [];
        results.forEach(function(r) {
          if (r.error) {
            (r.error.missing && !r.tool.manual ? missing : failed).push(r.tool);
            return;
          }
          if (models.indexOf(r.tool.model) === -1) models.push(r.tool.model);
          r.rows.forEach(function(row) {
            var res = toReservation(row, r.tool);
            if (res) reservations.push(res);
          });
        });

        // Forget saved tools the site says no longer exist, unless no tool
        // loaded at all (then the problem is probably not the tools).
        if (missing.length && failed.length + missing.length < results.length) {
          forgetTools(missing);
        } else {
          failed = failed.concat(missing);
          missing = [];
        }

        var names = function(list) { return list.map(function(t) { return t.model; }).join(', '); };
        var text = [];
        if (failed.length)  text.push('Could not load reservations for ' + names(failed) + '.');
        if (missing.length) text.push('Removed ' + names(missing) + ' from the saved tools: the site no longer has ' +
                                      (missing.length === 1 ? 'that tool.' : 'those tools.'));
        chart.setData(reservations, orderModels(models));
        chart.setMessage(text.join(' '), failed.length > 0);
      });
    }

    if (!chart.isMinimized()) load();
    return chart;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════════════
  // The script runs on every unl.edu page with one of these paths, so each
  // page must also have the heading the reservations app gives it.
  function detectPage() {
    var path = location.pathname;
    var has  = function(id) { return !!document.getElementById(id); };
    if (/^\/tools\/?$/.test(path)       && has('tools-list-table'))    return 'tools';
    if (/^\/admin\/tools\/?$/.test(path) && has('tool-list-header'))    return 'admintools';
    if (/\/agenda(\/|$)/.test(path)     && has('todays-reservations')) return 'agenda';
    return null;
  }

  // The admin Tools page only feeds the saved tool list; it has no chart.
  function applySettings() {
    var enabled = page === 'tools'  ? settings.toolsPage :
                  page === 'agenda' ? settings.agendaPage : false;
    if (enabled && !mounted) {
      mounted = page === 'tools' ? mountTools() : mountAgenda();
    } else if (!enabled && mounted) {
      mounted.el.remove();
      mounted = null;
      hideTip();
    }
  }

  function init() {
    page = detectPage();
    if (!page) return;
    rememberPageTools();
    if (page === 'admintools') {
      verifyReservable().catch(function(err) { console.warn('EDH Waterfall: reservable check failed', err); });
    }
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('\u2699 Waterfall settings', openSettings);
    }
    applySettings();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
