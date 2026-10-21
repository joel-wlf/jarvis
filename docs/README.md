# Jarvis docs

Fumadocs (Next.js) site, statically exported and deployed to GitHub Pages by `.github/workflows/docs.yml`.

```bash
npm install
npm run dev      # http://localhost:3000, redirects to /en or /de
npm run build    # static site in out/
```

- Content: `content/docs/en` and `content/docs/de` (MDX, every page in both languages).
- `content/docs/*/settings.mdx` is generated from `../admin/src/schema.ts` by `scripts/gen-settings.mjs` (runs before `dev` and `build`). English labels live in `scripts/settings-en.json`.
- The installer command is one value: `lib/install.ts`, rendered by `<InstallCommand />`.
- GitHub Pages serves below `/<repo>`: set `NEXT_PUBLIC_BASE_PATH=/jarvis` for a build that matches (the workflow does this).
- Theme: `app/global.css`, taken from the product tokens (`app/src/theme/tokens.ts`). Light only.
