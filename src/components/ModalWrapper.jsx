import React, { createContext, useContext } from "react";

// When modals are nested we want the outermost ModalWrapper to render the overlay
// and header/close button. Inner ModalWrapper instances should only render the
// modal content container (no overlay/header) to avoid double-wrapping.
const ModalContext = createContext(false);

export default function ModalWrapper({ open, onClose, title, children, width = 760, maxHeight = '90vh', noWrapper = false, noInternalScroll = false }) {
  if (!open) return null;
  const isNested = useContext(ModalContext);

  // Use a single canonical modal width for consistency across the app.
  // The screenshot/respected modal uses ~1000px wide. We clamp to viewport using 96vw.
  const EFFECTIVE_WIDTH = 1000;
  const containerStyle = {
    width: `min(${EFFECTIVE_WIDTH}px, 96vw)`,
    background: "#fff",
    borderRadius: 14,
    padding: 16,
    border: "1px solid var(--light-border)",
    boxShadow: "0 20px 60px rgba(0,0,0,.2)",
    maxHeight: maxHeight,
    overflowY: "auto",
    overflowX: "hidden",
    boxSizing: "border-box",
  };

  if (isNested && !noWrapper) {
    // Render only the inner container when already inside a modal overlay
    return <div style={containerStyle}>{children}</div>;
  }

  // Outermost modal: render overlay and provide context to children
  return (
    <ModalContext.Provider value={true}>
      <div onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
        {/* When `noWrapper` is true we still render the overlay, but avoid the inner
            header/container constraints so caller content can control layout
            (useful for print-like modal content that must not scroll). */}
        {noWrapper ? (
          (() => {
            const containerNoWrap = {
              width: `min(${width}px, 96vw)`,
              background: '#fff',
              borderRadius: 14,
              padding: 16,
              border: '1px solid var(--light-border)',
              boxShadow: '0 20px 60px rgba(0,0,0,.2)',
              maxHeight: '98vh',
              overflow: 'visible',
              boxSizing: 'border-box',
            };
            return (
              <div style={containerNoWrap} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  {title ? <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div> : <div />}
                  <button type="button" className="button" onClick={onClose} style={{ background: '#eee', color: '#333' }}>✕</button>
                </div>
                {children}
              </div>
            );
          })()
          ) : noInternalScroll ? (
          // When `noInternalScroll` is requested, render the standard titled container
          // but clamp height and avoid inner scrollbars so the header remains visible
          // while content does not produce an internal scrollbar.
          (() => {
            const containerNoScroll = { ...containerStyle, maxHeight: '98vh', overflowY: 'visible' };
            return (
              <div style={containerNoScroll} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  {title ? <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div> : <div />}
                  <button type="button" className="button" onClick={onClose} style={{ background: "#eee", color: "#333" }}>✕</button>
                </div>
                {children}
              </div>
            );
          })()
        ) : (
          <div style={containerStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              {title ? <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div> : <div />}
              <button type="button" className="button" onClick={onClose} style={{ background: "#eee", color: "#333" }}>✕</button>
            </div>
            {children}
          </div>
        )}
      </div>
    </ModalContext.Provider>
  );
}
