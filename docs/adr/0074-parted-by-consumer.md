---
status: accepted — refines ADR 0005, ADR 0025 and ADR 0071
---

# Parted by Consumer; copies of few machines that starve whole

Py small parts 2 at 1237.5/min (`small-parts-02` in automated factories mk01) with bolts, iron sticks and belts made, ten items by train, in a 116 × 116 City Block of 32 medium poles, Buffer 4, Maximize, yellow belts, hand size 2. The page found 1139.9/min, laid out for 1259.9 and starving 420: one small parts factory with its chain as the first layout, five Annexes of one each, and a sixth of two whose iron sticks starve (bolts get 900 of 1200). Every main try above one machine failed at once: "iron-stick: every design starves (1320/min short)", "bolts: every design starves". The Foretelling said 8 fit.

Causes, found in tries that should have fit:

- **A belt to two consumers is one belt** (2 machines: iron-stick starving 1320). Iron sticks go to the bolts (1200 a minute at 2 small parts factories) and the small parts (360): a producer's belt to several Sub-Blocks visits them in turn and is never split into parallel belts (design.js `shapeOf`: only a belt to one consumer is), so 1560 a minute rode one belt of 900; 5460 at 7.
- **Machines each taking most of a belt, in one row** (7 machines: bolts starving 3300). A bolts factory takes 600 sticks a minute and makes 600 bolts: one belt feeds one and a half. Copies, a belt each, come only past 8 machines (`COPIES_FROM`) or where rows stand too tall (ADR 0071); 7 in a whole Module share one belt in.

What changed:

- **Parted by Consumer** (plan.js `partByConsumer`, search.js `search`, app.js `build`): a step whose item, more than a belt carries, goes to several Sub-Blocks is laid out as a Sub-Block for each (`part`, as Bands' Parts are), making what that one takes, each consumer taking it `from` its own: each part's belts are an Internal Path to one consumer, as many in parallel as carry it. Not a Goal, a step with byproducts, a Recipe Loop's, a Byproduct Use or one a Use joins, nor a chain in Parts already; the parts past the first go after the other entries, so no entry's index changes. Done at the start of the search (and before the page designs each Sub-Block), so builds, Maximize's tries, Annexes and moves see the same Sub-Blocks.
- **Copies where every whole Module starves** (design.js `designOnce`): a Sub-Block of 2 machines or more with no copies yet gets copy candidates too where every whole core starves (bolts: copies of one, each its own belt in and out).

| Py small parts 2, 116² among 32 poles, one try at a time | Before | After |
|---|---|---|
| Rate | 1259.94/min laid out, 1139.95 delivered (420 starving) | 1496.23/min, all delivered |
| Small parts factories | 7 (1 + 1 + 1 + 1 + 1 + 2: the first layout and 5 Annexes) | 9 (8 + an Annex of 1) |
| Room empty | 5,751 | 5,461 |
| Maximize | 220 s (best at 188 s) | 510 s (best at 135 s; load 4–5 on 8 cores, beside the suite) |

Each change alone is not enough: parted without the copies, 7 machines run out of time routing the links and 8 find no design of the small parts factories; the copies without parting starve the sticks.

Regressions: the suite's full tier, the 15 setups before it the same layout (titanium standing on its own: no layout, as recorded), 1933 s at 4 at once. The new setup joins it (`small-parts-02-116`: 1496.23/min, 9 factories, 182.5 s at 20 candidates a try).

Tests: Py small parts 2 at 2 machines parted (the iron sticks a part each for bolts and the small parts, 1200 and 360 a minute, nothing by train; one machine's 780 a minute, one belt, not parted).

Still:
- 10 small parts factories: "no room for small-parts-02" (two Annexes' worth of room left, 5,461 tiles, most of it cut up by belts).
- A small parts factory takes eleven items: copies of one find no tile for a pole among their inserters ("no free tile can power fast-inserter"), so 8 fit only in some tries.
