// Started by run.mjs --profile-slow S (which runs itself under node --prof): watches the run's
// log, and once a try has run S seconds with no event, takes the next --profile-for seconds (60)
// of V8's tick log and writes <out>/slow-<k>.txt: the try, then the tick processor's summary and
// bottom-up profile for that window — the functions taking the time and who calls them.
// (The inspector cannot be used: the main thread never yields inside a try to answer it.)
import { workerData } from 'node:worker_threads';
import { statSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { log, out, slow, span, v8log, start } = workerData;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let size = -1, since = Date.now(), k = 0;
const done = new Set();
for (;;) {
  await sleep(2000);
  let now;
  try { now = statSync(log).size; } catch { continue; }
  if (now !== size) { size = now; since = Date.now(); continue; }
  const lines = readFileSync(log, 'utf8').trim().split('\n');
  const last = lines.at(-1);
  if (!/ try /.test(last) || done.has(lines.length) || Date.now() - since < slow * 1000) continue;
  done.add(lines.length);
  k++;
  const from = Date.now() - start;
  await sleep(span * 1000);
  let text;
  try {
    text = execFileSync(process.execPath, ['--prof-process', `--range=${from},${from + span * 1000}`, v8log], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (e) {
    text = `tick processing failed: ${e.message}`;
  }
  // The JavaScript table and the bottom-up profile (the libraries' tables say little).
  const js = text.match(/ \[JavaScript\]:[\s\S]*?\n\n/)?.[0] ?? '';
  const heavy = text.match(/ \[Bottom up \(heavy\) profile\]:[\s\S]*/)?.[0].split('\n').slice(0, 120).join('\n') ?? text.slice(0, 4000);
  writeFileSync(`${out}/slow-${k}.txt`, `${last}\n(silent ${Math.round((Date.now() - since) / 1000 - span)} s before; ticks of the ${span} s after)\n\n${js.split('\n').slice(0, 30).join('\n')}\n${heavy}\n`);
}
