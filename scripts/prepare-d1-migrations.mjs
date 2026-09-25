import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Older Wrangler/D1 query handling rejects CRLF inside trigger bodies.
// Preserve migration names and SQL; normalize only deployment-copy line endings.
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'work/standalone');
const destination = resolve(output, 'migrations');
await mkdir(destination, { recursive: true });
const names = (await readdir(resolve(root, 'drizzle'))).filter(name => name.endsWith('.sql')).sort();
for (const name of names) {
  const source = await readFile(resolve(root, 'drizzle', name), 'utf8');
  let sql = source.replace(/\r\n/g, '\n');
  // D1's remote splitter mistakes a bare CASE END for the trigger's END.
  // Parentheses preserve the expression and validation behavior (workers-sdk #4727).
  if (name === '0002_immutable_quiz_versions.sql') {
    sql = sql.replace(/SELECT CASE WHEN/g, 'SELECT (CASE WHEN').replace(/ END;/g, ' END);');
  }
  await writeFile(resolve(destination, name), sql);
}
const configPath = resolve(output, 'wrangler.production.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const db = config.d1_databases.find(binding => binding.binding === 'DB');
if (!db) throw new Error('Production DB binding missing');
db.migrations_dir = './migrations';
await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
console.log(`Prepared ${names.length} LF-only migration copies with D1-compatible CASE expressions. Original SQL files unchanged. No remote changes made.`);
