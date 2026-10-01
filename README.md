# Vaulto Cards
![Logo](</src/assets/img/vaulto-cards-logo.png>)

Create high‑quality flashcards right from any web page. Select text, click the extension, and let AI do the heavy lifting: translation, examples, optimal fronts/backs, and even illustrative images.

## Demo

![Demo](</screenshots/demo.gif>)

Tip: Put your demo GIF at `screenshots/demo.gif` for this preview to work.

## Usage

1. Go to the webpage from which you want to create a flashcard.
2. Highlight the text you want to use to create a card.
3. Right-click and choose **Create card from "…"**, or press <kbd>Alt</kbd>+<kbd>C</kbd>. Clicking
   the Vaulto Cards icon in the toolbar opens the panel as well.
4. Follow the instructions to create and save your flashcard.

![Usage Example](</screenshots/lang-learn.png>)

## Features

- Instant card creation from selected text, via the context menu or a keyboard shortcut
- AI‑powered translation, transcription, examples, and card structure
- Smart image generation with consistent style (photorealistic or painting)
- Anki integration via AnkiConnect (optional)
- Optional Vaulto account to sync cards across devices

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

In order to use the AI functionality of Vaulto Cards, you will need to obtain an API key from OpenAI. Visit the [OpenAI website](https://www.openai.com/) and follow their instructions to sign up and get an API key.

## Anki Desktop and AnkiConnect

For optimal use of our extension, we recommend installing the Anki desktop app and the AnkiConnect extension. These tools will allow your Vaulto Cards extension to communicate with Anki, making it easier to manage your flashcards.

1.  Download and install [Anki desktop](https://apps.ankiweb.net/).
2.  Install AnkiConnect by following these steps:
    -   Open Anki on your computer.
    -   Go to the Tools menu and select Add-ons.
    -   Click on Get Add-ons.
    -   Paste the following code into the dialog box and click OK: `2055492159`.

For more information about AnkiConnect, visit the [AnkiConnect homepage](https://ankiweb.net/shared/info/2055492159).

## Extension Settings

The setup page opens by itself right after installation. You can reopen it any time from
`chrome://extensions` → Vaulto Cards → **Details** → **Extension options**, or from the Settings
tab inside the panel. Enter your OpenAI API key there and, optionally, the AnkiConnect settings.

![Extension Settings](</screenshots/settings.png>)

## Support

If you have any issues or questions, please create a GitHub [issue](https://github.com/dirusanov/flash-card-gpt/issues).
