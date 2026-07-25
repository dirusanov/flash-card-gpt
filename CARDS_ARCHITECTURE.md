# Cards, study and sync — how it works

Reference for the Cards side-panel experience: where a card lives, how it is edited and
studied, and how progress travels between the extension and the mobile app
(`../vaulto-cards`). Written after the redesign described at the end of this file.

---

## 1. The mental model

A card has **two independent destinations**. Conflating them was the single biggest
source of confusion, so the UI keeps them visibly separate:

| | Vaulto Cloud | Anki / file |
|---|---|---|
| What it is | Where the card **lives** — automatic backup + sync | A **one-way exported copy** |
| When it happens | On every save/edit, silently, when signed in | Only when you press *Send to Anki* / *Export* |
| Shown as | One global status icon; per-row only when *not* synced | A quiet `Anki` tag on the row |
| Data | `syncId`, `syncVersion`, `syncPending`, `deckId` | `exportStatus`, `ankiDeckName` |

**Cloud sync never sets `exportStatus`.** A card can be fully backed up and still be
"not in Anki" — that is the correct state, not a bug.

Studying adds a third axis, `srsState`, which is orthogonal to both.

---

## 2. Cards screen (`src/components/StoredCards.tsx`)

One plain, searchable list — newest first. There are **no export tabs**; export is an
action, not a filter (see §11).

Toolbar, top to bottom:

- **Search + cloud icon.** The icon is the whole sync status: green cloud = everything
  backed up, spinner = still syncing (count in the tooltip), accent cloud = signed out.
  Clicking it goes to Settings (signed in) or the auth screen (signed out).
- **Deck chips** — `All` plus one chip per Vaulto deck with counts. Only when signed in
  and more than one deck exists. Cards with no explicit `deckId` are counted under the
  **default deck** (`Vaulto Cards`), because that is where they physically land.
- **Row of actions** — card count, 📊 statistics, ▶ **Study** (with the due count), and
  *Select* for bulk mode.

A row shows front/back, an `Anki` tag if exported, a faint cloud **only** if the card has
not reached the cloud yet, and its age. Tapping a row opens the preview.

---

## 3. Viewing and editing a card

Both use the same component, `src/components/StoredCards/StudyCard.tsx`, so editing never
drops you into a different-looking screen.

- **Preview (read mode)** — a real 3D flip card mirroring the mobile `FlashCard`: white
  front with the word, transcription and audio; mint back with image, translation,
  Grammar Reference and examples. Footer carries the destination chips (tap to change
  deck), *Send to Anki* and *Edit card*.
- **Edit mode** (`editable`) — the same mint card with fields in place. All multi-line
  fields use `src/components/ui/AutoTextarea.tsx`, which grows to fit so nothing is ever
  clipped.

Both the preview and the editor can change the deck and export to Anki — you do **not**
have to enter edit mode to do either. The deck picker is one component driven by
`deckPickerFor: 'edit' | 'preview' | null`.

Edits **auto-save** (debounced 800 ms) and, when signed in, auto-sync. There is no Save
button; *Done* just closes.

When export is unavailable the button is replaced by a line saying why, with the fix:
`Anki export is off.` / `Anki isn't responding.` → **Open Settings**; `No Anki deck picked
yet.` → **Pick deck**.

### Grammar reference

`src/services/grammar.ts` + `src/components/grammar/GrammarCard.tsx`. Grammar is stored as
plain `emoji label: value` lines (legacy HTML is still parsed), rendered as chips and
edited as labelled fields. **Never** as raw HTML.

---

## 4. Instruction composer — model-routed, no keywords

`src/components/StoredCards/InstructionComposer.tsx` + `src/services/instructionRouter.ts`.

You type a change in plain language. `planInstruction()` asks the model which parts of the
card that touches and returns:

```ts
{ actions: ('image'|'examples'|'translation'|'audio'|'grammar'|'rebuild')[], detail: string }
```

The actions are then executed in order. **There is no keyword matching anywhere** — lists
like `includes('картин')` only ever recognised the phrasings someone enumerated. On any
failure the fallback is `rebuild`, which honours any request.

The same router is used by `CreateCard.handleApplyCustomInstruction`.

---

## 5. Study — SM-2, identical to the phone

`src/services/srs.ts` is a **direct port** of `../vaulto-cards/src/services/sm2.ts`.
Coefficients must stay identical or a card studied in both places drifts onto two
schedules.

| Grade | Interval | Ease |
|---|---|---|
| again | reset, due in 10 min | −0.20 |
| hard | × 1.2 | −0.15 |
| good | 1 d → 6 d → × ease | 0 |
| easy | 4 d → 8 d → × ease × 1.3 | +0.15 |

