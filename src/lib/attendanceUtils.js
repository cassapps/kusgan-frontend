// Helper utilities for attendance optimistic updates
export function applyOptimisticSignOut(rows = [], selected = '', today = '', timeNow = '', ts = null) {
  const out = Array.isArray(rows) ? rows.slice() : [];
  const keySelected = String(selected || '').trim().toLowerCase();
  const nowTs = ts || Date.now();

  const hasNoOut = (r) => {
    const candidates = [r?.TimeOut, r?.timeout, r?.time_out, r?.['Time Out'], r?.['time out']];
    for (const c of candidates) if (c && String(c).trim() !== '') return false;
    return true;
  };

  const rowDateYMD = (r) => {
    try {
      const raw = String(r?.Date || r?.date || r?.DateTime || r?.datetime || r?.LogDate || r?.log_date || '').trim();
      if (!raw) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0,10);
      const d = new Date(raw);
      if (!isNaN(d)) return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
      return raw.slice(0,10);
    } catch (e) { return ''; }
  };

  // 1) try to find today's open entry (from end) — prefer updating the existing row so we don't reorder
  for (let i = out.length - 1; i >= 0; i--) {
    const r = out[i];
    try {
      const staffMatch = String(r?.Staff || r?.staff || r?.Name || r?.name || '').trim().toLowerCase() === keySelected;
      const rowYMD = rowDateYMD(r) || (r && String(r?.Date||r?.date||'').slice(0,10)) || '';
      // Accept rows that explicitly match today OR rows with empty/unknown Date (these often represent today's open entries)
      const isTodayOrUndated = String(rowYMD).slice(0,10) === String(today).slice(0,10) || String(rowYMD).trim() === '';
      if (staffMatch && isTodayOrUndated && hasNoOut(r)) {
        const outKeys = Object.keys(r || {});
        let outKey = outKeys.find(k => /timeout/i.test(k));
        if (!outKey) outKey = 'TimeOut';
        // update the row in-place (copy) but do NOT modify any sort-timestamp to avoid reordering
        const newRow = { ...r, [outKey]: timeNow, _optimisticKey: nowTs };
        out[i] = newRow;
        return { updatedRows: out, highlightedIndex: i };
      }
    } catch (e) { /* ignore malformed rows */ }
  }

  // 2) fallback: most recent open entry for staff regardless of date — update without changing sort order
  for (let i = out.length - 1; i >= 0; i--) {
    const r = out[i];
    try {
      const staffMatch = String(r?.Staff || r?.staff || r?.Name || r?.name || '').trim().toLowerCase() === keySelected;
      if (staffMatch && hasNoOut(r)) {
        const outKeys = Object.keys(r || {});
        let outKey = outKeys.find(k => /timeout/i.test(k));
        if (!outKey) outKey = 'TimeOut';
        const newRow = { ...r, [outKey]: timeNow, _optimisticKey: nowTs };
        out[i] = newRow;
        return { updatedRows: out, highlightedIndex: i };
      }
    } catch (e) { /* ignore */ }
  }

  // 3) none found: append sign-out-only record (this is a true append so it may appear as newest)
  const recOut = { Staff: selected, Date: today, TimeIn: '', TimeOut: timeNow, _optimisticKey: nowTs };
  out.push(recOut);
  return { updatedRows: out, highlightedIndex: out.length - 1 };
}

export default { applyOptimisticSignOut };
