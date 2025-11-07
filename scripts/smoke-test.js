#!/usr/bin/env node
// Quick smoke-test for the Apps Script webapp.
// Usage: WEBAPP="https://script.google.com/macros/s/XXX/exec" node scripts/smoke-test.js

import fetch from 'node-fetch';

const WEBAPP = process.env.WEBAPP || process.argv[2];
if (!WEBAPP) {
  console.error('Usage: WEBAPP="https://.../exec" node scripts/smoke-test.js');
  process.exit(2);
}

async function run(name, fn) {
  const start = Date.now();
  try {
    const res = await fn();
    const ms = Date.now() - start;
    console.log(`\n== ${name} (${ms}ms) ==`);
    try { console.log(JSON.stringify(res, null, 2)); } catch(e) { console.log(String(res)); }
  } catch (err) {
    const ms = Date.now() - start;
    console.error(`\n== ${name} FAILED (${ms}ms) ==`);
    console.error(err && err.message ? err.message : err);
  }
}

(async () => {
  await run('GET dashboard', async () => {
    const r = await fetch(`${WEBAPP}?action=dashboard`);
    const t = await r.text(); try { return JSON.parse(t); } catch(_) { return t; }
  });

  const today = new Date().toISOString().slice(0,10);
  await run('GET attendance today', async () => {
    const r = await fetch(`${WEBAPP}?action=attendance&date=${encodeURIComponent(today)}`);
    const t = await r.text(); try { return JSON.parse(t); } catch(_) { return t; }
  });

  await run('POST quick_attendance_append (sign-in)', async () => {
    const body = new URLSearchParams({ op: 'quick_attendance_append', Staff: 'SMOKE_USER' });
    const r = await fetch(WEBAPP, { method: 'POST', body });
    const t = await r.text(); try { return JSON.parse(t); } catch(_) { return t; }
  });

  await run('POST quick_attendance_append (sign-out)', async () => {
    const body = new URLSearchParams({ op: 'quick_attendance_append', Staff: 'SMOKE_USER', wantsOut: 'true' });
    const r = await fetch(WEBAPP, { method: 'POST', body });
    const t = await r.text(); try { return JSON.parse(t); } catch(_) { return t; }
  });

  await run('POST quick_gym_append (member)', async () => {
    const body = new URLSearchParams({ op: 'quick_gym_append', MemberID: 'SMOKEMID' });
    const r = await fetch(WEBAPP, { method: 'POST', body });
    const t = await r.text(); try { return JSON.parse(t); } catch(_) { return t; }
  });

  console.log('\nSmoke tests complete. Check Apps Script Executions > Logs if any request returned ok:false or failed.');
})();
