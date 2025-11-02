// src/lib/api.js
const BASE = (import.meta.env.VITE_GAS_URL || '').replace(/\/$/, '');

async function asJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
  }
}

export async function list(sheet) {
  const url = `${BASE}?sheet=${encodeURIComponent(sheet)}&op=list`;
  const res = await fetch(url);
  const json = await asJson(res);
  if (json.status !== 'success') throw new Error(json.message || 'List failed');
  return json.data;
}

export async function add(sheet, record) {
  const url = `${BASE}?sheet=${encodeURIComponent(sheet)}&op=add`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(record),
  });
  const json = await asJson(res);
  if (json.status !== 'success') throw new Error(json.message || 'Add failed');
  return true;
}
