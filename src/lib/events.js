// Minimal event emitter used for light-weight cross-module notifications
const listeners = new Map();

function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => off(event, fn);
}
function off(event, fn) {
  const s = listeners.get(event);
  if (!s) return;
  s.delete(fn);
  if (!s.size) listeners.delete(event);
}
function emit(event, payload) {
  const s = listeners.get(event);
  if (!s) return;
  for (const fn of Array.from(s)) {
    try { fn(payload); } catch (e) { console.error('event handler error', e); }
  }
}

export default { on, off, emit };
