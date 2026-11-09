# Contributing to River

River is maintained by **kerol-dev**. Contributions are welcome under Apache-2.0.

## Local setup

Use Node 24, run `npm ci`, then `npm run dev`. The web app supports the lab, practice table and design previews. For the macOS app, run `npm run build:ocr` once, then `npm start`. Building the OCR helper requires Xcode Command Line Tools.

Before opening a pull request, run:

```sh
npm run format:check
npm test
npm run build
npm run release:check
# macOS only
npm run build:ocr
npm run test:ocr
```

## Where changes belong

- `src/engine/`: deterministic Hold’em rules, hand evaluation and equity sampling.
- `src/reader/`: browser observations, confidence, local profiles and history.
- `src/screen/`: screen mapping and conservative OCR parsing.
- `native/recognize.swift`: local Apple Vision text recognition.
- `browser-extension/`: supported-client DOM adapter and compact interface.
- `electron/`: authenticated bridge, selected-window capture and isolated IPC.

Keep game rules separate from capture and presentation. A future blackjack engine should implement its own state, validation and analysis. Do not route blackjack observations through Hold’em logic.

## Reader changes

Use synthetic fixtures. Include missing data, duplicated cards, disappearing buttons, stale readings and ambiguous amounts. Never resolve a failed OCR reading by silently guessing a suit or amount. Stop automatic actions when the source or state changes. A new client adapter needs its own visible-DOM fixtures and documented compatibility limits.

## Pull requests

Make focused changes and explain their user-facing effect. Keep screenshots free of real names, balances, account details and pairing codes. Do not commit local history, window captures, binaries, `.env` files or generated build output. Preserve the license and relevant attribution notices in distributions and derivatives.
