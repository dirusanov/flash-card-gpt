/**
 * Step 2 of the store-screenshot pipeline: frame the raw captures.
 *
 * This file draws no extension UI. It lays the PNGs written by capture.js onto a 1280x800
 * card with the caption band on top, renders that at deviceScaleFactor 2, and downscales
 * the 2560x1600 result to exactly 1280x800 so the type stays crisp.
 *
 * The one piece of furniture it does draw is the browser window around a page capture:
 * Playwright screenshots contain no browser chrome, and a page floating on a background
 * reads as a mockup. The shell is identical in every frame that uses it and carries the
 * real URL of the page inside it.
 *
 *   node scripts/store-shots/compose.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

const {
  BRAND, GROUND, LINE, TEXT_MUTED, paths, FRAME, FRAMES, CAPTURE, STAGE, SHELL_BAR,
} = require('./config');

const log = (...args) => console.log('[compose]', ...args);

const readMeta = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(paths.raw, 'meta.json'), 'utf8'));
  } catch {
    return {};
  }
};

const dataUri = (file) => {
  const buffer = fs.readFileSync(path.join(paths.raw, file));
  return `data:image/png;base64,${buffer.toString('base64')}`;
};

/** Reads a PNG's pixel size straight out of its IHDR, so no decoder is needed. */
const pngSize = (file) => {
  const head = Buffer.alloc(24);
  const fd = fs.openSync(path.join(paths.raw, file), 'r');
  fs.readSync(fd, head, 0, 24, 0);
  fs.closeSync(fd);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
};

/** The extension's own font stack, so the caption is set in the product's type. */
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, "
  + "Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif";

const INNER = STAGE;

/* ------------------------------------------------------------------- markup ---- */

const browserShell = (frame) => `
  <div class="shell">
    <div class="bar">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      <span class="url">${frame.url.replace(/^https?:\/\//, '')}</span>
    </div>
    <div class="split">
      <img class="page" src="${dataUri(frame.raw[0])}" alt="">
      <img class="panel" src="${dataUri(frame.raw[1])}" alt="">
    </div>
  </div>`;

/**
 * The card is a narrow column that scrolls inside a 600px box, so no single screenshot has
 * all of it. capture.js walks it and writes one strip per scroll position; they are stood
 * side by side here, sized so the row fills the stage — which is what lets the card be
 * drawn larger than life instead of shrunk to fit its own height.
 */
const cardStrips = (frame) => {
  const files = strips();
  const gap = 36;
  const { width, height } = pngSize(files[0]);

  const scale = Math.min(
    INNER.height / height,
    (INNER.width - gap * (files.length - 1)) / (width * files.length),
  );
  const shown = { width: width * scale, height: height * scale };

  const column = (file) => `<img class="strip" src="${dataUri(file)}"
      style="width:${shown.width}px;height:${shown.height}px">`;

  return `<div class="strips" style="gap:${gap}px">${files.map(column).join('')}</div>`;
};

/** card-1.png, card-2.png, … in order; how many there are depends on what the card holds. */
const strips = () => {
  const found = fs.readdirSync(paths.raw)
    .filter((name) => /^card-\d+\.png$/.test(name))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  if (!found.length) throw new Error('no card-N.png strips in store-assets/raw');
  return found;
};

const single = (frame) => `
  <div class="single"><img src="${dataUri(frame.raw[0])}" alt=""></div>`;

const LAYOUTS = { browser: browserShell, cardStrips, single };

