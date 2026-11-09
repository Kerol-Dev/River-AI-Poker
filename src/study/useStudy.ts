import { useEffect, useState } from 'react';
import type { EquityInput, EquityResult } from './equity';
export function useStudy(input: EquityInput) {
  const key = JSON.stringify(input);
  const [value, setValue] = useState<{ key: string; result?: EquityResult; error?: string }>({
    key: '',
  });
  useEffect(() => {
    let active = true;
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (active) setValue({ key, ...e.data });
    };
    worker.onerror = () => {
      if (active) setValue({ key, error: 'Calculation failed. Change a setting to retry.' });
    };
    worker.postMessage(input);
    return () => {
      active = false;
      worker.terminate();
    };
  }, [key]);
  return {
    result: value.key === key ? value.result : undefined,
    error: value.key === key ? value.error : undefined,
    pending: value.key !== key,
  };
}
