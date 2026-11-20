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

test('combat symbols in prose render as ink-coloured text glyphs', () => {
  assert.match(read('rules/professions/gladiator.html'), /pay a <span class="sym">⚔︎<\/span> to make an attack/);
});

test(':icon: shortcodes render as local icons, unknown names stay text', () => {
  const html = read('rules/classes/berzerker.html');
  assert.ok(html.includes('<i class="icon" style="--icon:url(/assets/icons/swords.svg)" aria-hidden="true"></i>'));
  assert.ok(!html.includes(':swords:'));
});

test('headings named after child pages link to them instead of repeating a contents list', () => {
  const html = read('rules/classes/parents/classes.html');
  assert.match(html, /id="strategist"[^>]*><a href="\/rules\/classes\/parents\/strategist.html"/);
  assert.doesNotMatch(html, /class="toc/);
});

test('profession pages use the sibling rail and a sectioned sheet', () => {
  const html = read('rules/professions/knight.html');
  assert.match(html, /<nav class="rail"[^>]*>\n(<a [^\n]+\n){6}<a href="\/rules\/professions\/knight\.html" aria-current="page"><span>4\.7<\/span>Knight<\/a>/);
  assert.doesNotMatch(html, /class="(band|pn|label)"/);
  assert.equal(html.match(/<section>/g).length, 3);
  assert.match(read('rules/professions/professions.html'), /class="band"/);
  assert.doesNotMatch(read('rules/races/human.html'), /class="rail"/);
});

test('class pages keep the group band and list their group in the rail', () => {
  const html = read('rules/classes/duelist.html');
  assert.match(html, /<nav class="rail" aria-label="Close Combat pages">/);
  assert.match(html, /<a href="\/rules\/classes\/duelist\.html" aria-current="page"><span>3\.1\.3<\/span>Duelist<\/a>/);
  assert.equal(html.match(/class="band"/g).length, 1);
  assert.doesNotMatch(html, /class="(pn|label|sheet)"/);
  assert.doesNotMatch(read('rules/classes/parents/close_combat.html'), /class="rail"/);
});
