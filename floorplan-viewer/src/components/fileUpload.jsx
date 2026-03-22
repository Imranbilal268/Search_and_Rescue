import { useState, useRef } from "react";
import { CELL_STYLES, CELL_DESCRIPTIONS } from "./CellStyles";

// ─────────────────────────────────────────────────────────────────────────────
// FileUpload
//
// Canonical format (rescuegrid v1):
//   {
//     "building": {
//       "meta": { "schema_version": "1.0", "name": "...", "floors": N, "width": W, "height": H },
//       "floor_labels": { "0": "Ground Floor", "1": "First Floor", ... },
//       "grid": [ [[...floor0...]], [[...floor1...]] ],   ← [z][y][x]
//       "room_labels":          { "x,y,z": "Room name", ... },
//       "cell_properties":      { "x,y,z": { label, locked }, ... },
//       "vertical_connections": [...],
//       "exit_nodes":           [...]
//     },
//     "scenario": { "responders": [...], "victims": [...], "threat": {...},
//                   "simulation_config": { "max_turns": N, ... } }
//   }
//
// Also accepts legacy flat format:
//   { "anyKey": [ [[...floor0...]], [[...floor1...]] ] }
//
// onLoad is called with a normalised object:
//   {
//     floors:              string[][][]
//     buildingName:        string | null
//     roomLabels:          { "x,y,z": string }
//     cellProperties:      { "x,y,z": object }
//     floorLabels:         { "0": string, ... }
//     verticalConnections: array
//     exitNodes:           array
//     rawJson:             the original parsed object
//   }
// ─────────────────────────────────────────────────────────────────────────────

