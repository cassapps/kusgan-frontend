import { describe, it, expect } from 'vitest';
import { applyOptimisticSignOut } from '../src/lib/attendanceUtils';

describe('applyOptimisticSignOut', () => {
  it('updates today open entry when available', () => {
    const today = '2025-11-07';
    const rows = [
      { Staff: 'Patpat', Date: today, TimeIn: '09:00', TimeOut: '' },
      { Staff: 'Other', Date: today, TimeIn: '08:00', TimeOut: '' },
    ];
    const { updatedRows, highlightedIndex } = applyOptimisticSignOut(rows, 'Patpat', today, '10:00', 12345);
    expect(highlightedIndex).toBe(0);
    expect(updatedRows[0].TimeOut).toBe('10:00');
  expect(updatedRows[0]._optimisticKey).toBe(12345);
  });

  it('falls back to most recent open entry if today not found', () => {
    const today = '2025-11-07';
    const rows = [
      { Staff: 'Patpat', Date: '2025-11-06', TimeIn: '09:00', TimeOut: '' },
      { Staff: 'Patpat', Date: '2025-11-05', TimeIn: '08:00', TimeOut: '' },
    ];
    const { updatedRows, highlightedIndex } = applyOptimisticSignOut(rows, 'Patpat', today, '10:00', 54321);
    expect(highlightedIndex).toBe(1);
    expect(updatedRows[1].TimeOut).toBe('10:00');
  expect(updatedRows[1]._optimisticKey).toBe(54321);
  });

  it('appends sign-out-only record when none found', () => {
    const today = '2025-11-07';
    const rows = [
      { Staff: 'Someone', Date: today, TimeIn: '09:00', TimeOut: '10:00' }
    ];
    const { updatedRows, highlightedIndex } = applyOptimisticSignOut(rows, 'Patpat', today, '11:00', 99999);
    expect(highlightedIndex).toBe(updatedRows.length - 1);
    const rec = updatedRows[updatedRows.length - 1];
    expect(rec.Staff).toBe('Patpat');
    expect(rec.TimeOut).toBe('11:00');
  expect(rec._optimisticKey).toBe(99999);
  });
});
