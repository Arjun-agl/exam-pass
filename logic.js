/* Pure logic: dates (IST), the plan, syllabus, streaks, carry-over, stats, quiz mistakes.
   No DOM here, so it can be tested on its own. */
(function (root) {
  'use strict';

  /* ---------- Dates (all in IST, Asia/Kolkata) ---------- */
  const TZ = 'Asia/Kolkata';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  function istDate(ts) { return fmt.format(new Date(ts == null ? Date.now() : ts)); }
  function toUTC(ds) { const [y, m, d] = ds.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function addDays(ds, n) { return new Date(toUTC(ds) + n * 864e5).toISOString().slice(0, 10); }
  function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 864e5); } // b minus a
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dow(ds) { return DOW[new Date(toUTC(ds)).getUTCDay()]; }
  function pretty(ds) { const [, m, d] = ds.split('-').map(Number); return dow(ds) + ' ' + d + ' ' + MON[m - 1]; }
  function short(ds) { const [, m, d] = ds.split('-').map(Number); return d + ' ' + MON[m - 1]; }

  function uid() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- Plan ("!" = must-do) ---------- */
  const PLAN = {
    '2026-11-23': ['!NSAT 1 hr', 'Coordination revision'],
    '2026-11-24': ['!NSAT 1 hr', '!PE practical prep (2 h)', '!Coordination NCERT exercise', 'Vectors NCERT exercise', '3D Geometry NCERT (start)'],
    '2026-11-25': ['!NSAT 1 hr', '3D Geometry NCERT (finish)', 'Atoms NCERT exercise', 'Maths practical prep (1 h)'],
    '2026-11-26': ['!NSAT 1 hr', '!Physics practical prep (2 h)', 'Nuclei: learn from notes'],
    '2026-11-27': ['!NSAT 1 hr', '!Nuclei NCERT exercise', 'Dual Nature NCERT exercise'],
    '2026-11-28': ['!NSAT 1 hr', '!Semiconductors theory', 'Probability start', 'Maths revision: Relations & Functions + Inverse Trig'],
    '2026-11-29': ['!NSAT 1 hr', '!Semiconductors NCERT + logic gates', 'Probability', 'Maths revision: Matrices + Determinants'],
    '2026-11-30': ['!NSAT 1 hr', '!Probability NCERT', 'Biomolecules notes sections 1-8', 'Maths revision: Continuity & Differentiability'],
    '2026-12-01': ['!NSAT 1 hr', '!English practical prep', 'Biomolecules rest', 'd & f block NCERT', 'Maths revision: Application of Derivatives'],
    '2026-12-02': ['!NSAT 1 hr', '!English: writing formats + Flamingo/Vistas (3 h)', 'Physics revision Ch 1-3', 'Maths revision: Indefinite integrals'],
    '2026-12-03': ['!NSAT 1 hr', 'Physics revision Ch 4-7', 'Maths revision: Definite integrals'],
    '2026-12-04': ['!NSAT 1 hr', '!Physics sample paper 1 (timed 3 h)', 'Physics revision Ch 8-10', 'Maths revision: Application of Integrals'],
    '2026-12-05': ['!NSAT 1 hr', '!Modern Physics + Semiconductors revision', 'Fix Physics paper 1 mistakes', 'Maths revision: Differential Equations + LPP'],
    '2026-12-06': ['!NSAT 1 hr', '!Physics sample paper 2 (timed)', 'Physics formula sheets', 'Maths revision: Vectors + 3D', 'Sleep by 11 pm'],
    '2026-12-07': ['!Maths sample paper 1 (timed 3 h)', 'Organic reactions revision (2 h)', 'NSAT 30 min'],
    '2026-12-08': ['!Chem physical numericals', '!Chem inorganic: Coordination, d & f, Biomolecules', 'Chem sample paper', 'NSAT 30 min'],
    '2026-12-09': ['!Maths: paper 1 mistakes + formula sheet + Probability', 'NSAT 30 min'],
    '2026-12-10': ['PE revision (2 h)', 'NSAT 30 min'],
    '2026-12-11': ['!NSAT 1 hr']
  };
  for (let d = '2026-12-12'; d <= '2027-01-06'; d = addDays(d, 1)) PLAN[d] = ['!NSAT 2 hrs'];

  function planFor(ds) {
    return (PLAN[ds] || []).map((s, i) => ({ id: 'p-' + ds + '-' + i, text: s.replace(/^!/, ''), must: s[0] === '!', done: false }));
  }
  // Read a day without changing anything (plan days appear even before they are opened).
  function dayTasks(state, ds) { return state.days[ds] ? state.days[ds].tasks : planFor(ds); }
  // Make a day real in storage before changing it.
  function ensureDay(state, ds) { if (!state.days[ds]) state.days[ds] = { tasks: planFor(ds) }; return state.days[ds]; }
  function sortTasks(tasks) { return tasks.map((t, i) => [t, i]).sort((a, b) => (b[0].must - a[0].must) || (a[1] - b[1])).map(x => x[0]); }
  function findTask(state, ds, id) { return ensureDay(state, ds).tasks.find(t => t.id === id); }
  function toggleTask(state, ds, id) { const t = findTask(state, ds, id); if (t) t.done = !t.done; return t; }
  function addTask(state, ds, text, must) { const t = { id: uid(), text: text.trim(), must: !!must, done: false }; ensureDay(state, ds).tasks.push(t); return t; }
  function deleteTask(state, ds, id) {
    const day = ensureDay(state, ds); const t = day.tasks.find(x => x.id === id); if (!t) return;
    day.tasks = day.tasks.filter(x => x.id !== id);
    // Deleting a carried copy frees the original so it can be carried again.
    if (t.srcId && t.from && state.days[t.from]) { const o = state.days[t.from].tasks.find(x => x.id === t.srcId); if (o && o.copiedTo === ds) delete o.copiedTo; }
  }

  /* ---------- Streak, carry-over, stats ---------- */
  function hasNsatDone(state, ds) { return dayTasks(state, ds).some(t => t.done && /nsat/i.test(t.text)); }
  function streak(state, today) {
    let d = hasNsatDone(state, today) ? today : addDays(today, -1), n = 0;
    while (n < 4000 && hasNsatDone(state, d)) { n++; d = addDays(d, -1); }
    return n;
  }
  function allKnownDates(state) { const s = new Set(Object.keys(state.days)); Object.keys(PLAN).forEach(d => s.add(d)); return [...s].sort(); }
  function unfinishedBefore(state, today) {
    const out = [];
    for (const ds of allKnownDates(state)) { if (ds >= today) break; for (const t of dayTasks(state, ds)) if (!t.done && !t.copiedTo) out.push({ ds, t }); }
    return out;
  }
  function carryOver(state, today) {
    const list = unfinishedBefore(state, today), day = ensureDay(state, today);
    for (const { ds, t } of list) {
      const orig = findTask(state, ds, t.id); orig.copiedTo = today;
      day.tasks.push({ id: uid(), text: t.text, must: t.must, done: false, carried: true, from: ds, srcId: t.id });
    }
    return list.length;
  }
  function dayCounts(state, ds) { const t = dayTasks(state, ds); return { done: t.filter(x => x.done).length, total: t.length }; }
  function minutesOn(state, ds) { return state.sessions.filter(s => s.date === ds).reduce((a, s) => a + s.minutes, 0); }
  function lastNDays(state, today, n) { return Array.from({ length: n }, (_, i) => { const ds = addDays(today, i - n + 1); return { ds, min: minutesOn(state, ds) }; }); }
  function hm(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? h + ' h ' + m + ' min' : m + ' min'; }
  function nextEvents(events, today, n) {
    return events.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
      .slice(0, n || 3).map(e => Object.assign({}, e, { days: diffDays(today, e.date) }));
  }

  /* ---------- Syllabus ---------- */
  const SYLLABUS = [
    { subject: 'Physics', chapters: ['Electric Charges and Fields', 'Electrostatic Potential', 'Capacitance', 'Current Electricity', 'Moving Charges and Magnetism', 'Magnetism and Matter', 'Electromagnetic Induction', 'Alternating Current', 'Electromagnetic Waves', 'Ray Optics', 'Wave Optics', 'Dual Nature', 'Atoms', 'Nuclei', 'Semiconductors'] },
    { subject: 'Chemistry', chapters: ['Solutions', 'Electrochemistry', 'Chemical Kinetics', 'd and f Block', 'Coordination Compounds', 'Haloalkanes and Haloarenes', 'Alcohols, Phenols and Ethers', 'Aldehydes, Ketones and Carboxylic Acids', 'Amines', 'Biomolecules'] },
    { subject: 'Maths', chapters: ['Relations and Functions', 'Inverse Trigonometric Functions', 'Matrices', 'Determinants', 'Continuity and Differentiability', 'Application of Derivatives', 'Integrals', 'Application of Integrals', 'Differential Equations', 'Vectors', '3D Geometry', 'Linear Programming', 'Probability'] }
  ];
  const chapId = (subject, name) => subject.toLowerCase() + ':' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  function defaultSyllabus() {
    const s = {}; const set = (subj, name, l, n, r) => { s[chapId(subj, name)] = { l: !!l, n: !!n, r: !!r, note: '' }; };
    SYLLABUS.forEach(g => g.chapters.forEach(c => set(g.subject, c, 0, 0, 0)));
    const P = SYLLABUS[0].chapters, C = SYLLABUS[1].chapters, M = SYLLABUS[2].chapters;
    P.slice(0, 11).forEach(c => set('Physics', c, 1, 1, 0)); // NCERT Ch 1-10 (Ch 2 is split into two here)
    ['Moving Charges and Magnetism', 'Magnetism and Matter', 'Electromagnetic Induction', 'Ray Optics', 'Wave Optics'].forEach(c => set('Physics', c, 1, 1, 1));
    set('Physics', 'Atoms', 1, 0, 0);
    ['Solutions', 'Electrochemistry', 'Chemical Kinetics'].forEach(c => set('Chemistry', c, 1, 1, 0));
    set('Chemistry', 'Coordination Compounds', 1, 0, 0);
    C.slice(5, 9).forEach(c => set('Chemistry', c, 1, 0, 0)); // Haloalkanes to Amines
    M.slice(0, 9).forEach(c => set('Maths', c, 1, 1, 0));
    set('Maths', 'Linear Programming', 1, 1, 0);
    set('Maths', 'Vectors', 1, 0, 0); set('Maths', '3D Geometry', 1, 0, 0);
    return s;
  }
  function chapTicks(e) { return e ? (e.l ? 1 : 0) + (e.n ? 1 : 0) + (e.r ? 1 : 0) : 0; }
  function subjectProgress(state, group) {
    const ticks = group.chapters.reduce((a, c) => a + chapTicks(state.syllabus[chapId(group.subject, c)]), 0);
    return ticks / (group.chapters.length * 3);
  }

  /* ---------- Events, defaults ---------- */
  function defaultEvents() {
    return [
      ['PE practical', '2026-11-25'], ['Maths practical', '2026-11-26'], ['Physics practical', '2026-11-27'], ['English practical', '2026-12-01'],
      ['English exam', '2026-12-03'], ['Physics exam', '2026-12-07'], ['Chemistry exam', '2026-12-09'], ['Maths exam', '2026-12-10'],
      ['Physical Education exam', '2026-12-11'], ['NSAT', '2027-01-07']
    ].map(([name, date]) => ({ id: uid(), name, date }));
  }
  function defaultState() {
    return { v: 1, events: defaultEvents(), days: {}, sessions: [], syllabus: defaultSyllabus(), quiz: { mistakes: {} }, timer: null, prefs: { focus: 25, brk: 5 }, updated: 0 };
  }
  // Older saves had "Electrostatic Potential and Capacitance" as one chapter: copy its ticks and note to both new chapters.
  function migrate(s) {
    const old = 'physics:electrostatic-potential-and-capacitance';
    if (s && s.syllabus && s.syllabus[old]) {
      const e = s.syllabus[old];
      for (const id of ['physics:electrostatic-potential', 'physics:capacitance']) if (!s.syllabus[id]) s.syllabus[id] = { l: !!e.l, n: !!e.n, r: !!e.r, note: e.note || '' };
      delete s.syllabus[old];
      return true;
    }
    return false;
  }
  function validState(s) { return s && typeof s === 'object' && Array.isArray(s.events) && s.days && typeof s.days === 'object' && Array.isArray(s.sessions) && s.syllabus && s.quiz; }

  /* ---------- Quiz ---------- */
  function qid(q) { let h = 2166136261; const s = q.chapter + '|' + q.q; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return 'q' + (h >>> 0).toString(36); }
  function recordAnswer(state, id, correct) {
    const m = state.quiz.mistakes;
    if (!correct) { m[id] = { right: 0 }; return; }
    if (m[id]) { m[id].right = (m[id].right || 0) + 1; if (m[id].right >= 2) delete m[id]; }
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  const api = { TZ, istDate, addDays, diffDays, pretty, short, dow, uid, PLAN, planFor, dayTasks, ensureDay, sortTasks, toggleTask, addTask, deleteTask,
    hasNsatDone, streak, unfinishedBefore, carryOver, dayCounts, minutesOn, lastNDays, hm, nextEvents,
    SYLLABUS, chapId, defaultSyllabus, chapTicks, subjectProgress, defaultEvents, defaultState, validState, migrate, qid, recordAnswer, shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Logic = api;
})(typeof window !== 'undefined' ? window : globalThis);
