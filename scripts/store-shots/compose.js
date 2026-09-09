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
const { chromium } = require('playwright');

const {
  BRAND, GROUND, LINE, TEXT_MUTED, paths, FRAME, FRAMES, CAPTURE,
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

/** The extension's own font stack, so the caption is set in the product's type. */
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, "
  + "Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif";

const INNER = {
  width: FRAME.width - FRAME.inset * 2,
  height: FRAME.height - FRAME.bandHeight - FRAME.inset,
};

const SHELL_BAR = 44;

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

const cardPair = (frame) => `
  <div class="pair">
    <img class="card" src="${dataUri(frame.raw[0])}" alt="">
    <img class="card" src="${dataUri(frame.raw[1])}" alt="">
  </div>`;

const single = (frame) => `
  <div class="single"><img src="${dataUri(frame.raw[0])}" alt=""></div>`;

const LAYOUTS = { browser: browserShell, cardPair, single };

const document_ = (frame, caption, captionSize) => `<!doctype html>
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
    width: ${INNER.width}px; height: ${INNER.height}px;
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

  /* --- two faces of one card ---
     The card is a portrait column and the stage is landscape, so height is what limits
     how large it can be drawn. Both faces are set to the full stage height and centred;
     the margins either side are the shape of the card, not wasted space. */
  .pair { display: flex; gap: 56px; align-items: center; justify-content: center; }
  .pair .card {
    height: ${INNER.height - 24}px; width: auto; display: block;
    border-radius: 18px;
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
  <div class="stage">${LAYOUTS[frame.layout](frame)}</div>
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

/**
 * Renders at 2x and hands the 2560x1600 bitmap back to a blank page, which draws it once
 * into a 1280x800 canvas. An exact 2:1 reduction, done by the same renderer that drew the
 * type — no external image tool, no resampling surprises.
 */
async function renderFrame(page, downscaler, frame, caption, captionSize, outFile) {
  await page.setContent(document_(frame, caption, captionSize), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const big = await page.screenshot({ scale: 'device' });

  const shrunk = await downscaler.evaluate(async ({ b64, width, height }) => {
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
    const url = canvas.toDataURL('image/png');
    return url.slice(url.indexOf(',') + 1);
  }, { b64: big.toString('base64'), width: FRAME.width, height: FRAME.height });

  fs.writeFileSync(outFile, Buffer.from(shrunk, 'base64'));
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
      3. Side panel -> Cards -> open the "comensales" card -> Export to Anki.
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
    await renderFrame(page, downscaler, frame, captionFor(frame), captionSize, out);
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
