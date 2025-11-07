const BASE = import.meta.env.VITE_GAS_BASE;

// For batch requests, consider accepting an array of sheet names and returning a combined result.
// Example: gasList(['Members', 'Payments'])
export async function gasList(sheet) {
  const url = `${BASE}?sheet=${encodeURIComponent(sheet)}&op=list`;
  const r = await fetch(url);
  return r.json(); // { ok, rows: [...] }
}

export async function gasAddMember(payload) {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ op:'addMember', ...payload })
  });
  return r.json(); // { ok, saved:{...} }
}
