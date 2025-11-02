// src/pages/AddMember.jsx
import { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMembersFresh, uploadMemberPhoto, saveMember } from "../api/sheets";

const APPS_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

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

// sample lists
const BRGYS = ["Poblacion", "Himorasak", "Quiot", "Anislag"];
const MUNIS = ["Isabel", "Matag-ob", "Merida", "Ormoc"];

export default function AddMember() {
  const navigate = useNavigate();

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
    const w = video.videoWidth || 800;
    const h = video.videoHeight || 600;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      closeCamera();
    }, "image/jpeg", 0.9);
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

  const memberId = useMemo(() => buildMemberId(form.nickName), [form.nickName]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((s) => ({ ...s, [name]: type === "checkbox" ? checked : value }));
  };

  const [saving, setSaving] = useState(false);
  const [nickError, setNickError] = useState("");
  const nickRef = useRef(null);

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
      // 1) Client-side uniqueness check BEFORE any upload
      if (await isNickTaken(form.nickName)) {
        setNickError("Nick Name is already taken. Please choose a different one.");
        nickRef.current?.focus();
        setSaving(false);
        return;
      }

      // 2) Proceed with optional photo upload
      const baseId = buildLocalMemberId(form.nickName, new Date()); // your existing helper
      let photoUrl = "";
      if (photoFile) {
        photoUrl = await uploadMemberPhoto(photoFile, baseId);
      }

      // 3) Save; server also validates nick uniqueness
      const row = {
        LastName: form.lastName.trim(),
        FirstName: form.firstName.trim(),
        MiddleName: form.middleName.trim(),
        NickName: form.nickName.trim(),
        Gender: form.gender,
        Birthday: form.birthday || "",
        Street: form.street.trim(),
        Brgy: form.brgy.trim(),
        Municipality: form.municipality.trim(),
        Email: form.email.trim(),
        Mobile: form.mobile.trim(),
        ValidID: form.validId.trim(),
        Student: form.student ? "Yes" : "No",
        MemberSince: new Date(),
        PhotoURL: photoUrl,
      };

      const resp = await saveMember(row);
      if (!resp?.ok) throw new Error(resp?.error || "Save failed");
      const finalId = resp.memberId || baseId;

      // pass state row so details render immediately
      navigate(`/members/${encodeURIComponent(finalId)}`, { state: { row: { ...row, MemberID: finalId } } });
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
      <h2>Add Member</h2>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        {/* Camera + fields row uses the same 3-col grid as the Names row.
           Camera in col 1; fields start in col 2 so they align with First Name. */}
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

          {/* Column 2: Open Camera + fields (aligned with First Name column) */}
          <div>
            {/* Open Camera ABOVE Nick Name */}
            <div className="camera-row" style={{ marginBottom: 10 }}>
              <button type="button" className="camera-btn" onClick={openCamera} disabled={saving}>
                📷 Open Camera
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
                disabled={saving}
              />
              {nickError && (
                <div id="nick-error" className="small-error">
                  {nickError}
                </div>
              )}
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <label className="label">Valid ID *</label>
              <input name="validId" value={form.validId} onChange={onChange} required disabled={saving} />
            </div>

            <label className="checkbox-label" style={{ marginTop: 12 }}>
              <input type="checkbox" name="student" checked={form.student} onChange={onChange} disabled={saving} />
              <span>Student?</span>
            </label>
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

        {/* Gender + Birthday */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label className="label">Gender *</label>
            <select name="gender" value={form.gender} onChange={onChange} required>
              <option value="">— Select —</option>
              <option>Male</option>
              <option>Female</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Birthday *</label>
            <input type="date" name="birthday" value={form.birthday} onChange={onChange} required />
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

        {/* Address */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
          <div className="field">
            <label className="label">House No. / St. Name</label>
            <input name="street" value={form.street} onChange={onChange} />
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
            <label className="label">Municipality or City</label>
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
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button type="button" className="back-btn" onClick={() => navigate(-1)} disabled={saving}>
            ← Back
          </button>
          <button type="submit" className="back-btn" disabled={saving}>
            {saving ? "Saving…" : "💾 Save Member"}
          </button>
        </div>
      </form>

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
    </div>
  );
}
