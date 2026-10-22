# Lessons from ADR 0001–0047

These were distilled from the ADRs. Each item cites its ADR: read the ADR before touching that mechanism. Add new lessons at the end of each section (step 9 of SKILL.md).

## How gains were found

- **Find a try that should have fit, and find out why it did not.**
  - ADRs 0019, 0023, 0024 and 0025 each list causes "found in a try that should have fitted". Nearly every gain came this way.
  - Each cause was concrete and nameable. For example: a link took the tile another link of its route starts from; a belt took a pipe's way out; machines built apart stood one tile from a box; copies each wanted a belt from one machine.
  - Guessing at a global tweak did not produce gains.
- **The user's rule, built as they said it.**
  - Several features started from a rule the user stated plainly: Filling (0015, "+10, halve"), Nooks (0016), Making Way (0017), Space-out (0014), Annexes (0031), Extensions (0038), byproduct belts merged (0030), pipes of one fluid join (0033) and Giving Way (0047).
  - Build the literal rule first. Then measure it.
- **Look at the picture.**
  - 0019 ran a loop: judge the screenshot, find why usable room stays empty, fix it, go again. That took Py nexelit from 1260 to 1458/min.
  - Empty strips are the symptom. The reason is usually one step: placement, design shape, routing or the Maximize schedule.
- **For speed, profile, then follow every candidate** (0058).
  - `node --cpu-prof` on whole Maximize runs (`profsum.mjs`) showed each setup's own sink: molybdenum oxide the design that fits most spots between Fixtures (a quarter), kicalk Parting (two thirds), titanium plate fallbacks, Layers and finishing.
  - Then a scratch copy of the search logging every candidate (its kind, how far it got, how long) and every design variant (its family, new or alike, kept, used in a fit). That told work never used from work that made the fits: rows capped by belt load built 105,000 cores in molybdenum oxide for 2 of 20 designs used.
  - Check a speed-up lays out the same with `maxdet.mjs` (no time limit, K candidates a try) before the wall-clock A/B: identical hashes make the A/B about time alone.
- **Number everything.**
  - Every ADR has a before/after table: rate, machines, size and time on a named setup.
  - The reference setups show where a change pays and where it regresses: small parts (busy belts), vrauks/kicalk among roboports (Fixture rows), moss (fluids), molybdenum (byproducts) and sodium hydroxide (loops).

## What worked (keep, build on)

