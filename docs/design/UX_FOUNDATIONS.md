# CS2 PRO — UX foundations (Fase 1, Prompt Mestre V2.0)

The base for Phases 2–4. It records what exists in the code; it does not invent
formulas, benchmarks, plans or progress tracking.

## 1. Principles

1. **Null is not zero.** A missing value renders `—` (`NOT_AVAILABLE_MARK`), is announced
   to screen readers as `common.notAvailable` and carries `data-metric-missing="true"`.
   A measured `0` stays `0`. Use `MetricCard` / `NumberCell` / `formatNumber`; never
   `?? 0` on display.
2. **No demonstration values in production.** `DEMO_DATA=false`. Capabilities without an
   engine render `NotAvailablePanel` with the reason (`real.engine.notAvailable`).
3. **Every metric name is explained.** Use `<MetricTerm id=…/>` wherever a metric is
   labelled; never hard-code "ADR", "KAST", etc. in UI copy.
4. **Locale-aware formatting.** Numbers and dates go through `src/lib/format.ts` with
   `useI18n().intlTag`. Never `toFixed()` or `iso.slice()` for display.
5. **Semantic tokens only.** No raw palette classes (`amber-500`, `red-600`…) in product
   surfaces; use `warning`, `destructive`, `success`, `info`.

## 2. Tokens (`src/styles.css`, Tailwind v4, oklch)

| Group    | Tokens                                                                                  |
| -------- | --------------------------------------------------------------------------------------- |
| Surfaces | `background`, `card`, `elevated`, `popover`, `muted`, `secondary`, `accent`, `sidebar*` |
| Text     | `foreground`, `muted-foreground`, `*-foreground` pairs                                  |
| Brand    | `primary`, `primary-hover`, `primary-strong`, `ring`, `gradient-primary`, `shadow-glow` |
| Status   | `success`, `warning`, `destructive`, `info` (+ `-foreground`)                           |
| Data viz | `chart-1` … `chart-5`                                                                   |
| Shape    | `radius-sm` … `radius-4xl`, `shadow-card`, `gradient-surface`                           |
| Type     | `font-display` (Chakra Petch), `font-sans` (IBM Plex Sans), `font-mono` (IBM Plex Mono) |

Badge recipe (status): `rounded-sm border border-<status>/50 px-1.5 py-0.5 font-mono
text-[10px] uppercase tracking-wider text-<status>`.

## 3. Components

| Component                                                               | File                                                       | Use                                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `PageHeader`                                                            | `components/common/PageHeader.tsx`                         | Eyebrow + title + description of every page                     |
| `MetricCard`                                                            | `components/common/MetricCard.tsx`                         | Single KPI; `value` may be `null` → not available               |
| `MetricTerm`                                                            | `components/common/MetricTerm.tsx`                         | Metric name + definition popover (keyboard/touch, 24 px target) |
| `GlossaryList`                                                          | `components/common/MetricTerm.tsx`                         | Full glossary (`<dl>`)                                          |
| `ChartCard`                                                             | `components/common/ChartCard.tsx`                          | Titled section/card                                             |
| `EmptyState`, `ErrorState`, `LoadingState`                              | `components/common/States.tsx`                             | Generic states                                                  |
| `WithOverview`                                                          | `components/real/RealData.tsx`                             | Loading / error-with-retry / data wrapper                       |
| `OverviewStatePanel`                                                    | `components/real/RealData.tsx`                             | Player data states (below)                                      |
| `NotAvailablePanel`                                                     | `components/real/RealData.tsx`                             | Capability without engine; optional `action`                    |
| `RealAggregates`, `RealMatchesTable`, `AdmissionBadge`, `RecentUploads` | `components/real/RealData.tsx`                             | Real-data surfaces                                              |
| `ProScoreContext`                                                       | `routes/_authenticated/performance.tsx` (`#cs2-pro-score`) | Explains the score's status                                     |

## 4. State patterns

