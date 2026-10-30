---
status: accepted — refines ADR 0060
---

# An early Annex's tries on the workers

The user's rule: the same output in less time; a build after a speed-up delivers at least what it did before.

How it was found: Py titanium plate on the page (`run.mjs`, 2 tries at once, an hour each), the code before this session's speed-ups against master after ADR 0082.

| | Before the speed-ups | Master (ADR 0082) |
|---|---|---|
| 13 casting units | no fit (both tries ran their 1000 s) | fit at 953 s |
| Best shown in the hour | 20 (12 + an Annex of 8), still climbing | 13 |

What went wrong: with tries at once, workers idle while the last tries for more machines run begin the Annexes beside the best (ADR 0060). With 2 at once and one try left, the Annex got the one worker left (`width − going`): 1. Maximize with width 1 makes its tries itself, in turn (`attempt`), not through the workers. So the Annex's tries ran in the thread driving Maximize, one after another to the Annex's end, while the outcome of the try still under way waited; and its layouts are held back until the tries are done (ADR 0060), so none was shown. Master was stopped at the hour with its Annex still running. Before the speed-ups no 13 fit in time, the tries filled both workers, and the Annexes came after them, two at once.

What changed (maximize.js `maximize`, `annexOf`, `annexing`):

- **An Annex beside the caller's tries hands its tries to the caller's workers** (`pooled`), even one at a time: its events stop at each wait, and the try under way is taken in as it ends.
- **As many at once as the workers it leaves, asked anew before each try** (`parallel` a function, `atOnce`): once the last tries end, the Annex takes every worker.
- One at a time (the suite, `maxdet.mjs`, a page of one core) nothing changes: `pooled` only where the caller runs tries at once.

| Py titanium plate, `run.mjs --parallel 2`, an hour, side by side (load 25 on 8 cores) | Before the speed-ups | After |
|---|---|---|
| Best | 16 (12 + 4), 5976.56/min, at 3738 s | 24 (13 + 11), 8859.37/min, at 2079 s |
| Valid, starving | yes, 0 | yes, 0 |

Tests: an Annex begun early with one worker left hands its tries to the workers (as many begun as tried; before, 18 of 24), the same rate as one at a time (city.test.js).

Still: an early Annex's layouts are held back until the last tries end; a stop before then (the page's stop, `--total`) loses them.
