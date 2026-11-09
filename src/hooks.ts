import { useEffect, useState } from 'react';
import { EquityInput, EquityResult } from './engine/equity';
export function useEquity(input: EquityInput | null) {
  const key = JSON.stringify(input);
  const [value, setValue] = useState<{ key: string; result?: EquityResult; error?: string }>({
    key: '',
  });
  useEffect(() => {
    if (!input) return;
    const worker = new Worker(new URL('./engine/equity.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e) => setValue({ key, result: e.data.result, error: e.data.error });
    worker.onerror = () =>
      setValue({ key, error: 'The calculation could not finish. Change a setting to retry.' });
    worker.postMessage({ id: key, input });
    return () => worker.terminate();
  }, [key]);
  return {
    result: value.key === key ? value.result : undefined,
    error: value.key === key ? value.error : undefined,
    pending: !!input && value.key !== key,
  };
}
export function readSaved<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}
