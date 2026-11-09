import { useEffect, useRef, useState } from 'react';
import { readSaved } from '../hooks';
import { emptyObservation, observeOpponents, restoreBook } from './opponents';
import { ReaderSnapshot } from './model';
export function useOpponents(snapshot: ReaderSnapshot | null) {
  const [book, setBook] = useState(() => restoreBook(readSaved('river.opponents.v1', null))),
    [error, setError] = useState('');
  const state = useRef(emptyObservation()),
    bookRef = useRef(book);
  useEffect(() => {
    if (snapshot) {
      const next = observeOpponents(bookRef.current, state.current, snapshot);
      bookRef.current = next;
      setBook(next);
    }
  }, [snapshot]);
  useEffect(() => {
    try {
      localStorage.setItem('river.opponents.v1', JSON.stringify(book));
    } catch {
      setError('Opponent history could not be saved; this session remains in memory.');
    }
  }, [book]);
  return { book, error };
}
