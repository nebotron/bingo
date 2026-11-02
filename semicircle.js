(function () {
  "use strict";

  const STORAGE_KEY = "half-circle-text:v2";
  const $ = (id) => document.getElementById(id);
  const fields = ["leftText", "rightText", "font", "bold", "color", "fontSize", "radius",
    "lineHeight", "tracking", "padding", "outline", "divider"];

  // ---------- fonts ----------

  // Files live in fonts/. A font without a bold file has no bold option.
  const FONTS = [
    ["Sans serif", [
      ["Montserrat", "Montserrat-Regular.ttf", "Montserrat-Bold.ttf"],
      ["Open Sans", "OpenSans-Regular.ttf", "OpenSans-Bold.ttf"],
      ["Roboto", "Roboto-Regular.ttf", "Roboto-Bold.ttf"],
      ["Lato", "Lato-Regular.ttf", "Lato-Bold.ttf"],
      ["Poppins", "Poppins-Regular.ttf", "Poppins-Bold.ttf"],
      ["Raleway", "Raleway-Regular.ttf", "Raleway-Bold.ttf"],
      ["Josefin Sans", "JosefinSans-Regular.ttf", "JosefinSans-Bold.ttf"],
      ["League Spartan", "LeagueSpartan-Regular.ttf", "LeagueSpartan-Bold.ttf"],
      ["Nunito", "Nunito-Regular.ttf", "Nunito-Bold.ttf"],
      ["Quicksand", "Quicksand-Regular.ttf", "Quicksand-Bold.ttf"],
    ]],
    ["Serif", [
      ["Playfair Display", "PlayfairDisplay-Regular.ttf", "PlayfairDisplay-Bold.ttf"],
      ["Lora", "Lora-Regular.ttf", "Lora-Bold.ttf"],
      ["Merriweather", "Merriweather-Regular.ttf", "Merriweather-Bold.ttf"],
      ["Libre Baskerville", "LibreBaskerville-Regular.ttf", "LibreBaskerville-Bold.ttf"],
      ["Cormorant Garamond", "CormorantGaramond-Medium.ttf", "CormorantGaramond-Bold.ttf"],
      ["EB Garamond", "EBGaramond-Regular.ttf", "EBGaramond-Bold.ttf"],
      ["DM Serif Display", "DMSerifDisplay-Regular.ttf"],
      ["Cinzel", "Cinzel-Regular.ttf", "Cinzel-Bold.ttf"],
    ]],
    ["Display", [
      ["Bebas Neue", "BebasNeue-Regular.ttf"],
      ["Anton", "Anton-Regular.ttf"],
      ["Oswald", "Oswald-Regular.ttf", "Oswald-Bold.ttf"],
      ["Abril Fatface", "AbrilFatface-Regular.ttf"],
      ["Archivo Black", "ArchivoBlack-Regular.ttf"],
      ["Alfa Slab One", "AlfaSlabOne-Regular.ttf"],
      ["Righteous", "Righteous-Regular.ttf"],
    ]],
    ["Script", [
      ["Great Vibes", "GreatVibes-Regular.ttf"],
      ["Pinyon Script", "PinyonScript-Regular.ttf"],
      ["Parisienne", "Parisienne-Regular.ttf"],
      ["Allura", "Allura-Regular.ttf"],
      ["Alex Brush", "AlexBrush-Regular.ttf"],
      ["Dancing Script", "DancingScript-Medium.ttf", "DancingScript-Bold.ttf"],
      ["Sacramento", "Sacramento-Regular.ttf"],
      ["Satisfy", "Satisfy-Regular.ttf"],
      ["Pacifico", "Pacifico-Regular.ttf"],
      ["Lobster", "Lobster-Regular.ttf"],
      ["Kaushan Script", "KaushanScript-Regular.ttf"],
    ]],
    ["Handwritten", [
      ["Caveat", "Caveat-Regular.ttf", "Caveat-Bold.ttf"],
      ["Amatic SC", "AmaticSC-Regular.ttf", "AmaticSC-Bold.ttf"],
      ["Shadows Into Light", "ShadowsIntoLight-Regular.ttf"],
    ]],
    ["Monospace", [
      ["Courier Prime", "CourierPrime-Regular.ttf", "CourierPrime-Bold.ttf"],
      ["Space Mono", "SpaceMono-Regular.ttf", "SpaceMono-Bold.ttf"],
    ]],
  ];
  const FONT_BY_NAME = {};
  for (const [, list] of FONTS) for (const [name, normal, bold] of list) FONT_BY_NAME[name] = { normal, bold };
  const DEFAULT_FONT = "Playfair Display";

  const fontCache = {}; // file -> Promise<font>

  function loadFont(file) {
    if (!fontCache[file]) {
      fontCache[file] = fetch("fonts/" + file)
        .then((r) => {
          if (!r.ok) throw new Error(`Could not load font ${file}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          const font = opentype.parse(buf);
          font.gposKern = readGposKerning(buf);
          font.textBox = metricsOf(font);
          font.kernCache = new Map();
          return font;
        });
      fontCache[file].catch(() => delete fontCache[file]);
    }
    return fontCache[file];
  }

  // How far typical text rises above and falls below the baseline, in font units.
  function metricsOf(font) {
    let asc = 0, desc = 0;
    for (const g of font.stringToGlyphs("HdlbkfÀ")) {
      if (g.yMax != null) asc = Math.max(asc, g.yMax);
      else asc = Math.max(asc, g.getMetrics().yMax);
    }
    for (const g of font.stringToGlyphs("gpqyj")) {
      const yMin = g.yMin != null ? g.yMin : g.getMetrics().yMin;
      desc = Math.max(desc, -yMin);
    }
    // À reaches above most text; keep it from dominating.
    const cap = (font.tables.os2 && font.tables.os2.sCapHeight) || font.unitsPerEm * 0.7;
    asc = Math.min(asc, cap * 1.25);
    if (!asc) asc = cap;
    if (!desc) desc = font.unitsPerEm * 0.2;
    return { asc, desc };
  }

  // opentype.js 1.3 can't read most GPOS kerning (extension lookups), so read
  // pair-adjustment kerning straight from the font file.
  function readGposKerning(buf) {
    try {
      const v = new DataView(buf);
      const u16 = (o) => v.getUint16(o);
      const u32 = (o) => v.getUint32(o);
      const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
      let gpos = -1;
      const numTables = u16(4);
      for (let i = 0; i < numTables; i++) {
        const rec = 12 + i * 16;
        if (tag(rec) === "GPOS") gpos = u32(rec + 8);
      }
      if (gpos < 0) return null;
      const scriptList = gpos + u16(gpos + 4);
      const featureList = gpos + u16(gpos + 6);
      const lookupList = gpos + u16(gpos + 8);

      // Features for the Latin script (or the default), default language.
      let featureIdx = null;
      const scripts = {};
      for (let i = 0, n = u16(scriptList); i < n; i++) {
        const rec = scriptList + 2 + i * 6;
        scripts[tag(rec)] = scriptList + u16(rec + 4);
      }
      const script = scripts.latn || scripts.DFLT;
      if (script && u16(script)) {
        const ls = script + u16(script);
        featureIdx = [];
        for (let i = 0, n = u16(ls + 4); i < n; i++) featureIdx.push(u16(ls + 6 + i * 2));
      }
      const lookups = new Set();
      const nFeatures = u16(featureList);
      for (let i = 0; i < nFeatures; i++) {
        if (featureIdx && !featureIdx.includes(i)) continue;
        const rec = featureList + 2 + i * 6;
        if (tag(rec) !== "kern") continue;
        const feat = featureList + u16(rec + 4);
        for (let j = 0, n = u16(feat + 2); j < n; j++) lookups.add(u16(feat + 4 + j * 2));
      }
      if (!lookups.size) return null;

      const coverage = (o, g) => {
        if (u16(o) === 1) {
          let lo = 0, hi = u16(o + 2) - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1, x = u16(o + 4 + mid * 2);
            if (x === g) return mid;
            if (x < g) lo = mid + 1; else hi = mid - 1;
          }
        } else {
          for (let i = 0, n = u16(o + 2); i < n; i++) {
            const r = o + 4 + i * 6;
            if (g >= u16(r) && g <= u16(r + 2)) return u16(r + 4) + g - u16(r);
          }
        }
        return -1;
      };
      const classOf = (o, g) => {
        if (u16(o) === 1) {
          const start = u16(o + 2);
          return g >= start && g < start + u16(o + 4) ? u16(o + 6 + (g - start) * 2) : 0;
        }
        for (let i = 0, n = u16(o + 2); i < n; i++) {
          const r = o + 4 + i * 6;
          if (g >= u16(r) && g <= u16(r + 2)) return u16(r + 4);
        }
        return 0;
      };
      const bits = (f) => { let c = 0; for (; f; f >>= 1) c += f & 1; return c; };
      // XAdvance of a value record, or 0.
      const xAdvance = (o, fmt) => {
        if (!(fmt & 4)) return 0;
        return v.getInt16(o + 2 * bits(fmt & 3));
      };

      const subtables = [];
      for (const li of [...lookups].sort((a, b) => a - b)) {
        const lk = lookupList + u16(lookupList + 2 + li * 2);
        let type = u16(lk);
        const list = [];
        for (let s = 0, n = u16(lk + 4); s < n; s++) {
          let st = lk + u16(lk + 6 + s * 2);
          if (type === 9) {
            if (u16(st + 2) !== 2) continue;
            st = st + u32(st + 4);
          } else if (type !== 2) continue;
          list.push(st);
        }
        if (list.length) subtables.push(list);
      }

      return function (a, b) {
        let total = 0;
        for (const list of subtables) {
          for (const st of list) {
            const ci = coverage(st + u16(st + 2), a);
            if (ci < 0) continue;
            const vf1 = u16(st + 4), vf2 = u16(st + 6);
            const size = 2 * (bits(vf1) + bits(vf2));
            if (u16(st) === 1) {
              const ps = st + u16(st + 10 + ci * 2);
              let lo = 0, hi = u16(ps) - 1, found = false;
              while (lo <= hi) {
                const mid = (lo + hi) >> 1, r = ps + 2 + mid * (2 + size), g = u16(r);
                if (g === b) { total += xAdvance(r + 2, vf1); found = true; break; }
                if (g < b) lo = mid + 1; else hi = mid - 1;
              }
              if (!found) continue;
            } else {
              const c1 = classOf(st + u16(st + 8), a);
              const c2 = classOf(st + u16(st + 10), b);
              const n2 = u16(st + 14);
              total += xAdvance(st + 16 + (c1 * n2 + c2) * size, vf1);
            }
            break;
          }
        }
        return total;
      };
    } catch (e) {
      return null;
    }
  }

  function kerning(font, a, b) {
    const key = a.index * 65536 + b.index;
    let k = font.kernCache.get(key);
    if (k === undefined) {
      k = font.gposKern ? font.gposKern(a.index, b.index) : font.getKerningValue(a, b);
      font.kernCache.set(key, k);
    }
    return k;
  }

  // ---------- text layout ----------

  // Glyphs and their natural x offsets for one line, starting at 0.
  function shapeLine(font, text, size, tracking) {
    const scale = size / font.unitsPerEm;
    const glyphs = font.stringToGlyphs(text);
    const xs = [];
    let x = 0;
    for (let i = 0; i < glyphs.length; i++) {
      if (i > 0) x += kerning(font, glyphs[i - 1], glyphs[i]) * scale + tracking;
      xs.push(x);
      x += (glyphs[i].advanceWidth || 0) * scale;
    }
    return { glyphs, xs, width: x };
  }

  // The rows of one half of the circle, from the top down. Each has the left
  // edge and width of the space a line can use there, and its baseline.
  function slotsFor(side, g) {
    const { R, pad, r, asc, desc, lh } = g;
    const slots = [];
    for (let k = 0; ; k++) {
      const baseline = pad + asc + k * lh;
      if (baseline + desc > 2 * R - pad) break;
      const dy = Math.max(Math.abs(baseline - asc - R), Math.abs(baseline + desc - R));
      const reach = dy < r ? Math.sqrt(r * r - dy * dy) : 0;
      const width = Math.max(0, reach - pad);
      slots.push(side === "left"
        ? { x: R - pad - width, width, baseline, align: "right" }
        : { x: R + pad, width, baseline, align: "left" });
    }
    return slots;
  }

  // Splits `n` words into exactly `widths.length` lines so that every line is
  // filled to about the same fraction of its width. Returns the break
  // positions, or null if there is no way to do it.
  function balance(ww, sp, widths) {
    const n = ww.length, k = widths.length;
    const P = [0];
    for (const w of ww) P.push(P[P.length - 1] + w);
    const width = (a, b) => P[b] - P[a] + (b - a - 1) * sp;
    const cost = [new Float64Array(n + 1).fill(Infinity)];
    const from = [];
    cost[0][0] = 0;
    for (let j = 1; j <= k; j++) {
      cost[j] = new Float64Array(n + 1).fill(Infinity);
      from[j] = new Int32Array(n + 1);
      const W = widths[j - 1];
      for (let b = j; b <= n - (k - j); b++) {
        for (let a = b - 1; a >= j - 1; a--) {
          const w = width(a, b);
          if (w > W + 1e-6) break;
          if (cost[j - 1][a] === Infinity) continue;
          const slack = 1 - w / W;
          // A lone word can't be stretched to the edge, so avoid one where possible.
          const lone = b - a === 1 && n > 1 ? 1 : 0;
          const c = cost[j - 1][a] + slack * slack + lone;
          if (c < cost[j][b]) { cost[j][b] = c; from[j][b] = a; }
        }
      }
    }
    if (cost[k][n] === Infinity) return null;
    const ends = [];
    for (let j = k, b = n; j > 0; b = from[j][b], j--) ends.unshift(b);
    return ends;
  }

  // Wraps one text into the rows of one half. Lines only break between
  // words. Each paragraph takes as few lines as it can, and its words are then
  // spread so those lines are evenly full.
  function wrap(paras, slots, wordWidth, sp) {
    const lines = [];
    let si = 0, placed = 0;
    for (const words of paras) {
      if (!words.length) {
        if (si >= slots.length) break;
        lines.push({ slot: si++, text: "" });
        continue;
      }
      const ww = words.map(wordWidth);
      // Rows at the top may be too narrow for even the first word.
      while (si < slots.length && slots[si].width < ww[0]) si++;

      // Greedy fill gives the fewest lines this paragraph can use.
      const greedy = [];
      let wi = 0, s = si, gaps = false;
      while (wi < words.length && s < slots.length) {
        let cnt = 0, w = 0;
        while (wi + cnt < words.length) {
          const nw = cnt ? w + sp + ww[wi + cnt] : ww[wi];
          if (nw > slots[s].width + 1e-6) break;
          w = nw;
          cnt++;
        }
        if (!cnt) gaps = true; // a word too wide for this row: leave it empty
        greedy.push([s, wi, wi + cnt]);
        wi += cnt;
        s++;
      }

      let rows = greedy;
      if (wi === words.length && !gaps) {
        const ends = balance(ww, sp, greedy.map(([row]) => slots[row].width));
        if (ends) rows = greedy.map(([row], j) => [row, j ? ends[j - 1] : 0, ends[j]]);
      }
      for (const [row, a, b] of rows) lines.push({ slot: row, text: words.slice(a, b).join(" ") });
      placed += wi;
      si = s;
      if (wi < words.length) break;
    }
    return { lines, placed };
  }

  function layout(font, o, text, side) {
    const scale = o.size / font.unitsPerEm;
    const g = {
      R: o.R, pad: o.pad,
      r: o.R - o.pad,
      asc: font.textBox.asc * scale,
      desc: font.textBox.desc * scale,
      lh: o.size * o.lineHeight,
    };
    const tracking = o.trackingEm / 1000 * o.size;
    const paras = text.replace(/\s+$/, "").split(/\r?\n/).map((p) => p.split(/\s+/).filter(Boolean));
    const totalWords = paras.reduce((s, p) => s + p.length, 0);
    const widths = new Map();
    const wordWidth = (w) => {
      let x = widths.get(w);
      if (x === undefined) { x = shapeLine(font, w, o.size, tracking).width; widths.set(w, x); }
      return x;
    };
    const space = font.charToGlyphIndex(" ") ? font.charToGlyph(" ").advanceWidth * scale : o.size / 4;
    const slots = slotsFor(side, g);
    const res = wrap(paras, slots, wordWidth, space + 2 * tracking);
    return { ...res, slots, totalWords, tracking };
  }

  // SVG path data for the laid-out text.
  function renderPaths(font, lay, size, stretch) {
    const out = [];
    const spaceIdx = font.charToGlyphIndex(" ");
    for (const line of lay.lines) {
      if (!line.text) continue;
      const slot = lay.slots[line.slot];
      const { glyphs, xs, width } = shapeLine(font, line.text, size, lay.tracking);
      // Stretching widens the spaces between words. A line of one word is
      // left as it is, set against the center line, rather than letter-spaced.
      const spaces = glyphs.filter((gl, i) => gl.index === spaceIdx && i < glyphs.length - 1).length;
      let start, extraSpace = 0;
      if (stretch && spaces) {
        extraSpace = Math.max(0, slot.width - width) / spaces;
        start = slot.x;
      } else if (slot.align === "left") start = slot.x;
      else start = slot.x + slot.width - width;

      let shift = 0;
      let d = "";
      for (let i = 0; i < glyphs.length; i++) {
        if (i > 0 && glyphs[i - 1].index === spaceIdx) shift += extraSpace;
        if (glyphs[i].index === spaceIdx) continue;
        d += glyphs[i].getPath(start + xs[i] + shift, slot.baseline, size).toPathData(2);
      }
      if (d) out.push(d);
    }
    return out;
  }

  // ---------- form ----------

  function readOpts() {
    const num = (id, def, min, max) => {
      const v = parseFloat($(id).value);
      return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
    };
    const R = num("radius", 300, 20, 5000);
    return {
      left: $("leftText").value,
      right: $("rightText").value,
      fontName: FONT_BY_NAME[$("font").value] ? $("font").value : DEFAULT_FONT,
      bold: $("bold").checked,
      color: $("color").value || "#000000",
      size: num("fontSize", 28, 4, 1000),
      R,
      pad: Math.min(num("padding", 12, 0, 1000), R * 0.45),
      lineHeight: num("lineHeight", 1.2, 0.6, 4),
      trackingEm: num("tracking", 0, -200, 1000),
      stretch: document.querySelector('input[name="mode"]:checked').value === "stretch",
      outline: $("outline").checked,
      divider: $("divider").checked,
    };
  }

  function fontFileFor(o) {
    const f = FONT_BY_NAME[o.fontName];
    return o.bold && f.bold ? f.bold : f.normal;
  }

  const fmt = (n) => +n.toFixed(2);

  // The circle, inset by `e` so a stroke stays inside the frame.
  const circlePath = (R, e) => {
    const a = fmt(R - e);
    return `M${fmt(e)} ${fmt(R)}A${a} ${a} 0 1 1 ${fmt(2 * R - e)} ${fmt(R)}A${a} ${a} 0 1 1 ${fmt(e)} ${fmt(R)}Z`;
  };
  const dividerPath = (R) => `M${fmt(R)} 0V${fmt(2 * R)}`;

  function buildSvg(o, paths, preview) {
    const s = fmt(2 * o.R);
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">`];
    if (preview) {
      parts.push(`<path class="frame-fill" d="${circlePath(o.R, 0)}"/>`);
      if (!o.outline) parts.push(`<path class="frame-guide" d="${circlePath(o.R, 0.5)}"/>`);
      if (!o.divider) parts.push(`<path class="frame-guide" d="${dividerPath(o.R)}"/>`);
    }
    if (o.outline) parts.push(`<path d="${circlePath(o.R, 0.5)}" fill="none" stroke="${o.color}" stroke-width="1"/>`);
    if (o.divider) parts.push(`<path d="${dividerPath(o.R)}" fill="none" stroke="${o.color}" stroke-width="1"/>`);
    for (const d of paths) parts.push(`<path d="${d}" fill="${o.color}"/>`);
    parts.push("</svg>");
    return parts.join("\n");
  }

  let current = null; // { svg }
  let renderSeq = 0;

  async function render() {
    const seq = ++renderSeq;
    const o = readOpts();
    $("status").textContent = "Loading font…";
    let font;
    try {
      font = await loadFont(fontFileFor(o));
    } catch (e) {
      if (seq !== renderSeq) return;
      $("status").textContent = "";
      $("warn").textContent = e.message;
      return;
    }
    if (seq !== renderSeq) return;
    $("status").textContent = "";

    const paths = [];
    const warnings = [];
    for (const side of ["left", "right"]) {
      const lay = layout(font, o, o[side], side);
      paths.push(...renderPaths(font, lay, o.size, o.stretch));
      const missing = lay.totalWords - lay.placed;
      if (missing) warnings.push(`${missing} word${missing === 1 ? "" : "s"} on the ${side} didn't fit.`);
    }
    $("preview").innerHTML = buildSvg(o, paths, true);
    current = { svg: buildSvg(o, paths, false) };
    $("warn").textContent = warnings.length
      ? warnings.join(" ") + " Use a smaller font size or a larger radius, or press Fit to frame."
      : "";
    $("downloadBtn").disabled = !paths.length;
  }

  // Largest font size (to 0.5px) at which all the text on both sides fits.
  async function fitToFrame() {
    const o = readOpts();
    const font = await loadFont(fontFileFor(o));
    const fits = (size) => ["left", "right"].every((side) => {
      const lay = layout(font, { ...o, size }, o[side], side);
      return lay.placed === lay.totalWords;
    });
    let lo = 4, hi = Math.min(1000, o.R);
    if (!fits(lo)) { $("fontSize").value = lo; return; }
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid; else hi = mid;
    }
    $("fontSize").value = Math.floor(lo * 2) / 2;
  }

  function download() {
    if (!current) return;
    const blob = new Blob([current.svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "circle-text.svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function populateFonts() {
    const sel = $("font");
    for (const [group, list] of FONTS) {
      const og = document.createElement("optgroup");
      og.label = group;
      for (const [name] of list) {
        const opt = document.createElement("option");
        opt.value = opt.textContent = name;
        og.appendChild(opt);
      }
      sel.appendChild(og);
    }
    sel.value = DEFAULT_FONT;
  }

  function updateBold() {
    const f = FONT_BY_NAME[$("font").value];
    const has = !!(f && f.bold);
    $("bold").disabled = !has;
    $("bold").closest("label").classList.toggle("disabled", !has);
  }

  function saveForm() {
    try {
      const data = {};
      for (const f of fields) data[f] = $(f).type === "checkbox" ? $(f).checked : $(f).value;
      data.mode = document.querySelector('input[name="mode"]:checked').value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable */ }
  }

  function loadForm() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!data) return;
      for (const f of fields) {
        if (!(f in data)) continue;
        if ($(f).type === "checkbox") $(f).checked = !!data[f];
        else $(f).value = data[f];
      }
      if (!FONT_BY_NAME[$("font").value]) $("font").value = DEFAULT_FONT;
      const radio = document.querySelector(`input[name="mode"][value="${data.mode}"]`);
      if (radio) radio.checked = true;
    } catch (e) { /* ignore bad data */ }
  }

  let timer = null;
  function onChange() {
    updateBold();
    saveForm();
    clearTimeout(timer);
    timer = setTimeout(render, 60);
  }

  populateFonts();
  loadForm();
  updateBold();
  $("form").addEventListener("input", onChange);
  $("form").addEventListener("change", onChange);
  $("form").addEventListener("submit", (e) => { e.preventDefault(); download(); });
  $("fitBtn").addEventListener("click", async () => {
    $("fitBtn").disabled = true;
    try { await fitToFrame(); } finally { $("fitBtn").disabled = false; }
    onChange();
  });
  render();
})();
