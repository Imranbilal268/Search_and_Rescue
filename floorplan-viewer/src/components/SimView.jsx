// SimView.jsx
// Embeds BuildingVisualizer.html in an iframe and communicates via postMessage:
//   - rawJson  → RESCUEGRID_BUILDING_DATA  (initial building + scenario preview)
//   - simData  → RESCUEGRID_SIM_DATA       (full simulation playback, overrides preview)

import { useEffect, useRef, useState } from "react";

export default function SimView({ rawJson, simData }) {
  const iframeRef = useRef(null);
  const [ready, setReady] = useState(false);

  function handleLoad() { setReady(true); }

  // When the iframe loads and we have a building, send the initial preview
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

  const hasContent = rawJson || simData;

  return (
    <div style={styles.wrapper}>
      {!hasContent && (
        <div style={styles.placeholder}>
          <span style={styles.placeholderIcon}>🚒</span>
          <p style={styles.placeholderText}>Load a building JSON to see the 3D viewer.</p>
          <p style={styles.placeholderHint}>
            The 3D viewer shows the building and scenario. Click <strong>Run Simulation</strong> to animate the rescue.
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
    background:    "#fff",
    border:        "1px solid #e5e7eb",
    borderRadius:  "12px",
    textAlign:     "center",
    maxWidth:      "380px",
  },
  placeholderIcon: { fontSize: "2.5rem" },
  placeholderText: { fontSize: "1rem", color: "#1a1a1a", margin: 0, fontWeight: "600" },
  placeholderHint: { fontSize: "0.8rem", color: "#666", margin: 0, lineHeight: 1.5 },
  iframe: {
    width:     "100%",
    flex:      1,
    border:    "none",
    display:   "block",
    minHeight: "80vh",
  },
};
