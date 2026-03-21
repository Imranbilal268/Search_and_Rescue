import { useState } from "react";
import FileUpload from "./fileUpload";
import FloorToggle from "./Floortoggle";
import GridView    from "./GridView";

// ─────────────────────────────────────────────────────────────────────────────
// EditorShell
//
// Top-level orchestrator. Owns all building state and passes slices
// down to child components as props.
//
// State:
//   building: {
//     floors:         string[][][]        — [z][y][x] compiled grid
//     buildingName:   string | null
//     roomLabels:     { "x,y,z": string }
//     cellProperties: { "x,y,z": object }
//   } | null
//
//   activeFloor: number
//
// Future additions that will live here (Steps 2–7):
//   stampsPerFloor: { [z]: Stamp[] }     — per-floor stamp lists
//   compiledGrids:  string[][][]         — output of stampCompiler
// ─────────────────────────────────────────────────────────────────────────────

export default function EditorShell() {
  const [building,    setBuilding]    = useState(null);
  const [activeFloor, setActiveFloor] = useState(0);

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Called by FileUpload with the normalised building object
  function handleLoad(data) {
    setBuilding(data);
    setActiveFloor(0);
  }

  // Return to the upload screen
  function handleReset() {
    setBuilding(null);
    setActiveFloor(0);
  }

  // ── Phase 1: no file loaded ──────────────────────────────────────────────
  if (!building) {
    return <FileUpload onLoad={handleLoad} />;
  }

  // ── Phase 2: viewer / editor ──────────────────────────────────────────────
  const { floors, buildingName, roomLabels, cellProperties } = building;

  return (
    <div style={styles.wrapper}>

      {/* ── Header ── */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Floor Plan Viewer</h1>
          {buildingName && <p style={styles.buildingName}>{buildingName}</p>}
        </div>
        <button style={styles.resetBtn} onClick={handleReset}>
          ↩ Load new file
        </button>
      </header>

      {/* ── Floor tab selector ── */}
      <FloorToggle
        count={floors.length}
        active={activeFloor}
        onChange={setActiveFloor}
      />

      {/* ── Pure grid renderer ── */}
      {/*
        GridView has no state of its own.
        EditorShell decides which floor to show and passes the
        compiled 2-D slice down. Future: StampPalette and FloorCanvas
        will sit alongside GridView here, feeding it a compiler-generated
        grid instead of the raw uploaded one.
      */}
      <main style={styles.main}>
        <GridView
          grid={floors[activeFloor]}
          floorIndex={activeFloor}
          roomLabels={roomLabels}
          cellProperties={cellProperties}
        />
      </main>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  wrapper: {
    display:         "flex",
    flexDirection:   "column",
    alignItems:      "center",
    minHeight:       "100vh",
    backgroundColor: "#f5f5f5",
    fontFamily:      "sans-serif",
    padding:         "1.5rem",
    gap:             "1rem",
  },
  header: {
    display:        "flex",
    alignItems:     "flex-start",
    justifyContent: "space-between",
    width:          "100%",
    maxWidth:       "900px",
  },
  title: {
    fontSize:   "1.5rem",
    margin:     0,
    fontWeight: "700",
    color:      "#1a1a1a",
  },
  buildingName: {
    fontSize: "0.9rem",
    color:    "#555",
    margin:   "0.2rem 0 0 0",
  },
  resetBtn: {
    padding:         "0.4rem 0.9rem",
    fontSize:        "0.85rem",
    border:          "1px solid #ccc",
    borderRadius:    "6px",
    backgroundColor: "#fff",
    cursor:          "pointer",
    color:           "#444",
    flexShrink:      0,
  },
  main: {
    width:          "100%",
    maxWidth:       "900px",
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
  },
};