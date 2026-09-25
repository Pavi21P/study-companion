import { env } from 'cloudflare:workers';

export function getDb(): D1Database {
  if (!env.DB) throw new Error('Cloudflare D1 binding DB is missing.');
  return env.DB;
}
