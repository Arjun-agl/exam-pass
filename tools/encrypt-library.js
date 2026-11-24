/* Scrambles your PDFs for the Library tab.

   1. Put PDFs in study-app/library-source/ named like:
        physics-1-notes.pdf      physics-1-revision.pdf      physics-1-worksheet.pdf
        chemistry-5-notes.pdf    maths-7-revision.pdf        maths-7-worksheet.pdf
      (subject, NCERT chapter number, then notes / revision / worksheet; Maths has no notes)
   2. Run:  node tools/encrypt-library.js   (LIB_SRC=<folder> to read PDFs from another folder, e.g. the watermarked copies)
   3. Type the library code when asked.
   Output goes to study-app/library/ (safe to upload). library-source/ is never uploaded. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), readline = require('readline');
const L = require('../logic.js');

const ROOT = path.join(__dirname, '..'), SRC = process.env.LIB_SRC || path.join(ROOT, 'library-source'), OUT = path.join(ROOT, 'library'), FILES = path.join(OUT, 'files');
const MAN = path.join(OUT, 'manifest.json'), ITER = 310000, CHECK = 'exam-pass-library';
const SUBJ = { physics: 'Physics', chemistry: 'Chemistry', maths: 'Maths', math: 'Maths', biology: 'Biology', bio: 'Biology' };
const KIND = { notes: 'notes', note: 'notes', revision: 'revision', rev: 'revision', worksheet: 'worksheet', wksh: 'worksheet', ws: 'worksheet' };

function ask(q) { return new Promise(res => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); res(a.trim()); }); }); }
const keyFor = (code, salt) => crypto.pbkdf2Sync(code, salt, ITER, 32, 'sha256');
function seal(key, data) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); const ct = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]); return { iv: iv.toString('base64'), ct }; }
function open(key, ivB64, ct) { const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64')); d.setAuthTag(ct.subarray(ct.length - 16)); return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]); }

(async () => {
  const code = process.env.LIB_CODE || await ask('Library code: ');
  if (!code) { console.log('No code typed. Nothing changed.'); process.exit(1); }
  fs.mkdirSync(FILES, { recursive: true }); fs.mkdirSync(SRC, { recursive: true });

  let man = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, 'utf8')) : null, key;
  if (man) {
    key = keyFor(code, Buffer.from(man.kdf.salt, 'base64'));
    try { if (open(key, man.check.iv, Buffer.from(man.check.ct, 'base64')).toString() !== CHECK) throw 0; }
    catch (e) { console.log("That code doesn't match this library. Nothing changed."); process.exit(1); }
  } else {
    const salt = crypto.randomBytes(16); key = keyFor(code, salt);
    const chk = seal(key, Buffer.from(CHECK));
    man = { v: 1, kdf: { name: 'PBKDF2-SHA256', iter: ITER, salt: salt.toString('base64') }, check: { iv: chk.iv, ct: chk.ct.toString('base64') }, files: [] };
    console.log('New library created.');
  }

  const byId = new Map(man.files.map(f => [f.id, f]));
  let added = 0, updated = 0, same = 0; const problems = [];
  for (const name of fs.readdirSync(SRC).sort()) {
    if (!/\.pdf$/i.test(name)) continue;
    const m = name.toLowerCase().replace(/\.pdf$/, '').match(/^([a-z]+)[\s_-]*(?:ch(?:apter)?)?[\s_-]*(\d{1,2})[\s_-]*([a-z]+)$/);
    const subject = m && SUBJ[m[1]], kind = m && KIND[m[3]], ch = m && parseInt(m[2], 10);
    const group = subject && L.SYLLABUS.find(g => g.subject === subject);
    if (!m || !subject || !kind) { problems.push(name + ': name should look like physics-1-notes.pdf'); continue; }
    if (!group || ch < 1 || ch > group.chapters.length) { problems.push(name + ': ' + subject + ' has chapters 1 to ' + (group ? group.chapters.length : '?')); continue; }
    if (subject === 'Maths' && kind === 'notes') { problems.push(name + ': Maths only has revision and worksheet'); continue; }
    const data = fs.readFileSync(path.join(SRC, name));
    if (data.subarray(0, 5).toString() !== '%PDF-') { problems.push(name + ": this doesn't look like a PDF"); continue; }
    const id = subject.toLowerCase() + '-' + String(ch).padStart(2, '0') + '-' + kind;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    const prev = byId.get(id);
    if (prev && prev.hash === hash && fs.existsSync(path.join(FILES, id + '.bin'))) { same++; continue; }
    const s = seal(key, data);
    fs.writeFileSync(path.join(FILES, id + '.bin'), s.ct);
    byId.set(id, { id, subject, ch, chapter: group.chapters[ch - 1], kind, iv: s.iv, size: data.length, hash });
    prev ? updated++ : added++;
  }
  man.files = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  man.updated = Date.now();
  fs.writeFileSync(MAN, JSON.stringify(man, null, 1));
  console.log(`Added ${added}, updated ${updated}, unchanged ${same}. Library now has ${man.files.length} files.`);
  if (problems.length) { console.log('\nSkipped:'); problems.forEach(p => console.log('  - ' + p)); }
})();
