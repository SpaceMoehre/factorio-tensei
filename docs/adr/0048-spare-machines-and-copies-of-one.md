---
status: accepted — refines ADR 0005, ADR 0008, ADR 0023 and ADR 0047
---

# Spare machines, copies of one machine, and turning lanes shared

Py silicon at 675/min was maximized in a 118 × 118 City Block, Buffer 4, with a roboport and a big pole in each quarter. The chain is:

- silicon in high-pressure furnaces;
- pure sand and sand from washers;
- soil from soil extractors;
- water from offshore pumps.

Maximize found 675/min as a first layout of 4 furnaces (435/min) plus two Annexes of 1. Each Annex had its own washers, eight soil extractors and pumps, and a third of the City Block stayed empty. Each cause below was found in a try that should have fitted.

- **Copies of one sand washer were judged short of sand they bring.** A washer takes 450 soil a minute, a whole lane, so its designs are copies of one or two machines. The copies' check counted every copy's drops on the lane of the module as designed. But a belt snaking through the copies runs the other way in every second one (the module's reverse), so there its machines drop onto the other lane. Copies of one machine starved 900/min on paper and were passed over, and at 6 furnaces no design without Starvation fit.
- **Copies of two passed where their belts could not feed them.** In a copy of two washers, only one of its two soil belts snakes through the stack; the other starts afresh in every copy. Ten washers then need eight belts of soil, where the path has six. Nothing checked the belts into copies, only the belts out.
- **A stack of an even number of copies ended at a reversed copy.** A run of producers had to end at a copy whose belt leaves east, and a run of consumers start at one entered from the west. In one column of ten copies the last is reversed, so no run of their belts could end. The layout failed with "no belts chain".
- **Consumers cut into runs regardless of what each producer belt brings.** The soil extractors' six belts bring 912, 456, 912, 912, 456 and 912 a minute. The washers were cut into runs of about equal size (2, 2, 2, 2, 1, 1), and the belts came out short in turn.
- **Producers with no spare.** 30 soil extractors make exactly the 3600 soil a minute 8 washers take. On five belts of 720 each, which runs of washers taking 450 each never use up, every design starves 150/min. One or two extractors more would do.
- **Turning lanes for every belt.** Beside a stack, Placement kept a lane for every belt turning between its copies, over the whole stack. Ten washers' five runs of soil and two of sand made a stack 48 wide for a module 10 wide. (Compose reserves those lanes only where every belt's own lane is within the underground reach: here, none.)
- **A stack about as tall as the City Block stood in one column.** A stack splits into columns only when its copies are taller than the room. A column of ten copies, 109 tall, then stood nowhere among the Fixtures, and the candidates in columns came too late to be tried.
- **Giving Way tried far too many machines.** With the best at 4 furnaces and 5 not fitting, it tried 14 and 9 furnaces, then 6 and 5. That took a fifth of the Maximize.

What changed:

- **Copies' lanes as they are built** (design.js `copiesShortfall`). Every second copy is counted as its kind's reverse, as compose.js `makeInstances` stands them (one column).
- **Belts into copies** (design.js `copiesUnfed`).
  - A part that snakes through the copies takes a run of belts for every so many machines as one belt feeds.
  - A part that does not snake takes one in every copy.
  - Where that is more than the path's belts, the machines beyond go short, and the design ranks so.
- **Runs that end or start at a reversed copy** (compose.js `groupRoutes`).
  - Where no runs chain the producers so, or none without Starvation, a run of producers may end at a copy leaving west, and a run of consumers start at one entered from the east.
  - The strict cut is kept unless the loose one starves less.
- **Consumers cut to what the producers bring** (compose.js `groupRoutes`). Besides runs of about equal size, the producers are cut by about equal shares of what they make, and the consumers into runs taking what each of those brings.
- **Spare machines** (maximize.js `attempt`, search.js `short`). A try can fail in two ways:
  - a Sub-Block's every design starves (other than the first Goal's);
  - the layouts were passed over because that one Sub-Block's belts fell short.

  If either is by no more than a few of its machines' make (2, or a tenth of its Count), the try is made again with that many more of them (`extra`, as an Extension makes, ADR 0038). They run below full speed, and their belts bring more than they are wanted for.
- **Turning lanes shared** (compose.js `turnLanes`, place.js `stackOf`).
  - Placement keeps a lane for the belts turning between different copies of a stack to share, since runs of copies one below another never turn beside the same ones.
  - The ten washers' stack is 28 wide, not 48.
  - Compose reserves lanes as before: a lane of its own for every belt, only where all are within reach.
  - Reserving the shared lanes as well (each beside the copies its belts turn at) hemmed in the links of Py vrauks' 50 paddocks among roboports: out of time routing them.
- **A stack of one column with no room stands in two** (search.js). Where Placement finds no room for a stack of copies in one column, the same candidate is tried next with it in two columns, as a link without room spaces the Sub-Blocks out (ADR 0014).
- **Giving Way's top** (maximize.js). No try gives way at more machines than a third above the lowest that did not fit. Three quarters of them are kept at least, so more than that leaves no fewer than did not fit.

Py silicon in that City Block, budget 1000 s a try:

| Run | First layout | Rate | Furnaces |
|---|---|---|---|
| Before (three runs, the page's too) | 435/min (3.6) | 675/min | 3.6 + Annexes of 1 and 1 |
| Without the shared lanes, two columns and Giving Way's top (side by side with Before) | 555/min (4.6) | 795/min | 4.6 + Annex of 2 |
| Now (alone, on a host busy with the test suite) | 592.5/min (4.9) | 712.5/min | 4.9 + Annex of 1 |
| Now, side by side with Before on the same host (Before: 675/min, best at 502 s, 2620 s in all) | 592.5/min (4.9) | 712.5/min, best at 348 s, 894 s in all | 4.9 + Annex of 1 |

The first layout grows each time. What the Annexes then add depends on the room it leaves and on how far their tries get within the wall-clock budget, so the totals vary from run to run.

Still:
- Five furnaces in one layout do not place. The two-column sand stack fits beside some soil designs only, and the search does not pair the two.
- Water is one pipe network, 6000 a second at most. Above about 5.2 furnaces the water alone starves one layout, so more furnaces come only from Annexes.
