# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Security & data model notes

- **Single administrator**: only `ia@gamepro.academy` holds `admin_master`. The legacy
  `admin` enum value is retained for history but grants no access anywhere.
- **Roles** live exclusively in `public.user_roles` and are evaluated through
  `SECURITY DEFINER` helpers (`is_admin_master`, `is_staff`, `owns_*`). Those helpers
  must stay executable by authenticated users because RLS policies call them — this is
  the source of the 7 known "signed-in users can execute SECURITY DEFINER function"
  linter warnings, which are expected for this design.
- **Players cannot write generated data**: matches, metrics, analyses, findings,
  Player DNA, score snapshots and training plans are read-own only. Uploads are
  insert/read-own; pipeline fields (`status`, `processed_at`, `error_message`) are
  backend-controlled.
- **Audit log** (`admin_audit_logs`) is administrator-only, append-only and written in
  the administrator's own name.
- **Avatars are the only real Storage feature**: private `avatars` bucket, path
  `{user_id}/avatar.webp`, JPEG/PNG/WebP input, resized and compressed to ≤ 200 KB,
  owner-scoped RLS, `profiles.avatar_url` stores the stable path (never a signed URL),
  fallback `src/assets/gamepro-symbol.png`.
- **`DEMO_DATA = true`**: all performance/analysis/training/Coach content is mock.
  There is no demo parser, no AI provider, no FACEIT/Gamers Club/Steam integration and
  no payments.
- **Persistent security suite**: `supabase/tests/security_checks.sql` — every row must
  report `PASS`.
