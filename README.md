# Bingo Card Maker

A static web app for making randomized bingo cards as a PDF. It runs entirely in the browser.

1. Paste your clues, one per line. Optionally add a game explanation, which prints between the title and the grid; line breaks you type are kept.
2. Set the free-space text, or turn the free space off.
3. The cards have one design: an illustrated border of Pacific Northwest plants and animals (thimbleberry, sword ferns, mushrooms, a song sparrow and a cedar waxwing) around an open green grid. The border is drawn in `pnw-art.js` and printed as a 200 dpi image sized to the card.
4. Pick fonts: calligraphy scripts (Great Vibes, Pinyon Script, Parisienne, Allura, Alex Brush, Dancing Script), elegant serifs (Cormorant Garamond, EB Garamond, Playfair Display, Lora) or plain Helvetica. The title uses one font; the clues and the free space use another.
5. Choose the grid size, number of cards and paper size. Cards always print four to a page, in a 2 × 2 layout.
6. Check the PDF preview, which updates as you type. Use **Reshuffle cards** for a new random set, then **Download PDF** to save exactly what's shown.

Each card draws a random selection of your clues in a random order. Duplicate clues are ignored, and the app avoids producing two identical cards. Long clues shrink and wrap to fit their squares. Lines only break between words, never inside one.

## Card back images

Optionally, pick an image to print on the back of the cards:

- **Simple**: the same image goes on the back of every card.
- **Composite**: the image is sliced so that the card backs, laid side by side, form one large picture. Type the grid size (columns × rows, like `4x5`), or leave it blank to let the app pick the grid that best fits the image. If there are more cards than grid squares, the picture repeats: cards 1 to N make one complete picture, the next N another, and so on. Each card's front shows its number, its row and column, and a small map of where it goes.

With a back image, the PDF alternates front and back pages. Print it double-sided, flipping on the edge you chose (long edge is usual), then cut each card along the crop marks. The whole image is always printed: it is scaled to fit inside the cut cards (one card in Simple mode, the full grid of cards in Composite mode) and never cropped, so if its shape differs from the cards the leftover space is white. Where the image reaches a cut line it extends 1/8" past it, so small printer misalignments don't leave white edges. For a composite, lay the cards out front side up in number order, left to right and top to bottom, then turn each one over where it lies.

## Name cards

`namecards.html` makes foldable place cards (tent cards) for seating, with the same artwork as the Pacific Northwest bingo card.

- Enter one name per line. To add a smaller second line, such as a table number or meal, put it after a `|` or a tab (`Emma Thompson | Table 4`); two columns pasted from a spreadsheet work as-is.
- Pick a border: **Pacific Northwest** (the bingo card's vine, ferns, mushrooms and birds) or **Floral vine** (the thimbleberry vine with its white flowers and berries, running all the way round). The vine frame is drawn by `PnwArt.drawFloralFrame` in `pnw-art.js`.
- Pick fonts for the name and the second line. A name stays on one line unless it fits much larger on two.
- Sizes when folded: 3.5 × 2 in or 3.75 × 2.5 in (four per page), or 7 × 4.5 in (one per page), on Letter or A4.
- Each card prints twice the folded height. The bottom half is the front; the top half carries the same face upside down, so once folded the name reads from both sides of the table. Untick **Print the name on both sides** to leave the back plain.
- Print at actual size on cardstock, cut along the crop marks and fold along the line between the dashed fold marks.

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

The fonts the PDF tools share are listed in `pdf-fonts.js`. The pages link `style.css`, `pdf-fonts.js`, `app.js`, `pnw-art.js`, `namecards.js` and `semicircle.js` with a `?v=` version. When you change one of those files, bump the version in `index.html`, `namecards.html` and `semicircle.html` so browsers don't pair a new page with an old cached script.
