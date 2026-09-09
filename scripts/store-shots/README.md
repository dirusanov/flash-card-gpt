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
`chrome-extension://<id>/sidepanel.html`, at a panel-sized viewport; that is the same
document Chrome renders in the panel.

Then, per frame: open the page, select the word with the mouse, wait for the panel to
receive it, press Create card, wait for the card to finish filling in, screenshot.

**`compose.js`** lays each capture out at 1280×800, renders at `deviceScaleFactor: 2`, and
downscales the 2560×1600 result to exactly 1280×800 in a canvas — so the type stays crisp.

**`config.js`** holds everything worth changing: the article, the word, the captions, the
geometry. The brand colour is *read from `tailwind.config.js`* rather than typed in again,
so the band cannot drift away from the product's own `accent` token (`#0066FF` today).

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

## Choosing the word

Two constraints learned the hard way, both worth keeping in mind before editing
`CONTENT.word` or `SECOND_PAGE.word`:

- It must not sit inside a link. Double-clicking a wikilink follows it.
- Its translation must not be the same word. "hidalgo" is a loanword in English, so the
  card's answer side read "hidalgo" and looked broken.

A word whose translation is one or two words also keeps the answer side compact enough to
show the illustration, the translation and an example at once.
