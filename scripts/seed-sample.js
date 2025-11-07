#!/usr/bin/env node
// Seed script to create 20 mock members + gym entries + payments + progress rows
// Usage: WEBAPP="https://script.google.com/macros/s/XXX/exec" node scripts/seed-sample.js
// Requires: node >=18 or `npm i node-fetch` (if using older node)

import fetch from 'node-fetch';

const WEBAPP = process.env.WEBAPP || process.argv[2];
if (!WEBAPP) {
  console.error('Usage: WEBAPP="https://.../exec" node scripts/seed-sample.js');
  process.exit(2);
}

function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
function daysAgo(n){ const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
function hhmmRandom(){ return `${String(randInt(6,21)).padStart(2,'0')}:${String(randInt(0,59)).padStart(2,'0')}`; }

const NAMES = [
  'Anne Curtis','Vice Ganda','Sarah Geronimo','Lea Salonga','Regine Velasquez',
  'Pia Wurtzbach','Catriona Gray','Alden Richards','Maine Mendoza','Kathryn Bernardo',
  'Daniel Padilla','Dingdong Dantes','Marian Rivera','Gary Valenciano','Nadine Lustre',
  'Liza Soberano','Enchong Dee','Piolo Pascual','Bea Alonzo','John Lloyd Cruz'
];

async function postForm(params){
  const body = new URLSearchParams(params);
  // Retry with exponential backoff on transient failures (rate limits, non-JSON responses)
  const maxAttempts = 6;
  const baseMs = 500; // base wait for backoff
  for (let attempt = 1; attempt <= maxAttempts; attempt++){
    try {
      const res = await fetch(WEBAPP, { method: 'POST', body });
      const text = await res.text();
      try { return JSON.parse(text); } catch(e){
        // Received HTML (often Google rate-limit or auth page). Treat as transient and retry.
        const isHtml = String(text||'').trim().startsWith('<');
        const short = String(text||'').slice(0, 400).replace(/\s+/g,' ');
        const err = { ok:false, error: 'Non-JSON response', raw: text };
        if (isHtml) console.warn(`postForm attempt ${attempt} received HTML response (likely rate-limit). snippet: ${short}`);
        if (attempt === maxAttempts) return err;
        const jitter = Math.floor(Math.random() * 300);
        const wait = baseMs * Math.pow(2, attempt-1) + jitter;
        console.warn(`postForm attempt ${attempt} got non-JSON response; retrying in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
    } catch (err) {
      if (attempt === maxAttempts) return { ok:false, error: String(err) };
      const jitter = Math.floor(Math.random() * 300);
      const wait = baseMs * Math.pow(2, attempt-1) + jitter;
      console.warn(`postForm attempt ${attempt} failed: ${err}. retrying in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
  }
  return { ok:false, error: 'Unknown postForm failure' };
}

async function seed(){
  console.log('Seeding to', WEBAPP);
  const createdMembers = [];
  for(let i=0;i<NAMES.length;i++){
    const full = NAMES[i];
    const [first, ...rest] = full.split(' ');
    const last = rest.join(' ') || '';
    const nick = first.toUpperCase().slice(0,6) + String(Date.now()).slice(-4).slice(0,2); // small unique-ish nick
    const memberSince = daysAgo(randInt(1,60));
    const memberRow = {
      NickName: nick,
      FirstName: first,
      LastName: last,
      MemberSince: memberSince,
      // optional fields
      Email: `${nick.toLowerCase()}@example.test`,
      Phone: `09${randInt(100000000,999999999)}`
    };
  const r = await postForm({ op: 'insert', sheet: 'Members', row: JSON.stringify(memberRow) });
    if (r && r.ok){
      console.log(i+1, 'Created member', nick);
      // Server may return memberId in response for Members insert; try to read it
      const memberId = (r.memberId && r.memberId) ? r.memberId : (memberRow.MemberID || nick + memberSince.replace(/-/g,''));
      createdMembers.push({ memberId, nick, ...memberRow });
    } else {
      console.warn('Failed to insert member', memberRow, r);
    }
    // Small throttle between member creations to avoid hitting Apps Script rate limits
    await new Promise(r => setTimeout(r, 500 + Math.floor(Math.random()*200)));
  }

  // For each created member, create random gym entries, payments, progress
  for (const m of createdMembers){
    const gymCount = randInt(1,6);
    for (let j=0;j<gymCount;j++){
      const days = randInt(0,20);
      const date = daysAgo(days);
      const timeIn = hhmmRandom();
      const wantOut = Math.random() > 0.3;
      const timeOut = wantOut ? hhmmRandom() : '';
      const gymRow = { Date: date, MemberID: m.memberId, TimeIn: timeIn };
      if (timeOut) gymRow.TimeOut = timeOut;
      // append directly to GymEntries
      const r = await postForm({ op: 'insert', sheet: 'GymEntries', row: JSON.stringify(gymRow) });
      if (!r || !r.ok) console.warn('Failed to add gym row for', m.memberId, r);
      await new Promise(r => setTimeout(r, 300 + Math.floor(Math.random()*150)));
    }

    const payCount = randInt(0,3);
  for (let j=0;j<payCount;j++){
      const days = randInt(0,60);
      const date = daysAgo(days);
      const time = `${String(randInt(8,20)).padStart(2,'0')}:${String(randInt(0,59)).padStart(2,'0')}`;
      const mode = Math.random() > 0.5 ? 'Cash' : 'GCash';
      const cost = [100,200,300,500,800][randInt(0,4)];
      const particulars = ['Monthly Membership','Drop-in','PT Session','Coach Package'][randInt(0,3)];
      const payRow = { Date: date, Time: time, MemberID: m.memberId, Particulars: particulars, Mode: mode, Cost: cost };
      const r = await postForm({ op: 'insert', sheet: 'Payments', row: JSON.stringify(payRow) });
      if (!r || !r.ok) console.warn('Failed to add payment for', m.memberId, r);
      await new Promise(r => setTimeout(r, 300 + Math.floor(Math.random()*150)));
    }

    const progCount = randInt(0,2);
  for (let j=0;j<progCount;j++){
      const days = randInt(0,60);
      const date = daysAgo(days);
      const weight = (60 + randInt(-10,20)).toString();
      const bodyFat = (20 + randInt(-5,5)).toString();
      const progRow = { Date: date, MemberID: m.memberId, Weight: weight, BodyFat: bodyFat, Notes: 'Sample progress' };
      const r = await postForm({ op: 'insert', sheet: 'ProgressTracker', row: JSON.stringify(progRow) });
      if (!r || !r.ok) console.warn('Failed to add progress for', m.memberId, r);
      await new Promise(r => setTimeout(r, 300 + Math.floor(Math.random()*150)));
    }
  }

      // Seed Attendance rows for a few staff/accounts
      const STAFFS = ['Reception','Coach A','Coach B','Admin'];
      function hhmmRandomRange(minH, maxH){ return `${String(randInt(minH,maxH)).padStart(2,'0')}:${String(randInt(0,59)).padStart(2,'0')}`; }
      function parseMinutes(hhmm){ const m = String(hhmm||'').split(':'); if (m.length<2) return null; return Number(m[0])*60 + Number(m[1]); }
      function calcHours(inT, outT){ const a = parseMinutes(inT), b = parseMinutes(outT); if (a==null||b==null) return ''; let diff = b - a; if (diff < 0) diff += 24*60; return Math.round((diff/60)*100)/100; }

      console.log('Seeding Attendance for', STAFFS.length, 'staff across recent days');
      const maxDays = 20;
      for (let d=0; d<maxDays; d++){
        const date = daysAgo(d);
        for (const s of STAFFS){
          // 60% chance that a staff worked that day
          if (Math.random() > 0.6) continue;
          const inT = hhmmRandomRange(6,10);
          const didOut = Math.random() > 0.1; // usually they signed out
          const outT = didOut ? hhmmRandomRange(14,19) : '';
          const hours = outT ? calcHours(inT, outT) : '';
          const attRow = { Date: date, Staff: s, TimeIn: inT };
          if (outT) attRow.TimeOut = outT;
          if (hours !== '') attRow.NoOfHours = hours;
          const r = await postForm({ op: 'insert', sheet: 'Attendance', row: JSON.stringify(attRow) });
          if (!r || !r.ok) console.warn('Failed to add attendance for', s, date, r && r.error ? r.error : r);
          await new Promise(r => setTimeout(r, 250 + Math.floor(Math.random()*200)));
        }
      }

  console.log('Seeding complete. Created', createdMembers.length, 'members.');
  console.log('Tip: Check the Sheets and the Apps Script Executions logs to confirm.');
}

seed().catch(err => { console.error('Fatal', err); process.exit(1); });
