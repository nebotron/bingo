// Turns a picture into black dots on white, so that a single card back reads
// as an abstract dot texture and the picture only appears once the cards are
// laid out together. The whole composite is dithered in one pass, so the dots
// and the diffused error carry on seamlessly from one card to the next.
(function () {
  "use strict";

  // Luminance of a canvas, auto-levelled so the darkest 1% is black and the
  // lightest 1% white: dithering needs the full tonal range to read well.
  // The levels come from `rect` (the picture itself, not any white around it).
  function grayscale(canvas, rect) {
    const { width: w, height: h } = canvas;
    const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    const hist = new Uint32Array(256);
    const r = rect || { x: 0, y: 0, w, h };
    const x0 = Math.max(0, Math.floor(r.x)), x1 = Math.min(w, Math.ceil(r.x + r.w));
    const y0 = Math.max(0, Math.floor(r.y)), y1 = Math.min(h, Math.ceil(r.y + r.h));
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = 0.2126 * px[4 * i] + 0.7152 * px[4 * i + 1] + 0.0722 * px[4 * i + 2];
        g[i] = v;
        if (x >= x0 && x < x1 && y >= y0 && y < y1) { hist[Math.min(255, Math.round(v))]++; n++; }
      }
    }
    const pick = (frac) => {
      let acc = 0;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= frac * n) return v; }
      return 255;
    };
    const lo = pick(0.01), hi = Math.max(lo + 1, pick(0.99));
    for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(1, (g[i] - lo) / (hi - lo)));
    return g;
  }

  // Error-diffusion kernels as [dx, dy, weight]; serpentine scanning mirrors dx.
  const KERNELS = {
    floyd: { div: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
    // Atkinson spreads only 3/4 of the error: crisper, higher-contrast dots.
    atkinson: { div: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  };

  function bayer(n) {
    let m = [[0]];
    while (m.length < n) {
      const s = m.length, out = [];
      for (let y = 0; y < 2 * s; y++) {
        out.push([]);
        for (let x = 0; x < 2 * s; x++) {
          const q = [0, 2, 3, 1][(y >= s ? 2 : 0) + (x >= s ? 1 : 0)];
          out[y].push(4 * m[y % s][x % s] + q);
        }
      }
      m = out;
    }
    return m;
  }
  const BAYER8 = bayer(8);

  // Returns a Uint8Array with 1 where a dot (ink) goes.
  function dither(gray, w, h, method) {
    const ink = new Uint8Array(w * h);
    if (method === "ordered") {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const t = (BAYER8[y & 7][x & 7] + 0.5) / 64;
          ink[y * w + x] = gray[y * w + x] < t ? 1 : 0;
        }
      }
      return ink;
    }
    const k = KERNELS[method] || KERNELS.floyd;
    const g = Float32Array.from(gray);
    for (let y = 0; y < h; y++) {
      const ltr = y % 2 === 0;
      for (let j = 0; j < w; j++) {
        const x = ltr ? j : w - 1 - j;
        const i = y * w + x;
        const out = g[i] < 0.5 ? 0 : 1;
        ink[i] = 1 - out;
        const err = (g[i] - out) / k.div;
        for (const [dx, dy, wt] of k.taps) {
          const xx = x + (ltr ? dx : -dx), yy = y + dy;
          if (xx >= 0 && xx < w && yy < h) g[yy * w + xx] += err * wt;
        }
      }
    }
    return ink;
  }

  // Draws `img` on a white w × h canvas into `rect` (default: the whole canvas,
  // covered), halving in steps so a large photo shrinks smoothly to a few
  // hundred dots.
  function placeCanvas(img, w, h, rect) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const scale = rect ? rect.w / iw : Math.max(w / iw, h / ih);
    const tw = iw * scale; // final width of the whole image
    let src = img, sw = iw, sh = ih;
    while (sw / 2 >= tw && sh > 2) {
      const c = document.createElement("canvas");
      c.width = Math.ceil(sw / 2);
      c.height = Math.ceil(sh / 2);
      c.getContext("2d").drawImage(src, 0, 0, sw, sh, 0, 0, c.width, c.height);
      src = c; sw = c.width; sh = c.height;
    }
    const k = (iw * scale) / sw;
    const dx = rect ? rect.x : (w - sw * k) / 2, dy = rect ? rect.y : (h - sh * k) / 2;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, sw, sh, dx, dy, sw * k, sh * k);
    return out;
  }

  // Dithers `img` on a dotsW × dotsH grid, drawn into `rect` (in dots; by
  // default it covers the grid). Returns a canvas holding one pixel per dot
  // (black ink on white); scale it up with smoothing off.
  function ditherImage(img, dotsW, dotsH, method, rect) {
    const src = placeCanvas(img, dotsW, dotsH, rect);
    const ink = dither(grayscale(src, rect), dotsW, dotsH, method);
    const ctx = src.getContext("2d");
    const data = ctx.createImageData(dotsW, dotsH);
    for (let i = 0; i < ink.length; i++) {
      const v = ink[i] ? 0 : 255;
      data.data[4 * i] = data.data[4 * i + 1] = data.data[4 * i + 2] = v;
      data.data[4 * i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    return src;
  }

  window.Dither = { ditherImage, dither, grayscale };
})();
