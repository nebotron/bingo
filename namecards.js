// Foldable place cards. Each card prints as a strip twice the folded height:
// the bottom half is the front, and the top half carries the same face turned
// upside down, so after folding along the middle it reads from both sides.
(function () {
  "use strict";

  const STORAGE_KEY = "name-cards:v1";
  const $ = (id) => document.getElementById(id);
  const fields = ["names", "border", "nameFont", "detailFont", "cardSize", "paper", "bothSides"];
  const { useFont, fillFontSelect, cssFamily } = window.PdfFonts;

  const PAPER = { letter: [612, 792], a4: [595.28, 841.89] };
  // Folded size in points; the printed piece is twice as tall.
  const SIZES = { tiny: [216, 72], small: [252, 144], medium: [270, 180], large: [504, 324] };
  const MIN_MARGIN = 24;
  // Cards butt up against each other so neighbours share a single cut.
  const SPACING = 0;
  const INK = [42, 58, 48];
  const SOFT = [47, 93, 70];
  const CUT = [150, 150, 150];

  // ---------- settings ----------

  function readSettings() {
    const cards = [];
    for (const raw of $("names").value.split(/\r?\n/)) {
      const [name, ...rest] = raw.split(/\t|\|/).map((p) => p.trim().replace(/\s+/g, " "));
      const detail = rest.filter(Boolean).join(" · ");
      if (name || detail) cards.push({ name: name || "", detail });
    }
    return {
      cards,
      border: $("border").value,
      nameFont: $("nameFont").value,
      detailFont: $("detailFont").value,
      size: SIZES[$("cardSize").value] ? $("cardSize").value : "tiny",
      paper: $("paper").value,
      bothSides: $("bothSides").checked,
    };
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
      if (!data) return false;
      for (const f of fields) {
        if (!(f in data)) continue;
        const el = $(f);
        if (el.type === "checkbox") el.checked = !!data[f];
        else if (el.tagName !== "SELECT" || [...el.options].some((o) => o.value === data[f])) el.value = data[f];
      }
      return true;
    } catch (e) { return false; }
  }

  // ---------- layout ----------

  function pageLayout(s) {
    const [pw, ph] = PAPER[s.paper];
    const [w, fh] = SIZES[s.size];
    const h = fh * 2;
    const cols = Math.max(1, Math.floor((pw - 2 * MIN_MARGIN + SPACING) / (w + SPACING)));
    const rows = Math.max(1, Math.floor((ph - 2 * MIN_MARGIN + SPACING) / (h + SPACING)));
    const x0 = (pw - cols * w - (cols - 1) * SPACING) / 2;
    const y0 = (ph - rows * h - (rows - 1) * SPACING) / 2;
    const slots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) slots.push({ x: x0 + c * (w + SPACING), y: y0 + r * (h + SPACING) });
    }
    return { pw, ph, w, fh, h, slots, margin: Math.min(x0, y0) };
  }

  // The space the border leaves for text, as insets from the face's edges.
  function insets(border, w, h) {
    const m = border === "floral" ? window.PnwArt.floralMetrics(w, h) : window.PnwArt.metrics(w, h);
    return { top: m.top, bottom: m.bottom, x: m.side };
  }

  // ---------- text ----------

  function wrapWords(doc, text, w) {
    const lines = [];
    let line = "";
    for (const word of text.split(" ")) {
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

  // The largest size at which the name fits w × h. A name stays on one line
  // unless that would make it much smaller than breaking it between words.
  function fitName(doc, text, w, h, maxSize) {
    const words = text.split(" ");
    const fits = (size, maxLines) => {
      doc.setFontSize(size);
      if (words.some((word) => doc.getTextWidth(word) > w)) return null;
      const lines = wrapWords(doc, text, w);
      const lineH = size * 1.05;
      return lines.length <= maxLines && lines.length * lineH <= h ? { size, lines, lineH } : null;
    };
    const best = (maxLines) => {
      for (let size = maxSize; size > 6; size -= 0.5) {
        const fit = fits(size, maxLines);
        if (fit) return fit;
      }
      return null;
    };
    const one = best(1);
    if (one && (one.size >= maxSize * 0.6 || words.length === 1)) return one;
    const two = best(2);
    if (two && (!one || two.size > one.size * 1.2)) return two;
    if (one) return one;
    doc.setFontSize(6);
    return { size: 6, lines: wrapWords(doc, text, w), lineH: 6.3 };
  }

  // Draws one face. `side` 0 is the front (bottom half, upright); side 1 is
  // the top half, turned 180° so it faces the other way once folded.
  function drawFace(doc, fonts, card, s, side, x, y, w, h) {
    const toPage = (fx, fy) => (side ? [x + w - fx, y + h - fy] : [x + fx, y + h + fy]);
    const put = (text, fx, fy, opts) => {
      const [px, py] = toPage(fx, fy);
      doc.text(text, px, py, side ? { ...opts, angle: 180 } : opts);
    };
    // The border as vector art; the back half is the same art turned 180°.
    window.PdfCanvas.placeArt(doc, `nc-${s.border}-${w}x${h}`, w, h, x, side ? y : y + h, !!side, (ctx) => {
      if (s.border === "floral") window.PnwArt.drawFloralFrame(ctx, w, h);
      else window.PnwArt.drawBorder(ctx, w, h);
    });

    const ins = insets(s.border, w, h);
    const boxW = w - 2 * ins.x;
    const boxH = h - ins.top - ins.bottom;
    const cx = w / 2;

    // The second line, in small spaced capitals.
    let detail = null;
    if (card.detail) {
      doc.setFont(fonts.detail, "normal");
      const t = card.detail.toUpperCase();
      let size = Math.min(boxH * 0.12, 16);
      for (; size > 5; size -= 0.25) {
        doc.setFontSize(size);
        if (doc.getTextWidth(t) + size * 0.18 * (t.length - 1) <= boxW * 0.9) break;
      }
      detail = { t, size, cs: size * 0.18, h: size * 2.1 };
    }

    const nameH = boxH - (detail ? detail.h : 0);
    let blockTop = ins.top;
    if (card.name) {
      doc.setFont(fonts.name, "normal");
      // Capped so a short name doesn't fill the whole card.
      const fit = fitName(doc, card.name, boxW, nameH, Math.min(nameH * 0.62, boxW * 0.2, 72));
      const total = fit.lines.length * fit.lineH + (detail ? detail.h : 0);
      blockTop = ins.top + (boxH - total) / 2;
      doc.setFontSize(fit.size);
      doc.setTextColor(...INK);
      let by = blockTop + fit.lineH / 2 + fit.size * 0.3;
      for (const line of fit.lines) {
        const tw = doc.getTextWidth(line);
        put(line, cx - tw / 2, by);
        by += fit.lineH;
      }
      blockTop += fit.lines.length * fit.lineH;
    } else if (detail) {
      blockTop = ins.top + (boxH - detail.h) / 2;
    }

    if (detail) {
      doc.setFont(fonts.detail, "normal");
      doc.setFontSize(detail.size);
      doc.setTextColor(...SOFT);
      const tw = doc.getTextWidth(detail.t) + detail.cs * (detail.t.length - 1);
      const dy = blockTop + detail.h * 0.55 + detail.size * 0.33;
      // A short rule above the line, the width of the text.
      if (card.name) {
        const [ax, ay] = toPage(cx - Math.min(tw, boxW * 0.5) / 2, blockTop + detail.size * 0.35);
        const [bx, by] = toPage(cx + Math.min(tw, boxW * 0.5) / 2, blockTop + detail.size * 0.35);
        doc.setDrawColor(...SOFT);
        doc.setLineWidth(0.4);
        doc.line(ax, ay, bx, by);
      }
      put(detail.t, cx - tw / 2, dy, { charSpace: detail.cs });
    }
  }

  // Crop marks in the page margins in line with every cut, and dashed fold
  // marks in line with each card's middle.
  function drawMarks(doc, layout, slots) {
    const { w, h, fh } = layout;
    const off = 4, len = Math.max(6, Math.min(16, layout.margin - 8));
    const xs = [...new Set(slots.flatMap((p) => [p.x, p.x + w]))];
    const ys = [...new Set(slots.flatMap((p) => [p.y, p.y + h]))];
    const folds = [...new Set(slots.map((p) => p.y + fh))];
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
    doc.setLineDashPattern([2, 2], 0);
    doc.setDrawColor(...CUT);
    for (const y of folds) {
      doc.line(left - off, y, left - off - len, y);
      doc.line(right + off, y, right + off + len, y);
    }
    doc.setLineDashPattern([], 0);
  }

  async function buildPdf(s) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: s.paper, orientation: "portrait", compress: true, floatPrecision: 2 });
    const fonts = { name: await useFont(doc, s.nameFont), detail: await useFont(doc, s.detailFont) };
    const layout = pageLayout(s);
    const per = layout.slots.length;
    for (let start = 0; start < s.cards.length; start += per) {
      if (start > 0) doc.addPage();
      const batch = s.cards.slice(start, start + per);
      batch.forEach((card, k) => {
        const slot = layout.slots[k];
        drawFace(doc, fonts, card, s, 0, slot.x, slot.y, layout.w, layout.fh);
        if (s.bothSides) drawFace(doc, fonts, card, s, 1, slot.x, slot.y, layout.w, layout.fh);
        else {
          // The back stays plain; outline it so the cut is still easy to see.
          doc.setDrawColor(...CUT);
          doc.setLineWidth(0.3);
          doc.rect(slot.x, slot.y, layout.w, layout.fh, "S");
        }
      });
      drawMarks(doc, layout, layout.slots.slice(0, batch.length));
    }
    return doc;
  }

  // ---------- preview / download ----------

  let current = null;
  let buildId = 0;
  let pending = null;

  function fileName() {
    return "name-cards.pdf";
  }

  function showEmpty(empty) {
    $("pdfFrame").hidden = empty;
    $("pdfEmpty").hidden = !empty;
  }

  function updateInfo() {
    const s = readSettings();
    const per = pageLayout(s).slots.length;
    const n = s.cards.length;
    const pages = Math.ceil(n / per);
    $("nameCount").textContent = n
      ? `${n} card${n === 1 ? "" : "s"} · ${per} per page · ${pages} page${pages === 1 ? "" : "s"}`
      : "";
    const first = s.cards.find((c) => c.name) || {};
    const withDetail = s.cards.find((c) => c.detail) || {};
    for (const el of document.querySelectorAll(".font-sample")) {
      el.style.fontFamily = cssFamily($(el.dataset.for).value);
      el.textContent = el.dataset.for === "nameFont" ? first.name || "Emma Thompson" : withDetail.detail || "Table 4";
    }
  }

  function regenerate() {
    const id = ++buildId;
    const s = readSettings();
    $("error").textContent = "";
    if (!s.cards.length) {
      showEmpty(true);
      $("status").textContent = "";
      pending = null;
      return Promise.resolve();
    }
    if (!window.jspdf || !window.PnwArt) {
      $("error").textContent = "A script failed to load. Please reload the page.";
      return Promise.resolve();
    }
    $("status").textContent = "Generating…";
    pending = buildPdf(s).then((doc) => {
      if (id !== buildId) return;
      if (current) URL.revokeObjectURL(current.url);
      const url = URL.createObjectURL(doc.output("blob"));
      current = { doc, url, name: fileName() };
      $("pdfFrame").src = url + "#view=FitH";
      showEmpty(false);
      const pages = doc.getNumberOfPages();
      $("status").textContent = `${s.cards.length} card${s.cards.length === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"}`;
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

  fillFontSelect($("nameFont"), "greatvibes");
  fillFontSelect($("detailFont"), "cormorant");
  if (!loadForm()) {
    $("names").value = "Emma Thompson | Table 1\nJames Carter | Table 1\nOlivia Martinez | Table 2\nNoah Williams | Table 2";
  }
  updateInfo();
  regenerate();

  $("form").addEventListener("submit", download);
  const changed = () => {
    saveForm();
    updateInfo();
    scheduleRegenerate();
  };
  $("form").addEventListener("input", changed);
  $("form").addEventListener("change", changed);

  // Exposed for testing.
  window.NameCards = { readSettings, buildPdf, pageLayout };
})();