const document_ = (frame, caption, captionSize, meta) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${FRAME.width}px; height: ${FRAME.height}px; }
  body { background: ${GROUND}; font-family: ${FONT}; -webkit-font-smoothing: antialiased; }

  .band {
    height: ${FRAME.bandHeight}px;
    background: ${BRAND};
    display: flex; align-items: center;
    padding: 0 ${FRAME.inset}px;
  }
  .band h1 {
    color: #fff;
    font-size: ${captionSize}px;
    font-weight: 600;
    letter-spacing: -0.022em;
    line-height: 1;
    white-space: nowrap;
  }

  .stage {
    height: ${FRAME.height - FRAME.bandHeight}px;
    padding: 0 ${FRAME.inset}px ${FRAME.inset}px;
    display: flex; align-items: center; justify-content: center;
  }

  /* --- browser window around a real page capture --- */
  .shell {
    width: ${CAPTURE.page.placed.width + CAPTURE.panel.placed.width}px;
    height: ${INNER.height}px;
    background: #fff;
    border: 1px solid ${LINE};
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 18px 40px -18px rgba(16, 24, 40, .28);
    display: flex; flex-direction: column;
  }
  .bar {
    height: ${SHELL_BAR}px; flex: none;
    background: #F1F3F5;
    border-bottom: 1px solid ${LINE};
    display: flex; align-items: center; gap: 8px;
    padding: 0 16px;
  }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: #D5D9DE; flex: none; }
  .dot:first-child { margin-right: 0; }
  .url {
    margin-left: 12px;
    height: 26px; flex: 1;
    display: flex; align-items: center;
    background: #fff;
    border: 1px solid ${LINE};
    border-radius: 13px;
    padding: 0 12px;
    font-size: 12.5px; color: ${TEXT_MUTED};
  }
  .split { flex: 1; display: flex; min-height: 0; }
  .split .page {
    width: ${CAPTURE.page.placed.width}px; height: ${CAPTURE.page.placed.height}px;
    display: block;
  }
  .split .panel {
    width: ${CAPTURE.panel.placed.width}px; height: ${CAPTURE.panel.placed.height}px;
    display: block; border-left: 1px solid ${LINE};
  }

  /* --- one card, read down the first strip and on down the next --- */
  .strips { display: flex; align-items: center; justify-content: center; }
  .strip {
    display: block;
    border-radius: 16px;
    box-shadow: 0 20px 44px -20px rgba(16, 24, 40, .32);
  }

  /* --- one capture, fitted --- */
  .single { display: flex; align-items: center; justify-content: center;
            width: ${INNER.width}px; height: ${INNER.height}px; }
  .single img {
    max-width: 100%; max-height: 100%;
    border-radius: 10px;
    box-shadow: 0 18px 40px -18px rgba(16, 24, 40, .3);
  }
</style></head>
<body>
  <div class="band"><h1>${caption}</h1></div>
  <div class="stage">${LAYOUTS[frame.layout](frame, meta)}</div>
