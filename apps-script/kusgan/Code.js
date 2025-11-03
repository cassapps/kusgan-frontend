/***** CONFIG *****/
const SHEET_ID = '1yDYPce2_XCI3T57eRnZsrM98u-kZwzMAyNMlNh_-C0s';
const ALLOWED_SHEETS = ['Members','Pricing','Payments','Attendance','GymEntries','ProgressTracker'];
const FOLDER_ID = '1d0MqTq07YeTRZwvrWu5uIgfta8hEAX58';
const TZ = 'Asia/Manila'; // also set project time zone to Asia/Manila

/***** DRIVE UPLOAD *****/
// Try multiple ways to make a Drive file publicly viewable (covers Shared Drives)
function makePublic_(file) {
  try {
    // Best-effort using DriveApp first
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(_) {}
  // Advanced Drive API (if enabled) for Shared Drives or restricted folders
  try {
    // v2 style (Advanced Drive v2)
    if (typeof Drive !== 'undefined' && Drive.Permissions && Drive.Permissions.insert) {
      try { Drive.Permissions.insert({ role: 'reader', type: 'anyone', withLink: true }, file.getId()); } catch(_){}
    }
  } catch(_) {}
  try {
    // v3 style (some deployments expose create with supportsAllDrives)
    if (typeof Drive !== 'undefined' && Drive.Permissions && Drive.Permissions.create) {
      try { Drive.Permissions.create({ role: 'reader', type: 'anyone', allowFileDiscovery: false }, file.getId(), { supportsAllDrives: true }); } catch(_){}
    }
  } catch(_) {}
}
function uploadPhoto_(memberId, filename, mime, base64) {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const name = filename || ((memberId || 'photo') + '.jpg');
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mime || 'image/jpeg', name);
  const file = folder.createFile(blob);
  makePublic_(file);
  // Prefer view URL; client can switch to thumbnail/download if needed
  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

/***** UTIL *****/
function asJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
// Ensure values we write to Sheets are of acceptable primitive types
function cellScalar_(v){
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  var t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return v;
  // For unexpected objects/arrays, coerce to string to avoid Spreadsheet errors
  try { return String(v); } catch(_) { return '';
  }
}
function getSheet_(name) {
  if (!name) throw new Error('Missing sheet');
  if (!ALLOWED_SHEETS.includes(name)) throw new Error('Unknown sheet: ' + name);
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}
function readHeader_(sh) {
  const lastCol = sh.getLastColumn();
  return lastCol ? sh.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h).trim()) : [];
}
function appendByHeader_(sh, header, rowObj) {
  sh.appendRow(header.map(h => rowObj[h] ?? ''));
}
function rowsAsObjects_(sh, header) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2 || header.length === 0) return [];
  const vals = sh.getRange(2,1,lastRow-1,header.length).getValues();
  // Universal rule: newest entries (last appended) should appear first.
  // We reverse the order after filtering/mapping to keep latest at the top for all tables.
  const rows = vals
    .filter(r => r.some(v => v !== '' && v !== null))
    .map(r => Object.fromEntries(header.map((h,i)=>[h, r[i]])));
  return rows.reverse();
}
function headerIndex_(header, names){
  for (var i=0;i<names.length;i++){ var j=header.indexOf(names[i]); if(j!==-1) return j; }
  return -1;
}

/***** DATE/TIME (Manila) *****/
function nowPH_(){ return new Date(); } // project TZ ensures Manila time
function ymdPH_(d){ return Utilities.formatDate(d||nowPH_(), TZ, 'yyyy-MM-dd'); }
function hmPH_(d){ return Utilities.formatDate(d||nowPH_(), TZ, 'HH:mm'); }
function parseHm_(s){
  var m=String(s||'').match(/^(\d{1,2}):(\d{2})$/); if(!m) return null;
  var h=+m[1], mm=+m[2]; if(h>23||mm>59) return null; return h*60+mm;
}
function sessionHours_(dateStr, tin, tout){
  var a=parseHm_(tin), b=parseHm_(tout);
  if (a==null || b==null) return '';
  var d = new Date(dateStr + 'T00:00:00');
  var start = new Date(d); start.setHours(Math.floor(a/60), a%60, 0, 0);
  var end   = new Date(d); end.setHours(Math.floor(b/60), b%60, 0, 0);
  if (end < start) end = new Date(end.getTime() + 24*60*60*1000);
  return Math.round(((end-start)/3.6e6)*100)/100;
}

