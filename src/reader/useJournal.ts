import { useEffect, useRef, useState } from 'react';
import { isPreview, previewSession } from '../devPreview';
import { readSaved } from '../hooks';
import { ReaderSnapshot } from './model';
import {
  addFlow,
  balanceAtBoundary,
  checkpoint,
  endSession,
  resetGraph,
  Journal,
  restoreJournal,
} from './journal';
export function useJournal(snapshot: ReaderSnapshot | null) {
  const [journal, setJournal] = useState<Journal>(() =>
    isPreview
      ? { sessions: [previewSession()], active: 'preview', paused: true }
      : restoreJournal(readSaved('river.browser.sessions.v1', null)),
  );
  const [error, setError] = useState('');
  const candidate = useRef({ key: '', since: 0 });
  useEffect(() => {
    if (!snapshot || balanceAtBoundary(snapshot) === null) {
      candidate.current = { key: '', since: 0 };
      return;
    }
    const key = JSON.stringify([
      snapshot.handId,
      snapshot.currency,
      snapshot.seats.find((s) => s.hero)?.id,
      balanceAtBoundary(snapshot),
    ]);
    if (candidate.current.key !== key) {
      candidate.current = { key, since: snapshot.receivedAt };
      return;
    }
    if (snapshot.receivedAt - candidate.current.since >= 1200)
      setJournal((j) => checkpoint(j, snapshot));
  }, [snapshot]);
  useEffect(() => {
    if (isPreview) return;
    try {
      localStorage.setItem('river.browser.sessions.v1', JSON.stringify(journal));
    } catch {
      setError('Session storage is full. Export your history to keep a copy.');
    }
  }, [journal]);
  useEffect(
    () =>
      window.river?.onReaderCommand((command) => {
        if (command === 'reset-session') {
          candidate.current = { key: '', since: 0 };
          setJournal((j) => resetGraph(j));
        }
      }),
    [],
  );
  return {
    journal,
    error,
    reset: () => {
      candidate.current = { key: '', since: 0 };
      setJournal((j) => resetGraph(j));
    },
    flow: (amount: number) => setJournal((j) => addFlow(j, amount)),
    end: (balance?: number) => setJournal((j) => endSession(j, balance)),
    start: () => setJournal((j) => ({ ...j, paused: false })),
  };
}
export type JournalState = ReturnType<typeof useJournal>;
