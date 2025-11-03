import { useEffect, useRef, useState } from "react";

export default function CameraModal({ open, onClose, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const startingRef = useRef(false);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  // Stop current stream
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  // Start a stream for a specific device
  const startStream = async (id = "") => {
    if (startingRef.current) return;
    startingRef.current = true;
    setIsStarting(true);
    setError("");
    stopStream();
  try {
      const preferred = id
        ? { video: { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
        : { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(preferred);
      } catch (err1) {
        // Fallbacks for common failures
        try {
          const fallback = id
            ? { video: { deviceId: { ideal: id } }, audio: false }
            : { video: true, audio: false };
          stream = await navigator.mediaDevices.getUserMedia(fallback);
        } catch (err2) {
          const e = err2 || err1;
          const name = e && e.name ? String(e.name) : "";
          if (name === "NotAllowedError") {
            setError("Camera permission denied. Please allow camera access in the browser site settings and macOS Privacy > Camera.");
          } else if (name === "NotReadableError") {
            setError("Camera is busy or not readable. Close other apps using the camera (e.g., Zoom/Meet/FaceTime) and try again.");
          } else if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
            setError("Selected camera doesn't meet constraints. Try choosing a different camera.");
          } else if (name === "NotFoundError") {
            setError("No camera found. Plug in a camera or check system permissions.");
          } else {
            setError("Cannot access camera. Check site permissions and OS privacy settings.");
          }
          return; // stop on failure
        }
      }

      // Success path
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch { /* ignore play errors (autoplay), stream is set */ }
      }
      // After success, refresh device labels (permissions granted now)
      try { await refreshDevices(); } catch { /* ignore */ }
    } catch (e) {
      setError("Cannot access camera. Check site permissions and OS privacy settings.");
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  };

  // Enumerate video devices (after first permission grant, labels appear)
  const refreshDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      if (!deviceId && cams[0]) setDeviceId(cams[0].deviceId);
    } catch {
      /* ignore */
    }
  };

  // Open/close lifecycle
  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }
    (async () => {
      setError("");
      // Proactively request permission and begin streaming; this also helps reveal device labels
      await startStream(deviceId || "");
    })();

    // listen for device changes (e.g., plug/unplug USB camera)
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);

    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Switch camera when the selector changes
  useEffect(() => {
    if (!open || !deviceId) return;
    try {
      const currentId = streamRef.current?.getVideoTracks?.()[0]?.getSettings?.().deviceId || "";
      if (currentId && currentId === deviceId) return; // already on this device
    } catch { /* ignore */ }
    startStream(deviceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    onCapture?.(dataUrl);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>Camera</div>
          <button className="button btn-lg" style={{ background: "#555" }} onClick={onClose}>Close</button>
        </div>

        {/* Camera selector */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>Camera:</label>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e7e8ef" }}
          >
            {devices.length === 0 && <option value="">(No camera found)</option>}
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || "Camera"}
              </option>
            ))}
          </select>
        </div>

        {!error && !streamRef.current && (
          <div style={{ color: "#666", marginBottom: 8 }}>
            Initializing camera… please allow the browser prompt.
          </div>
        )}
        {error ? (
          <div style={{ color: "#d33", marginBottom: 12 }}>
            {error}
          </div>
        ) : (
          <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 10, background: "#000" }} />
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
          <button className="button btn-lg" onClick={takeSnapshot} disabled={!!error || !streamRef.current}>Capture</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    width: "min(720px, 92vw)", background: "#fff", borderRadius: 12,
    padding: 16, border: "1px solid #e7e8ef", boxShadow: "0 6px 24px rgba(0,0,0,.2)",
  },
};
