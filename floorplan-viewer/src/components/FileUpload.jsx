import { useState, useRef } from "react";

export default function FileUpload({ onLoad }) {
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState(null);
  const inputRef = useRef(null);

  // ─── Core parse logic ────────────────────────────────────────────────────────

  function parseFile(file) {
    // Guard: must be a .json file
    if (!file || !file.name.endsWith(".json")) {
      setError("Please upload a valid .json file.");
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);

        // Auto-detect the first key in the object (e.g. "example")
        const firstKey = Object.keys(parsed)[0];
        if (!firstKey) throw new Error("JSON object is empty.");

        const floors = parsed[firstKey];

        // Validate: must be a non-empty array (the z axis)
        if (!Array.isArray(floors) || floors.length === 0) {
          throw new Error(`"${firstKey}" must be a non-empty array of floors.`);
        }

        // Validate: each floor must be a 2D array
        floors.forEach((floor, z) => {
          if (!Array.isArray(floor) || floor.length === 0) {
            throw new Error(`Floor ${z} is not a valid 2D array.`);
          }
          floor.forEach((row, y) => {
            if (!Array.isArray(row) || row.length === 0) {
              throw new Error(`Floor ${z}, row ${y} is not a valid array.`);
            }
          });
        });

        // All good — clear error, store file name, pass floors up
        setError(null);
        setFileName(file.name);
        onLoad(floors);
      } catch (err) {
        setError(`Invalid JSON: ${err.message}`);
      }
    };

    reader.onerror = () => {
      setError("Failed to read the file. Please try again.");
    };

    reader.readAsText(file);
  }

  // ─── Event handlers ───────────────────────────────────────────────────────────

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) parseFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleClick() {
    // Programmatically open the file picker
    inputRef.current.click();
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={styles.wrapper}>
      <h1 style={styles.title}>Floor Plan Viewer</h1>
      <p style={styles.subtitle}>Upload a JSON file to visualise your building layout</p>

      {/* Drop zone — also acts as a click target */}
      <div
        style={{
          ...styles.dropZone,
          ...(isDragging ? styles.dropZoneDragging : {}),
        }}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Hidden real file input — triggered by the click handler above */}
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          style={styles.hiddenInput}
        />

        <span style={styles.icon}>📂</span>
        <p style={styles.dropText}>
          {fileName
            ? `Loaded: ${fileName}`
            : "Drag & drop your JSON file here, or click to browse"}
        </p>
        <p style={styles.dropHint}>.json files only</p>
      </div>

      {/* Error message */}
      {error && (
        <div style={styles.errorBox}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Schema + visual legend */}
      <div style={styles.schemaBox}>

        {/* ── Code block ── */}
        <p style={styles.schemaTitle}>Expected JSON shape</p>
        <pre style={styles.pre}>{SCHEMA_EXAMPLE}</pre>

        {/* ── Visual cell-type legend ── */}
        <p style={{ ...styles.schemaTitle, marginTop: "1rem" }}>Cell types</p>
        <div style={styles.legendGrid}>
          {Object.entries(CELL_STYLES).map(([type, s]) => (
            <div key={type} style={styles.legendRow}>
              {/* Colour swatch — matches FloorPlan.jsx exactly */}
              <svg width={20} height={20} style={{ flexShrink: 0 }}>
                <rect
                  x={1} y={1} width={18} height={18}
                  fill={s.fill}
                  stroke={s.stroke}
                  strokeWidth={1.5}
                  rx={2}
                />
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

// ─── Shared cell-type config (must mirror FloorPlan.jsx CELL_STYLES) ──────────
//     Keep these two objects in sync whenever you add or change a cell type.

export const CELL_STYLES = {
  wall:       { fill: "#2c2c2c", stroke: "#111"    },
  floor:      { fill: "#f0ede8", stroke: "#ddd"    },
  door:       { fill: "#a0522d", stroke: "#7a3b1e" },
  stairwell:  { fill: "#b0c4de", stroke: "#6a8cad" },
  window:     { fill: "#add8e6", stroke: "#5bafd6" },
  elevator:   { fill: "#d8b4fe", stroke: "#9333ea" },
  hazard:     { fill: "#fde68a", stroke: "#d97706" },
  empty:      { fill: "#ffffff", stroke: "#ccc"    },
};

const CELL_DESCRIPTIONS = {
  wall:      "Solid boundary — impassable",
  floor:     "Open walkable area",
  door:      "Entry / exit point between rooms",
  stairwell: "Vertical access between floors",
  window:    "Glazed wall opening",
  elevator:  "Lift shaft",
  hazard:    "Dangerous or restricted zone",
  empty:     "Void — nothing rendered",
};

// ─── Schema text shown in the code block ──────────────────────────────────────

const SCHEMA_EXAMPLE =
`{
  "anyKeyName": [          ← top-level key (any name)
    [                      ← floor 0  (z-axis)
      ["wall","wall","wall"],
      ["wall","floor","door"],
      ["wall","wall","wall"]
    ],
    [                      ← floor 1  (z-axis)
      ["wall","window","wall"],
      ["wall","elevator","wall"],
      ["wall","stairwell","wall"]
    ]
  ]
}`;

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "2rem",
    fontFamily: "sans-serif",
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: "2rem",
    marginBottom: "0.25rem",
  },
  subtitle: {
    color: "#666",
    marginBottom: "2rem",
  },
  dropZone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: "480px",
    padding: "2.5rem",
    border: "2px dashed #aaa",
    borderRadius: "12px",
    backgroundColor: "#fff",
    cursor: "pointer",
    transition: "border-color 0.2s, background-color 0.2s",
  },
  dropZoneDragging: {
    borderColor: "#4a90e2",
    backgroundColor: "#eaf3ff",
  },
  hiddenInput: {
    display: "none",
  },
  icon: {
    fontSize: "2.5rem",
    marginBottom: "0.75rem",
  },
  dropText: {
    fontSize: "1rem",
    color: "#333",
    margin: 0,
    textAlign: "center",
  },
  dropHint: {
    fontSize: "0.8rem",
    color: "#999",
    marginTop: "0.4rem",
  },
  errorBox: {
    marginTop: "1rem",
    padding: "0.75rem 1.25rem",
    backgroundColor: "#fff0f0",
    border: "1px solid #f5a5a5",
    borderRadius: "8px",
    color: "#cc0000",
    maxWidth: "480px",
    width: "100%",
  },
  schemaBox: {
    marginTop: "2rem",
    padding: "1.25rem",
    backgroundColor: "#fff",
    border: "1px solid #ddd",
    borderRadius: "8px",
    maxWidth: "480px",
    width: "100%",
  },
  schemaTitle: {
    fontWeight: "bold",
    marginBottom: "0.5rem",
  },
  pre: {
    backgroundColor: "#f0f0f0",
    padding: "0.75rem",
    borderRadius: "6px",
    fontSize: "0.75rem",
    overflowX: "auto",
    whiteSpace: "pre",
  },
  schemaHint: {   // kept for backwards compat but no longer used in JSX
    fontSize: "0.8rem",
    color: "#555",
    marginTop: "0.75rem",
  },
  legendGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
  },
  legendRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
  },
  legendType: {
    fontFamily: "monospace",
    fontSize: "0.8rem",
    fontWeight: "600",
    color: "#222",
    minWidth: "80px",
  },
  legendDesc: {
    fontSize: "0.75rem",
    color: "#666",
  },
};