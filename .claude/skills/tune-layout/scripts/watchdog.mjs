// A run with no time limit (suite-one.mjs, maxdet.mjs) ends however long a try takes: imported
// first (`import './watchdog.mjs?seconds=N'`, N the script's default), it runs the script again
// in a child process and kills that past TIMEOUT seconds (N unless set; 0: none), exiting 124 as
// timeout(1) does. A try is synchronous: no timer inside the process could stop it.
import { spawnSync } from 'node:child_process';

const limit = Number(process.env.TIMEOUT ?? new URL(import.meta.url).searchParams.get('seconds'));
if (!process.env.WATCHED && limit > 0) {
  const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit', env: { ...process.env, WATCHED: '1' }, timeout: limit * 1000, killSignal: 'SIGKILL',
  });
  if (r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGKILL') {
    console.error(`timed out after ${limit} s (TIMEOUT=<seconds> to change, 0 for none)`);
    process.exit(124);
  }
  process.exit(r.status ?? 1);
}
