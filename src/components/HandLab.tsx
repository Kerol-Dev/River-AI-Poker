import { BarChart3, FlaskConical, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { Card, CATEGORIES, RANKS, SUITS, parseCard } from '../engine/cards';
import { inRange, Range, RANGE_PERCENT } from '../engine/equity';
import { useStudy } from '../study/useStudy';
import { StudyCoach } from '../study/StudyCoach';
import { studyExamples } from '../study/examples';
import type { EquityInput } from '../study/equity';
import type { ActionRange } from '../study/range-model';
import { PlayingCard } from './Card';
import { pct } from './Coach';
export type Scenario = { hole: Card[]; board: Card[]; pot: number; call: number };
export const defaultScenario: Scenario = {
  hole: ['As', 'Qs'].map(parseCard),
  board: ['Js', 'Ts', '2d'].map(parseCard),
  pot: 40,
  call: 12,
};
export function HandLab({ initial, trials }: { initial: Scenario; trials: number }) {
  const [scenario, setScenario] = useState(initial);
  const [opponents, setOpponents] = useState(1);
  const [range, setRange] = useState<Range>('random');
  const [picker, setPicker] = useState<{ type: 'hole' | 'board'; index: number } | null>(null);
  const [action, setAction] = useState<ActionRange>('unknown');
  const [reserve, setReserve] = useState<number | undefined>();
  const input: EquityInput = {
    hole: scenario.hole,
    board: scenario.board,
    opponents,
    range,
    trials,
    situation: {
      actions: Array.from({ length: opponents }, (_, i) => (i === 0 ? action : 'unknown')),
      pressure: scenario.call / Math.max(0.01, scenario.pot - scenario.call),
    },
  };
  const equity = useStudy(input);
  const setBoard = (count: number) =>
    setScenario((s) => {
      const board = s.board.slice(0, count);
      const unused = Array.from({ length: 52 }, (_, i) => i).filter(
        (c) => ![...s.hole, ...s.board].includes(c),
      );
      while (board.length < count) board.push(unused.shift()!);
      return { ...s, board };
    });
  const chooseCard = (card: Card) => {
    if (!picker) return;
    setScenario((s) => ({
      ...s,
      [picker.type]: s[picker.type].map((c, i) => (i === picker.index ? card : c)),
    }));
    setPicker(null);
  };
  return (
    <>
      <div className="workspace-columns">
        <div className="left-column">
          <section className="panel scenario-panel">
            <div className="section-label">
              <span>
                <FlaskConical size={16} /> BUILD A SCENARIO
              </span>
              <button
                className="icon-button"
                title="Reset example"
                onClick={() => {
                  setScenario(defaultScenario);
                  setAction('unknown');
                  setRange('random');
                  setOpponents(1);
                  setReserve(undefined);
                }}
              >
                <RotateCcw size={15} />
              </button>
            </div>
            <div className="study-examples">
              <label htmlFor="study-example">Review an example</label>
              <select
                id="study-example"
                value=""
                onChange={(e) => {
                  const example = studyExamples[Number(e.target.value)];
                  if (example) {
                    setScenario(example);
                    setAction(example.action);
                    setRange('random');
                    setOpponents(1);
                    setReserve(undefined);
                  }
                }}
              >
                <option value="" disabled>
                  Choose a study hand…
                </option>
                {studyExamples.map((example, i) => (
                  <option key={example.name} value={i}>
                    {example.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="scenario-cards">
              <div>
                <span className="eyebrow">YOUR HAND</span>
                <div className="card-row">
                  {scenario.hole.map((c, i) => (
                    <PlayingCard
                      key={i}
                      card={c}
                      onClick={() => setPicker({ type: 'hole', index: i })}
                      label={`Change hole card ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
              <div className="scenario-board">
                <span className="eyebrow">COMMUNITY CARDS</span>
                <div className="card-row">
                  {Array.from({ length: 5 }, (_, i) => (
                    <PlayingCard
                      key={i}
                      card={scenario.board[i]}
                      onClick={
                        i < scenario.board.length
                          ? () => setPicker({ type: 'board', index: i })
                          : undefined
                      }
                      label={`Change board card ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="street-tabs">
              {[
                ['Preflop', 0],
                ['Flop', 3],
                ['Turn', 4],
                ['River', 5],
              ].map(([label, n]) => (
                <button
                  key={label}
                  className={scenario.board.length === n ? 'selected' : ''}
                  onClick={() => setBoard(Number(n))}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="muted small-text">
              Click a card to change it. New streets add editable example cards.
            </p>
            <div className="scenario-fields">
              <label>
                Total pot <span>chips, including opposing bet</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max="1000000"
                  value={scenario.pot}
                  onChange={(e) =>
                    setScenario((s) => ({
                      ...s,
                      pot: Math.max(0.01, Math.min(1000000, Number(e.target.value))),
                    }))
                  }
                />
              </label>
              <label>
                Amount to call <span>additional chips required</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max="1000000"
                  value={scenario.call}
                  onChange={(e) =>
                    setScenario((s) => ({
                      ...s,
                      call: Math.max(0, Math.min(1000000, Number(e.target.value))),
                    }))
                  }
                />
              </label>
              <label>
                Opponents <span>players still in the hand</span>
                <select value={opponents} onChange={(e) => setOpponents(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} opponent{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="panel range-panel">
            <div className="study-action">
              <label htmlFor="study-action">First opponent’s action</label>
              <select
                id="study-action"
                value={action}
                onChange={(e) => setAction(e.target.value as ActionRange)}
              >
                <option value="unknown">Unknown / no action assumed</option>
                <option value="call">Called</option>
                <option value="bet">Bet</option>
                <option value="raise">Raised</option>
              </select>
              <p className="micro muted">
                Choose the action from the hand you are reviewing. Other opponents stay unweighted.
                This does not infer a betting history.
              </p>
            </div>
            <div className="section-label">
              <span>OPPONENT RANGE</span>
              <span className="tiny-tag">{RANGE_PERCENT[range]}% TARGET</span>
            </div>
            <div className="range-tabs">
              {(['random', 'wide', 'balanced', 'tight'] as Range[]).map((r) => (
                <button
                  className={range === r ? 'selected' : ''}
                  key={r}
                  onClick={() => setRange(r)}
                >
                  {r === 'random' ? 'Any two' : r[0].toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            <div className="range-grid">
              {Array.from({ length: 169 }, (_, i) => {
                const row = Math.floor(i / 13),
                  col = i % 13,
                  a = 12 - row,
                  b = 12 - col + (row === col || row > col ? 13 : 0);
                const label = `${RANKS[12 - Math.min(row, col)]}${RANKS[12 - Math.max(row, col)]}${row === col ? '' : row < col ? 's' : 'o'}`;
                return (
                  <div
                    key={i}
                    title={`${label}: ${inRange(a, b, range) ? 'included' : 'excluded'}`}
                    className={`${inRange(a, b, range) ? 'included' : ''} ${row === col ? 'pair-cell' : ''}`}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
            <p className="micro muted">
              Illustrative preflop ordering, not a solved range. The baseline uses equal weights;
              action scenarios reweight these hands. Known cards are removed. Cutoff ties may
              slightly exceed the target. All opponents use this same assumption.
            </p>
          </section>
          <section className="panel distribution-panel">
            <div className="section-label">
              <span>
                <BarChart3 size={15} /> YOUR HAND AT SHOWDOWN
              </span>
            </div>
            <div className="distribution">
              {CATEGORIES.map((name, i) => (
                <div key={name}>
                  <span>{name}</span>
                  <div>
                    <i style={{ width: pct(equity.result?.distribution[i] || 0) }} />
                  </div>
                  <strong>{equity.result ? pct(equity.result.distribution[i]) : '…'}</strong>
                </div>
              ))}
            </div>
            <p className="micro muted">
              Your final hand category across sampled runouts, whether or not you win.
            </p>
          </section>
        </div>
        <StudyCoach
          {...equity}
          input={input}
          reserve={reserve}
          onReserve={setReserve}
          pot={scenario.pot}
          call={scenario.call}
        />
      </div>
      {picker && (
        <div className="modal-backdrop" onClick={() => setPicker(null)}>
          <section
            className="modal card-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2 id="picker-title">Pick a card</h2>
                <p>
                  Choose {picker.type === 'hole' ? 'hole' : 'community'} card {picker.index + 1}.
                  Cards already in play are dimmed.
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Close card picker"
                onClick={() => setPicker(null)}
              >
                <X size={20} />
              </button>
            </div>
            {SUITS.map((s, si) => (
              <div className="picker-row" key={s}>
                {Array.from({ length: 13 }, (_, ri) => si * 13 + 12 - ri).map((c) => (
                  <button
                    key={c}
                    aria-label={`${RANKS[c % 13]}${s}`}
                    disabled={
                      [...scenario.hole, ...scenario.board].includes(c) &&
                      scenario[picker.type][picker.index] !== c
                    }
                    className={`${si === 1 || si === 2 ? 'red' : ''} ${scenario[picker.type][picker.index] === c ? 'picked' : ''}`}
                    onClick={() => chooseCard(c)}
                  >
                    {RANKS[c % 13]}
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
