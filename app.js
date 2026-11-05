(function () {
  "use strict";

  const STORAGE_KEY = "bingo-card-maker:v1";
  const SAVE_VERSION = 2;
  const $ = (id) => document.getElementById(id);
  const fields = ["title", "rules", "clues", "free", "useFree", "titleFont", "clueFont",
    "size", "count", "paper", "border", "arrange", "flip", "bgStyle", "dotSize"];

  // Page geometry, in points. The four cards touch, with no gap between
  // them, so the sheet comes apart in six straight cuts: one along each outer
  // edge of the block, then one down and one across the middle.
  const PAPER = { letter: [612, 792], a4: [595.28, 841.89] };
  const MARGIN = 36;
  const BLEED = 9;        // 1/8": back image runs past the outer trim lines
  const SAFE = 14;        // keeps front content clear of the trim line
  const MAX_DPI = 250;
  const CARDS_PER_PAGE = 4; // always a 2 × 2 sheet

  // The image the user picked. It's kept in IndexedDB (it can be too large for
  // localStorage) so it comes back after a refresh.
  let bgImage = null;

  // ---------- fonts ----------

  const { FONTS, useFont, fillFontSelect, cssFamily } = window.PdfFonts;
  const DEFAULT_FONTS = { titleFont: "greatvibes", clueFont: "cormorant" };

  function populateFontSelects() {
    for (const id of ["titleFont", "clueFont"]) fillFontSelect($(id), DEFAULT_FONTS[id]);
  }

  function updateFontSamples() {
    for (const el of document.querySelectorAll(".font-sample")) {
      el.style.fontFamily = cssFamily($(el.dataset.for).value);
      if (el.dataset.for === "titleFont") el.textContent = $("title").value.trim() || "Bingo";
    }
  }

  // ---------- settings ----------

  function readSettings() {
    const clues = [];
    const seen = new Set();
    for (const raw of $("clues").value.split(/\r?\n/)) {
      const clue = raw.trim().replace(/\s+/g, " ");
      if (clue && !seen.has(clue.toLowerCase())) {
        seen.add(clue.toLowerCase());
        clues.push(clue);
      }
    }
    // The game explanation keeps the line breaks the user typed.
    const rules = $("rules").value.split(/\r?\n/)
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    return {
      title: $("title").value.trim(),
      rules,
      clues,
      free: $("free").value.trim() || "FREE",
      useFree: $("useFree").checked,
      titleFont: $("titleFont").value,
      clueFont: $("clueFont").value,
      size: parseInt($("size").value, 10),
      count: Math.max(1, Math.min(1000, parseInt($("count").value, 10) || 1)),
      perPage: CARDS_PER_PAGE,
      paper: $("paper").value,
      border: $("border").value === "none" ? "none" : "northwest",
      // The backs form one picture when an image is chosen; none without one.
      bgMode: bgImage ? "composite" : "none",
      arrange: $("arrange").value,
      flip: $("flip").value,
      bgStyle: $("bgStyle").value,
      dotSize: parseInt($("dotSize").value, 10) || 36,
    };
  }

  function cluesNeeded(s) {
    return s.size * s.size - (s.useFree ? 1 : 0);
  }

  function saveForm() {
    try {
      const data = {};
      for (const f of fields) {
        const el = $(f);
        data[f] = el.type === "checkbox" ? el.checked : el.value;
      }
      data.version = SAVE_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable */ }
  }

  function loadForm() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!data) return;
      // Settings saved before the Pacific Northwest design keep their text but
      // switch to its fonts.
      const old = (data.version || 0) < SAVE_VERSION;
      for (const f of fields) {
        if (!(f in data)) continue;
        if (old && ["titleFont", "clueFont"].includes(f)) continue;
        const el = $(f);
        if (f === "arrange" && data[f] === "auto") continue; // older saves
        if (el.type === "checkbox") el.checked = !!data[f];
        else if (el.tagName !== "SELECT" || [...el.options].some((o) => o.value === data[f])) el.value = data[f];
      }
    } catch (e) { /* ignore */ }
  }

  // ---------- card generation ----------

  function randInt(n) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % n;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Returns an array of cells (row-major); the free cell is { free: true }.
  function makeCard(s) {
    const n = s.size;
    const picks = shuffle(s.clues).slice(0, cluesNeeded(s));
    const cells = picks.map((text) => ({ text }));
    if (s.useFree) {
      // Center for odd grids; a random cell for even grids (there is no center).
      const idx = n % 2 === 1 ? Math.floor((n * n) / 2) : randInt(n * n);
      cells.splice(idx, 0, { text: s.free, free: true });
    }
    return cells;
  }

  function makeCards(s) {
    const cards = [];
    const seen = new Set();
    for (let i = 0; i < s.count; i++) {
      let card, key;
      // Avoid duplicate cards where possible.
      for (let attempt = 0; attempt < 50; attempt++) {
        card = makeCard(s);
        key = card.map((c) => (c.free ? "\u0000" : c.text)).join("\u0001");
        if (!seen.has(key)) break;
      }
      seen.add(key);
      cards.push(card);
    }
    return cards;
  }

  // ---------- layout / back images ----------

  function pageLayout(s) {
    const [pw, ph] = PAPER[s.paper];
    const [cols, rows] = { 1: [1, 1], 2: [1, 2], 4: [2, 2] }[s.perPage];
    const w = (pw - 2 * MARGIN) / cols;
    const h = (ph - 2 * MARGIN) / rows;
    const slots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push({ x: MARGIN + c * w, y: MARGIN + r * h });
      }
    }
    return { pw, ph, w, h, slots };
  }

  // Where a card's back lands on the reverse page so it lines up with its front.
  function backSlot(s, layout, slot) {
    return s.flip === "short"
      ? { x: slot.x, y: layout.ph - slot.y - layout.h }
      : { x: layout.pw - slot.x - layout.w, y: slot.y };
  }

  // Every way to lay `count` cards out as a full grid, as [cols, rows].
  function arrangements(count) {
    const out = [];
    for (let c = 1; c <= count; c++) if (count % c === 0) out.push([c, count / c]);
    return out;
  }

  const MAX_GRID = 100;

  // The grid the user typed, as [cols, rows]: "4x5", "4 × 5", "4 by 5"…
  // Returns null when the field is blank (auto) and false when it can't be read.
  function parseGrid(text) {
    const t = (text || "").trim();
    if (!t || /^auto$/i.test(t)) return null;
    const m = t.match(/^(\d+)\s*(?:x|×|\*|by|,|\s)\s*(\d+)$/i);
    if (!m) return false;
    const c = parseInt(m[1], 10), r = parseInt(m[2], 10);
    if (c < 1 || r < 1 || c > MAX_GRID || r > MAX_GRID) return false;
    return [c, r];
  }

  // The composite grid: the user's pick, or the one closest to the image's shape.
  function compositeGrid(s) {
    const picked = parseGrid(s.arrange);
    if (picked) return picked;
    const layout = pageLayout(s);
    const options = arrangements(s.count);
    const target = bgImage ? bgImage.naturalWidth / bgImage.naturalHeight : 1;
    let best = options[0], bestErr = Infinity;
    for (const [c, r] of options) {
      const err = Math.abs(Math.log((c * layout.w) / (r * layout.h) / target));
      if (err < bestErr) { best = [c, r]; bestErr = err; }
    }
    return best;
  }

  // Where the image sits over an area of fitW × fitH points (the trimmed
  // cards): scaled to fill the area and its outer bleed, centred, so it runs
  // right out to the cut lines with no white border; whatever overhangs is
  // cropped. Returns the image's top-left (in points from the area's top-left,
  // negative reaching past it) and its scale in points per source pixel.
  function coverPlacement(fitW, fitH) {
    const iw = bgImage.naturalWidth, ih = bgImage.naturalHeight;
    const scale = Math.max((fitW + 2 * BLEED) / iw, (fitH + 2 * BLEED) / ih);
    return { x: (fitW - iw * scale) / 2, y: (fitH - ih * scale) / 2, scale };
  }

  // Render part of the image to JPEG, placed as coverPlacement says. `region`
  // is the part to output, in points from the area's top-left (negative
  // reaches into bleed).
  function renderRegion(fitW, fitH, region) {
    const iw = bgImage.naturalWidth, ih = bgImage.naturalHeight;
    const { x: ox, y: oy, scale } = coverPlacement(fitW, fitH);
    const pxPerPt = Math.min(MAX_DPI / 72, 1 / scale);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(region.w * pxPerPt));
    canvas.height = Math.max(1, Math.round(region.h * pxPerPt));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImage,
      (ox - region.x) * pxPerPt, (oy - region.y) * pxPerPt,
      iw * scale * pxPerPt, ih * scale * pxPerPt);
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  // A random square of the picture for each card. Every square is used as
  // evenly as possible: counts differ by at most one between squares.
  function assignPositions(count, squares) {
    const out = [];
    const all = [...Array(squares).keys()];
    while (out.length + squares <= count) out.push(...all);
    out.push(...shuffle(all).slice(0, count - out.length));
    return shuffle(out);
  }

  // How far a back at `pos` on the reverse page runs past each of its edges.
  // Only the outer edges of the block bleed; inside it the backs meet exactly
  // at the shared cut, since neighbouring cards hold other parts of the picture.
  function backBleed(layout, pos) {
    const eps = 0.5;
    return {
      l: pos.x <= MARGIN + eps ? BLEED : 0,
      t: pos.y <= MARGIN + eps ? BLEED : 0,
      r: pos.x + layout.w >= layout.pw - MARGIN - eps ? BLEED : 0,
      b: pos.y + layout.h >= layout.ph - MARGIN - eps ? BLEED : 0,
    };
  }

  // ---------- dithered backs ----------
  // The whole picture (every card plus the outer bleed) is dithered once, with
  // `dotSize` dots across each card, so the dots carry on across the cuts.

  let ditherCache = null; // { key, canvas, pitch }

  function ditheredPicture(s) {
    const { w, h } = pageLayout(s);
    const [cols, rows] = compositeGrid(s);
    const pitch = w / s.dotSize; // points per dot
    const key = [bgImage.src, s.bgStyle, s.dotSize, cols, rows, w, h].join("|");
    if (!ditherCache || ditherCache.key !== key) {
      // Like renderRegion: the image fills the cards and their bleed, centred.
      const fitW = cols * w, fitH = rows * h;
      const iw = bgImage.naturalWidth, ih = bgImage.naturalHeight;
      const { x: ox, y: oy, scale } = coverPlacement(fitW, fitH);
      const rect = {
        x: (BLEED + ox) / pitch, y: (BLEED + oy) / pitch,
        w: (iw * scale) / pitch, h: (ih * scale) / pitch,
      };
      const canvas = window.Dither.ditherImage(bgImage,
        Math.ceil((fitW + 2 * BLEED) / pitch), Math.ceil((fitH + 2 * BLEED) / pitch), s.bgStyle, rect);
      ditherCache = { key, canvas, pitch };
    }
    return ditherCache;
  }

  // The dots of the dithered picture inside `region` (in points from the
  // cards' top-left, negative reaching into the bleed), as black rectangles
  // relative to the region's corner: one per horizontal run of dots, cut off
  // at the region's edges. They print as vectors, so they stay sharp and the
  // PDF builds quickly.
  function ditheredRuns(s, region) {
    const { canvas: dots, pitch } = ditheredPicture(s);
    const { ink, width: dw, height: dh } = dots;
    const x0 = region.x + BLEED, y0 = region.y + BLEED; // in the dots' frame
    const x1 = x0 + region.w, y1 = y0 + region.h;
    const OVERLAP = 0.05; // hides hairline seams between neighbouring rows
    const runs = [];
    const jEnd = Math.min(dh, Math.ceil(y1 / pitch));
    const iStart = Math.max(0, Math.floor(x0 / pitch)), iEnd = Math.min(dw, Math.ceil(x1 / pitch));
    for (let j = Math.max(0, Math.floor(y0 / pitch)); j < jEnd; j++) {
      const ya = Math.max(y0, j * pitch), yb = Math.min(y1, (j + 1) * pitch + OVERLAP);
      if (yb <= ya) continue;
      for (let i = iStart; i < iEnd; i++) {
        if (!ink[j * dw + i]) continue;
        let k = i;
        while (k + 1 < iEnd && ink[j * dw + k + 1]) k++;
        const xa = Math.max(x0, i * pitch), xb = Math.min(x1, (k + 1) * pitch + OVERLAP);
        if (xb > xa) runs.push([xa - x0, ya - y0, xb - xa, yb - ya]);
        i = k;
      }
    }
    return runs;
  }

  // Returns a function giving the back image for square t, with the given bleed.
  function backImages(s) {
    const { w, h } = pageLayout(s);
    const [cols, rows] = compositeGrid(s);
    const dithered = s.bgStyle !== "photo";
    const cache = new Map();
    return (t, bl) => {
      const key = `${t}-${bl.l}-${bl.t}-${bl.r}-${bl.b}`;
      if (!cache.has(key)) {
        const c = t % cols, r = Math.floor(t / cols);
        // The bleed shows the picture just past the card, so it stays continuous.
        const region = { x: c * w - bl.l, y: r * h - bl.t, w: w + bl.l + bl.r, h: h + bl.t + bl.b };
        cache.set(key, dithered ? { runs: ditheredRuns(s, region) }
          : { data: renderRegion(cols * w, rows * h, region), alias: `tile${key}` });
      }
      return cache.get(key);
    };
  }

  function updateBackground() {
    const s = readSettings();
    const on = s.bgMode !== "none";
    $("bgOptions").hidden = !on;
    $("bgClear").hidden = !on;
    $("dotSizeWrap").hidden = s.bgStyle === "photo";
    const canvas = $("bgPreview");
    canvas.hidden = !on;
    const hint = $("bgHint");
    if (!on) return;

    const layout = pageLayout(s);
    const [cols, rows] = compositeGrid(s);
    const fmt = (pt) => `${(pt / 72).toFixed(2)}″`;
    const cut = `The cards touch, so six straight cuts along the crop marks free them: the four outer edges, ` +
      `then once down and once across the middle (each card ${fmt(layout.w)} × ${fmt(layout.h)}).`;
    const squares = cols * rows;
    let text = `The picture is ${cols} cards across and ${rows} down (${squares} square${squares === 1 ? "" : "s"}). `;
    if (s.count > squares) {
      const lo = Math.floor(s.count / squares), hi = Math.ceil(s.count / squares);
      text += `Squares are handed out to the ${s.count} cards in random order, ` +
        `${lo === hi ? `${lo} cards` : `${lo} or ${hi} cards`} per square. `;
    } else if (s.count < squares) {
      text += `With only ${s.count} card${s.count === 1 ? "" : "s"}, ${squares - s.count} random square${squares - s.count === 1 ? " is" : "s are"} left empty. `;
    } else {
      text += "Squares are handed out to the cards in random order. ";
    }
    hint.textContent = text + cut + " The small map on each card's front shows which square it is; " +
      "lay each card there front side up, then turn it over where it lies.";
    if (!parseGrid(s.arrange) && (cols === 1 || rows === 1) && s.count > 3) {
      hint.textContent += ` Tip: ${s.count} cards only make a single strip; a count like ` +
        `${Math.max(4, Math.round(Math.sqrt(s.count)) ** 2)} gives a fuller grid.`;
    }

    // Preview the picture as it will be cut.
    const W = cols * layout.w, H = rows * layout.h;
    const maxW = Math.min(canvas.parentElement.clientWidth || 600, 600);
    const k = Math.min(maxW / W, 360 / H);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * k * dpr);
    canvas.height = Math.round(H * k * dpr);
    canvas.style.width = `${Math.round(W * k)}px`;
    canvas.style.height = `${Math.round(H * k)}px`;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (s.bgStyle !== "photo") {
      // The dithered picture without its outer bleed, dots kept sharp.
      const { canvas: dots, pitch } = ditheredPicture(s);
      ctx.imageSmoothingEnabled = canvas.width / (W / pitch) < 2;
      ctx.drawImage(dots, BLEED / pitch, BLEED / pitch, W / pitch, H / pitch, 0, 0, canvas.width, canvas.height);
    } else {
      // As printed: filling the cards, cropped at the outer cut lines.
      const iw = bgImage.naturalWidth, ih = bgImage.naturalHeight;
      const place = coverPlacement(W, H), px = canvas.width / W;
      ctx.drawImage(bgImage, place.x * px, place.y * px, iw * place.scale * px, ih * place.scale * px);
    }
    if (cols * rows > 1) {
      const cw = canvas.width / cols, ch = canvas.height / rows;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      for (let c = 1; c < cols; c++) { ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, canvas.height); }
      for (let r = 1; r < rows; r++) { ctx.moveTo(0, r * ch); ctx.lineTo(canvas.width, r * ch); }
      ctx.stroke();
    }
  }

  // ---------- saved back image ----------

  function imageStore(mode, fn) {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("bingo", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("files");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          try {
            const tx = req.result.transaction("files", mode);
            const r = fn(tx.objectStore("files"));
            tx.oncomplete = () => resolve(r && r.result);
            tx.onerror = tx.onabort = () => resolve(null);
          } catch (e) { resolve(null); }
        };
      } catch (e) { resolve(null); }
    });
  }
  const saveImage = (file) => imageStore("readwrite", (st) => st.put(file, "backImage"));
  const forgetImage = () => imageStore("readwrite", (st) => st.delete("backImage"));
  const savedImage = () => imageStore("readonly", (st) => st.get("backImage"));

  // `restored` is true when the image comes back from storage on page load.
  function loadImage(file, restored = false) {
    if (!file) { bgImage = null; forgetImage(); updateBackground(); regenerate(); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      if (!restored) { showBack = true; saveImage(file); }
      updateBackground();
      regenerate();
    };
    img.onerror = () => {
      bgImage = null;
      URL.revokeObjectURL(url);
      if (restored) { forgetImage(); return; }
      updateBackground();
      regenerate().then(() => { $("error").textContent = "That file couldn't be read as an image."; });
    };
    img.src = url;
  }

  // ---------- validation / UI ----------

  function validate(s) {
    const need = cluesNeeded(s);
    if (s.clues.length < need) {
      return `A ${s.size}×${s.size} card needs ${need} unique clues; you have ${s.clues.length}.`;
    }
    if (s.bgMode !== "none" && parseGrid(s.arrange) === false) {
      return `Enter the picture grid as columns × rows, like 4x5 (up to ${MAX_GRID} each), or leave it blank for auto.`;
    }
    return "";
  }

  function updateCount() {
    const s = readSettings();
    const need = cluesNeeded(s);
    const have = s.clues.length;
    $("clueCount").textContent = `${have} unique clue${have === 1 ? "" : "s"} · ${need} needed per card` +
      (have > need ? ` · cards will vary` : have === need ? ` · every card has the same clues, shuffled` : "");
  }

  // ---------- PDF ----------

  // Wraps at spaces only, so words are never split across lines.
  function wrapWords(doc, text, w) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? line + " " + word : word;
      if (!line || doc.getTextWidth(candidate) <= w) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Find the largest font size at which `text` wraps to fit within w × h.
  function fitText(doc, text, w, h, maxSize, minSize) {
    const words = text.split(" ");
    for (let size = maxSize; size > minSize; size -= 0.5) {
      doc.setFontSize(size);
      const lineH = size * 1.15;
      if (words.some((word) => doc.getTextWidth(word) > w)) continue;
      const lines = wrapWords(doc, text, w);
      if (lines.length * lineH <= h) return { size, lines, lineH };
    }
    doc.setFontSize(minSize);
    return { size: minSize, lines: wrapWords(doc, text, w), lineH: minSize * 1.15 };
  }

  function drawCentered(doc, text, cx, cy, w, h, maxSize, minSize) {
    const fit = fitText(doc, text, w, h, maxSize, minSize);
    doc.setFontSize(fit.size);
    const total = fit.lines.length * fit.lineH;
    // Baseline of the first line, placed so the block's cap height is centered.
    let y = cy - total / 2 + fit.lineH / 2 + fit.size * 0.33;
    for (const line of fit.lines) {
      doc.text(line, cx, y, { align: "center" });
      y += fit.lineH;
    }
  }

  // Fits lines of text (each wrapped between words) into w × h.
  function fitBlock(doc, paragraphs, w, h, maxSize, minSize) {
    const lead = 1.25;
    for (let size = maxSize; size > minSize; size -= 0.25) {
      doc.setFontSize(size);
      if (paragraphs.some((p) => p.split(" ").some((word) => doc.getTextWidth(word) > w))) continue;
      const lines = paragraphs.flatMap((p) => wrapWords(doc, p, w));
      if (lines.length * size * lead <= h) return { size, lines, lineH: size * lead };
    }
    doc.setFontSize(minSize);
    return { size: minSize, lines: paragraphs.flatMap((p) => wrapWords(doc, p, w)), lineH: minSize * lead };
  }

  // Draws a fitted block with its first line box starting at `top`.
  function drawBlock(doc, fit, x, top, align) {
    doc.setFontSize(fit.size);
    let y = top + fit.lineH / 2 + fit.size * 0.33;
    for (const line of fit.lines) {
      doc.text(line, x, y, { align });
      y += fit.lineH;
    }
  }

  // ---------- the card ----------

  // Colors of the type and grid, in RGB.
  const INK = [42, 58, 48];     // title and clues
  const GREEN = [47, 93, 70];   // grid lines, explanation and free space
  const MUTED = [122, 138, 128];

  // The illustrated border (pnw-art.js), drawn as vector paths and placed
  // on each card as a reusable PDF object.
  function drawBorder(doc, x, y, w, h) {
    window.PdfCanvas.placeArt(doc, `pnw-${w.toFixed(2)}x${h.toFixed(2)}`, w, h, x, y, false,
      (ctx) => window.PnwArt.drawBorder(ctx, w, h));
  }

  // `label` is the footer text (or ""); `place` marks the card's position in a
  // composite picture as { cols, rows, c, r }, drawn as a small map.
  function drawCard(doc, fonts, card, s, label, place, x, y, w, h) {
    const n = s.size;
    const m = window.PnwArt.metrics(w, h);
    const u = Math.min(w / 100, h / 120);
    const gap = Math.min(2.2 * u, 10);
    const padT = m.top, padB = m.bottom, padX = m.side;
    const innerW = w - 2 * padX;
    const titleW = Math.min(innerW, w - 2 * m.corner);
    const cx = x + w / 2;
    const titleH = s.title ? Math.min(11 * u, 64) : 0;
    const footer = !!(label || place);
    const footerH = footer ? Math.min(h * 0.05, 22) : 0;

    // The game explanation sits between the title and the grid.
    let rules = null;
    if (s.rules.length) {
      doc.setFont(fonts.clue, "normal");
      const fit = fitBlock(doc, s.rules, innerW, h * 0.15, Math.max(6, Math.min(2.5 * u, 13)), 5);
      rules = { fit, h: fit.lines.length * fit.lineH };
    }
    const rulesH = rules ? rules.h + gap : 0;

    const fixed = titleH + (s.title ? gap : 0) + rulesH + (footer ? gap + footerH : 0);
    const side = Math.max(0, Math.min(innerW, h - padT - padB - fixed));
    let cursor = y + padT + (h - padT - padB - fixed - side) / 2;

    if (s.border !== "none") drawBorder(doc, x, y, w, h);

    if (s.title) {
      doc.setTextColor(...INK);
      doc.setFont(fonts.title, "bold");
      drawCentered(doc, s.title, cx, cursor + titleH / 2, titleW, titleH, titleH * 0.85, 8);
      cursor += titleH + gap;
    }

    if (rules) {
      doc.setTextColor(...GREEN);
      doc.setFont(fonts.clue, "normal");
      drawBlock(doc, rules.fit, cx, cursor, "center");
      cursor += rulesH;
    }

    const gx = cx - side / 2, gy = cursor;
    drawGrid(doc, fonts, card, n, gx, gy, side);

    if (footer) {
      const fy = gy + side + gap;
      if (label) {
        doc.setFont(fonts.clue, "normal");
        doc.setTextColor(...MUTED);
        doc.setFontSize(Math.max(6, footerH * 0.6));
        doc.text(label, gx + side, fy + footerH * 0.7, { align: "right" });
      }
      if (place) {
        const cs = Math.min(footerH / place.rows, (side * 0.3) / place.cols);
        const my = fy + (footerH - cs * place.rows) / 2;
        // Centred under the grid when there's no footer text beside it.
        const mx = label ? gx : cx - (cs * place.cols) / 2;
        doc.setLineWidth(Math.min(0.5, cs / 8));
        doc.setDrawColor(130, 130, 130);
        doc.setFillColor(60, 60, 60);
        for (let r = 0; r < place.rows; r++) {
          for (let c = 0; c < place.cols; c++) {
            const here = r === place.r && c === place.c;
            doc.rect(mx + c * cs, my + r * cs, cs, cs, here ? "FD" : "S");
          }
        }
      }
    }
  }

  // An open grid: inner lines only, no outer border.
  function drawGrid(doc, fonts, card, n, gx, gy, side) {
    const cell = side / n;
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(Math.max(0.5, side / 400));
    for (let i = 1; i < n; i++) {
      doc.line(gx + i * cell, gy, gx + i * cell, gy + side);
      doc.line(gx, gy + i * cell, gx + side, gy + i * cell);
    }
    const pad = cell * 0.08;
    const maxFont = Math.min(cell * 0.22, 20);
    doc.setFont(fonts.clue, "normal");
    card.forEach((c, i) => {
      const cx = gx + (i % n) * cell + cell / 2;
      const cy = gy + Math.floor(i / n) * cell + cell / 2;
      // The free square uses the clue font too, a little larger and in green.
      doc.setTextColor(...(c.free ? GREEN : INK));
      drawCentered(doc, c.text, cx, cy, cell - 2 * pad, cell - 2 * pad, c.free ? maxFont * 1.2 : maxFont, 4);
    });
  }

  // Crop marks in the page margins, one at each end of every cut. With the
  // cards touching, each cut runs the full width or height of the block.
  function drawCropMarks(doc, layout, slots) {
    const { w, h } = layout;
    const off = 4, len = 16;
    const xs = [...new Set(slots.flatMap((p) => [p.x, p.x + w]))];
    const ys = [...new Set(slots.flatMap((p) => [p.y, p.y + h]))];
    const top = Math.min(...ys), bottom = Math.max(...ys);
    const left = Math.min(...xs), right = Math.max(...xs);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    for (const x of xs) {
      doc.line(x, top - off, x, top - off - len);
      doc.line(x, bottom + off, x, bottom + off + len);
    }
    for (const y of ys) {
      doc.line(left - off, y, left - off - len, y);
      doc.line(right + off, y, right + off + len, y);
    }
  }


  async function buildPdf(s, cards) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: s.paper, orientation: "portrait", compress: true, floatPrecision: 2 });
    const fonts = {
      title: await useFont(doc, s.titleFont),
      clue: await useFont(doc, s.clueFont),
    };
    const layout = pageLayout(s);
    const { w, h } = layout;
    const hasBack = s.bgMode !== "none" && bgImage;
    const grid = s.bgMode === "composite" ? compositeGrid(s) : null;
    const backFor = hasBack ? backImages(s) : null;
    const squareOf = grid ? assignPositions(cards.length, grid[0] * grid[1]) : null;
    // With backs, the content stays clear of the cut line.
    const inset = hasBack ? SAFE : 0;

    for (let start = 0; start < cards.length; start += s.perPage) {
      const batch = cards.slice(start, start + s.perPage);
      if (start > 0) doc.addPage();
      batch.forEach((card, k) => {
        const i = start + k;
        const slot = layout.slots[k];
        let label = "";
        let place = null;
        if (grid) {
          const [cols, rows] = grid;
          const t = squareOf[i];
          place = { cols, rows, c: t % cols, r: Math.floor(t / cols) };
        }
        drawCard(doc, fonts, card, s, label, place, slot.x + inset, slot.y + inset, w - 2 * inset, h - 2 * inset);
        // Without the illustrated border, outline the cut line instead.
        if (s.border === "none") window.PdfCanvas.outlineCut(doc, slot.x, slot.y, w, h);
      });
      drawCropMarks(doc, layout, layout.slots.slice(0, batch.length));
      if (!hasBack) continue;
      // The reverse page: each back mirrored to sit behind its front.
      doc.addPage();
      batch.forEach((card, k) => {
        const i = start + k;
        const pos = backSlot(s, layout, layout.slots[k]);
        const bl = backBleed(layout, pos);
        const img = backFor(squareOf ? squareOf[i] : 0, bl);
        const bx = pos.x - bl.l, by = pos.y - bl.t;
        if (img.runs) {
          doc.setFillColor(0, 0, 0);
          for (const [rx, ry, rw, rh] of img.runs) doc.rect(bx + rx, by + ry, rw, rh, "F");
        } else {
          doc.addImage(img.data, "JPEG", bx, by, w + bl.l + bl.r, h + bl.t + bl.b, img.alias, "FAST");
        }
      });
    }
    return doc;
  }

  // ---------- preview / download ----------

  let current = null;   // { doc, url, name }
  let buildId = 0;
  let pending = null;   // Promise of the in-flight build
  let showBack = false; // open the next preview at the first card back

  function fileName(s) {
    const base = (s.title || "bingo").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase();
    return `${base || "bingo"}-cards.pdf`;
  }

  function showEmpty(empty) {
    $("pdfFrame").hidden = empty;
    $("pdfEmpty").hidden = !empty;
  }

  function regenerate() {
    const id = ++buildId;
    const s = readSettings();
    const err = validate(s);
    $("error").textContent = err;
    if (err) {
      showEmpty(true);
      $("status").textContent = "";
      pending = null;
      return Promise.resolve();
    }
    if (!window.jspdf) {
      $("error").textContent = "The PDF library failed to load. Please reload the page.";
      return Promise.resolve();
    }
    $("status").textContent = "Generating…";
    pending = buildPdf(s, makeCards(s)).then((doc) => {
      if (id !== buildId) return;
      if (current) URL.revokeObjectURL(current.url);
      const url = URL.createObjectURL(doc.output("blob"));
      current = { doc, url, name: fileName(s) };
      const hasBack = s.bgMode !== "none" && bgImage;
      $("pdfFrame").src = url + (hasBack && showBack ? "#page=2&view=FitH" : "#view=FitH");
      showBack = false;
      showEmpty(false);
      const pages = doc.getNumberOfPages();
      $("status").textContent = `${s.count} card${s.count === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"}` +
        (hasBack ? " · card backs are on the even pages" : "");
    }).catch((ex) => {
      if (id !== buildId) return;
      console.error(ex);
      $("error").textContent = "Something went wrong generating the PDF: " + ex.message;
      $("status").textContent = "";
    });
    return pending;
  }

  let timer;
  function scheduleRegenerate() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      regenerate();
    }, 500);
  }

  async function download(e) {
    e.preventDefault();
    if (timer) {
      clearTimeout(timer);
      timer = null;
      await regenerate();
    } else if (pending) {
      await pending;
    }
    if (!current || $("error").textContent) return;
    current.doc.save(current.name);
  }

  // ---------- wiring ----------

  populateFontSelects();
  loadForm();
  updateCount();
  updateFontSamples();
  updateBackground();
  regenerate();
  savedImage().then((file) => { if (file && !bgImage) loadImage(file, true); });

  $("bgFile").addEventListener("change", (e) => loadImage(e.target.files[0]));
  $("count").addEventListener("input", updateBackground);
  $("arrange").addEventListener("input", updateBackground);
  $("form").addEventListener("change", updateBackground);
  $("bgClear").addEventListener("click", () => {
    $("bgFile").value = "";
    loadImage(null);
  });
  for (const id of ["arrange", "flip", "bgStyle", "dotSize"]) {
    $(id).addEventListener("change", () => { showBack = true; });
  }
  window.addEventListener("resize", updateBackground);

  $("form").addEventListener("submit", download);
  $("shuffleBtn").addEventListener("click", () => {
    clearTimeout(timer);
    timer = null;
    regenerate();
  });
  $("form").addEventListener("input", (e) => {
    if (e.target.id === "bgFile") return; // loadImage rebuilds once the image is ready
    saveForm();
    updateCount();
    updateFontSamples();
    scheduleRegenerate();
  });

  // Exposed for testing.
  window.BingoMaker = { readSettings, makeCards, buildPdf, FONTS, pageLayout, compositeGrid, parseGrid, assignPositions };
})();
