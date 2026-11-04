(function () {
  "use strict";

  const STORAGE_KEY = "bingo-card-maker:v1";
  const SAVE_VERSION = 2;
  const $ = (id) => document.getElementById(id);
  const fields = ["title", "rules", "rulesHeading", "clues", "style", "free", "useFree", "titleFont", "clueFont",
    "size", "count", "paper", "bgMode", "arrange", "flip"];

  // Page geometry, in points. Cards are cut at their slot edges, so when a
  // back image is used the slot is the trim box.
  const PAPER = { letter: [612, 792], a4: [595.28, 841.89] };
  const MARGIN = 36;
  const SPACING = 24;
  const BLEED = 9;        // 1/8": back image runs past the trim line
  const SAFE = 14;        // keeps front content clear of the trim line
  const MAX_DPI = 250;
  const CARDS_PER_PAGE = 4; // always a 2 × 2 sheet

  // The image the user picked; never stored (it can be large).
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
      rulesHeading: $("rulesHeading").value.trim(),
      style: $("style").value,
      clues,
      free: $("free").value.trim() || "FREE",
      useFree: $("useFree").checked,
      titleFont: $("titleFont").value,
      clueFont: $("clueFont").value,
      size: parseInt($("size").value, 10),
      count: Math.max(1, Math.min(1000, parseInt($("count").value, 10) || 1)),
      perPage: CARDS_PER_PAGE,
      paper: $("paper").value,
      bgMode: $("bgMode").value,
      arrange: $("arrange").value,
      flip: $("flip").value,
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
      // Settings saved before the Pacific Northwest style keep their text but
      // switch to that style and its fonts.
      const old = (data.version || 0) < SAVE_VERSION;
      for (const f of fields) {
        if (!(f in data)) continue;
        if (old && ["style", "titleFont", "clueFont"].includes(f)) continue;
        const el = $(f);
        // The arrangement options are built later; remember the choice.
        if (f === "arrange") el.dataset.want = data[f];
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
    const w = (pw - 2 * MARGIN - (cols - 1) * SPACING) / cols;
    const h = (ph - 2 * MARGIN - (rows - 1) * SPACING) / rows;
    const slots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push({ x: MARGIN + c * (w + SPACING), y: MARGIN + r * (h + SPACING) });
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

  // The composite grid: the user's pick, or the one closest to the image's shape.
  function compositeGrid(s) {
    const layout = pageLayout(s);
    const options = arrangements(s.count);
    const picked = options.find(([c, r]) => `${c}x${r}` === s.arrange);
    if (picked) return picked;
    const target = bgImage ? bgImage.naturalWidth / bgImage.naturalHeight : 1;
    let best = options[0], bestErr = Infinity;
    for (const [c, r] of options) {
      const err = Math.abs(Math.log((c * layout.w) / (r * layout.h) / target));
      if (err < bestErr) { best = [c, r]; bestErr = err; }
    }
    return best;
  }

  // Render part of the image to JPEG. The image is scaled to cover an area of
  // coverW × coverH points (cropping the overflow evenly), and `region` is the
  // part of that area to output, also in points.
  function renderRegion(coverW, coverH, region) {
    const iw = bgImage.naturalWidth, ih = bgImage.naturalHeight;
    const scale = Math.max(coverW / iw, coverH / ih); // points per source pixel
    const ox = (iw * scale - coverW) / 2;
    const oy = (ih * scale - coverH) / 2;
    const pxPerPt = Math.min(MAX_DPI / 72, 1 / scale);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(region.w * pxPerPt));
    canvas.height = Math.max(1, Math.round(region.h * pxPerPt));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImage,
      (region.x + ox) / scale, (region.y + oy) / scale, region.w / scale, region.h / scale,
      0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  // Returns a function giving the back image (including bleed) for card i.
  function backImages(s) {
    const { w, h } = pageLayout(s);
    const bw = w + 2 * BLEED, bh = h + 2 * BLEED;
    if (s.bgMode === "simple") {
      const data = renderRegion(bw, bh, { x: 0, y: 0, w: bw, h: bh });
      return () => ({ data, alias: "back" });
    }
    const [cols, rows] = compositeGrid(s);
    const cache = new Map();
    return (i) => {
      if (!cache.has(i)) {
        const c = i % cols, r = Math.floor(i / cols);
        // Tiles overlap by the bleed, so the picture stays continuous across cuts.
        const data = renderRegion(cols * w + 2 * BLEED, rows * h + 2 * BLEED,
          { x: c * w, y: r * h, w: bw, h: bh });
        cache.set(i, { data, alias: `tile${i}` });
      }
      return cache.get(i);
    };
  }

  function updateArrangeOptions() {
    const sel = $("arrange");
    const want = sel.dataset.want || sel.value;
    delete sel.dataset.want;
    const count = readSettings().count;
    sel.innerHTML = "";
    sel.add(new Option("Auto (best fit)", "auto"));
    for (const [c, r] of arrangements(count)) {
      sel.add(new Option(`${c} across × ${r} down`, `${c}x${r}`));
    }
    sel.value = [...sel.options].some((o) => o.value === want) ? want : "auto";
  }

  function updateBackground() {
    const s = readSettings();
    const on = s.bgMode !== "none";
    $("bgOptions").hidden = !on;
    $("arrangeWrap").hidden = s.bgMode !== "composite";
    const canvas = $("bgPreview");
    canvas.hidden = !(on && bgImage);
    const hint = $("bgHint");
    if (!on) return;

    const layout = pageLayout(s);
    const [cols, rows] = s.bgMode === "composite" ? compositeGrid(s) : [1, 1];
    const fmt = (pt) => `${(pt / 72).toFixed(2)}″`;
    const cut = `Cut each card to ${fmt(layout.w)} × ${fmt(layout.h)} along the crop marks.`;
    hint.textContent = s.bgMode === "composite"
      ? `The ${s.count} cards form a picture ${cols} cards across and ${rows} down. ${cut} ` +
        "Lay the cards out front side up in number order (left to right, then top to bottom), " +
        "then turn each one over where it lies."
      : `${cut} Print double-sided and ${s.flip === "short" ? "flip on the short edge" : "flip on the long edge"}.`;
    if (s.bgMode === "composite" && (cols === 1 || rows === 1) && s.count > 3) {
      hint.textContent += ` Tip: ${s.count} cards only make a single strip; a count like ` +
        `${Math.max(4, Math.round(Math.sqrt(s.count)) ** 2)} gives a fuller grid.`;
    }
    if (!bgImage) return;

    // Preview the picture as it will be cut, with each piece's card number.
    const W = cols * layout.w, H = rows * layout.h;
    const maxW = Math.min(canvas.parentElement.clientWidth || 600, 600);
    const k = Math.min(maxW / W, 360 / H);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * k * dpr);
    canvas.height = Math.round(H * k * dpr);
    canvas.style.width = `${Math.round(W * k)}px`;
    canvas.style.height = `${Math.round(H * k)}px`;
    const ctx = canvas.getContext("2d");
    const iw = bgImage.naturalWidth, ih = bgImage.naturalHeight;
    const scale = Math.max(canvas.width / iw, canvas.height / ih);
    ctx.drawImage(bgImage, (canvas.width - iw * scale) / 2, (canvas.height - ih * scale) / 2, iw * scale, ih * scale);
    if (cols * rows > 1) {
      const cw = canvas.width / cols, ch = canvas.height / rows;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      for (let c = 1; c < cols; c++) { ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, canvas.height); }
      for (let r = 1; r < rows; r++) { ctx.moveTo(0, r * ch); ctx.lineTo(canvas.width, r * ch); }
      ctx.stroke();
      const fs = Math.max(9 * dpr, Math.min(cw, ch) * 0.3);
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = fs / 6;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.fillStyle = "#fff";
      for (let i = 0; i < cols * rows; i++) {
        const x = (i % cols + 0.5) * cw, y = (Math.floor(i / cols) + 0.5) * ch;
        ctx.strokeText(String(i + 1), x, y);
        ctx.fillText(String(i + 1), x, y);
      }
    }
  }

  function loadImage(file) {
    if (!file) { bgImage = null; updateBackground(); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      showBack = true;
      if ($("bgMode").value === "none") {
        $("bgMode").value = "simple";
        saveForm();
      }
      updateBackground();
      regenerate();
    };
    img.onerror = () => {
      bgImage = null;
      URL.revokeObjectURL(url);
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
    if (s.bgMode !== "none" && !bgImage) return "Choose an image for the card backs.";
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

  // ---------- card styles ----------

  // Vector ornaments. Coordinates are PDF points, y pointing down.

  // A pointed leaf of length `len` growing from (x, y) in direction `deg`.
  function leafAt(doc, x, y, len, deg) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const T = (px, py) => [x + px * c - py * sn, y + px * sn + py * c];
    const bulge = len * 0.213;
    doc.moveTo(...T(0, 0));
    doc.curveTo(...T(len / 3, -bulge), ...T((2 * len) / 3, -bulge), ...T(len, 0));
    doc.curveTo(...T((2 * len) / 3, bulge), ...T(len / 3, bulge), ...T(0, 0));
    doc.fill();
  }

  // A stem along a quadratic curve with paired leaves that shrink toward the
  // tip. Points are in a local frame that `map` converts to page points;
  // `k` is the local-to-page scale.
  function branch(doc, map, k, p0, c, p1, count, size, spread, color, color2) {
    const at = (t) => {
      const u = 1 - t;
      return map(u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]);
    };
    const angle = (t) => {
      const a = at(Math.max(0, t - 0.01)), b = at(Math.min(1, t + 0.01));
      return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    };
    const P0 = map(...p0), C = map(...c), P1 = map(...p1);
    doc.setDrawColor(...color);
    doc.setLineWidth(Math.max(0.3, size * k * 0.07));
    doc.setLineCap("round");
    doc.moveTo(...P0);
    doc.curveTo(P0[0] + (2 / 3) * (C[0] - P0[0]), P0[1] + (2 / 3) * (C[1] - P0[1]),
      P1[0] + (2 / 3) * (C[0] - P1[0]), P1[1] + (2 / 3) * (C[1] - P1[1]), ...P1);
    doc.stroke();
    doc.setLineCap("butt");
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      const [x, y] = at(t);
      const a = angle(t), len = size * k * (1 - t * 0.55);
      doc.setFillColor(...(color2 && i % 2 ? color2 : color));
      leafAt(doc, x, y, len, a - spread);
      doc.setFillColor(...color);
      leafAt(doc, x, y, len, a + spread);
    }
    doc.setFillColor(...color);
    leafAt(doc, P1[0], P1[1], size * k * 0.4, angle(1));
  }

  // A ring of leaves with an opening at the bottom.
  function wreath(doc, cx, cy, r, count, len, color, color2) {
    for (let i = 0; i < count; i++) {
      if (i > count * 0.78 && i < count * 0.97) continue;
      const a = (i / count) * Math.PI * 2 + Math.PI / 2;
      const deg = (a * 180) / Math.PI + 90 + (i % 2 ? 28 : -28);
      doc.setFillColor(...(i % 3 ? color : color2));
      leafAt(doc, cx + r * Math.cos(a), cy + r * Math.sin(a), len, deg);
    }
  }

  // A three-tier pine of height h standing on `base`. Without a trunk, the
  // lowest tier sits on `base`.
  function pine(doc, x, base, h, color, trunk = true) {
    doc.setFillColor(...color);
    if (trunk) doc.rect(x - h * 0.025, base - h * 0.12, h * 0.05, h * 0.12, "F");
    else base += h * 0.12;
    const w = h * 0.42;
    for (let k = 0; k < 3; k++) {
      const top = base - h + k * h * 0.22;
      const bot = base - h * 0.12 - (2 - k) * h * 0.12;
      const ww = w * (0.55 + k * 0.22);
      doc.triangle(x, top, x - ww, bot, x + ww, bot, "F");
    }
  }

  // Two rows of pines along the bottom of the card.
  function treeline(doc, x, y, w, h, band, front, back) {
    const k = band / 120;
    const base = y + h;
    const row = (seed, step, jitter, minH, varH, color, sink) => {
      const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      let tx = x;
      for (;;) {
        const th = (minH + rnd() * varH) * k;
        const half = th * 0.42 * 0.99;
        if (tx < x + half) tx = x + half;
        if (tx + half > x + w) break;
        pine(doc, tx, base - sink * k, th, color, false);
        tx += (step + rnd() * jitter) * k;
      }
    };
    row(7, 15, 12, 55, 40, back, 6);
    row(3, 20, 18, 40, 55, front, 0);
    doc.setFillColor(...front);
    doc.rect(x, base - 4 * k, w, 4 * k, "F");
  }

  // A cross-section of a log: heartwood disc and growth rings.
  function treeRings(doc, cx, cy, r, ink, wood) {
    const radii = [44, 39, 33.5, 29, 24, 19.5, 15, 10.5, 6];
    radii.forEach((q, i) => {
      const rr = (q / 44) * r;
      const ox = ((i % 3) - 1) * r * 0.012, oy = (((i + 1) % 3) - 1) * r * 0.012;
      doc.setDrawColor(...ink);
      doc.setLineWidth(r * (i === 0 ? 0.05 : i % 2 ? 0.016 : 0.025));
      if (i === 0) {
        doc.setFillColor(...wood);
        doc.circle(cx, cy, rr, "FD");
      } else {
        doc.circle(cx + ox, cy + oy, rr, "S");
      }
    });
    doc.setLineWidth(r * 0.018);
    doc.line(cx, cy, cx + r * 0.27, cy - r * 0.64);
  }

  // Each style sets the colors, the spacing (in units of 1/100 of the card
  // width, see drawCard) and the decorations. `fonts` are the fonts the
  // style suggests; picking the style selects them, and they can be changed.
  const STYLES = {
    evergreen: {
      label: "Evergreen", fonts: { titleFont: "greatvibes", clueFont: "cormorant" },
      ink: [35, 64, 47], soft: [35, 64, 47], line: [112, 134, 120], muted: [138, 111, 62],
      padTop: 7, padBottom: 6, padX: 8, above: 0, titleSize: 12, dividerSize: 4.5,
      rulesW: 74, gridMax: 80,
      card(doc, x, y, w, h, u) {
        const ink = this.ink;
        doc.setDrawColor(...ink);
        doc.setLineWidth(0.35 * u);
        doc.rect(x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, "S");
        doc.setLineWidth(0.12 * u);
        doc.rect(x + 4.1 * u, y + 4.1 * u, w - 8.2 * u, h - 8.2 * u, "S");
        // Fern sprigs in the top corners, drawn in a 100 × 100 frame.
        const k = (20 * u) / 100;
        const green2 = [47, 90, 65];
        for (const flip of [1, -1]) {
          const ox = flip === 1 ? x + 4.6 * u : x + w - 4.6 * u, oy = y + 4.6 * u;
          const map = (px, py) => [ox + flip * px * k, oy + py * k];
          branch(doc, map, k, [4, 4], [10, 55], [70, 92], 7, 15, 52, ink, null);
          branch(doc, map, k, [4, 4], [50, 12], [92, 48], 6, 12, 50, green2, null);
        }
      },
      divider(doc, cx, cy, u) {
        doc.setDrawColor(...this.muted);
        doc.setLineWidth(0.15 * u);
        doc.line(cx - 15 * u, cy, cx - 3.5 * u, cy);
        doc.line(cx + 3.5 * u, cy, cx + 15 * u, cy);
        doc.setFillColor(...this.ink);
        leafAt(doc, cx, cy, 2.8 * u, -150);
        leafAt(doc, cx, cy, 2.8 * u, -30);
      },
      free(doc, cx, cy, cell) {
        wreath(doc, cx, cy, cell * 0.36, 26, cell * 0.12, this.ink, this.muted);
        return { w: cell * 0.5, h: cell * 0.36 };
      },
    },

    fern: {
      label: "Fern & Moss", fonts: { titleFont: "pinyon", clueFont: "lora" },
      ink: [58, 70, 54], soft: [58, 70, 54], line: [169, 184, 154], muted: [107, 127, 90],
      tile: [232, 236, 223], moss: [107, 127, 90], sage: [169, 184, 154], paper: [255, 255, 255],
      padTop: 4, padBottom: 4, padX: 7, above: 6, titleSize: 11.5,
      rulesW: 82, rulesPadX: 4, rulesPadY: 2.8, heading: true, gridMax: 82, tiles: true,
      aboveTitle(doc, cx, top, u) {
        // Two leafy branches arching out from above the title, in a 300 × 50 frame.
        const k = (84 * u) / 300;
        const map = (px, py) => [cx + (px - 150) * k, top + py * k];
        branch(doc, map, k, [150, 4], [80, -2], [8, 40], 9, 16, 46, this.moss, this.sage);
        branch(doc, map, k, [150, 4], [220, -2], [292, 40], 9, 16, 46, this.moss, this.sage);
      },
      rulesFrame(doc, r, u, headingW) {
        doc.setDrawColor(...this.sage);
        doc.setLineWidth(0.2 * u);
        doc.roundedRect(r.x, r.y, r.w, r.h, 2.2 * u, 2.2 * u, "S");
        if (headingW) {
          doc.setFillColor(...this.paper);
          doc.rect(r.x + r.w / 2 - headingW / 2 - 2 * u, r.y - 0.5 * u, headingW + 4 * u, 1 * u, "F");
        }
      },
      free(doc, cx, cy, cell, rect) {
        doc.setFillColor(...this.moss);
        doc.roundedRect(rect.x, rect.y, rect.w, rect.h, rect.r, rect.r, "F");
        doc.setTextColor(...[245, 246, 239]);
        return { w: rect.w * 0.84, h: rect.h * 0.7 };
      },
    },

    timber: {
      label: "Timber", fonts: { titleFont: "playfair", clueFont: "ebgaramond" },
      ink: [59, 42, 30], soft: [59, 42, 30], line: [59, 42, 30], muted: [91, 107, 58],
      kraft: [233, 220, 195], wood: [201, 169, 122], back: [111, 90, 64],
      padTop: 6, padBottom: 13, padX: 9, above: 0, titleSize: 9, caps: true,
      rulesW: 82, rulesPadY: 1.8, headingCol: 14, heading: true, gridMax: 76, outer: 0.0065,
      card(doc, x, y, w, h, u, outer) {
        if (this.fill) {
          doc.setFillColor(...this.kraft);
          doc.rect(outer.x, outer.y, outer.w, outer.h, "F");
        }
        treeline(doc, x, y, w, h, 11 * u, this.ink, this.back);
      },
      rulesFrame(doc, r, u) {
        doc.setDrawColor(...this.ink);
        doc.setLineWidth(0.2 * u);
        doc.line(r.x, r.y, r.x + r.w, r.y);
        doc.line(r.x, r.y + r.h, r.x + r.w, r.y + r.h);
        if (r.headingX) {
          doc.setLineWidth(0.15 * u);
          doc.line(r.headingX, r.y + 1.2 * u, r.headingX, r.y + r.h - 1.2 * u);
        }
      },
      free(doc, cx, cy, cell) {
        treeRings(doc, cx, cy, cell * 0.42, this.ink, this.wood);
        return { w: cell * 0.56, h: cell * 0.2, plaque: true };
      },
    },

    clearing: {
      label: "Clearing", fonts: { titleFont: "cormorant", clueFont: "cormorant" },
      ink: [42, 58, 48], soft: [47, 93, 70], line: [47, 93, 70], muted: [122, 138, 128],
      padTop: 4, padBottom: 4, padX: 6, above: 8.5, titleSize: 10.5,
      rulesW: 74, gridMax: 82, outer: 0,
      aboveTitle(doc, cx, top, u) {
        const k = (12 * u) / 60;
        const base = top + 7 * u;
        pine(doc, cx - 12 * k, base, 24 * k, this.soft);
        pine(doc, cx, base, 34 * k, this.ink);
        pine(doc, cx + 12 * k, base, 24 * k, this.soft);
      },
      freeInk: [47, 93, 70],
      free() { return null; },
    },

    // Clearing's open grid inside an illustrated border (pnw-art.js). The
    // border sets the spacing, so the pads here are zero.
    northwest: {
      label: "Pacific Northwest", fonts: { titleFont: "greatvibes", clueFont: "cormorant" },
      ink: [42, 58, 48], soft: [47, 93, 70], line: [47, 93, 70], muted: [122, 138, 128],
      padTop: 0, padBottom: 0, padX: 0, above: 0, titleSize: 11,
      rulesW: 100, gridMax: 100, outer: 0, freeInk: [47, 93, 70],
      insets(w, h) {
        const m = window.PnwArt.metrics(w, h);
        return { top: m.band + 10 * m.s, bottom: m.bottom + 8 * m.s, x: m.band + 14 * m.s, titleW: w - 2 * m.corner };
      },
      card(doc, x, y, w, h) {
        const img = borderImage(w, h);
        doc.addImage(img.data, "JPEG", x, y, w, h, img.alias, "FAST");
      },
      free() { return null; },
    },

    plain: {
      label: "Plain", fonts: null,
      ink: [20, 20, 20], soft: [60, 60, 60], line: [20, 20, 20], muted: [110, 110, 110],
      padTop: 0, padBottom: 0, padX: 0, above: 0, titleSize: 12,
      rulesW: 100, gridMax: 100,
      free(doc, cx, cy, cell, rect) {
        doc.setFillColor(228, 234, 250);
        doc.rect(rect.x, rect.y, rect.w, rect.h, "F");
        return null;
      },
    },
  };
  STYLES.timberKraft = Object.assign(Object.create(STYLES.timber), { label: "Timber with kraft background", fill: true });

  // The illustrated border, painted once per card size at print resolution.
  const BORDER_DPI = 200;
  const borderCache = {};
  function borderImage(w, h) {
    const key = `${w.toFixed(1)}x${h.toFixed(1)}`;
    if (!borderCache[key]) {
      const W = Math.round((w / 72) * BORDER_DPI), H = Math.round((h / 72) * BORDER_DPI);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      window.PnwArt.drawBorder(ctx, W, H);
      borderCache[key] = { data: canvas.toDataURL("image/jpeg", 0.92), alias: "pnw-border-" + key };
    }
    return borderCache[key];
  }

  // Draws a title on one line in spaced capitals, as large as fits.
  function drawCapsTitle(doc, text, cx, cy, w, h) {
    const t = text.toUpperCase();
    let size = h * 0.85, cs;
    for (; size > 6; size -= 0.5) {
      doc.setFontSize(size);
      cs = size * 0.16;
      if (doc.getTextWidth(t) + cs * (t.length - 1) <= w) break;
    }
    doc.setFontSize(size);
    cs = size * 0.16;
    const tw = doc.getTextWidth(t) + cs * (t.length - 1);
    doc.text(t, cx - tw / 2, cy + size * 0.33, { charSpace: cs });
  }

  // `label` is the footer text (or ""); `place` marks the card's position in a
  // composite picture as { cols, rows, c, r }, drawn as a small map. `outer`
  // is the card's full area, including any bleed, for background fills.
  function drawCard(doc, fonts, card, s, label, place, x, y, w, h, outer) {
    const st = STYLES[s.style] || STYLES.northwest;
    const n = s.size;
    // Spacing unit: 1/100 of the card width, or less on short cards.
    const u = Math.min(w / 100, h / 120);
    const gap = Math.min(2.2 * u, 10);
    const ins = st.insets ? st.insets(w, h) : null;
    const padT = ins ? ins.top : st.padTop * u;
    const padB = ins ? ins.bottom : st.padBottom * u;
    const padX = ins ? ins.x : st.padX * u;
    const innerW = w - 2 * padX;
    const titleW = ins ? Math.min(innerW, ins.titleW) : innerW;
    const cx = x + w / 2;
    const aboveH = s.title ? st.above * u : 0;
    const titleH = s.title ? Math.min(st.titleSize * u, 64) : 0;
    const dividerH = s.title && st.dividerSize ? st.dividerSize * u : 0;
    const footerH = label ? Math.min(h * 0.05, 22) : 0;

    // The game explanation sits between the title and the grid.
    let rules = null;
    if (s.rules.length) {
      const bw = Math.min(innerW, st.rulesW * u);
      const px = (st.rulesPadX || 0) * u, py = (st.rulesPadY || 0) * u;
      const heading = st.heading && s.rulesHeading ? s.rulesHeading : "";
      const headCol = heading && st.headingCol ? st.headingCol * u : 0;
      const textW = bw - 2 * px - headCol - (headCol ? 2.5 * u : 0);
      doc.setFont(fonts.clue, "normal");
      const fit = fitBlock(doc, s.rules, textW, h * 0.15, Math.max(6, Math.min(2.5 * u, 13)), 5);
      const textH = fit.lines.length * fit.lineH;
      let headFit = null;
      if (heading && headCol) {
        doc.setFont(fonts.clue, "bold");
        headFit = fitBlock(doc, [heading.toUpperCase()], headCol, Math.max(textH, 3 * u), Math.min(1.8 * u, fit.size), 4);
      }
      const bodyH = Math.max(textH, headFit ? headFit.lines.length * headFit.lineH : 0);
      rules = { w: bw, px, py, heading, headCol, textW, fit, headFit, textH, bodyH, h: bodyH + 2 * py };
    }
    const rulesH = rules ? rules.h + gap + (rules.heading && !rules.headCol ? 1 * u : 0) : 0;

    const fixed = aboveH + titleH + (s.title ? gap : 0) + dividerH + rulesH + (label ? gap + footerH : 0);
    const side = Math.max(0, Math.min(innerW, st.gridMax * u, h - padT - padB - fixed));
    const blockH = fixed + side;
    let cursor = y + padT + (h - padT - padB - blockH) / 2;

    if (st.card) st.card(doc, x, y, w, h, u, outer || { x, y, w, h });

    if (s.title) {
      if (st.aboveTitle) st.aboveTitle(doc, cx, cursor, u);
      cursor += aboveH;
      doc.setTextColor(...st.ink);
      doc.setFont(fonts.title, "bold");
      if (st.caps) drawCapsTitle(doc, s.title, cx, cursor + titleH / 2, titleW, titleH);
      else drawCentered(doc, s.title, cx, cursor + titleH / 2, titleW, titleH, titleH * 0.85, 8);
      cursor += titleH + gap;
      if (dividerH) {
        st.divider(doc, cx, cursor + dividerH / 2 - gap / 2, u);
        cursor += dividerH;
      }
    }

    if (rules) {
      if (rules.heading && !rules.headCol) cursor += 1 * u;
      const r = { x: cx - rules.w / 2, y: cursor, w: rules.w, h: rules.h };
      const textX = r.x + rules.px + (rules.headCol ? rules.headCol + 2.5 * u : 0);
      if (rules.headCol) r.headingX = r.x + rules.headCol + 1.25 * u;
      let headingW = 0;
      if (rules.heading && !rules.headCol) {
        doc.setFont(fonts.clue, "bold");
        doc.setFontSize(Math.max(5, Math.min(1.7 * u, 9)));
        headingW = doc.getTextWidth(rules.heading.toUpperCase()) + 0.25 * u * rules.heading.length;
      }
      if (st.rulesFrame) st.rulesFrame(doc, r, u, headingW);
      doc.setTextColor(...st.soft);
      doc.setFont(fonts.clue, "normal");
      const textTop = r.y + rules.py + (rules.bodyH - rules.textH) / 2;
      if (rules.headCol) drawBlock(doc, rules.fit, textX, textTop, "left");
      else drawBlock(doc, rules.fit, cx, textTop, "center");
      if (rules.heading) {
        doc.setFont(fonts.clue, "bold");
        doc.setTextColor(...st.muted);
        if (rules.headCol) {
          const hf = rules.headFit;
          const hTop = r.y + rules.py + (rules.bodyH - hf.lines.length * hf.lineH) / 2;
          drawBlock(doc, hf, r.x, hTop, "left");
        } else {
          const size = Math.max(5, Math.min(1.7 * u, 9));
          doc.setFontSize(size);
          const t = rules.heading.toUpperCase();
          const cs = 0.25 * u;
          const tw = doc.getTextWidth(t) + cs * (t.length - 1);
          doc.text(t, cx - tw / 2, r.y + size * 0.33, { charSpace: cs });
        }
      }
      cursor += rules.h + gap;
    }

    const gx = cx - side / 2, gy = cursor;
    const cell = side / n;
    drawGrid(doc, fonts, card, st, n, gx, gy, side, cell);

    if (label) {
      const fy = gy + side + gap;
      doc.setFont(fonts.clue, place ? "bold" : "normal");
      doc.setTextColor(...st.muted);
      doc.setFontSize(Math.max(6, footerH * 0.6));
      doc.text(label, gx + side, fy + footerH * 0.7, { align: "right" });
      if (place) {
        const cs = Math.min(footerH / place.rows, (side * 0.3) / place.cols);
        const my = fy + (footerH - cs * place.rows) / 2;
        doc.setLineWidth(Math.min(0.5, cs / 8));
        doc.setDrawColor(130, 130, 130);
        doc.setFillColor(60, 60, 60);
        for (let r = 0; r < place.rows; r++) {
          for (let c = 0; c < place.cols; c++) {
            const here = r === place.r && c === place.c;
            doc.rect(gx + c * cs, my + r * cs, cs, cs, here ? "FD" : "S");
          }
        }
      }
    }
  }

  function drawGrid(doc, fonts, card, st, n, gx, gy, side, cell) {
    const tileGap = st.tiles ? cell * 0.055 : 0;
    const radius = cell * 0.07;
    const rectOf = (i) => ({
      x: gx + (i % n) * cell + tileGap / 2, y: gy + Math.floor(i / n) * cell + tileGap / 2,
      w: cell - tileGap, h: cell - tileGap, r: radius,
    });

    if (st.tiles) {
      doc.setFillColor(...st.tile);
      card.forEach((c, i) => {
        if (c.free) return;
        const r = rectOf(i);
        doc.roundedRect(r.x, r.y, r.w, r.h, r.r, r.r, "F");
      });
    } else {
      // Plain fills the free square before the lines go on top.
      if (st === STYLES.plain) {
        card.forEach((c, i) => { if (c.free) st.free(doc, 0, 0, cell, rectOf(i)); });
      }
      doc.setDrawColor(...st.line);
      doc.setLineWidth(Math.max(0.5, side / 400));
      for (let i = 1; i < n; i++) {
        doc.line(gx + i * cell, gy, gx + i * cell, gy + side);
        doc.line(gx, gy + i * cell, gx + side, gy + i * cell);
      }
      // `outer` is the border width as a share of the grid; 0 means none.
      const outer = st.outer === undefined ? 0.005 : st.outer;
      if (outer) {
        doc.setDrawColor(...st.ink);
        doc.setLineWidth(Math.max(1, side * outer));
        doc.rect(gx, gy, side, side, "S");
      }
    }

    const pad = cell * 0.08;
    const maxFont = Math.min(cell * 0.22, 20);
    card.forEach((c, i) => {
      const cx = gx + (i % n) * cell + cell / 2;
      const cy = gy + Math.floor(i / n) * cell + cell / 2;
      doc.setFont(fonts.clue, "normal");
      doc.setTextColor(...st.ink);
      if (!c.free) {
        drawCentered(doc, c.text, cx, cy, cell - 2 * pad - tileGap, cell - 2 * pad - tileGap, maxFont, 4);
        return;
      }
      // The free square uses the clue font, a little larger.
      let box = st === STYLES.plain ? null : st.free(doc, cx, cy, cell, rectOf(i));
      if (st.freeInk) doc.setTextColor(...st.freeInk);
      if (box && box.plaque) {
        doc.setFont(fonts.clue, "normal");
        const fit = fitText(doc, c.text, box.w, box.h, maxFont * 1.2, 4);
        doc.setFontSize(fit.size);
        const tw = Math.max(...fit.lines.map((l) => doc.getTextWidth(l)));
        const ph = fit.lines.length * fit.lineH;
        doc.setFillColor(...st.ink);
        doc.rect(cx - tw / 2 - fit.size * 0.45, cy - ph / 2 - fit.size * 0.15, tw + fit.size * 0.9, ph + fit.size * 0.3, "F");
        doc.setTextColor(...st.kraft);
      }
      if (!box) box = { w: cell - 2 * pad, h: cell - 2 * pad };
      drawCentered(doc, c.text, cx, cy, box.w, box.h, maxFont * 1.2, 4);
    });
  }

  // Crop marks in the page margins, one in line with every cut. None go
  // between cards, where marks from neighbouring cards would run together.
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
    const doc = new jsPDF({ unit: "pt", format: s.paper, orientation: "portrait" });
    const fonts = {
      title: await useFont(doc, s.titleFont),
      clue: await useFont(doc, s.clueFont),
    };
    const layout = pageLayout(s);
    const { w, h } = layout;
    const hasBack = s.bgMode !== "none" && bgImage;
    const grid = s.bgMode === "composite" ? compositeGrid(s) : null;
    const backFor = hasBack ? backImages(s) : null;
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
          place = { cols, rows, c: i % cols, r: Math.floor(i / cols) };
          label = `#${i + 1} · row ${place.r + 1}, col ${place.c + 1}`;
        }
        const bleed = hasBack ? BLEED : 0;
        const outer = { x: slot.x - bleed, y: slot.y - bleed, w: w + 2 * bleed, h: h + 2 * bleed };
        drawCard(doc, fonts, card, s, label, place, slot.x + inset, slot.y + inset, w - 2 * inset, h - 2 * inset, outer);
      });
      if (!hasBack) continue;
      drawCropMarks(doc, layout, layout.slots.slice(0, batch.length));
      // The reverse page: each back mirrored to sit behind its front.
      doc.addPage();
      batch.forEach((card, k) => {
        const i = start + k;
        const pos = backSlot(s, layout, layout.slots[k]);
        const img = backFor(i);
        doc.addImage(img.data, "JPEG", pos.x - BLEED, pos.y - BLEED, w + 2 * BLEED, h + 2 * BLEED, img.alias, "FAST");
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
  for (const key of ["northwest", "evergreen", "fern", "timber", "timberKraft", "clearing", "plain"]) {
    const st = STYLES[key];
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = st.label;
    $("style").appendChild(opt);
  }
  $("style").value = "northwest";
  loadForm();
  updateArrangeOptions();
  updateCount();
  updateFontSamples();
  updateBackground();
  regenerate();

  $("bgFile").addEventListener("change", (e) => loadImage(e.target.files[0]));
  $("count").addEventListener("input", () => { updateArrangeOptions(); updateBackground(); });
  $("form").addEventListener("change", updateBackground);
  for (const id of ["bgMode", "arrange", "flip"]) {
    $(id).addEventListener("change", () => { showBack = true; });
  }
  window.addEventListener("resize", updateBackground);

  // Picking a style also picks its suggested fonts; they can be changed after.
  $("style").addEventListener("change", () => {
    const f = (STYLES[$("style").value] || {}).fonts;
    if (f) {
      $("titleFont").value = f.titleFont;
      $("clueFont").value = f.clueFont;
    }
    saveForm();
    updateFontSamples();
    scheduleRegenerate();
  });

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
  window.BingoMaker = { readSettings, makeCards, buildPdf, FONTS, STYLES, pageLayout, compositeGrid };
})();
