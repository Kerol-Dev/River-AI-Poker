import type { Region, Word } from './screen/recognition';
/// <reference types="vite/client" />
import { ReaderSnapshot } from './reader/model';
import { BrowserSession } from './reader/journal';
export const isPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview');
export function previewSession(): BrowserSession {
  const start = Date.now() - 64 * 60000;
  return {
    id: 'preview',
    start,
    currency: '€',
    seat: 'player-seat-3',
    flows: [],
    points: [1000, 1060, 1020, 1180, 1135, 1260, 1245, 1410, 1330, 1520, 1480, 1640, 1585].map(
      (balance, i) => ({ at: start + i * 300000, handId: String(8000 + i), balance }),
    ),
  };
}
export function installPreview() {
  if (!isPreview) return;
  const snapshot = (): ReaderSnapshot => ({
    version: 1,
    key: 'preview',
    source: 'preview',
    handId: '8013',
    hole: ['As', 'Qh'],
    board: ['Qs', '7d', '2c'],
    pot: 4.2,
    call: 1.2,
    currency: '€',
    heroBet: 0,
    actionAmounts: { call: 1.2, raise: 2.4 },
    sizing: { min: 2.4, max: 15.85, editable: true },
    opponents: 2,
    heroTurn: true,
    actions: ['fold', 'call', 'raise'],
    seats: [
      { id: '1', label: 'Player 1', inHand: true, hero: false, stack: 14.5 },
      { id: '2', label: 'Player 2', inHand: true, hero: false, stack: 8.4 },
      { id: 'player-seat-3', label: 'You', inHand: true, hero: true, stack: 15.85 },
    ],
    dealer: '1',
    mapping: { mapped: 8, total: 8 },
    errors: [],
    receivedAt: Date.now(),
  });
  const screenWords: Word[] = [
    { text: 'As Qh', x: 0.425, y: 0.7, width: 0.15, height: 0.08, confidence: 0.99 },
    { text: 'Ks 7d 2c', x: 0.35, y: 0.37, width: 0.27, height: 0.08, confidence: 0.99 },
    { text: 'Pot: 4.20', x: 0.43, y: 0.25, width: 0.14, height: 0.04, confidence: 0.99 },
    { text: 'Call 1.20', x: 0.66, y: 0.86, width: 0.12, height: 0.05, confidence: 0.99 },
    { text: 'Fold', x: 0.5, y: 0.86, width: 0.08, height: 0.05, confidence: 0.99 },
    { text: 'Raise', x: 0.81, y: 0.86, width: 0.09, height: 0.05, confidence: 0.99 },
  ];
  window.river = {
    screen: {
      sources: async () => ({
        sources: [{ id: 'demo', name: 'Sample table · preview only', kind: 'window' }],
        permission: 'granted',
      }),
      reset: async () => {},
      capture: async ({
        sourceId,
        regions,
        auto,
      }: {
        sourceId: string;
        regions: Region[];
        auto?: boolean;
      }) =>
        auto
          ? {
              // Recorded native card detection on a generated sample table.
              ...(await (await fetch('/screen-demo-auto.json')).json()),
              sourceId,
              at: Date.now(),
              image: '/screen-demo-auto.png',
            }
          : {
              sourceId,
              at: Date.now(),
              image: '/screen-demo.svg',
              width: 1200,
              height: 780,
              readings: regions.length
                ? regions.map((r) => ({
                    id: r.id,
                    words: screenWords.filter(
                      (w) =>
                        w.x + w.width / 2 >= r.x &&
                        w.x + w.width / 2 <= r.x + r.width &&
                        w.y + w.height / 2 >= r.y &&
                        w.y + w.height / 2 <= r.y + r.height,
                    ),
                  }))
                : [{ id: 'scan', words: screenWords }],
            },
    },
    showHUD: async () => {
      window.open('/?preview=1&hud=1', 'river-preview-hud', 'width=420,height=760');
    },
    hideHUD: () => window.close(),
    publishHUD: () => {},
    readHUD: async () => null,
    onHUD: () => () => {},
    opacity: () => {},
    publishReaderPanel: () => {},
    resetGraph: async () => {},
    onReaderCommand: () => () => {},
    stopAuto: async () => {},
    readerStatus: async () => ({ running: true, port: 0, connected: true, lastSeen: Date.now() }),
    readTable: async () => snapshot(),
    onTable: (callback) => {
      const t = setInterval(() => callback(snapshot()), 250);
      return () => clearInterval(t);
    },
    publishDecision: () => {},
    copyReaderCode: async () => {},
    openConnector: async () => {},
    resetReader: async () => {},
  };
}
