# Working in this repo

- After every change, commit it and push it to `main` (`git push origin HEAD:main`), even when working on another branch. The site is served from `main` by GitHub Pages, so a change isn't live until it's there.
- Before pushing, fetch `origin/main` and rebase onto it if it has moved, so the push is a fast-forward. Never force-push `main`.
- When you change `style.css` or any script a page links (`pdf-fonts.js`, `pdf-canvas.js`, `dither.js`, `app.js`, `pnw-art.js`, `namecards.js`, `semicircle.js`), bump the `?v=` version in `index.html`, `namecards.html` and `semicircle.html`.
