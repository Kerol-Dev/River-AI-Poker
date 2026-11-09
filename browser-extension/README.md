# River Table Companion 1.6

Load this folder through Chrome → Extensions → Manage extensions → Developer mode → Load unpacked. Pair with the code from River → Browser table → Connection. The only network destination is the local River bridge on `127.0.0.1:17864`.

After updating, reload this extension and refresh the poker tab between hands. Chrome’s extension manager must show **1.6.0**. Restart River to load its new interface, then copy its new pairing code. Loading an extension does not update already-injected scripts.

## Bet365 and any other site

- **Bet365** (`https://update-com.p365play.com/html5/*`) runs automatically with its dedicated reader: seats, usernames, bets, timers, sizing and automatic play.
- **Any other site:** open the table, click the River button and choose **Use River on this site**. Chrome asks once to allow that site and the frames inside it. River then starts on every visit until you turn it off in the same place.

On other sites River detects the table without a map. It reads cards from visible text (`A♠`, `10 ♣`), labels (`Ace of spades`), image file names (`As.png`, `ace_of_spades.svg`, `h10.svg`) and card classes (`rank-q suit-hearts`). It groups your hand, the board and face-down opponent hands by position, finds the pot label and the live Fold/Check/Call/Bet/Raise buttons, and ignores advance-action checkboxes. **Auto-map** places markers on what it found; drag a marker to pin your hand, the board, pot or buttons if a layout confuses it. When opponents' cards are not shown, set **Opponents in hand** on the panel. Automatic play stays Bet365-only.

Tables drawn as a single image (canvas) have no readable cards in the page. Use **Screen reader** in the River app for those: Automatic mode finds the cards by shape on your Mac.

## Manual and automatic modes

Manual mode is the default. Live reads visible table elements and calculates guidance. Mapping pauses guidance. Brief card transitions retain the last confirmed display for up to 1.4 seconds; retained cards do not authorize an action.

To use automatic mode yourself, open **Settings → Automatic play** on the browser toolbar. Enter a positive maximum amount per action, a total submitted-spend limit, and a maximum of 1–1,000 actions. Press **START AUTO**. Each action normally waits 0.9 seconds and revalidates the visible table immediately before one click. **STOP** or **Escape** stops the run. Hiding the poker tab, changing the table, mapping, reader pause, connection errors, and unreadable action amounts stop or suspend action. Runs expire after the selected 10, 30, 60 or 120 minutes and never resume automatically after refresh or restart.

The controller reads the Call price and can enter a calculated Bet/Raise target in the visible sizing field. It waits for the displayed action amount to confirm that exact target before one submission. It does not select an all-in preset, join a table, buy chips, rebuy, log in, or manage an account. The per-action cap supports amounts up to 1,000 in table currency. An optional check/fold deadline fallback acts only when the visible timer is at three seconds or less and analysis is late. Sitting out stops the run and requires manual resumption. The per-action and total caps apply to incremental chips submitted. A failed or unconfirmed click is not retried. The statistical model uses unknown or labelled heuristic opponent ranges and does not solve rake, future betting or side pots. Public usernames and action observations are stored locally; hidden cards never establish a bluff. Optional bluff candidates are separately enabled.

The compact reader shows cards, amounts, equity, suggested size, decision reasoning, session results and opponent observations. River can remain hidden in the background; quitting it disconnects the reader.

## Performance

River records stable preflop checkpoints from the visible hero stack plus posted chips. The running hand is excluded until a subsequent checkpoint. Record cash added/withdrawn at the latest checkpoint to correct net results, and enter a final settled balance when ending a session. Unrecorded cash movements and missed observations can affect estimates. Hover or drag the graph to read time, net and period P/L; arrow keys also scrub it. Reset graph archives the current session and starts a fresh baseline at the next stable checkpoint. The same controls appear in the app and native HUD. History stays on this Mac and can be exported. Sessions are separate across app launches and currency/seat changes.

## Verification

Automated tests use synthetic DOM fixtures and a simulated click callback. They cover timing, stale states, duplicate-click prevention, caps, stopping, visible-card selection, session accounting and display transitions. Live automatic wagering has not been exercised by the developer agent. The UI preview uses clearly labelled sample data, which is excluded from production builds.

## Cards and win chance

Card faces use vector suits and keep unchanged card nodes between readings. Estimated win chance stays visible before your turn whenever the cards and active opponents are fresh and readable. Equity includes your share of ties; it is not the same as outright win chance. A changed or stale hand clears the estimate until it is confirmed again.

A primary All In button is recognised as a call only when its amount equals the visible remaining stack and the opposing wager covers that stack. Heads-up pot odds exclude unmatched excess. Ambiguous amounts and unresolved multiway side pots pause with explicit reasons. All-in sizing presets are never treated as calls.

For other apps and canvas-drawn tables, use **Screen reader** in the macOS app. Automatic mode finds face-up cards by their white faces, reads each corner rank and classifies the suit by colour and shape; it reads the pot and live buttons from on-screen text. Manual maps remain available. Screen mode gives call/check/fold guidance only. See the [compatibility guide](../docs/compatibility.md).

## 1.4.1: amount entry and automatic-run status

Bet and raise amounts now use the field’s focus → decimal entry → input/change → blur edit cycle. River waits for the primary action button to echo the exact requested total; a clamped or unconfirmed value never authorises submission. The input editor does not press Enter or submit a form.

Briefly missing pot labels or seat details pause the run for up to 3.5 seconds instead of immediately reporting a different table. A fresh matching table reading starts a new action countdown. A confirmed identity change, prolonged unreadability, hidden tab, disconnection, sitting out or exhausted limit still stops the run. The original stop reason stays visible across the companion’s tabs until the next explicit start.

Validation includes the real entry helper against synthetic controlled fields and a fake-chip Chrome run. It does not establish live-client wager execution.

## 1.5.0: clearer outcome display

The Table tab now keeps outright wins, ties, estimated pot share, and call price separate in one compact row. Missing or stale win/tie readings show a dash. The new range-sensitivity model is available only in the app’s offline Hand Lab; browser decision and wagering logic are unchanged in this release.
