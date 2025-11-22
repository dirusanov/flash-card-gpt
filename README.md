# Flash Cards + GPT
![Logo](</src/assets/img/logo.png>)

Create high‑quality flashcards right from any web page. Select text, click the extension, and let AI do the heavy lifting: translation, examples, optimal fronts/backs, and even illustrative images.

## Demo

![Demo](</screenshots/demo.gif>)

Tip: Put your demo GIF at `screenshots/demo.gif` for this preview to work.

## Usage

1. Go to the webpage from which you want to create a flashcard.
2. Highlight the text you want to use to create a card.
3. Click on the Flash Cards + GPT extension icon in the browser panel.
4. Follow the instructions to create and save your flashcard.

### Mode: Learning Language
![Usage Example 1](</screenshots/lang-learn.png>)

### Mode: General Topic
![Usage Example 2](</screenshots/gen-topic-sample.png>)

## Features

- Instant card creation from selected text
- AI‑powered translation, examples, and card structure
- Smart image generation with consistent style (photorealistic or painting)
- Anki integration via AnkiConnect (optional)

## Functionality

* **Creating flashcards on the fly:** You don't need to open a new tab or application to create cards. Just highlight the text and click on the extension icon.
* **Variety of topics:** Whether you're learning a foreign language, researching a medical term, or just want to memorize an interesting fact from history, you can create a card on any topic.
* **Using AI (GPT):** Our extension uses the latest achievements of artificial intelligence to optimize the process of creating cards.

## Installation and Build

1. Download and unpack the extension archive or clone the repository.
```sh
git clone git@github.com:dirusanov/flash-card-gpt.git
```
2. Open the terminal and navigate to the project directory.
```sh
cd flash-card-gpt
```
3. Install the necessary dependencies
```sh
npm install
```
4.  Build the project
```sh
npm run build
```
5. Open `chrome://extensions/` in Chrome.
6. Enable Developer mode.
7. Click “Load unpacked” and select the `build` folder.

## OpenAI API Key

In order to use the AI functionality of Flash Cards + GPT, you will need to obtain an API key from OpenAI. Visit the [OpenAI website](https://www.openai.com/) and follow their instructions to sign up and get an API key.

## Anki Desktop and AnkiConnect

For optimal use of our extension, we recommend installing the Anki desktop app and the AnkiConnect extension. These tools will allow your Flash Cards + GPT extension to communicate with Anki, making it easier to manage your flashcards.

1.  Download and install [Anki desktop](https://apps.ankiweb.net/).
2.  Install AnkiConnect by following these steps:
    -   Open Anki on your computer.
    -   Go to the Tools menu and select Add-ons.
    -   Click on Get Add-ons.
    -   Paste the following code into the dialog box and click OK: `2055492159`.

For more information about AnkiConnect, visit the [AnkiConnect homepage](https://ankiweb.net/shared/info/2055492159).

## Extension Settings

Once the extension is installed, you will need to configure it with your OpenAI API key and (optionally) AnkiConnect settings. To do this, click on the Flash Cards + GPT extension icon and go to the settings page.

![Extension Settings](</screenshots/settings.png>)

## Support

If you have any issues or questions, please create a GitHub [issue](https://github.com/dirusanov/flash-card-gpt/issues).
