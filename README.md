# Vaulto Cards
![Logo](</src/assets/img/vaulto-cards-logo.png>)

Turn words and phrases from web pages into vocabulary flashcards with translation and examples. Save them locally, review with spaced repetition in the browser, or export them to Anki.

**Start without an account or API key.** Vaulto provides a limited number of free AI cards;
the composer shows how many remain. The **All features** overview is visible before setup,
with links to images, audio, review, editing, Anki and sync. The **Image** control shows whether
images are available in free cards; otherwise add your own OpenAI API key. Advanced generation
controls use your own key. Free generation requires an internet connection and server availability.

## Demo

![Demo](</screenshots/demo.gif>)

## Usage

1. Go to the webpage from which you want to create a flashcard.
2. Highlight the text you want to use to create a card.
3. Right-click and choose **Create card from "…"**, or press <kbd>Alt</kbd>+<kbd>C</kbd>. Clicking
   the Vaulto Cards icon in the toolbar opens the panel as well.
4. Check the translation language, press **Create card**, then **Save card**.
5. Try the first review. Open **Cards** to review your saved vocabulary; the tab shows
   how many cards are ready. Anki and a Vaulto account are optional.

The welcome page also has a sample word, so you can try a card before choosing a web page.
Direct selection in Chrome's built-in PDF viewer and on browser/system pages is not supported.
You can paste a word or phrase into the composer instead.

![Usage Example](</screenshots/lang-learn.png>)

## Features

- Instant card creation from selected text, via the context menu or a keyboard shortcut
- AI‑powered translation, transcription, examples, and card structure
- Smart image generation with consistent style (photorealistic or painting)
- Anki integration via AnkiConnect (optional)
- Optional Vaulto account to sync cards across devices
- Free introductory cards without signing in or configuring an AI key
- Local card storage and spaced repetition in the browser

**No picture?** In the own-key composer, **Image → Smart** intentionally skips abstract words.
Choose **Every card** to request images for them as well. In the free composer, image availability
is reported by the server. Failed image requests keep the text card and show a warning.

Cards are currently built for **language learning**. An earlier general-topic mode is present in
the codebase but disabled; the panel always runs in language-learning mode.

## Installation and Build

1. Download and unpack the extension archive or clone the repository.
```sh
git clone https://github.com/dirusanov/flash-card-gpt.git
```
2. Open the terminal and navigate to the project directory.
```sh
cd flash-card-gpt
```
3. Install the necessary dependencies
```sh
npm install
```
4. Build the project
```sh
npm run build
```
For store uploads, use the generated `build.zip` in the project root. Its `manifest.json`
is at the root of the archive; do not zip the `build` folder yourself.
5. Open `chrome://extensions/` in Chrome.
6. Enable Developer mode.
7. Click “Load unpacked” and select the `build` folder.

## OpenAI API Key

An API key is optional for the free introductory cards. Add your own key in Settings to
continue beyond the free allowance and use advanced generation, including images.
Your provider bills this usage separately; installing the extension does not include
unlimited AI generation.

## Anki Desktop and AnkiConnect

To export directly into Anki, install Anki Desktop and the AnkiConnect add-on. Anki must
be running when you connect or export. You can also save and review cards in the browser
without installing Anki.

1.  Download and install [Anki desktop](https://apps.ankiweb.net/).
2.  Install AnkiConnect by following these steps:
    -   Open Anki on your computer.
    -   Go to the Tools menu and select Add-ons.
    -   Click on Get Add-ons.
    -   Paste the following code into the dialog box and click OK: `2055492159`.

For more information about AnkiConnect, visit the [AnkiConnect homepage](https://ankiweb.net/shared/info/2055492159).

## Extension Settings

The welcome page opens right after installation and lets you create your first free card.
You can reopen settings any time from
`chrome://extensions` → Vaulto Cards → **Details** → **Extension options**, or from the Settings
tab inside the panel. Add an OpenAI key or configure AnkiConnect only when you want those features.

![Extension Settings](</screenshots/settings.png>)

## Support

If you have any issues or questions, please create a GitHub [issue](https://github.com/dirusanov/flash-card-gpt/issues).