</body></html>`;

/* ---------------------------------------------------------------- rendering ---- */

/**
 * The largest caption size, at most FRAME.captionSize, at which *every* caption still fits
 * on one line. All five frames then use that one size, so the band is identical across the
 * set rather than each caption finding its own.
 */
async function fitCaptionSize(page, captions) {
  return page.evaluate(({ list, max, avail, font }) => {
    const probe = document.createElement('span');
    probe.style.cssText = `position:fixed;visibility:hidden;white-space:nowrap;font-weight:600;`
      + `letter-spacing:-0.022em;font-family:${font};`;
    document.body.appendChild(probe);
    let size = max;
    while (size > 24) {
      probe.style.fontSize = `${size}px`;
      const fits = list.every((text) => {
        probe.textContent = text;
        return probe.getBoundingClientRect().width <= avail;
      });
      if (fits) break;
      size -= 1;
    }
    probe.remove();
    return size;
  }, {
    list: captions,
    max: FRAME.captionSize,
    avail: FRAME.width - FRAME.inset * 2,
    font: FONT,
  });
}

/* ------------------------------------------------------------ png encoding ---- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

/**
 * Encodes raw RGBA pixels as a truecolour PNG with no alpha channel.
 *
 * The Chrome Web Store asks for 24-bit PNG without alpha, and a canvas always hands back
 * RGBA — `toDataURL` has no way to drop the channel. Rather than take on an image library
 * for one job, the pixels come back from the canvas raw and are encoded here: colour type
 * 2, filter 0 on every scanline, zlib for the data.
 */
function encodeRgbPng(rgba, width, height) {
  const stride = width * 3;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    rows[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      const to = rowStart + 1 + x * 3;
      rows[to] = rgba[from];
      rows[to + 1] = rgba[from + 1];
      rows[to + 2] = rgba[from + 2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour, no alpha
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- rendering ---- */

/**
 * Renders at 2x and hands the 2560x1600 bitmap back to a blank page, which draws it once
 * into a 1280x800 canvas. An exact 2:1 reduction, done by the same renderer that drew the
 * type — no external image tool, no resampling surprises. The canvas then gives up its raw
 * pixels, which encodeRgbPng writes out without the alpha channel the store rejects.
 */
async function renderFrame(page, downscaler, frame, caption, captionSize, meta, outFile) {
  await page.setContent(document_(frame, caption, captionSize, meta), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const big = await page.screenshot({ scale: 'device' });

  const pixels = await downscaler.evaluate(async ({ b64, width, height }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < data.length; i += step) {
      binary += String.fromCharCode.apply(null, data.subarray(i, i + step));
    }
    return btoa(binary);
  }, { b64: big.toString('base64'), width: FRAME.width, height: FRAME.height });

  const rgba = Buffer.from(pixels, 'base64');
  fs.writeFileSync(outFile, encodeRgbPng(rgba, FRAME.width, FRAME.height));
}

/**
 * Frame 03 is the one capture that cannot be automated from here: Anki is a desktop app,
 * and its first-run dialogs do not accept synthetic input under this window manager. These
 * are the steps, printed whenever the capture is missing.
 */
const ANKI_INSTRUCTIONS = `
    Frame 03 needs one screenshot taken by hand, of Anki Desktop.

    WHAT THE FRAME HAS TO SHOW
      The card from this run, open in Anki, with the deck selector visible.

    STEPS
      1. Start Anki Desktop. AnkiConnect must be enabled
         (Tools -> Add-ons -> AnkiConnect). Nothing else has to be configured.
      2. In the extension's side panel: Settings -> turn on "Use AnkiConnect",
         leave the URL at http://127.0.0.1:8765, and pick or create the deck
         you want the frame to show (a deck named "Espanol" reads well).
      3. Side panel -> Cards -> open the "sobremesa" card -> Export to Anki.
         The card is also written to store-assets/raw/card.json if you would
         rather add it by hand.
      4. In Anki press "b" to open Browse. Click that deck in the left sidebar,
         then click the note, so the deck list and the note's fields are both
         on screen.
      5. Size the Anki window to roughly 1200x760 and make sure nothing personal
         is on screen - no other decks you would not want in a public listing,
         no sync email in the title bar. A fresh Anki profile is the easy way
         to guarantee that (File -> Switch Profile -> Add).
      6. Capture that WINDOW only, not the whole screen:

           import -window "$(xdotool selectwindow)" store-assets/raw/anki-desktop.png

         (then click the Anki window), or with GNOME:

           gnome-screenshot -w -d 3 -f store-assets/raw/anki-desktop.png

    THEN
      node scripts/store-shots --compose

    and 03.png is built from it with the same band and the same ground as the
    other four. Nothing else needs re-running.
`;

/* --------------------------------------------------------------------- main ---- */

(async () => {
  fs.mkdirSync(paths.screenshots, { recursive: true });
  const meta = readMeta();

  const captionFor = (frame) => (
    frame.captionNoImage && !meta.hasImage ? frame.captionNoImage : frame.caption
  );

  const ready = [];
  const missing = [];
  for (const frame of FRAMES) {
    const absent = frame.raw.filter((file) => !fs.existsSync(path.join(paths.raw, file)));
    if (absent.length) missing.push({ frame, absent });
    else ready.push(frame);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: FRAME.width, height: FRAME.height },
    deviceScaleFactor: 2,
  });
  const downscaler = await browser.newPage();
  await downscaler.setContent('<html><body></body></html>');

  // Sized against every caption in the set, including ones whose captures are missing, so
  // a frame added later cannot change the type size of the ones already approved.
  const captionSize = await fitCaptionSize(page, FRAMES.map(captionFor));
  if (captionSize < FRAME.captionSize) {
    log(`caption set to ${captionSize}px — ${FRAME.captionSize}px overflows one line`);
  }

  for (const frame of ready) {
    const out = path.join(paths.screenshots, `${frame.id}.png`);
    await renderFrame(page, downscaler, frame, captionFor(frame), captionSize, meta, out);
    log('wrote', path.relative(paths.root, out));
  }

  await browser.close();

  if (missing.length) {
    console.log('');
    for (const { frame, absent } of missing) {
      console.log(`[compose] ${frame.id}.png NOT built — missing ${absent.join(', ')}`);
      if (frame.id === '03') console.log(ANKI_INSTRUCTIONS);
    }
  }
})().catch((error) => {
  console.error('[compose] failed:', error);
  process.exit(1);
});