/***** MEMBER RULES (Nick unique, MemberID = NICK6 + YYMMDD) *****/
function ensureUniqueNick_(sh, header, nick) {
  const col = headerIndex_(header, ['NickName','Nick Name','Nickname']);
  if (col === -1) return;
  const t = String(nick||'').trim().toLowerCase();
  if (!t) throw new Error('Nick Name is required');
  const last = sh.getLastRow();
  if (last <= 1) return;
  const vals = sh.getRange(2,col+1,last-1,1).getValues();
  for (var i=0;i<vals.length;i++){
    const v = String(vals[i][0]||'').trim().toLowerCase();
    if (v && v === t) throw new Error('Nick Name is already taken');
  }
}
// Ensure Nick is unique among all rows except the provided 1-based row number
function ensureUniqueNickExceptRow_(sh, header, nick, rowNumber) {
  const col = headerIndex_(header, ['NickName','Nick Name','Nickname']);
  if (col === -1) return;
  const t = String(nick||'').trim().toLowerCase();
  if (!t) throw new Error('Nick Name is required');
  const last = sh.getLastRow();
  if (last <= 1) return;
  const vals = sh.getRange(2,col+1,last-1,1).getValues();
  const skipIdx = Math.max(2, rowNumber) - 2; // convert to 0-based index into vals
  for (var i=0;i<vals.length;i++){
    if (i === skipIdx) continue;
    const v = String(vals[i][0]||'').trim().toLowerCase();
    if (v && v === t) throw new Error('Nick Name is already taken');
  }
}
function buildMemberIdFromNick_(nick, when) {
  var clean = String(nick||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  var nick6 = clean.slice(0,6);
  var d = when instanceof Date ? when : new Date(when||nowPH_());
  var ymd = Utilities.formatDate(d, TZ, 'yyMMdd');
  return (nick6 + ymd).slice(0,12);
}
function ensureUniqueMemberId_(sh, header, baseId, when){
  var idCol = header.indexOf('MemberID'); if (idCol === -1) return baseId||'';
  var set = new Set();
  const last = sh.getLastRow();
  if (last>1){
    sh.getRange(2,idCol+1,last-1,1).getValues().forEach(r=>{
      const v=String(r[0]||'').trim().toLowerCase(); if(v) set.add(v);
    });
  }
  var cand = String(baseId||'').trim();
  if (!cand) return '';
  if (!set.has(cand.toLowerCase())) return cand;
  var ymd = Utilities.formatDate(when||nowPH_(), TZ, 'yyMMdd');
  var n=1;
  while(true){
    var suf=String(n++);
    var nickMax = Math.max(0, 12 - ymd.length - suf.length);
    var nickOnly = cand.replace(/\d{6}$/, '');
    var id = (nickOnly.slice(0, nickMax) + ymd + suf);
    if (!set.has(id.toLowerCase())) return id;
  }
}

/*** QR CODE HELPERS ***/
function buildQrImageUrl_(memberId, size){
  var s = Math.max(100, Math.min(1024, Number(size||256)|0));
  var chl = encodeURIComponent(String(memberId||''));
  return 'https://chart.googleapis.com/chart?chs=' + s + 'x' + s + '&cht=qr&chl=' + chl + '&choe=UTF-8';
}
function findQrHeaderName_(header){
  var names = ['QR','Qr','qr','QRCode','QR Code','QR_URL','QRURL','QR Url','QR Link','QRImage','QR_Image'];
  for (var i=0;i<names.length;i++){ if (header.indexOf(names[i]) !== -1) return names[i]; }
  return '';
}

/***** ATTENDANCE HELPERS *****/
function findLastOpenRow_(sh, header, staff, dateStr){
  const dCol = header.indexOf('Date');
  const sCol = header.indexOf('Staff');
  const outCol = header.indexOf('TimeOut');
  if (dCol===-1 || sCol===-1 || outCol===-1) return -1;
  const last = sh.getLastRow();
  if (last <= 1) return -1;
  const vals = sh.getRange(2,1,last-1,header.length).getValues();
  const tStaff = String(staff||'').trim().toLowerCase();
  for (var i=vals.length-1;i>=0;i--){
    const r = vals[i];
    const rDate = ymdPH_(r[dCol]);
    const rStaff = String(r[sCol]||'').trim().toLowerCase();
    const rOut = String(r[outCol]||'').trim();
    if (rStaff===tStaff && rDate===dateStr && !rOut) return i+2; // 2-based
  }
  return -1;
}

// Find last open GymEntries row for a member for a given date (no TimeOut yet)
function findLastOpenGymRow_(sh, header, memberId, dateStr){
  const dCol = header.indexOf('Date');
  const mCol = header.indexOf('MemberID');
  const outCol = header.indexOf('TimeOut');
  if (dCol===-1 || mCol===-1 || outCol===-1) return -1;
  const last = sh.getLastRow();
  if (last <= 1) return -1;
  const vals = sh.getRange(2,1,last-1,header.length).getValues();
  const tId = String(memberId||'').trim().toLowerCase();
  for (var i=vals.length-1;i>=0;i--){
    const r = vals[i];
    const rDate = ymdPH_(r[dCol]);
    const rId = String(r[mCol]||'').trim().toLowerCase();
    const rOut = String(r[outCol]||'').trim();
    if (rId===tId && rDate===dateStr && !rOut) return i+2; // 2-based
  }
  return -1;
}

/***** PAYMENTS / PRICING / MEMBERS HELPERS *****/
function listPayments_(){
  const sh = getSheet_('Payments');
  const header = readHeader_(sh);
  const rows = rowsAsObjects_(sh, header).map(r => {
    if ('Date' in r && r.Date) r.Date = ymdPH_(r.Date);
    if ('Time' in r && r.Time) r.Time = hmPH_(r.Time);
    if ('StartDate' in r && r.StartDate) r.StartDate = ymdPH_(r.StartDate);
    if ('EndDate' in r && r.EndDate) r.EndDate = ymdPH_(r.EndDate);
    if ('GymValidUntil' in r && r.GymValidUntil) r.GymValidUntil = ymdPH_(r.GymValidUntil);
    if ('CoachValidUntil' in r && r.CoachValidUntil) r.CoachValidUntil = ymdPH_(r.CoachValidUntil);
    return r;
  });
  return { ok:true, sheet:'Payments', headers:header, rows, data:rows };
}
function listPricing_(){
  const sh = getSheet_('Pricing');
  const header = readHeader_(sh);
  const rows = rowsAsObjects_(sh, header);
  return { ok:true, sheet:'Pricing', headers:header, rows, data:rows };
}
function listMembersLite_(){
  const sh = getSheet_('Members');
  const header = readHeader_(sh);
  const rows = rowsAsObjects_(sh, header).map(r => ({
    MemberID: r.MemberID || '',
    Nickname: r.NickName || r.Nickname || r['Nick Name'] || '',
    FirstName: r.FirstName || r.First || '',
    LastName: r.LastName || r.Last || ''
  }));
  return { ok:true, sheet:'Members', rows, data:rows };
}
// Primary attendant = currently clocked in today if any; else last entry today.
// currentPrimaryAttendant_ removed per cleanup; no longer exposed or stored
function inclusiveEnd_(startYMD, days){
  if (!startYMD || !days) return '';
  var d = new Date(startYMD + 'T00:00:00');
  d.setDate(d.getDate() + Math.max(0, Number(days) - 1));
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}
function findPricingByParticulars_(name){
  const sh = getSheet_('Pricing');
  const header = readHeader_(sh);
  const rows = rowsAsObjects_(sh, header);
  for (var i=0;i<rows.length;i++){
    if (String(rows[i].Particulars||'').trim() === String(name||'').trim()) return rows[i];
  }
  return null;
}
function ensureMode_(mode){
  var m = String(mode||'').trim();
  if (m !== 'Cash' && m !== 'GCash') throw new Error('Mode must be Cash or GCash');
  return m;
}

/***** GET *****/
function doGet(e){
  try{
    const p = (e && e.parameter) || {};
    const action = (p.action || p.op || 'list').toLowerCase();

    if (action === 'attendance'){
      const dateStr = ymdPH_(p.date ? new Date(p.date) : nowPH_());
      const sh = getSheet_('Attendance');
      const header = readHeader_(sh);
      const all = rowsAsObjects_(sh, header);
      const attRows = all.filter(r => ymdPH_(r['Date']) === dateStr);
      return asJson_({ ok:true, sheet:'Attendance', date:dateStr, headers:header, rows:attRows, data:attRows });
    }

  if (action === 'pricing') return asJson_(listPricing_());
  if (action === 'members') return asJson_(listMembersLite_());
  if (action === 'payments') return asJson_(listPayments_());

    const sheetName = p.sheet;
    if (!sheetName) return asJson_({ ok:false, error:'Missing sheet name' });
    const sh = getSheet_(sheetName);
    const header = readHeader_(sh);
    const rows = rowsAsObjects_(sh, header);
    return asJson_({ ok:true, sheet:sheetName, headers:header, rows, data:rows });
  } catch(err){
    return asJson_({ ok:false, error:String(err) });
  }
}

/***** POST (single consolidated version) *****/
function doPost(e){
  try{
    let data = {};
    if (e.postData && e.postData.type && e.postData.type.indexOf('application/json') !== -1) {
      data = JSON.parse(e.postData.contents || '{}');
    } else {
      data = { ...(e.parameter || {}) };
      if (typeof data.row === 'string') { try { data.row = JSON.parse(data.row); } catch(_){} }
    }
    const op = (data.op || '').toLowerCase();

    // Upload photo
    if (op === 'uploadphoto'){
      const url = uploadPhoto_(
        data.memberId || data.memberID,
        data.filename || ((data.memberId || data.memberID || 'photo') + '.jpg'),
        data.mime || 'image/jpeg',
        data.data
      );
      return asJson_({ ok:true, url });
    }

    // Attendance ops
    if (op === 'clockin' || op === 'clockout' || op === 'upsertattendance'){
      const sh = getSheet_('Attendance');
      const header = readHeader_(sh);
      const lock = LockService.getScriptLock(); try{ lock.tryLock(5000); }catch(_){}

      const rowObj = data.row ? data.row : data;
      const staff = String(rowObj.Staff ?? rowObj.staff ?? rowObj.StaffName ?? rowObj.staffName ?? '').trim();
      if (!staff) return asJson_({ ok:false, error:'Missing Staff' });

      const now = nowPH_();
      const dateStr = ymdPH_(now);
      const timeNow = hmPH_(now);

      const wantsOut = (op === 'clockout') || (!!rowObj.TimeOut && String(rowObj.TimeOut).length>0);

      let rowNumber = -1, created = false;

      if (!wantsOut){
        const obj = { Date: dateStr, Staff: staff, TimeIn: timeNow, TimeOut: '', NoOfHours: '' };
        appendByHeader_(sh, header, obj);
        rowNumber = sh.getLastRow();
        created = true;
      } else {
        const inCol = header.indexOf('TimeIn');
        const outCol = header.indexOf('TimeOut');
        const hrsCol = header.indexOf('NoOfHours');

        rowNumber = findLastOpenRow_(sh, header, staff, dateStr);
        if (rowNumber === -1){
          const obj = { Date: dateStr, Staff: staff, TimeIn: timeNow, TimeOut: timeNow, NoOfHours: 0 };
          appendByHeader_(sh, header, obj);
          rowNumber = sh.getLastRow();
          created = true;
        } else {
          const row = sh.getRange(rowNumber, 1, 1, header.length).getValues()[0];
          row[outCol] = timeNow;
          const tin = String(row[inCol] || '');
          const tout = String(row[outCol] || '');
          if (hrsCol !== -1 && tin && tout) row[hrsCol] = sessionHours_(dateStr, tin, tout);
            // Update Workouts field if present in payload and header
            const workoutsCol = header.indexOf('Workouts');
            if (workoutsCol !== -1 && (rowObj.Workouts || rowObj.workouts)) {
              row[workoutsCol] = rowObj.Workouts || rowObj.workouts;
            }
          sh.getRange(rowNumber, 1, 1, header.length).setValues([row]);
        }
      }

      try{ lock.releaseLock(); }catch(_){}
      return asJson_({ ok:true, created, rowNumber, date:dateStr, time:timeNow });
    }

    // GymEntries ops (member check-in/out)
    if (op === 'gymclockin' || op === 'gymclockout' || op === 'upsertgymentry'){
      const sh = getSheet_('GymEntries');
      const header = readHeader_(sh);
      const lock = LockService.getScriptLock(); try{ lock.tryLock(5000); }catch(_){ }

      const rowObj = data.row ? data.row : data;
      const memberId = String(rowObj.MemberID || rowObj.memberId || rowObj.memberID || '').trim();
      if (!memberId) return asJson_({ ok:false, error:'MemberID is required' });

      const now = nowPH_();
      const dateStr = ymdPH_(now);
      const timeNow = hmPH_(now);

      const wantsOut = (op === 'gymclockout') || (!!rowObj.TimeOut && String(rowObj.TimeOut).length>0);

      let rowNumber = -1, created = false;

      if (!wantsOut){
          const obj = {
            Date: dateStr,
            MemberID: memberId,
            TimeIn: timeNow,
            TimeOut: '',
            NoOfHours: '',
            Coach: rowObj.Coach || rowObj.coach || '',
            Focus: rowObj.Focus || rowObj.focus || '',
            Comments: rowObj.Comments || rowObj.comments || ''
          };
          appendByHeader_(sh, header, obj);
          rowNumber = sh.getLastRow();
          created = true;
      } else {
        const inCol = header.indexOf('TimeIn');
        const outCol = header.indexOf('TimeOut');
        const hrsCol = header.indexOf('NoOfHours');

        rowNumber = findLastOpenGymRow_(sh, header, memberId, dateStr);
        if (rowNumber === -1){
          const obj = { Date: dateStr, MemberID: memberId, TimeIn: timeNow, TimeOut: timeNow, NoOfHours: 0 };
          appendByHeader_(sh, header, obj);
          rowNumber = sh.getLastRow();
          created = true;
        } else {
          const row = sh.getRange(rowNumber, 1, 1, header.length).getValues()[0];
          row[outCol] = timeNow;
          const tin = String(row[inCol] || '');
          const tout = String(row[outCol] || '');
          if (hrsCol !== -1 && tin && tout) row[hrsCol] = sessionHours_(dateStr, tin, tout);
          sh.getRange(rowNumber, 1, 1, header.length).setValues([row]);
        }
      }

      try{ lock.releaseLock(); }catch(_){}
      return asJson_({ ok:true, created, rowNumber, date:dateStr, time:timeNow });
    }

    // Payments: addpayment (server defaults + validity)
    if (op === 'addpayment'){
      const sh = getSheet_('Payments');
      const header = readHeader_(sh);

      const now = nowPH_();
      const dateStr = ymdPH_(now);
      const timeStr = hmPH_(now);

      const row = data.row ? data.row : data;

      var particulars = String(row.Particulars||'').trim();
      if (!particulars) throw new Error('Particulars is required');

      const pricing = findPricingByParticulars_(particulars);
      if (!pricing) throw new Error('Particulars not found in Pricing');

      const cost = pricing.Cost || 0;
      const validity = Number(pricing.Validity || 0);

      const start = row.StartDate ? ymdPH_(new Date(row.StartDate)) : dateStr;
      const end = validity ? inclusiveEnd_(start, validity) : '';

      const obj = {
        Date: dateStr,
        Time: timeStr,
        MemberID: row.MemberID || '',
        Particulars: particulars,
        StartDate: start,
        EndDate: end,
        GymValidUntil: row.GymValidUntil ? ymdPH_(new Date(row.GymValidUntil)) : '',
        CoachValidUntil: row.CoachValidUntil ? ymdPH_(new Date(row.CoachValidUntil)) : '',
        Mode: ensureMode_(row.Mode),
        Cost: cost
      };
      if (!obj.MemberID) throw new Error('MemberID is required');

      appendByHeader_(sh, header, obj);
      return asJson_({ ok:true, sheet:'Payments', row: obj });
    }

    // Update existing member by MemberID
    if (op === 'updatemember'){
      const sh = getSheet_('Members');
      const header = readHeader_(sh);

      const rowObj = data.row ? data.row : data;
      const memberId = String(rowObj.MemberID || rowObj.memberId || rowObj.memberID || '').trim();
      if (!memberId) return asJson_({ ok:false, error:'MemberID is required' });

      const idCol = header.indexOf('MemberID');
      if (idCol === -1) return asJson_({ ok:false, error:'Members sheet missing MemberID column' });
      const last = sh.getLastRow();
      let rowNumber = -1;
      if (last > 1){
        const ids = sh.getRange(2, idCol+1, last-1, 1).getValues();
        for (var i=0;i<ids.length;i++){
          const v = String(ids[i][0]||'').trim();
          if (v.toLowerCase() === memberId.toLowerCase()) { rowNumber = i + 2; break; }
        }
      }
      if (rowNumber === -1) return asJson_({ ok:false, error:'Member not found' });

      // Load current row
      const rowVals = sh.getRange(rowNumber, 1, 1, header.length).getValues()[0];
      const current = Object.fromEntries(header.map((h, i) => [h, rowVals[i]]));

      // If NickName is provided and changed, enforce uniqueness excluding this row
      const nickHeader = ['NickName','Nick Name','Nickname'].find(n => header.indexOf(n) !== -1);
      if (nickHeader && (rowObj.NickName || rowObj.Nickname || rowObj['Nick Name'])){
        const newNick = String(rowObj.NickName || rowObj.Nickname || rowObj['Nick Name'] || '').trim();
        const oldNick = String(current[nickHeader]||'').trim();
        if (newNick && newNick.toLowerCase() !== oldNick.toLowerCase()){
          ensureUniqueNickExceptRow_(sh, header, newNick, rowNumber);
        }
      }

      // Build updated row: default to existing, override with provided fields
      const updated = header.map((h, i) => {
        if (h === 'MemberID') return current[h] || memberId; // never change MemberID
        if (Object.prototype.hasOwnProperty.call(rowObj, h)) return rowObj[h];
        // Accept case variants for few known fields
        const alt = rowObj[h] ?? rowObj[h.toLowerCase()] ?? rowObj[h.replace(/\s+/g,'')] ?? undefined;
        return alt !== undefined ? alt : current[h];
      });

      // Normalize date-like fields
      const msIdx = headerIndex_(header, ['MemberSince','Member Since','Join Date','Joined']);
      if (msIdx !== -1 && updated[msIdx]){
        const d = new Date(updated[msIdx]); if (!isNaN(d)) updated[msIdx] = d; else updated[msIdx] = current[header[msIdx]];
      }
      const bdIdx = headerIndex_(header, ['Birthday','Birth Date','DOB','Birthdate']);
      if (bdIdx !== -1 && updated[bdIdx]){
        const bd = new Date(updated[bdIdx]); if (!isNaN(bd)) updated[bdIdx] = bd;
      }

      // Coerce all cells to scalar types accepted by Sheets
      for (var i=0;i<updated.length;i++){ updated[i] = cellScalar_(updated[i]); }

      // Write back (with better error reporting); fall back to per-cell to find the culprit
      try{
        sh.getRange(rowNumber, 1, 1, header.length).setValues([updated]);
      } catch(err){
        // Fallback: try setting cell-by-cell to pinpoint the erroring column
        try{
          for (var c=1; c<=header.length; c++){
            try{
              sh.getRange(rowNumber, c).setValue(updated[c-1]);
            } catch(cellErr){
              var hname = header[c-1] || ('Col'+c);
              var v = updated[c-1];
              var t = (v instanceof Date) ? 'Date' : typeof v;
              var vs = '';
              try{ vs = (v instanceof Date) ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v); }catch(_){ vs='[unstringifiable]'; }
              return asJson_({ ok:false, error: 'Update failed at column '+c+' ('+hname+'): ' + String(cellErr) + ' valueType='+t+' value='+vs });
            }
          }
        } catch(perRowErr){
          return asJson_({ ok:false, error: 'Update failed (fallback): ' + String(perRowErr) });
        }
      }
      return asJson_({ ok:true, sheet:'Members', rowNumber });
    }

    // Generic INSERT (Members and other tabs)
    if (op !== 'insert') return asJson_({ ok:false, error:'Unknown POST op' });

    const lock = LockService.getScriptLock(); try{ lock.tryLock(5000); }catch(_){}
    try{
      const sheetName = data.sheet || data.Sheet || data.tab || 'Members';
      const sh = getSheet_(sheetName);
      const header = readHeader_(sh);

      const rowObj = data.row ? data.row : data;
      const clean = {}; header.forEach(h => clean[h] = rowObj[h] ?? '');

      if (sheetName === 'Members'){
        const nick = String(rowObj.NickName ?? rowObj.Nickname ?? rowObj['Nick Name'] ?? rowObj.nickName ?? rowObj.nickname ?? '').trim();
        ensureUniqueNick_(sh, header, nick);
        const msIdx = headerIndex_(header, ['MemberSince','Member Since','Join Date','Joined']);
        const today = nowPH_();
        let memberSinceDate = today;
        if (msIdx !== -1){
          const raw = clean[header[msIdx]];
          const dd = raw ? new Date(raw) : today;
          if (!isNaN(dd)) memberSinceDate = dd;
          clean[header[msIdx]] = memberSinceDate;
        }
        const baseId = buildMemberIdFromNick_(nick, memberSinceDate);
        const finalId = ensureUniqueMemberId_(sh, header, baseId, memberSinceDate);
        if (header.indexOf('MemberID') !== -1) clean['MemberID'] = finalId;

        // If a QR column exists, set it to an IMAGE() formula using a public QR endpoint
        var qrHeaderName = findQrHeaderName_(header);
        if (qrHeaderName) {
          var qrUrl = buildQrImageUrl_(finalId, 256);
          clean[qrHeaderName] = '=IMAGE("' + qrUrl.replace(/"/g,'""') + '")';
        }

        appendByHeader_(sh, header, clean);
        return asJson_({ ok:true, sheet:sheetName, memberId: clean['MemberID'] || '', qr: qrHeaderName ? clean[qrHeaderName] : '' });
      }

      appendByHeader_(sh, header, clean);
      return asJson_({ ok:true, sheet:sheetName });
    } finally {
      try{ lock.releaseLock(); }catch(_){}
    }
  } catch(err){
    return asJson_({ ok:false, error:String(err) });
  }
}