| Mechanism | Gain | ADR |
|---|---|---|
| Bottom-up Modules, composed; Copies of one Module | Big chains became searchable at all | 0005 |
| Foretelling picks the first try; a try ends at its first layout without Starvation, and early when a design starves | Most of Maximize's time had gone on tries that told nothing new | 0008 |
| Layers (columns chosen together) in a City Block | Py small parts 2400 → 3000/min | 0009 |
| Compactness score (square, empty, bends), not area | 111 × 27 → 62 × 55 | 0010 |
| Spread strategy beside the tight search, in parallel | Faster first layout on huge Sub-Blocks; neither strategy wins everywhere | 0013 |
| Space out on a link failure (the error names the Sub-Blocks; pad 4, doubling) | Kicalk pack routed: 151k → 135k score | 0014 |
| Filling: +10, again while it fits, then halve | Small parts 3150 → 3375 | 0015 |
| Nooks | Kicalk 187 → 206/min | 0016 |
| Making Way (a Fixture on a machine, built apart) | Nexelit 797 → 1019 | 0017 |
| Backtracking: up to 3 spots, far apart, 24 in all | Nexelit 1019 → 1260 | 0018 |
| Rows as wide as the block; pairings of the best 8 designs | Nexelit → 1458 | 0019 |
| Starvation is not monotonic in the Count: pass a starving number once | Small parts 5175 → 7200 | 0023 |
| Two-Way Copies; a corridor across columns | Same | 0023 |
| Snake order; narrow designs together; Parting round Fixture rows | Vrauks 22 → 35.8 | 0024 |
| Bands (Slots between Fixture rows, Sub-Blocks in Parts) | Vrauks 35.8 → 55.8 | 0025 |
| Fan-out across Sub-Blocks; capped splitter spots; give up at once when there is no way on | 13 belts → 2; 49 s → 10 s | 0026 |
| Bands for busy recipes (pole slots band by band, producer lines, byproduct filter, layouts tried in turn) | Vrauks-2 27 → 55 | 0027 |
| Fluids Between; snug rows; structured-only whole modules for big Sub-Blocks in a City Block | Moss 940 → 1152 | 0029 |
| Maximize tries unsorted, then sorts once at the end; a try's budget is the candidates', after designing | Molybdenum 0 → 600 | 0030 |
| Annexes; Draws; probe with 1 machine; whole machines only in Annexes | Moss 648 → 806 | 0031, 0032 |
| Extensions (grow the built fluid Sub-Block before an Annex makes its own) | NaOH 2000 → 2300 | 0038 |
| Gatherers; keep searching briefly for a loop fed here | NaOH 2500 → 3100 | 0040 |
| Giving Way: first Goal gives up to a quarter of its machines to Fixtures, nothing built apart, rates scaled | Kicalk 114 → 120 machines (one try) | 0047 |
| Placement in crowded rooms: integral image turns crowded spots away, spot checks memoized, deadline inside backtracking, retries capped | An Annex try 274 s → 47 s | 0049 |
| Copies' lanes counted as built (every second copy reversed); belts into copies checked; runs may end at a reversed copy; consumers cut to what producer belts bring; spare producer machines; turning lanes shared; one-column stack retried in two | Silicon first layout 3.6 → 4.9 furnaces; 675 → 712.5–795/min (same host: 712.5 vs 675, 894 s vs 2620 s) | 0048 |
| Belts straightened after burying (stretches between anchors routed again on the finished block); Fan-out splitter spots ranked by their belt sent off | Aramid 24: 3 loops → 0, 2710 → 2663 entities, 49 → 26 s | 0051 |
| Byproducts sorted out every time (spare machines from routed starvation, fewer machines rather than riding, Extensions keep sorting); sorted-out byproduct belts merged through a splitter after routing | Rayon: riding 1 → 0, biomass belts 6 → 3 (696.87 → 646.87/min) | 0052 |
| A column between neighbours' side pipes of two fluids (agitators); the Precheck skipping a Sub-Block no structured variant routes | Anthraquinone 3937.5 → 10875/min (34 → 85 machines) | 0053 |
| A byproduct a Use takes alone tapped off its producers' belt by a filter splitter (a Recipe Loop's tap); untapped in Maximize no fit | Perylene: pyrite riding to the belt's end 1 → 0; 2700 → 3300/min | 0054 |
| Supplied Items counted in their belt's flow; a belt of two Supplied Items sends one off and joins with the other; Layers bounded (steps, pruning); one by one first where columns fit none | Titanium plate (21 Sub-Blocks): nothing → 3750/min at 10 casting units; molybdenum 62.49 → 599.99 | 0055 |
| A try out of time: no spare-machines retry, the next halfway down; no sorting phase where no belt rides a byproduct alone | Titanium plate: first fit at 1190 s (none in 3000 s before), 8226.56/min with an Annex at 3625 s | 0056 |
| Starving for more output: Throughput down the chain (backpressure, untapped feeds bring nothing); starving tries only once nothing more fits without (last Annex, or above the best without Annexes) | Titanium plate's last Annex: +3 casting units, 8226.56 → 9351.56/min, none starving; molybdenum and small parts unchanged | 0057 |
| Work no layout used, cut: variants alike built once; pipe-row shifts only where unshifted rows starve; designs kept for tries alike; Layers' chain-width bound; Parting, spots and room counts memoized; layouts starving as routed not finished; no fallback without splitters where a byproduct is tapped; each Sub-Block's first design that fits first | Same layouts: small parts (deterministic) 72 → 55 s, molybdenum 3248 → 2660 s; kicalk 40 min 412.8 → 460.8/min; titanium every fit sooner (7101.56/min at 3602 → 3229 s) | 0058 |
| A splitter evening two belts that finds no room fails the layout at once in tries that may not starve (routed again with it first, else room round it); candidates get twice as long as designing | Titanium at 12: 25 candidates 51 → 45 s, no fit either way; molybdenum (vs before 0058) 462.49 → 599.99/min, best at 548 → 287 s | 0059 |
| Tries at once: the bisection's next steps beside the try under way (were they not to fit; were the fewest to fit), stopped once they can tell nothing; Annexes, Giving Way, sorting and starving tries too; Annexes beside two first layouts (most machines; most machines and Annex room) | Titanium 1 h: 5601.56–8226.56 → 9750/min (three runs each), first fit 1224 → 51 s; molybdenum best at 560 → 158–210 s; kicalk 470.4 → 502.4/min (twice) | 0060 |
| An Annex's belt of a train item off a splitter on the block's belt of it (after the Annex is laid out; cheapest way over what it frees) | Py coalbed gas: drill heads 2 belts from the train → 1, same rate; vanilla circuits 40 × 30: 810 → 900/min (the freed room held another Annex) | 0061 |
| Fluids fed back through valves (top-up in, overflow out); the top-up's valve planned at its Sub-Block's connection before the pipe it tops up is routed; no placement link for the pipe fed back | Py coalbed gas: 2 offshore pumps → 1; seeds 2–4 7087.5–8287.5 → 7200–8325/min (one seed lower by search luck). Routed after, the fed-back pipe shut the pump's connection in: 11 extractors fit 1 seed in 6 | 0062 |
| Fuel as an ingredient of the recipe in the chain (made where the user makes it, else by train) | Py coke 60/min: every layout starved 9 (the coal the BOFs burn unmade) → 60/min valid | 0063 |
| A step taking more than a belt of a byproduct from several producers: a belt tapped off each, every machine from either; copies in columns chain; sorted paths planned with what rides along | Py coke 116²: 2520/min (3 + 3 + 1) → 2880 (5 + 3) | 0064 |
| A loop taking all its producer makes: its link through the taps, ending there; a train pipe only to steps taking it by train | Py hot air: nothing → 6000/min | 0065 |
| One Item a Belt (the user's rule): each product its own belt where a byproduct would ride into a Sub-Block; filter splitter for train-only byproducts | Py coke: 6 towers in one chain, nothing riding (3352.5 → 2160/min, the rule's price in room) | 0066 |
| Fluid temperatures in the chain: a taker at a temperature only from a step making it so, fed-back fluids only to those taking them so, pipes of two temperatures apart | Py hot air: gas by train 16842 → 505/min, 184 × 12 → 59 × 48 | 0067 |
| A Sub-Block finding no room tried placed first; a Supplied Item more than a lane on its own belt (not by train); room east of a Sub-Block sorting its belt to the train | Py coke one chain 6 → 7 towers (2160 → 2520/min); small parts 2775 → 3000 | 0068 |
| The output edge chosen (right, up, down): the block still runs west to east, only the last legs to the train turn | Py small parts valid up and down; coke 3 towers up | 0069 |
| A closed fluid loop (given back all it takes) only filled by train, no overflow; a burner unable to burn the Fuel burns its own category's | Py hot air with molten salt made: no build ("burns biomass fuel") → valid 6000/min | 0070 |

