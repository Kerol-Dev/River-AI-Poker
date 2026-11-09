import { Bot, ChevronRight, CirclePause, Play, RotateCcw, Spade, Timer } from 'lucide-react';
import { Action, Game, legal } from '../engine/game';
import { PlayingCard } from './Card';
export function Table({
  game,
  auto,
  setAuto,
  raise,
  setRaise,
  onAct,
  next,
  ready,
  thinking,
}: {
  game: Game;
  auto: boolean;
  setAuto: (v: boolean) => void;
  raise: number;
  setRaise: (v: number) => void;
  onAct: (action: Action, target?: number) => void;
  next: () => void;
  ready: boolean;
  thinking: boolean;
}) {
  const options = legal(game),
    isHero = game.actor === 0 && !game.complete;
  const canAct = isHero && !auto;
  const hero = game.players[0],
    villain = game.players[1];
  const target = Math.max(options.min, Math.min(options.max, raise));
  const canNext = game.players.every((p) => p.stack > 0);
  return (
    <section className="table-panel panel">
      <div className="table-toolbar">
        <div>
          <span className="live-dot" /> THE PRACTICE ROOM <span className="divider" />{' '}
          <span className="muted">Heads-up NLHE</span>
        </div>
        <span className="small-text muted">Blinds 1 / 2</span>
      </div>
      <div className="poker-stage">
        <div className="felt">
          <div className="felt-inner" />
          <div className="felt-brand">
            <Spade size={21} fill="currentColor" /> RIVER <span>HOLD’EM STUDIO</span>
          </div>
        </div>
        <div className="table-corner">
          <span>HAND #{String(game.id).padStart(3, '0')}</span>
          <span>{game.street.toUpperCase()}</span>
        </div>
        <div className={`seat villain ${game.actor === 1 && !game.complete ? 'active-seat' : ''}`}>
          <div className="seat-avatar bot-avatar">
            <Bot size={23} />
          </div>
          <div className="seat-info">
            <strong>
              Atlas <span className="seat-tag">BOT</span>
            </strong>
            <span>
              {villain.stack.toLocaleString()} <small>chips</small>
            </span>
          </div>
          {game.button === 1 && <span className="dealer">D</span>}
          <div className="seat-cards">
            <PlayingCard card={villain.hole[0]} hidden={!game.showdown} small />
            <PlayingCard card={villain.hole[1]} hidden={!game.showdown} small />
          </div>
        </div>
        <div className="board-zone">
          <div className="pot-label">
            <span className="chip-stack">◉</span>
            {game.complete ? 'FINAL POT' : 'TOTAL POT'} <strong>{game.pot}</strong>
          </div>
          <div className="community-cards">
            {Array.from({ length: 5 }, (_, i) => (
              <PlayingCard key={i} card={game.board[i]} />
            ))}
          </div>
          <div className={`table-status ${game.complete ? 'result-status' : ''}`}>
            {game.complete ? (
              game.result
            ) : game.actor === 1 ? (
              <>
                <span className="thinking-dots">•••</span> Atlas is thinking
              </>
            ) : auto ? (
              <>
                <Bot size={13} /> Autoplay is considering the hand
              </>
            ) : (
              <>
                <span className="dot green" />
                Your turn. Find your line.
              </>
            )}
          </div>
        </div>
        {villain.streetBet > 0 && (
          <div className="bet-marker villain-bet">
            <span>◉</span>
            {villain.streetBet}
          </div>
        )}
        {hero.streetBet > 0 && (
          <div className="bet-marker hero-bet">
            <span>◉</span>
            {hero.streetBet}
          </div>
        )}
        <div className={`seat hero ${isHero ? 'active-seat' : ''}`}>
          <div className="hero-cards">
            <PlayingCard card={hero.hole[0]} />
            <PlayingCard card={hero.hole[1]} />
          </div>
          <div className="hero-identity">
            <div className="seat-avatar">YO</div>
            <div className="seat-info">
              <strong>
                You <span className="seat-tag">{game.button === 0 ? 'BTN / SB' : 'BB'}</span>
              </strong>
              <span>
                {hero.stack.toLocaleString()} <small>chips</small>
              </span>
            </div>
            {game.button === 0 && <span className="dealer">D</span>}
          </div>
        </div>
      </div>
      <div className="action-dock">
        <div className="action-dock-top">
          <span>
            <Timer size={13} />
            {game.complete ? 'Hand complete' : isHero ? 'Your decision' : 'Opponent’s decision'}
            {!ready && isHero && <small> · calculating equity</small>}
          </span>
          <button className={`autoplay-switch ${auto ? 'on' : ''}`} onClick={() => setAuto(!auto)}>
            <Bot size={14} />
            Autoplay{' '}
            <span className="switch-track">
              <i />
            </span>
          </button>
        </div>
        {game.complete ? (
          <button className="primary next-hand" onClick={next}>
            <Play size={16} />
            {canNext ? 'Deal next hand' : 'Start a fresh table'}
            <span>{canNext ? 'SPACE' : '200 CHIPS EACH'}</span>
          </button>
        ) : (
          <>
            <div className="bet-sizing">
              <span>
                Raise to <strong>{target}</strong>
              </span>
              <input
                aria-label="Raise amount"
                type="range"
                min={options.min}
                max={options.max}
                value={target}
                disabled={!canAct || !options.canRaise}
                onChange={(e) => setRaise(Number(e.target.value))}
              />
              <div className="size-presets">
                {[0.5, 0.75, 1].map((f) => (
                  <button
                    key={f}
                    disabled={!canAct || !options.canRaise}
                    onClick={() =>
                      setRaise(
                        Math.max(
                          options.min,
                          Math.min(
                            options.max,
                            Math.max(...game.players.map((p) => p.streetBet)) +
                              Math.round((game.pot + options.call) * f),
                          ),
                        ),
                      )
                    }
                  >
                    {f === 0.5 ? '½' : f === 0.75 ? '¾' : '1'} pot
                  </button>
                ))}
                <button
                  disabled={!canAct || !options.canRaise}
                  onClick={() => setRaise(options.max)}
                >
                  Max
                </button>
              </div>
            </div>
            <div className="action-buttons">
              <button className="fold-button" disabled={!canAct} onClick={() => onAct('fold')}>
                Fold<kbd>F</kbd>
              </button>
              <button disabled={!canAct} onClick={() => onAct(options.check ? 'check' : 'call')}>
                {options.check ? 'Check' : `Call ${options.call}`}
                <kbd>C</kbd>
              </button>
              <button
                className="primary"
                disabled={!canAct || !options.canRaise}
                onClick={() => onAct('raise', target)}
              >
                {Math.max(...game.players.map((p) => p.streetBet)) === 0 ? 'Bet' : 'Raise to'}{' '}
                {target}
                <kbd>R</kbd>
              </button>
            </div>
          </>
        )}
        <div className="table-footnote">
          <span>
            <span className="dot green" />
            Play chips only
          </span>
          <span>
            {auto
              ? 'Automatic decisions · local table'
              : thinking
                ? 'Opponent engine running locally'
                : 'No account. No deposit. Just practice.'}
          </span>
        </div>
      </div>
    </section>
  );
}
