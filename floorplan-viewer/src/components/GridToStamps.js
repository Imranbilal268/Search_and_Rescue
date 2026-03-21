// gridToStamps.js
// ─────────────────────────────────────────────────────────────────────────────
// Converts an imported 3-D grid into per-floor stamp lists.
//
// One 1×1 stamp per cell — no bounding box grouping, no inference.
// This matches the paint model exactly: every cell in the original grid
// becomes exactly one stamp at the same position.
//
// Cell → stamp type mapping:
//   floor, corridor  → "floor"
//   wall             → "wall"
//   stairwell, stair → "stairwell"
//   hazard           → "hazard"
//   door             → "door"
//   window           → "window"
//   empty            → skipped (compiler fills gaps with wall anyway)
// ─────────────────────────────────────────────────────────────────────────────

import { generateStampId } from "./Stamptypes";

function toStampType(cellType) {
  switch (cellType) {
    case "floor":
    case "corridor":  return "floor";
    case "wall":      return "wall";
    case "stairwell":
    case "stair":     return "stairwell";
    case "hazard":    return "hazard";
    case "door":      return "door";
    case "window":    return "window";
    default:          return null; // empty or unknown — skip
  }
}

/**
 * @param {string[][][]} floors — [z][y][x] from FileUpload
 * @returns {{ [z]: object[] }}
 */
export function gridToStamps(floors) {
  const result = {};
  floors.forEach((grid, z) => {
    result[z] = convertFloor(grid);
  });
  return result;
}

function convertFloor(grid) {
  const stamps = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const stampType = toStampType(row[x]);
      if (!stampType) continue; // skip empty
      stamps.push({
        id:     generateStampId(),
        type:   stampType,
        x,
        y,
        width:  1,
        height: 1,
        label:  "",
      });
    }
  }
  return stamps;
}