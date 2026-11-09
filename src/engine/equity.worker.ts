import { calculateEquity } from './equity';
self.onmessage = (event) => {
  try {
    self.postMessage({ id: event.data.id, result: calculateEquity(event.data.input) });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : 'Calculation failed.',
    });
  }
};
