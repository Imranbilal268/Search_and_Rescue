import { useState, useMemo, useCallback } from "react";
import FileUpload    from "./fileUpload";
import FloorToggle   from "./Floortoggle";
import GridView      from "./GridView";
import StampPalette  from "./Stamppalette";
import FloorCanvas   from "./Floorcanvas";
import SimView       from "./SimView";
import { compileAllFloors } from "./StampComplier";
import { createStamp, updateStamp, STAMP_TYPES } from "./Stamptypes";
import { gridToStamps } from "./GridToStamps";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — default grid dimensions used for stamp-driven mode.
// When a file is uploaded these are overridden by the building's own size.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FLOOR_COUNT = 3;
const DEFAULT_GRID_WIDTH  = 20;
const DEFAULT_GRID_HEIGHT = 15;

// ─────────────────────────────────────────────────────────────────────────────
// EditorShell
//
// Owns ALL mutable state for the editor. Child components are stateless
// receivers — they call callbacks to request state changes here.
//
// Modes (null = landing screen):
//   "choosing-upload" — full FileUpload screen
//   "post-upload"     — file loaded, user chooses view-only vs edit-as-stamps
//   "upload"          — read-only view of uploaded grid (bypasses compiler)
//   "stamps"          — stamp editor, compiler drives GridView
//
// State:
//   mode:            string | null
//   building:        parsed upload data
//   stampsPerFloor:  { [z]: Stamp[] }
//   gridMeta:        { width, height, floorCount }
//   activeFloor:     number
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// buildWallBorder — creates 1×1 wall stamps along the perimeter of a grid
// ─────────────────────────────────────────────────────────────────────────────

function buildWallBorder(width, height) {
  const stamps = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        stamps.push({ id: `border_${x}_${y}`, type: "wall", x, y, width: 1, height: 1, label: "" });
      }
    }
  }
  return stamps;
}

