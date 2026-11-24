/* Turns a plan JSON file into a plan code someone pastes into Settings → Import plan code.

   Usage: node tools/make-plan.js plans/riya.json

   The JSON looks like:
   {
     "name": "Arjun",
     "goal": { "name": "NEET", "date": "2027-05-02" },          (optional)
     "events": [ { "name": "Physics exam", "date": "2026-12-07" } ],   (optional: replaces their exam list)
     "days": {
       "2026-11-25": ["!NEET 1 hr", "Evolution: NCERT read"],      ("!" = must-do)
       "2026-11-26": ["!Physics practical prep (2 h)"]
     }
   } */
'use strict';
const fs = require('fs');
const L = require('../logic.js');
const file = process.argv[2];
if (!file) { console.log('Usage: node tools/make-plan.js <plan.json>'); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
let code;
try { code = L.makePlanCode(plan); } catch (e) { console.log('Plan problem: ' + e.message); process.exit(1); }
const back = L.readPlanCode(code);
if (back.error) { console.log('Code check failed: ' + back.error); process.exit(1); }
const days = Object.keys(plan.days).sort();
console.log(`Plan${plan.name ? ' for ' + plan.name : ''}: ${days.length} days, ${days[0]} to ${days[days.length - 1]}, ${days.reduce((a, d) => a + plan.days[d].length, 0)} tasks.\n`);
console.log(code);