| State                    | Source                     | UI                                                          |
| ------------------------ | -------------------------- | ----------------------------------------------------------- |
| Loading                  | React Query pending        | `LoadingState`                                              |
| Error                    | query error                | `ErrorState` + retry                                        |
| `EMPTY`                  | overview                   | Upload CTA                                                  |
| `PROCESSING`             | overview (polls every 5 s) | Link to history                                             |
| `IDENTITY_PENDING`       | overview                   | Explains Steam identity pending                             |
| `BLOCKED` / `FAILED`     | overview                   | Honest reason, link to history                              |
| `READY`                  | overview                   | Real data                                                   |
| Missing metric           | value `null`               | `—` + sr-only "Não disponível" + hint                       |
| Limited admission        | `admission = LIMITED`      | `AdmissionBadge` (warning) with limitations in `aria-label` |
| Capability not available | no engine                  | `NotAvailablePanel`                                         |

## 5. Canonical metrics and glossary

Ids in `src/lib/glossary.ts` (`METRIC_IDS`); text in `src/i18n/locales/ux/*` as
`glossary.<id>.label|short|definition` in pt-BR, pt-PT, en, es, fr. Windows are
interpolated from engine config (`{tradeWindow}` = `TRADE_WINDOW_SECONDS`,
`{flashWindow}` = `FLASH_ASSIST_WINDOW_SECONDS`) so copy and engine cannot drift.

| id                               | Canonical name (pt-BR)      | Definition source                                                        |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `kd`                             | K/D                         | kills / deaths, summed over matches with data                            |
| `adr`                            | ADR                         | damage / rounds played                                                   |
| `kast`                           | KAST                        | K/A/S(proven)/T, T within trade window                                   |
| `hsPercent`                      | HS%                         | headshot kills / kills                                                   |
| `rating`                         | Rating da partida           | `compositeRating` (per match, relative; **not** HLTV, **not** PRO Score) |
| `winRate`                        | Taxa de vitória             | wins / (wins + losses)                                                   |
| `openingKills` / `openingDeaths` | Abates / Mortes de abertura | first kill of round; undeterminable rounds excluded                      |
| `tradeKills`                     | Trade kills                 | within trade window, same round                                          |
| `flashAssists`                   | Assistências por flash      | game flag, else flash within flash window                                |
| `clutch`                         | Clutch                      | last alive vs ≥1; unavailable without kill events                        |
| `utility`                        | Utilitários                 | HE, flash, smoke, molotov/incendiary, decoy                              |
| `proScore`                       | CS2 PRO Score               | **not computed** (see gaps)                                              |

## 6. Information architecture (routes)

Sidebar (`src/config/navigation.ts`): `/dashboard`, `/matches`, `/performance`,
`/player-dna`, `/analysis`, `/training`, `/coach`, `/profile`; primary action `/upload`;
`/admin` for admins. Public: `/`, `/login`, `/register`, `/reset-password`.

Deep links: `/performance#cs2-pro-score` (score context, linked from the Dashboard panel),
`/performance#glossary`.

## 7. Documented gaps (do not fill without a specification)

- **CS2 PRO Score:** no approved formula, weights, benchmark or minimum sample. It stays
  "não disponível". When specified, it must show period and sample size.
- **Training access / pass / subscription:** no plan, pass, checkout or entitlement exists
  in this codebase. Lessons open on hub.gamepro.academy, where access is controlled.
- **Lesson progress:** not tracked by CS2 PRO.
- **Player DNA, X-ray, trends, AI Coach:** no engine; `NotAvailablePanel`.

## 8. Validation (Fase 1)

`src/lib/__tests__/uxPhase1.test.tsx`: glossary coverage in 5 locales, engine-window
interpolation, null-vs-zero, locale numbers/dates/chart labels, accessible trigger,
Pro Score context and Dashboard link, training access note, token usage. Visual check of
the real components rendered with the built CSS at 1440, 820 and 390 px: no horizontal
overflow outside the table's own scroll container; glossary targets ≥ 24 px.
