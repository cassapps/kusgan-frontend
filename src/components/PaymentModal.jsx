import React, { useEffect, useMemo, useState } from "react";
import { addPayment, fetchPricing } from "../api/sheets";
import ModalWrapper from "./ModalWrapper";
import events from "../lib/events";

const MANILA_TZ = "Asia/Manila";

// Manila today YYYY-MM-DD
const manilaTodayYMD = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

// Format any date as YYYY-MM-DD in Manila time
const toManilaYMD = (d) => {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

// Manila display: Mon-D, YYYY
const displayManila = (dOrYmd) => {
  if (!dOrYmd) return "-";
  let date;
  if (typeof dOrYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dOrYmd)) {
    const [y, m, d] = dOrYmd.split("-").map(Number);
    date = new Date(Date.UTC(y, m - 1, d));
  } else {
    date = dOrYmd instanceof Date ? dOrYmd : new Date(dOrYmd);
  }
  if (isNaN(date)) return "-";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TZ, month: "short", day: "numeric", year: "numeric" }).formatToParts(date);
  const m = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const y = parts.find((p) => p.type === "year")?.value || "";
  return `${m}-${day}, ${y}`;
};

// Inclusive end-date: end = start + (days - 1)
const endDateFrom = (startYMD, validityDays) => {
  if (!startYMD || !validityDays) return "";
  const [y, m, d] = startYMD.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + Math.max(0, Number(validityDays) - 1));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(utc);
};

const addDaysYMD = (startYMD, days) => {
  if (!startYMD) return "";
  const [y, m, d] = startYMD.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + Number(days || 0));
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(utc);
};