## What failed, was reverted, or must not be done

- **Templates and fixed rules** (0002, 0004). A static rule (max-reach tunnels, fixed rows) blocked the layouts it was meant to enable. Add an option the search can choose instead.
- **Routing Modules again inside the Compound Block** (0005, 0006, 0017). Do not route a copy round a Fixture either. Give the Module a design that routes on its own, leave machines out, or stand them apart.
- **Maximize tries in parallel workers** (0008). They slowed the deciding try by a third, and the Foretelling usually made the second unnecessary. Superseded by Tries at once (0060): with tries of 1000 s and a Foretelling far off (Py titanium plate), running the bisection's next steps beside the try under way found in minutes what one at a time took an hour for, and counts above a try out of time the bounds never reached.
- **Fan-out runs across columns** (0011). Their lines crossed and failed to route more often than they saved.
- **A design check letting a splitter balance an Internal Path's belts** (0019). More designs passed, but each try spent its time on layouts whose splitter then found no room: 1458 → 1150. It was dropped.
  - General lesson: letting more designs pass that later fail to route lowers the result.
- **Searching every spot for every Sub-Block** (0018). A few spots far apart let the search see more candidates.
- **Designs whose rows span the City Block** (0018). They changed nothing that backtracking did not.
- **Every splitter spot tried** (0026). Py science pack 2 went from 40 s to 340 s. Capping at the 8 cheapest missed the spot that was needed. Rank spots by belt length, and give up at once when there is no way on.
- **Lending Band corridors top first** (0025). Links found no way.
- **Mirrored twins kept freely** (0028). They crowded out other designs (a row 901 wide). Keep a variant only where it beats every non-variant.
- **Sorting the search's chained routes out after a turn** (0046). Titanium starved 90/min, or took 30 s to fail.
- **Assuming more machines always starve more** (0023). Starvation comes and goes with the Count, and so does routing (0025, 0027). Never bound tries hard on one starving or unrouted number. Room is monotonic: a try that found no room bounds everything above it.
- **Squeezing in a City Block** (0007). Fixtures cannot move.
- **Making Way's tenth and building apart in crowded rows** (0047). The budget went on one row, and the machines built apart found no room. That is why Giving Way exists.
- **Fractional machines in Annexes** (0032). Each failing try cost 15–35 s for nothing.
- **Caching designs between tries** (0032). Rates differ per try, so a cache would seldom hit.
- **Aggregate starvation** (0001). Keep the per-edge, belt-order walk.
- **A design-level check counting only one side** (0048).
  - Copies were checked on their belts out, not their belts in.
  - Fixing the out side alone promoted copies of two washers, whose second input belt cannot chain.
  - When a check gets looser, check the other end of the same path too.
