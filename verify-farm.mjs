// Verify the dashboard's in-page farm plan matches board.json exactly:
// extract the farm-step functions from dashboard/app.js, run them over every
// board row in Node, and diff against the model's own farm_steps.
import { readFileSync } from 'node:fs';

const appJs = readFileSync('dashboard/app.js', 'utf8');
const start = appJs.indexOf('  function chainOf(p)');
const end = appJs.indexOf('  function readHash()');
if (start < 0 || end <= start) {
  console.error('could not find the farm functions in app.js');
  process.exit(2);
}
const farmSteps = eval(appJs.slice(start, end) + '; farmSteps;');
const board = JSON.parse(readFileSync('out/board.json', 'utf8'));

let mismatches = 0;
for (const row of board.rows) {
  const js = farmSteps(row);
  if (JSON.stringify(js) !== JSON.stringify(row.farm_steps)) {
    mismatches++;
    if (mismatches <= 3) {
      console.log('MISMATCH', row.slug);
      console.log('  JS:', JSON.stringify(js));
      console.log('  TS:', JSON.stringify(row.farm_steps));
    }
  }
}
console.log(`rows checked: ${board.rows.length}, farm-step mismatches: ${mismatches}`);
process.exit(mismatches === 0 ? 0 : 1);
