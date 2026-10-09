---
status: accepted — refines ADR 0012 and ADR 0034
---

# Recycled Byproducts

In Py, sodium hydroxide is made from slacked lime and salt, and it gives off limestone. The lime behind the slacked lime takes limestone. The chain brought limestone by train while the sodium hydroxide step sent the same amount away by train. The user asked for the byproduct to be fed back, closing the chain. If more is made than taken, a splitter should give the loop priority and send the rest on to the train.

What changed:

- **The chain** (chain.js). Once the rates are known, it looks at each item that comes by train only because it is not made here (`import`). If a step makes at least as much of it as a byproduct, the item comes from that step instead (the step making the most). The step taking it names that step in `goal.from`, the same way a Byproduct Use names its step. The flows link the two. The rates do not change, since a byproduct only follows its step. The chain lists these (`recycled`: item, from, into, rate, spare), and a byproduct's rate is what is left over.
- **Less than taken:** the item still comes by train. Topping a belt up from the train is not done.
- **Fluids:** recycled only where the steps taking the fluid do not feed the step making it. A fluid fed back comes by train, as a Recipe Loop's does: no splitter gives a pipe priority.
- **Fed back:** where taking the item closes a loop, the link is a Recipe Loop's feedback (ADR 0012), tapped from the producer's output belt through a splitter giving it priority. That belt carries every product of the producer on one lane. A splitter without a filter would send the producer's item into the loop and block it. So on a belt carrying more than the item, the splitter filters for it. A filter splitter never sends its item the other way, so a spare would back up and stop the producer. Where the belt brings more than the loop takes, a second splitter on the feedback's side gives the loop priority. Its other output turns onto the output belt from the side, two tiles on. Placement leaves room for it east of the producer.
- **Bands:** a Sub-Block's parts give their byproducts to nothing, so in Bands a Recycled Byproduct comes by train and its step's byproduct leaves by train, as before (Py vrauks: their empty barrels back into the water barrels, except in Bands).

Py sodium hydroxide at 60/min: 30 limestone a minute from its chemical plants to the lime's furnace through one filter splitter, and no limestone by train.
