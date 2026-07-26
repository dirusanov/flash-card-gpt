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

## Testing Anki export and generation/loader state

See **TESTING_EXPORT_AND_UI_STATE.md** — there's no way to run a real Anki + AnkiConnect
instance here, so that side is verified by reading `ankiService.ts` against AnkiConnect's
documented API contract (HTTP 200 on every response regardless of success; `addNotes`
returns per-note `null` for rejections without touching the top-level `error` field).
Also covers the delayed-`setTimeout` loader-hiding pattern in `CreateCard.tsx` and why
comparing against `abortControllerRef` to guard it doesn't work (it's nulled out
synchronously before the timeout ever fires) — use `generationIdRef` instead.
