// Fonts shared by the PDF tools. useFont(doc, key) embeds a font in a jsPDF
// document and returns the family name to pass to doc.setFont.
(function () {
  "use strict";

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

  // Fills a <select> with the fonts, grouped.
  function fillFontSelect(sel, value) {
    const groups = {};
    for (const [key, f] of Object.entries(FONTS)) {
      if (!groups[f.group]) {
        groups[f.group] = document.createElement("optgroup");
        groups[f.group].label = f.group;
      }
      groups[f.group].appendChild(new Option(f.label, key));
    }
    for (const g of ["Calligraphy", "Elegant serif", "Plain"]) sel.appendChild(groups[g]);
    sel.value = value;
  }

  // The CSS font-family for previews.
  function cssFamily(key) {
    const f = FONTS[key] || FONTS.helvetica;
    return f.builtin ? f.css : `"${f.css}", serif`;
  }

  window.PdfFonts = { FONTS, useFont, fillFontSelect, cssFamily };
})();
