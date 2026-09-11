# Testing Anki export (file + AnkiConnect) and generation/loader state

Companion to TESTING_AI_CARDS.md, which covers AI content quality. This one covers the
other two things worth re-checking after touching export or the card-generation flow:
whether a card actually lands in Anki, and whether the "generating card..." loader
tracks reality.

## AnkiConnect export

There's no way to spin up a real Anki desktop + AnkiConnect instance in a sandboxed
agent environment, so this can't be verified with an automated script the way AI card
quality can. What worked instead: read `src/services/ankiService.ts` against
AnkiConnect's **documented API contract** (its GitHub README is authoritative) and check
every response is actually validated the way the protocol requires:

- **AnkiConnect always returns HTTP 200, even on failure.** Success/failure is signaled
  *only* through the JSON body's `error` field. Any code that checks `response.ok` and
  stops there (without also parsing the body and checking `error`) is not actually
  checking anything — grep for `.ok` in this file and make sure every one is followed by
  a `response.json()` + `result.error` check.
- **`addNotes` returns one entry per input note**: the new note ID on success, or `null`
  for a note that was rejected (almost always a duplicate, since this app always sends
  `allowDuplicate: false`). A per-note `null` does **not** populate the top-level `error`
  field — code that only checks `if (result.error) throw` will treat a batch where every
  note was a duplicate as a full success. Check the actual array contents, not just
  whether the call threw.
- `isAnkiDuplicateError` matches the exact string `"cannot create note because it is a
  duplicate"`. That message only ever comes from the singular `addNote`/`canAdd`
  actions — `addNotes` (plural, what this app uses) never produces it directly. If you
  want that detector to fire, either match on `null` entries in the results array, or
  have `createAnkiCards` synthesize that exact message when every note came back null
  (this is what the current fix does).
- When testing manually with a real Anki + AnkiConnect running: export the same card
  twice in a row. Before the fix, the second export showed a green "saved successfully"
  toast and marked the card exported even though nothing new was added to Anki. After
  the fix it should show a duplicate/partial-failure message instead.

### Note types: "Vaulto Basic" and "Vaulto Cloze"

Language cards no longer go to the stock `Basic` model. `createAnkiCards` first runs
`ensureNoteType` for **Vaulto Basic** (`Front`, `Back`, `Sentence`, `Source`) and, when
the "Cloze from the sentence" setting is on and at least one card has a sentence, for
**Vaulto Cloze** (`Text`, `Back Extra`, `Source`, `isCloze: true`). Two reasons for
owning the names: the sentence and the page get real fields, and stock names are
localised per Anki profile ("Basic" is not called "Basic" in a Russian profile), so
sending `'Basic'` was always a gamble.

- `ensureNoteType` = `modelNames` → `createModel` if missing; otherwise
  `modelFieldNames` → `modelFieldAdd` for each field a newer extension introduced. It
  never touches templates or CSS of an existing model, so user edits survive.
- If it fails (old add-on, collection locked) it returns `false` and the card goes to
  the model name the caller passed with the sentence and source folded into `Back`.
  The export must still succeed in that case.
- Cloze notes are a **second** `addNotes` batch after the cards' own. They never affect
  which cards count as exported: a cloze rejected as a duplicate (same sentence exported
  earlier) is just already there. `buildClozeText` returns `null` — no cloze — when the
  word cannot be found in its sentence or the sentence *is* the word.
- General-topic cards keep the stock model and `Front`/`Back` only.

The whole flow is exercised against a fake AnkiConnect (a `backgroundFetch` stub that
records every action and answers per-action) — fresh collection, existing model, model
missing a field, `createModel` refused, card without a sentence, cloze batch all
duplicates, general-topic passthrough. Reproduce by compiling `ankiService.ts` with
`tsc` (as `utils/test-ai-cards/run.js` does) and replacing `backgroundFetch` in
`require.cache` before requiring the compiled module.

## Card export to a `.txt` file (no AnkiConnect needed)

`performFileExport` in `StoredCards.tsx` builds Anki's plain-text import format
(`#separator:tab` / `#html:true` header + `front\tback` lines). Confirmed against Anki's
own manual (docs.ankiweb.net/importing/text-files.html):

- `#key:value` header lines are only special **at the top of the file** — a card whose
  front/back text happens to start with `#` later in the file is not currently confirmed
  to cause problems, but this isn't 100% nailed down either; if you see an exported card
  go missing on import, check this first.
- Anki's importer treats missing fields as blank and silently drops extra fields — not a
  concern here since export always emits exactly 2 tab-separated fields.
- A literal tab or newline inside a field corrupts the row (extra columns / split into
  multiple bogus "notes"). Both are stripped/converted before the line is written — if
  you touch `format_back_lang_learning` or `format_back_general`, make sure whatever they
  add still gets cleaned the same way before it's joined into the export line.

## Generation/loader state races

Card generation in `CreateCard.tsx` schedules delayed `setTimeout`s (up to a chained
1000+3000ms) to hide the "generating card..." loader once pending API work looks done,
instead of hiding it the instant the promise resolves. That delay is exactly the window
where a race can happen: cancel, or start a second generation, while one of these is
still pending, and see whether the loader does the right thing.

- **Don't compare against `abortControllerRef`** to detect "is this still the active
  generation" — every generation function nulls that ref out synchronously in its own
  `finally` block, which runs long before any of its delayed `setTimeout`s fire. A
  comparison against it will never match, and the loader will never hide. Learned this
  by shipping it once and re-reading the finally blocks afterward.
- Use `generationIdRef` instead (bumped at the start of every generation and in
  `handleCancel`) and compare it inside each delayed callback before touching loader
  state. If you add a new delayed-hide `setTimeout` anywhere in this file, it needs the
  same guard — grep for `generationIdRef.current !==` to see the existing pattern.
- Manual repro: start generating a card, then immediately hit Cancel (or start
  generating a different card) before ~1-4 seconds have passed. Before the fix, the
  loader could flicker off mid-generation, or the wrong generation's "no image needed"
  decision could apply to the new one.