export default function PaymentModal({ open, onClose, memberId, onSaved, membershipEnd, coachEnd, isStudent, birthDate }) {
  const [pricing, setPricing] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    Particulars: "",
    StartDate: manilaTodayYMD(),
    EndDate: "",
    Mode: "",
    Cost: "",
  });

  useEffect(() => {
    if (!open) return;
    setError("");
  // Reset form; Start Date must be mandatory and default to today
  setForm({ Particulars: "", StartDate: manilaTodayYMD(), EndDate: "", Mode: "", Cost: "" });
    (async () => {
      try {
        const p = await fetchPricing();
        setPricing(p?.rows || p?.data || p || []);
      } catch (e) {
        setError(e.message || "Failed to load pricing");
      }
    })();
  }, [open]);

  // Senior check (>= 60) based on provided birthDate
  const isSenior = useMemo(() => {
    if (!birthDate) return false;
    const b = birthDate instanceof Date ? birthDate : new Date(birthDate);
    if (isNaN(b)) return false;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age >= 60;
  }, [birthDate]);

  // Off-peak availability (before 3pm Manila)
  const isOffPeakWindow = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TZ, hour12: false, hour: "2-digit", minute: "2-digit" }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
    return hour < 15; // before 15:00
  }, []);

  // Filter pricing based on eligibility rules
  const filteredPricing = useMemo(() => {
    const canDiscount = !!(isStudent || isSenior);
    return (pricing || []).filter((p) => {
      const name = String(p.Particulars || "");
      const isDiscounted = /(student|senior|discount|disc)/i.test(name);
      const isOffPeak = /off\s*-?\s*peak/i.test(name);
      if (isOffPeak && !isOffPeakWindow) return false;
      if (isDiscounted && !canDiscount) return false;
      return true;
    });
  }, [pricing, isStudent, isSenior, isOffPeakWindow]);

  // Clear selection if it becomes ineligible due to filters
  useEffect(() => {
    if (!form.Particulars) return;
    const stillThere = filteredPricing.some((p) => String(p.Particulars) === String(form.Particulars));
    if (!stillThere) setForm((f) => ({ ...f, Particulars: "", Cost: "", EndDate: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredPricing]);

  // Extract flags from pricing row
  const truthy = (v) => {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "yes" || s === "y" || s === "true" || s === "1";
  };
  const getFlags = (row) => {
    if (!row) return { gym: false, coach: false };
    const entries = Object.entries(row || {});
    const findVal = (keys) => {
      for (const [k, v] of entries) {
        const nk = k.toLowerCase().replace(/\s+/g, "");
        if (keys.some((kk) => nk === kk.toLowerCase().replace(/\s+/g, ""))) return v;
      }
      return undefined;
    };
    const gymFlag = truthy(findVal(["Gym membership", "Gym Membership", "GymMembership", "Membership"]))
    const coachFlag = truthy(findVal(["Coach subscription", "Coach Subscription", "CoachSubscription", "Coach"]))
    return { gym: gymFlag, coach: coachFlag };
  };

  const onParticulars = (val) => {
    const item = (filteredPricing || []).find((r) => String(r.Particulars) === String(val));
    const cost = item ? (parseFloat(item.Cost) || 0).toFixed(2) : "";
    const validity = item ? Number(item.Validity || 0) : 0;
    const flags = getFlags(item);
  const today = manilaTodayYMD();
  // Determine extension base: if covers gym/coach and existing validity is active, start from the next day
  // Use Manila YMD string comparisons to avoid timezone/parsing differences.
  const gymCurrentYMD = membershipEnd ? toManilaYMD(membershipEnd) : "";
  const coachCurrentYMD = coachEnd ? toManilaYMD(coachEnd) : "";
  // Compute separate bases for gym and coach so they don't force a single shared start
  const gymBase = flags.gym
    ? (gymCurrentYMD && gymCurrentYMD >= today ? addDaysYMD(gymCurrentYMD, 1) : today)
    : null;
  const coachBase = flags.coach
    ? (coachCurrentYMD && coachCurrentYMD >= today ? addDaysYMD(coachCurrentYMD, 1) : today)
    : null;

  // Determine a sensible default StartDate shown in the form:
  // - If item affects both gym and coach, default StartDate to today so coach (when missing)
  //   starts immediately while gym will still use gymBase when present.
  // - If only gym is affected, default to gymBase (so extension continues from current end).
  // - If only coach is affected, default to coachBase.
  // - Otherwise default to today.
  let startDefault = today;
  if (flags.gym && flags.coach) {
    startDefault = today;
  } else if (flags.gym && gymBase) {
    startDefault = gymBase;
  } else if (flags.coach && coachBase) {
    startDefault = coachBase;
  } else {
    startDefault = today;
  }

    setForm((f) => {
      const start = startDefault || f.StartDate || today;
      return {
        ...f,
        Particulars: val,
        Cost: cost,
        StartDate: start,
        EndDate: validity ? endDateFrom(start, validity) : "",
      };
    });
  };

  const onStartDate = (start) => {
    const item = (filteredPricing || []).find((r) => String(r.Particulars) === String(form.Particulars));
    const validity = item ? Number(item.Validity || 0) : 0;
    setForm((f) => ({ ...f, StartDate: start, EndDate: validity ? endDateFrom(start, validity) : "" }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!memberId) return setError("Missing MemberID");
    if (!form.Particulars) return setError("Select Particulars.");
    if (!form.Mode) return setError("Select a payment mode.");
    if (!form.Cost) return setError("Cost is missing for this item.");

    setBusy(true);
    setError("");
    try {
      // Derive the resulting new valid-until dates for gym/coach based on the selected item
      const item = (filteredPricing || []).find((r) => String(r.Particulars) === String(form.Particulars));
      const validity = item ? Number(item.Validity || 0) : 0;
      const flags = getFlags(item);
  const today = manilaTodayYMD();
  const gymCurrent = membershipEnd ? toManilaYMD(membershipEnd) : "";
  const coachCurrent = coachEnd ? toManilaYMD(coachEnd) : "";
  const gymBase = flags.gym ? (gymCurrent && gymCurrent >= today ? addDaysYMD(gymCurrent, 1) : form.StartDate || today) : null;
  const coachBase = flags.coach ? (coachCurrent && coachCurrent >= today ? addDaysYMD(coachCurrent, 1) : form.StartDate || today) : null;
      const gymNew = gymBase && validity ? endDateFrom(gymBase, validity) : "";
      const coachNew = coachBase && validity ? endDateFrom(coachBase, validity) : "";

      await addPayment({
        MemberID: memberId,
        Particulars: form.Particulars,
        StartDate: form.StartDate || "",
        EndDate: form.EndDate || "",
        GymValidUntil: gymNew,
        CoachValidUntil: coachNew,
        Mode: form.Mode,
        Cost: String(form.Cost).trim(),
      });
      if (onSaved) onSaved();
      onClose && onClose();
    } catch (e2) {
      const msg = e2?.message || "Failed to add payment";
      setError(msg);
      try { events.emit('modal:error', { message: msg, source: 'PaymentModal', error: String(e2) }); } catch(e) {}
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

    return (
  <ModalWrapper open={open} onClose={onClose} title="Add Payment" width={560} noInternalScroll={true}>
        <form onSubmit={submit} style={{ width: '100%' }}>
        {error && (
          <div className="small-error" style={{ marginBottom: 8 }}>{error}</div>
        )}

        {/* Membership validity snapshot (current only) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Gym Membership - Valid until</div>
            <div style={{ fontWeight: 700 }}>{membershipEnd ? displayManila(membershipEnd) : "-"}</div>
          </div>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Coach Subscription - Valid until</div>
            <div style={{ fontWeight: 700 }}>{coachEnd ? displayManila(coachEnd) : "-"}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="field" style={{ gridColumn: "1 / span 2" }}>
            <span className="label">Particulars</span>
            <select value={form.Particulars} onChange={(e) => onParticulars(e.target.value)} required>
              <option value="">Choose product/service</option>
              {filteredPricing.map((p, i) => (
                <option key={`${p.Particulars}-${i}`} value={p.Particulars}>
                  {p.Particulars}
                </option>
              ))}
            </select>
            {/* New validity preview below Particulars, soft pink */}
            {form.Particulars && (() => {
              const item = (filteredPricing || []).find((r) => String(r.Particulars) === String(form.Particulars));
              const flags = getFlags(item);
              const validity = item ? Number(item.Validity || 0) : 0;
              if (!validity) return null;
              const today = manilaTodayYMD();
              const gymCurrent = membershipEnd ? toManilaYMD(membershipEnd) : "";
              const coachCurrent = coachEnd ? toManilaYMD(coachEnd) : "";
              const gymBase = flags.gym ? (gymCurrent && gymCurrent >= today ? addDaysYMD(gymCurrent, 1) : form.StartDate || today) : null;
              const coachBase = flags.coach ? (coachCurrent && coachCurrent >= today ? addDaysYMD(coachCurrent, 1) : form.StartDate || today) : null;
              const gymNew = gymBase ? endDateFrom(gymBase, validity) : null;
              const coachNew = coachBase ? endDateFrom(coachBase, validity) : null;
              if (!gymNew && !coachNew) return null;
              return (
                <div style={{ background: "#fde8ef", border: "1px solid #ffd7e3", color: "#8b1a3b", marginTop: 8, padding: 8, borderRadius: 8, fontSize: 13, lineHeight: 1.35 }}>
                  {gymNew && (
                    <div>
                      New Gym valid until: <b>{displayManila(gymNew)}</b>
                    </div>
                  )}
                  {coachNew && (
                    <div>
                      New Coach valid until: <b>{displayManila(coachNew)}</b>
                    </div>
                  )}
                </div>
              );
            })()}
          </label>

          <label className="field">
            <span className="label">Mode</span>
            <select value={form.Mode} onChange={(e) => setForm((f) => ({ ...f, Mode: e.target.value }))} required>
              <option value="">Select mode…</option>
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
            </select>
          </label>

          <label className="field">
            <span className="label">Cost</span>
            <input type="number" step="0.01" min="0" value={form.Cost} readOnly disabled />
          </label>
        </div>

        <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 12 }}>
          Validity is applied inclusive of the Start Date.
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="back-btn" onClick={onClose} style={{ background: "#e5e7eb", color: "#111", fontWeight: 700 }}>Cancel</button>
          <button type="submit" className="primary-btn" disabled={busy}>+ Add Payment</button>
        </div>
        </form>
      </ModalWrapper>
    );
}