export default function EditorShell() {
  // ── Mode & active floor ───────────────────────────────────────────────────
  const [mode,              setMode]              = useState(null);
  const [activeFloor,       setActiveFloor]       = useState(0);
  const [selectedStampType, setSelectedStampType] = useState(null);
  const [viewMode,          setViewMode]          = useState("floorplan"); // "floorplan" | "3d"

  // ── Upload mode state ─────────────────────────────────────────────────────
  const [building,    setBuilding]    = useState(null);
  // Raw JSON from the uploaded file — used to send to the simulation API
  const [rawJson,     setRawJson]     = useState(null);
  // Simulation results from the API
  const [simData,     setSimData]     = useState(null);
  const [simStatus,   setSimStatus]   = useState("idle"); // "idle"|"loading"|"success"|"error"
  const [simError,    setSimError]    = useState(null);
  const [simTurn,     setSimTurn]     = useState(0);

  // ── Setup state — used on "Start blank" before entering stamps mode ─────────
  const [setupMeta, setSetupMeta] = useState({
    width:      DEFAULT_GRID_WIDTH,
    height:     DEFAULT_GRID_HEIGHT,
    floorCount: DEFAULT_FLOOR_COUNT,
  });

  // ── Stamp mode state ──────────────────────────────────────────────────────
  const [stampsPerFloor, setStampsPerFloor] = useState({});
  const [gridMeta,       setGridMeta]       = useState({
    width:      DEFAULT_GRID_WIDTH,
    height:     DEFAULT_GRID_HEIGHT,
    floorCount: DEFAULT_FLOOR_COUNT,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Compiler — re-runs automatically whenever stamps or grid size change.
  // Only active in stamp mode; upload mode uses building.floors directly.
  // ─────────────────────────────────────────────────────────────────────────

  const compiledGrids = useMemo(() => {
    if (mode !== "stamps") return null;
    return compileAllFloors(
      stampsPerFloor,
      gridMeta.floorCount,
      gridMeta.width,
      gridMeta.height
    );
  }, [mode, stampsPerFloor, gridMeta]);

  // ─────────────────────────────────────────────────────────────────────────
  // Stamp CRUD — pure updates, never mutate state directly
  // ─────────────────────────────────────────────────────────────────────────

  // paintCell: places a single 1×1 stamp at (x, y), replacing whatever
  // was already at that cell. This is the only way stamps are created in
  // paint mode — no append, no overlap.
  const paintCell = useCallback((type, x, y) => {
    const stamp = createStamp(type, x, y);
    stamp.width  = 1;
    stamp.height = 1;
    setStampsPerFloor(prev => {
      const existing = prev[activeFloor] ?? [];
      // Remove any stamp that already occupies this exact cell
      const filtered = existing.filter(s => !(s.x === x && s.y === y));
      return { ...prev, [activeFloor]: [...filtered, stamp] };
    });
  }, [activeFloor]);

  // Keep addStamp as an alias so FloorCanvas interface stays the same
  const addStamp = paintCell;

  const patchStamp = useCallback((stampId, patch) => {
    setStampsPerFloor(prev => ({
      ...prev,
      [activeFloor]: (prev[activeFloor] ?? []).map(s =>
        s.id === stampId ? updateStamp(s, patch) : s
      ),
    }));
  }, [activeFloor]);

  const removeStamp = useCallback((stampId) => {
    setStampsPerFloor(prev => ({
      ...prev,
      [activeFloor]: (prev[activeFloor] ?? []).filter(s => s.id !== stampId),
    }));
  }, [activeFloor]);

  // ─────────────────────────────────────────────────────────────────────────
  // Mode transitions
  // ─────────────────────────────────────────────────────────────────────────

  // FileUpload calls this — go to the decision screen, not straight to viewer
  function handleFileLoad(data) {
    setBuilding(data);
    setRawJson(data.rawJson ?? null);
    setSimData(null);
    setSimStatus("idle");
    setSimError(null);
    setActiveFloor(0);
    setMode("post-upload");   // ← pause here so user can choose
  }

  // POST the building JSON to the FastAPI backend and run the simulation
  async function handleRunSimulation() {
    if (!rawJson) return;
    setSimStatus("loading");
    setSimError(null);
    try {
      const res = await fetch("/api/simulate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(rawJson),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? res.statusText);
      }
      const data = await res.json();
      setSimData(data);
      setSimStatus("success");
      setViewMode("3d");   // automatically switch to the 3D view
    } catch (err) {
      setSimStatus("error");
      setSimError(err.message);
    }
  }

  // User picks "View only" on the post-upload screen
  function handleViewOnly() {
    setMode("upload");
    // If the file has a scenario, default to the 3D view so the preview is visible
    if (rawJson?.scenario) setViewMode("3d");
  }

  // User picks "Edit as stamps" on the post-upload screen
  // Convert the imported grid into stamps, set gridMeta from building dims,
  // then switch to stamp editor mode
  function handleEditAsStamps() {
    if (!building) return;
    const converted = gridToStamps(building.floors);
    const firstFloor = building.floors[0];
    setStampsPerFloor(converted);
    setGridMeta({
      width:      firstFloor[0]?.length ?? DEFAULT_GRID_WIDTH,
      height:     firstFloor.length     ?? DEFAULT_GRID_HEIGHT,
      floorCount: building.floors.length,
    });
    setActiveFloor(0);
    setMode("stamps");
  }

  // Navigate from landing to the dimension-picker screen
  function handleGoToSetup() {
    setMode("setup");
  }

  // Called when user confirms dimensions on the setup screen
  function handleStartBlank(w, h, fc) {
    const meta = { width: w, height: h, floorCount: fc };
    setGridMeta(meta);
    // Pre-fill every floor with a wall border so the canvas isn't blank
    const initial = {};
    for (let z = 0; z < fc; z++) {
      initial[z] = buildWallBorder(w, h);
    }
    setStampsPerFloor(initial);
    setActiveFloor(0);
    setMode("stamps");
  }

  function handleGoToUpload() {
    setMode("choosing-upload");
  }

  // Resize the grid live in stamp mode — extends or trims stamps
  function handleResizeGrid(field, rawVal) {
    const val = Math.max(3, Math.min(50, Number(rawVal) || 3));
    const newMeta = { ...gridMeta, [field]: val };
    setGridMeta(newMeta);
    // Rebuild border for all floors with new dimensions
    const newBorder = buildWallBorder(newMeta.width, newMeta.height);
    setStampsPerFloor(prev => {
      const next = {};
      for (let z = 0; z < newMeta.floorCount; z++) {
        // Keep interior stamps, replace border cells only
        const interior = (prev[z] ?? []).filter(s =>
          s.id.startsWith("border_") === false &&
          s.x > 0 && s.x < newMeta.width - 1 &&
          s.y > 0 && s.y < newMeta.height - 1
        );
        next[z] = [...newBorder, ...interior];
      }
      return next;
    });
  }

  function handleReset() {
    setMode(null);
    setBuilding(null);
    setRawJson(null);
    setSimData(null);
    setSimStatus("idle");
    setSimError(null);
    setSimTurn(0);
    setStampsPerFloor({});
    setActiveFloor(0);
    setSelectedStampType(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derive props for GridView
  // ─────────────────────────────────────────────────────────────────────────

  const currentGrid = mode === "upload"
    ? building?.floors?.[activeFloor] ?? []
    : compiledGrids?.[activeFloor]    ?? [];

  const floorCount = mode === "upload"
    ? (building?.floors?.length ?? 1)
    : gridMeta.floorCount;

  const roomLabels     = mode === "upload" ? (building?.roomLabels     ?? {}) : {};
  const cellProperties = mode === "upload" ? (building?.cellProperties ?? {}) : {};
  const buildingName   = mode === "upload" ? (building?.buildingName   ?? null) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render — landing screen
  // ─────────────────────────────────────────────────────────────────────────

  if (mode === null) {
    return (
      <div style={styles.landing}>
        <h1 style={styles.landingTitle}>Floor Plan Viewer</h1>
        <p style={styles.landingSubtitle}>Choose how to get started</p>
        <div style={styles.landingCards}>

          <div style={styles.card} onClick={handleGoToSetup}>
            <span style={styles.cardIcon}>✏️</span>
            <h2 style={styles.cardTitle}>Start blank</h2>
            <p style={styles.cardDesc}>
              Set dimensions and design floors from scratch using the stamp palette.
            </p>
          </div>

          <div style={styles.card} onClick={handleGoToUpload}>
            <span style={styles.cardIcon}>📂</span>
            <h2 style={styles.cardTitle}>Import JSON</h2>
            <p style={styles.cardDesc}>
              Upload an existing building JSON file to view and inspect it.
            </p>
          </div>

        </div>
      </div>
    );
  }

  // ── Setup screen — dimension picker before entering stamp editor ─────────
  if (mode === "setup") {
    return (
      <SetupScreen
        meta={setupMeta}
        onChange={setSetupMeta}
        onConfirm={() => handleStartBlank(setupMeta.width, setupMeta.height, setupMeta.floorCount)}
        onBack={handleReset}
      />
    );
  }

  // ── Upload screen — full FileUpload with a back button ────────────────────
  if (mode === "choosing-upload") {
    return (
      <div style={styles.uploadScreen}>
        <button style={styles.backBtn} onClick={handleReset}>
          ← Back
        </button>
        <FileUpload onLoad={handleFileLoad} />
      </div>
    );
  }

  // ── Post-upload decision — choose view-only or edit-as-stamps ─────────────
  if (mode === "post-upload" && building) {
    const floorWord = building.floors.length === 1 ? "floor" : "floors";
    return (
      <div style={styles.landing}>
        <div style={styles.postUploadCard}>
          <span style={{ fontSize: "2rem" }}>✅</span>
          <h2 style={styles.postUploadTitle}>
            {building.buildingName ?? "Building"} loaded
          </h2>
          <p style={styles.postUploadMeta}>
            {building.floors.length} {floorWord} ·{" "}
            {building.floors[0]?.[0]?.length ?? "?"} × {building.floors[0]?.length ?? "?"} grid
          </p>
          <p style={styles.postUploadQuestion}>How would you like to open it?</p>

          <div style={styles.postUploadActions}>
            {/* Option A — read-only */}
            <button style={styles.actionBtn} onClick={handleViewOnly}>
              <span style={styles.actionIcon}>👁</span>
              <span style={styles.actionLabel}>View only</span>
              <span style={styles.actionDesc}>
                Display the floor plan as-is. No editing.
              </span>
            </button>

            {/* Option B — convert to stamps */}
            <button style={{ ...styles.actionBtn, ...styles.actionBtnPrimary }} onClick={handleEditAsStamps}>
              <span style={styles.actionIcon}>✏️</span>
              <span style={styles.actionLabel}>Edit as stamps</span>
              <span style={styles.actionDesc}>
                Convert the grid into editable cells. Paint over any cell
                to change its type — drag to fill areas.
              </span>
            </button>
          </div>

          <button style={styles.postUploadBack} onClick={handleGoToUpload}>
            ← Upload a different file
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render — editor / viewer
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={styles.wrapper}>

      {/* ── Header ── */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Floor Plan Viewer</h1>
          {buildingName && <p style={styles.buildingName}>{buildingName}</p>}
          {mode === "stamps" && (
            <p style={styles.modeBadge}>✏️ Stamp editor</p>
          )}
        </div>
        <div style={styles.headerRight}>
          {mode === "stamps" && (
            <div style={styles.dimControls}>
              <label style={styles.dimLabel}>W
                <input type="number" min={3} max={50} value={gridMeta.width}
                  onChange={e => handleResizeGrid("width", e.target.value)}
                  style={styles.dimInput} />
              </label>
              <span style={styles.dimSep}>×</span>
              <label style={styles.dimLabel}>H
                <input type="number" min={3} max={50} value={gridMeta.height}
                  onChange={e => handleResizeGrid("height", e.target.value)}
                  style={styles.dimInput} />
              </label>
              <span style={styles.dimSep}>·</span>
              <label style={styles.dimLabel}>Floors
                <input type="number" min={1} max={20} value={gridMeta.floorCount}
                  onChange={e => handleResizeGrid("floorCount", e.target.value)}
                  style={styles.dimInput} />
              </label>
            </div>
          )}
          {/* Run Simulation — only shown when a scenario is available */}
          {rawJson?.scenario && (
            <div style={styles.simControls}>
              <button
                style={{
                  ...styles.simBtn,
                  ...(simStatus === "loading" ? styles.simBtnLoading : {}),
                }}
                onClick={handleRunSimulation}
                disabled={simStatus === "loading"}
              >
                {simStatus === "loading" ? "⏳ Running…" : "▶ Run Simulation"}
              </button>
              {simStatus === "success" && (
                <span style={styles.simSuccess}>✓ Done</span>
              )}
              {simStatus === "error" && (
                <span style={styles.simError} title={simError}>⚠ Error</span>
              )}
            </div>
          )}
          <button style={styles.resetBtn} onClick={handleReset}>
            ↩ Back to start
          </button>
        </div>
      </header>

      {/* ── View mode tabs ── */}
      <div style={styles.viewTabs}>
        <button
          style={{ ...styles.viewTab, ...(viewMode === "floorplan" ? styles.viewTabActive : {}) }}
          onClick={() => setViewMode("floorplan")}
        >
          🗺 Floor Plan
        </button>
        <button
          style={{ ...styles.viewTab, ...(viewMode === "3d" ? styles.viewTabActive : {}) }}
          onClick={() => setViewMode("3d")}
        >
          🧊 3D View
        </button>
      </div>

      {/* ── Floor tabs — floor plan mode only ── */}
      {viewMode === "floorplan" && (
        <FloorToggle
          count={floorCount}
          active={activeFloor}
          onChange={setActiveFloor}
        />
      )}

      {/* ── Simulation turn scrubber — floor plan mode when sim data available ── */}
      {viewMode === "floorplan" && simData && (
        <div style={styles.turnBar}>
          <button style={styles.turnBtn} onClick={() => setSimTurn(t => Math.max(0, t - 1))}>◀</button>
          <input type="range" min={0} max={simData.states.length - 1} value={simTurn}
            onChange={e => setSimTurn(+e.target.value)} style={styles.turnScrubber} />
          <button style={styles.turnBtn} onClick={() => setSimTurn(t => Math.min(simData.states.length - 1, t + 1))}>▶</button>
          <span style={styles.turnLabel}>
            T{simTurn} / T{simData.states.length - 1}
            {" · "}
            <span style={{ color: simData.states[simTurn]?.status === "success" ? "#22cc88" : simData.states[simTurn]?.status === "failed" ? "#ee4444" : "#888" }}>
              {simData.states[simTurn]?.status?.toUpperCase()}
            </span>
          </span>
        </div>
      )}

      {/* ── Main content ── */}
      <main style={styles.main}>
        {viewMode === "3d" ? (
          <SimView rawJson={rawJson} simData={simData} />
        ) : mode === "stamps" ? (
          // Stamp editor: palette sidebar + interactive canvas
          <div style={styles.editorRow}>
            <StampPalette
              selectedType={selectedStampType}
              onSelect={setSelectedStampType}
            />
            <FloorCanvas
              grid={currentGrid}
              floorIndex={activeFloor}
              roomLabels={roomLabels}
              cellProperties={cellProperties}
              stamps={stampsPerFloor[activeFloor] ?? []}
              gridWidth={gridMeta.width}
              gridHeight={gridMeta.height}
              selectedType={selectedStampType}
              onCellPaint={addStamp}
              onStampRemove={removeStamp}
            />
          </div>
        ) : (
          // Upload / view mode: read-only grid
          <GridView
            grid={currentGrid}
            floorIndex={activeFloor}
            roomLabels={roomLabels}
            cellProperties={cellProperties}
            scenario={rawJson?.scenario ?? null}
            turnState={simData ? simData.states[simTurn] : null}
          />
        )}
      </main>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  // Upload screen
  uploadScreen: {
    position:  "relative",
    minHeight: "100vh",
    backgroundColor: "#f5f5f5",
  },
  backBtn: {
    position:        "absolute",
    top:             "1.25rem",
    left:            "1.25rem",
    padding:         "0.4rem 0.9rem",
    fontSize:        "0.85rem",
    border:          "1px solid #ccc",
    borderRadius:    "6px",
    backgroundColor: "#fff",
    cursor:          "pointer",
    color:           "#444",
    zIndex:          10,
  },

  // Landing
  landing: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", minHeight: "100vh",
    backgroundColor: "#f5f5f5", fontFamily: "sans-serif", padding: "2rem",
  },
  landingTitle:    { fontSize: "2rem", marginBottom: "0.25rem" },
  landingSubtitle: { color: "#666", marginBottom: "2rem" },
  landingCards:    { display: "flex", gap: "1.5rem", flexWrap: "wrap", justifyContent: "center" },
  card: {
    backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "12px",
    padding: "1.5rem", width: "220px", cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center",
    textAlign: "center", gap: "0.5rem",
    transition: "box-shadow 0.15s",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  cardIcon:  { fontSize: "2rem" },
  cardTitle: { fontSize: "1.1rem", fontWeight: "700", margin: 0 },
  cardDesc:  { fontSize: "0.8rem", color: "#666", margin: 0 },

  // Post-upload decision
  postUploadCard: {
    backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "16px",
    padding: "2rem", maxWidth: "480px", width: "100%",
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "0.75rem", textAlign: "center",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  postUploadTitle:    { fontSize: "1.3rem", fontWeight: "700", margin: 0 },
  postUploadMeta:     { fontSize: "0.8rem", color: "#888", margin: 0 },
  postUploadQuestion: { fontSize: "0.95rem", color: "#444", margin: "0.5rem 0 0" },
  postUploadActions:  { display: "flex", gap: "0.75rem", width: "100%", marginTop: "0.25rem" },
  actionBtn: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
    gap: "0.3rem", padding: "1rem 0.75rem",
    border: "1.5px solid #ddd", borderRadius: "10px",
    backgroundColor: "#fafafa", cursor: "pointer",
    transition: "border-color 0.15s, box-shadow 0.15s",
  },
  actionBtnPrimary: {
    borderColor: "#2563eb", backgroundColor: "#eff6ff",
  },
  actionIcon: { fontSize: "1.5rem" },
  actionLabel: { fontSize: "0.9rem", fontWeight: "700", color: "#1a1a1a" },
  actionDesc:  { fontSize: "0.72rem", color: "#666", lineHeight: 1.4 },
  postUploadBack: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: "0.8rem", color: "#888", marginTop: "0.5rem",
    textDecoration: "underline",
  },

  // Editor
  wrapper: {
    display: "flex", flexDirection: "column", alignItems: "stretch",
    minHeight: "100vh", backgroundColor: "#f5f5f5",
    fontFamily: "sans-serif", padding: "1rem 1.5rem", gap: "0.75rem",
  },
  header: {
    display: "flex", alignItems: "flex-start",
    justifyContent: "space-between", width: "100%",
  },
  title:        { fontSize: "1.5rem", margin: 0, fontWeight: "700", color: "#1a1a1a" },
  buildingName: { fontSize: "0.9rem", color: "#555", margin: "0.2rem 0 0 0" },
  modeBadge:    { fontSize: "0.8rem", color: "#2563eb", margin: "0.2rem 0 0 0" },
  headerRight: {
    display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0,
  },
  dimControls: {
    display: "flex", alignItems: "center", gap: "0.35rem",
    backgroundColor: "#fff", border: "1px solid #ddd",
    borderRadius: "8px", padding: "0.3rem 0.75rem",
  },
  dimLabel: {
    display: "flex", alignItems: "center", gap: "0.25rem",
    fontSize: "0.78rem", color: "#555", fontWeight: "600",
  },
  dimInput: {
    width: "46px", padding: "0.2rem 0.3rem", fontSize: "0.8rem",
    border: "1px solid #ddd", borderRadius: "4px", textAlign: "center",
  },
  dimSep: { fontSize: "0.8rem", color: "#aaa" },
  resetBtn: {
    padding: "0.4rem 0.9rem", fontSize: "0.85rem",
    border: "1px solid #ccc", borderRadius: "6px",
    backgroundColor: "#fff", cursor: "pointer", color: "#444", flexShrink: 0,
  },
  simControls: {
    display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0,
  },
  simBtn: {
    padding: "0.4rem 1rem", fontSize: "0.85rem", fontWeight: "700",
    border: "none", borderRadius: "6px",
    backgroundColor: "#2563eb", cursor: "pointer", color: "#fff", flexShrink: 0,
  },
  simBtnLoading: {
    backgroundColor: "#6b9ed4", cursor: "not-allowed",
  },
  simSuccess: {
    fontSize: "0.8rem", color: "#16a34a", fontWeight: "600",
  },
  simError: {
    fontSize: "0.8rem", color: "#dc2626", fontWeight: "600", cursor: "help",
  },
  main: {
    width:         "100%",
    display:       "flex",
    flexDirection: "column",
    alignItems:    "stretch",
    gap:           "0.75rem",
    flex:          1,
  },
  editorRow: {
    display:    "flex",
    gap:        "1rem",
    alignItems: "flex-start",
    width:      "100%",
    flex:       1,
  },
  viewTabs: {
    display:       "flex",
    gap:           "0.5rem",
    width:         "100%",
    borderBottom:  "2px solid #e5e7eb",
  },
  viewTab: {
    padding:         "0.45rem 1.1rem",
    fontSize:        "0.85rem",
    fontWeight:      "600",
    border:          "1px solid #ddd",
    borderBottom:    "2px solid transparent",
    borderRadius:    "6px 6px 0 0",
    backgroundColor: "#f5f5f5",
    cursor:          "pointer",
    color:           "#666",
    marginBottom:    "-2px",
    transition:      "background-color 0.15s, color 0.15s",
  },
  viewTabActive: {
    backgroundColor: "#fff",
    color:           "#1a1a1a",
    borderColor:     "#e5e7eb",
    borderBottomColor: "#fff",
  },
  turnBar: {
    display:         "flex",
    alignItems:      "center",
    gap:             "0.5rem",
    padding:         "0.4rem 0.75rem",
    backgroundColor: "#fff",
    border:          "1px solid #e5e7eb",
    borderRadius:    "8px",
    width:           "100%",
  },
  turnBtn: {
    padding:         "0.2rem 0.6rem",
    fontSize:        "0.8rem",
    border:          "1px solid #ddd",
    borderRadius:    "5px",
    backgroundColor: "#fff",
    cursor:          "pointer",
    color:           "#444",
    flexShrink:      0,
  },
  turnScrubber: {
    flex:    1,
    cursor:  "pointer",
    accentColor: "#2563eb",
  },
  turnLabel: {
    fontSize:   "0.78rem",
    color:      "#555",
    fontFamily: "monospace",
    flexShrink: 0,
    minWidth:   "120px",
    textAlign:  "right",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SetupScreen — dimension picker shown before entering stamp editor
// ─────────────────────────────────────────────────────────────────────────────

function SetupScreen({ meta, onChange, onConfirm, onBack }) {
  function field(label, key, min, max) {
    return (
      <label style={setup.field}>
        <span style={setup.fieldLabel}>{label}</span>
        <input
          type="number" min={min} max={max} value={meta[key]}
          onChange={e => onChange({ ...meta, [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })}
          style={setup.input}
        />
        <span style={setup.fieldHint}>{min}–{max}</span>
      </label>
    );
  }

  return (
    <div style={setup.wrapper}>
      <div style={setup.card}>
        <span style={{ fontSize: "2rem" }}>📐</span>
        <h2 style={setup.title}>Set up your floor plan</h2>
        <p style={setup.subtitle}>
          Choose the grid size and number of floors. A wall border is placed automatically.
          You can resize at any time from the editor header.
        </p>

        <div style={setup.fields}>
          {field("Width (cells)",  "width",      3, 50)}
          {field("Height (cells)", "height",     3, 50)}
          {field("Floors",         "floorCount", 1, 20)}
        </div>

        <p style={setup.preview}>
          Canvas: {meta.width} × {meta.height} cells · {meta.floorCount} floor{meta.floorCount !== 1 ? "s" : ""}
        </p>

        <div style={setup.actions}>
          <button style={setup.backBtn} onClick={onBack}>← Back</button>
          <button style={setup.confirmBtn} onClick={onConfirm}>
            Create floor plan →
          </button>
        </div>
      </div>
    </div>
  );
}

const setup = {
  wrapper: {
    display: "flex", alignItems: "center", justifyContent: "center",
    minHeight: "100vh", backgroundColor: "#f5f5f5",
    fontFamily: "sans-serif", padding: "2rem",
  },
  card: {
    backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "16px",
    padding: "2rem", maxWidth: "400px", width: "100%",
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "0.75rem", textAlign: "center",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  title:    { fontSize: "1.3rem", fontWeight: "700", margin: 0 },
  subtitle: { fontSize: "0.8rem", color: "#666", margin: 0, lineHeight: 1.5 },
  fields:   { display: "flex", flexDirection: "column", gap: "0.6rem", width: "100%", marginTop: "0.5rem" },
  field: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: "0.5rem", backgroundColor: "#f9f9f9",
    border: "1px solid #eee", borderRadius: "8px", padding: "0.5rem 0.75rem",
  },
  fieldLabel: { fontSize: "0.85rem", fontWeight: "600", color: "#333", flex: 1, textAlign: "left" },
  input: {
    width: "60px", padding: "0.25rem 0.4rem", fontSize: "0.9rem",
    border: "1px solid #ddd", borderRadius: "6px", textAlign: "center",
  },
  fieldHint: { fontSize: "0.7rem", color: "#bbb", minWidth: "36px", textAlign: "right" },
  preview: { fontSize: "0.8rem", color: "#888", margin: 0 },
  actions: { display: "flex", gap: "0.75rem", width: "100%", marginTop: "0.25rem" },
  backBtn: {
    flex: 1, padding: "0.6rem", fontSize: "0.85rem",
    border: "1px solid #ccc", borderRadius: "8px",
    backgroundColor: "#fff", cursor: "pointer", color: "#444",
  },
  confirmBtn: {
    flex: 2, padding: "0.6rem", fontSize: "0.9rem", fontWeight: "700",
    border: "none", borderRadius: "8px",
    backgroundColor: "#2563eb", cursor: "pointer", color: "#fff",
  },
};