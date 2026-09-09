# Chrome Web Store screenshots

Regenerates the five 1280×800 frames in `store-assets/screenshots/` from the real,
running extension.

```sh
npm run build                 # the pipeline photographs build/, not src/
node scripts/store-shots      # capture + compose
node scripts/store-shots --compose   # re-frame the existing captures, no browser, no API calls
```

Output: `store-assets/screenshots/01.png` … `05.png`, exactly 1280×800.
Raw material: `store-assets/raw/`.

## The rule this pipeline exists to keep

Every pixel of extension UI in the final frames is a screenshot of the extension actually
running. Nothing is redrawn in HTML. `compose.js` only frames those captures — a caption
band, a neutral ground, and a browser window around a page capture (Playwright screenshots
contain no browser chrome of their own, and a bare page reads as a mockup). The card, the
panel, the buttons, the illustration: all real.

The content is real too. A real Spanish Wikipedia article, a real word selected in it with
a real double-click, handed to the panel by the extension's own content script, and a card
built by the real generation pipeline. `capture.js` asserts the sentence and the word are
actually on the page before it clicks anything, so the frames cannot quietly drift from
what the article says.

## How it works

**`capture.js`** launches Chromium with `build/` loaded as an unpacked extension, in a
throwaway profile — no bookmarks bar, no other extensions, no history, nothing personal.
It reads the extension id from the service worker URL. The side panel cannot be driven
through Chrome's own UI from Playwright, so it is opened directly as a page at
`chrome-extension://<id>/sidepanel.html`; that is the same document Chrome renders in the
panel.

Then, per frame: open the page, select the word with the mouse, wait for the panel to
receive it, press Create card, wait for the card to finish filling in, screenshot.

Page and panel are captured at one window height (`WINDOW` in `config.js`), because in
Chrome they share one. An earlier version captured each at whatever small viewport made
the text biggest once placed; the frames came out cramped, and the card was cut in half.
The whole window is now photographed at a size somebody actually works in and scaled down
together, which is what a screenshot of a real screen looks like.

`WINDOW.pageZoom` is Chrome's page zoom, which applies to the page and not to the side
panel — the one lever that enlarges the article's type, and the selection highlight on it,
without shrinking the card.

Two numbers control how tall that window reads, and they do different things.
`WINDOW.height` is the viewport behind the capture: raising it shows more page and more
card, and shrinks everything, until the panel passes about 960px and StudyCard's 600px cap
stops the card growing at all. How wide the window is *drawn* follows from `pageWidth` and `panelWidth` at that scale:
stretched across the whole 1200px stage it would be 2.1:1, a letterbox no browser is
shaped like, and it reads as short no matter what the viewport behind it is. At 900+460 it
comes out 1.5:1 — a window — with the ground framing it either side.

Generation is not deterministic. A run can come back with no examples, with the Spanish
word repeated where the translation belongs, or — for some words — with the image prompt
refused. `generateGoodCard` checks the card and presses Create again, up to three times,
so a thin card is never what gets photographed.

**`compose.js`** lays each capture out at 1280×800, renders at `deviceScaleFactor: 2`, and
downscales the 2560×1600 result to exactly 1280×800 in a canvas — so the type stays crisp.

**`config.js`** holds everything worth changing: the article, the word, the captions, the
geometry. The brand colour is *read from `tailwind.config.js`* rather than typed in again,
so the band cannot drift away from the product's own `accent` token (`#0066FF` today).

## Frame 02: why the card is in strips

`StudyCard` caps the card at `MAX_CARD_HEIGHT = 600` and scrolls its content inside that
box, so there is no window size at which the whole answer side is on screen — the card is
simply taller than it is allowed to be drawn. Fitting that column to the height of a
landscape frame shrinks it to a thumbnail, which is how half the generated content went
missing from this frame in earlier versions.

So the card is walked instead: the disclosure opened, then one screenshot per scroll
position, each landing on a boundary between the card's own blocks. `compose.js` stands the
strips side by side and sizes the row to the stage, which lets the card be drawn about 1.2x
life size with every field — illustration, translation, all three examples, grammar note —
visible at once. The overlap between strips is spread evenly across the seams; a greedy
walk clamps the last strip to the bottom of the content and repeats most of the one before
it, which reads as a mistake.

## Illustrations need an OpenAI key

The card's picture is generated through OpenAI, and only the extension's full create screen
does that. Without a key the panel shows the first-run screen, whose cards come from
Vaulto's own trial server: real translation, transcription, examples and grammar, but no
illustration. `compose.js` notices and swaps frame 02's caption to the wording that does
not promise an image.

The key is read from `OPENAI_API_KEY`, or from `~/.config/vaulto/openai.key`
(override with `VAULTO_OPENAI_KEY_FILE`), so it never has to be typed on a command line.
A full run makes two cards with illustrations.

## Frame 03 is captured by hand

Anki is a desktop application. Launching it with a clean profile works, but its first-run
dialogs do not accept synthetic input under this window manager, so the export cannot be
driven end to end from here.

If `store-assets/raw/anki-desktop.png` exists, `compose.js` frames it like any other
capture. If it does not, it prints the exact steps and skips 03, building the other four.
Run `node scripts/store-shots --compose` to see them.

## Things that were tried and did not work

- **PDFs.** The original frame 04 was "the same flow on a PDF". Chrome renders a PDF in a
  plugin: a drag visibly highlights the text, but `window.getSelection()` on the embedding
  document comes back empty, so the content script reads nothing and no card is made. The
  extension has no PDF handling of its own either. The frame — and its caption — now show a
  book (Project Gutenberg's Spanish *Don Quijote*) instead, which does work.
- **Driving the side panel through Chrome's UI.** Not reachable from Playwright; hence
  opening `sidepanel.html` as a page.

## What the frames have to do in two seconds

A store visitor gives a carousel about two seconds a frame, at roughly 320px wide. Three
things were fixed after checking the set at that size rather than at full size:

- **The highlight was invisible.** One highlighted word is about 12px in a thumbnail, on
  the frame whose entire job is to show what highlighting does. It is now a phrase, and the
  page carries 125% zoom, which makes the blue block findable at a glance — and the same
  words appear on the card beside it, which is what ties cause to effect.
- **Frames 01 and 05 were near-identical.** Same article, same layout; the only difference
  was the small grading buttons. 05 now sits on a different article.
- **Frame 04 was a wall of type.** At 100% the Gutenberg page was a grey rectangle; the
  zoom brings up the chapter heading, which is what makes it read as a book.

What still does not survive a thumbnail, and cannot: the card's own text in frames 01, 04
and 05. A side panel is a quarter of a browser window, so at 320px the card is a picture
and a shape. The caption carries those frames; frame 02 is where the card is legible.

## Choosing the word

Three constraints learned the hard way, worth keeping in mind before editing
`CONTENT.word` or `SECOND_PAGE.word`:

- It must not sit inside a link. Double-clicking a wikilink follows it.
- Its translation must not be the same word. "hidalgo" is a loanword in English, so the
  card's answer side read "hidalgo"; "comensales" came back as itself on one run in three.
  The quality gate catches this now, but a word that cannot fail is better than a retry.
- The image-prompt guard in `imagePromptSafety.ts` refuses some words — "galgo" produced
  "Failed to generate an image prompt without mentioning the source word", leaving the card
  with no illustration.
