# Study Companion

A manual-first quiz website with up to 500 questions per quiz, nested folders, revocable sharing links, guest answers and scoring, and light/dark themes.

Live app: https://study-companion.quizcompanion-study.workers.dev

## Features

- Private drafts and immutable published quiz versions.
- Multiple-choice questions with optional explanations.
- Shared quizzes and folder trees that visitors can use without signing in.
- Server-side grading and saved guest results.
- Google sign-in through Supabase for authors.
- AI is optional and disabled. The current deployment does not enable R2 file storage.

## Development

Requires Node.js 22.13 or newer and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

The existing Vite configuration includes the Sites development integration. Standalone hosting uses Supabase authentication and Cloudflare Workers/D1; `pnpm start` uses the generated development configuration, not the private production configuration.

```sh
pnpm test
pnpm lint
pnpm build
```

## Configuration and deployment

See `.env.example` for the supported settings. Standalone deployments set `STUDY_AUTH_PROVIDER=supabase`, `STUDY_SITE_URL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` as Worker variables and bind a D1 database as `DB`. Configure the matching callback URL in Supabase.

Production configuration, credentials, databases, test state, build output, and dependencies are deliberately excluded from this repository. Do not commit OAuth client secrets, service-role keys, or session tokens.

`scripts/prepare-d1-migrations.mjs` prepares deployment copies of the SQL migrations with D1-compatible trigger syntax. It expects a private `work/standalone/wrangler.production.json` with a `DB` binding. Original migrations are preserved. Apply migrations before deploying the built Worker.

The current hosting uses free plans subject to provider quotas. AI integration, R2 uploads, and advanced analytics are deferred.
