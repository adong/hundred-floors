#!/usr/bin/env node
/* 100 Floors: the headless checks, run from the game folder with `node tools/check.js` (add `--quick` for fewer runs).
   It loads js/sim.js, the same rules file the game uses, then:
   1. fairness: every platform of many generated courses (both modes, normal and easy) has a way on that isn't spiky,
      tested with the real physics: DOWN, a platform within 2 rows below; UP, a platform above in reach of a plain
      bounce from either end or the middle, standing still or running full speed either way.
   2. proof the check can fail: the same check on an unchecked generator (`broken`) must report failures.
   3. soak: whole games under the real rules (moving view, spiky ceiling, the bottom) played by the autopilot,
      and by nobody (which must lose hearts). Exits with code 1 if anything is off. */
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', 'js', 'sim.js'));

const quick = process.argv.includes('--quick');
let bad = 0;
const say = (ok, msg) => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`);
};

const t0 = Date.now();
for (const mode of ['down', 'up']) {
  for (const easy of [false, true]) {
    const r = S.check({ mode, easy, seeds: quick ? 6 : 30, floors: quick ? 150 : 300 });
    say(r.failures === 0, `fairness ${mode}${easy ? ' easy' : ''}: ${r.seeds} courses x ${r.floors} floors, ${r.platforms} platforms, ${r.failures} without a way on, ${r.fallbacks} full-width fallbacks`);
    if (r.failures) console.log('      ', JSON.stringify(r.examples));
  }
  const b = S.check({ mode, broken: true, seeds: 6, floors: 150 });
  say(b.failures > 0, `the check can fail: unchecked ${mode} generator -> ${b.failures} of ${b.platforms} platforms flagged`);
}

for (const mode of ['down', 'up']) {
  for (const easy of [false, true]) {
    const s = S.soak({ mode, easy, runs: quick ? 3 : 8, floors: 150 });
    const reached = s.runsOut.map((r) => r.floor);
    say(s.gameOvers === 0, `soak ${mode}${easy ? ' easy' : ''} (autopilot): ${s.runs} games to floor ${s.floors}, reached ${reached.join(' ')}, hearts lost ${s.heartsLost}, game overs ${s.gameOvers}`);
    if (s.heartsLost) console.log('      ', JSON.stringify(s.runsOut.filter((r) => r.lost.spike + r.lost.ceiling + r.lost.fall).map((r) => ({ seed: r.seed, floor: r.floor, lost: r.lost }))));
  }
  const idle = S.soak({ mode, runs: 3, floors: 150, bot: false });
  say(idle.heartsLost > 0, `the soak can fail: nobody steering in ${mode} -> hearts lost ${idle.heartsLost}, game overs ${idle.gameOvers} of ${idle.runs}`);
}
console.log(`${bad ? bad + ' problem(s)' : 'all good'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(bad ? 1 : 0);
