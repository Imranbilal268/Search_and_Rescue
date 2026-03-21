// stampTypes.js
// ─────────────────────────────────────────────────────────────────────────────
// Defines the stamp data model and factory functions for every stamp type.
//
// A stamp is a plain JS object. It is the EDITING model — it lives above the
// cell grid. The stampCompiler converts stamps → string[][] for rendering.
//
// Stamp shape:
// {
//   id:     string   — unique identifier, e.g. "stamp_003"
//   type:   string   — one of STAMP_TYPES
//   x:      number   — top-left grid column  (0-based)
//   y:      number   — top-left grid row     (0-based)
//   width:  number   — extent in grid columns (rooms/corridors/stairwells/hazards)
//   height: number   — extent in grid rows    (rooms/corridors/stairwells/hazards)
//   label:  string   — optional human-readable name shown on the floor plan
// }
//
// Point stamps (door, window) use only x, y — width and height are always 1.
// ─────────────────────────────────────────────────────────────────────────────

// ── Stamp type registry ───────────────────────────────────────────────────────

export const STAMP_TYPES = {
    FLOOR:     "floor",
    WALL:      "wall",
    STAIRWELL: "stairwell",
    DOOR:      "door",
    WINDOW:    "window",
    HAZARD:    "hazard",
  };
  
  // Area stamps — resizable rectangles
  export const AREA_STAMPS = new Set([
    STAMP_TYPES.FLOOR,
    STAMP_TYPES.WALL,
    STAMP_TYPES.STAIRWELL,
    STAMP_TYPES.HAZARD,
  ]);
  
  // Point stamps — always 1×1
  export const POINT_STAMPS = new Set([
    STAMP_TYPES.DOOR,
    STAMP_TYPES.WINDOW,
  ]);
  
  // Default dimensions when first dropped
  export const STAMP_DEFAULTS = {
    [STAMP_TYPES.FLOOR]:     { width: 5, height: 4 },
    [STAMP_TYPES.WALL]:      { width: 5, height: 1 },
    [STAMP_TYPES.STAIRWELL]: { width: 2, height: 2 },
    [STAMP_TYPES.DOOR]:      { width: 1, height: 1 },
    [STAMP_TYPES.WINDOW]:    { width: 1, height: 1 },
    [STAMP_TYPES.HAZARD]:    { width: 3, height: 3 },
  };
  
  // Palette display metadata
  export const STAMP_META = {
    [STAMP_TYPES.FLOOR]:     { label: "Floor",      icon: "⬜", description: "Open walkable area"             },
    [STAMP_TYPES.WALL]:      { label: "Wall",        icon: "🧱", description: "Solid impassable barrier"       },
    [STAMP_TYPES.STAIRWELL]: { label: "Stairwell",   icon: "🪜", description: "Vertical access between floors" },
    [STAMP_TYPES.DOOR]:      { label: "Door",        icon: "🚪", description: "Single-cell opening in a wall"  },
    [STAMP_TYPES.WINDOW]:    { label: "Window",      icon: "🪟", description: "Single-cell glazed opening"     },
    [STAMP_TYPES.HAZARD]:    { label: "Hazard Zone", icon: "⚠️", description: "Dangerous or restricted area"   },
  };
  
  // ── ID generator ──────────────────────────────────────────────────────────────
  
  let _counter = 1;
  export function generateStampId() {
    return `stamp_${String(_counter++).padStart(3, "0")}`;
  }
  
  // ── Factory — creates a new stamp from a drop event ───────────────────────────
  //
  // Usage:
  //   const stamp = createStamp("room", 3, 2, "Kitchen");
  //
  // Returns a fully-formed stamp object ready to push into stampsPerFloor[z].
  
  export function createStamp(type, x, y, label = "") {
    const defaults = STAMP_DEFAULTS[type] ?? { width: 1, height: 1 };
    return {
      id:     generateStampId(),
      type,
      x,
      y,
      width:  defaults.width,
      height: defaults.height,
      label,
    };
  }
  
  // ── Updater — returns a new stamp with patched fields ─────────────────────────
  //
  // Usage:
  //   const updated = updateStamp(stamp, { width: 7, label: "Master Bedroom" });
  //
  // Pure — never mutates the original stamp.
  
  export function updateStamp(stamp, patch) {
    return { ...stamp, ...patch };
  }