/**
 * Shared settings for the Chrome Web Store screenshot pipeline.
 *
 * Two rules shape everything here:
 *   1. Every pixel of extension UI in the final frames is a real capture of the real
 *      extension running in Chromium. The HTML in compose.js only frames those captures.
 *   2. The brand colour is read from the product's own token source (tailwind.config.js),
 *      never typed in again, so the frames cannot drift away from the extension.
 */

const path = require('path');
const tailwind = require('../../tailwind.config.js');

const ROOT = path.resolve(__dirname, '..', '..');

const colors = tailwind.theme.extend.colors;

/** #0066FF — `accent.DEFAULT`, the extension's primary action colour. */
const BRAND = colors.accent.DEFAULT;
/** #F8F9FA — `surface.muted`, the extension's own page background. */
const GROUND = colors.surface.muted;
const LINE = colors.line.DEFAULT;
const TEXT = colors.gray[900];
const TEXT_MUTED = colors.gray[500];

/**
 * The study material. A real Spanish Wikipedia article, a real sentence from it, and a
 * real word inside that sentence — the capture script asserts all three are actually
 * present on the page before it selects anything.
 */
const CONTENT = {
  articleUrl: 'https://es.wikipedia.org/wiki/Sobremesa',
  /** Word to select on the page and turn into a card. */
  word: 'comensales',
  /** Must appear verbatim in the article; the capture fails loudly if it does not. */
  sentenceFragment: 'en el que los comensales',
  targetLanguage: 'en',
  /** Anki deck the card is exported into for frame 03. */
  ankiDeck: 'Español',
};

/**
 * Frame 04's second page: a different kind of reading, on a different site.
 *
 * This was a PDF until the PDF viewer was actually tested. Chrome draws a PDF with a
 * plugin and does not expose the selection to the embedding document, so the extension's
 * content script reads an empty selection there — the flow genuinely does not work on a
 * PDF, and the frame must not claim it does. Project Gutenberg's Spanish Don Quijote is a
 * real, public-domain, stable page that the flow does work on.
 */
const SECOND_PAGE = {
  url: 'https://www.gutenberg.org/cache/epub/2000/pg2000-images.html',
  // Not "hidalgo": English borrowed that word, so the card's translation came out as the
  // same word again, which reads as a broken card however correct it is.
  word: 'galgo',
  sentenceFragment: 'rocín flaco y galgo corredor',
};

const paths = {
  root: ROOT,
  extension: path.join(ROOT, 'build'),
  raw: path.join(ROOT, 'store-assets', 'raw'),
  screenshots: path.join(ROOT, 'store-assets', 'screenshots'),
};

/**
 * Capture geometry.
 *
 * `css` is the viewport a surface is captured at, `placed` is the size it is drawn at in
 * the finished frame. Capturing at fewer CSS pixels than the placed size is what makes the
 * page and the panel read at a comfortable zoom instead of shrinking into the frame;
 * `deviceScaleFactor` then has to be high enough that the device pixels still cover the 2x
 * render in compose.js. assertGeometry() below checks both invariants on every run.
 */
const CAPTURE = {
  deviceScaleFactor: 3,
  page: { css: { width: 660, height: 479 }, placed: { width: 780, height: 566 } },
  panel: { css: { width: 400, height: 539 }, placed: { width: 420, height: 566 } },
};

function assertGeometry() {
  for (const [name, spec] of Object.entries({ page: CAPTURE.page, panel: CAPTURE.panel })) {
    const cssRatio = spec.css.width / spec.css.height;
    const placedRatio = spec.placed.width / spec.placed.height;
    if (Math.abs(cssRatio - placedRatio) > 0.005) {
      throw new Error(`${name} capture aspect ${cssRatio.toFixed(3)} != placed ${placedRatio.toFixed(3)}`);
    }
    const device = spec.css.width * CAPTURE.deviceScaleFactor;
    if (device < spec.placed.width * 2) {
      throw new Error(`${name} capture is ${device}px wide, the 2x render needs ${spec.placed.width * 2}px`);
    }
  }
  const shell = CAPTURE.page.placed.width + CAPTURE.panel.placed.width;
  if (shell !== FRAME.width - FRAME.inset * 2) {
    throw new Error(`page + panel = ${shell}px, the frame's inner width is ${FRAME.width - FRAME.inset * 2}px`);
  }
}

/** Final frame geometry, per the store's 1280x800 slot. */
const FRAME = {
  width: 1280,
  height: 800,
  bandHeight: 150,
  captionSize: 50,
  inset: 40,
};

/**
 * The five frames, in order. Each `build` is implemented in compose.js; `raw` lists the
 * captures it needs, so a missing capture is reported by name instead of rendering blank.
 */
const FRAMES = [
  {
    id: '01',
    caption: 'Highlight. Click. The card is done.',
    layout: 'browser',
    raw: ['article.png', 'panel-card.png'],
    url: CONTENT.articleUrl,
  },
  {
    id: '02',
    // The image half of this caption is only true when the card actually carries an
    // illustration, which needs an OpenAI key (see README). compose.js swaps in the
    // no-image wording automatically when card-back.png has no illustration.
    caption: 'Translation, example and image — filled in for you',
    captionNoImage: 'Translation, examples and grammar — filled in for you',
    layout: 'cardPair',
    raw: ['card-front.png', 'card-back.png'],
  },
  {
    id: '03',
    caption: 'Straight into your Anki deck via AnkiConnect',
    layout: 'single',
    raw: ['anki-desktop.png'],
  },
  {
    id: '04',
    // Was "Articles, PDFs, subtitles" until the PDF viewer was tested — see SECOND_PAGE.
    caption: 'Articles, blogs, books — any page',
    layout: 'browser',
    raw: ['page2.png', 'panel-page2.png'],
    url: SECOND_PAGE.url,
  },
  {
    id: '05',
    caption: 'Or review right in the browser, synced across devices',
    layout: 'browser',
    raw: ['review-page.png', 'panel-review.png'],
    url: CONTENT.articleUrl,
  },
];

module.exports = {
  BRAND, GROUND, LINE, TEXT, TEXT_MUTED,
  CONTENT, SECOND_PAGE,
  paths, CAPTURE, FRAME, FRAMES, assertGeometry,
};

assertGeometry();