- **Reserving shared turning lanes in compose** (0048).
  - Narrower stacks in Placement, together with reservations that newly applied (one lane now within reach), hemmed in vrauks' links: "out of time routing the links".
  - Each half alone passed. When two changes interact, bisect by halves in a scratch copy of `js/` before giving up on either.
- **A Giving Way top taken from the cap alone** (0048). With no cap (plain Maximize), it tried 14 furnaces when 5 did not fit.
- **Time limits checked only between candidates** (0049). One candidate's Placement in an Annex's crowded room took 5–8 s, and its retries raised the try's candidate count. Tries ran half an hour past a 1000 s budget. Any loop that can grow (backtracking, retries) needs the deadline inside it.
- **A Foretelling from the box round the Sub-Blocks** (0024). In Layers that spans nearly the whole block, so Maximize climbs one machine a try: vrauks 31 → 50 at about 30 s each; kicalk took more than 50 min to reach 89.

- **A post-pass anchored only on belt pieces** (0051). An inserter picks from a tunnel's end too: anchoring only plain belts let straightening move a copy's internal path and broke "no inserter moves route …". Use validity.js `inserterTiles` for what an inserter reaches.

- **Merging byproduct belts while routing** (0052). A merge took tiles that a trunk routed later needed, so that trunk found no way and the whole layout failed. Merge after routing, on the finished block, where every belt's way is already known.
- **Phases that lay a layout out again with `unsorted`** (0052). An Extension's re-lay brought byproducts riding back. Any re-lay must keep the riding count it replaces.
- **A check that throws ended the try as if it starved** (0053). The Precheck's structured-only design threw for a Sub-Block that random draws route, and Maximize's tries above 2 failed in 3 s. When Maximize fails fast where `attempt` fits, diff the options Maximize passes (`--precheck`).

- **Structured variants with a fixed gap 0** (0053). A machine with connections on both sides (Py agitators) never routed in a plain row or a Copy: neighbours' pipes touch. When only random draws route a Sub-Block, look for what the plain variants fix that the draws vary.

- **A rank criterion blind to the user's complaint** (0054). `rankOf` called a belt sorted because one consumer on it took the byproduct, though it rode on past to a dead end. When the user reports a clog the summary says is not there, check what the counter counts before trusting it.
- **A fallback that keeps a layout the user's rule forbids** (0054). A tap with no room fell back to by train, and its byproduct rode on; Maximize kept it in an Annex. Make such a layout no fit in `perfect` tries.

- **An exhaustive enumeration with no bound** (0055). Layers weighed every way of the Sub-Blocks in columns: fine at 10, never returned at 21. When a try hangs on the first candidate with no event, look for a product over Sub-Blocks first. Pruning alone is not a bound: a pruned tree can still be walked forever; count steps.
- **A starvation constant across every candidate** (0055). Every prepared layout starving the same amount, whatever the designs, points to the flow plan (compose.js `groupRoutes`, `supplyJoins`), not to the designs. Print `simulate` on `ready.routes` for the first one.
- **`--profile-slow` showed no JavaScript frames** (0055): only libc and libnode, the spawning parent's ticks. Timestamped phase logs (placement start and end, each routing task, Layers) found the hang in minutes instead.
- **`pkill -f`, again** (0055). A pattern that matched the shell's own command line killed the runs started in the same command. Kill by PID only.

