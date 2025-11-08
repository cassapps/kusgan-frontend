// Archived copy of the former full-page AddMember implementation.
// This file was moved from `src/pages/AddMember.jsx` because the app
// already uses `src/components/AddMemberModal.jsx` as the canonical
// Add Member UI. Keeping an archived copy for reference.

// src/archives/AddMember.page.jsx
import { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { fetchMembersFresh, uploadMemberPhoto, saveMember, fetchMemberById, updateMember } from "../api/sheets";

const APPS_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

// Drive helpers (for reliable preview rendering)
const driveId = (u) => {
  const s = String(u || "");
  const m = s.match(/(?:\/file\/d\/|[?&]id=|\/uc\?[^#]*id=)([^\/&?#]+)/);
  return m && m[1] ? m[1] : "";
};
const driveImg = (u) => {
  const s = String(u || "");
  if (!s) return "";
  const anyUrl = s.match(/https?:\/\/[^
\s}]+/);
  if (anyUrl) {
    const direct = anyUrl[0];
    if (/googleusercontent\.com\//.test(direct)) return direct;
    const mid = direct.match(/(?:\/file\/d\/|[?&]id=|\/uc\?[^#]*id=)([^\/&?#]+)/);
    if (mid && mid[1]) return `https://drive.google.com/uc?export=view&id=${mid[1]}`;
    return direct;
  }
  if (/googleusercontent\.com\//.test(s)) return s;
  const id = driveId(s);
  return id ? `https://drive.google.com/uc?export=view&id=${id}` : s;
};
const driveThumb = (u) => {
  const s = String(u || "");
  if (/googleusercontent\.com\//.test(s)) return s;
  const id = driveId(s);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : s;
};

// helpers
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const buildMemberId = (nick) => {
  const cleaned = (nick || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const d = new Date();
  const base = `${cleaned}${String(d.getFullYear()).slice(-2)}${String(
    d.getMonth() + 1
  ).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return base.slice(0, 12);
};
const isValidEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidPHMobile = (v) => /^09\d{9}$/.test(v);
const capFirst = (s) => {
  const str = String(s || "").trim();
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// sample lists
const BRGYS = ["Poblacion", "Himorasak", "Quiot", "Anislag"];
const MUNIS = ["Isabel", "Matag-ob", "Merida", "Ormoc"];

export default function AddMember() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const editPassed = location.state?.editOf || null;
  const editIdParam = params.memberId || null;

  // photo state
  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [camOpen, setCamOpen] = useState(false);
  const mediaStreamRef = useRef(null);

  const onPickPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  // Open device/web camera (desktop and mobile)
  const openCamera = async () => {
    // Camera requires a secure context
    const secure = window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!secure) {
      alert("Camera requires HTTPS or localhost. Please open the site on https:// or run locally.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Camera not available on this browser/device.");
      return;
    }
    try {
      const constraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      setCamOpen(true);
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.setAttribute("playsinline", "true"); // iOS Safari
          v.muted = true;
          v.play().catch(() => {});
        }
      });
    } catch (err) {
      // Do NOT auto-open file picker anymore
      alert("Unable to access camera. Please allow camera permission in your browser settings.");
    }
  };

  const closeCamera = () => {
    setCamOpen(false);
    mediaStreamRef.current?.getTracks?.().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Target: passport portrait 3:4 ratio, ~600x800px, ~<=300KB
    const PASSPORT_RATIO = 3 / 4; // width / height
    const TARGET_W = 600;
    const TARGET_H = 800;
    const MAX_BYTES = 300 * 1024;

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 960;

    // Compute centered crop to match 3:4 portrait
    const vRatio = vw / vh;
    let sx, sy, sw, sh;
    if (vRatio > PASSPORT_RATIO) {
      // too wide; crop sides
      sh = vh;
      sw = Math.round(vh * PASSPORT_RATIO);
      sx = Math.round((vw - sw) / 2);
      sy = 0;
    } else {
      // too tall; crop top/bottom
      sw = vw;
      sh = Math.round(vw / PASSPORT_RATIO);
      sx = 0;
      sy = Math.round((vh - sh) / 2);
    }

    // Draw to target size
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, TARGET_W, TARGET_H);

    const toBlobQ = (q) => new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));

    (async () => {
      let quality = 0.82;
      let blob = await toBlobQ(quality);
      while (blob && blob.size > MAX_BYTES && quality > 0.5) {
        quality -= 0.1;
        blob = await toBlobQ(quality);
      }
      if (!blob) return;
      const file = new File([blob], `passport-${Date.now()}.jpg`, { type: "image/jpeg" });
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      closeCamera();
    })();
  };

  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    middleName: "",
    nickName: "",
    gender: "",
    birthday: "",
    street: "",
    brgy: "",
    municipality: "",
    email: "",
    mobile: "",
    validId: "",
    student: false,
  });

  // Edit mode state
  const [isEdit, setIsEdit] = useState(false);
  const [existingId, setExistingId] = useState("");
  const [existingPhotoUrl, setExistingPhotoUrl] = useState("");

  const memberId = useMemo(() => buildMemberId(form.nickName), [form.nickName]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'student-select'){
      setForm((s) => ({ ...s, student: String(value) === 'Yes' }));
      return;
    }
    setForm((s) => ({ ...s, [name]: type === "checkbox" ? checked : value }));
  };

  const [saving, setSaving] = useState(false);
  const [nickError, setNickError] = useState("");
  const nickRef = useRef(null);
  const [toast, setToast] = useState(null);

  async function isNickTaken(nick) {
    const low = String(nick || "").trim().toLowerCase();
    if (!low) return false;
    try {
      const res = await fetchMembersFresh();
      const rows = (res?.rows ?? res?.data ?? []);
      return rows.some(r =>
        String(
          r.NickName ?? r.Nickname ?? r["Nick Name"] ?? r.nickName ?? r.nickname ?? ""
        ).trim().toLowerCase() === low
      );
    } catch {
      return false; // don’t block on network error; server will still enforce
    }
  }

  // Helper to robustly get a field from a row using multiple key variants
  function getVal(row, ...candidates){
    if (!row) return undefined;
    // direct hits first
    for (const k of candidates){ if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k]; }
    // lowercased and space/underscore variants
    const map = {};
    for (const [k,v] of Object.entries(row)) map[k.toLowerCase()] = v;
    for (const k of candidates){
      const kl = String(k).toLowerCase();
      if (map[kl] !== undefined && map[kl] !== "") return map[kl];
      const k1 = kl.replace(/\s+/g,"");
      if (map[k1] !== undefined && map[k1] !== "") return map[k1];
      const k2 = kl.replace(/\s+/g,"_");
      if (map[k2] !== undefined && map[k2] !== "") return map[k2];
    }
    return undefined;
  }

  // Prefill when in edit mode (from state or by fetching via :memberId)
  useEffect(() => {
    let alive = true;
    (async () => {
      try{
        const passed = editPassed;
        const idFromParam = editIdParam ? decodeURIComponent(editIdParam) : "";
        if (!passed && !idFromParam) return; // not edit
        setIsEdit(true);

        let row = passed;
        if (!row && idFromParam){
          const found = await fetchMemberById(idFromParam);
          if (found) row = found;
        }
        if (!row) return;

        // Normalize common keys from either raw or normalized object
        const memberIdVal = String(getVal(row,'MemberID','memberId','memberid','member_id','member_id_','Member ID','id')||"").trim();
        const ln = getVal(row,'LastName','lastName','lastname','last_name','Last');
        const fn = getVal(row,'FirstName','firstName','firstname','first_name','First');
        const mn = getVal(row,'MiddleName','middleName','middlename','middle_name');
        const nn = getVal(row,'NickName','Nickname','Nick Name','nickName','nick_name','nickname','nick');
        const gen = getVal(row,'Gender','gender');
        const bday = getVal(row,'Birthday','birthday','birth_date','dob','Birthdate','Birth Date');
        const street = getVal(row,'Street','street');
        const brgy = getVal(row,'Brgy','Barangay','brgy','barangay');
        const muni = getVal(row,'Municipality','City','municipality','city');
        const email = getVal(row,'Email','email');
        const mobile = getVal(row,'Mobile','Phone','mobile','phone');
        const validId = getVal(row,'ValidID','Valid Id','Valid ID','validId','valid_id','valid id');
        const student = String(getVal(row,'Student','student')||"").toLowerCase().startsWith('y');
        const photo = getVal(row,'PhotoURL','photoUrl','photourl','photo_url','photo');

        if (!alive) return;
        setExistingId(memberIdVal);
        setExistingPhotoUrl(photo||"");
        setForm({
          lastName: String(ln||"") ,
          firstName: String(fn||"") ,
          middleName: String(mn||"") ,
          nickName: String(nn||"") ,
          gender: String(gen||"") ,
          birthday: bday ? new Date(bday).toISOString().slice(0,10) : "",
          street: String(street||"") ,
          brgy: String(brgy||"") ,
          municipality: String(muni||"") ,
          email: String(email||"") ,
          mobile: String(mobile||"") ,
          validId: String(validId||"") ,
          student,
        });
        if (photo) setPhotoPreview(driveThumb(driveImg(photo)));
      }catch(_){ /* ignore */ }
    })();
    return () => { alive = false; };
  }, [editPassed, editIdParam]);

  // Local helper to build the 12-char preview ID (matches server logic)
  function buildLocalMemberId(nick, when = new Date()) {
    const clean = String(nick||"").replace(/[^A-Za-z0-9]/g,"").toUpperCase();
    const nick6 = clean.slice(0,6);
    const y = String(when.getFullYear()%100).padStart(2,"0");
    const m = String(when.getMonth()+1).padStart(2,"0");
    const d = String(when.getDate()).padStart(2,"0");
    return (nick6 + y + m + d).slice(0,12);
  }

  // submit handler
  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setNickError("");
    try {
      // 1) Client-side uniqueness check BEFORE any upload (skip for edit; server validates excluding self)
      if (!isEdit) {
        if (await isNickTaken(form.nickName)) {
          setNickError("Nick Name is already taken. Please choose a different one.");
          nickRef.current?.focus();
          setSaving(false);
          return;
        }
      }

      // 2) Normalize fields (Nick uppercase, names Capitalized)
      const nickUp = String(form.nickName || "").trim().toUpperCase();
      const ln = capFirst(form.lastName);
      const fn = capFirst(form.firstName);
      const mn = capFirst(form.middleName);

      // 3) Proceed with optional photo upload; use lowercase memberId base (existing for edit)
      const baseId = isEdit ? existingId : buildLocalMemberId(nickUp, new Date());
      const baseIdLower = String(baseId).toLowerCase();
      let photoUrl = "";
      if (photoFile) {
        const uploadRes = await uploadMemberPhoto(photoFile, baseIdLower);
        // Accept either { ok, url } or a direct URL string
        photoUrl = typeof uploadRes === "string" ? uploadRes : (uploadRes?.url || "");
      } else if (isEdit) {
        photoUrl = existingPhotoUrl || ""; // preserve if not changed
      }

      // 4) Build row payload (server also validates nick uniqueness)
      const row = {
        LastName: ln,
        FirstName: fn,
        MiddleName: mn,
        NickName: nickUp,
        Gender: form.gender,
        Birthday: form.birthday || "",
        Street: form.street.trim(),
        Brgy: form.brgy.trim(),
        Municipality: form.municipality.trim(),
        Email: form.email.trim(),
        Mobile: form.mobile.trim(),
        ValidID: form.validId.trim(),
        Student: form.student ? "Yes" : "No",
        PhotoURL: photoUrl,
      };

      if (isEdit) {
        const payload = { MemberID: existingId, ...row };
        const resp = await updateMember(payload);
        if (!resp?.ok) throw new Error(resp?.error || "Update failed");
        // Show a tiny toast before navigating back to detail
        setToast({ type: 'success', text: 'Member updated successfully' });
        const finalIdLower = String(existingId).toLowerCase();
        setTimeout(() => {
          navigate(`/members/${encodeURIComponent(finalIdLower)}`, { state: { row: { ...row, MemberID: finalIdLower } } });
        }, 700);
      } else {
        // Include MemberSince only on create
        const resp = await saveMember({ ...row, MemberSince: new Date() });
        if (!resp?.ok) throw new Error(resp?.error || "Save failed");
        const finalId = resp.memberId || baseIdLower;
        const finalIdLower = String(finalId).toLowerCase();
        // pass state row so details render immediately
        navigate(`/members/${encodeURIComponent(finalIdLower)}`, { state: { row: { ...row, MemberID: finalIdLower } } });
      }
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (/nick name is already taken/i.test(msg)) {
        setNickError("Nick Name is already taken. Please choose a different one.");
        nickRef.current?.focus();
      } else {
        alert(msg || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content">
      <h2>{isEdit ? "Edit Member" : "Add Member"}</h2>
      {toast && (
        <div style={{ position:'fixed', top:20, right:20, background: toast.type==='success'? '#16a34a':'#ef4444', color:'#fff', padding:'10px 14px', borderRadius:10, boxShadow:'0 6px 16px rgba(0,0,0,.15)', zIndex:9999 }}>
          {toast.text}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        {/* Camera + fields row (3 columns): Photo | Controls | Spacer */}
        <div className="form-grid-3">
          {/* Column 1: camera */}
          <div className="photo-section">
            {/* centered photo placeholder/preview */}
            {photoPreview ? (
              <img
                className="photo-preview"
                src={photoPreview}
                alt="preview"
              />
            ) : (
              <div className="photo-placeholder">No photo</div>
            )}
          </div>

          {/* Column 2: Open Camera + top rows */}
          <div>
            {/* Open Camera ABOVE Nick Name */}
            <div className="camera-row" style={{ marginBottom: 10 }}>
              <button type="button" className="camera-btn" onClick={openCamera} disabled={saving}
                title={isEdit ? "Capture a new photo to replace the existing one" : "Open camera to take a new photo"}>
                {isEdit ? "📷 Change Photo" : "📷 Open Camera"}
              </button>
              {/* hidden file input for fallback when camera is blocked */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPickPhoto}
                style={{ display: "none" }}
              />
            </div>

            {/* Nick Name with inline error */}
            <div className={`field ${nickError ? "error" : ""}`}>
              <label className="label">Nick Name *</label>
              <input
                ref={nickRef}
                name="nickName"
                value={form.nickName}
                onChange={(e) => { setNickError(""); onChange(e); }}
                required
                aria-invalid={!!nickError}
                aria-describedby={nickError ? "nick-error" : undefined}
                disabled={saving || isEdit}
              />
              {isEdit && (
                <div style={{ fontSize:12, color:'#6b7280' }}>Nick Name is locked for existing members.</div>
              )}
              {nickError && (
                <div id="nick-error" className="small-error">
                  {nickError}
                </div>
              )}
            </div>

            {/* Row 1: Valid ID, Student */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, alignItems: 'end', marginTop: 10 }}>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Valid ID *</label>
                <input name="validId" value={form.validId} onChange={onChange} required disabled={saving} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label">Student</label>
                <select name="student-select" value={form.student ? 'Yes' : 'No'} onChange={onChange} disabled={saving}>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </div>
            </div>
          </div>

          {/* Column 3: empty spacer to keep alignment */}
          <div />
        </div>

        {/* Names (unchanged) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="field">
            <label className="label">Last Name *</label>
            <input name="lastName" value={form.lastName} onChange={onChange} required />
          </div>
          <div className="field">
            <label className="label">First Name *</label>
            <input name="firstName" value={form.firstName} onChange={onChange} required />
          </div>
          <div className="field">
            <label className="label">Middle Name</label>
            <input name="middleName" value={form.middleName} onChange={onChange} />
          </div>
        </div>

        {/* Row 2: Names (Last, First, Middle) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="field">
            <label className="label">Last Name *</label>
            <input name="lastName" value={form.lastName} onChange={onChange} required />
          </div>
          <div className="field">
            <label className="label">First Name *</label>
            <input name="firstName" value={form.firstName} onChange={onChange} required />
          </div>
          <div className="field">
            <label className="label">Middle Name</label>
            <input name="middleName" value={form.middleName} onChange={onChange} />
          </div>
        </div>

        {/* Row 3: Birthday, Gender */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label className="label">Birthday *</label>
            <input type="date" name="birthday" value={form.birthday} onChange={onChange} required />
          </div>
          <div className="field">
            <label className="label">Gender *</label>
            <select name="gender" value={form.gender} onChange={onChange} required>
              <option value="">— Select —</option>
              <option>Male</option>
              <option>Female</option>
            </select>
          </div>
        </div>

        {/* Contact */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label className="label">Mobile No. *</label>
            <input
              name="mobile"
              value={form.mobile}
              onChange={onChange}
              placeholder="09XXXXXXXXX"
              required
            />
          </div>
          <div className="field">
            <label className="label">Email Address</label>
            <input
              name="email"
              value={form.email}
              onChange={onChange}
              placeholder="name@example.com"
            />
          </div>
        </div>

        {/* Row 5: Municipality/City, Brgy., House/Street/Sitio */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
          <div className="field">
            <label className="label">Municipality / City</label>
            <input
              name="municipality"
              list="muni-list"
              value={form.municipality}
              onChange={onChange}
              placeholder="Type or select"
            />
            <datalist id="muni-list">
              {MUNIS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label className="label">Brgy.</label>
            <input
              name="brgy"
              list="brgy-list"
              value={form.brgy}
              onChange={onChange}
              placeholder="Type or select"
            />
            <datalist id="brgy-list">
              {BRGYS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label className="label">House No. / Street Name / Sitio</label>
            <input name="street" value={form.street} onChange={onChange} />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button type="button" className="back-btn" onClick={() => navigate(-1)} disabled={saving}>
            ← Back
          </button>
          <button type="submit" className="back-btn" disabled={saving}>
            {saving ? (isEdit ? "Saving…" : "Saving…") : (isEdit ? "💾 Save Changes" : "💾 Save Member")}
          </button>
        </div>

        {/* Simple camera modal */}
        {camOpen && (
          <div style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,.5)",
            display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999
          }}>
            <div style={{ background:"#fff", padding:16, borderRadius:12, width: "min(92vw, 720px)" }}>
              <video ref={videoRef} playsInline style={{ width:"100%", borderRadius:8 }} />
              <div style={{ display:"flex", gap:12, marginTop:12, justifyContent:"flex-end" }}>
                <button type="button" className="button" onClick={takePhoto}>📸 Capture</button>
                <button type="button" className="button" onClick={closeCamera}>Close</button>
              </div>
              <canvas ref={canvasRef} style={{ display:"none" }} />
            </div>
          </div>
        )}
      </form>

    </div>
  );
}
