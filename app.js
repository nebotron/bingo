(function () {
  "use strict";

  const STORAGE_KEY = "bingo-card-maker:v1";
  const $ = (id) => document.getElementById(id);
  const fields = ["title", "clues", "free", "useFree", "titleFont", "clueFont",
    "size", "count", "perPage", "paper", "numbered", "bgMode", "arrange", "flip"];

  // Page geometry, in points. Cards are cut at their slot edges, so when a
  // back image is used the slot is the trim box.
  const PAPER = { letter: [612, 792], a4: [595.28, 841.89] };
  const MARGIN = 36;
  const SPACING = 24;
  const BLEED = 9;        // 1/8": back image runs past the trim line
  const SAFE = 14;        // keeps front content clear of the trim line
  const MAX_DPI = 250;

  // The image the user picked; never stored (it can be large).
  let bgImage = null;

  // ---------- fonts ----------

  // Files live in fonts/. Fonts without a bold file use the regular one for bold.
  const FONTS = {
    helvetica:  { label: "Helvetica", group: "Plain", css: "Helvetica, Arial, sans-serif", builtin: true },
    greatvibes: { label: "Great Vibes", group: "Calligraphy", css: "Great Vibes", normal: "GreatVibes-Regular.ttf" },
    pinyon:     { label: "Pinyon Script", group: "Calligraphy", css: "Pinyon Script", normal: "PinyonScript-Regular.ttf" },
    parisienne: { label: "Parisienne", group: "Calligraphy", css: "Parisienne", normal: "Parisienne-Regular.ttf" },
    allura:     { label: "Allura", group: "Calligraphy", css: "Allura", normal: "Allura-Regular.ttf" },
    alexbrush:  { label: "Alex Brush", group: "Calligraphy", css: "Alex Brush", normal: "AlexBrush-Regular.ttf" },
    dancing:    { label: "Dancing Script", group: "Calligraphy", css: "Dancing Script", normal: "DancingScript-Medium.ttf", bold: "DancingScript-Bold.ttf" },
    cormorant:  { label: "Cormorant Garamond", group: "Elegant serif", css: "Cormorant Garamond", normal: "CormorantGaramond-Medium.ttf", bold: "CormorantGaramond-Bold.ttf" },
    ebgaramond: { label: "EB Garamond", group: "Elegant serif", css: "EB Garamond", normal: "EBGaramond-Regular.ttf", bold: "EBGaramond-Bold.ttf" },
    playfair:   { label: "Playfair Display", group: "Elegant serif", css: "Playfair Display", normal: "PlayfairDisplay-Regular.ttf", bold: "PlayfairDisplay-Bold.ttf" },
    lora:       { label: "Lora", group: "Elegant serif", css: "Lora", normal: "Lora-Regular.ttf", bold: "Lora-Bold.ttf" },
  };
  const DEFAULT_FONTS = { titleFont: "greatvibes", clueFont: "cormorant" };

  const fontData = {}; // file -> Promise<base64>

  function loadFontFile(file) {
    if (!fontData[file]) {
      fontData[file] = fetch("fonts/" + file)
        .then((r) => {
          if (!r.ok) throw new Error(`Could not load font ${file}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          const bytes = new Uint8Array(buf);
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          return btoa(bin);
        });
      fontData[file].catch(() => delete fontData[file]);
    }
    return fontData[file];
  }

  // Registers a font with the document and returns the jsPDF family name.
  async function useFont(doc, key) {
    const f = FONTS[key] || FONTS.helvetica;
    if (f.builtin) return "helvetica";
    for (const style of ["normal", "bold"]) {
      const file = f[style] || f.normal;
      const b64 = await loadFontFile(file);
      doc.addFileToVFS(file, b64);
      doc.addFont(file, key, style);
    }
    return key;
  }

  function populateFontSelects() {
    for (const id of ["titleFont", "clueFont"]) {
      const sel = $(id);
      const groups = {};
      for (const [key, f] of Object.entries(FONTS)) {
        if (!groups[f.group]) {
          groups[f.group] = document.createElement("optgroup");
          groups[f.group].label = f.group;
        }
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = f.label;
        groups[f.group].appendChild(opt);
      }
      for (const g of ["Calligraphy", "Elegant serif", "Plain"]) sel.appendChild(groups[g]);
      sel.value = DEFAULT_FONTS[id];
    }
  }

  function updateFontSamples() {
    for (const el of document.querySelectorAll(".font-sample")) {
      const key = $(el.dataset.for).value;
      const f = FONTS[key] || FONTS.helvetica;
      el.style.fontFamily = f.builtin ? f.css : `"${f.css}", serif`;
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
    return {
      title: $("title").value.trim(),
      clues,
      free: $("free").value.trim() || "FREE",
      useFree: $("useFree").checked,
      titleFont: $("titleFont").value,
      clueFont: $("clueFont").value,
      size: parseInt($("size").value, 10),
      count: Math.max(1, Math.min(1000, parseInt($("count").value, 10) || 1)),
      perPage: parseInt($("perPage").value, 10),
      paper: $("paper").value,
      numbered: $("numbered").checked,
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable */ }
  }

  function loadForm() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!data) return;
      for (const f of fields) {
        if (!(f in data)) continue;
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

  // `label` is the footer text (or ""); `place` marks the card's position in a
  // composite picture as { cols, rows, c, r }, drawn as a small map.
  function drawCard(doc, fonts, card, s, label, place, x, y, w, h) {
    const n = s.size;
    const titleH = s.title ? Math.min(h * 0.12, 64) : 0;
    const footerH = label ? Math.min(h * (place ? 0.05 : 0.04), place ? 22 : 18) : 0;
    const gap = Math.min(h * 0.02, 10);
    const avail = h - titleH - footerH - (s.title ? gap : 0) - (label ? gap : 0);
    const side = Math.min(w, avail);
    const gx = x + (w - side) / 2;
    const blockH = titleH + (s.title ? gap : 0) + side + (label ? gap + footerH : 0);
    const top = y + (h - blockH) / 2;
    const gy = top + titleH + (s.title ? gap : 0);
    const cell = side / n;

    doc.setTextColor(20, 20, 20);

    if (s.title) {
      doc.setFont(fonts.title, "bold");
      drawCentered(doc, s.title, x + w / 2, top + titleH / 2, w, titleH, titleH * 0.85, 8);
    }

    // Free-space shading, then grid lines.
    card.forEach((c, i) => {
      if (!c.free) return;
      doc.setFillColor(228, 234, 250);
      doc.rect(gx + (i % n) * cell, gy + Math.floor(i / n) * cell, cell, cell, "F");
    });

    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(Math.max(0.5, side / 400));
    for (let i = 1; i < n; i++) {
      doc.line(gx + i * cell, gy, gx + i * cell, gy + side);
      doc.line(gx, gy + i * cell, gx + side, gy + i * cell);
    }
    doc.setLineWidth(Math.max(1, side / 200));
    doc.rect(gx, gy, side, side, "S");

    const pad = cell * 0.08;
    const maxFont = Math.min(cell * 0.22, 20);
    card.forEach((c, i) => {
      const cx = gx + (i % n) * cell + cell / 2;
      const cy = gy + Math.floor(i / n) * cell + cell / 2;
      if (c.free) doc.setFont(fonts.title, "bold");
      else doc.setFont(fonts.clue, "normal");
      drawCentered(doc, c.text, cx, cy, cell - 2 * pad, cell - 2 * pad, c.free ? maxFont * 1.4 : maxFont, 4);
    });

    if (label) {
      const fy = gy + side + gap;
      doc.setFont(fonts.clue, place ? "bold" : "normal");
      doc.setTextColor(110, 110, 110);
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
        let label = s.numbered ? `Card #${i + 1}` : "";
        let place = null;
        if (grid) {
          const [cols, rows] = grid;
          place = { cols, rows, c: i % cols, r: Math.floor(i / cols) };
          label = `#${i + 1} · row ${place.r + 1}, col ${place.c + 1}`;
        }
        drawCard(doc, fonts, card, s, label, place, slot.x + inset, slot.y + inset, w - 2 * inset, h - 2 * inset);
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
  window.BingoMaker = { readSettings, makeCards, buildPdf, FONTS, pageLayout, compositeGrid };
})();