Min ease 1.30, start 2.50. Verified sequence from a new card:
`good→1d, good→6d, good→15d, easy→49d (ease 2.65), hard→59d (ease 2.50), again→10min
(ease 2.30, reps 0, lapses 1)`.

**Session** (`src/components/StoredCards/StudySession.tsx`): progress bar → *Show answer*
→ four rating buttons with interval previews (`RatingButtons.tsx`). `Again` re-queues the
card at the end of the session. Finishes with a Good/Easy · Hard · Again summary.

*Study* studies what is **due** in the current view (deck filter + search); if nothing is
due it falls back to the whole selection.

---

## 6. Statistics

`src/services/reviewLog.ts` (`computeStats`) ports the mobile `useStats` hook;
`src/components/StoredCards/StatsPanel.tsx` renders the same six blocks:

1. **Today's queue** — due + overdue, new, estimated time (avg response time × queue,
   defaulting to 5 s before there is data).
2. **Consistency** — current streak (breaks only after a full missed day), days active
   this week, best day.
3. **Card progress** — new (0 reps) → learning (≤2 reps) → reviewing (<21 d) → mature.
4. **Activity** — 91-day heatmap, emerald ramp scaled against a floor of 10.
5. **Answer quality** — 14 days, good/easy vs hard/again.
6. **Forecast** — cards due over the next 14 days.

Review logs are stored locally under `vaulto_review_logs` and capped at 20 000 entries.

---

## 7. Cross-device sync — two channels

This is the part that is easy to get wrong: **content and schedule travel separately.**

| | Endpoint | Shape |
|---|---|---|
| Card content | `GET/POST/PATCH /notes` | `fields_json` (front, back, examples, image, …) |
| Study schedule | `POST /sync/push`, `GET /sync/pull?cursor=` | `entity_type: 'card'` with **flat** columns |
| Review history | `POST /sync/push` | `entity_type: 'review_log'` |

`src/services/srsSync.ts` speaks the second channel, exactly as
`../vaulto-cards/src/services/syncManager.ts` does:

```jsonc
// card
{"entity_type":"card","op":"upsert","entity_id":"<note id>","payload":{
  "deck_id":"…","front":"…","back":"…",
  "due_at":"…","interval_days":1,"ease_factor":2.5,"repetitions":1,"lapses":0}}
// review_log
{"entity_type":"review_log","op":"upsert","payload":{
  "card_id":"<note id>","client_review_id":"<log id>","grade":"good",
  "reviewed_at":"…","response_time_ms":4200}}
```

Envelope: `client_id: 'vaulto-extension'`, `platform: 'web'`. Verified against
`services/cards_sync_service/app/presentation/api/routes/sync.py`:

- `platform` is a free-form `str(min 1, max 32)`, so `'web'` is accepted.
- `entity_id` is typed `UUID | None` — it must be the note id, not our guid.
- `_apply_card_change` reads **only** `due_at`, `interval_days`, `ease_factor`,
  `repetitions`, `lapses`. `front`/`back` are ignored (the card row has no such
  columns); we send them only to stay byte-compatible with the mobile client.
- A card the server does not have yet is skipped silently, mirroring our own skip for
  cards without a `syncId`.
- `client_review_id` and `card_id` are parsed with `UUID(...)`, and a parse failure makes
  the log **silently dropped** — which is why review log ids are real UUIDs.
- Review logs de-duplicate on `client_review_id`, so a re-push is harmless.

**Identity trap.** The server keys cards by the **note id**. Locally that is
`StoredCard.syncId`; `StoredCard.id` is our own guid. Pushing `id` would create orphan
rows. A card with no `syncId` has never been uploaded and is skipped entirely.

**Why `fields_json.srsState` is not enough.** The extension also writes `srsState` into
`fields_json`, but the mobile app's `noteToCard` (`context/DecksContext.tsx`) hardcodes
`srsState: createInitialSrsState()` and never reads it. That field is therefore only a
local reinstall backup — the `/sync` channel is what actually crosses devices.

- **Push** happens after each grade, best-effort: a failure is logged as
  `Failed to push review to Vaulto Cloud:` and never costs the user their review.
- **Pull** runs when the Cards screen opens while signed in, paginating 200 at a time and
  storing the cursor in `vaulto_srs_sync_cursor`. Its payload carries SRS only, so it is
  merged onto existing cards and creates nothing.
- `interval_days` is rounded to whole days (a sub-day "again" becomes `0`); the real
  10-minute delay lives in `due_at`. Mobile rounds identically.

### Other sync notes

- Login forces `autoSaveToServer = true` (`cardsSyncMiddleware.ts`).
- Merge keeps local `exportStatus`/`ankiDeckName`, and uses
  `srsState: remote.srsState ?? local.srsState` so an older note without a schedule cannot
  silently reset a card to "new".
