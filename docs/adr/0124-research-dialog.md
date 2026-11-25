---
status: accepted — refines ADR 0121 and ADR 0122 (the page)
---

# The Research dialog

The user's rule: a dedicated modal to select which science packs and TURD upgrades the user has. Before, both were rows of Logistics (a box per pack; a checkbox and a fold of 60 selects).

What changed (index.html, app.js `renderResearch`, `choiceNote`, `offer`):

- **Research**, a button in the header beside Saved, its badge the packs held and, with TURD upgrades chosen, the choices made ("6/11 · 1 TURD"). It opens a dialog of two tabs.
- **Science packs**: a tile each, its icon and name, in the game's order, toggled; All, None. None ticked keeps an empty list: only what is on at start (setup.js `normalized`; before, an empty list read as every pack).
- **TURD upgrades**: "I choose my TURD upgrades" (off: TURD recipes offered with every pack ticked, none otherwise); on, a search, then every upgrade the packs research, its picture the first building it affects (catalog `turds[].affected`), its choices side by side with Not chosen, each saying what it does (`choiceNote`: its effect on the buildings it affects, the first one's where tiers differ, "(mk01)"; TURD machines; recipes unlocked and replaced). Then, under "Needs more science packs", the others, greyed, with the packs they still need.
- A change applies at once: the offer again, the Goals' chooser and the chain redrawn, saved.

Tests: an empty pack list kept, offering only what is on at start (science-packs.test.js); the dialog driven headless (packs ticked and saved, TURD upgrades on, a choice chosen, kept on reload, None and All).