export default function FileUpload({ onLoad }) {
  const [error,      setError]      = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName,   setFileName]   = useState(null);
  const inputRef = useRef(null);

  // ─── Parse & normalise ─────────────────────────────────────────────────────

  function parseFile(file) {
    if (!file || !file.name.endsWith(".json")) {
      setError("Please upload a valid .json file.");
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
          throw new Error("Top-level JSON must be an object.");

        let floors, buildingName, roomLabels, cellProperties,
            floorLabels = {}, verticalConnections = [], exitNodes = [];

        // ── Detect schema format ──────────────────────────────────────────
        if (parsed.building && typeof parsed.building === "object" && Array.isArray(parsed.building.grid)) {
          // Canonical rescuegrid-v1 format (building.meta + scenario) or older RICH format
          const b       = parsed.building;
          floors         = b.grid;
          buildingName   = b.meta?.name ?? b.name ?? null;
          roomLabels     = b.room_labels          ?? {};
          cellProperties = b.cell_properties      ?? {};
          floorLabels         = b.floor_labels         ?? {};
          verticalConnections = b.vertical_connections ?? [];
          exitNodes           = b.exit_nodes           ?? [];
        } else {
          // LEGACY format — grab the first key whose value is a 3-D array
          const firstKey = Object.keys(parsed)[0];
          if (!firstKey) throw new Error("JSON object is empty.");
          const val = parsed[firstKey];
          if (!Array.isArray(val) || !Array.isArray(val[0]) || !Array.isArray(val[0][0]))
            throw new Error(
              `Could not detect a valid schema. ` +
              `Expected either a "building.grid" array or a top-level 3-D array.`
            );
          floors              = val;
          buildingName        = null;
          roomLabels          = {};
          cellProperties      = {};
          floorLabels         = {};
          verticalConnections = [];
          exitNodes           = [];
        }

        // ── Validate grid ─────────────────────────────────────────────────
        if (!Array.isArray(floors) || floors.length === 0)
          throw new Error("Grid must be a non-empty array of floors.");

        floors.forEach((floor, z) => {
          if (!Array.isArray(floor) || floor.length === 0)
            throw new Error(`Floor ${z} is not a valid 2-D array.`);
          floor.forEach((row, y) => {
            if (!Array.isArray(row) || row.length === 0)
              throw new Error(`Floor ${z}, row ${y} is not a valid array.`);
          });
        });

        setError(null);
        setFileName(file.name);
        onLoad({ floors, buildingName, roomLabels, cellProperties,
                 floorLabels, verticalConnections, exitNodes, rawJson: parsed });

      } catch (err) {
        setError(`Invalid JSON: ${err.message}`);
      }
    };

    reader.onerror = () => setError("Failed to read the file. Please try again.");
    reader.readAsText(file);
  }

  // ─── Event handlers ────────────────────────────────────────────────────────

  const handleFileChange = (e) => parseFile(e.target.files[0]);
  const handleDrop       = (e) => { e.preventDefault(); setIsDragging(false); parseFile(e.dataTransfer.files[0]); };
  const handleDragOver   = (e) => { e.preventDefault(); setIsDragging(true);  };
  const handleDragLeave  = ()  => setIsDragging(false);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={styles.wrapper}>
      <h1 style={styles.title}>Floor Plan Viewer</h1>
      <p style={styles.subtitle}>Upload a JSON file to visualise your building layout</p>

      {/* Drop zone */}
      <div
        style={{ ...styles.dropZone, ...(isDragging ? styles.dropZoneDragging : {}) }}
        onClick={() => inputRef.current.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input ref={inputRef} type="file" accept=".json"
          onChange={handleFileChange} style={{ display: "none" }} />
        <span style={styles.icon}>📂</span>
        <p style={styles.dropText}>
          {fileName ? `Loaded: ${fileName}` : "Drag & drop your JSON file here, or click to browse"}
        </p>
        <p style={styles.dropHint}>.json files only</p>
      </div>

      {error && <div style={styles.errorBox}><strong>Error:</strong> {error}</div>}

      {/* Schema reference */}
      <div style={styles.schemaBox}>
        <p style={styles.schemaTitle}>Supported JSON formats</p>
        <pre style={styles.pre}>{SCHEMA_EXAMPLE}</pre>

        <p style={{ ...styles.schemaTitle, marginTop: "1rem" }}>Cell types</p>
        <div style={styles.legendGrid}>
          {Object.entries(CELL_STYLES).map(([type, s]) => (
            <div key={type} style={styles.legendRow}>
              <svg width={20} height={20} style={{ flexShrink: 0 }}>
                <rect x={1} y={1} width={18} height={18}
                  fill={s.fill} stroke={s.stroke} strokeWidth={1.5} rx={2} />
              </svg>
              <span style={styles.legendType}>{type}</span>
              <span style={styles.legendDesc}>{CELL_DESCRIPTIONS[type]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema hint
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_EXAMPLE =
`── CANONICAL FORMAT (rescuegrid v1) ────────────────
{
  "building": {
    "meta": {
      "schema_version": "1.0",
      "name": "My Building",
      "floors": 2, "width": 18, "height": 16
    },
    "floor_labels": { "0": "Ground Floor", "1": "First Floor" },
    "grid": [                ← [z][y][x] 3-D array
      [ ["wall","floor",...], ... ],   ← floor 0
      [ ["wall","floor",...], ... ]    ← floor 1
    ],
    "room_labels":     { "x,y,z": "Kitchen" },
    "cell_properties": { "x,y,z": { "label": "Front door", "locked": false } },
    "vertical_connections": [
      { "id": "stair_main", "type": "stairwell", "x": 8, "y": 6, "floors": [0,1] }
    ],
    "exit_nodes": [
      { "id": "exit_main", "x": 8, "y": 13, "z": 0, "label": "Main Exit" }
    ]
  },
  "scenario": {
    "responders": [ { "id": "R1", "x": 0, "y": 0, "z": 0 } ],
    "victims":    [ { "id": "V1", "x": 5, "y": 5, "z": 0, "mobility": "immobile" } ],
    "threat": { "type": "fire", "origin": { "x": 10, "y": 2, "z": 0 } },
    "simulation_config": { "max_turns": 40 }
  }
}

── LEGACY FORMAT (also accepted) ───────────────────
{ "anyKey": [ [["wall","floor",...], ...], ... ] }`;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  wrapper: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", minHeight: "100vh", padding: "2rem",
    fontFamily: "sans-serif", backgroundColor: "#f5f5f5",
  },
  title:    { fontSize: "2rem", marginBottom: "0.25rem" },
  subtitle: { color: "#666", marginBottom: "2rem" },
  dropZone: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", width: "100%", maxWidth: "520px",
    padding: "2.5rem", border: "2px dashed #aaa", borderRadius: "12px",
    backgroundColor: "#fff", cursor: "pointer",
    transition: "border-color 0.2s, background-color 0.2s",
  },
  dropZoneDragging: { borderColor: "#4a90e2", backgroundColor: "#eaf3ff" },
  icon:      { fontSize: "2.5rem", marginBottom: "0.75rem" },
  dropText:  { fontSize: "1rem", color: "#333", margin: 0, textAlign: "center" },
  dropHint:  { fontSize: "0.8rem", color: "#999", marginTop: "0.4rem" },
  errorBox: {
    marginTop: "1rem", padding: "0.75rem 1.25rem",
    backgroundColor: "#fff0f0", border: "1px solid #f5a5a5",
    borderRadius: "8px", color: "#cc0000", maxWidth: "520px", width: "100%",
  },
  schemaBox: {
    marginTop: "2rem", padding: "1.25rem", backgroundColor: "#fff",
    border: "1px solid #ddd", borderRadius: "8px", maxWidth: "520px", width: "100%",
  },
  schemaTitle: { fontWeight: "bold", marginBottom: "0.5rem", margin: 0 },
  pre: {
    backgroundColor: "#f0f0f0", padding: "0.75rem", borderRadius: "6px",
    fontSize: "0.72rem", overflowX: "auto", whiteSpace: "pre",
    marginTop: "0.5rem",
  },
  legendGrid: { display: "flex", flexDirection: "column", gap: "0.45rem" },
  legendRow:  { display: "flex", alignItems: "center", gap: "0.55rem" },
  legendType: {
    fontFamily: "monospace", fontSize: "0.8rem", fontWeight: "600",
    color: "#222", minWidth: "80px",
  },
  legendDesc: { fontSize: "0.75rem", color: "#666" },
};