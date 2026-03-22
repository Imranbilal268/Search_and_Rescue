import { useState, useMemo, useCallback, useEffect } from "react";
import FileUpload    from "./fileUpload";
import FloorToggle   from "./Floortoggle";
import GridView      from "./GridView";
import StampPalette  from "./Stamppalette";
import FloorCanvas   from "./Floorcanvas";
import SimView       from "./SimView";
import { compileAllFloors } from "./StampComplier";
import { createStamp, updateStamp, STAMP_TYPES } from "./Stamptypes";
import { gridToStamps } from "./GridToStamps";

const DEFAULT_FLOOR_COUNT = 3;
const DEFAULT_GRID_WIDTH  = 20;
const DEFAULT_GRID_HEIGHT = 15;

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

function processRawJson(json) {
  try {
    const b = json.building || json;
    const floors = b.grid || [];
    if (!floors.length) return null;
    const meta = b.meta || {};
    return {
      floors,
      buildingName:        meta.name ?? b.name ?? null,
      roomLabels:          b.room_labels          || {},
      cellProperties:      b.cell_properties      || {},
      floorLabels:         b.floor_labels         || {},
      verticalConnections: b.vertical_connections || [],
      exitNodes:           b.exit_nodes           || [],
      rawJson: json,
    };
  } catch { return null; }
}

// Dark-theme design tokens
const C = {
  bg:        '#0a0a0f',
  surface:   'rgba(255,255,255,.025)',
  border:    'rgba(255,255,255,.07)',
  borderHi:  'rgba(255,255,255,.12)',
  text:      'rgba(255,255,255,.8)',
  textDim:   'rgba(255,255,255,.3)',
  textFaint: 'rgba(255,255,255,.15)',
  accent:    '#5bf0a5',
  accentBg:  'rgba(91,240,165,.08)',
  accentBdr: 'rgba(91,240,165,.25)',
  blue:      '#3b82f6',
  blueBg:    'rgba(59,130,246,.1)',
  blueBdr:   'rgba(59,130,246,.25)',
  amber:     '#f59e0b',
  amberBg:   'rgba(245,158,11,.1)',
  amberBdr:  'rgba(245,158,11,.25)',
  red:       '#ef4444',
  redBg:     'rgba(239,68,68,.08)',
  redBdr:    'rgba(239,68,68,.2)',
  mono:      "'JetBrains Mono', monospace",
  sans:      "'Outfit', sans-serif",
};

