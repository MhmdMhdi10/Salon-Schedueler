---
inclusion: fileMatch
fileMatchPattern: 'packages/web/src/**/*.{ts,tsx,css}'
---

# Signature Design Language — enforceable rules

Anti-generic rules for the salon-luxe signature UI. These are the **floor**, not the
whole story: the full narrative (palette tables, type pairing, motif recurrence, layout
primitives) lives in `.kiro/steering/ui-ux-skills.md` → "Signature Design Language", and
several rules below are machine-enforced by `packages/web/src/styles/distinctiveness.test.ts`.
When in doubt, prefer a token over a literal and a logical property over a physical one.

- **Salon-luxe tokens only.** Style through the semantic palette tokens (`--color-primary`,
  `--color-accent`, `--color-surface`, `--color-text`, …). Never reintroduce the generic
  indigo/purple family — `#6366f1`, `#818cf8`, `#a855f7`, `#8b5cf6`, `#d946ef`, `#e879f9`
  (or `indigo`/`purple`/`violet`/`fuchsia` utility colors). _(guardrail-enforced)_

- **No default indigo→purple hero gradient.** Derive hero/brand backgrounds from palette
  tokens or the brand motif (solid `--color-surface`, a token-driven `Motif variant="band"`,
  or a warm `--color-primary`/`--color-accent` wash) — never a `linear-gradient(...)` of the
  indigo/purple family or `from-indigo`/`to-purple` gradient stops. _(guardrail-enforced)_

- **Editorial layout for 3+ peer features.** When a surface presents three or more peer
  features, compose with `FeatureMosaic` or `EditorialSplit` — never a single row of
  equal-width, centered icon-over-title-over-text cards. Vary section rhythm with
  `SectionRhythm`.

- **Display tokens for titles.** Hero and section titles use the display treatment
  (`--font-weight-display` heavier than body, `--line-height-display` tighter than body,
  `--tracking-display`) via the `text-display` utility — so headings never render visually
  uniform with body text.

- **Brand motif on brand surfaces.** Hero and brand surfaces carry the recurring `Motif`
  (`components/brand/Motif.tsx`). It is token-driven and `aria-hidden` by default, so it
  re-tints per theme and per tenant automatically; size it via `className` only.

- **Tokens-only + logical properties.** No raw hex/px/ms literals in authored styles; no
  physical `left`/`right` for flow-relative spacing — use logical properties/utilities
  (`ms`/`me`/`ps`/`pe`, `start`/`end`, `inset-inline-*`). RTL sign-flips use `rtl:`/`ltr:`
  variants. Rare legitimate literals opt out with an inline `// distinctiveness-ok: <reason>`
  comment. _(guardrail-enforced)_

- **Tenant accent via runtime vars only.** A salon's Brand_Accent is injected as runtime CSS
  custom properties on the scoped `TenantTheme` wrapper, never as authored color literals.
  Component_Library code keeps referencing tokens only; the on-accent foreground must clear
  WCAG AA (≥ 4.5:1 body text, ≥ 3:1 large/non-text).
