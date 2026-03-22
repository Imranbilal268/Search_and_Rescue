// SimView.jsx
// Embeds BuildingVisualizer.html in an iframe and communicates via postMessage:
//   parent → iframe:
//     RESCUEGRID_BUILDING_DATA   — initial building + scenario preview
//     RESCUEGRID_SIM_DATA        — full simulation playback, overrides preview
//     RESCUEGRID_PLACEMENT_MODE  — enter entity placement mode (mode string or null)
//     RESCUEGRID_UPDATE_AGENTS   — refresh agent markers after entity changes
//   iframe → parent:
//     RESCUEGRID_CELL_CLICK      — user clicked a cell {x, y, z}

import { useEffect, useRef, useState } from "react";

export default function SimView({ rawJson, simData, scenarioMode, liveScenario, onCellClick }) {
  const iframeRef = useRef(null);
  const [ready, setReady] = useState(false);

  function handleLoad() { setReady(true); }

  // When the iframe loads: send building data or sim data
  useEffect(() => {
    if (!ready || !iframeRef.current) return;
    if (simData) {
      iframeRef.current.contentWindow?.postMessage(
        { type: "RESCUEGRID_SIM_DATA", payload: simData },
        "*"
      );
    } else if (rawJson) {
      iframeRef.current.contentWindow?.postMessage(
        { type: "RESCUEGRID_BUILDING_DATA", payload: rawJson },
        "*"
      );
    }
  }, [ready, rawJson, simData]);

  // Sync placement mode into iframe when it changes
  useEffect(() => {
    if (!ready || !iframeRef.current) return;
    iframeRef.current.contentWindow?.postMessage(
      { type: "RESCUEGRID_PLACEMENT_MODE", payload: scenarioMode ?? null },
      "*"
    );
  }, [ready, scenarioMode]);

  // Sync live scenario (agents) into iframe when entities change
  useEffect(() => {
    if (!ready || !iframeRef.current || !liveScenario || simData) return;
    iframeRef.current.contentWindow?.postMessage(
      { type: "RESCUEGRID_UPDATE_AGENTS", payload: liveScenario },
      "*"
    );
  }, [ready, liveScenario, simData]);

  // Listen for click-to-place events from the iframe
  useEffect(() => {
    function handleMessage(e) {
      if (!e.data || e.data.type !== "RESCUEGRID_CELL_CLICK") return;
      onCellClick?.(e.data.payload.x, e.data.payload.y, e.data.payload.z);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onCellClick]);

  const hasContent = rawJson || simData;

  return (
    <div style={styles.wrapper}>
      {!hasContent && (
        <div style={styles.placeholder}>
          <span style={styles.placeholderIcon}>🚒</span>
          <p style={styles.placeholderText}>Load a building JSON to see the 3D viewer.</p>
          <p style={styles.placeholderHint}>
            The 3D viewer shows the building and scenario entities. Click <strong>Run Simulation</strong> to animate the rescue.
          </p>
        </div>
      )}
      {/* Always render the iframe so it loads at full size — display:none causes
          the Three.js renderer to initialise at 0×0 making the canvas black. */}
      <iframe
        ref={iframeRef}
        src="/BuildingVisualizer.html"
        style={{ ...styles.iframe, visibility: hasContent ? "visible" : "hidden" }}
        title="3D Building Viewer"
        onLoad={handleLoad}
      />
    </div>
  );
}

const styles = {
  wrapper: {
    width:          "100%",
    flex:           1,
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    minHeight:      0,
  },
  placeholder: {
    display:       "flex",
    flexDirection: "column",
    alignItems:    "center",
    gap:           "0.75rem",
    padding:       "3rem 2rem",
    background:    "rgba(255,255,255,.03)",
    border:        "1px solid rgba(255,255,255,.07)",
    borderRadius:  "12px",
    textAlign:     "center",
    maxWidth:      "380px",
    color:         "rgba(255,255,255,.5)",
  },
  placeholderIcon: { fontSize: "2.5rem" },
  placeholderText: { fontSize: "1rem", color: "rgba(255,255,255,.7)", margin: 0, fontWeight: "600", fontFamily: "'Outfit', sans-serif" },
  placeholderHint: { fontSize: "0.8rem", color: "rgba(255,255,255,.35)", margin: 0, lineHeight: 1.5, fontFamily: "'JetBrains Mono', monospace" },
  iframe: {
    width:     "100%",
    flex:      1,
    border:    "none",
    display:   "block",
    minHeight: "80vh",
  },
};
