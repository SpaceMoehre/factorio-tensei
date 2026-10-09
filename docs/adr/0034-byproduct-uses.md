---
status: accepted — refines the Byproduct glossary entry
---

# Byproduct Uses

A byproduct always left by train. In Py, many byproducts are themselves worth processing in the block: a hydroclassifier makes iron pulp along with as much iron slime, and both can be turned into iron plates. The user asked for two things. The chain should show its byproducts. And the user should be able to add a recipe that is made from a selected byproduct.

What changed:

- **Byproduct Use** (`uses`, chain.js). A step can give a byproduct to a recipe that takes it. The Use:
  - takes all of that byproduct the step makes;
  - is sized by that alone, as a row of the chain's linear system: its rate follows its step's;
  - gets its other ingredients the same way any step does (by train, or from a step made here);
  - sends every product it makes away by train, unless the user adds a Use for that product too, so the user can follow a byproduct as far as they like.

  A Use is keyed by its step and the item (`useKey`). A Use whose step no longer makes the item, or whose recipe no longer takes it, is left out.
- **A Use's products stay its own.** A Use's Sub-Block makes its item in addition to any step that makes the same item. Other steps never take from it, and it never counts toward a Goal (`producerOf` in flows.js leaves Use Sub-Blocks out). This keeps one producer per item for the steps, which much of the layout relies on: Sub-Blocks are found by item. Two Sub-Blocks may then make one item, for example molten iron, each with its own pipe.
- **Flows.** What leaves by train is counted per Sub-Block: what it makes minus what Sub-Blocks take from it (`taken`). A producer's route lists the consumers of each of its outputs: its belt runs through those taking its item and through the Use taking its byproduct, and a byproduct's pipe goes to its Use.
- **Bands** are not used with Byproduct Uses: a Sub-Block's parts give their byproducts to nothing.
- **The app.** Under each step, the chain lists:
  - its Uses, each with its recipe, building and modules, and a *By train* button that removes the Use and the Uses beneath it;
  - its byproducts that leave by train, each with its rate and a *Use in…* list of the recipes that take it.

Py iron pulp 600/min: the hydroclassifiers' 600 slime/min goes to a Use of 1 hydroclassifier (unslimed iron), and that Use's unslimed iron goes to a Use of 1 basic oxygen furnace (240 molten iron/min). The result is 38 × 14, with no Starvation.

Still:
- A Use's product never feeds a step that makes the same item (for example, the unslimed iron from slime feeding the unslimed-iron step of the pulp's chain). Doing that would need Sub-Blocks taking one item from two producers.
- A Use takes all of a byproduct, never a share of it.
