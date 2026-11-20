// Static site generator: markdown pages (index.md, about/, rules/) -> _site/.
// Navigation comes from each page's front matter: title, parent, grand_parent, nav_order.
import fs from 'node:fs';
import path from 'node:path';
import { marked, Parser, Renderer } from 'marked';

const ROOT = import.meta.dirname;
const SITE = 'Friday Night Dungeon';
const CALLOUTS = { warning: 'Warning', development_note: 'Development Note' };
const SYM = '(?:⚔|✧|🛡)\\uFE0F?';
// A bullet that opens with combat symbols: "* ⚔, ✧: text", "* 🛡, _shield_: text", "* **Name** ⚔: text"
const MOVE = new RegExp(`^(\\s*)[*-]\\s+(\\*\\*[^*]+\\*\\*\\s+)?(${SYM}(?:\\s*(?:,|\\+|or)?\\s*${SYM})*)(?:\\s*,\\s*(_[^_]+_))?\\s*:\\s*(.*)$`, 'gmu');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plain = (html) => html.replace(/<\/?(?:p|br|li|ul|ol|div|aside|table|tr|td|th|h\d)\b[^>]*>/g, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';

function walk(p) {
  if (fs.statSync(path.join(ROOT, p)).isDirectory()) return fs.readdirSync(path.join(ROOT, p)).sort().flatMap((f) => walk(path.join(p, f)));
  return p.endsWith('.md') ? [p] : [];
}

function loadPages() {
  const pages = [];
  for (const src of ['index.md', 'about', 'rules'].flatMap(walk)) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(fs.readFileSync(path.join(ROOT, src), 'utf8'));
    if (!m) continue;
    const fm = {};
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^(\w+):\s*(.*?)\s*$/.exec(line);
      if (kv) fm[kv[1]] = kv[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    if (!fm.title) throw new Error(`${src}: front matter has no title`);
    const home = src === 'index.md';
    pages.push({
      src, home, title: fm.title, parentTitle: fm.parent, grandTitle: fm.grand_parent, order: Number(fm.nav_order ?? 999),
      md: m[2], file: src.replace(/\.md$/, '.html'), url: home ? '/' : '/' + src.replace(/\.md$/, '.html'), children: [],
    });
  }
  return pages;
}

// Parents are matched by title, as just-the-docs did. Numbers come from sorted position, not from nav_order.
function buildTree(pages) {
  const top = [];
  for (const p of pages) {
    if (!p.parentTitle) { top.push(p); continue; }
    const found = pages.filter((c) => c.title === p.parentTitle && c.parentTitle === p.grandTitle);
    if (found.length !== 1) throw new Error(`${p.src}: expected one parent "${p.parentTitle}", found ${found.length}`);
    p.parent = found[0];
    p.parent.children.push(p);
  }
  const flat = [];
  const number = (list, prefix) => {
    list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    list.forEach((p, i) => {
      p.num = prefix + (i + 1);
      p.top = p.parent ? p.parent.top : p;
      flat.push(p);
      number(p.children, p.num + '.');
    });
  };
  number(top, '');
  return { top, flat };
}

function prep(page, bySrc) {
  return page.md
    .replace(/\{%\s*link\s+(\S+)\s*%\}/g, (m, target) => {
      if (!bySrc.has(target)) throw new Error(`${page.src}: link to missing page ${target}`);
      return bySrc.get(target).url;
    })
    // kramdown "{: .name}" marks the paragraph after it as a callout. The blank lines make marked parse the inside as markdown.
    .replace(/^\{:\s*\.(\w+)\s*\}[ \t]*\r?\n((?:.+(?:\r?\n|$))+)/gm, (m, name, text) =>
      `<aside class="callout ${name}" data-label="${esc(CALLOUTS[name] ?? name.replace(/_/g, ' '))}">\n\n${text}\n\n</aside>\n\n`)
    .replace(MOVE, (m, indent, name, syms, tag, rest) => {
      // U+FE0E asks for the text (not emoji) glyph, so the symbol takes the ink colour
      const cell = syms.replace(/️|,/g, '').replace(/\s+/g, ' ').replace(/(⚔|✧|🛡)/gu, '$1︎');
      return `${indent}* <span class="syms">${cell}</span> ${name ? name.trim() + ': ' : ''}${tag ? tag + ': ' : ''}${rest}`;
    })
    .replace(/(⚔|✧|🛡)️?(?!︎)/gu, '<span class="sym">$1︎</span>');
}

function markMoves(tokens) {
  let any = false;
  for (const t of tokens) {
    if (t.type !== 'list') continue;
    for (const item of t.items) {
      if (item.text.startsWith('<span class="syms">')) t.moves = true;
      if (markMoves(item.tokens)) t.moves = item.cond = true;
    }
    any ||= !!t.moves;
  }
  return any;
}

marked.use({
  renderer: {
    heading(t) {
      const inner = this.parser.parseInline(t.tokens);
      if (!t.id) return `<h${t.depth}>${inner}</h${t.depth}>\n`;
      const num = t.n ? ` class="num" data-n="${t.n}"` : '';
      return `<h${t.depth} id="${t.id}"${num}><a href="#${t.id}">${inner}</a></h${t.depth}>\n`;
    },
    paragraph(t) { return `<p${t.lede ? ' class="lede"' : ''}>${this.parser.parseInline(t.tokens)}</p>\n`; },
    list(t) { const html = Renderer.prototype.list.call(this, t); return t.moves ? html.replace('<ul>', '<ul class="moves">') : html; },
    listitem(t) { const html = Renderer.prototype.listitem.call(this, t); return t.cond ? html.replace('<li>', '<li class="cond">') : html; },
  },
});

function renderBody(page, bySrc) {
  const tokens = marked.lexer(prep(page, bySrc)).filter((t) => t.type !== 'space');
  const inline = (t) => plain(Parser.parseInline(t.tokens));

  page.h1 = page.title;
  if (tokens[0]?.type === 'heading' && tokens[0].depth === 1) page.h1 = inline(tokens.shift());
  if (tokens[0]?.type === 'paragraph' && !page.home) tokens[0].lede = true;

  // Summary for contents lists: the first paragraph, if the page opens with prose
  page.summary = '';
  for (const t of tokens) {
    if (t.type === 'heading' || t.type === 'table') break;
    if (t.type === 'paragraph' && inline(t)) { page.summary = inline(t); break; }
  }
  if (page.home) page.summary = '';

  // Only the shallowest heading level that occurs at least twice gets section numbers
  const heads = tokens.filter((t) => t.type === 'heading');
  const level = Math.min(...[2, 3, 4, 5, 6].filter((d) => heads.filter((h) => h.depth === d).length >= 2));
  const used = new Set();
  let n = 0;
  page.heads = [];
  for (const h of heads) {
    const text = inline(h);
    let id = slugify(text);
    for (let i = 2; used.has(id); i++) id = `${slugify(text)}-${i}`;
    used.add(id);
    h.id = id;
    if (h.depth === level) h.n = `${page.num}.${++n}`;
    page.heads.push({ id, text, n: h.n });
  }
  page.numbered = n > 0;

  markMoves(tokens);
  page.html = marked.parser(tokens)
    .replace(/<table>/g, '<div class="tw" tabindex="0" role="region" aria-label="Table"><table>')
    .replace(/<\/table>/g, '</table></div>');
  page.text = plain(page.html);
}

const link = (p, current, label = p.title) => `<a href="${p.url}"${p === current ? ' aria-current="page"' : ''}>${esc(label)}</a>`;

function template(page, site) {
  const { top, flat } = site;
  const section = page.top;
  // Second band line: the classes of the current group (Classes > Close Combat > Duelist)
  const group = page.parent && page.parent !== section ? page.parent : page.parent && page.children.length ? page : null;
  const trail = [];
  for (let p = page.parent; p; p = p.parent) trail.unshift(p.title);
  const label = page.home || page.notFound ? '' : page.parent ? `${trail.join(' · ')} · ${page.num}` : `Section ${page.num}`;
  // Title size shrinks for long words so none is wider than the column (wide letters run close to 1em each)
  const longest = Math.max(...page.h1.split(/\s+/).map((w) => w.length));
  const size = `font-size: max(28px, min(${Math.min(6, 80 / longest).toFixed(1)}vw, 58px))`;
  const i = flat.indexOf(page);
  const prev = flat[i - 1], next = i >= 0 ? flat[i + 1] : null;
  const numbered = page.heads.filter((h) => h.n);
  const otp = numbered.length >= 4 ? `<details class="otp"><summary>On this page</summary><ol>${numbered.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol></details>\n` : '';
  const lede = page.html.startsWith('<p class="lede">');
  const tabCurrent = (p) => (p === section && !page.notFound ? (p === page ? ' aria-current="page"' : ' aria-current="true"') : '');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.home ? SITE : `${page.title} · ${SITE}`)}</title>
