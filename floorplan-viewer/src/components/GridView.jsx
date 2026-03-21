import FloorPlan from "./Floorplan";

// ─────────────────────────────────────────────────────────────────────────────
// GridView — pure renderer, owns NO state.
//
// All data comes in as props from EditorShell (or any future parent).
// This component has one job: take a compiled 2-D grid and draw it.
//
// Props:
//   grid           {string[][]}  — 2-D array for the active floor [y][x]
//   floorIndex     {number}      — current z value (for label filtering)
//   roomLabels     {object}      — { "x,y,z": "Room name" }     (optional)
//   cellProperties {object}      — { "x,y,z": { label, ... } }  (optional)
// ─────────────────────────────────────────────────────────────────────────────

export default function GridView({
  grid,
  floorIndex     = 0,
  roomLabels     = {},
  cellProperties = {},
}) {
  // Guard: nothing to render yet
  if (!grid || grid.length === 0) {
    return <div style={styles.empty}>No grid data for this floor.</div>;
  }

  return (
    <div style={styles.wrapper}>
      <FloorPlan
        grid={grid}
        floorIndex={floorIndex}
        roomLabels={roomLabels}
        cellProperties={cellProperties}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  wrapper: {
    width:   "100%",
    display: "flex",
    justifyContent: "center",
  },
  empty: {
    padding:   "2rem",
    color:     "#999",
    fontSize:  "0.9rem",
    textAlign: "center",
  },
};