- `updateNote` sends `deck_id`, **but only when the card has an explicit local deck**.
  The deck resolution falls back to the default deck, and since the server honours
  `deck_id` on update, sending that fallback would drag a card filed elsewhere (on the
  phone, say) back into the default deck on the next edit. No local deck means "no
  opinion" — the server keeps its own.
  This required a matching backend change: `NoteUpdateDTO.deck_id` plus, in
  `update_note`, moving the note *and its cards* and logging a `card` sync change for
  each, so other devices learn about the move.

---

## 8. Decks — Vaulto vs Anki

`src/components/CreateCard/DeckSelector.tsx` shows two clearly different sections:

- **Vaulto** (white, app logo) — *"Saved here automatically and synced to your phone."*
  Deck rows with a checkmark; the first row is the real default deck named
  **`Vaulto Cards`** (exported as `DEFAULT_DECK_NAME` from `cardsSyncService.ts`), not a
  misleading "(None) — Local Storage Only". Inline **New deck** creation.
- **Anki** (muted) — *"Optional. Where a copy goes when you export."* First row is
  *Don't export*. A deck selected while Anki was running but now offline is still shown,
  flagged `Offline`.

Picking an Anki deck **no longer** silently creates a matching cloud deck — that was the
source of unexplained Vaulto decks.

`DeckDestination.tsx` summarises both as chips (`[logo] Vaulto Cards · [🖥] Japanese`);
the service icon carries the service name so the deck name never repeats it. The Anki chip
hides when AnkiConnect is off or unreachable.

---

## 9. Storage keys

| Key | Contents |
|---|---|
| `anki_stored_cards` | the cards themselves |
| `vaulto_review_logs` | review history for statistics |
| `vaulto_srs_sync_cursor` | last applied `/sync/pull` cursor |
| settings (incl. `selectedBackendDeckId` / `selectedBackendDeckName`) | `settingsPersistence.ts` |

---

## 10. File map

```
services/
  srs.ts                 SM-2 engine (port of mobile sm2.ts)
  reviewLog.ts           review log storage + computeStats (port of useStats)
  srsSync.ts             /sync/push + /sync/pull client, cursor
  instructionRouter.ts   model-driven intent routing
  grammar.ts             structured grammar parse/serialize
  cardsSyncApi.ts        /notes + srsSyncApi
  cardsSyncService.ts    note<->card mapping, DEFAULT_DECK_NAME
components/
  StoredCards.tsx                 list, filters, preview/edit, export, study entry
  StoredCards/StudyCard.tsx       flip card, also the in-place editor
  StoredCards/StudySession.tsx    SRS session
  StoredCards/RatingButtons.tsx   again/hard/good/easy + previews
  StoredCards/StatsPanel.tsx      six statistics blocks
  StoredCards/InstructionComposer.tsx
  CreateCard/DeckSelector.tsx     Vaulto + Anki destinations
  CreateCard/DeckDestination.tsx  one-line summary
  ui/Modal.tsx, ui/Button.tsx, ui/AutoTextarea.tsx
```

`ui/Modal.tsx` keeps a module-level stack of open modals so only the **topmost** reacts to
Escape and traps Tab, and it holds `onClose` in a ref — otherwise the focus effect re-ran
on every keystroke and stole the caret after one character.

---

## 11. Decisions worth not re-litigating

- **Export tabs removed.** `All / Not exported / Exported` are gone; one searchable list
  remains. Export is a fire-and-forget action (Anki de-duplicates), so it does not deserve
  navigation, a cloud-persisted flag, or an "un-export" control.
- **`exportStatus` stays local.** It is deliberately not written to `fields_json`
  (`noteToStoredCard` hardcodes `not_exported`) — it only matters on the machine that has
  Anki.
- **Per-card sync status removed** from the editor footer: one global indicator is enough.
- **No keyword intent routing.** See §4.

## 12. Known gaps

- **No live end-to-end run has been observed.** Every payload, endpoint, id type and
  validation rule has now been checked against the backend source, and the client was
  exercised with a recorded transport — but no real request to
  `api-cards.vaultonote.com` has been watched. Browser automation cannot open
  `chrome-extension://` pages; verify in the side panel's own DevTools (Network, filter
  `sync`: `GET /sync/pull` on opening Cards, `POST /sync/push` after a grade, expect
  `200` and `{"applied": 2}`).
- **A brand-new card may skip its first push** — it has no `syncId` until it reaches the
  cloud. The schedule catches up on the next grade.
- **Statistics are per-device.** The extension pushes review logs but never pulls
  `review_log` entities back (the pull only enriches `card` entries), so streaks and
  heatmaps do not merge with the phone's.
