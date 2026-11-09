import { Card as CardValue, RANKS, SUITS, suit } from '../engine/cards';
export function PlayingCard({
  card,
  hidden = false,
  small = false,
  onClick,
  label,
}: {
  card?: CardValue;
  hidden?: boolean;
  small?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const content = hidden ? (
    <span className="card-back-mark">♠</span>
  ) : card !== undefined ? (
    <>
      <span className="card-corner">
        {RANKS[card % 13]}
        <small>{SUITS[suit(card)]}</small>
      </span>
      <span className="card-suit">{SUITS[suit(card)]}</span>
      <span className="card-bottom">{RANKS[card % 13]}</span>
    </>
  ) : (
    <span className="card-empty">+</span>
  );
  const className = `playing-card ${hidden ? 'back' : card === undefined ? 'empty' : ''} ${small ? 'small' : ''} ${card !== undefined && [1, 2].includes(suit(card)) ? 'red' : ''} ${onClick ? 'editable' : ''}`;
  const accessible =
    label ||
    (hidden
      ? 'Hidden card'
      : card === undefined
        ? 'Empty card slot'
        : `${RANKS[card % 13]}${SUITS[suit(card)]}`);
  return onClick ? (
    <button type="button" className={className} onClick={onClick} aria-label={accessible}>
      {content}
    </button>
  ) : (
    <div className={className} aria-label={accessible}>
      {content}
    </div>
  );
}
