# CreditAI — Design system: "THE RED PEN"

The visual language of CreditAI is a manuscript under review. Warm paper, printed
text, and exactly three marks that carry meaning: a yellow highlighter for
evidence, a red pen for criticism, and a rubber stamp for verdicts. Everything
else is quiet: thin rules, monospaced numerals, generous whitespace.

- Light theme only. Paper `#faf7f0`, never pure white gradients.
- No decorative emoji anywhere in the UI; meaning comes from typography.
- Easy motion, honor `prefers-reduced-motion` (all animation collapses to 0.01ms).

## Concept rules

1. **Ink does the talking.** Primary actions are solid ink buttons, not colored ones.
2. **Blue is reserved** for links and the focus ring. Blue is never a button.
3. **One red pen.** Red (`--color-red-pen`) marks criticism, errors, and the margin
   rail. Nothing else uses red decoration.
4. **Numbers are printed.** IDs, scores, money, and timestamps are monospaced with
   tabular numerals.
5. **Sheets, not cards-in-cards.** A page is composed of "sheets" (paper-white, 1px
   line border, 10px radius). Never place a sheet inside a sheet; use a sunken
   paper inset instead.
6. **Annotations carry meaning:** highlight = the user's own evidence; red
   underline = a problem; margin note = the editor's comment; stamp = a verdict.
   If a mark does not say something, remove it.

## Tokens

### Surfaces and lines

| Token                | Value       | Use                                    |
| -------------------- | ----------- | -------------------------------------- |
| `--color-paper`      | `#faf7f0`   | Page background                        |
| `--color-paper-sunken` | `#f1ecdf` | Insets, strips: quiet notice areas     |
| `--color-sheet`      | `#fffefa`   | Card/sheet surface                     |
| `--color-line`       | `#e2dac8`   | Hairline rules and sheet borders       |
| `--color-line-strong`| `#cbbfa5`   | Dashed rules, neutral label borders    |

### Ink (text)

| Token          | Value     | Contrast on paper | Contrast on sunken/sheet |
| -------------- | --------- | ----------------- | -------------------------- |
| `--color-ink`  | `#17140f` | 17.17/1           | highest                    |
| `--color-ink-2`| `#4a453c` | 8.89/1            | 8.06/1 / 9.43/1            |
| `--color-ink-3`| `#6b655a` | 5.40/1            | 4.90/1 / 5.73/1            |

All AA pass for body text (4.5/1 minimum measured Oct 2026).

### Ink equivalences

| Token          | Value     | Color       | Contrast passes                                |
| -------------- | --------- | ----------- | ---------------------------------------------- |
| `--color-red-pen` #c2331f | Criticism, errors, margin rail | 5.18/1 on paper; **4.51/1** on `red-soft` (borderline, keep type size ≥ 14px) |
| `--color-red-soft` #f9e3de | Danger panel wash |                                                |
| `--color-highlighter` #ffe27a / `--color-highlighter-soft` #fff3c4 | Evidence highlight |     |
| `--color-green` #2f6b4f / `--color-green-soft` #e1efe6 | Met, paid, refunds | 5.88/1 paper; 5.30/1 on green-soft |
| `--color-amber` #8a5a00 / `--color-amber-soft` #fcebc8 | Reserved, pending | 5.54/1 paper; 5.04/1 on amber-soft |
| `--color-blue` #25418f | Links only, focus ring (`:focus-visible` outline) | 8.80/1 paper |

> Decorative marks are all ≥ 4.5:1. If a new pairing lands below 4.5:1, darken the
> ink tone instead of shrinking text.

### Type

| Class         | Mobile        | Desktop       | Use                            |
| ------------- | ------------- | ------------- | ------------------------------ |
| `type-display`| 44px/48       | 64px/66       | Page `<h1>` and the landing hero (Instrument Serif, weight 400) |
| `type-h2`     | 36px/42       | same          | Section headings (Instrument Serif) |
| `type-h3`     | 20px/28       | same          | Sub-sections, sheet titles (Geist, weight 600) |
| `type-label`   | 12px/16       | same          | Micro labels (Geist 600, uppercase, tracking 0.08em, ink-3) |
| body          | 16px/26       | same          | Default on `html`/`body`       |
| display font  | `--font-display` = Instrument Serif via `next/font/google` (weight 400, normal + italic) |
| text/mono     | `--font-sans` = Geist, `--font-mono` = Geist Mono, both via `next/font/google` |