export default function EditorShell({ initialJson, onJsonChange, onBack, onNavigate }) {
  const [mode,              setMode]              = useState(null);
  const [activeFloor,       setActiveFloor]       = useState(0);
  const [selectedStampType, setSelectedStampType] = useState(null);
  const [viewMode,          setViewMode]          = useState("floorplan");

  const [building,  setBuilding]  = useState(null);
  const [rawJson,   setRawJson]   = useState(null);

  const [setupMeta, setSetupMeta] = useState({
    width:      DEFAULT_GRID_WIDTH,
    height:     DEFAULT_GRID_HEIGHT,
    floorCount: DEFAULT_FLOOR_COUNT,
  });

  const [stampsPerFloor, setStampsPerFloor] = useState({});
  const [gridMeta,       setGridMeta]       = useState({
    width:      DEFAULT_GRID_WIDTH,
    height:     DEFAULT_GRID_HEIGHT,
    floorCount: DEFAULT_FLOOR_COUNT,
  });

  // ── Scenario state ─────────────────────────────────────────────────────────
  const [responders,    setResponders]    = useState([]);
  const [victims,       setVictims]       = useState([]);
  const [threat,        setThreat]        = useState(null); // null | { type:'fire', origin:{x,y,z}, fire_params:{...} }
  const [scenarioMode,  setScenarioMode]  = useState(null); // 'place-responder' | 'place-victim' | 'place-fire' | null
  const [showScenario,  setShowScenario]  = useState(true);

  // Auto-load shared JSON
  useEffect(() => {
    if (!initialJson || mode !== null) return;
    const data = processRawJson(initialJson);
    if (!data) return;
    setBuilding(data);
    setRawJson(initialJson);
    setActiveFloor(0);
    setMode("post-upload");
    // Load existing scenario if present
    const sc = initialJson?.scenario;
    if (sc?.responders) setResponders(sc.responders);
    if (sc?.victims)    setVictims(sc.victims);
    if (sc?.threat)     setThreat(sc.threat);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync scenario changes back to shared JSON
  useEffect(() => {
    if (!rawJson) return;
    const updated = {
      ...rawJson,
      scenario: {
        ...(rawJson.scenario || {}),
        responders,
        victims,
        ...(threat ? { threat } : {}),
      },
    };
    onJsonChange?.(updated);
  }, [responders, victims, threat]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  const compiledGrids = useMemo(() => {
    if (mode !== "stamps") return null;
    return compileAllFloors(stampsPerFloor, gridMeta.floorCount, gridMeta.width, gridMeta.height);
  }, [mode, stampsPerFloor, gridMeta]);

  const paintCell = useCallback((type, x, y) => {
    // If in scenario placement mode, place entity instead
    if (scenarioMode === 'place-responder') {
      const id = 'R' + (responders.length + 1);
      setResponders(prev => [...prev, { id, x, y, z: activeFloor }]);
      setScenarioMode(null);
      return;
    }
    if (scenarioMode === 'place-victim') {
      const id = 'V' + (victims.length + 1);
      setVictims(prev => [...prev, { id, x, y, z: activeFloor, mobility: 'immobile' }]);
      setScenarioMode(null);
      return;
    }
    if (scenarioMode === 'place-fire') {
      setThreat(prev => ({
        type: 'fire',
        origin: { x, y, z: activeFloor },
        fire_params: prev?.fire_params ?? { spread_probability: 0.4, stairwell_acceleration: 2.0, accelerant_bonus: 0.3 },
      }));
      setScenarioMode(null);
      return;
    }
    const stamp = createStamp(type, x, y);
    stamp.width  = 1;
    stamp.height = 1;
    setStampsPerFloor(prev => {
      const existing = prev[activeFloor] ?? [];
      const filtered = existing.filter(s => !(s.x === x && s.y === y));
      return { ...prev, [activeFloor]: [...filtered, stamp] };
    });
  }, [activeFloor, scenarioMode, responders, victims]);

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

  // ── Mode transitions ────────────────────────────────────────────────────
  function handleFileLoad(data) {
    setBuilding(data);
    setRawJson(data.rawJson ?? null);
    setActiveFloor(0);
    setMode("post-upload");
    onJsonChange?.(data.rawJson ?? null);
    const sc = data.rawJson?.scenario;
    if (sc?.responders) setResponders(sc.responders);
    if (sc?.victims)    setVictims(sc.victims);
    if (sc?.threat)     setThreat(sc.threat);
  }

  function handleViewOnly() {
    setMode("upload");
    if (rawJson?.scenario) setViewMode("3d");
  }

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

  function handleGoToSetup()  { setMode("setup"); }
  function handleGoToUpload() { setMode("choosing-upload"); }

  function handleStartBlank(w, h, fc) {
    const meta = { width: w, height: h, floorCount: fc };
    setGridMeta(meta);
    const initial = {};
    for (let z = 0; z < fc; z++) initial[z] = buildWallBorder(w, h);
    setStampsPerFloor(initial);
    setActiveFloor(0);
    setMode("stamps");
  }

  function handleResizeGrid(field, rawVal) {
    const val = Math.max(3, Math.min(50, Number(rawVal) || 3));
    const newMeta = { ...gridMeta, [field]: val };
    setGridMeta(newMeta);
    const newBorder = buildWallBorder(newMeta.width, newMeta.height);
    setStampsPerFloor(prev => {
      const next = {};
      for (let z = 0; z < newMeta.floorCount; z++) {
        const interior = (prev[z] ?? []).filter(s =>
          !s.id.startsWith("border_") &&
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
    setStampsPerFloor({});
    setActiveFloor(0);
    setSelectedStampType(null);
    setResponders([]);
    setVictims([]);
    setThreat(null);
    setScenarioMode(null);
  }

  function handleOpenInBuildingEditor() {
    if (!rawJson) return;
    const s = JSON.stringify(rawJson);
    localStorage.setItem('rescuegrid_load_json', s);
    localStorage.setItem('rescuegrid_current_json', s);
    window.location.href = '/BuildingEditor.html';
  }

  // ── Scenario helpers ───────────────────────────────────────────────────
  function removeResponder(id) { setResponders(prev => prev.filter(r => r.id !== id)); }
  function removeVictim(id)    { setVictims(prev => prev.filter(v => v.id !== id)); }
  function updateVictimMobility(id, mobility) {
    setVictims(prev => prev.map(v => v.id === id ? { ...v, mobility } : v));
  }
  function updateEntityFloor(type, id, z) {
    const zi = Math.max(0, parseInt(z) || 0);
    if (type === 'responder') setResponders(prev => prev.map(r => r.id === id ? { ...r, z: zi } : r));
    else setVictims(prev => prev.map(v => v.id === id ? { ...v, z: zi } : v));
  }
  function updateEntityCoord(type, id, field, val) {
    const n = Math.max(0, parseInt(val) || 0);
    if (type === 'responder') setResponders(prev => prev.map(r => r.id === id ? { ...r, [field]: n } : r));
    else setVictims(prev => prev.map(v => v.id === id ? { ...v, [field]: n } : v));
  }

  // ── Threat helpers ──────────────────────────────────────────────────────
  function updateFireParam(key, val) {
    setThreat(prev => prev ? {
      ...prev,
      fire_params: { ...prev.fire_params, [key]: parseFloat(val) || 0 },
    } : prev);
  }
  function updateFireOriginCoord(field, val) {
    const n = Math.max(0, parseInt(val) || 0);
    setThreat(prev => prev ? { ...prev, origin: { ...prev.origin, [field]: n } } : prev);
  }

  // Derived scenario object for GridView
  const liveScenario = {
    responders: responders.length ? responders : (rawJson?.scenario?.responders ?? []),
    victims:    victims.length    ? victims    : (rawJson?.scenario?.victims    ?? []),
    threat:     threat ?? rawJson?.scenario?.threat ?? null,
  };

  // ── Derived props ──────────────────────────────────────────────────────
  const currentGrid = mode === "upload"
    ? building?.floors?.[activeFloor] ?? []
    : compiledGrids?.[activeFloor]    ?? [];
  const floorCount     = mode === "upload" ? (building?.floors?.length ?? 1) : gridMeta.floorCount;
  const roomLabels     = mode === "upload" ? (building?.roomLabels     ?? {}) : {};
  const cellProperties = mode === "upload" ? (building?.cellProperties ?? {}) : {};
  const buildingName   = building?.buildingName ?? null;

  // ── LANDING ────────────────────────────────────────────────────────────
  if (mode === null) {
    return (
      <div style={S.fullPage}>
        {onBack && (
          <button style={S.floatBack} onClick={onBack}>← HOME</button>
        )}
        <div style={S.landingWrap}>
          <div style={{ fontFamily: C.mono, fontSize: 8, color: 'rgba(91,240,165,.5)', letterSpacing: '2px', marginBottom: 16 }}>
            RESCUEGRID · SCENARIO BUILDER
          </div>
          <h1 style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 36, letterSpacing: -1, color: '#fff', margin: '0 0 8px' }}>
            Scenario Builder
          </h1>
          <p style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, lineHeight: 1.7, maxWidth: 440, textAlign: 'center', margin: '0 0 40px' }}>
            Design floor plans, place responders and victims, define threats — then export directly to the simulation engine.
          </p>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <LandingCard
              icon="✏️" tag="BLANK" accent={C.accent}
              title="Start blank"
              desc="Set grid dimensions and build floors from scratch with the stamp palette."
              onClick={handleGoToSetup}
            />
            <LandingCard
              icon="📂" tag="IMPORT" accent="#64b5f6"
              title="Import JSON"
              desc="Load an existing building JSON to view, edit, and add scenario data."
              onClick={handleGoToUpload}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── SETUP ──────────────────────────────────────────────────────────────
  if (mode === "setup") {
    return <SetupScreen meta={setupMeta} onChange={setSetupMeta}
      onConfirm={() => handleStartBlank(setupMeta.width, setupMeta.height, setupMeta.floorCount)}
      onBack={handleReset} />;
  }

  // ── UPLOAD ─────────────────────────────────────────────────────────────
  if (mode === "choosing-upload") {
    return (
      <div style={{ ...S.fullPage, position: 'relative' }}>
        <button style={S.floatBack} onClick={handleReset}>← BACK</button>
        <div style={{ filter: 'invert(0)' }}>
          <FileUpload onLoad={handleFileLoad} />
        </div>
      </div>
    );
  }

  // ── POST-UPLOAD ────────────────────────────────────────────────────────
  if (mode === "post-upload" && building) {
    const fw = building.floors.length === 1 ? "floor" : "floors";
    return (
      <div style={S.fullPage}>
        <div style={S.postCard}>
          <div style={{ fontFamily: C.mono, fontSize: 8, color: 'rgba(91,240,165,.5)', letterSpacing: '2px', marginBottom: 12 }}>
            FILE LOADED
          </div>
          <div style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 22, color: '#fff', marginBottom: 4 }}>
            {building.buildingName ?? "Building"}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, marginBottom: 24 }}>
            {building.floors.length} {fw}&nbsp;·&nbsp;
            {building.floors[0]?.[0]?.length ?? "?"} × {building.floors[0]?.length ?? "?"} cells
          </div>

          <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint, marginBottom: 14, letterSpacing: '0.5px' }}>
            HOW WOULD YOU LIKE TO OPEN IT?
          </div>

          <div style={{ display: 'flex', gap: 10, width: '100%', marginBottom: 16 }}>
            <PostBtn icon="👁" label="View only" desc="Read-only floor plan." onClick={handleViewOnly} />
            <PostBtn icon="✏️" label="Edit as stamps" desc="Convert grid to editable cells." onClick={handleEditAsStamps} primary />
          </div>

          <button style={S.textLink} onClick={handleGoToUpload}>← Upload a different file</button>
        </div>
      </div>
    );
  }

  // ── EDITOR / VIEWER ────────────────────────────────────────────────────
  const canEdit = mode === "stamps";
  const canPlace = scenarioMode !== null;

  return (
    <div style={S.shell}>

      {/* ── Topbar ── */}
      <div style={S.topbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 14, color: C.text, letterSpacing: -.3 }}>
            Scenario Builder
          </span>
          {buildingName && (
            <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textFaint, letterSpacing: '.5px' }}>
              · {buildingName}
            </span>
          )}
          {canEdit && (
            <span style={{ fontFamily: C.mono, fontSize: 7, color: C.accent, background: C.accentBg, border: `1px solid ${C.accentBdr}`, padding: '2px 7px', borderRadius: 4, letterSpacing: '1px' }}>
              EDIT
            </span>
          )}
          {canEdit && canPlace && (
            <span style={{ fontFamily: C.mono, fontSize: 7, color: scenarioMode === 'place-fire' ? '#ff6030' : C.amber, background: scenarioMode === 'place-fire' ? 'rgba(255,96,48,.12)' : C.amberBg, border: `1px solid ${scenarioMode === 'place-fire' ? 'rgba(255,96,48,.3)' : C.amberBdr}`, padding: '2px 7px', borderRadius: 4, letterSpacing: '1px' }}>
              {scenarioMode === 'place-responder' ? '📍 CLICK TO PLACE RESPONDER' : scenarioMode === 'place-victim' ? '📍 CLICK TO PLACE VICTIM' : '🔥 CLICK TO PLACE FIRE ORIGIN'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Grid resize — stamp mode only */}
          {canEdit && (
            <div style={S.dimRow}>
              {[['W', 'width', 3, 50], ['H', 'height', 3, 50], ['FL', 'floorCount', 1, 20]].map(([lbl, field, mn, mx]) => (
                <label key={field} style={S.dimLabel}>
                  <span style={S.dimLblTxt}>{lbl}</span>
                  <input type="number" min={mn} max={mx} value={gridMeta[field]}
                    onChange={e => handleResizeGrid(field, e.target.value)}
                    style={S.dimInput} />
                </label>
              ))}
            </div>
          )}
          {rawJson && (
            <button style={S.topBtn} onClick={handleOpenInBuildingEditor}>
              🏗 Building Editor
            </button>
          )}
          <button
            style={{ ...S.topBtn, color: 'rgba(91,240,165,.5)', borderColor: C.accentBdr, background: C.accentBg }}
            onClick={() => setShowScenario(v => !v)}
          >
            {showScenario ? '◀ Scenario' : '▶ Scenario'}
          </button>
          {onNavigate && (
            <button
              style={{ ...S.topBtn, color: '#ff8844', borderColor: 'rgba(255,136,68,.3)', background: 'rgba(255,136,68,.08)', fontWeight: 700 }}
              onClick={() => onNavigate('simulation')}
            >
              Run Simulation →
            </button>
          )}
          <button style={S.topBtnDanger} onClick={onBack ?? handleReset}>← Home</button>
        </div>
      </div>

      {/* ── View tabs ── */}
      <div style={S.tabRow}>
        {['floorplan', '3d'].map(v => (
          <button key={v} style={{ ...S.tab, ...(viewMode === v ? S.tabActive : {}) }}
            onClick={() => setViewMode(v)}>
            {v === 'floorplan' ? '🗺 Floor Plan' : '🧊 3D View'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {viewMode === 'floorplan' && canEdit && canPlace && (
          <button style={{ ...S.tab, color: C.textDim, fontSize: 9 }}
            onClick={() => setScenarioMode(null)}>
            ✕ Cancel placement
          </button>
        )}
      </div>

      {/* ── Floor tabs ── */}
      {viewMode === "floorplan" && (
        <FloorToggle count={floorCount} active={activeFloor} onChange={setActiveFloor} />
      )}

      {/* ── Body ── */}
      <div style={S.body}>

        {/* ── Main content ── */}
        <div style={S.mainArea}>
          {viewMode === "3d" ? (
            <SimView rawJson={rawJson} />
          ) : canEdit ? (
            <div style={S.editorRow}>
              <StampPalette selectedType={selectedStampType} onSelect={setSelectedStampType} />
              <FloorCanvas
                grid={currentGrid}
                floorIndex={activeFloor}
                roomLabels={roomLabels}
                cellProperties={cellProperties}
                stamps={stampsPerFloor[activeFloor] ?? []}
                gridWidth={gridMeta.width}
                gridHeight={gridMeta.height}
                selectedType={canPlace ? '__scenario__' : selectedStampType}
                onCellPaint={addStamp}
                onStampRemove={removeStamp}
                scenario={liveScenario}
              />
            </div>
          ) : (
            <GridView
              grid={currentGrid}
              floorIndex={activeFloor}
              roomLabels={roomLabels}
              cellProperties={cellProperties}
              scenario={liveScenario}
              turnState={null}
            />
          )}
        </div>

        {/* ── Scenario sidebar ── */}
        {showScenario && (
          <div style={S.sidebar}>
            <div style={S.sidebarTitle}>Scenario</div>

            {/* Responders */}
            <div style={S.sideSection}>
              <div style={S.sideSectionHeader}>
                <span style={{ ...S.sideLabel, color: C.blue }}>● RESPONDERS</span>
                <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textFaint }}>{responders.length}</span>
              </div>
              {responders.map((r, i) => (
                <EntityRow key={r.id}
                  entity={r} type="responder" index={i}
                  floorCount={floorCount}
                  onRemove={() => removeResponder(r.id)}
                  onFloorChange={z => updateEntityFloor('responder', r.id, z)}
                  onCoordChange={(f, v) => updateEntityCoord('responder', r.id, f, v)}
                />
              ))}
              <button
                style={{ ...S.addBtn, borderColor: C.blueBdr, color: C.blue, background: (canEdit && scenarioMode === 'place-responder') ? C.blueBg : 'transparent' }}
                onClick={() => {
                  if (canEdit) {
                    setScenarioMode(scenarioMode === 'place-responder' ? null : 'place-responder');
                  } else {
                    setResponders(prev => [...prev, { id: 'R' + (prev.length + 1), x: 0, y: 0, z: activeFloor }]);
                  }
                }}
              >
                + {canEdit && scenarioMode === 'place-responder' ? 'Click grid to place…' : 'Add Responder'}
              </button>
            </div>

            <div style={S.divider} />

            {/* Victims */}
            <div style={S.sideSection}>
              <div style={S.sideSectionHeader}>
                <span style={{ ...S.sideLabel, color: C.amber }}>● VICTIMS</span>
                <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textFaint }}>{victims.length}</span>
              </div>
              {victims.map((v, i) => (
                <EntityRow key={v.id}
                  entity={v} type="victim" index={i}
                  floorCount={floorCount}
                  onRemove={() => removeVictim(v.id)}
                  onFloorChange={z => updateEntityFloor('victim', v.id, z)}
                  onCoordChange={(f, val) => updateEntityCoord('victim', v.id, f, val)}
                  onMobilityChange={m => updateVictimMobility(v.id, m)}
                />
              ))}
              <button
                style={{ ...S.addBtn, borderColor: C.amberBdr, color: C.amber, background: (canEdit && scenarioMode === 'place-victim') ? C.amberBg : 'transparent' }}
                onClick={() => {
                  if (canEdit) {
                    setScenarioMode(scenarioMode === 'place-victim' ? null : 'place-victim');
                  } else {
                    setVictims(prev => [...prev, { id: 'V' + (prev.length + 1), x: 0, y: 0, z: activeFloor, mobility: 'immobile' }]);
                  }
                }}
              >
                + {canEdit && scenarioMode === 'place-victim' ? 'Click grid to place…' : 'Add Victim'}
              </button>
            </div>

            <div style={S.divider} />

            {/* Threats */}
            <div style={S.sideSection}>
              <div style={S.sideSectionHeader}>
                <span style={{ ...S.sideLabel, color: '#ff6030' }}>🔥 THREATS</span>
                {threat && <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textFaint }}>1</span>}
              </div>

              {threat ? (
                <div style={{ background: 'rgba(255,96,48,.05)', border: '1px solid rgba(255,96,48,.15)', borderRadius: 7, padding: '8px', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 9, color: '#ff6030', fontWeight: 700 }}>FIRE</span>
                    <button onClick={() => setThreat(null)} style={{ background: C.redBg, border: `1px solid ${C.redBdr}`, borderRadius: 4, color: C.red, cursor: 'pointer', fontFamily: C.mono, fontSize: 8, padding: '1px 5px' }}>✕</button>
                  </div>
                  {/* Origin coords */}
                  <div style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint, marginBottom: 4, letterSpacing: '.5px' }}>ORIGIN</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {[['x', threat.origin.x], ['y', threat.origin.y]].map(([field, val]) => (
                      <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>{field.toUpperCase()}</span>
                        <input type="number" min={0} value={val}
                          onChange={e => updateFireOriginCoord(field, e.target.value)}
                          style={S.entityInput} />
                      </label>
                    ))}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>FL</span>
                      <input type="number" min={0} max={Math.max(0, floorCount - 1)} value={threat.origin.z}
                        onChange={e => updateFireOriginCoord('z', e.target.value)}
                        style={S.entityInput} />
                    </label>
                  </div>
                  {/* Fire params */}
                  <div style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint, marginBottom: 4, letterSpacing: '.5px' }}>PARAMS</div>
                  {[
                    ['spread_probability', 'Spread prob', 0, 1, 0.05],
                    ['stairwell_acceleration', 'Stair accel', 1, 5, 0.1],
                    ['accelerant_bonus', 'Accel bonus', 0, 1, 0.05],
                  ].map(([key, label, min, max, step]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 7.5, color: C.textFaint }}>{label}</span>
                      <input type="number" min={min} max={max} step={step}
                        value={threat.fire_params?.[key] ?? (key === 'stairwell_acceleration' ? 2.0 : key === 'accelerant_bonus' ? 0.3 : 0.4)}
                        onChange={e => updateFireParam(key, e.target.value)}
                        style={{ ...S.entityInput, width: 46, color: '#ff8844' }} />
                    </div>
                  ))}
                  {canEdit && (
                    <button
                      style={{ ...S.addBtn, marginTop: 6, borderColor: 'rgba(255,96,48,.3)', color: '#ff6030', background: scenarioMode === 'place-fire' ? 'rgba(255,96,48,.1)' : 'transparent', fontSize: 8 }}
                      onClick={() => setScenarioMode(scenarioMode === 'place-fire' ? null : 'place-fire')}
                    >
                      {scenarioMode === 'place-fire' ? 'Click grid to reposition…' : '↺ Reposition origin'}
                    </button>
                  )}
                </div>
              ) : (
                <button
                  style={{ ...S.addBtn, borderColor: 'rgba(255,96,48,.25)', color: '#ff6030', background: (canEdit && scenarioMode === 'place-fire') ? 'rgba(255,96,48,.1)' : 'transparent' }}
                  onClick={() => {
                    if (canEdit) {
                      setScenarioMode(scenarioMode === 'place-fire' ? null : 'place-fire');
                    } else {
                      setThreat({ type: 'fire', origin: { x: 0, y: 0, z: activeFloor }, fire_params: { spread_probability: 0.4, stairwell_acceleration: 2.0, accelerant_bonus: 0.3 } });
                    }
                  }}
                >
                  + {canEdit && scenarioMode === 'place-fire' ? 'Click grid to place…' : 'Add Fire'}
                </button>
              )}
            </div>

            <div style={S.divider} />

            {/* Summary */}
            <div style={{ padding: '8px 0' }}>
              <div style={{ fontFamily: C.mono, fontSize: 7.5, color: C.textFaint, letterSpacing: '.5px', marginBottom: 8 }}>SCENARIO SUMMARY</div>
              <div style={S.summaryRow}>
                <span style={S.summaryKey}>Responders</span>
                <span style={{ ...S.summaryVal, color: C.blue }}>{responders.length}</span>
              </div>
              <div style={S.summaryRow}>
                <span style={S.summaryKey}>Victims</span>
                <span style={{ ...S.summaryVal, color: C.amber }}>{victims.length}</span>
              </div>
              <div style={S.summaryRow}>
                <span style={S.summaryKey}>Immobile</span>
                <span style={S.summaryVal}>{victims.filter(v => v.mobility === 'immobile').length}</span>
              </div>
              <div style={S.summaryRow}>
                <span style={S.summaryKey}>Mobile</span>
                <span style={S.summaryVal}>{victims.filter(v => v.mobility !== 'immobile').length}</span>
              </div>
              <div style={S.summaryRow}>
                <span style={S.summaryKey}>Fire threat</span>
                <span style={{ ...S.summaryVal, color: threat ? '#ff6030' : C.textFaint }}>{threat ? `(${threat.origin.x},${threat.origin.y}) fl${threat.origin.z}` : '—'}</span>
              </div>
            </div>

            {(responders.length > 0 || victims.length > 0 || threat) && (
              <button
                style={{ ...S.addBtn, marginTop: 6, borderColor: C.redBdr, color: C.red, background: C.redBg }}
                onClick={() => { setResponders([]); setVictims([]); setThreat(null); }}
              >
                ✕ Clear all
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function LandingCard({ icon, tag, accent, title, desc, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 220, padding: '24px 20px', borderRadius: 14, cursor: 'pointer',
        background: hov ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.02)',
        border: `1px solid ${hov ? accent + '40' : 'rgba(255,255,255,.07)'}`,
        transition: 'all .2s', display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, textAlign: 'center',
        boxShadow: hov ? `0 8px 32px rgba(0,0,0,.4)` : 'none',
        transform: hov ? 'translateY(-2px)' : 'none',
      }}
    >
      <span style={{ fontSize: 28 }}>{icon}</span>
      <span style={{ fontFamily: C.mono, fontSize: 7.5, color: accent, letterSpacing: '1.5px', background: accent + '18', padding: '2px 8px', borderRadius: 4, border: `1px solid ${accent}30` }}>
        {tag}
      </span>
      <div style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 16, color: '#fff' }}>{title}</div>
      <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.textDim, lineHeight: 1.6 }}>{desc}</div>
    </div>
  );
}

