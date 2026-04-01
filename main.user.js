// ==UserScript==
// @name         Engineering Design Hub - Reservation Waterfall
// @namespace    https://designhub-manager.unl.edu/
// @version      1.0.1
// @description  Dark-mode Gantt chart - ordered models, dynamic tool colors, hide idle printers
// @match        *://designhub-manager.unl.edu/admin/agenda/*
// @match        *://designhub-manager.unl.edu/agenda/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  //  PRINTER LIST — edit this array to add/remove printers.
  //  Printers with no reservations today are hidden unless you click
  //  "SHOW ALL MODELS".
  // ═══════════════════════════════════════════════════════════════════
  const MODELS = [
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
    'Kapany',
    'Maiman',
    'GoldenBee',
    'GorgeousSquid',
    'TangibleRabbit',
    'Karen',
    'Cathy',
    'Farnsworth'
  ];

  // ═══════════════════════════════════════════════════════════════════
  //  TOOL COLOR PALETTE — colors are assigned to tools in the order
  //  they are first encountered. Add more colors if needed.
  // ═══════════════════════════════════════════════════════════════════
  const PALETTE = [
    '#ff4444', '#3b9eff', '#22d47b', '#ff9f1c',
    '#c77dff', '#ff6b9d', '#00e5d4', '#ffdd00',
  ];

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
      out.push({ name: name, tool: tool, model: model, start: start, end: end });
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
  //  CHART BOUNDS
  // ═══════════════════════════════════════════════════════════════════
  function getBounds() {
    var h1 = document.querySelector('h1.dcf-txt-h3');
    var base = new Date();
    if (h1) {
      var dateStr = h1.textContent.replace(/Today's Agenda/i, '').trim();
      var parsed = new Date(dateStr);
      if (!isNaN(parsed)) base = parsed;
    }
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
  //  BUILD CHART
  // ═══════════════════════════════════════════════════════════════════
  function buildChart(reservations) {
    var bounds   = getBounds();
    var CS       = bounds.CS, CE = bounds.CE, totalMs = bounds.totalMs;
    var cm       = buildColorMap(reservations);
    var colorMap = cm.map, tools = cm.tools;
    var TICK     = 3 * 3600 * 1000;
    var showingAll = false;

    var activeSet = {};
    reservations.forEach(function(r){
      if (r.end > CS && r.start < CE) activeSet[r.model] = true;
    });

    var unknownModels = [];
    reservations.forEach(function(r) {
      if (MODELS.indexOf(r.model) === -1 && unknownModels.indexOf(r.model) === -1) {
        unknownModels.push(r.model);
      }
    });

    var allOrderedModels = MODELS.concat(unknownModels);

    var styleEl = document.createElement('style');
    styleEl.textContent =
      '#edh-wf *{box-sizing:border-box}' +
      '#edh-wf{font-family:"Work Sans","Segoe UI",sans-serif;background:#080808;border:1px solid #1f1f1f;border-radius:8px;overflow:hidden;margin:2em 0 2.6em;box-shadow:0 0 0 1px #161616,0 12px 40px rgba(0,0,0,.85);color:#d8d8d8}' +
      '#edh-wf-hdr{display:flex;align-items:center;justify-content:space-between;padding:.7em 1.25em;background:#0e0e0e;border-bottom:2px solid #ff4444}' +
      '#edh-wf-hdr h2{margin:0;font-size:.82em;font-weight:700;text-transform:uppercase;letter-spacing:.13em;color:#fff}' +
      '#edh-wf-hdr h2 em{font-style:normal;color:#ff4444}' +
      '#edh-wf-btn{background:#161616;border:1px solid #2e2e2e;color:#777;font-size:.7em;font-family:inherit;padding:.35em 1em;border-radius:4px;cursor:pointer;letter-spacing:.07em;transition:all .15s}' +
      '#edh-wf-btn:hover{background:#222;color:#fff;border-color:#555}' +
      '#edh-wf-leg{display:flex;flex-wrap:wrap;gap:.35em 1.6em;padding:.6em 1.25em;background:#0b0b0b;border-bottom:1px solid #1a1a1a;font-size:.73em;align-items:flex-start}' +
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
      '#edh-tip .tg{color:#22d47b;font-size:.88em}';
    document.head.appendChild(styleEl);

    var wrap = document.createElement('div');
    wrap.id = 'edh-wf';
    wrap.innerHTML =
      '<div id="edh-wf-hdr"><h2>\ud83d\udcc5 Reservation <em>Waterfall</em></h2><button id="edh-wf-btn">SHOW ALL RESERVATIONS</button></div>' +
      '<div id="edh-wf-leg"></div>' +
      '<div id="edh-wf-chart"><div id="edh-wf-inner"></div></div>';

    renderLegend(wrap.querySelector('#edh-wf-leg'), tools, colorMap);

    var inner = wrap.querySelector('#edh-wf-inner');

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

    function renderRows() {
      inner.querySelectorAll('.edh-row,.edh-sec').forEach(function(el){ el.remove(); });
      var activeModels = allOrderedModels.filter(function(m){ return activeSet[m]; });
      activeModels.forEach(function(m){ appendRow(m, true); });

      if (showingAll) {
        var idleModels = allOrderedModels.filter(function(m){ return !activeSet[m]; });
        if (idleModels.length) {
          appendSec('\u25cb  No reservations today');
          idleModels.forEach(function(m){ appendRow(m, false); });
        }
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

        var label = r.name.split(' ')[0];
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

    wrap.querySelector('#edh-wf-btn').addEventListener('click', function() {
      showingAll = !showingAll;
      this.textContent = showingAll ? 'ACTIVE ONLY' : 'SHOW ALL RESERVATIONS';
      renderRows();
    });

    renderRows();

    var tip = document.createElement('div');
    tip.id = 'edh-tip';
    document.body.appendChild(tip);

    return wrap;
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
      d.innerHTML = '<span class="edh-leg-sw" style="background:' + colorMap[t] + '"></span>' + t;
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
        d.innerHTML = '<span class="edh-leg-sw" style="background:' + colorMap[t] + '"></span>' + t;
        legDiv.appendChild(d);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  TOOLTIP
  // ═══════════════════════════════════════════════════════════════════
  function showTip(e, r, color) {
    var tip = document.getElementById('edh-tip');
    var dur = Math.round((r.end - r.start) / 60000);
    tip.innerHTML =
      '<div class="tn">' + r.name + '</div>' +
      '<div class="tt"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + color + ';vertical-align:middle;margin-right:5px"></span>' + r.tool + '</div>' +
      '<div>Model: <strong style="color:#fff">' + r.model + '</strong></div>' +
      '<div class="td">' + fmtDT(r.start) + ' \u2192 ' + fmtDT(r.end) + '</div>' +
      '<div class="tg">\u23f1 ' + dur + ' min\u00a0(' + (dur/60).toFixed(1) + ' hr)</div>';
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

  // ═══════════════════════════════════════════════════════════════════
  //  INIT (Hardened to specifically grab the 'Today's Reservations' table)
  // ═══════════════════════════════════════════════════════════════════
  function init() {
    // 1. Find the header specifically labeled "Today's Reservations"
    var resHeader = document.getElementById('todays-reservations');
    var table = null;

    if (resHeader) {
      // The table should directly follow the header in the HTML DOM
      table = resHeader.nextElementSibling;
    }

    // 2. Fallback: If the header logic missed it, target the specific UNL table styling classes
    if (!table || table.tagName !== 'TABLE') {
      table = document.querySelector('table.dcf-table.dcf-table-bordered');
    }

    if (!table) {
      console.warn("EDH Waterfall Error: Could not find the reservations table on this page.");
      return;
    }

    // 3. Parse and build
    var reservations = parseReservations(table);
    if (reservations.length === 0) {
      console.log("EDH Waterfall: Table found, but no valid reservations were parsed today.");
      // We don't return here so it can still draw an empty grid showing "No reservations today"
    }

    var chart = buildChart(reservations);
    if (!chart) return;

    table.parentNode.insertBefore(chart, table);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();