<meta name="description" content="${esc(page.summary || `${page.title}: rules for ${SITE}, a tabletop RPG.`)}">
<link rel="icon" href="/assets/images/favicon.ico">
<script>try{var d=document.documentElement,t=localStorage.getItem('theme');d.classList.add('js');if(t)d.dataset.theme=t}catch(e){}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..900&family=IBM+Plex+Mono:wght@400;600&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/site.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
<div class="bar">
<a class="brand" href="/">${SITE}</a>
<div class="tools">
<div class="find"><label for="q">Find</label><input id="q" type="search" placeholder="a rule, class, race…" autocomplete="off"><ul class="results" aria-live="polite"></ul></div>
<button class="theme" type="button" aria-pressed="false">Dark</button>
</div>
</div>
<nav class="tabs" aria-label="Sections">
${top.map((p) => `<a href="${p.url}"${tabCurrent(p)}>${p.num} ${esc(p.title)}</a>`).join('\n')}
</nav>
${section.children.length && !page.notFound ? `<nav class="band" aria-label="${esc(section.title)} pages">\n${section.children.map((p) => link(p, p === group ? null : page).replace('<a ', p === group && p !== page ? '<a aria-current="true" ' : '<a ')).join('\n')}\n</nav>` : ''}
${group?.children.length ? `<nav class="band" aria-label="${esc(group.title)} pages">\n${group.children.map((p) => link(p, page)).join('\n')}\n</nav>` : ''}
</header>
<main id="main">
${label ? `<p class="label">${esc(label)}</p>` : ''}
<h1 style="${size}">${esc(page.h1)}</h1>
<div class="body${page.numbered ? ' numbered' : ''}">
${otp && lede ? page.html.replace('</p>\n', '</p>\n' + otp) : otp + page.html}</div>
${page.children.length ? `<ol class="toc${page.children.length > 8 ? ' wide' : ''}">\n${page.children.map((c) => `<li><a href="${c.url}"><span class="n">${c.num}</span><b>${esc(c.title)}</b>${c.summary ? `<small>${esc(c.summary.length > 110 ? c.summary.slice(0, 107).trimEnd() + '…' : c.summary)}</small>` : ''}</a></li>`).join('\n')}\n</ol>` : ''}
${prev || next ? `<nav class="pn" aria-label="Previous and next page">
${prev ? `<a href="${prev.url}"><span>← ${prev.num} Previous</span><b>${esc(prev.title)}</b></a>` : '<span></span>'}
${next ? `<a class="next" href="${next.url}"><span>${next.num} Next →</span><b>${esc(next.title)}</b></a>` : ''}
</nav>` : ''}
</main>
</body>
</html>
`;
}

export function build(out = path.join(ROOT, '_site')) {
  const pages = loadPages();
  const site = buildTree(pages);
  const bySrc = new Map(pages.map((p) => [p.src, p]));
  for (const p of pages) renderBody(p, bySrc);

  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'assets'), path.join(out, 'assets'), { recursive: true });
  for (const p of pages) {
    fs.mkdirSync(path.dirname(path.join(out, p.file)), { recursive: true });
    fs.writeFileSync(path.join(out, p.file), template(p, site));
  }
  const missing = { notFound: true, title: 'Page not found', h1: 'Not found', top: site.top[0], children: [], heads: [], summary: '',
    html: '<p class="lede">That page does not exist. Try the search, or pick a section above.</p>\n' };
  fs.writeFileSync(path.join(out, '404.html'), template(missing, site));

  // One search entry per page (with its text) and one per heading
  const where = (p) => (p.parent ? `${where(p.parent)} › ${p.title}` : p.title);
  const index = pages.flatMap((p) => [
    { t: p.title, s: p.parent ? where(p.parent) : '', u: p.url, x: p.text },
    ...p.heads.map((h) => ({ t: h.text, s: where(p), u: `${p.url}#${h.id}` })),
  ]);
  fs.writeFileSync(path.join(out, 'search.json'), JSON.stringify(index));
  return { pages, out };
}

if (process.argv[1] === import.meta.filename) {
  const { pages, out } = build();
  console.log(`Built ${pages.length} pages into ${path.relative(ROOT, out)}/`);
}
