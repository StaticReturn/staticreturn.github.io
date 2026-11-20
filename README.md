# Friday Night Dungeon

Rules for Friday Night Dungeon, a tabletop RPG, published at <https://staticreturn.github.io>.

## Writing rules

Pages are markdown files in `about/` and `rules/` (plus `index.md`, the home page). Each starts with front matter:

```yaml
---
title: Duelist          # name shown in the navigation
parent: Close Combat    # title of the page it sits under (omit for a top-level section)
grand_parent: Classes   # the parent's own parent, when there is one
nav_order: 3            # position among its siblings
---
```

Extras the generator understands:

- A bullet that starts with `⚔`, `✧` or `🛡` and a colon becomes a ruled row with the symbols in a left cell.
- A `{: .warning}` or `{: .development_note}` line turns the paragraph after it into a callout.
- `{% link rules/races/human.md %}` becomes the link to that page; the build fails if the page is missing.

## Building

```bash
npm ci
npm test
./run.sh
```

`build.mjs` writes the site to `_site/`. `assets/site.css` holds the design, including the light (Cobalt) and dark (Ember) colour tokens at the top. Pushing to `main` runs the tests, builds and deploys to GitHub Pages.
