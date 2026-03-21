// stampCompiler.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure function: stamps[] + grid dimensions → string[][]
//
// Five stamp types, five passes (later passes win):
//   1. Fill grid with "empty"
//   2. floor stamps    → "floor"
//   3. stairwell stamps → "stair"
//   4. hazard stamps   → "hazard"
//   5. wall stamps     → "wall"   (overrides floor so walls can cut across)
//   6. door/window     → "door" / "window"  (overrides walls)
//   7. empty → "wall"  (fills all unclaimed cells)
// ─────────────────────────────────────────────────────────────────────────────

import { STAMP_TYPES } from "./Stamptypes";

/**
 * Compile one floor's stamp list into a 2-D cell grid.
 * @param {object[]} stamps
 * @param {number}   width
 * @param {number}   height
 * @returns {string[][]}  grid[y][x]
 */
export function compileFloor(stamps, width, height) {
  // 1. Blank canvas
  const grid = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "empty")
  );

  function set(x, y, v) {
    if (x >= 0 && x < width && y >= 0 && y < height) grid[y][x] = v;
  }

  function fill(s, v) {
    for (let row = s.y; row < s.y + s.height; row++)
      for (let col = s.x; col < s.x + s.width; col++)
        set(col, row, v);
  }

  // 2. Floor
  for (const s of stamps)
    if (s.type === STAMP_TYPES.FLOOR) fill(s, "floor");

  // 3. Stairwells
  for (const s of stamps)
    if (s.type === STAMP_TYPES.STAIRWELL) fill(s, "stairwell");

  // 4. Hazard
  for (const s of stamps)
    if (s.type === STAMP_TYPES.HAZARD) fill(s, "hazard");

  // 5. Walls — override floor so walls can divide open areas
  for (const s of stamps)
    if (s.type === STAMP_TYPES.WALL) fill(s, "wall");

  // 6. Doors and windows — override walls
  for (const s of stamps) {
    if (s.type === STAMP_TYPES.DOOR)   set(s.x, s.y, "door");
    if (s.type === STAMP_TYPES.WINDOW) set(s.x, s.y, "window");
  }

  // 7. Fill unclaimed cells with wall
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (grid[y][x] === "empty") grid[y][x] = "wall";

  return grid;
}

/**
 * Compile all floors at once.
 * @param {{ [z]: object[] }} stampsPerFloor
 * @param {number} floorCount
 * @param {number} width
 * @param {number} height
 * @returns {string[][][]}
 */
export function compileAllFloors(stampsPerFloor, floorCount, width, height) {
  return Array.from({ length: floorCount }, (_, z) =>
    compileFloor(stampsPerFloor[z] ?? [], width, height)
  );
}