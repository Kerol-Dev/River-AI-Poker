# Getting started

## Install

Download the latest release from GitHub: the `.dmg` for macOS (Apple silicon or Intel) or the `-windows-setup.exe` for Windows 10/11, plus the `chrome-extension.zip`. The builds are not notarised or code-signed yet: on macOS right-click River → **Open** the first time; on Windows choose **More info → Run anyway** if SmartScreen warns. On Windows, closing the window keeps River in the notification area; quit it from the tray icon.

## Run from source

1. Install Node 24 and, on macOS, Xcode Command Line Tools (`xcode-select --install`).
2. Clone the repository and run `npm ci`.
3. Run `npm run build:ocr` once to compile the local Apple Vision helper.
4. Run `npm start` to build and open River.

For the web practice UI, use `npm run dev`. The browser preview cannot capture other apps. To produce installers, use `npm run package:mac` (a `.app` and `.dmg` in `release/`) or, on Windows with Inno Setup 6, `npm run package:win` (a setup `.exe`). `npm run package:extension` zips the Chrome extension. Pushing a `v*` tag runs the release workflow, which builds all of them and publishes a GitHub release. Recipients of a packaged build do not need Swift or Node.

## Browser companion

1. In Chrome’s extension manager, enable Developer mode and load the `browser-extension` folder unpacked.
2. Open River → **Browser table → Connection** and copy the pairing code.
3. Open the River extension, paste the code and select **Connect to River**, then **Start reader**.
4. Bet365 starts automatically. For any other site, open the table, click the River extension button and choose **Use River on this site**, then allow the site when Chrome asks. River detects your cards, the board, pot and buttons by itself.
5. Refresh the poker page between hands after updating. Use **Settings → Map table** to adjust regions, or **Auto-map** to restore detected anchors.
6. The **Table** tab shows the decision. **Players** contains observations, **Session** contains charts, and **Settings** contains mapping and optional run limits.

On updates, reload the extension and refresh the table between hands. Restarting River changes the pairing code. Closing its main window keeps calculations running in the background; quitting River stops the bridge. The extension alone does not calculate equity.

## Another app or poker room

1. Open **Screen reader → Choose a window** in River.
2. Select the window you intend to read. macOS may request Screen Recording permission. If denied, enable River in System Settings → Privacy & Security → Screen Recording, then restart River.
3. Keep **Automatic** selected, set the number of opponents still in the hand, then choose **Start reading**. River finds the face-up cards by shape, reads the pot and buttons from on-screen text, and sets the street from the board.
4. Review the recognised cards and amounts. Guidance appears after two matching high-confidence readings. Use **Show recognised text** to diagnose a misread. If the design cannot be read, enlarge the table; River will not invent missing data.
5. For an unusual layout, switch to **Manual map**: choose **Find regions** for a draft, draw or drag regions for your cards, community cards, total pot, call amount and action buttons, confirm the map, set the street, and start reading.

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
