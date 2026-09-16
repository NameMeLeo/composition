/* Composition — a two-line pub/sub.
   Used to tell the mounted page that the reading set changed, so persistence
   code never has to know which views exist. */

const listeners = new Set();

export function on(event, fn) {
  if (event !== 'readings') throw new Error('Unknown event: ' + event);
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(event) {
  if (event !== 'readings') throw new Error('Unknown event: ' + event);
  listeners.forEach((fn) => {
    try { fn(); } catch (err) { console.error('Listener failed', err); }
  });
}
