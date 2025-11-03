import { useEffect, useRef, useState } from "react";

export default function QrScanModal({ open, onClose, onDetected }){
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const rafRef = useRef(0);
  const detectorRef = useRef(null);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (streamRef.current){
      streamRef.current.getTracks().forEach(t=>t.stop());
      streamRef.current = null;
    }
  };

  async function ensureDetector(){
    try{
      // Prefer native BarcodeDetector for QR codes
      if ("BarcodeDetector" in window){
        const formats = await window.BarcodeDetector.getSupportedFormats?.() || [];
        if (formats.includes("qr_code") || formats.includes("qr")){
          detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
          return true;
        }
      }
    }catch{ /* ignore */ }
    // No detector, we'll display manual input hint
    detectorRef.current = null;
    return false;
  }

  async function start(){
    setError("");
    const hasDetector = await ensureDetector();
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current; if (v){ v.srcObject = stream; await v.play().catch(()=>{}); }

      if (hasDetector){
        const tick = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
          try{
            const codes = await detectorRef.current.detect(videoRef.current);
            if (codes && codes.length){
              const raw = String(codes[0].rawValue || codes[0].raw || "").trim();
              if (raw){
                onDetected?.(raw);
                onClose?.();
                return;
              }
            }
          }catch{ /* ignore */ }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setError("QR scanning isn't supported by this browser. Type the ID instead.");
      }
    }catch(e){
      const name = e?.name || "";
      if (name === "NotAllowedError") setError("Camera permission denied. Allow access in browser/site settings.");
      else if (name === "NotFoundError") setError("No camera found.");
      else setError("Cannot access camera.");
    }
  }

  useEffect(()=>{
    if (!open){ stop(); return; }
    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontWeight:800 }}>Scan QR Code</div>
          <button className="button btn-lg" style={{ background:'#555' }} onClick={onClose}>Close</button>
        </div>
        {error && <div style={{ color:'#d33', marginBottom:8 }}>{error}</div>}
        <video ref={videoRef} playsInline muted style={{ width:'100%', borderRadius:10, background:'#000' }} />
        <div style={{ color:'#666', fontSize:12, marginTop:8 }}>Point the camera at the QR code.</div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  modal: { width:'min(720px, 92vw)', background:'#fff', borderRadius:12, padding:16, border:'1px solid #e7e8ef', boxShadow:'0 6px 24px rgba(0,0,0,.2)' },
};
