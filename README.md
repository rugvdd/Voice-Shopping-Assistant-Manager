# Voice Cart — Voice Command Shopping Assistant

A voice-first shopping list manager with smart suggestions, built as a
dependency-free static web app (HTML/CSS/JS). No build step, no API keys —
open `index.html` and it works.

---

## 1. Quick start

**Option A — just open it**
Double-click `index.html`. It works standalone, but Chrome/Edge/Safari
restrict the microphone on `file://` pages in some cases, so:

**Option B — run a local server (recommended)**
```bash
cd voice-shopping-assistant
python3 -m http.server 8080
# then open http://localhost:8080
```
Voice recognition requires **HTTPS or localhost** — this is a browser
security rule, not something this app controls.

**Browser support:** Voice input uses the Web Speech API, which is
best-supported in **Chrome, Edge, and Safari** (desktop + mobile). Firefox
does not support `SpeechRecognition` yet — the app detects this and
automatically falls back to the text input box, so the whole feature set
still works by typing commands.

---

## 2. How it fulfills each requirement

| Requirement | Where it lives | Notes |
|---|---|---|
| Voice command recognition | `speech.js` | Wraps the native `SpeechRecognition` API |
| NLP / varied phrasing | `nlp.js` | Rule-based intent parser, see §3 |
| Multilingual voice input | `speech.js` + language `<select>` in header | 9 languages preloaded; recognition language is set live |
| Product recommendations ("running low") | `data.js: getRunningLowSuggestions()` | Simulated purchase-history cycle model |
| Seasonal recommendations | `data.js: getSeasonalSuggestions()` | Month-keyed seasonal catalog |
| Substitutes | `data.js: SUBSTITUTES`, triggered in `app.js: maybeOfferSubstitute()` | Fires automatically after a relevant item is added |
| Add / remove / modify items | `app.js: addItem / removeItemByName / modifyQuantity` | All voice- and text-driven |
| Auto-categorization | `data.js: categorize()` | Keyword-rule based, groups the list visually |
| Quantity management | `nlp.js: extractQuantity()` | Handles digits ("2") and words ("a dozen", "a couple") |
| Voice-activated search | `nlp.js` SEARCH intent + `app.js: runSearch()` | Opens a bottom-sheet results panel |
| Price range filtering | `nlp.js` `SEARCH_PRICE` pattern, `data.js: searchCatalog()` | "find toothpaste under $5" |
| Minimalist UI | `index.html` / `styles.css` | Single-column, mobile-first, one primary action (the mic) |
| Visual/real-time feedback | `#transcriptFeed` ("receipt tape") | Shows interim (in-progress) and final recognized text plus the resulting action, live |
| Mobile / voice-only optimized | `styles.css` | 480px-capped mobile-first layout, large tap targets, text fallback for accessibility |
| Hosting | See §6 | Any static host works: Firebase Hosting, AWS S3+CloudFront, GitHub Pages |

---

## 3. Approach: how the NLP works

Full ML-based NLU (like Dialogflow or an LLM call) is overkill for a client
whose entire vocabulary is "add/remove/find X, quantity Y" — and it would
require a backend, an API key, and network calls on every command. Instead
`nlp.js` uses an **ordered pattern table**: each intent (ADD, REMOVE,
MODIFY_QTY, SEARCH, SEARCH_PRICE) has a regex tuned to match many common
phrasings —

- "add milk" / "I need apples" / "I want to buy bananas" / "get some bread"
  / "we're out of butter" → all resolve to the same `ADD` intent.
- "remove milk from my list" / "delete apples" / "take eggs off the list" → `REMOVE`.
- "change milk to 3" / "update quantity of eggs to 6" → `MODIFY_QTY`.
- "find organic apples" / "find toothpaste under $5" → `SEARCH` (with an
  optional price ceiling).

A quantity extractor runs on the remaining text and understands both
digits ("2 bottles of water") and number words ("a dozen eggs", "a couple
of onions"), then strips filler ("please", "to my list", "of") to isolate
the clean item name.

**Everything talks to `parseCommand(text) -> {intent, item, qty, ...}`.**
That single function is the contract the rest of the app depends on, so
swapping this rule-based layer for a cloud NLU service or an LLM call later
is a drop-in replacement — nothing in `app.js` would need to change.

## 4. Approach: smart suggestions

Three independent signals feed the suggestion tray (`app.js: renderSuggestions`):

1. **Running low** — `data.js` simulates a purchase history with a
   `typicalCycleDays` per staple (e.g. milk every 7 days). If today is past
   ~85% of that cycle since the last purchase, it's suggested. In
   production this would be a query against real order history.
2. **Seasonal** — a month-keyed lookup table of what's in season, standing
   in for a real merchandising/promotions feed.
3. **Substitutes** — a static map of common swaps, shown as an inline tip
   right after a relevant item is added (not a nag — dismissible, and only
   shown once per add).

Suggestions are de-duplicated against the current list and against
anything the user has dismissed in the session.

## 5. Error handling & loading states

- **No microphone / permission denied / no speech detected** → caught in
  `speech.js: _handleError` and surfaced as a toast with plain-language
  text, not a raw browser error.
- **Unsupported browser** (no `SpeechRecognition`) → detected on load;
  the mic button explains it and the text input becomes the primary path.
- **Unparseable command** → logged in the transcript feed as an error line
  and spoken back ("Sorry, I didn't catch that") instead of failing silently.
- **Listening state** → the mic button morphs into an animated waveform
  and the status label updates ("Tap to speak" ⇄ "Listening…") so it's
  never ambiguous whether the app is capturing audio.
- **Empty list** → explicit empty state with a hint, instead of a blank screen.

## 6. Deployment

This is a static site (`index.html` + `styles.css` + 4 `.js` files) — any
static host works. **Voice recognition requires HTTPS**, which all of the
options below provide automatically.

**Firebase Hosting** (fits the "manage voice interactions" brief well
since Firebase also offers Auth/Firestore if you later persist lists
server-side):
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose this folder as the public directory
firebase deploy
```

**AWS**: upload the folder to an S3 bucket with static website hosting
enabled, put CloudFront in front of it for HTTPS + a CDN, done.

**Fastest option for a demo**: drag the folder onto
[Netlify Drop](https://app.netlify.com/drop) or push it to a GitHub repo
and enable GitHub Pages.

## 7. File structure

```
voice-shopping-assistant/
├── index.html      # markup, layout regions
├── styles.css       # design system + responsive styles
├── data.js         # mock catalog, seasonal/substitute/history data
├── nlp.js          # intent parser (parseCommand)
├── speech.js       # Web Speech API wrapper (recognition + synthesis)
├── app.js          # state, rendering, event wiring
└── README.md       # this file
```

## 8. Known limitations (and how to extend)

- **Purchase history and catalog are mocked** in `data.js`. Swap the
  functions in that file for real API calls (Firestore, DynamoDB, your own
  backend) — nothing else needs to change, since the rest of the app only
  calls the exported function names.
- **NLP is rule-based**, not statistical — it covers the phrasings in the
  brief plus common variants, but very unusual phrasing may fall through
  to "didn't understand." The `parseCommand` contract makes it
  straightforward to replace with a cloud NLU/LLM call later.
- **No persistence** — the list resets on page reload by design (no
  backend in this MVP). Add `localStorage` or a Firestore write in
  `app.js: render()` to persist it.
- **Voice recognition accuracy** depends entirely on the browser's engine;
  quality varies by language (see §1 for supported browsers).
