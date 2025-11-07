import React from 'react';

export default function LoadingSkeleton({ width = '100%', height = 200 }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 150, height: 200, borderRadius: 12, background: '#f3f4f6', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.02)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 22, width: '60%', background: '#f3f4f6', borderRadius: 6, marginBottom: 8 }} />
        <div style={{ height: 18, width: '40%', background: '#f3f4f6', borderRadius: 6, marginBottom: 14 }} />
        <div style={{ height: 12, width: '80%', background: '#f3f4f6', borderRadius: 6, marginBottom: 6 }} />
        <div style={{ height: 12, width: '70%', background: '#f3f4f6', borderRadius: 6, marginBottom: 6 }} />
        <div style={{ height: 12, width: '50%', background: '#f3f4f6', borderRadius: 6, marginTop: 10 }} />
      </div>
    </div>
  );
}
