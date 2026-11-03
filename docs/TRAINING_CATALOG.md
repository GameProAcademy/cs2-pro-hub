# Training catalog — courses and lessons (5 locales, 3 tracks)

Single source of truth for the GamePro courses and lessons that **Meu Treinamento** and the
**AI Coach** recommend. Links live only in the database; no URL is hard-coded in the
frontend, in the Coach prompt or in any other file. Changing, adding or deactivating a link
is a data change (admin screen or import), never a code change or a republish.

## Data model (`supabase/migrations/20261103120000_training_catalog.sql`)

| Table                    | Row                                                                                                                                                                                                                               | Stable identity                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `catalog_content_groups` | the same content across languages (e.g. `champion_mindset` = `mindset-de-campeao` BR/PT, `champion-mindset` EN, `mentalidad-de-campeon` ES, `mentalite-de-champion` FR); carries the **track**, the group **topics** and `active` | `id` (uuid), `key`                               |
| `catalog_courses`        | one localized course (`locale`, title with `[BR]`/`[EN]`…, course URL)                                                                                                                                                            | `id`, `key = course:<slug>`                      |
| `catalog_lessons`        | one lesson URL: `locale`, `language_status` (`confirmed`/`pending`), `language_evidence`, `topics`, `position`, link to its course (`course_id`) and group                                                                        | `id`, `key = lesson:<course-slug>/<lesson-slug>` |
| `catalog_import_runs`    | every import (dry run or applied) with its report                                                                                                                                                                                 | `id`                                             |

Guarantees enforced by the database itself:

- URL shape: `https://hub.gamepro.academy/courses/<slug>/` (course) or
  `…/courses/<slug>/lessons/<slug>/` (lesson); any URL containing `sample-course` is
  refused (`catalog_url_ok`, CHECK constraint) — at import, on edit, always.
- URLs and keys are unique; a lesson whose language is `confirmed` must name its locale.
- RLS: signed-in users read **active** rows only; only `admin_master` writes; `anon` has no
  access. Changing a URL or a title keeps the row `id` and its course/group links.

## Tracks

| Track                      | Code                     | Groups (classified by lesson content, 2026-11-03)                                                                                                                 |
| -------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Treinamento Counter-Strike | `counter_strike_in_game` | In-Game 1–5                                                                                                                                                       |
| Conhecimentos Estratégicos | `strategic_knowledge`    | champion mindset, mental drives, success fundamentals, personal development, productive routine, public speaking and communication, stretching/breathing/mobility |
| Habilidades Extras         | `extra_skills`           | video editing, CapCut, branding, ChatGPT, Midjourney, Facebook Ads, Google Ads, Pinterest, TikTok, YouTube, WordPress                                             |
| —                          | `unclassified`           | `gaming_history` (one introductory lesson, waiting for owner review), `bonus_content` (announcements, inactive). Never recommended                                |

`track_source` records who decided: `content_review` (initial classification), `import` (a
new family arrived by import), `admin` (changed on the admin screen; never overwritten by an
import).

## Language rule

A lesson is recommended in a locale only when its language is **confirmed** by evidence:

1. its course slug ends in `-br`, `-pt`, `-en`, `-es`, `-fr` (`course_slug_suffix`), or
2. its course slug is a listed localized course of known language (`localized_course`).

Lessons under course slugs that are not listed localized courses stay `pending`
(`unlisted_course`): 503 in the 2026-11-03 file (base courses such as
`counter-strike-2-pro-in-game-3`, `rotina-produtiva`, and the orphan `midjourney-3`). The
`-br`/`-pt` versions of the same families are confirmed and cover those languages.

The title is checked against the evidenced locale; a lesson whose title reads as another
language stays `pending` (`title_reads_as_pt`, 62 lessons in the 2026-11-03 file):

- Portuguese titles inside EN/FR courses: no English/French marker and Portuguese/Spanish
  vocabulary ("3 – Uso Eficaz de Granadas", "1 – Treinamento de Mira e Headshots" in the EN
  and FR versions of In-Game 4 and 5; "Alterando Banners" in WordPress FR);
