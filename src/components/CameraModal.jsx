import { useEffect, useRef, useState } from "react";

export default function CameraModal({ open, onClose, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");

  // Stop current stream
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  // Start a stream for a specific device
  const startStream = async (id = "") => {
    setError("");
    stopStream();
    try {
      const constraints = {
        video: id
          ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      setError("Cannot access camera. Check site permissions and OS privacy settings.");
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
      await startStream();      // start with a default stream
      await refreshDevices();   // then list devices
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

        {error ? (
          <div style={{ color: "#d33", marginBottom: 12 }}>{error}</div>
        ) : (
          <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 10, background: "#000" }} />
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
          <button className="button btn-lg" onClick={takeSnapshot} disabled={!!error}>Capture</button>
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
