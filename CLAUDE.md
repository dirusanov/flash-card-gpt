# Working in this repo

## Testing AI card quality (translation, examples, grammar note, transcription, image)

Don't try to test this by driving the extension in a browser — browser automation
cannot open `chrome://extensions` or `chrome-extension://...` pages, so there's no way
to reach the side panel/options/popup that way.

Instead use `utils/test-ai-cards/run.js`, which compiles the real generation pipeline
(`createCardComponentsParallel`) with `tsc` and runs it directly in Node against a real
OpenAI key. See **TESTING_AI_CARDS.md** for the full write-up: how to run it, the test
matrix (word/sentence/function-word/collocation × languages), what to actually judge in
the output, and known sharp edges (interface-language vs. studied-language mixups,
whitespace-based heuristics breaking on scripts without spaces like Chinese).
