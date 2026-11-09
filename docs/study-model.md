# Offline hand review · River 1.5

Open **Hand lab** and choose an example, or enter two hole cards, a legal board, the pot (including opposing bets), and the additional amount to call. Amounts are study chips. Review assumes the entire pot is eligible; use neither side-pot totals nor uncalled excess as an eligible pot.

Select the first opponent’s action explicitly. Other opponents remain unweighted in the action scenario. All opponents use the selected starting-range filter. No full action history is reconstructed, and no hidden cards are inferred.

## What the numbers mean

- **Win outright:** hero is the sole best hand.
- **Tie:** hero shares the best hand with at least one opponent.
- **Pot share:** outright wins plus the fraction of the pot received in ties. Multiway ties are divided by the actual number of winners.
- **Needed to call:** call / (pot + call), before rake or later betting.

For example, 4♥4♣ on A♥6♠7♣7♥6♦ plays the board. Against a uniformly random opponent, it never wins outright, ties about 67.4%, and has about 33.7% pot share. Facing a bet changes the relevant assumption: the study’s weighted and tighter ranges assign more weight to hands that beat the board. This is why the built-in review prefers folding at the example price. It is not proof of the opponent’s actual cards.

J♥5♥ on Q♥A♣7♠ has no pair and only backdoor draws. The example’s uniform-range equity is much higher than its equity under the selected raise scenario. The review prefers folding. A royal flush on the board is a counterexample to “zero wins always means fold”: a sufficiently cheap guaranteed split can be profitable before rake.

## Explicit assumptions

The baseline uses the existing illustrative starting-hand ordering, with equal weights within its cutoff. Cutoff ties can exceed the displayed target percentage.

Each action scenario weights compatible combinations by their made-hand percentile on the **current board**, plus a heuristic allowance for immediate flush and straight draws involving a hole card. Backdoor draws do not receive that allowance. Future runouts never determine an opponent’s prior weight.

Weights use `floor + (1 − floor) × strength^power`. The action floors are 0.35 for calls, 0.20 for bets and 0.10 for raises. The tighter scenario uses 0.06; the continuing scenario uses 0.025. Base powers are 2, 3 and 4 respectively, with one extra power for stress scenarios and up to 1.5 for price pressure. These choices are **uncalibrated sensitivity parameters**, not measured bluff frequencies or solver ranges. The pressure proxy is call / max(0.01, pot − call); it does not reconstruct the original bet size.

The displayed call comparison subtracts sampling allowance and a policy reserve from the lower of the action-weighted and tighter estimates. Default reserves are 5 percentage points preflop, 6 on the flop, 4 on the turn and 2 on the river, plus 5 for high card with no immediate draw and 1.5 per additional opponent. They can be changed in **Price, assumptions & limits**. They do not solve rake, equity realization or future betting. The result is a cautious comparison, not a statistically guaranteed lower bound on real-world equity.

The continuing range is shown for study. High equity against it does not automatically establish a profitable raise; response frequency, size, stacks, position and future actions need separate modeling. Hand Lab does not produce or publish a wager.

## Numerical method

Heads-up rivers enumerate all compatible opponent combinations with their scenario weights. “Exact” applies to the specified model, not knowledge of the opponent’s range. Other states sample independent weighted hole-card pairs, reject complete deals with collisions, then draw a uniform runout without replacement. This avoids assigning the same card twice and preserves the joint distribution conditioned on a legal deal.

Identical input produces identical Monte Carlo samples. Four scenario estimates use a Hoeffding allowance `sqrt(log(160) / (2 × trials))`, giving a simultaneous 95% sampling bound for the four pot-share means by a union bound. This says nothing about whether the chosen ranges match a real opponent. Win/tie figures and category distributions are point estimates; the allowance is not a confidence interval for them.

## Isolation and verification

The offline worker and review are under `src/study/`. Hand Lab calls that worker directly. The existing `src/engine/equity.worker.ts`, live reader strategy, bet-entry helper, and automation controller are unchanged. No study result is sent to the browser action bridge.

Regression checks cover both example hands, split-only calls, nuts, a cheap strong draw, multiway splits, normalized distributions, stable samples, exact river enumeration, price sensitivity, adjustable reserves, and invalid inputs. These checks validate implementation properties, not playing strength. There is no solver comparison, opponent calibration, or demonstrated long-run win rate.
