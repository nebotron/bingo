# Bingo Card Maker

A static web app for making randomized bingo cards as a PDF. It runs entirely in the browser.

1. Paste your clues, one per line.
2. Set the free-space text, or turn the free space off.
3. Pick fonts: calligraphy scripts (Great Vibes, Pinyon Script, Parisienne, Allura, Alex Brush, Dancing Script), elegant serifs (Cormorant Garamond, EB Garamond, Playfair Display, Lora) or plain Helvetica. The title and free space share one font; the clues use another.
4. Choose the grid size, number of cards, cards per page and paper size.
5. Check the PDF preview, which updates as you type. Use **Reshuffle cards** for a new random set, then **Download PDF** to save exactly what's shown.

Each card draws a random selection of your clues in a random order. Duplicate clues are ignored, and the app avoids producing two identical cards. Long clues shrink and wrap to fit their squares. Lines only break between words, never inside one.

## Card back images

Optionally, pick an image to print on the back of the cards:

- **Simple**: the same image goes on the back of every card.
- **Composite**: the image is sliced so that the card backs, laid side by side, form one large picture. Choose how many cards across and down, or let the app pick the grid that best fits the image. Each card's front shows its number, its row and column, and a small map of where it goes.

With a back image, the PDF alternates front and back pages. Print it double-sided, flipping on the edge you chose (long edge is usual), then cut each card along the crop marks. The back images extend 1/8" past the cut lines so small printer misalignments don't leave white edges. For a composite, lay the cards out front side up in number order, left to right and top to bottom, then turn each one over where it lies.

## Hosting

The site is plain HTML/CSS/JS with no build step. To serve it with GitHub Pages, go to **Settings → Pages** and set the source to **Deploy from a branch**, using `main` and `/ (root)`.

To run it locally:

```bash
python3 -m http.server
```

PDF generation uses [jsPDF](https://github.com/parallax/jsPDF) 2.5.2 (MIT), vendored in `vendor/`. The fonts in `fonts/` are from Google Fonts under the SIL Open Font License (see `fonts/LICENSE-OFL.txt`).
