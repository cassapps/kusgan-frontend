import React from 'react';

export default function RefreshBadge({ text = 'Refreshing…', show = true }) {
  if (!show) return null;
  return (
    <span className="refresh-badge" role="status" aria-live="polite">
      <span className="refresh-spinner" aria-hidden />
      <span style={{ marginLeft: 8 }}>{text}</span>
    </span>
  );
}
