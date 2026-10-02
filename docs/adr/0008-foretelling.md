---
status: accepted — refines ADR 0007
---

# Maximize tries what the Foretelling says fits, and a try ends early

Each try of Maximize designs every Sub-Block for its number of machines and searches a layout. The designs change with the Count, so nothing of one try serves the next (ADR 0007). The time Maximize takes is therefore the number of tries times their cost. ADR 0007's tries started at the Goals' own rates and grew by the room left; a try that did not fit ran the whole search time. In a City Block, the first layouts either fit or nothing fits; later candidates almost never change that. So most of the time went to tries that told nothing new.

The Foretelling says up front how much room n machines' layout takes: tiles per machine for each Sub-Block, spread out by how loosely the City Block packs, against its room. Fixtures scattered all over the room, such as a grid of substations, leave room only for what fits between them. So the more stretches as big as a few machines' Modules a Fixture breaks, the less of the room counts. Maximize's first try is the most machines it foretells to fit. Each layout found teaches it the real tiles per machine (the try's designs) and the real spread (what its Sub-Blocks' boxes span). A number of machines whose modules, spread as loosely, would span more than the whole room is not tried: Maximize stops below it. After a try that did not fit, the next is no more than halfway down. The Foretelling knows nothing of designs that starve, and a number above them is a guess.

A try looks only for a layout without Starvation. Designs and layouts that starve are passed over before they are built. A try ends as soon as a Sub-Block's least starving design starves. Above the highest number designed without Starvation, the Side Output's Sub-Blocks are checked first; they are the busiest and the likeliest to starve. A try gives up a few candidates after its structured ones.

This is not a proven maximum. A tighter packing could fit the number the Foretelling skips. Don't run tries in parallel workers: two at once slowed the try that decides the outcome by a third, and the Foretelling usually makes the second one unnecessary.
