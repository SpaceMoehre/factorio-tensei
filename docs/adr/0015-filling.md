---
status: accepted — refines ADR 0008
---

# After the Foretelling, Maximize fills the City Block by trying

Maximize stopped where the Foretelling stopped. A layout found teaches it how loosely the City Block packs. A try ends at its first layout without Starvation, not its tightest, so that layout can be loose. The Foretelling then says that a few machines more would overflow the room, and no number above that was tried. Py kicalk in 230 × 230 ended at about 170/min with 260/min the only rate above it tried. The user set the rule: add ten of the machines making the end product, again while they fit; then halve, halving every time it does not fit, until the City Block is as full as it gets.

So once the Foretelling has no whole number left to try (or the whole numbers meet), Filling starts from the highest that fit:
- It tries 10 machines more, again while they fit.
- After a try that does not fit, it tries half as many more. A number no smaller than the lowest that did not fit counts as not fitting, untried.
- It stops below a quarter machine.

Fractional machines run the last one slower, as the rates between whole machines did. Filling replaces those, and the Foretelling holds it back nowhere: only a try tells.

Py small parts in 116 × 116: 3375/min instead of 3150/min, in 47 s instead of 16 s. Most of that time goes on the tries above, which do not fit. That time is the price; the user can stop at any point and keep the best so far.
