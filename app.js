(function () {
  "use strict";

  const STORAGE_KEY = "bingo-card-maker:v1";
  const $ = (id) => document.getElementById(id);
  const fields = ["title", "clues", "free", "useFree", "titleFont", "clueFont",
    "size", "count", "perPage", "paper", "numbered"];

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

  function drawCard(doc, fonts, card, s, number, x, y, w, h) {
    const n = s.size;
    const titleH = s.title ? Math.min(h * 0.12, 64) : 0;
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

    if (s.numbered) {
      doc.setFont(fonts.clue, "normal");
      doc.setTextColor(110, 110, 110);
      doc.setFontSize(Math.max(6, footerH * 0.6));
      doc.text(`Card #${number}`, gx + side, gy + side + gap + footerH * 0.7, { align: "right" });
    }
  }

  async function buildPdf(s, cards) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: s.paper, orientation: "portrait" });
    const fonts = {
      title: await useFont(doc, s.titleFont),
      clue: await useFont(doc, s.clueFont),
    };
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 36;
    const [cols, rows] = { 1: [1, 1], 2: [1, 2], 4: [2, 2] }[s.perPage];
    const spacing = 24;
    const slotW = (pw - 2 * margin - (cols - 1) * spacing) / cols;
    const slotH = (ph - 2 * margin - (rows - 1) * spacing) / rows;

    cards.forEach((card, i) => {
      const slot = i % s.perPage;
      if (i > 0 && slot === 0) doc.addPage();
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      drawCard(doc, fonts, card, s, i + 1,
        margin + col * (slotW + spacing),
        margin + row * (slotH + spacing),
        slotW, slotH);
    });
    return doc;
  }

  // ---------- preview / download ----------

  let current = null;   // { doc, url, name }
  let buildId = 0;
  let pending = null;   // Promise of the in-flight build

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
      $("pdfFrame").src = url + "#view=FitH";
      showEmpty(false);
      const pages = doc.getNumberOfPages();
      $("status").textContent = `${s.count} card${s.count === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"}`;
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
  regenerate();

  $("form").addEventListener("submit", download);
  $("shuffleBtn").addEventListener("click", () => {
    clearTimeout(timer);
    timer = null;
    regenerate();
  });
  $("form").addEventListener("input", () => {
    saveForm();
    updateCount();
    updateFontSamples();
    scheduleRegenerate();
  });

  // Exposed for testing.
  window.BingoMaker = { readSettings, makeCards, buildPdf, FONTS };
})();
