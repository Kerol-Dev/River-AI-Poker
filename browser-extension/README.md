# River Table Companion 1.4

Load this folder through Chrome → Extensions → Manage extensions → Developer mode → Load unpacked. Pair with the code from River → Browser table → Connection. The supported frame is `https://update-com.p365play.com/html5/*`; the only network destination is the local River bridge on `127.0.0.1:17864`.

After updating, reload this extension and refresh the poker tab between hands. Chrome’s extension manager must show **1.4.1**; the reader now has Table, Players, Session and Settings tabs. Restart River to load its new interface, then copy its new pairing code. Loading an extension does not update already-injected scripts.

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

For other apps and browser rooms, use **Screen reader** in the macOS app. It supports selected-window capture, draggable regions and local OCR. This extension remains scoped to its supported browser client; screen mode gives guidance only. See the [compatibility guide](../docs/compatibility.md).

## 1.4.1: amount entry and automatic-run status

Bet and raise amounts now use the field’s focus → decimal entry → input/change → blur edit cycle. River waits for the primary action button to echo the exact requested total; a clamped or unconfirmed value never authorises submission. The input editor does not press Enter or submit a form.

Briefly missing pot labels or seat details pause the run for up to 3.5 seconds instead of immediately reporting a different table. A fresh matching table reading starts a new action countdown. A confirmed identity change, prolonged unreadability, hidden tab, disconnection, sitting out or exhausted limit still stops the run. The original stop reason stays visible across the companion’s tabs until the next explicit start.

Validation includes the real entry helper against synthetic controlled fields and a fake-chip Chrome run. It does not establish live-client wager execution.
