# Getting started

## Run from source

1. Install Node 24 and, on macOS, Xcode Command Line Tools (`xcode-select --install`).
2. Clone the repository and run `npm ci`.
3. Run `npm run build:ocr` once to compile the local Apple Vision helper.
4. Run `npm start` to build and open River.

For the web practice UI, use `npm run dev`. The browser preview cannot capture other apps. To produce a self-contained macOS app, use `npm run package:mac`; output goes to `release/River-darwin-<architecture>/River.app`. Recipients of a packaged build do not need Swift or Node.

## Browser companion

1. In Chrome’s extension manager, enable Developer mode and load the `browser-extension` folder unpacked.
2. Open River → **Browser table → Connection** and copy the pairing code.
3. Open the River extension, paste the code and select **Connect to River**, then **Start reader**.
4. Refresh a supported poker page between hands. Use **Settings → Map table** to adjust regions, or **Auto-map** to restore detected anchors.
5. The **Table** tab shows the decision. **Players** contains observations, **Session** contains charts, and **Settings** contains mapping and optional run limits.

On updates, reload the extension and refresh the table between hands. Restarting River changes the pairing code. Closing its main window keeps calculations running in the background; quitting River stops the bridge. The extension alone does not calculate equity.

## Another app or poker room

1. Open **Screen reader → Choose a window** in River.
2. Select the window you intend to read. macOS may request Screen Recording permission. If denied, enable River in System Settings → Privacy & Security → Screen Recording, then restart River.
3. Choose **Find regions** for a draft. Select a region type and drag across the preview to draw or replace that region. Drag an existing region to move it. Click its chip below the preview to remove it.
4. Map your cards, community cards, total pot, call amount and current action buttons. Include a visible numeric zero for a free check. Player/dealer regions are optional context and do not feed opponent profiling.
5. Set the current street and number of opponents still in the hand. Confirm your mapping, then choose **Start reading**.
6. Review the recognised cards and amounts. Guidance appears after two matching high-confidence readings. Use **Show recognised text** to diagnose a region. If the design cannot be read, enlarge the table or remap; River will not invent missing data.

Maps can be exported and imported. A saved map is a layout aid, not proof that a new table has the same geometry. Screen mode currently provides guidance only; it does not click controls or track session earnings.

## History and graphs

Hover or drag a chart to inspect checkpoints; arrow keys also move its cursor. Choose 10-minute/hourly periods for P/L bars. **Reset graph** archives the old session and starts a fresh baseline at the next confirmed hand boundary. Export browser history from the main app. Record cash movements so buy-ins or withdrawals are not mistaken for winnings.

## Troubleshooting

- **Waiting for River:** open the macOS app and pair again if it was restarted.
- **Cards hard to read:** keep rank and suit in the same mapped region; enlarge small or stylised cards.
- **Old decision disappears:** the reader deliberately clears guidance when the hand, price, source or confidence changes.
- **Window size changed:** select the window again and recheck the map.
- **All-in / side pot warning:** the generic OCR path requires manual review. The browser adapter supports only its verified cases.
- **Automatic action not acknowledged:** the run stops rather than resending a possible duplicate bet. Inspect the table yourself.
