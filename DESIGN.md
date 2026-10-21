---
name: مصروفي (Masrofy)
description: Family money for Egyptian households, printed like a banknote.
colors:
  ink: "#0f3b2d"
  ink-raised: "#16503d"
  on-ink: "#eef5ef"
  on-ink-muted: "#a6c2b4"
  primary: "#0e6a4c"
  primary-hover: "#0b5a40"
  primary-soft: "#dcebe2"
  on-primary: "#f6fbf8"
  gold: "#c9973a"
  gold-bright: "#e2bb55"
  gold-text: "#87621a"
  gold-soft: "#f4e7c6"
  underprint: "#ecf0eb"
  surface: "#fbfcfa"
  surface-2: "#f3f6f2"
  surface-3: "#e3e9e3"
  border: "#d8e0d9"
  border-strong: "#b9c7bd"
  text: "#13221c"
  text-muted: "#4a5c54"
  text-faint: "#5d6d65"
  income: "#0f7a4f"
  expense-sienna: "#a33b27"
  transfer-indigo: "#2f4d8c"
  warning: "#835600"
  danger: "#b02a1c"
  expense-on-ink: "#ff9d86"
  income-on-ink: "#7ee0b1"
typography:
  denomination:
    fontFamily: "Readex Pro Variable, Segoe UI, Tahoma, system-ui, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Readex Pro Variable, Segoe UI, Tahoma, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Readex Pro Variable, Segoe UI, Tahoma, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Readex Pro Variable, Segoe UI, Tahoma, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Readex Pro Variable, Segoe UI, Tahoma, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 500
    lineHeight: 1.4
  wordmark:
    fontFamily: "Aref Ruqaa, Readex Pro Variable, serif"
    fontSize: "1.7rem"
    fontWeight: 700
    lineHeight: 1.1
rounded:
  control: "10px"
  container: "14px"
  plate: "20px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "22px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.container}"
  plate:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.plate}"
    padding: "26px 30px"
  nav-rail:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink-muted}"
    width: "248px"
  coin-button:
    backgroundColor: "{colors.gold-bright}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "60px"
  badge:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
---

# Design System: مصروفي

## Overview

**Creative North Star: "The Household Banknote"**

مصروفي is the money of one Egyptian family, so the interface borrows the one object every member handles daily: the banknote. The shell and the most important number on each screen are printed in intaglio bottle green with fine guilloche line-work, the coin from the logo is the only metallic, and everything else is a quiet, cool sage underprint so the numbers stay legible. It is an Operate surface: the world lends type, palette, density and one signature move; navigation, forms, lists and dialogs stay standard web controls in Arabic right-to-left.

The signature move is the **rosette**: a guilloche ring drawn from the month's own data. The outer white band is the share of the financial month already elapsed; the inner gold band is the share of income already spent. When gold runs ahead of white, the family is spending faster than the calendar. Every other decision supports reading money exactly: tabular digits, a denomination split (big pounds, small piastres and currency), and fixed semantic colors for income, expense and transfer.

Density is a daily-app middle: generous rows (60px) for touch, compact labels, one plate per screen. Light and dark are both first-class; the theme follows the device unless the person picks one.

**Key Characteristics:**
- Ink green shell (desktop rail, mobile tab bar, plates) in both themes.
- One reversed plate per screen carrying that screen's key figure.
- Data-driven guilloche rosette on the dashboard and budgets plates.
- Gold only from the coin: add button, active nav icon, security thread, spent arc.
- Cool sage underprint ground, never cream.
- Egyptian colloquial copy, no em dashes, no decorative emoji.

## Colors

A restrained underprint field with one committed ink green, one metallic gold, and three fixed money semantics.

### Primary
- **Intaglio Bottle Green** (ink): the desktop rail, the mobile tab bar, the drawer, toasts and every plate. Stays dark in both themes (dark-theme value is deeper) so the brand reads the same at night.
- **Banknote Green** (primary): interactive green for primary buttons, links, focus and selected states. Brighter mint in dark theme for contrast.

### Secondary
- **Coin Gold** (gold, gold-bright): the metal of the logo's coin. Lives on ink: the coin add button, the active nav icon, the dashed security thread, the rosette's spent band, plate icons. Use gold-text only when small gold text must sit on a light ground.

### Tertiary
- **Banknote Sienna** (expense-sienna): every expense amount, expense bars, the over-budget hatch.
- **Note Indigo** (transfer-indigo): transfers.
- **Income Green** (income): income amounts and on-track states.

### Neutral
- **Sage Underprint** (underprint): page ground, like the tinted underprint of a note.
- **Note Paper** (surface) and its two steps (surface-2, surface-3): cards, list group heads, tracks and segmented backgrounds.
- **Green-black Ink** (text) with muted and faint steps, all tinted green, all at least 4.5:1 on surface.

### Named Rules
**The One Metal Rule.** Gold appears only as the coin's metal and only where something is the brand or the current state: the add button, the active destination, the security thread, the spent arc. Never as a generic accent or a hover color.

**The Fixed Money Rule.** Income is green, expense is sienna, transfer is indigo, on every screen, in both themes, and always paired with a sign or an arrow so color is never the only signal.

## Typography

**Body Font:** Readex Pro Variable (with Segoe UI, Tahoma, system-ui)
**Wordmark Font:** Aref Ruqaa 700, the everyday Egyptian handwriting script, used for the wordmark only.

**Character:** One sturdy Arabic and Latin workhorse carries the whole interface; the Ruqaa wordmark is the single hand-lettered moment, like the issuer's name on a note.

