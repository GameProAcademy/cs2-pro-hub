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

| State                           | Source                                                | UI                                                                                                                    |
| ------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Loading                         | React Query pending                                   | `LoadingState`                                                                                                        |
| Error                           | query error                                           | `ErrorState` + retry                                                                                                  |
| `EMPTY`                         | overview                                              | Upload CTA                                                                                                            |
| `PROCESSING`                    | overview (polls every 5 s)                            | Link to history                                                                                                       |
| `IDENTITY_PENDING`              | overview                                              | Explains Steam identity pending                                                                                       |
| `BLOCKED` / `FAILED`            | overview                                              | Honest reason, link to history                                                                                        |
| `READY`                         | overview                                              | Real data                                                                                                             |
| Missing metric                  | value `null`                                          | `—` + sr-only "Não disponível" + hint                                                                                 |
| Limited admission               | `admission = LIMITED`                                 | `AdmissionBadge` (warning) with limitations in `aria-label`                                                           |
| Capability not available        | no engine                                             | `NotAvailablePanel`                                                                                                   |
| Result not resolved by the demo | `resultStatus = UNRESOLVED_BY_DEMO` (L04)             | "—" + sr-only reason + table footnote; never a loss                                                                   |
| Processing date                 | `dateSource = processed`                              | date + "*" + footnote                                                                                                 |
| Sample below minimum            | DNA / X-ray `INSUFFICIENT_SAMPLE`                     | "Em formação"; no radar, no "N / 100", no inference; the payload carries `index: null` (`indexStatus = IN_FORMATION`) |
| No DNA snapshot yet             | Dashboard `getDnaSummary` → `NO_SNAPSHOT`             | message + link to Player DNA; nothing is created on read                                                              |
| Observation status              | `MEASURED` / `NOT_MEASURED` / `EXCLUDED_BY_ADMISSION` | value + sample / "Não medido" / "Excluído pela admissão"                                                              |

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
| `proScore`                       | CS2 PRO Score               | `pro-score-v1` — see `docs/reference/PRO_SCORE.md`                       |

## 6. Information architecture (routes)

Sidebar (`src/config/navigation.ts`): `/dashboard`, `/matches`, `/performance`,
`/player-dna`, `/analysis`, `/training`, `/coach`, `/profile`; primary action `/upload`;
`/admin` for admins. Public: `/`, `/login`, `/register`, `/reset-password`.

Deep links: `/performance#cs2-pro-score` (score context, linked from the Dashboard panel),
`/performance#glossary`.

## 7. Documented gaps (do not fill without a specification)

- **CS2 PRO Score:** specified as `pro-score-v1` (`docs/reference/PRO_SCORE.md`): absolute
  index, no percentile / tier / benchmark; shown with matches, rounds, coverage and
  confidence. No history yet.
- **Training access / pass / subscription:** no plan, pass, checkout or entitlement exists
  in this codebase. Lessons open on hub.gamepro.academy, where access is controlled.
- **Lesson progress:** out of scope by architecture (see §9), not a gap to fill.
- **Without engine (`NotAvailablePanel`):** performance trends. The
  AI Coach (`/coach`), Player DNA (`/player-dna`, "em formação" below 3 matches) and the
  Raio-X (`/analysis`, contract `xray-v1`) run on real data; the Dashboard shows the real DNA
  state.

## 9. Boundary: CS2 PRO ↔ training platform (immutable rule)

hub.gamepro.academy (WordPress + Tutor LMS) is an external, independent system. CS2 PRO
does **not** use it to track learning. Its only role is to be the destination of links to
lessons that CS2 PRO recommends.

Flow: CS2 PRO finds a need in the player's real data (observed Player DNA dimensions,
declared goals, maps played, the Coach message) → selects lessons from its own
`catalog_*` tables → shows title, the reason and a contextual note written by CS2 PRO / the
AI Coach → links to the lesson, which opens in a new tab (`rel="noopener noreferrer"`) →
the player signs in there with their own, independent WordPress account.

- **Allowed catalog data:** internal id/key, title, URL, category/track/topics, short
  summary, locale and active flag.
- **Forbidden:** lesson progress, completion percentage or status, learning history, any
  Tutor LMS activity, account/user sync, shared authentication, Tutor LMS / WordPress APIs
  or webhooks, any dependency on the WordPress database, and using any of that in the
  Score, Player DNA, metrics, recommendations or Coach context.
- CS2 PRO does not know, record or infer whether a lesson was opened, started, watched or
  finished. Copy must never imply otherwise (`training.real.accessNote`).
- The note shown with a recommendation is CS2 PRO's own explanation (`training.real.why.*`
  on the plan, `catalogSuggestions[].reason` in the Coach), never a grade, rating or
  progress from Tutor LMS.

Enforced by `src/lib/__tests__/trainingPlatformBoundary.test.ts`. Architecture details:
`docs/TRAINING_CATALOG.md` → "Boundary with the training platform".

## 8. Validation (Fase 1)

`src/lib/__tests__/uxPhase1.test.tsx`: glossary coverage in 5 locales, engine-window
interpolation, null-vs-zero, locale numbers/dates/chart labels, accessible trigger,
Pro Score context and Dashboard link, training access note, token usage. Visual check of
the real components rendered with the built CSS at 1440, 820 and 390 px: no horizontal
overflow outside the table's own scroll container; glossary targets ≥ 24 px.

## 10. Data and X-ray (Fase 2)

Metrics, events and the diagnosis contract are documented in
`docs/reference/METRICS_CATALOG.md`. The UI renders `xray-v1` in three separate layers:
**Observado** (values with sample), **Inferência** (one documented rule, only with the
minimum sample) and **Recomendação** (training priorities that link to `/training`).

Numbers on screen go through `formatNumber`, which applies the single rounding rule
(`roundHalfUp`) before the locale format; precision per metric is in the catalog
(`digits.display`). Reads used by the Dashboard have no side effects (see
`docs/reference/METRICS_CATALOG.md` §6).