- **A phase that cannot succeed, run at full budget** (0056). Maximize's sorting phase retried three counts for a belt riding two byproducts, which no filter splitter sorts out: 3087 s for nothing, and no time left for Annexes. Before a phase retries, check that what it fixes can be fixed.
- **Banded Layers** (0056). Two bands of columns where one is too wide gave the same layout as one-by-one placement and cost time: what kept Layers from fitting were single-module stacks taller than half the block. Look at the stack sizes (`place.mjs`) before building a placement mode.
- **Routing tapped byproducts and Supplied Items earlier** (0056). Among the links between Sub-Blocks rather than after all of them: no Count fitted that did not before.

- **Starving first, Annexes after** (0057). A starving main layout of 3.3 molybdenum furnaces beat 2 that starve nothing (462 vs 400/min) and left no room for the Annex of 2 the other way found (800). A phase that grows an early layout must be weighed against what the later phases lose; put it last where it can only add.
- **A perfect try passes over designs whose estimate starves** (0057). Titanium's Annex of 1 failed after 2017 s perfect; a non-perfect, bounded try found 3 starving nothing in 900 s. When perfect tries fail at small counts, try the same count with `--starving` before blaming room or routing.
- **A cache of designs between tries by rate** (0032) still holds: tries at other Counts differ. Tries at the *same* chain do repeat (an Annex's first try in each Annex's room, starving tries after perfect ones): those are kept now (0058), keyed by everything designing reads, the random numbers drawn on from where the first left off.
- **More search, less total** (0060). Tries at once found more machines in kicalk's first layout (78, then 66, where one at a time stopped at 64 and 63), which left its Annexes less room: 384 and 371.2/min against 470.4 and 432. Maximize's first layout is greedy; when a phase finds more of it, check what the phases after it lose.
- **A speed-up that shortens the search** (0059). A try's candidates got "as long as designing took" (0030); making designing 2–3× faster cut molybdenum oxide's 10 s tries short, and Maximize found 1 + 1 furnaces, not 3. When one phase gets faster, check what else is timed off it.
- **Fallbacks tried on every failing candidate** (0058). Across every instrumented run, no fallback made a fit; titanium plate spent half its search on candidates going through them. Where a fallback provably cannot fit (without splitters a tapped byproduct comes by train), skip it.
- **Throughput without backpressure** (0057). A layout whose tapped byproduct fell back to the train showed no Starvation and delivered its full rate; in the game the byproduct fills its belt and stops the producer. Model what cannot leave as well as what cannot arrive.

- **A layout that is valid but wrong in the game** (0067): the catalog had no fluid temperatures, so the chain fed 100° gas to recipes wanting 250° at least. When a user says the game would not run it, look for data the catalog drops (`scripts/build-catalog.mjs` on the dump) before the layout code.
- **A chain that grows without bound past some Count** (0068): print `planSubBlocks` machine totals at n, n+0.5, n+1 (`plan.mjs`). Py coke went 75 → 505 machines from 7 to 8 towers: a Supplied Item over a lane dropped to the train, and the step making it made everything again. Tries above such a jump can never fit, whatever the layout.
- **A user rule that costs rate** (0066). One Item a Belt cut coke 3352.5 → 2160/min and molybdenum 600 → 387.5: a belt more at every machine making a byproduct. Build the rule as asked, measure what it costs, give it a toggle, and say the cost plainly; don't quietly weaken it.
- **Balancing belts from several sources by shares** (0064). Feeds of one byproduct from two producers, each into half the machines, came out 700 and 766 for 733 each (whole belts of producers), and spare speed (headroom) is often 1.00 exactly. Run each source's belt past every machine instead: nothing to balance.
- **A failure every candidate shares that names a belt not starting at the west edge, or an inserter with nothing to move** (0064, 0065): look at what a post-pass (compact.js) or a fallback did to that belt before the search. A tap's filter splitter was taken for a sorted-out byproduct's; a loop's tap was never routed and its feed fell back to the train from the east.
- **Starvation equal in every candidate from build start** (0063), again (0055): a Sub-Block's input that the chain did not size its producer for. Compare each Sub-Block's `inputs` with the rates the chain's steps make (`planSubBlocks` on `expandChain`) before touching the search: plan.js added a burner's fuel the chain never counted.