Fonts load with `next/font/google` (`swap`), so no layout shift: the CSS variables
(`--font-geist-sans`, `--font-geist-mono`, `--font-instrument-serif`) are wired in
`app/layout.tsx`.

### Shape and depth

| Token            | Value | Use                          |
| ---------------- | ----- | ---------------------------- |
| `--radius-sm`    | 6px   | Buttons, inputs, body labels |
| `--radius-md`    | 10px  | Sheets, panels               |
| `--shadow-sheet` | hairline lift | Hero sheet only (`sheet-hero`) and the toast |

Heavy drop shadows are not used anywhere else. No rounded-full pills, no filled
low-contrast pastel fill chips in the UI (only bordered mono labels).

## Component list

Shells and navigation: `PublicShell` (announcement strip, wordmark, footer),
`AppNav`, auth layout. Sheets and structure: `Sheet`, `Stat`, `Rule`.

Annotations (`components/ui/annotations.tsx`): `Highlight`, `RedUnderline`,
`MarginNote`, `Stamp` (tones: red / ink / green / amber), `Rule` (dashed hairline,
optional centered label). Usage rules:

- `Highlight` — the user's own evidence inside prose/resume text.
- `RedUnderline` — criticism or a specific wrong phrase.
- `MarginNote` — the editor's aside: roast lines, recommendations, agent messages.
- `Stamp` — verdicts and statuses only; one per row/area, mono uppercase, −3°.
- `Rule` — separates editorial sections; use `label` for "or" joins (auth pages).

UI toolkit: `Button` (primary/secondary/ghost/danger), `Input`, `Label`,
`Textarea`, `Badge` (met/partial/missing map onto green/amber/red mono labels),
`Toast` (`role="status"` + `aria-live="polite"`), `Skeleton`, `CopyField`
(copy button announces "Copied" via `aria-live`), `EmptyState` (dashed sheet), `SystemStatusCard`
(mono OK/DOWN stamps), `ConfirmDialog` (focus trap, Escape, aria-labelledby; used
by delete-data), `PayPalCheckout` (pack sheets, stable 48px button container).

Shadows: only `sheet-hero` and the fixed toast carry the soft lift.

## Typography scale

- Page titles (`h1`) always `type-display` — identical scale on every route,
  including auth sheets, 404 and error pages. No one-off sizes remain (`34px`
  headings were consolidated into the scale in the Phase 6 pass).
- `type-h2` for full-width sections; `type-h3` inside sheets; `type-label` for
  micro-copies like field eyebrows and column headers.
- Long-form (privacy page) uses the same scale at max-width 680px with sections
  separated by whitespace, not boxes.

## Accessibility notes

- Focus: global `:focus-visible` 2px blue outline; all interactive targets ≥ 44px
  on mobile (40px ≥ 768px).
- Status regions: toasts, checkout panels, refund feedback, banner use
  `role="status"`/`aria-live`; destructive errors use `role="alert"`.
- Keyboard: dialogs trap focus and close on Escape; mobile nav closes on Escape;
  all actions are real buttons/links.
- Contrast pairs (see tables above) all pass WCAG AA at 4.5:1; smallest margin is
  red-on-red-soft at 4.51:1.
- `prefers-reduced-motion` disables the spinner, highlight reveal, and reveals.

## Screenshot placeholders (README)

Eight screenshots planned for the README. Placeholder files go in `docs/screens/`:

| # | Screenshot            | Page                                    | Planned capture                                     |
| - | --------------------- | --------------------------------------- | --------------------------------------------------- |
| 1 | Landing               | `/`                                     | Full-page desktop 1280 - hero + specimen + pricing  |
| 2 | Analyze result        | `/analyze` (run)                        | Verdict + roast + requirements column               |
| 3 | Fabrication warning   | `/analyze`                              | "Unverified details" MarginNote block               |
| 4 | Credits               | `/credits`                              | Balance stamp + three pack sheets                   |
| 5 | Refund desk           | `/credits#refund`                       | Refundable stats + refund list with stamps          |
| 6 | Transactions          | `/transactions`                         | Desktop ledger table with type labels               |
| 7 | Judges                 | `/judges`                              | Stepper + system status + "What to look for"        |
| 8 | Mobile analyze        | `/analyze`                              | 375px: form sheet + history cards                   |

To produce them: run `npm run dev`, login as demo judge, walk the judge guide
(`/judges`), and capture with a 1280px viewport (steps 1-5) and a 375px viewport
(step 8).