- Portuguese-only words inside ES courses ("Nível 1 – Parte 1" in In-Game 2 ES, "Canal de
  Acesso Auditivo" in the ES communication course, "Criativos que Convertem" in Pinterest ES).
  Valid Spanish such as "Uso Eficaz de Granadas" or "Comunicacion de Alto Nivel" is kept.

Loan words ("call to action", "making of", "D’água") never override URL evidence.

An administrator can confirm or correct a language on the admin screen
(`language_evidence = 'admin'`); imports never overwrite that decision.

## Topics

Codes shared by the catalog, the Training plan and the Coach: `aim`, `utility`,
`positioning`, `economy`, `roles_teamplay`, `decision`, `demo_review`, `settings`,
`warmup_routine`, `skins_market`, `map:de_<map>`, `side_ct`, `side_t`, `communication`,
`mindset`, `routine_productivity`, `personal_development`, `health_mobility`,
`content_creation`, `video_editing`, `branding`, `career`, `ai_tools`, `marketing_ads`,
`streaming`, `web`, `in_game`, `ranked_progression`. Group topics come from
`CONTENT_GROUPS`; lesson topics are added from the title (multilingual rules in
`catalogCore.ts`) and can be edited per lesson on the admin screen.

## Code

| File                                          | Role                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/catalog/catalogCore.ts`              | pure core: URL rule, language evidence and title check, content groups, topics, JSON/CSV parsing, normalization, import plan, `isRecommendable`                           |
| `src/lib/catalog/catalogSelect.ts`            | pure selection: player needs (weakest observed DNA dimensions, declared goals, topics of the player's message) → at most a few items, one per group; reply link sanitizer |
| `src/lib/catalog/catalogData.server.ts`       | bounded reads with the caller's RLS session (locale, confirmed, active, topic overlap, `limit`)                                                                           |
| `src/lib/catalogAdmin.functions.ts`           | admin server functions (list, edit, (de)activate, delete, group track, import) — `admin_master` only, audited                                                             |
| `src/routes/_authenticated/admin/catalog.tsx` | admin screen (lessons, tracks and groups, import)                                                                                                                         |
| `scripts/catalog/build-import-sql.ts`         | reproducible load: file → same core → idempotent SQL                                                                                                                      |
| `supabase/seed/training-catalog/2026-11-03/`  | the owner's source file (sha256 `df86476e…`)                                                                                                                              |

## Maintenance

All on **Administração → Catálogo de cursos** (`/admin/catalog`, `admin_master` only):

| Task                    | How                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edit a title or URL     | Aulas → Editar. The row keeps its id and links; the URL must be a `hub.gamepro.academy/courses/…/lessons/…/` URL and never `sample-course` (refused otherwise)                                                      |
| Fix a language          | Aulas → Editar → locale + Confirmado/Pendente (recorded as an admin decision)                                                                                                                                       |
| Change a track          | Trilhas e grupos → select the track (recorded as an admin decision)                                                                                                                                                 |
| Deactivate / reactivate | Aulas or Trilhas e grupos → Desativar/Ativar (prefer this to deleting)                                                                                                                                              |
| Delete                  | Aulas → Excluir (confirmation; audited)                                                                                                                                                                             |
| Add lessons / courses   | Importar → upload `training_catalog.json` or the CSVs → **Simular** (dry run, report) → **Aplicar**. New rows are inserted, changed rows updated; rows absent from the file are kept; admin decisions are preserved |

Every change is written to `admin_audit_logs`; every import to `catalog_import_runs`.

Reproducible load from a file (operator, same rules as the admin import, insert-only):

```
node --experimental-strip-types scripts/catalog/build-import-sql.ts \
  supabase/seed/training-catalog/2026-11-03/training_catalog.json /tmp/catalog.sql > report.json
# apply /tmp/catalog.sql on the managed database; running it twice changes nothing
```