function PostBtn({ icon, label, desc, onClick, primary }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 6, padding: '16px 12px',
        border: `1px solid ${hov ? (primary ? C.accentBdr : C.borderHi) : (primary ? C.accentBdr : C.border)}`,
        borderRadius: 10, cursor: 'pointer',
        background: hov ? (primary ? C.accentBg : 'rgba(255,255,255,.04)') : (primary ? 'rgba(91,240,165,.04)' : 'rgba(255,255,255,.02)'),
        transition: 'all .15s',
      }}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 13, color: primary ? C.accent : C.text }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textDim, lineHeight: 1.5, textAlign: 'center' }}>{desc}</span>
    </button>
  );
}

function EntityRow({ entity, type, index, floorCount, onRemove, onFloorChange, onCoordChange, onMobilityChange }) {
  const accent = type === 'responder' ? C.blue : C.amber;
  return (
    <div style={{
      background: 'rgba(255,255,255,.02)', border: `1px solid rgba(255,255,255,.05)`,
      borderRadius: 7, padding: '7px 8px', marginBottom: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: C.mono, fontSize: 9, color: accent, fontWeight: 700 }}>{entity.id}</span>
        <button onClick={onRemove} style={{
          background: C.redBg, border: `1px solid ${C.redBdr}`, borderRadius: 4,
          color: C.red, cursor: 'pointer', fontFamily: C.mono, fontSize: 8, padding: '1px 5px',
        }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {[['x', entity.x], ['y', entity.y]].map(([field, val]) => (
          <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>{field.toUpperCase()}</span>
            <input type="number" min={0} value={val}
              onChange={e => onCoordChange(field, e.target.value)}
              style={S.entityInput} />
          </label>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>FL</span>
          <input type="number" min={0} max={Math.max(0, floorCount - 1)} value={entity.z}
            onChange={e => onFloorChange(e.target.value)}
            style={S.entityInput} />
        </label>
        {type === 'victim' && (
          <select value={entity.mobility || 'immobile'}
            onChange={e => onMobilityChange?.(e.target.value)}
            style={S.mobilitySelect}>
            <option value="immobile">immobile</option>
            <option value="mobile">mobile</option>
            <option value="injured">injured</option>
          </select>
        )}
      </div>
    </div>
  );
}

// ── Setup screen ────────────────────────────────────────────────────────────
function SetupScreen({ meta, onChange, onConfirm, onBack }) {
  function field(label, key, min, max) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 8 }}>
        <span style={{ fontFamily: C.sans, fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" min={min} max={max} value={meta[key]}
            onChange={e => onChange({ ...meta, [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })}
            style={{ width: 64, padding: '5px 8px', textAlign: 'center', fontFamily: C.mono, fontSize: 13, background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, color: C.accent, outline: 'none' }} />
          <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textFaint }}>{min}–{max}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={S.fullPage}>
      <div style={S.postCard}>
        <div style={{ fontFamily: C.mono, fontSize: 8, color: 'rgba(91,240,165,.5)', letterSpacing: '2px', marginBottom: 12 }}>
          NEW FLOOR PLAN
        </div>
        <div style={{ fontFamily: C.sans, fontWeight: 700, fontSize: 20, color: '#fff', marginBottom: 4 }}>
          Set up your floor plan
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 9, color: C.textDim, marginBottom: 24, lineHeight: 1.6 }}>
          Choose grid size and floors. A wall border is placed automatically.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', marginBottom: 16 }}>
          {field("Width (cells)",  "width",      3, 50)}
          {field("Height (cells)", "height",     3, 50)}
          {field("Floors",         "floorCount", 1, 20)}
        </div>
        <div style={{ fontFamily: C.mono, fontSize: 8.5, color: C.textFaint, marginBottom: 20 }}>
          {meta.width} × {meta.height} cells · {meta.floorCount} floor{meta.floorCount !== 1 ? 's' : ''}
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button style={S.textBtn} onClick={onBack}>← Back</button>
          <button style={S.accentBtn} onClick={onConfirm}>Create floor plan →</button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  // Full-page dark screen
  fullPage: {
    minHeight: '100vh', background: C.bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: C.sans, padding: '2rem',
  },
  landingWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  postCard: {
    background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 16, padding: '28px 28px 24px', maxWidth: 440, width: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
    boxShadow: '0 8px 40px rgba(0,0,0,.4)',
  },
  floatBack: {
    position: 'absolute', top: 14, left: 14,
    padding: '6px 14px', background: 'rgba(255,255,255,.04)',
    border: '1px solid rgba(255,255,255,.08)', borderRadius: 7,
    color: 'rgba(255,255,255,.4)', cursor: 'pointer',
    fontFamily: C.mono, fontSize: 10, letterSpacing: '.5px',
  },
  textLink: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: C.mono, fontSize: 9, color: C.textFaint,
    letterSpacing: '.3px', textDecoration: 'underline',
  },
  textBtn: {
    flex: 1, padding: '9px', fontFamily: C.mono, fontSize: 10,
    border: '1px solid rgba(255,255,255,.08)', borderRadius: 8,
    background: 'rgba(255,255,255,.03)', color: C.textDim, cursor: 'pointer',
    letterSpacing: '.5px',
  },
  accentBtn: {
    flex: 2, padding: '9px', fontFamily: C.mono, fontSize: 10, fontWeight: 700,
    border: `1px solid ${C.accentBdr}`, borderRadius: 8,
    background: C.accentBg, color: C.accent, cursor: 'pointer',
    letterSpacing: '.5px',
  },

  // ── Shell (editor) ──
  shell: {
    height: '100vh', background: C.bg, fontFamily: C.sans,
    display: 'flex', flexDirection: 'column', overflow: 'hidden', color: '#fff',
  },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, padding: '10px 18px',
    background: 'rgba(10,10,18,.95)', borderBottom: '1px solid rgba(255,255,255,.06)',
    backdropFilter: 'blur(20px)', flexShrink: 0, zIndex: 10,
  },
  dimRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '4px 10px', background: 'rgba(0,0,0,.3)',
    border: '1px solid rgba(255,255,255,.07)', borderRadius: 7,
  },
  dimLabel: { display: 'flex', alignItems: 'center', gap: 4 },
  dimLblTxt: { fontFamily: C.mono, fontSize: 7, color: C.textFaint, letterSpacing: '.5px' },
  dimInput: {
    width: 44, padding: '3px 5px', textAlign: 'center',
    fontFamily: C.mono, fontSize: 11,
    background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 5, color: C.accent, outline: 'none',
  },
  topBtn: {
    padding: '5px 12px', fontFamily: C.mono, fontSize: 9, letterSpacing: '.5px',
    background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 7, color: C.textDim, cursor: 'pointer',
  },
  topBtnDanger: {
    padding: '5px 12px', fontFamily: C.mono, fontSize: 9, letterSpacing: '.5px',
    background: 'rgba(255,60,60,.04)', border: '1px solid rgba(255,60,60,.1)',
    borderRadius: 7, color: 'rgba(255,100,100,.4)', cursor: 'pointer',
  },
  tabRow: {
    display: 'flex', alignItems: 'center', gap: 2, padding: '6px 18px 0',
    background: 'rgba(10,10,18,.8)', borderBottom: '1px solid rgba(255,255,255,.06)',
    flexShrink: 0,
  },
  tab: {
    padding: '6px 16px', fontFamily: C.mono, fontSize: 9, letterSpacing: '.5px',
    background: 'transparent', border: '1px solid transparent',
    borderRadius: '6px 6px 0 0', cursor: 'pointer',
    color: C.textDim, marginBottom: -1, transition: 'all .15s',
  },
  tabActive: {
    background: 'rgba(255,255,255,.04)', color: '#fff',
    borderColor: 'rgba(255,255,255,.08)', borderBottomColor: C.bg,
  },
  body: {
    flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden',
  },
  mainArea: {
    flex: 1, minWidth: 0, overflow: 'auto',
    display: 'flex', flexDirection: 'column',
  },
  editorRow: {
    display: 'flex', gap: '1rem', alignItems: 'flex-start',
    width: '100%', flex: 1, padding: '12px',
  },

  // ── Scenario sidebar ──
  sidebar: {
    width: 220, flexShrink: 0, background: 'rgba(10,10,18,.95)',
    borderLeft: '1px solid rgba(255,255,255,.06)',
    padding: '12px', overflowY: 'auto',
    display: 'flex', flexDirection: 'column',
  },
  sidebarTitle: {
    fontFamily: C.sans, fontWeight: 700, fontSize: 13, color: C.text,
    letterSpacing: -.2, marginBottom: 12,
  },
  sideSection: { marginBottom: 2 },
  sideSectionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  sideLabel: {
    fontFamily: C.mono, fontSize: 7.5, letterSpacing: '1px', textTransform: 'uppercase',
  },
  divider: {
    height: 1, background: 'rgba(255,255,255,.05)', margin: '10px 0',
  },
  addBtn: {
    width: '100%', padding: '7px 10px', fontFamily: C.mono, fontSize: 8.5,
    letterSpacing: '.5px', border: '1px dashed', borderRadius: 7,
    cursor: 'pointer', textAlign: 'center', transition: 'all .15s',
    marginTop: 2,
  },
  entityInput: {
    width: 38, padding: '3px 4px', textAlign: 'center',
    fontFamily: C.mono, fontSize: 10,
    background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 4, color: '#fff', outline: 'none',
  },
  mobilitySelect: {
    padding: '3px 5px', fontFamily: C.mono, fontSize: 8,
    background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 4, color: C.amber, outline: 'none', cursor: 'pointer',
  },
  summaryRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,.03)',
  },
  summaryKey: { fontFamily: C.mono, fontSize: 8, color: C.textFaint },
  summaryVal: { fontFamily: C.mono, fontSize: 9, fontWeight: 700, color: C.textDim },
};