- **run.mjs builds lost their search results before ADR 0070's fix.** Each strategy's child sent its layouts while the search never yields, and the queued messages were dropped at its exit. Only small early ones arrived, so builds showed "spread" layouts alone, and stopped improving early. Build A/Bs before then (ADR 0065, ADR 0067's hot air) compared partial results. Py hot air at 300 s: 123 × 38 → 116 × 33, with the search's own layouts at 110 × 36.

## Rules every change keeps

- **Rank order:** Starvation, then Recipe Loops by train, then byproducts riding, then output inserters at drops, then Compactness, then entities (`rankOf`). A Maximize fit is a layout without Starvation; once nothing more fits without, a layout that starves counts by what it delivers (Throughput, ADR 0057).
- **A try is one layout search at one Count** (0007). Do not search the rate inside one layout search: designs change with the Count.
- **Every aggressive mode has a fallback to the old behaviour,** tried next on failure:
  - Making Way → solid;
  - Fan-outs → last → none → no splitters;
  - sorted → riding;
  - gatherer → by train;
  - Draw → make it after all;
  - Extension → own Sub-Block.
- **Gate new phases to where they pay:**
  - Giving Way runs only in a crowded site, for the first Goal only, after Filling.
  - Sorting runs only where something rides.
  - Bands runs only for Fixture rows.

  A phase that runs everywhere costs time on every setup.
- **Time is part of the result.**
  - Report seconds for each run.
  - Failing tries above the best dominate (0015: 16 s → 47 s for +7%).
  - Every new try type needs an early exit: a probe, a precheck, `timedOut` bounding only like starvation, or giving up when there is no way on.
- **Wall-clock budgets** (0032).
  - On a busy host the same run finds less: one run alone reached only 101 farms in its first layout.
  - A/B runs go side by side on the same host, same seed, same budget.
- **Checks:** `validateBlock` and `simulate` on every result. Check joined layouts (Annexes) together: a tunnel of one can pair with the other's.
- **Edits** (move, reshape, turn) must keep a layout's own properties: `edit.giving`, `rode`, `entries`.

## Open limits: candidate next steps

These come from the ADRs' "Still:" sections.

- **Kicalk/vrauks Maximize** climbs one machine a try, because the Foretelling learns from a box that spans the block (0024). A better room estimate, or bigger steps once the climb is steady, would save tens of minutes.
- **Bands:**
  - cuts at one Fixture column at most;
  - a Part is one or two rows of a whole design;
  - Parts that divide unevenly cannot share a producer Part (0025).
- **Fan-outs:** none from producers in the search alone (0027). Splitters stand within 8 tiles of the entries. Copies in several columns do not share.
- **Annexes:**
  - do not draw items on belts (0032);
  - a fluid is drawn whole or not at all;
  - small Sub-Blocks are not shared (0031);
  - each Annex costs a whole Maximize.
- **Extensions:** fluids only; a solid's Sub-Block is not extended (0038).
- **Giving Way:** first Goal only. A try lays out n and then gives some up; it does not know in advance how many it will lose (0047).
- **Byproducts:**
  - one byproduct per belt is sorted out (0028);
  - a sorted route gets no splitter between its belts (0030);
  - the side-loaded lane's room is not checked (0040, 0041).
- **City Block:**
  - a Sub-Block never bends round a Fixture;
  - Nooks are taken only whole (copies are not spread over several Nooks).
- **Turned Sub-Blocks:** Fan-outs from producers are planned only for belts leaving east (0045).
- **Pull together:** slides only; it never swaps Sub-Blocks (0045).
- **Pipes:** one network per fluid, at most 6000 a second (routes.js `PIPE_CAPACITY`). A chain whose water passes that, like Py silicon above about 5.2 furnaces, can't fit one layout. Pipes split by consumer would help (0048).
- **Search order:** a design is paired with column counts only one change at a time, so a stack needing two columns *and* another Sub-Block's other design is seldom tried (0048).
