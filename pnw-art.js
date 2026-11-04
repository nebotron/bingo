// Illustrated border of Pacific Northwest plants and animals: a thimbleberry
// vine along the top and sides, sword ferns and mushrooms along the bottom, a
// song sparrow and a cedar waxwing perched in the top corners.
//
// PnwArt.drawBorder(ctx, W, H) paints onto a canvas of W × H pixels, leaving
// the middle clear. PnwArt.metrics(W, H) gives the space the border takes, in
// the same units, so the card content can be laid out inside it.
(function () {
  "use strict";

  const C = {
    leaf: "#6f8d3f", leafLight: "#86a352", leafDark: "#4c6727", vein: "#3d5420",
    stem: "#6d5236",
    fern: "#2f5c3d", fernLight: "#3f7350", fernDark: "#1f402b",
    berry: "#c4353d", berryLight: "#e0565b", berryDark: "#8c1f28",
    petal: "#fdfcf7", petalShade: "#dcd8cb", center: "#e2c35b",
    moss: "#7b9445", mossDark: "#5b7232",
  };

  // Deterministic random numbers, so every card gets the same border.
  function rng(seed) {
    let x = seed;
    return () => (x = (x * 16807) % 2147483647) / 2147483647;
  }

  // `band` and `floor` are how far the artwork reaches in from the sides/top
  // and the bottom; `top`, `side` and `bottom` are the padding the card
  // content keeps; `corner` keeps the title clear of the birds.
  function metrics(W, H) {
    const s = Math.min(W, H) / 600;
    const band = 46 * s, floor = 64 * s;
    return { s, band, floor, top: band + 10 * s, side: band + 14 * s, bottom: floor + 8 * s, corner: 118 * s };
  }

  // ---------- thimbleberry ----------

  // A broad, maple-like leaf with five shallow lobes and a toothed edge,
  // growing from (0, 0) toward -y, `size` long.
  function thimbleLeaf(ctx, size, seed) {
    const r = rng(seed);
    const R = size * 0.5;
    const cy = -size * 0.5;
    const lobes = [0, 0.95, -0.95, 1.95, -1.95];
    const amp = [1, 0.92, 0.92, 0.7, 0.7].map((a) => a * (0.92 + r() * 0.12));
    const pts = [];
    for (let i = 0; i <= 240; i++) {
      const phi = -Math.PI + (i / 240) * Math.PI * 2;
      let k = 0;
      lobes.forEach((l, j) => { k = Math.max(k, amp[j] * Math.exp(-((phi - l) ** 2) / (2 * 0.34 ** 2))); });
      let rad = R * (0.6 + 0.42 * k);
      rad *= 1 + 0.035 * Math.sin(phi * 38);                       // teeth
      rad *= 1 - 0.55 * Math.exp(-((Math.abs(phi) - Math.PI) ** 2) / 0.05); // notch at the stalk
      pts.push([Math.sin(phi) * rad, cy - Math.cos(phi) * rad]);
    }
    const g = ctx.createLinearGradient(-R, cy - R, R, cy + R);
    g.addColorStop(0, C.leafLight);
    g.addColorStop(1, C.leaf);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = size * 0.018;
    ctx.strokeStyle = C.leafDark;
    ctx.stroke();
    // Veins fan out from the base to each lobe.
    ctx.strokeStyle = C.vein;
    ctx.lineCap = "round";
    lobes.forEach((l, j) => {
      const len = R * (0.6 + 0.42 * amp[j]) * 0.82;
      const ex = Math.sin(l) * len, ey = cy - Math.cos(l) * len;
      ctx.lineWidth = size * (j ? 0.016 : 0.022);
      ctx.beginPath();
      ctx.moveTo(0, cy + R * 0.22);
      ctx.quadraticCurveTo(ex * 0.4, cy + R * 0.1 - Math.cos(l) * len * 0.5, ex, ey);
      ctx.stroke();
      // a few side veins
      ctx.lineWidth = size * 0.009;
      for (let t = 0.35; t < 0.9; t += 0.22) {
        const px = ex * t, py = cy + R * 0.22 + (ey - cy - R * 0.22) * t;
        for (const side of [-1, 1]) {
          const a = l + side * 0.7;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.sin(a) * R * 0.18, py - Math.cos(a) * R * 0.18);
          ctx.stroke();
        }
      }
    });
    // stalk
    ctx.lineWidth = size * 0.035;
    ctx.strokeStyle = C.stem;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, cy + R * 0.3);
    ctx.stroke();
  }

  // A white, five-petalled flower with crinkled petals and a yellow centre.
  function thimbleFlower(ctx, size, seed) {
    const r = rng(seed);
    const rot = r() * Math.PI;
    for (let i = 0; i < 5; i++) {
      const a = rot + (i / 5) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-size * 0.42, -size * 0.18, -size * 0.38, -size * 0.62, 0, -size * 0.56);
      ctx.bezierCurveTo(size * 0.38, -size * 0.62, size * 0.42, -size * 0.18, 0, 0);
      ctx.fillStyle = C.petal;
      ctx.fill();
      ctx.lineWidth = size * 0.025;
      ctx.strokeStyle = C.petalShade;
      ctx.stroke();
      ctx.lineWidth = size * 0.012;
      for (const dx of [-0.12, 0, 0.12]) {
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.12);
        ctx.lineTo(dx * size, -size * 0.45);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = C.center;
    ctx.fill();
    ctx.fillStyle = "#b8972f";
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * size * 0.1, Math.sin(a) * size * 0.1, size * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // A ripe berry: a soft red cap of tiny drupelets.
  function thimbleBerry(ctx, size) {
    const R = size / 2;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, R, R * 0.82, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.berryDark;
    ctx.fill();
    ctx.clip();
    for (let row = -4; row <= 4; row++) {
      for (let col = -4; col <= 4; col++) {
        const x = (col + (row % 2 ? 0.5 : 0)) * R * 0.26, y = row * R * 0.22;
        if (x * x / (R * R) + y * y / (R * R * 0.67) > 1.05) continue;
        const g = ctx.createRadialGradient(x - R * 0.04, y - R * 0.05, 0, x, y, R * 0.16);
        g.addColorStop(0, C.berryLight);
        g.addColorStop(1, C.berry);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, R * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // the green-brown calyx where it meets the stalk
    ctx.fillStyle = C.leafDark;
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(0, -R * 0.75);
      ctx.rotate(-0.9 + i * 0.45);
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.18, R * 0.08, R * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- vine path ----------

  // Points along the vine: up the left side, across the top, down the right.
  function vinePath(W, H, m) {
    const { s, band } = m;
    const inset = band * 0.5;
    const rad = 70 * s;
    const yEnd = H - 150 * s;
    const pts = [];
    const push = (x, y) => pts.push([x, y]);
    const step = 1.5 * s;
    for (let y = yEnd; y > inset + rad; y -= step) push(inset, y);
    for (let a = Math.PI; a < Math.PI * 1.5; a += step / rad) push(inset + rad + Math.cos(a) * rad, inset + rad + Math.sin(a) * rad);
    for (let x = inset + rad; x < W - inset - rad; x += step) push(x, inset);
    for (let a = Math.PI * 1.5; a < Math.PI * 2; a += step / rad) push(W - inset - rad + Math.cos(a) * rad, inset + rad + Math.sin(a) * rad);
    for (let y = inset + rad; y < yEnd; y += step) push(W - inset, y);
    // Wobble the stem gently along its normal.
    const out = [];
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      if (i) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const tx = q[0] - o[0], ty = q[1] - o[1], tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl; // points inward, toward the middle of the card
      const w = Math.sin(dist / (34 * s)) * 4.5 * s + Math.sin(dist / (13 * s)) * 1.2 * s;
      out.push({ x: p[0] + nx * w, y: p[1] + ny * w, nx, ny, tx: tx / tl, ty: ty / tl, d: dist });
    }
    return out;
  }

  function drawVine(ctx, W, H, m) {
    const { s } = m;
    const path = vinePath(W, H, m);
    const total = path[path.length - 1].d;
    const at = (d) => path[Math.min(path.length - 1, Math.max(0, Math.round((d / total) * (path.length - 1))))];
    const r = rng(11);

    // Thin tendrils of stem first, then the main stem over them.
    ctx.lineCap = "round";
    ctx.strokeStyle = C.stem;
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 0.7 * s;
    ctx.stroke();

    // Leaves, flowers and berries at nodes along the stem. The top corners
    // are left to the birds.
    const birdZones = [[0, 0, 150 * s, 120 * s], [W - 150 * s, 0, W, 120 * s]];
    const inBird = (x, y) => birdZones.some(([a, b, c, d]) => x > a && x < c && y > b && y < d);
    let side = 1, n = 0;
    for (let d = 20 * s; d < total - 10 * s; d += (38 + r() * 14) * s, n++) {
      const p = at(d);
      side = -side;
      const outward = side > 0;
      const ang = Math.atan2(p.ty, p.tx);
      // Leaves lean forward along the vine and out to one side.
      const lean = ang + (outward ? -Math.PI / 2 : Math.PI / 2) * 0.4 + Math.PI / 2;
      const size = (outward ? 24 : 27) * s * (0.85 + r() * 0.3);
      const birdHere = inBird(p.x, p.y);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (n % 5 === 2 && !birdHere) {
        ctx.rotate(lean);
        thimbleLeaf(ctx, size * 0.85, 100 + n);
        ctx.restore();
        // a flower on a short stalk, on the inner side
        const fx = p.x + p.nx * 15 * s, fy = p.y + p.ny * 15 * s;
        ctx.strokeStyle = C.stem;
        ctx.lineWidth = 1.2 * s;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + p.nx * 6 * s + p.tx * 6 * s, p.y + p.ny * 6 * s + p.ty * 6 * s, fx, fy);
        ctx.stroke();
        ctx.save();
        ctx.translate(fx, fy);
        thimbleFlower(ctx, 19 * s, 300 + n);
        ctx.restore();
        continue;
      }
      if (n % 5 === 4 && !birdHere) {
        ctx.rotate(lean);
        thimbleLeaf(ctx, size * 0.8, 100 + n);
        ctx.restore();
        // a pair of hanging berries
        for (const k of [0, 1]) {
          const bx = p.x + p.nx * (10 + k * 5) * s + p.tx * (k ? 9 : -2) * s;
          const by = p.y + p.ny * (10 + k * 5) * s + p.ty * (k ? 9 : -2) * s;
          ctx.strokeStyle = C.stem;
          ctx.lineWidth = 1 * s;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(Math.atan2(p.ny, p.nx) - Math.PI / 2);
          thimbleBerry(ctx, (k ? 9 : 11) * s);
          ctx.restore();
        }
        continue;
      }
      ctx.rotate(lean);
      thimbleLeaf(ctx, birdHere ? size * 0.8 : size, 100 + n);
      ctx.restore();
    }
  }

  // ---------- sword fern ----------

  // A frond along a quadratic curve from (0,0): leaflets alternate, each with
  // a small upward "hilt" lobe at its base, shrinking toward both ends.
  function swordFrond(ctx, p0, c, p1, len, seed) {
    const r = rng(seed);
    const at = (t) => {
      const u = 1 - t;
      return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
    };
    const tan = (t) => {
      const a = at(Math.max(0, t - 0.01)), b = at(Math.min(1, t + 0.01));
      return Math.atan2(b[1] - a[1], b[0] - a[0]);
    };
    // stalk
    ctx.strokeStyle = C.fernDark;
    ctx.lineCap = "round";
    ctx.lineWidth = len * 0.012;
    ctx.beginPath();
    ctx.moveTo(...p0);
    ctx.quadraticCurveTo(...c, ...p1);
    ctx.stroke();
    const count = Math.round(len / 6.5);
    for (let i = 0; i < count; i++) {
      const t = 0.12 + (i / count) * 0.86;
      const [x, y] = at(t);
      const a = tan(t);
      const prof = Math.sin(Math.min(1, (t - 0.08) / 0.92) * Math.PI) ** 0.6;
      const pl = Math.min(len * 0.14, 20) * (0.25 + 0.75 * prof) * (1 - t * 0.35);
      for (const side of [-1, 1]) {
        const off = side === 1 ? 0 : len * 0.012;
        ctx.save();
        ctx.translate(x + Math.cos(a) * off, y + Math.sin(a) * off);
        ctx.rotate(a + side * (1.05 - t * 0.3));
        const w = pl * 0.2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        // the hilt lobe on the side toward the frond tip
        ctx.quadraticCurveTo(w * 0.4, -side * w * 1.6, w * 1.4, -side * w * 0.9);
        ctx.quadraticCurveTo(pl * 0.55, -side * w * 0.9, pl, -side * w * 0.1);
        ctx.quadraticCurveTo(pl * 0.5, side * w * 0.75, 0, side * w * 0.3);
        ctx.closePath();
        ctx.fillStyle = (i + (side > 0 ? 0 : 1)) % 3 ? C.fern : C.fernLight;
        ctx.fill();
        ctx.strokeStyle = C.fernDark;
        ctx.lineWidth = w * 0.12;
        ctx.beginPath();
        ctx.moveTo(w * 0.3, 0);
        ctx.lineTo(pl * 0.85, -side * w * 0.08);
        ctx.stroke();
        ctx.restore();
      }
    }
    void r;
  }

  // A clump of fronds rising from (x, y). dir = 1 leans right, -1 leans left.
  function fernClump(ctx, x, y, s, dir, fronds) {
    fronds.forEach(([deg, len, bend], i) => {
      const a = ((-90 + dir * deg) * Math.PI) / 180;
      const L = len * s;
      const p1 = [x + Math.cos(a) * L, y + Math.sin(a) * L];
      // Fronds arch outward and droop at the tip.
      const c = [x + Math.cos(a) * L * 0.55 - dir * bend * s * 0.3, y + Math.sin(a) * L * 0.55 - bend * s];
      swordFrond(ctx, [x, y], c, [p1[0] + dir * bend * s * 0.4, p1[1] + bend * s * 0.5], L, 40 + i);
    });
  }

  // ---------- mushrooms ----------

  function amanita(ctx, x, y, h, lean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean || 0);
    const w = h * 0.9;
    // stem with a skirt and a swollen base
    ctx.fillStyle = "#f4efe3";
    ctx.strokeStyle = "#b9ae98";
    ctx.lineWidth = h * 0.02;
    ctx.beginPath();
    ctx.moveTo(-h * 0.09, -h * 0.72);
    ctx.quadraticCurveTo(-h * 0.1, -h * 0.3, -h * 0.17, -h * 0.08);
    ctx.quadraticCurveTo(-h * 0.2, 0, 0, 0);
    ctx.quadraticCurveTo(h * 0.2, 0, h * 0.17, -h * 0.08);
    ctx.quadraticCurveTo(h * 0.1, -h * 0.3, h * 0.09, -h * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-h * 0.11, -h * 0.55);
    ctx.quadraticCurveTo(0, -h * 0.45, h * 0.11, -h * 0.55);
    ctx.quadraticCurveTo(h * 0.13, -h * 0.5, h * 0.12, -h * 0.48);
    ctx.quadraticCurveTo(0, -h * 0.4, -h * 0.12, -h * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // cap
    const g = ctx.createRadialGradient(-w * 0.15, -h * 0.95, h * 0.05, 0, -h * 0.75, w * 0.6);
    g.addColorStop(0, "#e2513f");
    g.addColorStop(1, "#a8261f");
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h * 0.7);
    ctx.bezierCurveTo(-w / 2, -h * 1.12, w / 2, -h * 1.12, w / 2, -h * 0.7);
    ctx.quadraticCurveTo(0, -h * 0.62, -w / 2, -h * 0.7);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#7d1a16";
    ctx.stroke();
    // white warts
    ctx.fillStyle = "#fbf7ec";
    const warts = [[-0.3, -0.8], [-0.1, -0.92], [0.12, -0.9], [0.3, -0.8], [0.0, -0.78], [-0.2, -0.72], [0.22, -0.72], [-0.38, -0.73], [0.38, -0.74]];
    for (const [wx, wy] of warts) {
      ctx.beginPath();
      ctx.ellipse(wx * w, wy * h, h * 0.035, h * 0.028, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function chanterelle(ctx, x, y, h, lean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean || 0);
    const w = h * 0.8;
    const g = ctx.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, "#f0b544");
    g.addColorStop(1, "#d08a26");
    ctx.beginPath();
    ctx.moveTo(-h * 0.08, 0);
    ctx.quadraticCurveTo(-h * 0.1, -h * 0.45, -w / 2, -h * 0.82);
    // wavy rim
    ctx.bezierCurveTo(-w * 0.3, -h * 1.02, -w * 0.1, -h * 0.9, 0, -h * 0.96);
    ctx.bezierCurveTo(w * 0.12, -h * 1.04, w * 0.35, -h * 0.95, w / 2, -h * 0.84);
    ctx.quadraticCurveTo(h * 0.1, -h * 0.45, h * 0.08, 0);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#9a5f17";
    ctx.lineWidth = h * 0.025;
    ctx.stroke();
    // false gills running down the stem
    ctx.lineWidth = h * 0.012;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w * 0.12, -h * 0.86);
      ctx.quadraticCurveTo(i * w * 0.05, -h * 0.6, i * h * 0.015, -h * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function brownCap(ctx, x, y, h, lean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean || 0);
    ctx.strokeStyle = "#c9b89a";
    ctx.lineWidth = h * 0.07;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(h * 0.06, -h * 0.4, 0, -h * 0.72);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-h * 0.3, -h * 0.68);
    ctx.quadraticCurveTo(-h * 0.18, -h * 1.05, 0, -h * 1.06);
    ctx.quadraticCurveTo(h * 0.18, -h * 1.05, h * 0.3, -h * 0.68);
    ctx.quadraticCurveTo(0, -h * 0.74, -h * 0.3, -h * 0.68);
    ctx.fillStyle = "#8f6a45";
    ctx.fill();
    ctx.strokeStyle = "#5f432a";
    ctx.lineWidth = h * 0.025;
    ctx.stroke();
    ctx.fillStyle = "#b08a5f";
    ctx.beginPath();
    ctx.ellipse(-h * 0.06, -h * 0.94, h * 0.08, h * 0.04, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function mossMound(ctx, x, y, w, h, seed) {
    const r = rng(seed);
    ctx.fillStyle = C.mossDark;
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.moss;
    for (let i = 0; i < w / 2; i++) {
      const a = Math.PI + r() * Math.PI, rr = Math.sqrt(r());
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * w / 2 * rr, y + Math.sin(a) * h * rr, h * 0.12 * (0.5 + r()), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- birds ----------
  // Both are drawn facing right, standing at (0, 0) on their perch; one unit
  // is s, and a bird is about 75 units from beak to tail.

  function streak(ctx, x, y, len, ang, w) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -len / 2);
    ctx.quadraticCurveTo(w, 0, 0, len / 2);
    ctx.quadraticCurveTo(-w, 0, 0, -len / 2);
    ctx.fill();
    ctx.restore();
  }

  function songSparrow(ctx) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // tail: long and rounded, angled down behind the perch
    ctx.fillStyle = "#6b4a30";
    ctx.strokeStyle = "#4a321f";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-10, -20);
    ctx.quadraticCurveTo(-24, -9, -36, 3);
    ctx.quadraticCurveTo(-35, 8, -30, 7);
    ctx.quadraticCurveTo(-20, -2, -2, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#8a6544";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-10 - i * 2, -16 + i);
      ctx.lineTo(-33 + i * 2, 4 + i);
      ctx.stroke();
    }
    // legs
    ctx.strokeStyle = "#b58d72";
    ctx.lineWidth = 1.3;
    for (const lx of [-2, 4]) {
      ctx.beginPath();
      ctx.moveTo(lx, -14);
      ctx.lineTo(lx + 1, -1);
      ctx.moveTo(lx + 1, 0);
      ctx.lineTo(lx + 5, 0.5);
      ctx.moveTo(lx + 1, 0);
      ctx.lineTo(lx - 3, 0.5);
      ctx.stroke();
    }
    // body
    ctx.beginPath();
    ctx.moveTo(18, -40);
    ctx.bezierCurveTo(26, -32, 20, -16, 8, -13);
    ctx.bezierCurveTo(-2, -11, -12, -14, -16, -21);
    ctx.bezierCurveTo(-18, -30, -6, -40, 6, -44);
    ctx.closePath();
    ctx.fillStyle = "#8b6443";
    ctx.fill();
    ctx.strokeStyle = "#4e3622";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // pale underparts
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(24, -38);
    ctx.bezierCurveTo(26, -24, 16, -12, 0, -11);
    ctx.bezierCurveTo(-6, -11, -10, -14, -10, -16);
    ctx.bezierCurveTo(0, -18, 10, -26, 14, -40);
    ctx.closePath();
    ctx.fillStyle = "#efe7d6";
    ctx.fill();
    // breast streaks and the central spot
    ctx.fillStyle = "#6a4528";
    const streaks = [[16, -32], [19, -28], [12, -27], [15, -23], [8, -22], [11, -18], [4, -17], [18, -24], [6, -14], [-2, -15]];
    streaks.forEach(([x, y]) => streak(ctx, x, y, 4.2, 0.35, 0.9));
    ctx.beginPath();
    ctx.ellipse(17, -28, 2.6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // wing: rufous with dark centers and pale edges
    ctx.beginPath();
    ctx.moveTo(10, -38);
    ctx.bezierCurveTo(2, -36, -14, -28, -22, -16);
    ctx.bezierCurveTo(-12, -16, 0, -20, 8, -26);
    ctx.closePath();
    ctx.fillStyle = "#9a6238";
    ctx.fill();
    ctx.strokeStyle = "#4e3622";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = "#3f2b1b";
    for (let i = 0; i < 4; i++) streak(ctx, 2 - i * 5.5, -31 + i * 3.6, 6, 1.0, 1.1);
    ctx.strokeStyle = "#d8c6a6";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(4 - i * 5.5, -28 + i * 3.6);
      ctx.lineTo(-2 - i * 5.5, -25 + i * 3.6);
      ctx.stroke();
    }
    // head
    ctx.beginPath();
    ctx.arc(16, -44, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#8a7a6c";
    ctx.fill();
    ctx.strokeStyle = "#4e3622";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(16, -44, 9, 0, Math.PI * 2);
    ctx.clip();
    // brown crown with a grey central stripe
    ctx.fillStyle = "#7a4e2e";
    ctx.beginPath();
    ctx.ellipse(13, -52, 10, 5.5, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9d968c";
    ctx.beginPath();
    ctx.ellipse(14, -53, 7, 1.4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // grey eyebrow, brown line behind the eye, pale cheek, dark whisker stripe
    ctx.fillStyle = "#b8b1a6";
    ctx.beginPath();
    ctx.ellipse(15, -47.5, 7.5, 1.8, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6e4a2c";
    ctx.beginPath();
    ctx.ellipse(11, -44, 5.5, 1.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#efe7d6";
    ctx.beginPath();
    ctx.ellipse(21, -38, 5, 3.5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a3018";
    streak(ctx, 17.5, -38.5, 6, 1.0, 1.2);
    ctx.restore();
    // eye
    ctx.fillStyle = "#1c140d";
    ctx.beginPath();
    ctx.arc(18.5, -45, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(19, -45.6, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // conical bill
    ctx.beginPath();
    ctx.moveTo(23.5, -46.5);
    ctx.quadraticCurveTo(28, -44.5, 30, -43);
    ctx.quadraticCurveTo(27, -41.5, 23.5, -41.5);
    ctx.closePath();
    ctx.fillStyle = "#8d7b6a";
    ctx.fill();
    ctx.strokeStyle = "#4e3a2a";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(23.5, -43.5);
    ctx.lineTo(29.5, -43.1);
    ctx.stroke();
  }

  function cedarWaxwing(ctx) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // tail: grey with a bright yellow tip
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
    // white under the tail
    ctx.fillStyle = "#f2efe6";
    ctx.beginPath();
    ctx.moveTo(-4, -14);
    ctx.quadraticCurveTo(-10, -9, -16, -6);
    ctx.quadraticCurveTo(-8, -10, -2, -12);
    ctx.fill();
    // legs
    ctx.strokeStyle = "#2c2a2a";
    ctx.lineWidth = 1.2;
    for (const lx of [0, 5]) {
      ctx.beginPath();
      ctx.moveTo(lx, -13);
      ctx.lineTo(lx + 1, -1);
      ctx.moveTo(lx + 1, 0);
      ctx.lineTo(lx + 5, 0.5);
      ctx.moveTo(lx + 1, 0);
      ctx.lineTo(lx - 3, 0.5);
      ctx.stroke();
    }
    // sleek body: warm brown breast fading to a pale yellow belly
    ctx.beginPath();
    ctx.moveTo(20, -44);
    ctx.bezierCurveTo(27, -34, 22, -16, 9, -12);
    ctx.bezierCurveTo(0, -10, -10, -13, -14, -20);
    ctx.bezierCurveTo(-14, -30, 0, -42, 10, -48);
    ctx.closePath();
    const g = ctx.createLinearGradient(20, -44, 4, -12);
    g.addColorStop(0, "#b08a62");
    g.addColorStop(0.55, "#c9ad7c");
    g.addColorStop(1, "#ecdc8e");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#5c4630";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // grey-brown back and wing
    ctx.beginPath();
    ctx.moveTo(12, -44);
    ctx.bezierCurveTo(4, -40, -12, -30, -22, -16);
    ctx.bezierCurveTo(-10, -15, 2, -20, 10, -28);
    ctx.bezierCurveTo(12, -34, 13, -40, 12, -44);
    ctx.closePath();
    ctx.fillStyle = "#7d7570";
    ctx.fill();
    ctx.strokeStyle = "#45403c";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // dark flight feathers and the red waxy tips
    ctx.fillStyle = "#3d3d42";
    ctx.beginPath();
    ctx.moveTo(-2, -24);
    ctx.bezierCurveTo(-10, -20, -16, -17, -22, -16);
    ctx.bezierCurveTo(-14, -17, -6, -19, 0, -21);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d0352b";
    [[-4, -25.5], [-8, -23.5], [-12, -21.5]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.ellipse(x, y, 1.6, 0.9, -0.5, 0, Math.PI * 2);
      ctx.fill();
    });
    // head and swept-back crest
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
    // black mask edged in white, and the small black chin
    ctx.fillStyle = "#fbfaf6";
    ctx.beginPath();
    ctx.moveTo(29, -50);
    ctx.quadraticCurveTo(18, -52.5, 7, -49.5);
    ctx.lineTo(7.5, -48.5);
    ctx.quadraticCurveTo(18, -50.8, 29, -48.4);
    ctx.fill();
    ctx.fillStyle = "#151313";
    ctx.beginPath();
    ctx.moveTo(29, -48.6);
    ctx.quadraticCurveTo(18, -51, 8, -48.4);
    ctx.quadraticCurveTo(12, -45, 17, -44.5);
    ctx.quadraticCurveTo(23, -44.5, 28.5, -45);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, -44.8);
    ctx.quadraticCurveTo(25, -41, 22, -40.5);
    ctx.quadraticCurveTo(22, -43, 22.5, -44.7);
    ctx.fill();
    // eye glint inside the mask
    ctx.fillStyle = "#3a2c22";
    ctx.beginPath();
    ctx.arc(20, -47.4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(20.5, -48, 0.45, 0, Math.PI * 2);
    ctx.fill();
    // short dark bill holding a berry
    ctx.beginPath();
    ctx.moveTo(28, -48.8);
    ctx.lineTo(33.5, -46.6);
    ctx.lineTo(28, -45);
    ctx.closePath();
    ctx.fillStyle = "#1d1b1b";
    ctx.fill();
    ctx.save();
    ctx.translate(35.5, -45.2);
    thimbleBerry(ctx, 5.5);
    ctx.restore();
  }

  // ---------- assembly ----------

  function drawBorder(ctx, W, H) {
    const m = metrics(W, H);
    const { s } = m;
    ctx.save();

    drawVine(ctx, W, H, m);

    // Along the bottom: fern clumps in each corner with mushrooms at their feet.
    const base = H - 6 * s;
    mossMound(ctx, 70 * s, base + 2 * s, 140 * s, 10 * s, 5);
    mossMound(ctx, W - 70 * s, base + 2 * s, 140 * s, 10 * s, 6);
    mossMound(ctx, W / 2, base + 2 * s, 110 * s, 7 * s, 7);
    // Fronds hug the side and the bottom edge, leaving the corner of the card's
    // content clear.
    const clump = [[2, 165, 4], [8, 120, 6], [18, 92, 6], [38, 66, 6], [60, 88, 8], [80, 150, 5], [72, 110, 7]];
    fernClump(ctx, 22 * s, base, s, 1, clump);
    fernClump(ctx, W - 22 * s, base, s, -1, clump);
    // low fronds reaching in along the bottom edge
    fernClump(ctx, W / 2 - 18 * s, base, s, -1, [[78, 110, 6], [64, 80, 8]]);
    fernClump(ctx, W / 2 + 18 * s, base, s, 1, [[78, 110, 6], [64, 80, 8]]);

    amanita(ctx, 92 * s, base, 44 * s, 0.05);
    amanita(ctx, 120 * s, base + 1 * s, 26 * s, -0.12);
    brownCap(ctx, 70 * s, base, 20 * s, -0.15);
    chanterelle(ctx, W - 96 * s, base, 34 * s, -0.05);
    chanterelle(ctx, W - 120 * s, base + 1 * s, 24 * s, 0.15);
    chanterelle(ctx, W - 74 * s, base, 20 * s, 0.1);
    brownCap(ctx, W / 2 - 8 * s, base, 22 * s, -0.08);
    brownCap(ctx, W / 2 + 6 * s, base + 1 * s, 15 * s, 0.12);
    brownCap(ctx, W / 2 + 18 * s, base + 1 * s, 11 * s, 0.2);

    // Birds on short canes that branch off the vine in the top corners.
    const inset = m.band * 0.5;
    const perch = (dir, bird, birdX) => {
      const px = (v) => (dir > 0 ? v : W - v);
      const p0 = [px(inset), 132 * s], c = [px(inset + 14 * s), 80 * s], p1 = [px(124 * s), 76 * s];
      const at = (t) => {
        const u = 1 - t;
        return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
      };
      ctx.strokeStyle = C.stem;
      ctx.lineCap = "round";
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(...p0);
      ctx.quadraticCurveTo(...c, ...p1);
      ctx.stroke();
      ctx.save();
      ctx.translate(...p1);
      ctx.rotate(dir > 0 ? 1.9 : -1.9);
      thimbleLeaf(ctx, 22 * s, dir > 0 ? 901 : 902);
      ctx.restore();
      // Stand the bird where the cane passes under it.
      let best = 0;
      for (let t = 0; t <= 1; t += 0.005) if (Math.abs(at(t)[0] - px(birdX)) < Math.abs(at(best)[0] - px(birdX))) best = t;
      const [bx, by] = at(best);
      ctx.save();
      ctx.translate(bx, by - 1.2 * s);
      ctx.scale(dir * s * 1.05, s * 1.05);
      bird(ctx);
      ctx.restore();
    };
    perch(1, songSparrow, 78 * s);
    perch(-1, cedarWaxwing, 76 * s);

    ctx.restore();
  }

  window.PnwArt = { drawBorder, metrics };
})();
