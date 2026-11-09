import { calculateEquity } from './equity';
self.onmessage = (event) => {
  try {
    self.postMessage({ result: calculateEquity(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Study calculation failed.',
    });
  }
};
