(function () {
  "use strict";

  const STORAGE_KEY = "bingo-card-maker:v1";
  const $ = (id) => document.getElementById(id);
  const fields = ["title", "clues", "free", "useFree", "size", "count", "perPage", "paper", "numbered"];

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

  // ---------- validation / UI ----------

  function validate(s) {
    const need = cluesNeeded(s);
    if (s.clues.length < need) {
      return `A ${s.size}×${s.size} card needs ${need} unique clues; you have ${s.clues.length}.`;
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

  function renderPreview() {
    const s = readSettings();
    const box = $("preview");
    box.innerHTML = "";
    const err = validate(s);
    if (err) {
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

  function drawCard(doc, card, s, number, x, y, w, h) {
    const n = s.size;
    const titleH = s.title ? Math.min(h * 0.1, 56) : 0;
    const footerH = s.numbered ? Math.min(h * 0.04, 18) : 0;
    const gap = Math.min(h * 0.02, 10);
    const avail = h - titleH - footerH - (s.title ? gap : 0) - (s.numbered ? gap : 0);
    const side = Math.min(w, avail);
    const gx = x + (w - side) / 2;
    const blockH = titleH + (s.title ? gap : 0) + side + (s.numbered ? gap + footerH : 0);
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

    if (s.numbered) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(110, 110, 110);
      doc.setFontSize(Math.max(6, footerH * 0.6));
      doc.text(`Card #${number}`, gx + side, gy + side + gap + footerH * 0.7, { align: "right" });
    }
  }

  function buildPdf(s, cards) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: s.paper, orientation: "portrait" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 36;
    const layout = { 1: [1, 1], 2: [1, 2], 4: [2, 2] }[s.perPage];
    const [cols, rows] = layout;
    const spacing = 24;
    const slotW = (pw - 2 * margin - (cols - 1) * spacing) / cols;
    const slotH = (ph - 2 * margin - (rows - 1) * spacing) / rows;

    cards.forEach((card, i) => {
      const slot = i % s.perPage;
      if (i > 0 && slot === 0) doc.addPage();
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      drawCard(doc, card, s, i + 1,
        margin + col * (slotW + spacing),
        margin + row * (slotH + spacing),
        slotW, slotH);
    });
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
  updateCount();
  renderPreview();

  $("form").addEventListener("submit", generate);
  $("previewBtn").addEventListener("click", renderPreview);
  $("form").addEventListener("input", () => {
    saveForm();
    updateCount();
    $("error").textContent = "";
  });
  $("form").addEventListener("change", renderPreview);
  let t;
  $("clues").addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(renderPreview, 300);
  });

  // Exposed for testing.
  window.BingoMaker = { readSettings, makeCards, buildPdf };
})();