### Hierarchy
- **Denomination** (650, 3.25rem desktop, clamp 2rem to 2.25rem on phones, line-height 1): the plate figure. Pounds at full size, piastres at 0.42em and currency at 0.34em, tabular digits.
- **Headline** (650, 1.75rem, 1.3): page titles; 1.3125rem on phones.
- **Title** (600, 1.0625rem): card titles and section heads.
- **Body** (400, 0.9375rem, 1.6): everything else; long text capped near 44 to 52ch.
- **Label** (500, 0.78rem): metadata, hints, plate labels, tab labels.

### Named Rules
**The Eight Sizes Rule.** Type uses only the eight steps from 0.78rem to 3.25rem defined as tokens. A new size needs a new token, not a one-off value.

**The Tabular Money Rule.** Every amount, count and percentage is set in an isolated left-to-right span with tabular figures, so columns align and signs stay attached to their numbers in right-to-left text.

## Layout

Desktop is a two-column grid: the 248px ink rail on the right (RTL start), a 64px sticky top bar, and content capped at 1160px with 28px padding and a 22px vertical rhythm. The dashboard puts the plate full width, then a 1.6fr / 1fr split (recent transactions, then stacked bills, budgets, accounts). At 1080px the split stacks; at 900px the rail disappears, the top bar shrinks to 56px, and a fixed 64px ink tab bar appears at the bottom (home, transactions, coin add button, accounts, more), with page padding cleared for it plus the safe area. Under 640px, form grids and multi-column grids collapse to one column and dialogs become bottom sheets. Rows that hold money adapt to their card's width through container queries, not the screen's.

## Elevation & Depth

Mostly flat and tonal. Cards are surface with a 1px border and no shadow at rest; they gain the soft shadow only on hover when they are clickable. Plates carry the soft shadow permanently because they are the reversed figure of the screen. Overlays (menus, dialogs, drawer, toasts) use the large shadow. All shadows are tinted toward the ink green in light theme.

### Shadow Vocabulary
- **Hairline** (`0 1px 2px rgb(15 59 45 / 7%)`): segmented active pill, switch knob.
- **Soft** (`0 1px 2px rgb(15 59 45 / 6%), 0 8px 24px -8px rgb(15 59 45 / 14%)`): plates, hovered clickable cards.
- **Lifted** (`0 24px 56px -12px rgb(15 59 45 / 28%)`): dialogs, menus, drawer, toasts.

### Named Rules
**The Printed Not Pressed Rule.** The world is print. No bevels, embossing, highlight gradients or inset shading to imitate metal or relief; the coin is flat gold with one engraved ring.

## Shapes

Gently rounded and consistent: controls 10px, containers 14px, plates and dialogs 20px, badges and the coin fully round. Plates repeat their outline as a 1px inner frame inset 7px, like the border of a note. Category icons and account marks are 12px rounded squares.

## Components

### Buttons
- **Shape:** 10px corners, 42px tall (34px small, 50px large).
- **Primary:** banknote green with near-white text, used once per region for the main action.
- **Secondary:** note paper with a strong border; **Ghost:** transparent muted text.
- **Hover / Focus / Press:** color shift on hover, a 2px green outline offset 2px on keyboard focus, scale 0.97 on press.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** note paper with a 1px border; list group heads on surface-2.
- **Internal Padding:** 20px (16px on phones); list rows at least 60px tall.

### Inputs / Fields
- **Style:** 1px strong border, note paper, 10px corners, 44px tall; label above, hint or error below.
- **Focus:** green border plus a 3px soft green ring.
- **Amount field:** 2.25rem tabular digits, 68px tall, currency addon on the end side.

### Navigation
- **Desktop rail:** ink with a faint engraving fading downward; Ruqaa wordmark in gold; items in muted on-ink, active item on a 10% light wash with a gold icon.
- **Phone tab bar:** ink, five cells, active label in on-ink with a gold icon, "more" opens the full rail as a drawer.

### The Plate (signature component)
The reversed figure of a screen: ink ground with a radial lift toward the start corner, guilloche wave engraving fading toward the figure, a double-rule inner frame, label, denomination figure, a row of supporting figures with gold icons, and an optional note. With an aside it shows the dashed gold security thread and the rosette. Used for: month remaining (dashboard), net worth (accounts), budgets left (budgets), month net (reports), amount due (bills).

### The Rosette (signature component)
Interlaced guilloche bands computed from r = R + a·sin(kθ + φ). Outer band (6 lines, 36 lobes) is time elapsed in white; inner band (8 lines, 24 lobes) is spend in gold, turning sienna past 100%. A gold tick marks today. The center holds days left or the percentage. Bright lines engrave in once on appear (1.4s, ease-out), and are visible by default if motion never runs.

### Coin Button
The phone's add action: 60px flat gold circle raised 26px above the tab bar, ink plus icon, one engraved ring, ink halo separating it from the bar.

## Do's and Don'ts

### Do:
- **Do** give each screen exactly one plate, for its most important figure.
- **Do** show amounts with `MoneyFigure` on plates and `.num` spans in lists, always tabular and isolated.
- **Do** pair every money color with a sign, an arrow, or a word.
- **Do** use the project's own line icons (24px, 1.8 stroke) for every icon, including empty states.
- **Do** write copy in friendly Egyptian colloquial with periods and commas.

### Don't:
- **Don't** use a cream or warm-paper ground; the underprint is cool sage.
- **Don't** use gold for anything but the coin's roles listed above.
- **Don't** add bevels, highlight gradients or inset shading to fake metal or relief.
- **Don't** put decorative emoji in UI copy or empty states (category emoji chosen by the family are content and stay).
- **Don't** use em dashes in visible copy.
- **Don't** put a colored side stripe on cards, rows or notices.
