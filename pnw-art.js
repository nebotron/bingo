// Illustrated border of Pacific Northwest plants and animals: thimbleberry,
// sword ferns, mushrooms, a song sparrow and a cedar waxwing.
//
// PnwArt.drawBorder(ctx, W, H, layout) draws with a subset of the canvas 2D
// API (paths, arcs, ellipses, transforms, clip, solid colors, globalAlpha),
// so it works on a real canvas and on the PDF recorder in app.js, which turns
// it into vector paths. PnwArt.metrics(W, H) gives the padding the card
// content should keep, in the same units.
(function () {
  "use strict";

  const C = {
    leaf: "#6f9140", leafLight: "#93b25f", leafDark: "#4b6a27", vein: "#e6efcf", veinDark: "#3f5a20",
    cane: "#8b6a4b", caneDark: "#5e4430", caneLight: "#c9b298",
    sepal: "#71883f",
    fern: "#2c5a39", fernLight: "#3d7049", fernDark: "#1b3d27", stipe: "#6a5236",
    berry: "#c8323a", berryLight: "#f08a86", berryDark: "#86202a",
    petal: "#fffdf8", petalShade: "#d9d6cb", stamen: "#e2b43a", stamenDark: "#a98220", pistil: "#cfd07a",
    moss: "#7b9445", mossDark: "#5b7232",
    cedar: "#5f8a2e", cedarLight: "#7da43e", cedarDark: "#43661f", bark: "#6b4a33",
  };

  function rng(seed) {
    let x = seed % 2147483647 || 1;
    return () => (x = (x * 16807) % 2147483647) / 2147483647;
  }

  function quad(p0, c, p1) {
    const at = (t) => {
      const u = 1 - t;
      return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
    };
    const tan = (t) => {
      const u = 1 - t;
      const dx = 2 * u * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]);
      const dy = 2 * u * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]);
      return Math.atan2(dy, dx);
    };
    return { at, tan };
  }

  // `band` and `floor` are how far the artwork reaches in from the sides/top
  // and the bottom; `top`, `side` and `bottom` are the padding the card
  // content keeps; `corner` keeps the title clear of the birds.
  function metrics(W, H) {
    const s = Math.min(W, H) / 600;
    const band = 46 * s, floor = 64 * s;
    return { s, band, floor, top: band + 10 * s, side: band + 14 * s, bottom: floor + 8 * s, corner: 118 * s };
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  // ---------- thimbleberry (Rubus parviflorus) ----------

  // A leaf on its stalk, growing from (0, 0) toward -y. L is the blade length.
  // Five palmate lobes with pointed tips, a doubly toothed edge and a
  // heart-shaped base; the main veins fan out from the top of the stalk.
  function thimbleLeaf(ctx, L, seed, stalk = 0.45) {
    const r = rng(seed * 7 + 3);
    const deg = Math.PI / 180;
    const jy = -stalk * L;
    const J = [0, jy - 0.1 * L];
    const P = (a, rad) => [J[0] + Math.sin(a) * rad, J[1] - Math.cos(a) * rad];
    const jit = () => (r() - 0.5) * 0.07;
    const tips = [[-122, 0.5], [-62, 0.76], [0, 0.86], [62, 0.76], [122, 0.5]]
      .map(([a, l]) => [a * deg + jit(), l * L * (0.95 + r() * 0.1)]);
    const sinus = [[-180, 0.1], [-92, 0.36], [-31, 0.46], [31, 0.46], [92, 0.36], [180, 0.1]]
      .map(([a, l]) => [a * deg, l * L * (0.95 + r() * 0.1)]);
    const tooth = (u, n) => Math.pow((u * n) % 1, 1.6);

    const pts = [];
    for (let k = 0; k < 5; k++) {
      for (const [[a0, r0], [a1, r1], up] of [[sinus[k], tips[k], true], [tips[k], sinus[k + 1], false]]) {
        const N = 30;
        for (let i = 0; i < N; i++) {
          const t = i / N;
          const e = up ? 0.55 * t + 0.45 * (1 - (1 - t) * (1 - t)) : 1 - (0.55 * (1 - t) + 0.45 * (1 - t * t));
          const a = a0 + (a1 - a0) * t;
          let rad = r0 + (r1 - r0) * e;
          const dir = up ? t : 1 - t;
          const fade = Math.sin(Math.min(1, dir * 1.15) * Math.PI / 2);
          rad += L * fade * (0.03 * tooth(dir, 7) + 0.012 * tooth(dir, 21));
          pts.push(P(a, rad));
        }
      }
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = C.cane;
    ctx.lineWidth = L * 0.035;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(L * 0.03, jy * 0.5, 0, J[1] + 0.02 * L);
    ctx.stroke();

    poly(ctx, pts);
    ctx.fillStyle = C.leaf;
    ctx.fill();
    ctx.lineWidth = L * 0.012;
    ctx.strokeStyle = C.leafDark;
    ctx.stroke();

    ctx.save();
    poly(ctx, pts);
    ctx.clip();
    // soft light toward the middle of the blade
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = C.leafLight;
    ctx.beginPath();
    ctx.ellipse(J[0], J[1] - L * 0.22, L * 0.42, L * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    tips.forEach(([a, len], k) => {
      const end = P(a, len * 0.93);
      const bend = (k - 2) * 0.04 * L;
      const mid = [(J[0] + end[0]) / 2 + bend * Math.cos(a), (J[1] + end[1]) / 2 + bend * Math.sin(a)];
      ctx.strokeStyle = C.veinDark;
      ctx.lineWidth = L * 0.02;
      ctx.beginPath();
      ctx.moveTo(...J);
      ctx.quadraticCurveTo(...mid, ...end);
      ctx.stroke();
      ctx.strokeStyle = C.vein;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = L * 0.008;
      ctx.stroke();
      ctx.globalAlpha = 1;
      const q = quad(J, mid, end);
      ctx.strokeStyle = C.veinDark;
      ctx.lineWidth = L * 0.0075;
      for (let t = 0.24; t < 0.9; t += 0.17) {
        const [x, y] = q.at(t);
        const ta = q.tan(t);
        for (const sd of [-1, 1]) {
          const b = ta + sd * 0.75;
          const l = len * 0.24 * (1 - t * 0.6);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + Math.cos(b) * l * 0.5, y + Math.sin(b) * l * 0.5, x + Math.cos(b - sd * 0.25) * l, y + Math.sin(b - sd * 0.25) * l);
          ctx.stroke();
        }
      }
    });
    ctx.restore();
  }

  // An open flower facing the viewer, D across. Five crinkled, tissue-thin
  // petals; long-tailed sepals between them; a dense ring of yellow stamens.
  function thimbleFlower(ctx, D, seed) {
    const r = rng(seed * 13 + 5);
    const rot = r() * Math.PI * 2;
    ctx.fillStyle = C.sepal;
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate(rot + ((i + 0.5) / 5) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(-D * 0.07, -D * 0.08);
      ctx.quadraticCurveTo(-D * 0.05, -D * 0.4, 0, -D * 0.64);
      ctx.quadraticCurveTo(D * 0.05, -D * 0.4, D * 0.07, -D * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 5; i++) {
      const ph = r() * 10;
      ctx.save();
      ctx.rotate(rot + (i / 5) * Math.PI * 2 + (r() - 0.5) * 0.15);
      const pts = [];
      for (let k = 0; k <= 48; k++) {
        const th = (k / 48) * Math.PI * 2;
        let x = Math.sin(th) * D * 0.23, y = -D * 0.27 - Math.cos(th) * D * 0.24;
        if (y < -D * 0.06) {
          const crinkle = 1 + 0.045 * Math.sin(th * 9 + ph) + 0.025 * Math.sin(th * 17 + ph * 2);
          x *= crinkle;
          y = -D * 0.27 + (y + D * 0.27) * crinkle;
        }
        const narrow = Math.max(0, 1 - (-y) / (D * 0.22));
        x *= 1 - 0.55 * narrow;
        pts.push([x, y]);
      }
      poly(ctx, pts);
      ctx.fillStyle = C.petal;
      ctx.fill();
      ctx.strokeStyle = C.petalShade;
      ctx.lineWidth = D * 0.014;
      ctx.stroke();
      ctx.lineWidth = D * 0.007;
      for (const dx of [-0.11, -0.05, 0, 0.05, 0.11]) {
        ctx.beginPath();
        ctx.moveTo(dx * D * 0.3, -D * 0.12);
        ctx.quadraticCurveTo(dx * D * 0.8, -D * 0.3, dx * D * 1.35, -D * 0.46);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = C.stamenDark;
    ctx.lineWidth = D * 0.008;
    const tips = [];
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + r() * 0.1;
      const r0 = D * 0.07, r1 = D * (0.12 + r() * 0.04);
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      tips.push([Math.cos(a) * r1, Math.sin(a) * r1]);
    }
    ctx.stroke();
    ctx.fillStyle = C.stamen;
    ctx.beginPath();
    for (const [x, y] of tips) {
      ctx.moveTo(x + D * 0.016, y);
      ctx.arc(x, y, D * 0.016, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = C.pistil;
    ctx.beginPath();
    ctx.arc(0, 0, D * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  // A flower bud wrapped in tailed sepals, opening toward -y.
  function thimbleBud(ctx, D) {
    ctx.fillStyle = "#f2f0e2";
    ctx.beginPath();
    ctx.ellipse(0, -D * 0.35, D * 0.3, D * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.sepal;
    for (const a of [-0.5, 0, 0.5]) {
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-D * 0.14, 0);
      ctx.quadraticCurveTo(-D * 0.12, -D * 0.5, 0, -D * 0.95);
      ctx.quadraticCurveTo(D * 0.12, -D * 0.5, D * 0.14, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // A ripe berry hanging from its stalk at (0, 0), extending toward +y: a
  // broad, shallow red cap (hollow underneath, like a thimble) of small
  // drupelets.
  function thimbleBerry(ctx, Wd) {
    const h = Wd * 0.62;
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(-Wd / 2, 0);
      ctx.bezierCurveTo(-Wd / 2, h * 0.72, -Wd * 0.26, h, 0, h);
      ctx.bezierCurveTo(Wd * 0.26, h, Wd / 2, h * 0.72, Wd / 2, 0);
      ctx.quadraticCurveTo(0, -h * 0.12, -Wd / 2, 0);
      ctx.closePath();
    };
    ctx.save();
    outline();
    ctx.fillStyle = C.berryDark;
    ctx.fill();
    outline();
    ctx.clip();
    const dr = Wd * 0.075;
    const cells = [];
    for (let row = 0; row < 7; row++) {
      for (let col = -4; col <= 4; col++) cells.push([(col + (row % 2 ? 0.5 : 0)) * dr * 1.75, dr * 0.7 + row * dr * 1.5]);
    }
    ctx.fillStyle = C.berry;
    ctx.beginPath();
    for (const [x, y] of cells) { ctx.moveTo(x + dr, y); ctx.arc(x, y, dr, 0, Math.PI * 2); }
    ctx.fill();
    ctx.fillStyle = C.berryLight;
    ctx.beginPath();
    for (const [x, y] of cells) { ctx.moveTo(x - dr * 0.1, y - dr * 0.35); ctx.arc(x - dr * 0.35, y - dr * 0.35, dr * 0.25, 0, Math.PI * 2); }
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = C.sepal;
    for (const a of [-1.1, -0.5, 0.5, 1.1]) {
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-Wd * 0.05, 0);
      ctx.quadraticCurveTo(-Wd * 0.03, -Wd * 0.2, 0, -Wd * 0.34);
      ctx.quadraticCurveTo(Wd * 0.03, -Wd * 0.2, Wd * 0.05, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // A thornless cane along points [{x, y}], with a darker edge and a pale
  // highlight for its papery bark.
  function strokeCane(ctx, pts, w) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const path = () => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    };
    path();
    ctx.strokeStyle = C.caneDark;
    ctx.lineWidth = w * 1.3;
    ctx.stroke();
    path();
    ctx.strokeStyle = C.cane;
    ctx.lineWidth = w;
    ctx.stroke();
    path();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = C.caneLight;
    ctx.lineWidth = w * 0.28;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Flowers, buds or berries on long stalks fanning out from (x, y) toward
  // `ang`.
  function cluster(ctx, x, y, ang, s, items, seed) {
    const r = rng(seed);
    items.forEach((kind, i) => {
      const a = ang + (i - (items.length - 1) / 2) * 0.55 + (r() - 0.5) * 0.2;
      const len = (kind === "berry" ? 12 : 16) * s * (0.8 + r() * 0.4);
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      ctx.strokeStyle = C.sepal;
      ctx.lineWidth = 0.9 * s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a - 0.3) * len * 0.6, y + Math.sin(a - 0.3) * len * 0.6, ex, ey);
      ctx.stroke();
      ctx.save();
      ctx.translate(ex, ey);
      if (kind === "flower") thimbleFlower(ctx, 22 * s, seed + i);
      else if (kind === "bud") { ctx.rotate(a + Math.PI / 2); thimbleBud(ctx, 7 * s); }
      else thimbleBerry(ctx, 12 * s); // berries hang straight down
      ctx.restore();
    });
  }

  // ---------- sword fern (Polystichum munitum) ----------

  // One leaflet: x runs out from the stem, -y points toward the frond tip.
  // Lance-shaped and curving slightly toward the tip, with the "hilt" lobe on
  // the tip side of its base and fine bristle-tipped teeth.
  function pinna(ctx, pl, fill) {
    const w = pl * 0.17;
    const pts = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let y = -w * (0.75 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.8) - w * 0.25 * t;
      y -= w * 0.95 * Math.exp(-((t - 0.1) ** 2) / 0.003);
      y += w * 0.55 * t * t;
      if (t > 0.18 && t < 0.97) y -= w * 0.14 * (i % 2);
      pts.push([t * pl, y]);
    }
    for (let i = N; i >= 0; i--) {
      const t = i / N;
      let y = w * 0.62 * Math.sin(Math.PI * Math.min(1, t * 1.02)) ** 0.9 - w * 0.25 * t;
      y += w * 0.55 * t * t;
      if (t > 0.1 && t < 0.97) y += w * 0.12 * (i % 2);
      pts.push([t * pl, y]);
    }
    poly(ctx, pts);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = C.fernDark;
    ctx.lineWidth = w * 0.09;
    ctx.stroke();
    ctx.lineWidth = w * 0.1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(pl * 0.5, -w * 0.05, pl * 0.97, w * 0.3);
    ctx.stroke();
  }

  // A frond from p0 along a curve to p1; L is its length.
  function swordFrond(ctx, p0, c, p1, L, s, seed) {
    const q = quad(p0, c, p1);
    const r = rng(seed);
    ctx.lineCap = "round";
    ctx.strokeStyle = C.stipe;
    ctx.lineWidth = Math.max(0.8 * s, L * 0.012);
    ctx.beginPath();
    ctx.moveTo(...p0);
    ctx.lineTo(...q.at(0.12));
    ctx.stroke();
    ctx.strokeStyle = C.fernDark;
    ctx.lineWidth = Math.max(0.6 * s, L * 0.009);
    ctx.beginPath();
    ctx.moveTo(...q.at(0.12));
    for (let t = 0.14; t <= 1.001; t += 0.02) ctx.lineTo(...q.at(t));
    ctx.stroke();
    const maxPl = Math.min(L * 0.13, 21 * s);
    // Close-set, alternating leaflets that nearly touch along each side.
    const count = Math.floor((L * 0.86) / (maxPl * 0.15));
    for (let i = 0; i < count; i++) {
      const t = 0.12 + (i / count) * 0.87;
      const [x, y] = q.at(t);
      const a = q.tan(t);
      const tip = t > 0.62 ? 1 - ((t - 0.62) / 0.38) ** 1.2 * 0.9 : 1;
      const base = t < 0.22 ? 0.78 + (t - 0.12) * 2.2 : 1;
      const pl = maxPl * tip * base * (0.96 + r() * 0.08);
      const side = i % 2 ? 1 : -1;
      const T = [Math.cos(a), Math.sin(a)];
      const out = a + side * (1.38 - t * 0.45);
      const Pv = [Math.cos(out), Math.sin(out)];
      const dot = T[0] * Pv[0] + T[1] * Pv[1];
      let yv = [-(T[0] - dot * Pv[0]), -(T[1] - dot * Pv[1])];
      const yl = Math.hypot(...yv) || 1;
      yv = [yv[0] / yl, yv[1] / yl];
      ctx.save();
      ctx.transform(Pv[0], Pv[1], yv[0], yv[1], x, y);
      pinna(ctx, pl, (i >> 1) % 2 ? C.fernLight : C.fern);
      ctx.restore();
    }
  }

  // A clump of fronds rising from a crown at (x, y). Each frond is
  // [angle from vertical toward the inside (degrees), length, arch].
  function fernClump(ctx, x, y, s, dir, fronds) {
    fronds.forEach(([deg, len, arch], i) => {
      const a = ((-90 + dir * deg) * Math.PI) / 180;
      const L = len * s;
      const p1 = [x + Math.cos(a) * L, y + Math.sin(a) * L];
      const nx = -Math.sin(a) * dir, ny = Math.cos(a) * dir;
      const c = [x + Math.cos(a) * L * 0.5 - nx * arch * s, y + Math.sin(a) * L * 0.5 - ny * arch * s];
      swordFrond(ctx, [x, y], c, [p1[0] + nx * arch * s * 0.6, p1[1] + ny * arch * s * 0.6], L, s, 40 + i * 7);
    });
  }

  // ---------- mushrooms ----------

  // Fly agaric (Amanita muscaria): red cap with white warts, a skirt on the
  // stem and a swollen base ringed with scaly bands.
  function amanita(ctx, x, y, h, lean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean || 0);
    const w = h * 0.9;
    ctx.lineJoin = "round";
    ctx.fillStyle = "#f4efe3";
    ctx.strokeStyle = "#b9ae98";
    ctx.lineWidth = h * 0.02;
    ctx.beginPath();
    ctx.moveTo(-h * 0.08, -h * 0.72);
    ctx.quadraticCurveTo(-h * 0.09, -h * 0.35, -h * 0.15, -h * 0.16);
    ctx.bezierCurveTo(-h * 0.22, -h * 0.07, -h * 0.17, 0, 0, 0);
    ctx.bezierCurveTo(h * 0.17, 0, h * 0.22, -h * 0.07, h * 0.15, -h * 0.16);
    ctx.quadraticCurveTo(h * 0.09, -h * 0.35, h * 0.08, -h * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#cfc4ad";
    for (const yy of [-0.06, -0.11, -0.16]) {
      ctx.beginPath();
      ctx.moveTo(-h * 0.17, h * yy);
      ctx.quadraticCurveTo(0, h * (yy + 0.03), h * 0.17, h * yy);
      ctx.stroke();
    }
    ctx.fillStyle = "#f8f4ea";
    ctx.strokeStyle = "#b9ae98";
    ctx.beginPath();
    ctx.moveTo(-h * 0.1, -h * 0.58);
    ctx.quadraticCurveTo(0, -h * 0.5, h * 0.1, -h * 0.58);
    ctx.lineTo(h * 0.13, -h * 0.47);
    ctx.quadraticCurveTo(0, -h * 0.4, -h * 0.13, -h * 0.47);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const cap = () => {
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h * 0.72);
      ctx.bezierCurveTo(-w / 2, -h * 1.12, w / 2, -h * 1.12, w / 2, -h * 0.72);
      ctx.quadraticCurveTo(0, -h * 0.64, -w / 2, -h * 0.72);
      ctx.closePath();
    };
    cap();
    ctx.fillStyle = "#c22e1f";
    ctx.fill();
    ctx.strokeStyle = "#7d1a16";
    ctx.stroke();
    ctx.save();
    cap();
    ctx.clip();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#ec6a45";
    ctx.beginPath();
    ctx.ellipse(-w * 0.12, -h * 0.95, w * 0.28, h * 0.12, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.fillStyle = "#fbf7ec";
    const warts = [[-0.3, -0.82], [-0.1, -0.94], [0.12, -0.92], [0.3, -0.83], [0.0, -0.8], [-0.2, -0.76], [0.22, -0.76], [-0.38, -0.75], [0.38, -0.76], [-0.18, -0.88], [0.04, -0.86], [0.2, -0.88]];
    ctx.beginPath();
    for (const [wx, wy] of warts) {
      ctx.moveTo(wx * w + h * 0.03, wy * h);
      ctx.ellipse(wx * w, wy * h, h * 0.03, h * 0.022, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  // Pacific golden chanterelle (Cantharellus formosus): a wavy, funnel-shaped
  // cap with blunt, forking ridges running down the stem.
  function chanterelle(ctx, x, y, h, lean, seed) {
    const r = rng(seed || 9);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean || 0);
    const w = h * 0.85;
    const wav = [0.06, -0.04, 0.05, -0.03, 0.04].map((v) => v * (0.7 + r() * 0.6));
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-h * 0.08, 0);
    ctx.quadraticCurveTo(-h * 0.1, -h * 0.45, -w / 2, -h * 0.8);
    ctx.bezierCurveTo(-w * 0.35, -h * (0.92 + wav[0]), -w * 0.18, -h * (0.88 + wav[1]), 0, -h * (0.93 + wav[2]));
    ctx.bezierCurveTo(w * 0.18, -h * (0.98 + wav[3]), w * 0.35, -h * (0.9 + wav[4]), w / 2, -h * 0.82);
    ctx.quadraticCurveTo(h * 0.1, -h * 0.45, h * 0.08, 0);
    ctx.closePath();
    ctx.fillStyle = "#e29b30";
    ctx.fill();
    ctx.strokeStyle = "#9a5f17";
    ctx.lineWidth = h * 0.022;
    ctx.stroke();
    ctx.fillStyle = "#f1b447";
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.87, w * 0.44, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b8741f";
    ctx.lineWidth = h * 0.012;
    ctx.beginPath();
    for (let i = -4; i <= 4; i++) {
      const x0 = i * w * 0.1;
      ctx.moveTo(x0, -h * 0.8);
      ctx.quadraticCurveTo(x0 * 0.45, -h * 0.55, i * h * 0.012, -h * 0.25);
      if (i % 2 === 0) {
        ctx.moveTo(x0 * 0.62, -h * 0.62);
        ctx.lineTo(x0 * 0.62 + w * 0.05, -h * 0.79);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // Bonnet mushrooms (Mycena): small bell-shaped grey-brown caps with fine
  // radial lines, on long thin stems.
  function mycena(ctx, x, y, h, lean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean || 0);
    ctx.strokeStyle = "#cdbfa8";
    ctx.lineWidth = h * 0.05;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(h * 0.06, -h * 0.45, 0, -h * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-h * 0.2, -h * 0.76);
    ctx.bezierCurveTo(-h * 0.2, -h * 1.0, -h * 0.08, -h * 1.12, 0, -h * 1.12);
    ctx.bezierCurveTo(h * 0.08, -h * 1.12, h * 0.2, -h * 1.0, h * 0.2, -h * 0.76);
    ctx.quadraticCurveTo(0, -h * 0.8, -h * 0.2, -h * 0.76);
    ctx.closePath();
    ctx.fillStyle = "#9c8268";
    ctx.fill();
    ctx.strokeStyle = "#5a4433";
    ctx.lineWidth = h * 0.02;
    ctx.stroke();
    ctx.fillStyle = "#6e5440";
    ctx.beginPath();
    ctx.ellipse(0, -h * 1.06, h * 0.07, h * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6e5440";
    ctx.lineWidth = h * 0.012;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      ctx.moveTo(i * h * 0.012, -h * 1.06);
      ctx.lineTo(i * h * 0.055, -h * 0.78);
    }
    ctx.stroke();
    ctx.restore();
  }

  function mossMound(ctx, x, y, w, h, seed) {
    const r = rng(seed);
    ctx.fillStyle = C.mossDark;
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.moss;
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const a = Math.PI + r() * Math.PI, rr = Math.sqrt(r());
      const cx = x + Math.cos(a) * w / 2 * rr, cy = y + Math.sin(a) * h * rr, rad = h * 0.12 * (0.5 + r());
      ctx.moveTo(cx + rad, cy);
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // ---------- western redcedar ----------

  // A flat spray of scale-like leaves: a braided green axis with alternate
  // side branchlets, curving as it goes.
  function cedarSpray(ctx, x, y, ang, len, s, depth, curl, seed) {
    const steps = Math.max(4, Math.round(len / (2.6 * s)));
    let px = x, py = y, a = ang;
    const w = (1.9 + depth * 1.0) * s;
    const light = [], dark = [];
    const subs = [];
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      a += curl / steps;
      const nx = px + Math.cos(a) * len / steps, ny = py + Math.sin(a) * len / steps;
      for (const sd of [-1, 1]) {
        ((i + (sd > 0 ? 1 : 0)) % 2 ? dark : light).push([(px + nx) / 2 - Math.sin(a) * sd * w * 0.35, (py + ny) / 2 + Math.cos(a) * sd * w * 0.35,
          w * 0.85 * (1 - t * 0.5), w * 0.42 * (1 - t * 0.4), a + sd * 0.35]);
      }
      if (depth > 0 && i % 3 === 1 && t < 0.8) {
        const sd = (i / 3) % 2 ? 1 : -1;
        subs.push([nx, ny, a + sd * 0.75, len * 0.42 * (1 - t * 0.6), -sd * 0.3 + curl * 0.3, seed + i * 31]);
      }
      px = nx;
      py = ny;
    }
    for (const [list, col] of [[light, C.cedarLight], [dark, C.cedar]]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (const [ex, ey, rx, ry, rot] of list) {
        ctx.moveTo(ex + Math.cos(rot) * rx, ey + Math.sin(rot) * rx);
        ctx.ellipse(ex, ey, rx, ry, rot, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    for (const sub of subs) cedarSpray(ctx, sub[0], sub[1], sub[2], sub[3], s, depth - 1, sub[4], sub[5]);
  }

  // ---------- birds ----------
  // Both are drawn facing right, standing at (0, 0) on their perch; one unit
  // is s, and a bird is about 70 units from beak to tail.

  function streaks(ctx, list, len, ang, w) {
    ctx.beginPath();
    for (const [x, y] of list) {
      const c = Math.cos(ang), sn = Math.sin(ang);
      const P = (u, v) => [x + u * c - v * sn, y + u * sn + v * c];
      ctx.moveTo(...P(0, -len / 2));
      ctx.quadraticCurveTo(...P(w, 0), ...P(0, len / 2));
      ctx.quadraticCurveTo(...P(-w, 0), ...P(0, -len / 2));
    }
    ctx.fill();
  }

  // Song sparrow, Pacific Northwest form: dark, rusty brown with heavy,
  // blurry streaks, a central breast spot, grey brow and a long rounded tail.
  function songSparrow(ctx) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.fillStyle = "#5e3b25";
    ctx.strokeStyle = "#3d2616";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-10, -20);
    ctx.quadraticCurveTo(-24, -9, -36, 3);
    ctx.quadraticCurveTo(-36, 8.5, -30, 7.5);
    ctx.quadraticCurveTo(-20, -2, -2, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#7e5638";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(-10 - i * 2, -16 + i);
      ctx.lineTo(-33 + i * 2, 4 + i);
    }
    ctx.stroke();
    ctx.strokeStyle = "#c29a80";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (const lx of [-2, 4]) {
      ctx.moveTo(lx, -14);
      ctx.lineTo(lx + 1, -1);
      ctx.moveTo(lx + 1, 0);
      ctx.lineTo(lx + 5, 0.5);
      ctx.moveTo(lx + 1, 0);
      ctx.lineTo(lx - 3, 0.5);
    }
    ctx.stroke();
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(18, -40);
      ctx.bezierCurveTo(26, -32, 20, -16, 8, -13);
      ctx.bezierCurveTo(-2, -11, -12, -14, -16, -21);
      ctx.bezierCurveTo(-18, -30, -6, -40, 6, -44);
      ctx.closePath();
    };
    body();
    ctx.fillStyle = "#77492c";
    ctx.fill();
    ctx.strokeStyle = "#3d2616";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.save();
    body();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(24, -38);
    ctx.bezierCurveTo(26, -24, 16, -12, 0, -11);
    ctx.bezierCurveTo(-6, -11, -10, -14, -10, -16);
    ctx.bezierCurveTo(0, -18, 10, -26, 14, -40);
    ctx.closePath();
    ctx.fillStyle = "#e9dfcc";
    ctx.fill();
    ctx.fillStyle = "#5a3319";
    streaks(ctx, [[16, -32], [19, -28], [12, -27], [15, -23], [8, -22], [11, -18], [4, -17], [18, -24], [6, -14], [-2, -15], [20, -34], [13, -31]], 5, 0.35, 1.3);
    ctx.beginPath();
    ctx.ellipse(17, -28, 3, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(10, -38);
    ctx.bezierCurveTo(2, -36, -14, -28, -22, -16);
    ctx.bezierCurveTo(-12, -16, 0, -20, 8, -26);
    ctx.closePath();
    ctx.fillStyle = "#8a4b26";
    ctx.fill();
    ctx.strokeStyle = "#3d2616";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = "#33200f";
    streaks(ctx, [0, 1, 2, 3].map((i) => [2 - i * 5.5, -31 + i * 3.6]), 6, 1.0, 1.2);
    ctx.strokeStyle = "#cdb595";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(4 - i * 5.5, -28 + i * 3.6);
      ctx.lineTo(-2 - i * 5.5, -25 + i * 3.6);
    }
    ctx.stroke();
    const head = () => {
      ctx.beginPath();
      ctx.arc(16, -44, 9, 0, Math.PI * 2);
      ctx.closePath();
    };
    head();
    ctx.fillStyle = "#7d736a";
    ctx.fill();
    ctx.save();
    head();
    ctx.clip();
    ctx.fillStyle = "#6b3f22";
    ctx.beginPath();
    ctx.ellipse(13, -52, 10, 5.5, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#958d84";
    ctx.beginPath();
    ctx.ellipse(14, -53, 7, 1.4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#aaa298";
    ctx.beginPath();
    ctx.ellipse(15, -47.5, 7.5, 1.8, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5e3a20";
    ctx.beginPath();
    ctx.ellipse(11, -44, 5.5, 1.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e9dfcc";
    ctx.beginPath();
    ctx.ellipse(21, -38, 5, 3.5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3e2512";
    streaks(ctx, [[17.5, -38.5]], 6, 1.0, 1.4);
    ctx.restore();
    head();
    ctx.strokeStyle = "#3d2616";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.fillStyle = "#1c140d";
    ctx.beginPath();
    ctx.arc(18.5, -45, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(19, -45.6, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(23.5, -46.5);
    ctx.quadraticCurveTo(28, -44.5, 30, -43);
    ctx.quadraticCurveTo(27, -41.5, 23.5, -41.5);
    ctx.closePath();
    ctx.fillStyle = "#857262";
    ctx.fill();
    ctx.strokeStyle = "#4e3a2a";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(23.5, -43.5);
    ctx.lineTo(29.5, -43.1);
    ctx.stroke();
  }

  // Cedar waxwing: silky brown with a swept-back crest, a black mask edged
  // above and below in white, red waxy wing tips and a yellow-tipped tail.
  function cedarWaxwing(ctx, withBerry = true) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-8, -20);
    ctx.lineTo(-29, -2);
    ctx.lineTo(-24, 3.5);
    ctx.lineTo(-2, -14);
    ctx.closePath();
    ctx.fillStyle = "#5f6168";
    ctx.fill();
    ctx.strokeStyle = "#3b3c41";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-25.8, -4.6);
    ctx.lineTo(-29, -2);
    ctx.lineTo(-24, 3.5);
    ctx.lineTo(-21, 0.6);
    ctx.closePath();
    ctx.fillStyle = "#f3c937";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f2efe6";
    ctx.beginPath();
    ctx.moveTo(-4, -14);
    ctx.quadraticCurveTo(-10, -9, -16, -6);
    ctx.quadraticCurveTo(-8, -10, -2, -12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#2c2a2a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const lx of [0, 5]) {
      ctx.moveTo(lx, -13);
      ctx.lineTo(lx + 1, -1);
      ctx.moveTo(lx + 1, 0);
      ctx.lineTo(lx + 5, 0.5);
      ctx.moveTo(lx + 1, 0);
      ctx.lineTo(lx - 3, 0.5);
    }
    ctx.stroke();
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(20, -44);
      ctx.bezierCurveTo(27, -34, 22, -16, 9, -12);
      ctx.bezierCurveTo(0, -10, -10, -13, -14, -20);
      ctx.bezierCurveTo(-14, -30, 0, -42, 10, -48);
      ctx.closePath();
    };
    body();
    ctx.fillStyle = "#b08b62";
    ctx.fill();
    ctx.save();
    body();
    ctx.clip();
    // warm brown breast fading to a pale yellow belly
    ctx.fillStyle = "#cdb27f";
    ctx.beginPath();
    ctx.ellipse(10, -16, 16, 13, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e9d98b";
    ctx.beginPath();
    ctx.ellipse(6, -11, 14, 8, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    body();
    ctx.strokeStyle = "#5c4630";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, -44);
    ctx.bezierCurveTo(4, -40, -12, -30, -22, -16);
    ctx.bezierCurveTo(-10, -15, 2, -20, 10, -28);
    ctx.bezierCurveTo(12, -34, 13, -40, 12, -44);
    ctx.closePath();
    ctx.fillStyle = "#7a7471";
    ctx.fill();
    ctx.strokeStyle = "#45403c";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = "#3d3d42";
    ctx.beginPath();
    ctx.moveTo(-2, -24);
    ctx.bezierCurveTo(-10, -20, -16, -17, -22, -16);
    ctx.bezierCurveTo(-14, -17, -6, -19, 0, -21);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d0352b";
    ctx.beginPath();
    for (const [x, y] of [[-4, -25.5], [-8, -23.5], [-12, -21.5]]) {
      ctx.moveTo(x + 1.6, y);
      ctx.ellipse(x, y, 1.6, 0.9, -0.5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, -46);
    ctx.bezierCurveTo(26, -53, 20, -57, 12, -57);
    ctx.lineTo(-2, -60);
    ctx.bezierCurveTo(4, -55, 7, -50, 8, -45);
    ctx.bezierCurveTo(12, -40, 22, -38, 26, -46);
    ctx.closePath();
    ctx.fillStyle = "#a9835a";
    ctx.fill();
    ctx.strokeStyle = "#5c4630";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.fillStyle = "#fbfaf6";
    ctx.beginPath();
    ctx.moveTo(29, -50);
    ctx.quadraticCurveTo(18, -52.5, 7, -49.5);
    ctx.lineTo(7.5, -48.5);
    ctx.quadraticCurveTo(18, -50.8, 29, -48.4);
    ctx.closePath();
    ctx.moveTo(27.5, -44.6);
    ctx.quadraticCurveTo(21, -43.4, 13, -45);
    ctx.lineTo(12.5, -44);
    ctx.quadraticCurveTo(21, -42.2, 27.5, -43.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#151313";
    ctx.beginPath();
    ctx.moveTo(29, -48.6);
    ctx.quadraticCurveTo(18, -51, 8, -48.4);
    ctx.quadraticCurveTo(12, -45.2, 17, -45);
    ctx.quadraticCurveTo(23, -45, 28.5, -45.4);
    ctx.closePath();
    ctx.moveTo(26, -44);
    ctx.quadraticCurveTo(25, -40.5, 22.5, -40);
    ctx.quadraticCurveTo(22.3, -42, 23, -43.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3a2c22";
    ctx.beginPath();
    ctx.arc(20, -47.4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(20.5, -48, 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(28, -48.8);
    ctx.lineTo(33.5, -46.6);
    ctx.lineTo(28, -45);
    ctx.closePath();
    ctx.fillStyle = "#1d1b1b";
    ctx.fill();
    if (withBerry) {
      ctx.save();
      ctx.translate(34, -47.5);
      thimbleBerry(ctx, 6.5);
      ctx.restore();
    }
  }

  // ---------- shared pieces of the layouts ----------

  // A path in from the bottom of one side, round the top corner and part way
  // along the top. dir = 1 for the left side, -1 for the right. Each point
  // carries its tangent and the inward normal.
  function edgePath(W, H, m, dir, from, to, wobbleSeed) {
    const { s } = m;
    const inset = m.band * 0.48;
    const rad = 70 * s;
    const pts = [];
    const step = 3 * s;
    for (let y = from; y > inset + rad; y -= step) pts.push([inset, y]);
    for (let a = Math.PI; a < Math.PI * 1.5; a += step / rad) pts.push([inset + rad + Math.cos(a) * rad, inset + rad + Math.sin(a) * rad]);
    for (let x = inset + rad; x < to; x += step) pts.push([x, inset]);
    const out = [];
    let d = 0;
    const ph = (wobbleSeed || 0) * 1.7;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      if (i) d += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const tx = q[0] - o[0], ty = q[1] - o[1], tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const w = Math.sin(d / (36 * s) + ph) * 4 * s + Math.sin(d / (13 * s) + ph) * 1 * s;
      const x = p[0] + nx * w, y = p[1] + ny * w;
      out.push({ x: dir > 0 ? x : W - x, y, nx: dir * nx, ny, tx: (dir * tx) / tl, ty: ty / tl, d });
    }
    return out;
  }

  // Points along a quadratic curve, with tangents and distances. `inward`
  // gives the inward normal's x sign (+1 on the left edge, -1 on the right).
  function curvePath(p0, c, p1, inward, step) {
    const q = quad(p0, c, p1);
    const out = [];
    let d = 0;
    for (let t = 0; t <= 1.0001; t += step || 0.01) {
      const [x, y] = q.at(t);
      const a = q.tan(t);
      if (out.length) d += Math.hypot(x - out[out.length - 1].x, y - out[out.length - 1].y);
      let nx = -Math.sin(a), ny = Math.cos(a);
      if (nx * inward < 0 || (nx === 0 && ny < 0)) { nx = -nx; ny = -ny; }
      out.push({ x, y, tx: Math.cos(a), ty: Math.sin(a), nx, ny, d });
    }
    return out;
  }

  function pointAt(path, d) {
    const total = path[path.length - 1].d;
    return path[Math.min(path.length - 1, Math.max(0, Math.round((d / total) * (path.length - 1))))];
  }

  // Leaves on long stalks, alternating sides, along a cane. They lean forward
  // along the cane and out to either side. Returns the nodes.
  function leavesAlong(ctx, path, s, opts) {
    const r = rng(opts.seed || 1);
    const total = path[path.length - 1].d;
    const nodes = [];
    let side = 1, n = 0;
    for (let d = opts.start || 18 * s; d < total - (opts.end || 12 * s); d += (opts.gap || 44) * s * (0.85 + r() * 0.3), n++) {
      const p = pointAt(path, d);
      side = -side;
      nodes.push({ p, side, n });
      if (opts.skip && opts.skip(p)) continue;
      // Turn the stalk forward along the cane and toward the chosen side.
      const fwd = Math.atan2(p.ty, p.tx);
      const inA = Math.atan2(p.ny, p.nx);
      let diff = (side < 0 ? inA : inA + Math.PI) - fwd;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const a = fwd + diff * 0.55;
      const size = (side < 0 ? 30 : 25) * s * (opts.scale || 1) * (0.85 + r() * 0.3);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a + Math.PI / 2);
      thimbleLeaf(ctx, size, (opts.seed || 1) * 100 + n, 0.42);
      ctx.restore();
    }
    return nodes;
  }

  function groundLayer(ctx, W, H, m) {
    const { s } = m;
    const base = H - 6 * s;
    mossMound(ctx, 72 * s, base + 2 * s, 150 * s, 10 * s, 5);
    mossMound(ctx, W - 72 * s, base + 2 * s, 150 * s, 10 * s, 6);
    mossMound(ctx, W / 2, base + 2 * s, 110 * s, 7 * s, 7);
    const clump = [[2, 168, 4], [9, 128, 6], [20, 96, 6], [40, 70, 6], [60, 88, 8], [80, 155, 5], [71, 115, 7]];
    fernClump(ctx, 22 * s, base, s, 1, clump);
    fernClump(ctx, W - 22 * s, base, s, -1, clump);
    fernClump(ctx, W / 2 - 16 * s, base, s, -1, [[80, 112, 5], [66, 82, 7]]);
    fernClump(ctx, W / 2 + 16 * s, base, s, 1, [[80, 112, 5], [66, 82, 7]]);
    amanita(ctx, 94 * s, base, 44 * s, 0.05);
    amanita(ctx, 122 * s, base + 1 * s, 26 * s, -0.12);
    mycena(ctx, 70 * s, base, 14 * s, -0.15);
    chanterelle(ctx, W - 98 * s, base, 34 * s, -0.05, 3);
    chanterelle(ctx, W - 122 * s, base + 1 * s, 24 * s, 0.15, 4);
    chanterelle(ctx, W - 76 * s, base, 21 * s, 0.1, 5);
    mycena(ctx, W / 2 - 8 * s, base, 20 * s, -0.08);
    mycena(ctx, W / 2 + 4 * s, base + 1 * s, 15 * s, 0.1);
    mycena(ctx, W / 2 + 14 * s, base + 1 * s, 11 * s, 0.22);
  }

  // A short perch reaching in from the side below a top corner, with a bird
  // standing on it. kind "cedar" makes it a redcedar twig.
  function perchedBird(ctx, W, m, dir, bird, kind) {
    const { s } = m;
    const px = (v) => (dir > 0 ? v : W - v);
    const inset = m.band * 0.48;
    const p0 = [px(inset), 134 * s], c = [px(inset + 14 * s), 82 * s], p1 = [px(126 * s), 77 * s];
    const path = curvePath(p0, c, p1, dir, 0.02);
    if (kind === "cedar") {
      ctx.strokeStyle = C.bark;
      ctx.lineCap = "round";
      ctx.lineWidth = 2.6 * s;
      ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      cedarSpray(ctx, p1[0], p1[1], dir > 0 ? 0.35 : Math.PI - 0.35, 34 * s, s, 2, dir * 0.5, 77 + dir);
      for (const t of [0.3, 0.55]) {
        const p = path[Math.round(t * (path.length - 1))];
        cedarSpray(ctx, p.x, p.y, Math.PI / 2 + dir * 0.4, 26 * s, s, 1, -dir * 0.5, 88 + Math.round(t * 100));
      }
    } else {
      strokeCane(ctx, path, 2 * s);
      ctx.save();
      ctx.translate(...p1);
      ctx.rotate(dir > 0 ? 1.75 : -1.75);
      thimbleLeaf(ctx, 22 * s, dir > 0 ? 901 : 902, 0.4);
      ctx.restore();
    }
    let best = path[0];
    for (const p of path) if (Math.abs(p.x - px(78 * s)) < Math.abs(best.x - px(78 * s))) best = p;
    ctx.save();
    ctx.translate(best.x, best.y - 1.2 * s);
    ctx.scale(dir * s * 1.05, s * 1.05);
    bird(ctx);
    ctx.restore();
  }

  const nearBirds = (W, s) => (p) => p.y < 125 * s && (p.x < 150 * s || p.x > W - 150 * s);

  // ---------- layouts ----------

  // A: a thimbleberry vine running up both sides and across the top.
  function layoutVine(ctx, W, H, m) {
    const { s } = m;
    for (const dir of [1, -1]) {
      const path = edgePath(W, H, m, dir, H - 150 * s, W / 2 + 6 * s, dir > 0 ? 1 : 2);
      strokeCane(ctx, path, 2.2 * s);
      const nodes = leavesAlong(ctx, path, s, { seed: dir > 0 ? 3 : 4, gap: 42, skip: nearBirds(W, s) });
      nodes.forEach(({ p, n }) => {
        if (nearBirds(W, s)(p)) return;
        const inA = Math.atan2(p.ny, p.nx);
        if (n % 4 === 1) cluster(ctx, p.x, p.y, inA, s, ["flower", "bud", "flower"], 500 + n * dir);
        else if (n % 4 === 3) cluster(ctx, p.x, p.y, inA + 0.3 * dir, s, ["berry", "berry"], 600 + n * dir);
      });
    }
    groundLayer(ctx, W, H, m);
    perchedBird(ctx, W, m, 1, songSparrow);
    perchedBird(ctx, W, m, -1, cedarWaxwing);
  }

  // B: thimbleberry as it grows: canes rising from shrubs in the bottom
  // corners, arching up the sides and over the top, ending in flower
  // clusters, with ripe berries along the way and a young shoot beside them.
  function layoutCanes(ctx, W, H, m) {
    const { s } = m;
    for (const dir of [1, -1]) {
      const path = edgePath(W, H, m, dir, H - 40 * s, W / 2 - 22 * s, dir > 0 ? 5 : 6);
      strokeCane(ctx, path, 2.6 * s);
      const nodes = leavesAlong(ctx, path, s, { seed: dir > 0 ? 7 : 8, gap: 50, start: 130 * s, end: 30 * s, scale: 1.08, skip: nearBirds(W, s) });
      nodes.forEach(({ p, n }) => {
        if (nearBirds(W, s)(p)) return;
        if (n % 3 === 2) cluster(ctx, p.x, p.y, Math.atan2(p.ny, p.nx), s, ["berry", "berry", "berry"], 700 + n * dir);
      });
      const tip = path[path.length - 1];
      cluster(ctx, tip.x, tip.y, Math.atan2(tip.ty, tip.tx) + 0.7 * dir, s, ["bud", "flower", "flower", "bud"], 800 + dir);
      const x0 = dir > 0 ? 34 * s : W - 34 * s;
      const young = curvePath([x0, H - 30 * s], [x0 + dir * 4 * s, H - 150 * s], [x0 - dir * 6 * s, H - 230 * s], dir);
      strokeCane(ctx, young, 1.8 * s);
      const yt = young[young.length - 1];
      ctx.save();
      ctx.translate(yt.x, yt.y);
      ctx.rotate(-dir * 0.2);
      thimbleLeaf(ctx, 30 * s, 950 + dir, 0.35);
      ctx.restore();
    }
    groundLayer(ctx, W, H, m);
    perchedBird(ctx, W, m, 1, songSparrow);
    perchedBird(ctx, W, m, -1, cedarWaxwing);
  }

  // C: a western redcedar bough across the top for the birds (the cedar
  // waxwing's namesake), thimbleberry canes rising up the sides.
  function layoutCedar(ctx, W, H, m) {
    const { s } = m;
    const inset = m.band * 0.42;
    const bough = quad([-4 * s, inset + 6 * s], [W / 2, inset + 2 * s], [W + 4 * s, inset + 6 * s]);
    const r = rng(21);
    for (let t = 0.02; t < 0.99; t += 0.032) {
      const [x, y] = bough.at(t);
      const down = Math.PI / 2 + (t < 0.5 ? -0.75 : 0.75) + (r() - 0.5) * 0.4;
      const len = (t < 0.18 || t > 0.82 ? 52 : 36) * s * (0.8 + r() * 0.3);
      cedarSpray(ctx, x, y, down, len, s, 2, (t < 0.5 ? 1 : -1) * -0.6, 300 + Math.round(t * 1000));
    }
    ctx.strokeStyle = C.bark;
    ctx.lineCap = "round";
    ctx.lineWidth = 3.2 * s;
    ctx.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const [x, y] = bough.at(t);
      t ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    for (let t = 0.04; t < 0.99; t += 0.09) {
      const [x, y] = bough.at(t);
      cedarSpray(ctx, x, y, -Math.PI / 2 + (t < 0.5 ? -1.0 : 1.0), 14 * s, s, 1, 0.3, 900 + Math.round(t * 1000));
    }
    for (const dir of [1, -1]) {
      const x0 = dir > 0 ? m.band * 0.48 : W - m.band * 0.48;
      const path = curvePath([x0, H - 40 * s], [x0 + dir * 8 * s, H * 0.55], [x0 - dir * 2 * s, H * 0.3], dir, 0.005);
      strokeCane(ctx, path, 2.4 * s);
      const nodes = leavesAlong(ctx, path, s, { seed: dir > 0 ? 11 : 12, gap: 46, start: 120 * s, scale: 1.05 });
      nodes.forEach(({ p, n }) => {
        if (n % 3 === 1) cluster(ctx, p.x, p.y, dir > 0 ? 0.2 : Math.PI - 0.2, s, ["berry", "berry"], 1000 + n * dir);
      });
      const tip = path[path.length - 1];
      cluster(ctx, tip.x, tip.y, dir > 0 ? -0.9 : Math.PI + 0.9, s, ["bud", "flower", "flower"], 1100 + dir);
    }
    groundLayer(ctx, W, H, m);
    perchedBird(ctx, W, m, 1, songSparrow, "cedar");
    perchedBird(ctx, W, m, -1, cedarWaxwing, "cedar");
  }

  // D: four corner pieces, leaving the middle of each side open.
  function layoutCorners(ctx, W, H, m) {
    const { s } = m;
    for (const dir of [1, -1]) {
      const X = (x) => (dir > 0 ? x : W - x);
      const across = curvePath([X(12 * s), 30 * s], [X(70 * s), 4 * s], [X(196 * s), 30 * s], dir);
      across.forEach((p) => { p.nx = 0; p.ny = 1; });
      const down = curvePath([X(14 * s), 26 * s], [X(30 * s), 120 * s], [X(16 * s), 240 * s], dir);
      strokeCane(ctx, across, 2.2 * s);
      strokeCane(ctx, down, 2.2 * s);
      leavesAlong(ctx, across, s, { seed: dir > 0 ? 13 : 14, gap: 30, start: 20 * s, skip: (p) => p.y > 40 * s && nearBirds(W, s)(p) });
      leavesAlong(ctx, down, s, { seed: dir > 0 ? 15 : 16, gap: 32, start: 30 * s, skip: nearBirds(W, s) });
      const ta = across[across.length - 1];
      cluster(ctx, ta.x, ta.y, dir > 0 ? 0.6 : Math.PI - 0.6, s, dir > 0 ? ["bud", "flower", "flower"] : ["berry", "flower", "berry"], 1200 + dir);
      const td = down[down.length - 1];
      cluster(ctx, td.x, td.y, dir > 0 ? 1.0 : Math.PI - 1.0, s, ["berry", "berry", "berry"], 1300 + dir);
    }
    groundLayer(ctx, W, H, m);
    perchedBird(ctx, W, m, 1, songSparrow);
    perchedBird(ctx, W, m, -1, cedarWaxwing);
  }

  const LAYOUTS = { vine: layoutVine, canes: layoutCanes, cedar: layoutCedar, corners: layoutCorners };

  // ---------- floral frame (used by the name cards) ----------

  // The thimbleberry vine alone, running all the way round, with more
  // flowers. Its band is the same width on every side.
  function floralMetrics(W, H) {
    const m = metrics(W, H);
    const pad = m.band + 8 * m.s;
    return { ...m, floor: m.band, top: pad, bottom: pad, side: pad, corner: m.band };
  }

  function drawFloralFrame(ctx, W, H) {
    const m = floralMetrics(W, H);
    const { s } = m;
    const inset = m.band * 0.48, rad = 40 * s, step = 3 * s;
    const raw = [];
    for (let y = H / 2; y > inset + rad; y -= step) raw.push([inset, y]);
    const arc = (cx, cy, a0) => { for (let a = a0; a < a0 + Math.PI / 2; a += step / rad) raw.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); };
    arc(inset + rad, inset + rad, Math.PI);
    for (let x = inset + rad; x < W - inset - rad; x += step) raw.push([x, inset]);
    arc(W - inset - rad, inset + rad, Math.PI * 1.5);
    for (let y = inset + rad; y < H - inset - rad; y += step) raw.push([W - inset, y]);
    arc(W - inset - rad, H - inset - rad, 0);
    for (let x = W - inset - rad; x > inset + rad; x -= step) raw.push([x, H - inset]);
    arc(inset + rad, H - inset - rad, Math.PI / 2);
    for (let y = H - inset - rad; y > H / 2; y -= step) raw.push([inset, y]);
    const path = [];
    let d = 0;
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i], q = raw[Math.min(i + 1, raw.length - 1)], o = raw[Math.max(i - 1, 0)];
      if (i) d += Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]);
      const tx = q[0] - o[0], ty = q[1] - o[1], tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const w = Math.sin(d / (36 * s)) * 3 * s;
      path.push({ x: p[0] + nx * w, y: p[1] + ny * w, nx, ny, tx: tx / tl, ty: ty / tl, d });
    }
    ctx.save();
    strokeCane(ctx, path, 2.2 * s);
    const nodes = leavesAlong(ctx, path, s, { seed: 31, gap: 40, start: 10 * s, end: 10 * s });
    nodes.forEach(({ p, n }) => {
      const inA = Math.atan2(p.ny, p.nx);
      if (n % 2 === 1) cluster(ctx, p.x, p.y, inA, s, n % 4 === 1 ? ["flower", "bud"] : ["flower"], 2000 + n);
      else if (n % 8 === 4) cluster(ctx, p.x, p.y, inA + 0.3, s, ["berry", "berry"], 2100 + n);
    });
    ctx.restore();
  }

  function drawBorder(ctx, W, H, layout) {
    const m = metrics(W, H);
    ctx.save();
    (LAYOUTS[layout || window.PnwArt.layout] || layoutVine)(ctx, W, H, m);
    ctx.restore();
  }

  window.PnwArt = {
    drawBorder, metrics, drawFloralFrame, floralMetrics, layout: "vine",
    parts: { thimbleLeaf, thimbleFlower, thimbleBud, thimbleBerry, swordFrond, amanita, chanterelle, mycena, songSparrow, cedarWaxwing, cedarSpray },
  };
})();
