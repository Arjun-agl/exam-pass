/* Exam Pass: UI. Data rules live in logic.js; questions in questions.js. */
(() => {
  'use strict';
  const L = window.Logic;
  const QUESTIONS = (window.QUESTIONS || []).filter(q => q && q.q && Array.isArray(q.options) && q.options.length === 4 && q.answer >= 0 && q.answer < 4);
  const $ = id => document.getElementById(id);

  /* ---------- Tiny DOM helper (text is always set safely) ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v; // only ever used with our own static SVG strings
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'style') e.style.cssText = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  const SVG = {
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    flame: '<svg width="26" height="26" viewBox="0 0 24 24" fill="#ffc93c" aria-hidden="true"><path d="M12 2c1 3.5 4.5 5.5 4.5 10a4.5 4.5 0 0 1-9 0c0-2 .8-3.3 1.8-4.5.2 1.6 1 2.6 2.2 3 0-3.2-1-5.5.5-8.5z"/></svg>'
  };

  /* ---------- Storage ---------- */
  const KEY = 'exam-pass-v1';
  function read() { try { const s = JSON.parse(localStorage.getItem(KEY)); return L.validState(s) ? s : null; } catch (e) { return null; } }
  let state = read() || L.defaultState();
  if (!state.prefs) state.prefs = { focus: 25, brk: 5 };
  // Every change: pick up anything another window saved, apply the change, save, redraw.
  function commit(fn) {
    const latest = read(); if (latest && latest.updated > state.updated) state = latest;
    fn(state); state.updated = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("Couldn't save. Your phone storage may be full."); }
    render();
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}

  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.hidden = true, 200); }, 2000); }

  /* ---------- Tabs ---------- */
  let tab = 'today';
  function show(t) {
    tab = t;
    document.querySelectorAll('.tab').forEach(b => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    for (const v of ['today', 'focus', 'syllabus', 'quiz']) $('v-' + v).hidden = v !== t;
    render(); scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  function render() {
    if (tab === 'today') renderToday(); else if (tab === 'focus') renderFocus(); else if (tab === 'syllabus') renderSyllabus(); else renderQuiz();
    renderOverlay();
  }

  /* ================= TODAY ================= */
  let viewDate = L.istDate(), lastToday = L.istDate(), addOpen = false, armed = null, armT;
  function arm(id) { armed = id; clearTimeout(armT); armT = setTimeout(() => { armed = null; render(); }, 3500); render(); }
  function nextTask(today) {
    const open = L.sortTasks(L.dayTasks(state, today)).filter(t => !t.done);
    return open.find(t => t.must) || open[0] || null;
  }
  function renderToday() {
    const today = L.istDate(), v = $('v-today'); v.replaceChildren();
    const isToday = viewDate === today;

    // Header: date, arrows, Today, settings
    v.append(h('div', { class: 'head' },
      h('div', null, h('div', { class: 'mono' }, isToday ? 'Today' : (viewDate < today ? 'Past day' : 'Coming up')), h('div', { class: 'date-big poster' }, L.pretty(viewDate))),
      h('div', { class: 'navrow' },
        h('button', { class: 'icon-btn', 'aria-label': 'Previous day', html: SVG.left, onclick: () => { viewDate = L.addDays(viewDate, -1); addOpen = false; render(); } }),
        h('button', { class: 'icon-btn', 'aria-label': 'Next day', html: SVG.right, onclick: () => { viewDate = L.addDays(viewDate, 1); addOpen = false; render(); } }),
        isToday ? null : h('button', { class: 'today-btn', onclick: () => { viewDate = today; render(); } }, 'TODAY'),
        h('button', { class: 'icon-btn', 'aria-label': 'Settings', html: SVG.gear, onclick: openSettings }))));

    // Countdown to the next 3 events
    const ev = L.nextEvents(state.events, today, 3);
    if (ev[0]) {
      const e = ev[0], urgent = e.days <= 3;
      v.append(h('div', { class: 'ticket' + (urgent ? '' : ' calm') },
        h('div', { class: 'main' }, h('div', { class: 'mono', style: 'opacity:.85' }, 'Next · ' + L.short(e.date)), h('div', { class: 'name poster' }, e.name), h('div', { class: 'mono', style: 'margin-top:4px;opacity:.85' }, e.days === 0 ? 'Good luck today' : urgent ? 'Coming up fast' : 'Plenty of time if you start now')),
        h('div', { class: 'stub' }, h('div', { class: 'num poster' }, e.days === 0 ? '0' : String(e.days)), h('div', { class: 'mono' }, e.days === 0 ? 'Today' : e.days === 1 ? 'Day' : 'Days'))));
      if (ev.length > 1) v.append(h('div', { class: 'minis' }, ev.slice(1).map(x => h('div', { class: 'mini' + (x.days <= 3 ? ' urgent' : '') },
        h('div', { class: 't' }, x.name, h('div', { class: 'mono', style: 'opacity:.8;font-size:10px' }, L.short(x.date))),
        h('div', { class: 'n poster' }, x.days === 0 ? 'NOW' : x.days + 'D')))));
    }

    // Streak and yesterday
    const st = L.streak(state, today), y = L.addDays(today, -1), yc = L.dayCounts(state, y), ym = L.minutesOn(state, y);
    v.append(h('div', { class: 'stats' },
      h('div', { class: 'stat dark' }, h('span', { html: SVG.flame }), h('div', null, h('div', { class: 'big poster' }, st + (st === 1 ? ' DAY' : ' DAYS')), h('div', { class: 'mono' }, 'NSAT streak'))),
      h('div', { class: 'stat' }, h('div', { class: 'big poster' }, yc.done + '/' + yc.total + ' · ' + L.hm(ym).replace(' min', 'm').replace(' h ', 'h ')), h('div', { class: 'mono' }, 'Yesterday'))));

    // Tasks
    const tasks = L.sortTasks(L.dayTasks(state, viewDate)), c = L.dayCounts(state, viewDate);
    v.append(h('div', { class: 'sect' }, h('div', { class: 'mono' }, 'Tasks · ' + c.done + '/' + c.total + (isToday ? '' : ' · ' + L.short(viewDate))),
      h('button', { class: 'addbtn', onclick: () => { addOpen = !addOpen; render(); if (addOpen) setTimeout(() => { const i = $('add-text'); i && i.focus(); }, 30); } }, addOpen ? 'CLOSE' : '+ ADD')));
    if (addOpen) {
      const err = h('div', { class: 'err', role: 'alert' });
      const form = h('form', { class: 'addform', onsubmit: ev2 => {
        ev2.preventDefault(); const text = $('add-text').value.trim();
        if (!text) { err.textContent = 'Type what you want to do first.'; return; }
        const must = $('add-must').checked; addOpen = false;
        commit(s => L.addTask(s, viewDate, text, must)); toast('Task added');
      } },
        h('input', { id: 'add-text', placeholder: 'Chemistry: revise Amines', maxlength: '90', autocomplete: 'off' }),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', id: 'add-must' }), 'Must-do'),
        err, h('button', { class: 'btn primary', type: 'submit' }, 'Add to ' + (isToday ? 'today' : L.short(viewDate))));
      v.append(form);
    }
    const list = h('div', { class: 'tasks' });
    if (!tasks.length) list.append(h('div', { class: 'empty' }, isToday ? 'Nothing planned. Add a task with + ADD.' : 'No tasks on this day.'));
    for (const t of tasks) list.append(taskCard(t));
    v.append(list);

    if (isToday) {
      const n = L.unfinishedBefore(state, today).length;
      if (n) v.append(h('button', { class: 'carry', onclick: () => { let k = 0; commit(s => { k = L.carryOver(s, today); }); toast(k + (k === 1 ? ' task' : ' tasks') + ' moved to today'); } },
        '↺ Move ' + n + ' unfinished ' + (n === 1 ? 'task' : 'tasks') + ' from earlier days to today'));
      const nt = nextTask(today);
      v.append(nt
        ? h('button', { class: 'go', onclick: () => { focusSel = { id: nt.id, text: nt.text }; show('focus'); } },
            h('div', null, h('div', { class: 'mono', style: 'opacity:.7' }, 'Next · start now'), h('div', { class: 'lbl' }, nt.text)), h('span', { class: 'poster' }, 'GO →'))
        : h('div', { class: 'go', style: 'justify-content:center' }, h('div', { class: 'lbl' }, 'Everything ticked today. Well done!')));
    } else v.append(h('div', { class: 'yday' }, 'Tap a task to tick or un-tick it on ' + L.pretty(viewDate)));
  }
  function taskCard(t) {
    const toggle = () => commit(s => L.toggleTask(s, viewDate, t.id));
    let pressT, longPressed = false;
    const card = h('div', { class: 'task' + (t.done ? ' done' : '') });
    card.addEventListener('pointerdown', () => { longPressed = false; pressT = setTimeout(() => { longPressed = true; arm(t.id); }, 550); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => card.addEventListener(ev, () => clearTimeout(pressT)));
    card.addEventListener('contextmenu', e => e.preventDefault());
    const guard = fn => () => { if (longPressed) { longPressed = false; return; } fn(); };
    const sub = t.carried ? 'carried over from ' + L.short(t.from) : '';
    card.append(...[
      h('button', { class: 'check', 'aria-label': (t.done ? 'Un-tick ' : 'Tick ') + t.text, 'aria-pressed': String(!!t.done), onclick: guard(toggle) }, t.done ? '✓' : ''),
      h('button', { class: 'txt', onclick: guard(toggle) }, t.text, sub ? h('span', { class: 'sub' }, sub) : null),
      t.done ? h('span', { class: 'stamp' }, 'DONE') : t.must ? h('span', { class: 'tag-must' }, 'MUST-DO') : null,
      armed === t.id
        ? h('button', { class: 'x armed', onclick: () => { armed = null; commit(s => L.deleteTask(s, viewDate, t.id)); toast('Task deleted'); } }, 'DELETE')
        : h('button', { class: 'x', 'aria-label': 'Delete ' + t.text, onclick: () => arm(t.id) }, '×')].filter(Boolean));
    return card;
  }

  /* ================= FOCUS ================= */
  let focusSel = null, customOpen = false, ownText = '';
  const PRESETS = [[25, 5], [45, 10], [60, 10]];
  let audioCtx = null;
  function unlockAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} }
  function chime() {
    try {
      if (!audioCtx) unlockAudio(); const t0 = audioCtx.currentTime;
      [0, .28, .56].forEach((d, i) => { const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sine'; o.frequency.value = i === 2 ? 1175 : 880; g.gain.setValueAtTime(0, t0 + d); g.gain.linearRampToValueAtTime(.35, t0 + d + .02); g.gain.exponentialRampToValueAtTime(.001, t0 + d + .25); o.connect(g).connect(audioCtx.destination); o.start(t0 + d); o.stop(t0 + d + .26); });
    } catch (e) {}
    try { navigator.vibrate && navigator.vibrate([250, 120, 250, 120, 400]); } catch (e) {}
  }
  let wakeLock = null;
  async function keepAwake(on) { try { if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch (e) {} }

  function ringSVG(frac, big, small, dark) {
    const r = 112, C = 2 * Math.PI * r, fg = dark ? '#ffc93c' : '#f0502f', track = dark ? 'rgba(255,253,246,.18)' : '#d8cfbb', ink = dark ? '#fffdf6' : '#17213f';
    return `<svg class="ring" viewBox="0 0 260 260" role="img" aria-label="${big} ${small}"><circle cx="130" cy="130" r="${r}" fill="none" stroke="${track}" stroke-width="14"/>` +
      `<circle cx="130" cy="130" r="${r}" fill="none" stroke="${fg}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - Math.max(0, Math.min(1, frac)))).toFixed(1)}" transform="rotate(-90 130 130)"/>` +
      `<text x="130" y="140" text-anchor="middle" font-family="Big Shoulders Display, Arial Narrow, sans-serif" font-weight="800" font-size="72" fill="${ink}">${big}</text>` +
      `<text x="130" y="176" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="12" letter-spacing="2" fill="${ink}" opacity=".7">${small}</text></svg>`;
  }
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  function renderFocus() {
    const v = $('v-focus'), today = L.istDate(); v.replaceChildren();
    const p = state.prefs, open = L.sortTasks(L.dayTasks(state, today)).filter(t => !t.done);
    if (focusSel && focusSel.id && !open.some(t => t.id === focusSel.id)) focusSel = null;
    v.append(h('div', { class: 'head' }, h('div', null, h('div', { class: 'mono' }, 'Focus'), h('div', { class: 'date-big poster' }, 'Deep work'))));
    if (!focusSel) focusSel = open[0] ? { id: open[0].id, text: open[0].text } : { id: null, text: ownText };

    const sel = h('select', { id: 'focus-task', 'aria-label': 'Task to focus on', onchange: e => { const val = e.target.value; if (val === '__own') focusSel = { id: null, text: ownText }; else { const t = open.find(x => x.id === val); focusSel = t ? { id: t.id, text: t.text } : null; } render(); } },
      open.map(t => h('option', { value: t.id, selected: focusSel && focusSel.id === t.id }, (t.must ? '★ ' : '') + t.text)),
      h('option', { value: '__own', selected: !focusSel.id }, 'Type my own…'));
    v.append(h('div', null, h('div', { class: 'mono', style: 'margin-bottom:6px' }, 'Task'), sel));
    if (!focusSel.id) v.append(h('input', { id: 'own-task', placeholder: 'What will you work on?', value: ownText, maxlength: '90', oninput: e => { ownText = e.target.value; focusSel = { id: null, text: ownText }; } }));

    const isPreset = PRESETS.some(([f, b]) => f === p.focus && b === p.brk) && !customOpen;
    v.append(h('div', { class: 'presets' },
      PRESETS.map(([f, b]) => h('button', { class: 'chip', 'aria-pressed': String(isPreset && p.focus === f && p.brk === b), onclick: () => { customOpen = false; commit(s => { s.prefs = { focus: f, brk: b }; }); } }, f + ' / ' + b)),
      h('button', { class: 'chip', 'aria-pressed': String(!isPreset), onclick: () => { customOpen = true; render(); } }, 'Custom')));
    if (!isPreset) v.append(h('div', { class: 'custom' },
      h('label', null, h('div', { class: 'mono', style: 'margin-bottom:4px' }, 'Focus min'), h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '240', value: p.focus, onchange: e => { const n = Math.max(1, Math.min(240, parseInt(e.target.value, 10) || 25)); commit(s => { s.prefs.focus = n; }); } })),
      h('label', null, h('div', { class: 'mono', style: 'margin-bottom:4px' }, 'Break min'), h('input', { type: 'number', inputmode: 'numeric', min: '0', max: '60', value: p.brk, onchange: e => { const n = Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0)); commit(s => { s.prefs.brk = n; }); } }))));

    v.append(h('div', { class: 'timer-wrap', html: ringSVG(1, String(p.focus).padStart(2, '0') + ':00', 'READY · ' + p.brk + ' MIN BREAK') }));
    const err = h('div', { class: 'err', role: 'alert', style: 'text-align:center' });
    v.append(err, h('button', { class: 'go', style: 'justify-content:center', onclick: () => {
      const text = (focusSel && focusSel.text || '').trim();
      if (!text) { err.textContent = 'Pick a task or type one first.'; return; }
      unlockAudio(); startFocus({ id: focusSel.id, text });
    } }, h('span', { class: 'poster' }, 'START FOCUS →')));

    const mins = L.minutesOn(state, today);
    v.append(h('div', { class: 'studied' }, 'Today: ', h('b', null, L.hm(mins)), ' studied'));
    v.append(chart(L.lastNDays(state, today, 7), today));
  }
  function chart(days, today) {
    const W = 340, H = 160, pad = 22, bw = 30, max = Math.max(60, ...days.map(d => d.min));
    const gap = (W - pad * 2 - bw * 7) / 6;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Minutes studied over the last 7 days"><line x1="${pad}" y1="${H - 28}" x2="${W - pad}" y2="${H - 28}" stroke="#17213f" stroke-width="1.5"/>`;
    days.forEach((d, i) => {
      const x = pad + i * (bw + gap), bh = Math.round((H - 58) * d.min / max), y = H - 28 - bh, isT = d.ds === today;
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(bh, d.min ? 2 : 0)}" rx="3" fill="${isT ? '#f0502f' : '#17213f'}"/>`;
      s += `<text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="#17213f">${d.min ? d.min : ''}</text>`;
      s += `<text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" fill="${isT ? '#c93a1c' : '#6c6a5e'}">${L.dow(d.ds).toUpperCase()}</text>`;
    });
    return h('div', null, h('div', { class: 'mono', style: 'margin-bottom:4px' }, 'Minutes · last 7 days'), h('div', { html: s + '</svg>' }));
  }

  /* Timer: stores the real end time, so it stays right if the phone locks or you switch apps. */
  function startFocus(task) {
    const p = state.prefs, now = Date.now();
    commit(s => { s.timer = { phase: 'focus', task: task.text, taskId: task.id, taskDate: L.istDate(), focus: p.focus, brk: p.brk, durMs: p.focus * 60000, endTs: now + p.focus * 60000, paused: false, remaining: 0 }; });
    keepAwake(true);
  }
  function startBreak() {
    commit(s => { const t = s.timer; if (!t) return; if (!t.brk) { s.timer = null; return; } Object.assign(t, { phase: 'break', durMs: t.brk * 60000, endTs: Date.now() + t.brk * 60000, paused: false, remaining: 0 }); });
  }
  function remainingMs(t) { return t.paused ? t.remaining : t.endTs - Date.now(); }
  function checkTimer() {
    const t = state.timer; if (!t || t.paused || (t.phase !== 'focus' && t.phase !== 'break')) return;
    if (t.endTs - Date.now() > 0) return;
    if (t.phase === 'focus') {
      commit(s => { s.sessions.push({ id: L.uid(), date: L.istDate(t.endTs), task: t.task, minutes: t.focus, ts: t.endTs }); s.timer.phase = 'done-focus'; });
    } else commit(s => { s.timer.phase = 'done-break'; });
    chime(); keepAwake(false);
  }
  function renderOverlay() {
    const o = $('overlay'), t = state.timer;
    if (!t) { o.hidden = true; o.replaceChildren(); return; }
    o.hidden = false; o.className = 'overlay' + (t.phase === 'break' || t.phase === 'done-break' ? ' brk' : '');
    o.replaceChildren();
    if (t.phase === 'focus' || t.phase === 'break') {
      const rem = remainingMs(t);
      const label = t.phase === 'focus' ? 'FOCUS · ' + t.focus + ' MIN' : 'BREAK · ' + t.brk + ' MIN';
      o.append(h('div', { class: 'mono phase' }, t.paused ? 'Paused' : label),
        h('div', { id: 'ring-host', html: ringSVG(rem / t.durMs, mmss(rem), t.paused ? 'PAUSED' : t.phase === 'focus' ? 'STAY WITH IT' : 'STRETCH · WATER', t.phase === 'break') }),
        h('div', { class: 'task-name' }, t.phase === 'focus' ? t.task : 'Break time'),
        h('div', { class: 'btns' },
          h('button', { class: 'btn pop', onclick: () => commit(s => { const x = s.timer; if (x.paused) { x.endTs = Date.now() + x.remaining; x.paused = false; } else { x.remaining = x.endTs - Date.now(); x.paused = true; } }) }, t.paused ? 'Resume' : 'Pause'),
          h('button', { class: 'btn', onclick: stopTimer }, t.phase === 'focus' ? 'Stop' : 'Skip break')));
    } else if (t.phase === 'done-focus') {
      o.append(h('div', { class: 'mono phase' }, "Time's up · " + t.focus + ' min logged'),
        h('div', { class: 'poster', style: 'font-size:56px;line-height:.9;text-align:center' }, 'NICE WORK'),
        h('div', { class: 'task-name' }, 'Done with this task?', h('div', { style: 'font-size:20px;opacity:.75;margin-top:6px' }, t.task)),
        h('div', { class: 'btns' },
          h('button', { class: 'btn primary', onclick: () => { if (t.taskId) commit(s => { const day = L.ensureDay(s, t.taskDate); const x = day.tasks.find(k => k.id === t.taskId); if (x) x.done = true; }); toast('Ticked off'); startBreak(); } }, 'Yes, tick it'),
          h('button', { class: 'btn', onclick: startBreak }, 'Not yet')));
    } else {
      o.append(h('div', { class: 'mono phase' }, "Break's over"),
        h('div', { class: 'poster', style: 'font-size:56px;line-height:.9;text-align:center' }, 'BACK TO IT?'),
        h('div', { class: 'btns', style: 'flex-direction:column' },
          h('button', { class: 'btn pop', onclick: () => { const nt = nextTask(L.istDate()); const task = t.taskId && L.dayTasks(state, t.taskDate).some(k => k.id === t.taskId && !k.done) ? { id: t.taskId, text: t.task } : nt ? { id: nt.id, text: nt.text } : { id: null, text: t.task }; unlockAudio(); startFocus(task); } }, 'Start next focus'),
          h('button', { class: 'btn', onclick: () => commit(s => { s.timer = null; }) }, 'Close')));
    }
  }
  function stopTimer() {
    const t = state.timer; if (!t) return;
    if (t.phase === 'focus') {
      const done = Math.floor((t.durMs - remainingMs(t)) / 60000);
      commit(s => { if (done >= 1) s.sessions.push({ id: L.uid(), date: L.istDate(), task: t.task, minutes: done, ts: Date.now() }); s.timer = null; });
      toast(done >= 1 ? done + ' min logged' : 'Stopped');
    } else commit(s => { s.timer = null; });
    keepAwake(false);
  }
  setInterval(() => {
    const t = state.timer;
    if (t && (t.phase === 'focus' || t.phase === 'break') && !t.paused) {
      checkTimer();
      const host = $('ring-host'), cur = state.timer;
      if (host && cur && (cur.phase === 'focus' || cur.phase === 'break')) { const rem = remainingMs(cur); host.innerHTML = ringSVG(rem / cur.durMs, mmss(rem), cur.phase === 'focus' ? 'STAY WITH IT' : 'STRETCH · WATER', cur.phase === 'break'); }
    }
    const nowDay = L.istDate();
    if (nowDay !== lastToday) { if (viewDate === lastToday) viewDate = nowDay; lastToday = nowDay; render(); }
  }, 250);

  /* ================= SYLLABUS ================= */
  function renderSyllabus() {
    const v = $('v-syllabus'); v.replaceChildren();
    v.append(h('div', { class: 'head' }, h('div', null, h('div', { class: 'mono' }, 'Syllabus'), h('div', { class: 'date-big poster' }, 'Chapters'))));
    for (const g of L.SYLLABUS) {
      const pct = Math.round(L.subjectProgress(state, g) * 100);
      const card = h('div', { class: 'subject' },
        h('div', { class: 'subj-head' }, h('span', { class: 'poster' }, g.subject), h('span', { class: 'mono', style: 'font-size:13px' }, pct + '% done')),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': g.subject + ' progress' }, h('div', { style: 'width:' + pct + '%' })),
        h('div', { class: 'legend' }, h('span', null, 'Learn'), h('span', null, 'NCERT'), h('span', null, 'Revise')));
      const rows = g.chapters.map((name, i) => ({ name, i, id: L.chapId(g.subject, name) }))
        .sort((a, b) => ((L.chapTicks(state.syllabus[a.id]) === 0 ? 0 : 1) - (L.chapTicks(state.syllabus[b.id]) === 0 ? 0 : 1)) || a.i - b.i);
      for (const r of rows) {
        const e = state.syllabus[r.id] || { l: false, n: false, r: false, note: '' }, zero = L.chapTicks(e) === 0;
        card.append(h('div', { class: 'chap' },
          h('button', { class: 'nm', onclick: () => openNote(r.id, r.name) }, h('span', null, r.name, zero ? h('span', { class: 'pending' }, 'PENDING') : null), e.note ? h('span', { class: 'note' }, '✎ ' + e.note) : null),
          ['l', 'n', 'r'].map((k, j) => h('button', { class: 'tick', 'aria-pressed': String(!!e[k]), 'aria-label': r.name + ': ' + ['Learned', 'NCERT done', 'Revised'][j],
            onclick: () => commit(s => { const x = s.syllabus[r.id] || (s.syllabus[r.id] = { l: false, n: false, r: false, note: '' }); x[k] = !x[k]; }) }, e[k] ? '✓' : ''))));
      }
      v.append(card);
    }
  }
  function openNote(id, name) {
    const e = state.syllabus[id] || {}, ta = h('textarea', { rows: '3', maxlength: '200', placeholder: 'Weak in numericals. Redo examples 3 to 5.' }); ta.value = e.note || '';
    sheet(h('h2', null, name), ta,
      h('div', { class: 'row2' }, h('button', { class: 'btn', onclick: closeSheet }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => { const val = ta.value.trim(); closeSheet(); commit(s => { const x = s.syllabus[id] || (s.syllabus[id] = { l: false, n: false, r: false, note: '' }); x.note = val; }); } }, 'Save note')));
    setTimeout(() => ta.focus(), 50);
  }

  /* ================= QUIZ ================= */
  const CHAPTERS = [...new Set(QUESTIONS.map(q => q.chapter))];
  let quiz = { mode: 'pick', chapter: CHAPTERS[0] || null, list: [], i: 0, score: 0, picked: null, kind: 'quick' };
  function mistakeQs() { const m = state.quiz.mistakes; return QUESTIONS.filter(q => m[L.qid(q)]); }
  function startQuiz(kind) {
    const pool = kind === 'mistakes' ? mistakeQs() : QUESTIONS.filter(q => q.chapter === quiz.chapter);
    if (!pool.length) { toast(kind === 'mistakes' ? 'No mistakes to retry' : 'No questions in this chapter yet'); return; }
    quiz = Object.assign(quiz, { mode: 'run', kind, list: L.shuffle(pool).slice(0, kind === 'mistakes' ? pool.length : 10), i: 0, score: 0, picked: null });
    render(); scrollTo(0, 0);
  }
  function renderQuiz() {
    const v = $('v-quiz'); v.replaceChildren();
    const mCount = mistakeQs().length;
    if (quiz.mode === 'pick') {
      v.append(h('div', { class: 'head' }, h('div', null, h('div', { class: 'mono' }, 'Quiz'), h('div', { class: 'date-big poster' }, 'Test yourself'))));
      if (!CHAPTERS.length) { v.append(h('div', { class: 'empty' }, 'No questions loaded. Add some to questions.js.')); return; }
      v.append(h('div', { class: 'mono' }, 'Pick a chapter'), h('div', { class: 'chaplist' }, CHAPTERS.map(c => {
        const n = QUESTIONS.filter(q => q.chapter === c).length, mm = mistakeQs().filter(q => q.chapter === c).length;
        return h('button', { class: 'chapbtn', 'aria-pressed': String(quiz.chapter === c), onclick: () => { quiz.chapter = c; render(); } },
          h('span', null, c), h('span', { class: 'mono' }, n + ' Q' + (mm ? ' · ' + mm + ' to fix' : '')));
      })));
      v.append(h('button', { class: 'go', style: 'justify-content:center', onclick: () => startQuiz('quick') }, h('span', { class: 'poster' }, 'QUICK 10 →')));
      v.append(mCount ? h('button', { class: 'btn danger', onclick: () => startQuiz('mistakes') }, 'Retry my mistakes (' + mCount + ')')
        : h('div', { class: 'yday' }, 'No mistakes saved. Wrong answers will appear here to retry.'));
      v.append(h('div', { class: 'yday' }, 'A question leaves your mistakes after you get it right twice.'));
    } else if (quiz.mode === 'run') {
      const q = quiz.list[quiz.i], answered = quiz.picked != null, right = answered && quiz.picked === q.answer;
      const card = h('div', { class: 'qcard' },
        h('div', { class: 'qnum mono' }, h('span', null, 'Q ' + (quiz.i + 1) + ' / ' + quiz.list.length), h('span', null, quiz.kind === 'mistakes' ? 'Mistakes' : q.chapter)),
        h('div', { class: 'qtext' }, q.q),
        q.options.map((op, k) => h('button', { class: 'opt' + (answered && k === q.answer ? ' right' : '') + (answered && k === quiz.picked && k !== q.answer ? ' wrong' : ''), disabled: answered,
          onclick: () => { quiz.picked = k; if (k === q.answer) quiz.score++; commit(s => L.recordAnswer(s, L.qid(q), k === q.answer)); } },
          h('span', { class: 'k' }, 'ABCD'[k]), h('span', null, op))));
      if (answered) card.append(...[h('div', { class: 'verdict', style: 'color:' + (right ? 'var(--done)' : 'var(--warn)') }, right ? 'RIGHT!' : 'NOT QUITE'),
        right ? null : h('div', { class: 'explain' }, 'Correct: ' + 'ABCD'[q.answer] + '. ' + q.options[q.answer]),
        h('div', { class: 'explain', style: 'color:var(--mut)' }, q.explain || '')].filter(Boolean));
      v.append(h('div', { class: 'head' }, h('div', null, h('div', { class: 'mono' }, 'Score ' + quiz.score), h('div', { class: 'date-big poster' }, quiz.kind === 'mistakes' ? 'Fix mistakes' : 'Quick 10')),
        h('button', { class: 'addbtn', onclick: () => { quiz.mode = 'pick'; render(); } }, 'QUIT')), card);
      if (answered) v.append(h('button', { class: 'go', style: 'justify-content:center', onclick: () => { if (quiz.i + 1 < quiz.list.length) { quiz.i++; quiz.picked = null; } else quiz.mode = 'end'; render(); scrollTo(0, 0); } },
        h('span', { class: 'poster' }, quiz.i + 1 < quiz.list.length ? 'NEXT →' : 'SEE SCORE →')));
    } else {
      const n = quiz.list.length, pct = quiz.score / n;
      v.append(h('div', { class: 'head' }, h('div', null, h('div', { class: 'mono' }, quiz.kind === 'mistakes' ? 'Mistakes round' : quiz.chapter), h('div', { class: 'date-big poster' }, 'Your score'))),
        h('div', { class: 'qcard', style: 'align-items:center' }, h('div', { class: 'score poster' }, quiz.score + '/' + n),
          h('div', { class: 'explain', style: 'text-align:center' }, pct === 1 ? 'Perfect. Nothing to fix.' : pct >= .7 ? 'Solid. Retry the ones you missed.' : 'Good that you found these now, not in the exam.')));
      if (mCount) v.append(h('button', { class: 'btn danger', onclick: () => startQuiz('mistakes') }, 'Retry my mistakes (' + mCount + ')'));
      v.append(h('div', { class: 'row2' }, h('button', { class: 'btn', onclick: () => { quiz.mode = 'pick'; render(); } }, 'Pick chapter'), h('button', { class: 'btn primary', onclick: () => startQuiz('quick') }, 'Another 10')));
    }
  }

  /* ================= SHEETS & SETTINGS ================= */
  function sheet(...kids) {
    const w = $('sheet'); w.replaceChildren(h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, kids)); w.hidden = false;
    w.onclick = e => { if (e.target === w) closeSheet(); };
  }
  function closeSheet() { $('sheet').hidden = true; $('sheet').replaceChildren(); }
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

  function openSettings() {
    let draft = state.events.map(e => Object.assign({}, e));
    const list = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }), err = h('div', { class: 'err', role: 'alert' });
    const drawEvents = () => {
      list.replaceChildren(...draft.map((e, i) => h('div', { class: 'ev-row' },
        h('input', { value: e.name, 'aria-label': 'Event name', maxlength: '40', oninput: ev => { draft[i].name = ev.target.value; } }),
        h('input', { type: 'date', value: e.date, 'aria-label': 'Event date', onchange: ev => { draft[i].date = ev.target.value; } }),
        h('button', { class: 'x', 'aria-label': 'Remove ' + e.name, onclick: () => { draft.splice(i, 1); drawEvents(); } }, '×'))));
    };
    drawEvents();
    let resetArmed = false, importArmed = null;
    const resetBtn = h('button', { class: 'btn danger', onclick: () => {
      if (!resetArmed) { resetArmed = true; resetBtn.classList.add('armed'); resetBtn.textContent = 'Tap again to erase everything'; return; }
      closeSheet(); commit(s => { const d = L.defaultState(); Object.keys(s).forEach(k => delete s[k]); Object.assign(s, d); }); viewDate = L.istDate(); toast('Everything reset');
    } }, 'Reset everything');
    const fileIn = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: async ev => {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      try { const data = JSON.parse(await f.text()); if (!L.validState(data)) throw 0; importArmed = data; importBtn.textContent = 'Tap again to replace all data with this backup'; importBtn.classList.add('armed'); importBtn.classList.add('danger'); }
      catch (e) { err.textContent = "That file isn't an Exam Pass backup."; }
      ev.target.value = '';
    } });
    const importBtn = h('button', { class: 'btn', onclick: () => {
      if (!importArmed) { fileIn.click(); return; }
      const data = importArmed; closeSheet(); commit(s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, data); }); toast('Backup restored');
    } }, 'Import backup');
    sheet(h('h2', null, 'Settings'),
      h('div', { class: 'mono' }, 'Exams and practicals'), list,
      h('button', { class: 'addbtn', onclick: () => { draft.push({ id: L.uid(), name: '', date: L.istDate() }); drawEvents(); } }, '+ ADD EVENT'),
      err,
      h('button', { class: 'btn primary', onclick: () => {
        for (const e of draft) { e.name = (e.name || '').trim(); if (!e.name) { err.textContent = 'Every event needs a name.'; return; } if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) { err.textContent = 'Every event needs a date.'; return; } }
        closeSheet(); commit(s => { s.events = draft; }); toast('Dates saved');
      } }, 'Save dates'),
      h('div', { class: 'mono', style: 'margin-top:8px' }, 'Backup'),
      h('div', { class: 'row2' },
        h('button', { class: 'btn', onclick: () => {
          const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'exam-pass-backup-' + L.istDate() + '.json' }); document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Backup file saved');
        } }, 'Export backup'), importBtn), fileIn,
      h('div', { class: 'mono', style: 'margin-top:8px' }, 'Danger zone'), resetBtn,
      h('button', { class: 'btn', onclick: closeSheet }, 'Close'));
  }

  /* ---------- Coming back to the app ---------- */
  // Only redraw when something really changed, so a half-typed task or note survives switching apps.
  function resync() {
    let changed = false;
    const s = read(); if (s && s.updated > state.updated) { state = s; changed = true; }
    const nowDay = L.istDate(); if (nowDay !== lastToday) { if (viewDate === lastToday) viewDate = nowDay; lastToday = nowDay; changed = true; }
    if (state.timer) { checkTimer(); changed = true; }
    if (changed) render();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
  addEventListener('pageshow', resync);
  addEventListener('storage', e => { if (e.key === KEY) resync(); });

  checkTimer();
  render();
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
