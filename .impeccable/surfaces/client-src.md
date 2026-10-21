---
version: 1
slug: "client-src"
primary_target: "client/src"
related_targets: []
---

# Surface: Masrofy web app (all signed-in screens + auth)

Mode: Operate. Audience: Egyptian household members recording and reviewing family money, half on phone, half on desktop. Job: know what is left this financial month, whether spending is ahead of the calendar, and record a transaction in two taps from anywhere.

Constraints: evolve the incumbent identity (name مصروفي, wallet logo with gold coin, money green, gold) rather than replace it; Egyptian colloquial copy; RTL; light and dark; standard web controls; no em dashes or decorative emoji in UI copy.

## Direction contract

THESIS: The month is a banknote. The remaining money of the financial month is printed as an engraved note plate with a data-driven guilloche rosette. Refuses the category default of white cards, donut chart, and teal accent dashboard.

OWN-WORLD: Intaglio navy shell rail (palette moved from bottle green to navy and gold on 2026-10-21 at the user's request) with fine guilloche wave engraving; cool blue-grey paper ground (never cream); gold foil from the coin as the only metallic, used for the coin add button, the active nav glyph, the windowed security thread, and the rosette's spent arc; banknote sienna for expense, stamp violet for transfer; Readex Pro workhorse with heavy tabular numerals split like a denomination (big pounds, small piastres and currency); Aref Ruqaa only for the wordmark; plates carry a double-rule inset frame.

STORY: Open the app, read how much is left and whether the gold spent arc runs ahead of the white time arc, record an expense from the coin button or the top bar (N key on desktop), then scan the day-grouped recent entries, due bills, budgets and accounts.

FIRST VIEWPORT: Desktop 1440: navy rail on the right (248px) with Ruqaa wordmark, nav, user; top bar with household and the primary new-transaction button; full-width note plate (about 230px) with label, denomination-scale remaining amount, income and expense, pace line, and a 190px rosette at the far end; below, a 1.6fr/1fr grid with recent transactions and the stacked bills, budgets, accounts. Phone 390: slim top bar with wordmark; the same plate with a smaller rosette; bottom tab bar with home, transactions, a raised gold-rimmed coin add button, accounts, more.

FORM: Egyptian banknote security printing, position 1 on the ordered list (taken as the pick card), seed key ab29d97b.

Raises kept from declined challengers: state never by hue alone (emission-line rail); exactly one reversed plate per screen (timetable slide rack); fixed account furniture of color tile, glyph and name everywhere (character catalog); a small strict type scale with fixed label sizes (transit diagram); whole-cell grid reflow (Crouwel grid).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
