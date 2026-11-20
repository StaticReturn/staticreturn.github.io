import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from './build.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fnd-'));
const { pages } = build(out);
const read = (file) => fs.readFileSync(path.join(out, file), 'utf8');
const files = fs.readdirSync(out, { recursive: true }).map(String);

test('every source page is emitted and listed in the navigation once', () => {
  assert.ok(pages.length > 50);
  assert.equal(new Set(pages.map((p) => p.num)).size, pages.length);
  for (const p of pages) assert.ok(fs.existsSync(path.join(out, p.file)), p.file);
  assert.ok(!files.some((f) => f.endsWith('.md')));
});

test('every internal link, asset and #fragment resolves', () => {
  for (const file of files.filter((f) => f.endsWith('.html'))) {
    const html = read(file);
    for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^https?:/.test(url)) continue;
      const [target, hash] = url.split('#');
      const dest = target === '' ? file : target === '/' ? 'index.html' : target.slice(1);
      assert.ok(fs.existsSync(path.join(out, dest)), `${file}: broken link ${url}`);
      if (hash) assert.ok(read(dest).includes(`id="${hash}"`), `${file}: missing anchor ${url}`);
    }
  }
});

test('Jekyll and kramdown syntax is converted', () => {
  for (const file of files.filter((f) => f.endsWith('.html'))) assert.doesNotMatch(read(file), /\{%|\{:/, file);
  assert.match(read('index.html'), /<aside class="callout warning" data-label="Warning">/);
  assert.match(read('rules/races/races.html'), /href="\/rules\/races\/human\.html"/);
});

test('ability lists become symbol rows', () => {
  const duelist = read('rules/classes/duelist.html');
  assert.match(duelist, /<ul class="moves">\n<li><span class="syms">✧︎<\/span> Disarm/);
  assert.match(duelist, /<li class="cond">If you are fighting only one opponent:/);
  assert.match(read('rules/classes/wizard.html'), /<span class="syms">⚔︎<\/span> <strong>Magic Missile<\/strong>:/);
  assert.match(read('rules/classes/fighter.html'), /<span class="syms">🛡︎<\/span> <em>shield<\/em>:/);
});
