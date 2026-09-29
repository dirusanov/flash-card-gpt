# Testing AI card quality (translation, examples, grammar note, transcription, image)

How to check that card generation is actually good — not just that the UI renders —
using a real OpenAI key and an agent (Claude Code or similar), without needing a human
to click through the extension by hand.

## Why not just drive the extension in a browser

Browser automation (e.g. Claude in Chrome) cannot navigate to `chrome://extensions`,
`chrome-extension://<id>/sidepanel.html`, or any other extension page — these are
treated as browser-internal URLs and automation tools refuse to load them. That means
there is no way to open the side panel, options page, or popup via automation, so you
can't paste an API key into Settings or trigger card creation from a script driving a
real browser.

## What to use instead

`utils/test-ai-cards/run.js` compiles the actual generation pipeline —
`src/services/aiServiceFactory.ts`'s `createCardComponentsParallel`, the exact function
`CreateCard.tsx` calls — to plain JS with `tsc`, and runs it directly in Node with a real
API key. This tests the real prompts and parsing, just outside the Chrome shell.

```bash
# API key via env var (never put it directly in chat — paste into a local file or env var)
OPENAI_API_KEY=sk-... npm run test:ai-cards

# or via a file path (keeps it out of shell history too)
node utils/test-ai-cards/run.js /path/to/key.txt

# custom test matrix (see run.js's DEFAULT_CASES for the shape)
node utils/test-ai-cards/run.js /path/to/key.txt utils/test-ai-cards/cases.custom.json
```

Results land in `utils/test-ai-cards/.results/<lang>_<kind>.json` (gitignored), with any
generated image saved alongside as a real `.png`/`.jpg` instead of a giant inline base64
string.

If you only need to check the grammar-note (`linguisticInfo`) generation specifically —
e.g. after touching `createQualityLinguisticPrompt` or its validator — use
`node utils/test-ai-cards/test-linguistic-modes.js /path/to/key.txt` instead. It calls
`createOptimizedLinguisticInfo` directly, skipping translation/examples/image/
transcription, so it's much cheaper for iterating on just that prompt.

## Test matrix

Cover each source language at 4 selection shapes, since they exercise different code
paths and prompts:

| kind | example | what it stresses |
|---|---|---|
| `noun` | `el gato`, `猫`, `con mèo` | concrete word — should also get an image under Smart mode |
| `sentence` | `Estoy aprendiendo español desde hace un año.` | translation must stay ONE coherent sentence, not glued alternates |
| `function-word` | `aunque`, `虽然`, `mặc dù` | abstract word — should NOT get an image; grammar note should say "conjunction" etc. |
| `collocation` | `de vez en cuando`, `马马虎虎`, `từ từ thôi` | multi-word idiom, not a full sentence |

Pick at least one language with no spaces between words (Chinese, Japanese, Thai) — a
lot of length/word-count heuristics in this codebase are Latin/whitespace-oriented and
silently misbehave for those scripts (see "Known sharp edges" below).

## What to actually judge in the output

For a user whose interface language is `ru` (or whatever `TARGET_LANGUAGE` is set to):

- **`linguisticInfo`** (grammar brief) — must be written in the *interface* language,
  not the language being studied. If you selected 猫 and the brief says "词性: 名词"
  instead of "Часть речи: существительное", that's the interface-language bug, not a
  one-off model mistake — check `createQualityLinguisticPrompt`'s call sites in
  `aiServiceFactory.ts` all pass `userLanguage`.
- **`transcription.userLanguageTranscription`** — must be in the *interface language's
  native script* (Cyrillic for `ru`), not the original script transliterated into Latin,
  and not garbled. `ENABLE_TRANSCRIPTION_VALIDATION` in `aiProviders.ts` gates an AI
  validator that's supposed to catch and retry wrong-script output — if it's silently
  returning `null` a lot, the underlying generation prompt likely needs a stronger
  worked example in `createTranscriptionPrompt` (its only example previously showed
  Latin-script output, which biased the model even for Cyrillic requests).
- **`translation`** — for `sentence` cases, must be ONE clean sentence. Multiple
  alternates joined by `, ` is fine for a `noun`/`function-word` (synonyms), but reads as
  a broken run-on for a full sentence.
- **`examples`** — should be natural, contextual sentences using the term, each with an
  accurate translation. This has consistently been the strongest part of the pipeline.
- **`hasImage`** — should be `true` for `noun`, `false` for `function-word`. `smart`
  image mode runs its own chat-completion call to decide; if it fails (including
  transient network errors), it silently falls back to "no image needed" — a real error
  and "the model judged no image needed" currently look identical to the user.

## Known sharp edges (check these still hold after further changes)

- `CreateCard.tsx`'s `analyzeSelectedText` decides "use this selection directly" vs.
  "show the word/phrase picker modal" partly by `selectedText.trim().split(/\s+/).length`.
  For scripts without spaces (Chinese, Thai, etc.) this always collapses to ~1
  regardless of actual length, so a whole paragraph could be treated as a single short
  phrase. It now also falls back to character length and recognizes full-width CJK
  sentence punctuation (`。！？`) when there's no whitespace at all — re-verify this if
  you touch that function, since the *rest* of it (2-word/3-word combination guessing,
  sentence-splitting for phrase candidates) is still whitespace-oriented and just
  degrades to AI-based extraction for those scripts rather than being fully fixed.
- The API-key-error classifier (`isApiKeyErrorMessage` in `aiServiceFactory.ts`) aborts
  the *entire* card on a match, instead of just the one failing component. Keep its
  indicator list narrow (specific phrases like `invalid api key`) — a bare word like
  `forbidden` also matches unrelated errors (e.g. a region-restricted request) and kills
  the whole card over what should be a single degraded component.

## Sandbox gotchas (only relevant if you're running this from a restricted/sandboxed shell)

- Node's built-in `fetch` (undici) does **not** read `HTTP_PROXY`/`HTTPS_PROXY` env
  vars. If outbound network only works through a local proxy, `run.js` already routes
  around this with `undici`'s `ProxyAgent` when those env vars are set — it's a no-op
  otherwise.
- A proxy with rotating/multiple exit IPs can produce intermittent
  `unsupported_country_region_territory` errors on some calls but not others in the same
  run. That's proxy/network noise, not a card-quality issue — rerun before concluding
  something is broken.
- TypeScript enums (e.g. `ModelProvider`) mean you can't just strip types with Node's
  native `--experimental-strip-types`; `run.js` shells out to the project's own `tsc`
  instead (see `utils/test-ai-cards/tsconfig.json`).
