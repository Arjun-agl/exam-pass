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
  function read() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (!L.validState(s)) return null; if (L.migrate(s)) localStorage.setItem(KEY, JSON.stringify(s)); return s; } catch (e) { return null; } }
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
    for (const v of ['today', 'focus', 'syllabus', 'quiz', 'library']) $('v-' + v).hidden = v !== t;
    if (t === 'library') { if (lib.status === 'idle') loadLibrary(); else if (lib.status === 'ready') refreshManifest(); }
    render(); scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  function render() {
    const needSetup = !state.profile;
    $('v-setup').hidden = !needSetup; document.querySelector('.tabbar').hidden = needSetup;
    for (const v of ['today', 'focus', 'syllabus', 'quiz', 'library']) $('v-' + v).hidden = needSetup || v !== tab;
    if (needSetup) { renderSetup(); renderOverlay(); return; }
    if (tab === 'today') renderToday(); else if (tab === 'focus') renderFocus(); else if (tab === 'syllabus') renderSyllabus(); else if (tab === 'library') renderLibrary(); else renderQuiz();
    renderOverlay();
    saveUI();
  }

  /* ---------- Remember where you were ----------
     Phones often close a backgrounded web app; this puts you back on the same tab, day, quiz question and subject. */
  const UIKEY = 'exam-pass-ui';
  let restoreY = 0;
  // Save the scroll spot too when the app goes into the background.
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveUI(); });
  addEventListener('pagehide', saveUI);
  function saveUI() {
    try {
      const q = quiz;
      localStorage.setItem(UIKEY, JSON.stringify({ t: Date.now(), day: L.istDate(), tab, viewDate, y: Math.round(scrollY),
        libSubject: lib.subject,
        quiz: q.mode === 'pick' ? { mode: 'pick', chapter: q.chapter } : { mode: q.mode, kind: q.kind, chapter: q.chapter, ids: q.list.map(L.qid), i: q.i, score: q.score, picked: q.picked } }));
    } catch (e) {}
  }
  function restoreUI() {
    let u; try { u = JSON.parse(localStorage.getItem(UIKEY)); } catch (e) {}
    if (!u || Date.now() - u.t > 12 * 3600e3) return;
    restoreY = u.y || 0;
    if (['today', 'focus', 'syllabus', 'quiz', 'library'].includes(u.tab)) tab = u.tab;
    if (u.day === L.istDate() && /^\d{4}-\d{2}-\d{2}$/.test(u.viewDate || '')) viewDate = u.viewDate;
    if (u.libSubject) lib.subject = u.libSubject;
    const q = u.quiz;
    if (q && CHAPTERS.includes(q.chapter)) quiz.chapter = q.chapter;
    if (q && q.mode !== 'pick' && Array.isArray(q.ids)) {
      const byId = new Map(QUESTIONS.map(x => [L.qid(x), x])), list = q.ids.map(id => byId.get(id));
      if (list.length && list.every(Boolean) && q.i >= 0 && q.i < list.length) Object.assign(quiz, { mode: q.mode === 'end' ? 'end' : 'run', kind: q.kind, list, i: q.i, score: q.score || 0, picked: q.picked == null ? null : q.picked });
    }
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
      L.goalName(state)
        ? h('div', { class: 'stat dark' }, h('span', { html: SVG.flame }), h('div', null, h('div', { class: 'big poster' }, st + (st === 1 ? ' DAY' : ' DAYS')), h('div', { class: 'mono' }, L.goalName(state) + ' streak')))
        : h('button', { class: 'stat dark', style: 'text-align:left', onclick: openSettings }, h('span', { html: SVG.flame }), h('div', null, h('div', { class: 'big poster', style: 'font-size:18px' }, 'NO GOAL EXAM'), h('div', { class: 'mono' }, 'Set one in settings'))),
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
    const p = L.planSource(state);
    if (isToday && p && !Object.keys(p.days).length) v.append(h('div', { class: 'lockcard' },
      h('div', { class: 'poster', style: 'font-size:24px' }, 'GET YOUR PERSONAL PLAN'),
      h('div', null, 'Fill a short form about your exams, time and chapters, and send it. You get back a plan code that fills this page day by day.'),
      h('div', { class: 'row2' }, h('button', { class: 'btn primary', onclick: openRequest }, 'Request a plan'), h('button', { class: 'btn', onclick: openImportPlan }, 'I have a code'))));
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
    for (const g of L.subjectGroups(state)) {
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
          h('button', { class: 'nm', onclick: () => openNote(r.id, r.name) }, h('span', null, h('span', { class: 'cn' }, 'CH ' + (r.i + 1)), r.name, zero ? h('span', { class: 'pending' }, 'PENDING') : null), e.note ? h('span', { class: 'note' }, '✎ ' + e.note) : null),
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

  /* ================= LIBRARY =================
     Files on GitHub are scrambled (AES-GCM, key from the library code via PBKDF2).
     After the code is entered once, every file is unscrambled and kept on this device (IndexedDB), so it works offline. */
  const KINDS = { notes: 'Notes', revision: 'Revision notes', worksheet: 'Worksheet' };
  const KINDS_FOR = s => s === 'Maths' ? ['revision', 'worksheet'] : ['notes', 'revision', 'worksheet'];
  const idb = (() => {
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('exam-pass-library', 1); r.onupgradeneeded = () => { r.result.createObjectStore('files'); r.result.createObjectStore('meta'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const op = async (store, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const tx = d.transaction(store, mode); const rq = fn(tx.objectStore(store)); tx.oncomplete = () => res(rq ? rq.result : undefined); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); };
    return { get: (s, k) => op(s, 'readonly', o => o.get(k)), put: (s, k, v) => op(s, 'readwrite', o => o.put(v, k)), del: (s, k) => op(s, 'readwrite', o => o.delete(k)), all: s => op(s, 'readonly', o => o.getAllKeys()) };
  })();
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  let lib = { status: 'idle', manifest: null, key: null, have: {}, subject: 'Physics', err: '', sync: null, offline: false };
  async function loadLibrary() {
    lib.status = 'loading'; render();
    let m = null;
    try { const r = await fetch('library/manifest.json', { cache: 'no-cache' }); if (!r.ok) throw 0; m = await r.json(); await idb.put('meta', 'manifest', m); lib.offline = false; }
    catch (e) { try { m = await idb.get('meta', 'manifest'); } catch (x) {} lib.offline = true; }
    if (!m || !m.kdf) { lib.status = 'error'; lib.err = "Couldn't load the library. Connect to the internet once, then try again."; render(); return; }
    lib.manifest = m;
    let key = null, salt = null; try { key = await idb.get('meta', 'key'); salt = await idb.get('meta', 'salt'); } catch (e) {}
    if (!key || salt !== m.kdf.salt) { lib.status = 'locked'; render(); return; }
    lib.key = key; lib.status = 'ready'; await refreshHave(); render(); syncFiles();
  }
  // Quietly pick up files added since last time.
  async function refreshManifest() {
    try {
      const r = await fetch('library/manifest.json', { cache: 'no-cache' }); if (!r.ok) return; const m = await r.json();
      if (JSON.stringify(m) === JSON.stringify(lib.manifest)) { syncFiles(); return; }
      await idb.put('meta', 'manifest', m); lib.manifest = m;
      if (m.kdf.salt !== (await idb.get('meta', 'salt'))) { lib.status = 'locked'; lib.key = null; render(); return; }
      render(); syncFiles();
    } catch (e) {}
  }
  async function refreshHave() { lib.have = {}; try { for (const id of await idb.all('files')) { const f = await idb.get('files', id); if (f) lib.have[id] = f.iv; } } catch (e) {} }
  async function unlockLibrary(code, errEl, btn) {
    const m = lib.manifest; btn.disabled = true; btn.textContent = 'Unlocking…';
    try {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(m.kdf.salt), iterations: m.kdf.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(m.check.iv) }, key, b64(m.check.ct));
      if (new TextDecoder().decode(pt) !== 'exam-pass-library') throw 0;
      await idb.put('meta', 'key', key); await idb.put('meta', 'salt', m.kdf.salt);
      lib.key = key; lib.status = 'ready'; await refreshHave(); render(); toast('Library unlocked on this device'); syncFiles();
    } catch (e) { errEl.textContent = "That's not the library code."; btn.disabled = false; btn.textContent = 'Unlock library'; }
  }
  // Download and unscramble every file this device doesn't have yet (or that changed), and drop removed ones.
  async function syncFiles() {
    if (lib.sync || !lib.key || !lib.manifest) return;
    const files = lib.manifest.files || [], want = new Set(files.map(f => f.id));
    for (const id of Object.keys(lib.have)) if (!want.has(id)) { try { await idb.del('files', id); } catch (e) {} delete lib.have[id]; }
    const todo = files.filter(f => lib.have[f.id] !== f.iv);
    if (!todo.length) { render(); return; }
    lib.sync = { done: 0, total: todo.length, failed: 0 }; render();
    for (const f of todo) {
      try {
        const r = await fetch('library/files/' + f.id + '.bin', { cache: 'no-cache' }); if (!r.ok) throw 0;
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(f.iv) }, lib.key, await r.arrayBuffer());
        await idb.put('files', f.id, { iv: f.iv, blob: new Blob([pt], { type: 'application/pdf' }), size: pt.byteLength });
        lib.have[f.id] = f.iv;
      } catch (e) { lib.sync.failed++; }
      lib.sync.done++; if (tab === 'library') render();
    }
    const failed = lib.sync.failed; lib.sync = null; render();
    if (failed) toast(failed + (failed === 1 ? " file couldn't" : " files couldn't") + ' be saved. Open the Library online to retry.');
  }
  async function openFile(f, save) {
    let rec = null; try { rec = await idb.get('files', f.id); } catch (e) {}
    if (!rec || rec.iv !== f.iv) { toast('Still saving this file. Try again in a moment.'); syncFiles(); return; }
    const url = URL.createObjectURL(rec.blob);
    const a = h('a', { href: url, target: '_blank', rel: 'noopener' });
    if (save) a.setAttribute('download', (f.subject + ' Ch' + f.ch + ' ' + (f.chapter || '') + ' - ' + KINDS[f.kind]).replace(/[\\/:*?"<>|]+/g, '') + '.pdf');
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // Save a copy to the phone: iPhone/iPad get the Share sheet ("Save to Files"); everything else downloads it.
  async function saveFile(f) {
    let rec = null; try { rec = await idb.get('files', f.id); } catch (e) {}
    if (!rec || rec.iv !== f.iv) { toast('Still saving this file. Try again in a moment.'); syncFiles(); return; }
    const fname = f.subject + ' Ch' + f.ch + ' ' + (f.chapter || '') + ' - ' + KINDS[f.kind];
    const name = fname.replace(/[\\/:*?"<>|]+/g, '').trim() + '.pdf';
    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const file = new File([rec.blob], name, { type: 'application/pdf' });
    if (isApple && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); } catch (e) { /* closed the sheet */ }
      return;
    }
    const url = URL.createObjectURL(rec.blob), a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('Saved to Downloads');
  }
  const mb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function renderLibrary() {
    const v = $('v-library'); v.replaceChildren();
    v.append(h('div', { class: 'head' }, h('div', null, h('div', { class: 'mono' }, 'Library'), h('div', { class: 'date-big poster' }, 'Notes & sheets'))));
    if (lib.status === 'idle' || lib.status === 'loading') { v.append(h('div', { class: 'empty' }, 'Opening the library…')); return; }
    if (lib.status === 'error') { v.append(h('div', { class: 'empty' }, lib.err), h('button', { class: 'btn', onclick: loadLibrary }, 'Try again')); return; }
    if (lib.status === 'locked') {
      const inp = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Library code', maxlength: '32' }), err = h('div', { class: 'err', role: 'alert' });
      const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Unlock library');
      v.append(h('form', { class: 'lockcard', onsubmit: e => { e.preventDefault(); if (!inp.value) { err.textContent = 'Type the library code.'; return; } unlockLibrary(inp.value, err, btn); } },
        h('div', { class: 'poster', style: 'font-size:26px' }, 'LOCKED'),
        h('div', null, 'Your notes and worksheets are private. Enter the library code once and everything is saved on this phone, so you can read it offline.'),
        inp, err, btn));
      if (lib.offline) v.append(h('div', { class: 'yday' }, 'You seem to be offline. Connect once to unlock and save the files.'));
      setTimeout(() => inp.focus(), 50);
      return;
    }
    const files = (lib.manifest.files || []);
    const subs = L.streamSubjects(state); if (!subs.includes(lib.subject)) lib.subject = subs[0];
    v.append(h('div', { class: 'seg', role: 'group', 'aria-label': 'Subject', style: 'grid-template-columns:repeat(' + subs.length + ',1fr)' }, subs.map(s => h('button', { 'aria-pressed': String(lib.subject === s), onclick: () => { lib.subject = s; render(); } }, (subs.length > 3 && s === 'Chemistry' ? 'CHEM' : s.toUpperCase())))));
    const saved = files.filter(f => lib.have[f.id] === f.iv).length;
    if (lib.sync) v.append(h('div', { class: 'libnote' }, 'Saving ' + lib.sync.done + ' of ' + lib.sync.total + '…', h('span', { class: 'meter' }, h('div', { style: 'width:' + Math.round(lib.sync.done / lib.sync.total * 100) + '%' }))));
    else v.append(h('div', { class: 'libnote' }, files.length ? (saved === files.length ? '✓ ' + (files.length === 1 ? '1 file' : 'All ' + files.length + ' files') + ' saved on this phone' : saved + ' of ' + files.length + ' saved · open online to finish') : 'No files added yet. They will appear here.'));
    const group = L.SYLLABUS.find(g => g.subject === lib.subject), kinds = KINDS_FOR(lib.subject);
    group.chapters.forEach((name, i) => {
      const ch = i + 1;
      v.append(h('div', { class: 'libchap' },
        h('div', { class: 'nm' }, h('span', { class: 'cn' }, 'CH ' + ch), name),
        h('div', { class: 'kinds' }, kinds.map(k => {
          const f = files.find(x => x.subject === lib.subject && x.ch === ch && x.kind === k);
          if (!f) return h('div', { class: 'kbtn missing' }, h('span', { class: 'k1' }, KINDS[k]), h('span', { class: 'k2' }, 'NOT ADDED YET'));
          const ready = lib.have[f.id] === f.iv, ff = Object.assign({ chapter: name }, f);
          return h('div', { class: 'kwrap' },
            h('button', { class: 'kbtn' + (ready ? '' : ' wait'), onclick: () => openFile(ff) },
              h('span', { class: 'k1' }, KINDS[k]), h('span', { class: 'k2' }, (ready ? '✓ OFFLINE · ' : 'SAVING · ') + mb(f.size))),
            h('button', { class: 'ksave' + (ready ? '' : ' wait'), 'aria-label': 'Save ' + KINDS[k] + ' for ' + name + ' to your phone', title: 'Save to phone', onclick: () => saveFile(ff),
              html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>' }));
        }))));
    });
    if (files.length) v.append(h('div', { class: 'yday' }, 'Tap a file to read it. Tap ⤓ next to it to save a copy to your phone.'));
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
      try { const data = JSON.parse(await f.text()); if (!L.validState(data)) throw 0; L.migrate(data); importArmed = data; importBtn.textContent = 'Tap again to replace all data with this backup'; importBtn.classList.add('armed'); importBtn.classList.add('danger'); }
      catch (e) { err.textContent = "That file isn't an Exam Pass backup."; }
      ev.target.value = '';
    } });
    const importBtn = h('button', { class: 'btn', onclick: () => {
      if (!importArmed) { fileIn.click(); return; }
      const data = importArmed; closeSheet(); commit(s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, data); }); toast('Backup restored');
    } }, 'Import backup');
    const pr = state.profile || {}, p = L.planSource(state);
    const planLabel = !p ? 'Built-in plan' : Object.keys(p.days).length ? 'Plan ' + (p.name ? 'for ' + p.name : 'imported') + (p.imported ? ' · ' + L.short(p.imported) : '') : 'No plan yet';
    sheet(h('h2', null, 'Settings'),
      h('div', { class: 'mono' }, 'You'),
      h('div', { class: 'qcard', style: 'gap:6px' },
        h('div', { style: 'font-size:20px' }, (pr.name || 'Student') + ' · ' + (pr.stream || 'PCM') + (pr.extra ? ' + ' + pr.extra : '')),
        h('div', { style: 'color:var(--mut)' }, 'Goal exam: ' + ((pr.goal && pr.goal.name) || 'none') + (pr.goal && pr.goal.date ? ' · ' + L.short(pr.goal.date) : '')),
        h('button', { class: 'btn', onclick: () => { closeSheet(); openProfile(); } }, 'Edit stream and goal')),
      h('div', { class: 'mono', style: 'margin-top:8px' }, 'Your plan · ' + planLabel),
      h('div', { class: 'row2' }, h('button', { class: 'btn primary', onclick: () => { closeSheet(); openRequest(); } }, 'Request a plan'), h('button', { class: 'btn', onclick: () => { closeSheet(); openImportPlan(); } }, 'Import plan code')),
      h('div', { class: 'mono', style: 'margin-top:8px' }, 'Exams and practicals'), list,
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

  /* ================= PROFILE, SETUP, PLAN REQUESTS ================= */
  function copyText(text, label) {
    const fallback = () => { const ta = h('textarea', { readonly: true, style: 'position:fixed;top:0;left:0;opacity:0' }); ta.value = text; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); toast(ok ? label + ' copied' : 'Copy blocked. Select the text and copy it by hand.'); };
    try { navigator.clipboard.writeText(text).then(() => toast(label + ' copied'), fallback); } catch (e) { fallback(); }
  }
  const chips = (opts, cur, onPick, labelOf) => h('div', { class: 'presets' }, opts.map(o => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(o === cur), onclick: () => onPick(o) }, labelOf ? labelOf(o) : o)));
  // Shared by first-time setup and "Edit stream and goal".
  function profileForm(initial, saveLabel, onSave) {
    const d = JSON.parse(JSON.stringify(initial || { name: '', stream: 'PCM', extra: '', goal: { name: '', date: '' } }));
    d.goal = d.goal || { name: '', date: '' };
    const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:12px' }), err = h('div', { class: 'err', role: 'alert' });
    const draw = () => {
      const otherGoal = d.goal.name && !L.GOALS.includes(d.goal.name);
      const otherExtra = d.extra && !L.EXTRAS.includes(d.extra);
      wrap.replaceChildren(
        h('label', null, h('div', { class: 'mono', style: 'margin-bottom:6px' }, 'Your name'), h('input', { value: d.name || '', maxlength: '40', placeholder: 'Riya', autocomplete: 'given-name', oninput: e => { d.name = e.target.value; } })),
        h('div', null, h('div', { class: 'mono', style: 'margin-bottom:6px' }, 'Stream'), chips(['PCM', 'PCB', 'PCMB'], d.stream, o => { d.stream = o; draw(); })),
        h('div', null, h('div', { class: 'mono', style: 'margin-bottom:6px' }, 'Other subject (English is always included)'),
          chips(['None', ...L.EXTRAS, 'Other'], !d.extra ? 'None' : otherExtra || d.extra === '__other' ? 'Other' : d.extra, o => { d.extra = o === 'None' ? '' : o === 'Other' ? '__other' : o; draw(); }),
          (otherExtra || d.extra === '__other') ? h('input', { style: 'margin-top:6px', placeholder: 'Subject name', value: d.extra === '__other' ? '' : d.extra, maxlength: '40', oninput: e => { d.extra = e.target.value || '__other'; } }) : null),
        h('div', null, h('div', { class: 'mono', style: 'margin-bottom:6px' }, 'Goal exam (for your daily streak)'),
          chips(['None', ...L.GOALS, 'Other'], !d.goal.name ? 'None' : otherGoal || d.goal.name === '__other' ? 'Other' : d.goal.name, o => { d.goal.name = o === 'None' ? '' : o === 'Other' ? '__other' : o; draw(); }),
          (otherGoal || d.goal.name === '__other') ? h('input', { style: 'margin-top:6px', placeholder: 'Exam name', value: d.goal.name === '__other' ? '' : d.goal.name, maxlength: '30', oninput: e => { d.goal.name = e.target.value || '__other'; } }) : null,
          d.goal.name ? h('label', null, h('div', { class: 'mono', style: 'margin:8px 0 4px' }, 'Goal exam date (if you know it)'), h('input', { type: 'date', value: d.goal.date || '', onchange: e => { d.goal.date = e.target.value; } })) : null),
        err,
        h('button', { class: 'btn primary', onclick: () => {
          d.name = (d.name || '').trim();
          if (d.extra === '__other') { err.textContent = 'Type your other subject, or pick None.'; return; }
          if (d.goal.name === '__other') { err.textContent = 'Type your goal exam, or pick None.'; return; }
          d.extra = (d.extra || '').trim(); d.goal.name = (d.goal.name || '').trim(); if (!d.goal.name) d.goal.date = '';
          onSave(d);
        } }, saveLabel));
    };
    draw(); return wrap;
  }
  function renderSetup() {
    const v = $('v-setup'); if (v.dataset.drawn) return; v.dataset.drawn = '1'; v.replaceChildren();
    const restore = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: async ev => {
      const f = ev.target.files && ev.target.files[0]; if (!f) return;
      try { const data = JSON.parse(await f.text()); if (!L.validState(data)) throw 0; L.migrate(data); v.dataset.drawn = ''; commit(s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, data); }); toast('Backup restored'); }
      catch (e) { toast("That file isn't an Exam Pass backup."); }
    } });
    v.append(
      h('div', null, h('div', { class: 'mono' }, 'Welcome'), h('div', { class: 'date-big poster' }, 'Exam Pass')),
      h('div', { style: 'font-size:20px;line-height:1.25' }, 'Your CBSE Class 12 study plan, focus timer, syllabus tracker and quizzes. First, a few things about you.'),
      profileForm(null, 'Start →', d => {
        v.dataset.drawn = '';
        commit(s => L.applyProfile(s, d, true));
        viewDate = L.istDate(); tab = 'today'; toast('All set. Now get your personal plan.');
      }),
      h('button', { class: 'btn', style: 'margin-top:4px', onclick: () => restore.click() }, 'I have a backup file'), restore);
  }
  function openProfile() {
    sheet(h('h2', null, 'Stream and goal'), profileForm(state.profile, 'Save', d => {
      closeSheet(); commit(s => L.applyProfile(s, d, false)); toast('Saved');
    }), h('button', { class: 'btn', onclick: closeSheet }, 'Cancel'));
  }

  // The plan request: a short form that turns into one message to send.
  const EVMAP = { English: [/^english practical/i, /^english exam/i], Physics: [/^physics practical/i, /^physics exam/i], Chemistry: [/^chem(istry)? practical/i, /^chem(istry)? exam/i],
    Maths: [/^maths practical/i, /^maths exam/i], Biology: [/^bio(logy)? practical/i, /^bio(logy)? exam/i], 'Physical Education': [/^pe practical/i, /^(physical education|pe) exam/i] };
  function openRequest() {
    const pr = state.profile || {}, today = L.istDate();
    const subjects = ['English', ...L.streamSubjects(state), ...(pr.extra ? [pr.extra] : [])];
    const evDate = re => { const e = re && state.events.find(x => re.test(x.name)); return e ? e.date : ''; };
    const d = { exams: subjects.map(s => ({ subject: s, prac: evDate((EVMAP[s] || [])[0]), theory: evDate((EVMAP[s] || [])[1]) })),
      hoursSchool: '4', hoursWeekend: '8', commitments: '', best: 'Night', sleep: '23:00', samples: '2', goalDaily: pr.goal && pr.goal.name ? '60' : '0', rest: 'Half Sunday', notes: '' };
    const syl = JSON.parse(JSON.stringify(state.syllabus));
    const err = h('div', { class: 'err', role: 'alert' }), out = h('textarea', { class: 'ta', readonly: true, rows: '8', style: 'font-family:var(--mono);font-size:12px' });
    const outWrap = h('div', { hidden: true, style: 'display:flex;flex-direction:column;gap:8px' });
    const sec = (title, ...kids) => h('div', { class: 'qcard', style: 'gap:10px' }, h('div', { class: 'poster', style: 'font-size:22px' }, title), ...kids);
    const field = (label, el) => h('label', null, h('div', { class: 'mono', style: 'margin-bottom:4px' }, label), el);
    const chipField = (label, opts, key) => { const box = h('div'); const drawC = () => box.replaceChildren(h('div', { class: 'mono', style: 'margin-bottom:4px' }, label), chips(opts, d[key], o => { d[key] = o; drawC(); })); drawC(); return box; };
    const examRows = d.exams.map(x => h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:end' },
      h('div', { style: 'grid-column:span 2;font-size:19px' }, x.subject),
      field('Practical', h('input', { type: 'date', value: x.prac, onchange: e => { x.prac = e.target.value; } })),
      field('Theory exam', h('input', { type: 'date', value: x.theory, onchange: e => { x.theory = e.target.value; } }))));
    const chapBlocks = L.subjectGroups(state).map(g => h('div', null, h('div', { style: 'font-size:19px;margin:4px 0' }, g.subject),
      g.chapters.map((name, i) => {
        const id = L.chapId(g.subject, name), e = syl[id] || (syl[id] = { l: false, n: false, r: false, note: '' }), row = h('div', { class: 'chap' });
        const drawR = () => row.replaceChildren(
          h('div', { class: 'nm', style: 'font-size:16px' }, h('span', null, h('span', { class: 'cn' }, 'CH ' + (i + 1)), name)),
          ...['l', 'n', 'r'].map((k, j) => h('button', { type: 'button', class: 'tick', style: 'width:34px;height:34px', 'aria-pressed': String(!!e[k]), 'aria-label': name + ': ' + ['Learned', 'NCERT done', 'Revised'][j], onclick: () => { e[k] = !e[k]; drawR(); } }, e[k] ? '✓' : '')),
          h('button', { type: 'button', class: 'tick', style: 'width:34px;height:34px;' + (e.weak ? 'background:var(--pop);border-color:var(--ink);color:var(--ink)' : 'color:var(--mut)'), 'aria-pressed': String(!!e.weak), 'aria-label': name + ': weak chapter', onclick: () => { e.weak = !e.weak; drawR(); } }, '★'));
        drawR(); return row;
      })));
    const build = () => {
      const lines = ['EXAM PASS · PLAN REQUEST', 'Sent: ' + today,
        'Name: ' + (pr.name || '-') + ' | Stream: ' + (pr.stream || 'PCM') + ' + English' + (pr.extra ? ' + ' + pr.extra : ''),
        'Goal exam: ' + ((pr.goal && pr.goal.name) || 'none') + (pr.goal && pr.goal.date ? ' on ' + pr.goal.date : ''), '', 'EXAMS'];
      d.exams.forEach(x => lines.push('- ' + x.subject + ': practical ' + (x.prac || '?') + ', theory ' + (x.theory || '?')));
      lines.push('', 'TIME', 'Study hours: school days ' + d.hoursSchool + ' h, weekends/holidays ' + d.hoursWeekend + ' h',
        'Fixed timings: ' + (d.commitments.trim() || '-'), 'Best time: ' + d.best + ' | Sleep: ' + (d.sleep || '-'), '',
        'CHAPTERS (L learned, N NCERT done, R revised, * weak, - not started)');
      L.subjectGroups(state).forEach(g => lines.push(g.subject + ': ' + g.chapters.map((c, i) => { const e = syl[L.chapId(g.subject, c)] || {}; const t = (e.l ? 'L' : '') + (e.n ? 'N' : '') + (e.r ? 'R' : ''); return (i + 1) + (t || '-') + (e.weak ? '*' : ''); }).join(' ')));
      lines.push('', 'PREFERENCES', 'Sample papers per subject: ' + d.samples + ' | Goal exam daily: ' + (d.goalDaily === '0' ? 'none' : d.goalDaily + ' min') + ' | Rest: ' + d.rest,
        'Notes: ' + (d.notes.trim() || '-'));
      return lines.join('\n');
    };
    sheet(h('h2', null, 'Request a plan'),
      h('div', null, 'Fill this in, then send the message it makes. You get back a plan code to paste into Import plan code.'),
      sec('1 · You', h('div', null, (pr.name || 'Student') + ' · ' + (pr.stream || 'PCM') + ' + English' + (pr.extra ? ' + ' + pr.extra : '') + ' · goal: ' + ((pr.goal && pr.goal.name) || 'none')),
        h('button', { class: 'btn', type: 'button', onclick: () => { closeSheet(); openProfile(); } }, 'Change stream or goal first')),
      sec('2 · Exam dates', h('div', { style: 'color:var(--mut)' }, "Leave a date empty if you don't know it yet."), ...examRows),
      sec('3 · Your time',
        h('div', { class: 'row2' }, field('Hours on school days', h('input', { type: 'number', inputmode: 'decimal', min: '0', max: '16', step: '0.5', value: d.hoursSchool, oninput: e => { d.hoursSchool = e.target.value; } })),
          field('Hours on weekends', h('input', { type: 'number', inputmode: 'decimal', min: '0', max: '16', step: '0.5', value: d.hoursWeekend, oninput: e => { d.hoursWeekend = e.target.value; } }))),
        field('School, tuition and other fixed timings', h('textarea', { rows: '2', maxlength: '300', placeholder: 'School 7:30 to 2, tuition Mon Wed Fri 5 to 7', oninput: e => { d.commitments = e.target.value; } })),
        chipField('When you study best', ['Morning', 'Afternoon', 'Night'], 'best'),
        field('Usual sleep time', h('input', { type: 'time', value: d.sleep, onchange: e => { d.sleep = e.target.value; } }))),
      sec('4 · Where you are', h('div', { class: 'legend', style: 'justify-content:space-between' }, h('span', { style: 'width:auto' }, 'Tap: Learn · NCERT · Revise · ★ weak')), ...chapBlocks),
      sec('5 · Preferences',
        chipField('Sample papers per subject before each exam', ['0', '1', '2', '3'], 'samples'),
        chipField('Daily time for your goal exam (minutes)', ['0', '30', '60', '90', '120'], 'goalDaily'),
        chipField('Rest day', ['None', 'Half Sunday', 'Full Sunday'], 'rest'),
        field('Anything else', h('textarea', { rows: '3', maxlength: '500', placeholder: 'Weak in organic. Want to finish Maths first. Holiday 20 to 25 Dec.', oninput: e => { d.notes = e.target.value; } }))),
      err,
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        const h1 = parseFloat(d.hoursSchool), h2 = parseFloat(d.hoursWeekend);
        if (!(h1 >= 0) || !(h2 >= 0)) { err.textContent = 'Fill in your study hours.'; return; }
        if (!d.exams.some(x => x.theory)) { err.textContent = 'Add at least one theory exam date.'; return; }
        err.textContent = '';
        commit(s => { for (const [id, e] of Object.entries(syl)) s.syllabus[id] = Object.assign(s.syllabus[id] || {}, { l: !!e.l, n: !!e.n, r: !!e.r, weak: !!e.weak }); });
        out.value = build(); outWrap.hidden = false; outWrap.scrollIntoView({ behavior: 'smooth' });
      } }, 'Make my request'),
      outWrap,
      h('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Close'));
    outWrap.append(h('div', { class: 'mono' }, 'Your request · send this message'), out,
      h('div', { class: 'row2' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => copyText(out.value, 'Request') }, 'Copy'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { if (navigator.share) { try { await navigator.share({ text: out.value }); } catch (e) {} } else copyText(out.value, 'Request'); } }, 'Share')));
  }
  function openImportPlan() {
    const ta = h('textarea', { class: 'ta', rows: '5', placeholder: 'EPP1:…', style: 'font-family:var(--mono);font-size:12px' }), err = h('div', { class: 'err', role: 'alert' }), info = h('div');
    let ready = null;
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: () => {
      if (ready) { const plan = ready; closeSheet(); commit(s => L.importPlan(s, plan, L.istDate())); viewDate = L.istDate(); show('today'); toast('Your plan is in'); return; }
      const r = L.readPlanCode(ta.value); if (r.error) { err.textContent = r.error; return; }
      const days = Object.keys(r.plan.days).sort(), tasks = days.reduce((a, k) => a + r.plan.days[k].length, 0);
      info.replaceChildren(h('div', { class: 'qcard', style: 'gap:4px' },
        h('div', { style: 'font-size:20px' }, 'Plan' + (r.plan.name ? ' for ' + r.plan.name : '')),
        h('div', null, days.length + ' days · ' + tasks + ' tasks · ' + (days[0] ? L.short(days[0]) + ' to ' + L.short(days[days.length - 1]) : '')),
        r.plan.events && r.plan.events.length ? h('div', { style: 'color:var(--mut)' }, r.plan.events.length + ' exam dates included') : null,
        h('div', { style: 'color:var(--mut)' }, 'Days before today stay as they are. Tasks you added yourself are kept.')));
      ready = r.plan; btn.textContent = 'Use this plan'; err.textContent = '';
    } }, 'Check code');
    ta.addEventListener('input', () => { ready = null; btn.textContent = 'Check code'; info.replaceChildren(); err.textContent = ''; });
    sheet(h('h2', null, 'Import plan code'), h('div', null, 'Paste the plan code you were sent.'), ta, err, info, btn, h('button', { class: 'btn', type: 'button', onclick: closeSheet }, 'Cancel'));
    setTimeout(() => ta.focus(), 50);
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

  restoreUI();
  checkTimer();
  show(tab);
  if (restoreY) requestAnimationFrame(() => scrollTo(0, restoreY));
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
