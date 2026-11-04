// Draws canvas-style artwork straight into a jsPDF document as vector paths.
(function () {
  "use strict";

  // pdfCanvas offers the part of the canvas 2D API the artwork
  // uses and writes each fill, stroke and clip as PDF path operators, with
  // the origin at (ox, oy) on the page.
  function parseColor(c) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    if (m) return { rgb: [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)], a: 1 };
    const r = /^rgba?\(([^)]+)\)$/i.exec(c);
    if (r) {
      const v = r[1].split(",").map((x) => parseFloat(x));
      return { rgb: v.slice(0, 3), a: v.length > 3 ? v[3] : 1 };
    }
    return { rgb: [0, 0, 0], a: 1 };
  }

  function pdfCanvas(doc, ox, oy) {
    let M = [1, 0, 0, 1, ox, oy];          // x' = a·x + c·y + e, y' = b·x + d·y + f
    let st = { fill: "#000000", stroke: "#000000", lw: 1, cap: "butt", join: "miter", alpha: 1 };
    const stack = [];
    let path = [];                           // page-space ops: [op, ...coords]
    let cur = null, start = null;            // current and subpath start points
    const gstates = {};
    let alphaNow = 1;

    const T = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
    const mul = (b) => {
      const a = M;
      M = [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    };
    const moveP = (p) => { path.push(["m", ...p]); cur = p; start = p; };
    const lineP = (p) => { if (!cur) return moveP(p); path.push(["l", ...p]); cur = p; };
    const curveP = (c1, c2, p) => { if (!cur) moveP(c1); path.push(["c", ...c1, ...c2, ...p]); cur = p; };

    // An elliptical arc in user space, as cubic Béziers of at most 90°.
    function arcPath(cx, cy, rx, ry, rot, a0, a1, ccw) {
      let sweep = a1 - a0;
      if (!ccw && sweep < 0) sweep = sweep % (2 * Math.PI) + 2 * Math.PI;
      if (ccw && sweep > 0) sweep = sweep % (2 * Math.PI) - 2 * Math.PI;
      if (Math.abs(sweep) >= 2 * Math.PI - 1e-9) sweep = ccw ? -2 * Math.PI : 2 * Math.PI;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const E = (a) => {
        const x = rx * Math.cos(a), y = ry * Math.sin(a);
        return T(cx + x * cr - y * sr, cy + x * sr + y * cr);
      };
      const D = (a) => {
        const x = -rx * Math.sin(a), y = ry * Math.cos(a);
        return [x * cr - y * sr, x * sr + y * cr];
      };
      const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
      const step = sweep / n;
      const k = (4 / 3) * Math.tan(step / 4);
      const p0 = E(a0);
      if (cur) lineP(p0); else moveP(p0);
      for (let i = 0; i < n; i++) {
        const t0 = a0 + i * step, t1 = t0 + step;
        const d0 = D(t0), d1 = D(t1);
        const q0 = [cx + rx * Math.cos(t0) * cr - ry * Math.sin(t0) * sr, cy + rx * Math.cos(t0) * sr + ry * Math.sin(t0) * cr];
        const q1 = [cx + rx * Math.cos(t1) * cr - ry * Math.sin(t1) * sr, cy + rx * Math.cos(t1) * sr + ry * Math.sin(t1) * cr];
        curveP(T(q0[0] + k * d0[0], q0[1] + k * d0[1]), T(q1[0] - k * d1[0], q1[1] - k * d1[1]), E(t1));
      }
    }

    function emitPath() {
      for (const op of path) {
        if (op[0] === "m") doc.moveTo(op[1], op[2]);
        else if (op[0] === "l") doc.lineTo(op[1], op[2]);
        else if (op[0] === "c") doc.curveTo(op[1], op[2], op[3], op[4], op[5], op[6]);
        else doc.close();
      }
    }
    function setAlpha(a) {
      if (a === alphaNow) return;
      const key = a.toFixed(3);
      if (!gstates[key]) gstates[key] = new doc.GState({ opacity: a, "stroke-opacity": a });
      doc.setGState(gstates[key]);
      alphaNow = a;
    }

    const ctx = {
      save() {
        stack.push({ M: M.slice(), st: { ...st }, alphaNow });
        doc.saveGraphicsState();
      },
      restore() {
        const o = stack.pop();
        if (!o) return;
        M = o.M;
        st = o.st;
        doc.restoreGraphicsState();
        alphaNow = o.alphaNow;
      },
      translate(x, y) { mul([1, 0, 0, 1, x, y]); },
      rotate(a) { const c = Math.cos(a), s = Math.sin(a); mul([c, s, -s, c, 0, 0]); },
      scale(x, y) { mul([x, 0, 0, y, 0, 0]); },
      transform(a, b, c, d, e, f) { mul([a, b, c, d, e, f]); },
      beginPath() { path = []; cur = null; start = null; },
      closePath() { if (cur) { path.push(["h"]); cur = start; } },
      moveTo(x, y) { moveP(T(x, y)); },
      lineTo(x, y) { lineP(T(x, y)); },
      bezierCurveTo(x1, y1, x2, y2, x, y) { curveP(T(x1, y1), T(x2, y2), T(x, y)); },
      quadraticCurveTo(qx, qy, x, y) {
        const q = T(qx, qy), p = T(x, y);
        const c0 = cur || q;
        curveP([c0[0] + (2 / 3) * (q[0] - c0[0]), c0[1] + (2 / 3) * (q[1] - c0[1])],
          [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], p);
      },
      arc(cx, cy, r, a0, a1, ccw) { arcPath(cx, cy, r, r, 0, a0, a1, ccw); },
      ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) { arcPath(cx, cy, rx, ry, rot, a0, a1, ccw); },
      fill() {
        if (!path.length) return;
        const c = parseColor(st.fill);
        setAlpha(st.alpha * c.a);
        doc.setFillColor(...c.rgb);
        emitPath();
        doc.fill();
      },
      stroke() {
        if (!path.length) return;
        const c = parseColor(st.stroke);
        setAlpha(st.alpha * c.a);
        doc.setDrawColor(...c.rgb);
        doc.setLineWidth(st.lw * Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])));
        doc.setLineCap(st.cap);
        doc.setLineJoin(st.join);
        emitPath();
        doc.stroke();
      },
      clip() {
        emitPath();
        doc.clip();
        doc.discardPath();
      },
    };
    const prop = (name, key) => Object.defineProperty(ctx, name, { get: () => st[key], set: (v) => { st[key] = v; } });
    prop("fillStyle", "fill");
    prop("strokeStyle", "stroke");
    prop("lineWidth", "lw");
    prop("lineCap", "cap");
    prop("lineJoin", "join");
    prop("globalAlpha", "alpha");
    return ctx;
  }

  // Artwork is defined once per PDF and key as a reusable PDF object, then
  // placed at (x, y), w × h, upright or turned 180° (`flip`), so the file
  // stays small however many cards use it. `draw(ctx)` paints it.
  const forms = new WeakMap();
  function placeArt(doc, key, w, h, x, y, flip, draw) {
    if (!forms.has(doc)) forms.set(doc, new Set());
    const done = forms.get(doc);
    if (!done.has(key)) {
      doc.advancedAPI((d) => {
        d.beginFormObject(0, 0, w, h, d.unitMatrix);
        draw(pdfCanvas(d, 0, 0));
        d.endFormObject(key);
      });
      done.add(key);
    }
    doc.advancedAPI((d) => d.doFormObject(key, flip
      ? new d.Matrix(-1, 0, 0, -1, x + w, y + h)
      : new d.Matrix(1, 0, 0, 1, x, y)));
    doc.setLineCap("butt");
    doc.setLineJoin("miter");
  }

  // A black outline along a card's cut line, used when it prints without a border.
  function outlineCut(doc, x, y, w, h) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.75);
    doc.rect(x, y, w, h, "S");
  }

  window.PdfCanvas = { pdfCanvas, placeArt, outlineCut };
})();
