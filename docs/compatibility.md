# Compatibility and limits

| Feature                | Current support                                                     | Limits                                                                                         |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| App and floating HUD   | macOS; local Apple Silicon build verified                           | Public signed/notarized builds are not yet provided.                                           |
| Browser companion      | Chrome MV3, observed Bet365 Hold’em client                          | DOM layouts may change. Not affiliated with or endorsed by the operator.                       |
| Screen capture and OCR | Selectable macOS app windows, browser windows or displays           | Beta. Screen Recording permission required. Protected or unavailable windows may not capture.  |
| Cards in OCR mode      | Explicit rank + suit symbols or letters                             | Stylised or ambiguous suits are rejected. Colour alone never identifies a suit.                |
| OCR mapping            | Suggested label regions, drag-to-draw/move, import/export           | Suggestions are drafts. Recheck after resize, zoom, layout changes or window replacement.      |
| OCR table context      | Manually selected street and opponent count                         | Set them for the current hand. No automatic session accounting or username profiling from OCR. |
| Amounts in OCR mode    | One nonnegative decimal amount; optional € / £ / $; comma thousands | Decimal commas and mixed amounts require manual review.                                        |
| OCR decisions          | Hold’em call/check/fold comparison against unknown ranges           | No clicks, automatic sizing, side-pot solving or all-in advice.                                |
| Browser automation     | User-started runs on the supported adapter                          | Explicit caps, visibility and fresh-state checks. No universal automation claim.               |
| Other games            | Architecture prepared for separate engines                          | Blackjack is not available yet.                                                                |

“Any app” means that the screen reader can accept a selectable window without needing that app’s DOM. It does **not** mean every table design can be recognised correctly. River shows what it read and withholds guidance when required fields fail validation. It cannot detect every confident OCR mistake. Always inspect the reading.

Equity is conditional on assumed opponent hands, not a solved strategy. Guidance does not model rake, future betting, tournament ICM or arbitrary multiway side pots. Estimated session results are not account statements. Check the rules and permissions of any service where you use software assistance.
