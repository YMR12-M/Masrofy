# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Egyptian households. One person opens a household account (صاحب الأسرة) and adds family members with fixed roles: owner, admin, member, child, viewer. Usage is split evenly between phone and desktop (confirmed): quick capture of an expense on the phone right after paying, and sit-down review, reports, and management on a computer.

## Product Purpose

مصروفي tracks personal and family money in one place: cash, bank, e-wallets (Vodafone Cash style), credit cards, savings. Success is a family knowing where every pound went this financial month and staying inside budgets they set themselves.

## Positioning

Built for the Egyptian family, not the individual: shared and strictly private accounts in one household, a child's own pocket money, a financial month that starts on payday (day 1 to 28), Egyptian Arabic copy, EGP by default.

## Operating Context

- Recording happens right after spending, often one-handed on a phone; review happens on desktop at the end of a day, week, or month.
- The financial month is named by the month it starts in (start day 25 means "2026-10" runs 25 Oct to 24 Nov).
- Roles gate what each person sees. A private account is invisible to everyone but its owner, including the household owner.

## Capabilities and Constraints

- Accounts, transactions (expense, income, transfer), two-level categories, monthly budgets per category with an alert threshold, reports (month summary vs previous, by category, daily, 6-month trend, net worth), members and roles, audit log, CSV export.
- Server work in progress: recurring bills and installments.
- Planned, not built: savings goals, debts, جمعيات, notifications, CSV import, 2FA, mobile (Capacitor) and desktop (Electron) shells.
- Money is integer piastres everywhere; percentages are basis points; dates are YYYY-MM-DD in the household time zone.
- One currency per household.
- Arabic, right-to-left, light and dark themes.

## Brand Commitments

- Name: مصروفي.
- The user asked to evolve the existing identity rather than replace it: a wallet logo with a gold coin, deep money green, warm gold accent. Evolve these so the product stops reading as AI-generated.
- Palette (2026-10-21): the user asked to drop the green because it read as AI-generated, and chose navy ink with the gold coin. Green now only marks income.
- Voice: friendly Egyptian colloquial Arabic (confirmed), e.g. «لسه مفيش عمليات»، «حاول تاني».

## Evidence on Hand

- No demo data in the real database by policy. Default categories are created for every new household and are not fake data.
- No testimonials, users, or metrics exist. Never invent them.

## Product Principles

1. Recording a transaction must be the fastest thing in the app, from any screen.
2. The month answers one question first: how much is left, and am I on pace.
3. Privacy is absolute: what is private never leaks into shared views.
4. Money reads exactly: signs, colors, and digits are unambiguous in RTL.
5. Speak like family, not like a bank.

## Accessibility & Inclusion

- RTL first. Numbers are isolated LTR with tabular digits.
- Every flow works at 375px and on desktop, in light and dark.
- Destructive actions always confirm.
