import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const pwaRequire = createRequire(require.resolve('vite-plugin-pwa'));
const workboxRequire = createRequire(pwaRequire.resolve('workbox-build'));
const { glob, globSync } = workboxRequire('glob');
const entryFiles = globSync('dist/assets/*.js', { cwd: process.cwd() });
assert(entryFiles.length >= 3, 'Workbox glob API discovers the generated app entries');
await assert.rejects(glob('dist/**/*', { cwd: process.cwd(), signal: AbortSignal.abort(new Error('expected-cancel')) }), /expected-cancel/);

const worker = readFileSync('dist/sw.js', 'utf8');
const urls = [...worker.matchAll(/\burl\s*:\s*["']([^"']+)["']/g)].map(match => match[1]);
assert(urls.length >= 5, 'Generated service worker contains the precache');
for (const url of urls) {
 assert(!url.includes('..') && !url.startsWith('/') && !url.includes('://'), 'Precache URLs stay local');
 assert(!/(^|\/)(config|login)\.json$|\.env|\.php$/.test(url), 'Private configuration and PHP stay outside the precache');
 assert(existsSync(resolve('dist', url)), `Precached file exists: ${url}`);
}
console.log(`Security build: glob discovery/cancellation and ${urls.length} existing public precache entries passed.`);
