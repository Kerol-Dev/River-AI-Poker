import { useEffect, useMemo, useRef, useState } from 'react';
import {
  assessSnapshot,
  assessEquitySnapshot,
  BridgeStatus,
  ReaderSnapshot,
  readerDecision,
} from './model';
import { emptyDisplay, presentCards } from './presentation';
import { useJournal } from './useJournal';
import { useOpponents } from './useOpponents';
import { rangeFor } from './opponents';
import { makePlan } from './strategy';
import { performanceData } from '../components/Performance';
import { cardText } from '../engine/cards';
import { useEquity } from '../hooks';
export function useBrowserReader(trials: number) {
  const [snapshot, setSnapshot] = useState<ReaderSnapshot | null>(null);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!window.river) return;
    let active = true;
    const refresh = () =>
      window
        .river!.readerStatus()
        .then((s) => {
          if (active) setBridge(s);
        })
        .catch(() => {});
    const receive = (s: ReaderSnapshot | null) => {
      if (active) {
        setNow(Date.now());
        setSnapshot(s);
      }
    };
    const dispose = window.river.onTable(receive);
    window.river.readTable().then(receive);
    refresh();
    const timer = setInterval(() => {
      setNow(Date.now());
      refresh();
    }, 750);
    return () => {
      active = false;
      dispose();
      clearInterval(timer);
    };
  }, []);
  const displayRef = useRef(emptyDisplay());
  const display = useMemo(() => {
    displayRef.current = presentCards(displayRef.current, snapshot, now);
    return displayRef.current;
  }, [snapshot, now]);
  const journal = useJournal(snapshot);
  const opponents = useOpponents(snapshot);
  const assessment = useMemo(() => assessSnapshot(snapshot, now), [snapshot, now]);
  const equityAssessment = useMemo(() => assessEquitySnapshot(snapshot, now), [snapshot, now]);
  const inputRef = useRef<Parameters<typeof useEquity>[0]>(null);
  if (equityAssessment.valid && snapshot)
    inputRef.current = {
      hole: equityAssessment.hole,
      board: equityAssessment.board,
      opponents: snapshot.opponents,
      range: 'random',
      opponentRanges: snapshot.seats
        .filter((p) => !p.hero && p.inHand)
        .map((p) => rangeFor(opponents.book.profiles[p.username || ''])),
      trials,
    };
  const equity = useEquity(inputRef.current);
  const decision = useMemo(
    () =>
      snapshot && assessment.valid && equity.result
        ? makePlan(snapshot, equity.result, opponents.book, now)
        : null,
    [snapshot, assessment.valid, equity.result, now, opponents.book],
  );
  useEffect(() => {
    window.river?.publishDecision(decision);
  }, [decision]);
  useEffect(() => {
    const active =
      journal.journal.sessions.find((s) => s.id === journal.journal.active) ||
      (journal.journal.pendingReset ? undefined : journal.journal.sessions.at(-1));
    const names = new Set(snapshot?.seats.filter((p) => !p.hero).map((p) => p.username) || []);
    window.river?.publishReaderPanel({
      at: now,
      key: snapshot?.key || null,
      hole: display.hole.map(cardText),
      board: display.board.map(cardText),
      holding: display.holding,
      equity: equityAssessment.valid ? equity.result?.equity : undefined,
      win: equityAssessment.valid ? equity.result?.win : undefined,
      tie: equityAssessment.valid ? equity.result?.tie : undefined,
      performance: active ? performanceData(active) : undefined,
      profiles: Object.values(opponents.book.profiles)
        .filter((p) => names.has(p.name))
        .map((p) => ({ ...p, range: rangeFor(p) })),
      events: opponents.book.events.slice(-10),
      reasoning: decision?.reasoning || [],
      intent: decision?.intent,
      target: decision?.target,
      status: assessment.reason,
      storageError: opponents.error || journal.error,
    });
  }, [
    snapshot,
    display,
    decision,
    journal.journal,
    opponents.book,
    now,
    equity.result,
    equityAssessment.valid,
  ]);
  return {
    opponents,
    snapshot,
    bridge,
    assessment,
    equityAssessment,
    equity,
    decision,
    now,
    display,
    journal,
  };
}
export type BrowserReaderState = ReturnType<typeof useBrowserReader>;
