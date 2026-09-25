import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Preparation only: never provisions resources or publishes a Worker.
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'work/standalone');
const built = JSON.parse(await readFile(resolve(root, 'dist/server/wrangler.json'), 'utf8'));
await mkdir(output, { recursive: true });
const config = {
  name: 'study-companion',
  main: '../../dist/server/index.js',
  compatibility_date: built.compatibility_date,
  compatibility_flags: built.compatibility_flags,
  no_bundle: true,
  rules: built.rules,
  assets: { directory: '../../dist/client' },
  workers_dev: true,
  vars: { STUDY_AUTH_PROVIDER: 'supabase', STUDY_SITE_URL: '', SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '' },
  d1_databases: [{ binding: 'DB', database_name: 'study-companion', database_id: 'REPLACE_WITH_REAL_D1_ID', migrations_dir: '../../drizzle' }],
  // No FILES/R2 binding and no paid services.
};
await writeFile(resolve(output, 'wrangler.template.json'), JSON.stringify(config, null, 2) + '\n');
await writeFile(resolve(output, 'README.md'), `# Standalone preparation only

Do not deploy this template until real provider settings are configured and tested.
STUDY_AUTH_PROVIDER=supabase selects verified standalone sessions and ignores Sites
identity headers. Empty auth settings fail closed; never change this to sites on
standalone hosting.

Then replace REPLACE_WITH_REAL_D1_ID with a database ID returned by Cloudflare,
configure the auth provider, apply existing migrations to that new database,
and validate author access plus anonymous guest links. Do not import local QA
users or assign their records to a real account automatically.

This configuration omits R2; uploads will be unavailable while manual quizzes,
folders and guest answering remain supported by the application.
Do not edit generated dist/server/wrangler.json or the existing Sites manifest.
Re-run preparation after rebuilding. This script does not upload or deploy.
`);
console.log('Standalone template prepared in work/standalone. Configure and verify real authentication before deployment.');
