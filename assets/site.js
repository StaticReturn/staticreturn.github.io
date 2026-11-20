const root = document.documentElement;

// Theme: follows the OS until the reader picks one; the choice is stored and applied by the inline head script.
const btn = document.querySelector('.theme');
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
btn.setAttribute('aria-pressed', isDark());
btn.addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  btn.setAttribute('aria-pressed', isDark());
  try { localStorage.setItem('theme', root.dataset.theme); } catch {}
});

// On phones the tab rows scroll sideways: bring the current one into view (scrollLeft, so the page itself does not move).
for (const a of document.querySelectorAll('.tabs [aria-current], .band [aria-current]')) {
  const strip = a.parentElement;
  strip.scrollLeft = a.offsetLeft - (strip.clientWidth - a.offsetWidth) / 2;
}

// Search: every word must appear; matches in a title or heading come before matches in page text.
const input = document.querySelector('#q');
const results = document.querySelector('.results');
let index;
const load = () => (index ??= fetch('/search.json').then((r) => r.json()));
input.addEventListener('focus', load);
input.addEventListener('input', async () => {
  const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
  const has = (text) => words.every((w) => text.toLowerCase().includes(w));
  const entries = words.length ? await load() : [];
  const hits = [...entries.filter((e) => has(e.t)), ...entries.filter((e) => !has(e.t) && e.x && has(e.t + ' ' + e.x))].slice(0, 8);
  results.replaceChildren(...hits.map((e) => {
    const li = document.createElement('li');
    const a = li.appendChild(document.createElement('a'));
    a.href = e.u;
    if (e.s) a.appendChild(document.createElement('small')).textContent = e.s;
    a.append(e.t);
    return li;
  }));
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  if (e.key === 'Escape') { input.value = ''; results.replaceChildren(); }
});
