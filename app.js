(function () {
  "use strict";

  const STORAGE_KEY = "bingo-card-maker:v1";
  const $ = (id) => document.getElementById(id);
  const fields = ["title", "clues", "free", "useFree", "size", "count", "perPage", "paper", "numbered",
    "bgMode", "arrange", "flip"];

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

  // ---------- settings ----------

  function readSettings() {
    const clues = [];
    const seen = new Set();
    for (const raw of $("clues").value.split(/\r?\n/)) {
      const clue = raw.trim();
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
        if (el.type === "checkbox") el.checked = !!data[f];
        else el.value = data[f];
        // The arrangement options are built later; remember the choice.
        if (f === "arrange") el.dataset.want = data[f];
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
      if ($("bgMode").value === "none") {
        $("bgMode").value = "simple";
        saveForm();
      }
      $("error").textContent = "";
      updateBackground();
    };
    img.onerror = () => {
      bgImage = null;
      URL.revokeObjectURL(url);
      $("error").textContent = "That file couldn't be read as an image.";
      updateBackground();
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

  function renderPreview() {
    const s = readSettings();
    const box = $("preview");
    box.innerHTML = "";
    if (s.clues.length < cluesNeeded(s)) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Add enough clues to see a sample card.";
      box.appendChild(p);
      return;
    }
    const card = makeCard(s);
    if (s.title) {
      const t = document.createElement("div");
      t.className = "ptitle";
      t.textContent = s.title;
      box.appendChild(t);
    }
    const grid = document.createElement("div");
    grid.className = "pgrid";
    grid.style.gridTemplateColumns = `repeat(${s.size}, 1fr)`;
    for (const cell of card) {
      const div = document.createElement("div");
      div.textContent = cell.text;
      if (cell.free) div.className = "free";
      grid.appendChild(div);
    }
    box.appendChild(grid);
  }

  // ---------- PDF ----------

  // Find the largest font size at which `text` wraps to fit within w × h.
  function fitText(doc, text, w, h, maxSize, minSize) {
    for (let size = maxSize; size >= minSize; size -= 0.5) {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, w);
      const lineH = size * 1.15;
      if (lines.length * lineH <= h && lines.every((l) => doc.getTextWidth(l) <= w)) {
        return { size, lines, lineH };
      }
    }
    doc.setFontSize(minSize);
    return { size: minSize, lines: doc.splitTextToSize(text, w), lineH: minSize * 1.15 };
  }

  function drawCentered(doc, text, cx, cy, w, h, maxSize, minSize) {
    const fit = fitText(doc, text, w, h, maxSize, minSize);
    doc.setFontSize(fit.size);
    const total = fit.lines.length * fit.lineH;
    // Baseline of the first line: top of block + ascent (~0.8 × size) + half leading.
    let y = cy - total / 2 + fit.lineH / 2 + fit.size * 0.35;
    for (const line of fit.lines) {
      doc.text(line, cx, y, { align: "center" });
      y += fit.lineH;
    }
  }

  // `label` is the footer text (or ""); `place` marks the card's position in a
  // composite picture as { cols, rows, c, r }, drawn as a small map.
  function drawCard(doc, card, s, label, place, x, y, w, h) {
    const n = s.size;
    const titleH = s.title ? Math.min(h * 0.1, 56) : 0;
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
      doc.setFont("helvetica", "bold");
      drawCentered(doc, s.title, x + w / 2, top + titleH / 2, w, titleH, titleH * 0.8, 8);
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
      doc.setFont("helvetica", c.free ? "bold" : "normal");
      drawCentered(doc, c.text, cx, cy, cell - 2 * pad, cell - 2 * pad, maxFont, 4);
    });

    if (label) {
      const fy = gy + side + gap;
      doc.setFont("helvetica", place ? "bold" : "normal");
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

  // Corner crop marks just outside the trim box, clear of neighbouring cards.
  function drawCropMarks(doc, x, y, w, h) {
    const off = 2, len = 8;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    for (const [cx, dx] of [[x, -1], [x + w, 1]]) {
      for (const [cy, dy] of [[y, -1], [y + h, 1]]) {
        doc.line(cx + dx * off, cy, cx + dx * (off + len), cy);
        doc.line(cx, cy + dy * off, cx, cy + dy * (off + len));
      }
    }
  }

  function buildPdf(s, cards) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: s.paper, orientation: "portrait" });
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
        if (hasBack) drawCropMarks(doc, slot.x, slot.y, w, h);
        drawCard(doc, card, s, label, place, slot.x + inset, slot.y + inset, w - 2 * inset, h - 2 * inset);
      });
      if (!hasBack) continue;
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

  function generate(e) {
    e.preventDefault();
    const s = readSettings();
    const err = validate(s);
    $("error").textContent = err;
    if (err) return;
    if (!window.jspdf) {
      $("error").textContent = "The PDF library failed to load. Please reload the page.";
      return;
    }
    const btn = $("generateBtn");
    btn.disabled = true;
    btn.textContent = "Generating…";
    setTimeout(() => {
      try {
        const doc = buildPdf(s, makeCards(s));
        const name = (s.title || "bingo").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "bingo";
        doc.save(`${name}-cards.pdf`);
      } catch (ex) {
        console.error(ex);
        $("error").textContent = "Something went wrong generating the PDF: " + ex.message;
      } finally {
        btn.disabled = false;
        btn.textContent = "Download PDF";
      }
    }, 20);
  }

  // ---------- wiring ----------

  loadForm();
  updateArrangeOptions();
  updateCount();
  updateBackground();
  renderPreview();

  $("bgFile").addEventListener("change", (e) => loadImage(e.target.files[0]));
  $("count").addEventListener("input", () => { updateArrangeOptions(); updateBackground(); });
  window.addEventListener("resize", updateBackground);

  $("form").addEventListener("submit", generate);
  $("previewBtn").addEventListener("click", renderPreview);
  $("form").addEventListener("input", () => {
    saveForm();
    updateCount();
    $("error").textContent = "";
  });
  $("form").addEventListener("change", renderPreview);
  $("form").addEventListener("change", updateBackground);
  let t;
  $("clues").addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(renderPreview, 300);
  });

  // Exposed for testing.
  window.BingoMaker = { readSettings, makeCards, buildPdf, pageLayout, compositeGrid };
})();
