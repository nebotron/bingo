# Bingo Card Maker

A static web app for making randomized bingo cards as a PDF. It runs entirely in the browser.

1. Paste your clues, one per line. Optionally add a game explanation, which prints between the title and the grid; line breaks you type are kept.
2. Set the free-space text, or turn the free space off.
3. Pick a card style. Four are woodland designs drawn as vector ornaments:
   - **Evergreen**: a double-rule frame, fern sprigs in the top corners and a leaf wreath around the free space.
   - **Fern & Moss**: a leafy arch over the title, the explanation in a framed panel, and the squares as pale sage tiles.
   - **Timber**: spaced capitals, a treeline along the bottom and tree rings in the free space. Use plain **Timber** to print on kraft cardstock, or **Timber with kraft background** to print the color.
   - **Clearing**: three small pines, an open grid and a single green. It uses the least ink.

   **Plain** is the original black-and-white card. Choosing a style also selects its suggested fonts. Fern & Moss and Timber print an explanation heading ("How to play" by default) above or beside the explanation.
4. Pick fonts: calligraphy scripts (Great Vibes, Pinyon Script, Parisienne, Allura, Alex Brush, Dancing Script), elegant serifs (Cormorant Garamond, EB Garamond, Playfair Display, Lora) or plain Helvetica. The title uses one font; the clues and the free space use another.
5. Choose the grid size, number of cards, cards per page and paper size.
6. Check the PDF preview, which updates as you type. Use **Reshuffle cards** for a new random set, then **Download PDF** to save exactly what's shown.

Each card draws a random selection of your clues in a random order. Duplicate clues are ignored, and the app avoids producing two identical cards. Long clues shrink and wrap to fit their squares. Lines only break between words, never inside one.

## Card back images

Optionally, pick an image to print on the back of the cards:

- **Simple**: the same image goes on the back of every card.
- **Composite**: the image is sliced so that the card backs, laid side by side, form one large picture. Choose how many cards across and down, or let the app pick the grid that best fits the image. Each card's front shows its number, its row and column, and a small map of where it goes.

With a back image, the PDF alternates front and back pages. Print it double-sided, flipping on the edge you chose (long edge is usual), then cut each card along the crop marks. The back images extend 1/8" past the cut lines so small printer misalignments don't leave white edges. For a composite, lay the cards out front side up in number order, left to right and top to bottom, then turn each one over where it lies.

## Circle text

`semicircle.html` is a second tool: it wraps two texts inside a circle, one in the left half and one in the right, and downloads the result as an SVG you can import into Canva or another design tool.

- Text starts at the top of each half and flows down. Choose the radius, font size, line and letter spacing, and a margin from the circle's edge and the center line. **Fit to frame** picks the largest font size at which the text fits.
- **Default spacing** keeps normal word spacing and sets the text against the center line. **Stretch** widens the spaces between words so each line runs from the center line to the edge of the circle. A line holding a single word is not stretched.
- Each paragraph uses as few lines as it needs, and its words are spread across those lines so they are about equally full. This avoids a cramped line followed by one with huge gaps.
- By default both halves share one style. Tick **Style each half separately** to give each half its own font, bold, color, font size, line and letter spacing, and word spacing; each half then starts from the shared style, and its **Fit to frame** sizes only that half. The circle outline and center line use the left half's color.
- Pick from 41 Google Fonts grouped like Canva's (sans serif, serif, display, script, handwritten and monospace), with bold where the font has it.
- The SVG holds the text as vector outlines, so it looks the same anywhere without installing the font. Optionally include the circle outline and the center line.

## Hosting

The site is plain HTML/CSS/JS with no build step. To serve it with GitHub Pages, go to **Settings → Pages** and set the source to **Deploy from a branch**, using `main` and `/ (root)`.

To run it locally:

```bash
python3 -m http.server
```

Font outlines come from [opentype.js](https://github.com/opentypejs/opentype.js) 1.3.4 (MIT), vendored in `vendor/`. PDF generation uses [jsPDF](https://github.com/parallax/jsPDF) 2.5.2 (MIT), vendored in `vendor/`. The fonts in `fonts/` are from Google Fonts under the SIL Open Font License (see `fonts/LICENSE-OFL.txt`).

The pages link `style.css`, `app.js` and `semicircle.js` with a `?v=` version. When you change one of those files, bump the version in `index.html` and `semicircle.html` so browsers don't pair a new page with an old cached script.
