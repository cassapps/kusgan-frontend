import { useEffect, useMemo, useState, useRef } from "react";
import CameraModal from "./CameraModal";
import { updateMember, uploadMemberPhoto, fetchMemberById } from "../api/sheets";
import { MUNICIPALITIES, getBarangays } from "../utils/locations";

// Helpers to normalize values from possibly varying header keys
const lowerMap = (obj) => {
  const m = {};
  Object.entries(obj || {}).forEach(([k, v]) => (m[String(k).toLowerCase()] = v));
  return m;
};
const pickVal = (row, ...cands) => {
  if (!row) return "";
  for (const k of cands) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    const kl = String(k).toLowerCase();
    const m = lowerMap(row);
    if (m[kl] !== undefined && m[kl] !== "") return m[kl];
    const k1 = kl.replace(/\s+/g, "");
    if (m[k1] !== undefined && m[k1] !== "") return m[k1];
    const k2 = kl.replace(/\s+/g, "_");
    if (m[k2] !== undefined && m[k2] !== "") return m[k2];
  }
  return "";
};

function dataUrlToFile(dataUrl, filename = `photo-${Date.now()}.jpg`) {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)[1] || "image/jpeg";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

export default function EditMemberModal({ open, onClose, member, onSaved }) {
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
  const [existingId, setExistingId] = useState("");
  const [existingPhotoUrl, setExistingPhotoUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const previewUrlRef = useRef(null); // for object URL cleanup
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showCam, setShowCam] = useState(false);
  const [ok, setOk] = useState("");
  const initializedRef = useRef(false); // prevent re-prefill while editing
  // Dependent barangay list based on selected municipality
  const brgyOptions = getBarangays(form.municipality);

  // Drive helpers for reliable preview
  const driveId = (u) => {
    const s = String(u || "");
    const m = s.match(/(?:\/file\/d\/|[?&]id=|\/uc\?[^#]*id=)([^/&?#]+)/);
    return m && m[1] ? m[1] : "";
  };
  const driveImg = (u) => {
    const s = String(u || "");
    if (!s) return "";
    const anyUrl = s.match(/https?:\/\/[^\s}]+/);
    if (anyUrl) {
      const direct = anyUrl[0];
      if (/googleusercontent\.com\//.test(direct)) return direct;
      const mid = direct.match(/(?:\/file\/d\/|[?&]id=|\/uc\?[^#]*id=)([^/&?#]+)/);
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

  // Prefill once per open. Avoid resetting user input if parent re-renders or member prop refreshes.
  useEffect(() => {
    if (!open) { initializedRef.current = false; return; }
    if (initializedRef.current) return; // already initialized for this open session
    const row = member || {};
    const id = String(pickVal(row, "MemberID", "memberId", "member_id", "id") || "").trim();
    setExistingId(id);
    const ln = pickVal(row, "LastName", "lastName", "last_name", "Last");
    const fn = pickVal(row, "FirstName", "firstName", "first_name", "First");
    const mn = pickVal(row, "MiddleName", "middleName", "middle_name");
    const nn = pickVal(row, "NickName", "nickname", "nick_name", "Nick Name");
    const gen = pickVal(row, "Gender", "gender");
    const bday = pickVal(row, "Birthday", "birth_date", "dob", "Birth Date");
    const street = pickVal(row, "Street", "street");
    const brgy = pickVal(row, "Brgy", "Barangay", "brgy", "barangay");
    const muni = pickVal(row, "Municipality", "City", "municipality", "city");
    const email = pickVal(row, "Email", "email");
    const mobile = pickVal(row, "Mobile", "Phone", "mobile", "phone");
    const validId = pickVal(row, "ValidID", "Valid Id", "Valid ID", "validId", "valid_id");
    const student = String(pickVal(row, "Student", "student") || "").toLowerCase().startsWith("y");
  const photo = pickVal(row, "PhotoURL", "photoUrl", "photo_url", "photo");
  const normalized = photo ? driveThumb(driveImg(photo)) : "";
  setExistingPhotoUrl(photo || "");
  setPhotoPreview(normalized);
    setPhotoFile(null);
    setErr("");
  const candidateBrgy = String(brgy || "");
    setForm({
      lastName: String(ln || ""),
      firstName: String(fn || ""),
      middleName: String(mn || ""),
      nickName: String(nn || ""),
      gender: String(gen || ""),
      birthday: bday ? new Date(bday).toISOString().slice(0, 10) : "",
      street: String(street || ""),
  brgy: candidateBrgy,
      municipality: String(muni || ""),
      email: String(email || ""),
      mobile: String(mobile || ""),
      validId: String(validId || ""),
      student,
    });
    // If the prefilled barangay is not in the allowed list for the municipality, keep it in value but it won't show in options until user adjusts.
    initializedRef.current = true;
  }, [open, member]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "student-select") {
      setForm((s) => ({ ...s, student: String(value) === "Yes" }));
      return;
    }
    if (name === "municipality") {
      setForm((s) => ({ ...s, municipality: value, brgy: "" }));
      return;
    }
    setForm((s) => ({ ...s, [name]: type === "checkbox" ? checked : value }));
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
    const url = URL.createObjectURL(f);
    previewUrlRef.current = url;
    setPhotoFile(f);
    setPhotoPreview(url);
  };

  const onCapture = (dataUrl) => {
    try {
      const f = dataUrlToFile(dataUrl);
      if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
      const url = URL.createObjectURL(f);
      previewUrlRef.current = url;
      setPhotoFile(f);
      setPhotoPreview(url);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
    };
  }, []);

  const sameAfterUpdate = (a, b) => {
    if (!a || !b) return false;
    const norm = (v) => String(v ?? "").trim();
    return (
      norm(a.LastName) === norm(b.LastName) &&
      norm(a.FirstName) === norm(b.FirstName) &&
      norm(a.MiddleName) === norm(b.MiddleName) &&
      norm(a.Gender) === norm(b.Gender) &&
      norm(a.Birthday) === norm(b.Birthday) &&
      norm(a.Street) === norm(b.Street) &&
      norm(a.Brgy) === norm(b.Brgy) &&
      norm(a.Municipality) === norm(b.Municipality) &&
      norm(a.Email) === norm(b.Email) &&
      norm(a.Mobile) === norm(b.Mobile) &&
      norm(a.ValidID) === norm(b.ValidID) &&
      norm(a.Student) === norm(b.Student)
    );
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!existingId) { setErr("Missing MemberID"); return; }
    setBusy(true);
    setErr("");
    try {
      // Upload photo first if changed
      let photoUrl = existingPhotoUrl || "";
      if (photoFile) {
        const res = await uploadMemberPhoto(photoFile, String(existingId).toLowerCase());
        photoUrl = typeof res === "string" ? res : (res?.url || photoUrl);
      }

      const payload = {
        MemberID: existingId,
        LastName: form.lastName.trim(),
        FirstName: form.firstName.trim(),
        MiddleName: form.middleName.trim(),
        NickName: String(form.nickName || "").trim().toUpperCase(), // locked in UI, but keep normalized
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

      const resp = await updateMember(payload);
      if (!resp?.ok) {
        // Best-effort verification: refetch to check if the update actually applied
        try{
          const fresh = await fetchMemberById(String(existingId).trim());
          if (fresh && sameAfterUpdate(payload, fresh)) {
            setOk("Member updated successfully");
            setTimeout(() => { onSaved?.(); onClose?.(); setOk(""); }, 800);
            return;
          }
        } catch { /* ignore verify error */ }
        throw new Error(resp?.error || "Update failed");
      }
      setOk("Member updated successfully");
      setTimeout(() => { onSaved?.(); onClose?.(); setOk(""); }, 800);
    } catch (e2) {
      setErr(e2.message || "Failed to update member");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <form onSubmit={save} style={{ width: "min(1000px, 96vw)", maxHeight: "90vh", overflow: "auto", background: "#fff", borderRadius: 14, padding: 16, border: "1px solid var(--light-border)", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{form.nickName || "Edit Member"}</div>
          <button type="button" className="button" onClick={onClose} style={{ background: "#eee", color: "#333" }}>✕</button>
        </div>

        {err && <div className="small-error" style={{ marginBottom: 8 }}>{err}</div>}
        {ok && (
          <div style={{ position: 'fixed', top: 20, right: 20, background: '#16a34a', color: '#fff', padding: '8px 12px', borderRadius: 10, boxShadow: '0 6px 16px rgba(0,0,0,.15)', zIndex: 10000 }}>
            {ok}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16 }}>
          {/* Photo */}
          <div>
            <div style={{ width: 240, height: 240, border: "1px solid var(--light-border)", borderRadius: 12, background: "#fafbff", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {photoPreview ? (
                <img src={photoPreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ color: "var(--muted)" }}>No photo</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" className="button" onClick={() => setShowCam(true)} disabled={busy} style={{ flex: '1 1 auto' }}>📷 Change Photo</button>
              {/* Removed Upload button to make Change Photo wider */}
            </div>
          </div>

          {/* Fields: arranged by rows as requested */}
          <div style={{ display: "grid", gap: 12 }}>
            {/* Row 1: Valid ID, Student */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, alignItems: 'end' }}>
              <label className="field" style={{ margin: 0 }}>
                <span className="label">Valid ID *</span>
                <input name="validId" value={form.validId} onChange={onChange} required />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="label">Student</span>
                <select name="student-select" value={form.student ? 'Yes' : 'No'} onChange={onChange}>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </label>
            </div>

            {/* Row 2: Last, First, Middle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <label className="field">
                <span className="label">Last Name *</span>
                <input name="lastName" value={form.lastName} onChange={onChange} required />
              </label>
              <label className="field">
                <span className="label">First Name *</span>
                <input name="firstName" value={form.firstName} onChange={onChange} required />
              </label>
              <label className="field">
                <span className="label">Middle Name</span>
                <input name="middleName" value={form.middleName} onChange={onChange} />
              </label>
            </div>

            {/* Row 3: Birthday, Gender */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span className="label">Birthday *</span>
                <input type="date" name="birthday" value={form.birthday} onChange={onChange} required />
              </label>
              <label className="field">
                <span className="label">Gender *</span>
                <select name="gender" value={form.gender} onChange={onChange} required>
                  <option value="">— Select —</option>
                  <option>Male</option>
                  <option>Female</option>
                </select>
              </label>
            </div>

            {/* Row 4: Mobile, Email */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span className="label">Mobile No. *</span>
                <input name="mobile" value={form.mobile} onChange={onChange} placeholder="09XXXXXXXXX" required />
              </label>
              <label className="field">
                <span className="label">Email Address</span>
                <input name="email" value={form.email} onChange={onChange} placeholder="name@example.com" />
              </label>
            </div>

            {/* Row 5: Municipality/City, Brgy., House/Street/Sitio */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
              <label className="field">
                <span className="label">Municipality / City</span>
                <select name="municipality" value={form.municipality} onChange={onChange}>
                  <option value=""></option>
                  {MUNICIPALITIES.map((m)=> (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Brgy.</span>
                <select name="brgy" value={form.brgy} onChange={onChange} disabled={!form.municipality}>
                  <option value=""></option>
                  {brgyOptions.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">House No. / Street Name / Sitio</span>
                <input name="street" value={form.street} onChange={onChange} />
              </label>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="back-btn" onClick={onClose} style={{ background: "#e5e7eb", color: "#111", fontWeight: 700 }}>Cancel</button>
          <button type="submit" className="primary-btn" disabled={busy}>💾 Save Changes</button>
        </div>

        <CameraModal open={showCam} onClose={() => setShowCam(false)} onCapture={onCapture} />
      </form>
    </div>
  );
}
