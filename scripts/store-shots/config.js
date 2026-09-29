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
  /**
   * What to select on the page and turn into a card — a phrase rather than a single word,
   * because frame 01's whole job is to show what highlighting does and one highlighted word
   * is about 12px in a carousel thumbnail. This is a real collocation from the article, and
   * English has no single word for it, so the answer side always says something — unlike
   * "comensales", which came back as "comensales" on one run in three, or "hidalgo", which
   * English simply borrowed.
   */
  word: 'charlas de sobremesa',
  /** Must appear verbatim in the article; the capture fails loudly if it does not. */
  sentenceFragment: 'abarcando diversos temas',
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
  /**
   * Don Quijote is 17th-century Spanish, which makes picking a word here awkward: its
   * distinctive vocabulary is archaic (adarga, rocín, podadera) and its everyday vocabulary
   * is too easy to be worth a card — "sobrina" came out as "niece", a word anybody
   * installing a Spanish extension already knows, so the frame demonstrated nothing.
   * "madrugador" is both current and worth looking up, and it pictures well.
   *
   * Also ruled out: "hidalgo" (English borrowed it, so the card translated it to itself)
   * and "galgo" (imagePromptSafety.ts refused the image prompt, leaving no illustration).
   */
  word: 'madrugador',
  sentenceFragment: 'gran madrugador y amigo de la caza',
};

/**
 * Frame 05's page. A different article from frame 01's on purpose: with the same one behind
 * both, the two frames were all but identical in a carousel and the second taught a reader
 * nothing. Reviewing is not tied to the page you are on, so any real page is honest here.
 */
const REVIEW_PAGE = { url: 'https://es.wikipedia.org/wiki/Siesta' };

const paths = {
  root: ROOT,
  extension: path.join(ROOT, 'build'),
  raw: path.join(ROOT, 'store-assets', 'raw'),
  screenshots: path.join(ROOT, 'store-assets', 'screenshots'),
};

/** Final frame geometry, per the store's 1280x800 slot. */
const FRAME = {
  width: 1280,
  height: 800,
  bandHeight: 150,
  captionSize: 50,
  inset: 40,
};

/** Height of the title bar the compositor draws above a page capture. */
const SHELL_BAR = 44;

/** The stage: everything below the caption band, inside the inset. */
const STAGE = {
  width: FRAME.width - FRAME.inset * 2,
  height: FRAME.height - FRAME.bandHeight - FRAME.inset,
};

/**
 * The browser window the frames are photographs of.
 *
 * Page and side panel share one window height, because in Chrome they do. Capturing at a
 * short viewport made every frame look cramped and cut the card in half; this is a window
 * of a size somebody actually works in, scaled down as a whole to fit the stage — which is
 * what a screenshot of a real screen looks like.
 *
 * The panel is wider than Chrome's default: the card sheet inside it is capped at 360px
 * (ui/Modal.tsx), so extra width gives that sheet air instead of pressing it to the edges.
 */
const WINDOW = {
  // Measured, not guessed: the card sheet grows with the panel until the panel is about
  // 960px tall, where StudyCard's own 600px cap takes over and it stops. Past that point a
  // taller window only scales the card down without showing any more of it.
  height: 840,
  panelWidth: 460,
  pageWidth: 900,
  /**
   * Chrome's page zoom, which applies to the page and not to the side panel — so this is
   * the one lever that makes the article's type, and the selection highlight on it, bigger
   * without shrinking the card. At 100% the highlighted word was about 12px in a carousel
   * thumbnail: invisible, on the frame whose whole job is to show what highlighting does.
   */
  pageZoom: 1.25,
};

const shellContentHeight = STAGE.height - SHELL_BAR;

// One window, drawn at one scale: page and panel are placed from the same physical sizes,
// so the shell is a faithful reduction of a real WINDOW.pageWidth+panelWidth x height
// window. The page's own zoom then changes only how much of the page fits inside its half.
const windowScale = shellContentHeight / WINDOW.height;
const zoomed = (physical) => Math.round(physical / WINDOW.pageZoom);

const CAPTURE = {
  // Two device pixels per placed pixel is all the 2x render in compose.js can use.
  deviceScaleFactor: 2,
  page: {
    css: { width: zoomed(WINDOW.pageWidth), height: zoomed(WINDOW.height) },
    placed: {
      width: Math.round(WINDOW.pageWidth * windowScale),
      height: shellContentHeight,
    },
  },
  panel: {
    css: { width: WINDOW.panelWidth, height: WINDOW.height },
    placed: {
      width: Math.round(WINDOW.panelWidth * windowScale),
      height: shellContentHeight,
    },
  },
};

/** How wide the window ends up being drawn — page and panel side by side. */
const SHELL_WIDTH = CAPTURE.page.placed.width + CAPTURE.panel.placed.width;

function assertGeometry() {
  for (const [name, spec] of Object.entries({ page: CAPTURE.page, panel: CAPTURE.panel })) {
    const device = spec.css.width * CAPTURE.deviceScaleFactor;
    if (device < spec.placed.width * 2) {
      throw new Error(`${name} capture is ${device}px wide, the 2x render needs ${spec.placed.width * 2}px`);
    }
  }
  if (SHELL_WIDTH > STAGE.width) {
    throw new Error(`the window is ${SHELL_WIDTH}px wide, wider than the ${STAGE.width}px stage`);
  }
}

/**
 * The five frames, in order. Each `layout` is implemented in compose.js; `raw` lists the
 * captures it needs, so a missing capture is reported by name instead of rendering blank.
 *
 * Frame 02's strips are discovered at compose time — how many it takes to walk the whole
 * card depends on how much the generator wrote — so it lists only the first one.
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
    // no-image wording automatically when the card has none.
    caption: 'Translation, example and image — filled in for you',
    captionNoImage: 'Translation, examples and grammar — filled in for you',
    layout: 'cardStrips',
    raw: ['card-1.png'],
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
    url: REVIEW_PAGE.url,
  },
];

module.exports = {
  BRAND, GROUND, LINE, TEXT, TEXT_MUTED,
  CONTENT, SECOND_PAGE, REVIEW_PAGE,
  paths, CAPTURE, WINDOW, FRAME, STAGE, SHELL_BAR, SHELL_WIDTH, FRAMES, assertGeometry,
};

assertGeometry();
