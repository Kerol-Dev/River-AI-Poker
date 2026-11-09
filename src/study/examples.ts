import { parseCard } from '../engine/cards';
const cards = (s: string) => s.split(' ').map(parseCard);
export const studyExamples = [
  {
    name: 'Counterfeited pair',
    hole: cards('4h 4c'),
    board: cards('Ah 6s 7c 7h 6d'),
    pot: 0.96,
    call: 0.36,
    action: 'bet' as const,
  },
  {
    name: 'High card facing a raise',
    hole: cards('Jh 5h'),
    board: cards('Qh Ac 7s'),
    pot: 2.6,
    call: 1.3,
    action: 'raise' as const,
  },
  {
    name: 'Guaranteed split',
    hole: cards('2c 3d'),
    board: cards('Ah Kh Qh Jh Th'),
    pot: 10,
    call: 2,
    action: 'bet' as const,
  },
  {
    name: 'The nuts',
    hole: cards('Ah Kh'),
    board: cards('Qh Jh Th 2c 3d'),
    pot: 10,
    call: 2,
    action: 'raise' as const,
  },
  {
    name: 'Strong draw, small price',
    hole: cards('Jh Th'),
    board: cards('Qh 9h 2s'),
    pot: 10,
    call: 1,
    action: 'bet' as const,
  },
];
