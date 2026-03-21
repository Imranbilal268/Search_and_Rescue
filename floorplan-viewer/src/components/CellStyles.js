// cellStyles.js
// Single source of truth for cell type colors and descriptions.
// Imported by both FileUpload.jsx (legend swatches) and FloorPlan.jsx (SVG renderer).
// To add or change a cell type, edit only this file.

export const CELL_STYLES = {
    wall:      { fill: "#4b5563", stroke: "#374151" }, // dark gray
    floor:     { fill: "#e5e7eb", stroke: "#d1d5db" }, // light gray
    door:      { fill: "#f97316", stroke: "#ea580c" }, // orange
    stair:     { fill: "#3b82f6", stroke: "#2563eb" }, // blue  (short form)
    stairwell: { fill: "#3b82f6", stroke: "#2563eb" }, // blue  (long form alias)
    window:    { fill: "#14b8a6", stroke: "#0d9488" }, // teal
    elevator:  { fill: "#a855f7", stroke: "#9333ea" }, // purple
    hazard:    { fill: "#fca5a5", stroke: "#ef4444" }, // red-tinted
    empty:     { fill: "#ffffff", stroke: "#e5e7eb" }, // white / void
  };
  
  export const CELL_DESCRIPTIONS = {
    wall:      "Solid boundary — impassable",
    floor:     "Open walkable area",
    door:      "Entry / exit point between rooms",
    stair:     "Vertical access between floors",
    stairwell: "Vertical access between floors (alias)",
    window:    "Glazed wall opening",
    elevator:  "Lift shaft",
    hazard:    "Dangerous or restricted zone",
    empty:     "Void — nothing rendered",
  };