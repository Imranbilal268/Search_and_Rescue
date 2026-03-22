import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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

// ─────────────────────────────────────────────────────────────────────────────
// Stairwell auto-detection
// Scans a floors array (grid[z][y][x]) for 'stairwell' cells, groups
// adjacent same-xy cells that appear on 2+ floors into vertical connections.
// ─────────────────────────────────────────────────────────────────────────────
function detectStairwells(floors) {
  if (!floors || floors.length < 2) return [];

  // Map "x,y" → Set of floor indices where a stairwell cell exists
  const posToFloors = new Map();
  for (let z = 0; z < floors.length; z++) {
    const grid = floors[z];
    if (!grid) continue;
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < (row?.length ?? 0); x++) {
        if (row[x] === 'stairwell') {
          const key = `${x},${y}`;
          if (!posToFloors.has(key)) posToFloors.set(key, new Set());
          posToFloors.get(key).add(z);
        }
      }
    }
  }

  // Keep only positions that span 2+ floors
  const multiFloor = new Map();
  for (const [key, fs] of posToFloors) {
    if (fs.size >= 2) multiFloor.set(key, fs);
  }
  if (multiFloor.size === 0) return [];

  // Connected-component grouping of adjacent multi-floor positions
  const visited = new Set();
  const groups  = [];
  for (const key of multiFloor.keys()) {
    if (visited.has(key)) continue;
    const group = [];
    const queue = [key];
    while (queue.length) {
      const cur = queue.shift();
      if (visited.has(cur) || !multiFloor.has(cur)) continue;
      visited.add(cur);
      group.push(cur);
      const [cx, cy] = cur.split(',').map(Number);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nk = `${cx+dx},${cy+dy}`;
        if (multiFloor.has(nk) && !visited.has(nk)) queue.push(nk);
      }
    }
    if (group.length) groups.push(group);
  }

  // Build a vertical connection per group
  return groups.map((keys, i) => {
    const positions = keys.map(k => k.split(',').map(Number));
    // Pick representative cell closest to the centroid
    const cx = positions.reduce((s, [x]) => s + x, 0) / positions.length;
    const cy = positions.reduce((s, [, y]) => s + y, 0) / positions.length;
    const [rx, ry] = positions.reduce((best, p) =>
      (p[0]-cx)**2 + (p[1]-cy)**2 < (best[0]-cx)**2 + (best[1]-cy)**2 ? p : best
    );
    // Union of all floors represented by cells in this group
    const floorSet = new Set();
    for (const k of keys) for (const f of multiFloor.get(k)) floorSet.add(f);
    return {
      id:                         `stairwell_${i + 1}`,
      type:                       'stairwell',
      label:                      `Stairwell ${i + 1}`,
      x:                          rx,
      y:                          ry,
      floors:                     [...floorSet].sort((a, b) => a - b),
      traversal_cost:             3,
      victim_carry_cost_multiplier: 2.0,
    };
  });
}

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
  const [simConfig,      setSimConfig]     = useState({ max_turns: 80, elevator_enabled: false, urgency_weight: 1.5, contention_penalty: 0.2 });
  const [exitNodes,      setExitNodes]     = useState([]);
  const [vertConnections,setVertConn]      = useState([]);
  const [cellPropsMap,   setCellPropsMap]  = useState({});
  const [scenarioMode,   setScenarioMode]  = useState(null); // 'place-responder'|'place-victim'|'place-fire'|'place-exit'|'place-stairwell'|'place-cell-prop'
  const [showScenario,  setShowScenario]  = useState(true);
  const [sidebarTab,    setSidebarTab]    = useState('entities'); // 'entities'|'building'|'config'
  const importJsonRef = useRef();

  // Auto-load shared JSON → go straight to stamps mode
  useEffect(() => {
    if (!initialJson || mode !== null) return;
    const data = processRawJson(initialJson);
    if (!data) return;
    setBuilding(data);
    setRawJson(initialJson);
    setActiveFloor(0);
    // Load existing scenario if present
    const sc = initialJson?.scenario;
    if (sc?.responders)        setResponders(sc.responders);
    if (sc?.victims)           setVictims(sc.victims);
    if (sc?.threat)            setThreat(sc.threat);
    if (sc?.simulation_config) setSimConfig(sc.simulation_config);
    const b = initialJson?.building || initialJson;
    if (b?.exit_nodes) setExitNodes(b.exit_nodes);
    if (b?.vertical_connections?.length) {
      setVertConn(b.vertical_connections);
    } else {
      setVertConn(detectStairwells(data.floors));
    }
    if (b?.cell_properties) setCellPropsMap(b.cell_properties);
    // Go straight to stamps editor
    const converted = gridToStamps(data.floors);
    const firstFloor = data.floors[0];
    setStampsPerFloor(converted);
    setGridMeta({
      width:      firstFloor[0]?.length ?? DEFAULT_GRID_WIDTH,
      height:     firstFloor.length     ?? DEFAULT_GRID_HEIGHT,
      floorCount: data.floors.length,
    });
    setMode("stamps");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync scenario + building changes back to shared JSON
  useEffect(() => {
    if (!rawJson) return;
    const bSrc = rawJson.building ?? rawJson;
    const bUpdated = {
      ...bSrc,
      exit_nodes:           exitNodes,
      vertical_connections: vertConnections,
      cell_properties:      cellPropsMap,
    };
    const scenarioUpdated = {
      ...(rawJson.scenario || {}),
      responders,
      victims,
      ...(threat ? { threat } : {}),
      simulation_config: simConfig,
    };
    const updated = rawJson.building
      ? { ...rawJson, building: bUpdated, scenario: scenarioUpdated }
      : { ...bUpdated, scenario: scenarioUpdated };
    onJsonChange?.(updated);
  }, [responders, victims, threat, simConfig, exitNodes, vertConnections, cellPropsMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  const compiledGrids = useMemo(() => {
    if (mode !== "stamps") return null;
    return compileAllFloors(stampsPerFloor, gridMeta.floorCount, gridMeta.width, gridMeta.height);
  }, [mode, stampsPerFloor, gridMeta]);

  const paintCell = useCallback((type, x, y) => {
    // If in scenario placement mode, place entity instead
    if (scenarioMode === 'place-responder') {
      setResponders(prev => {
        const n = prev.length + 1;
        return [...prev, { id: 'R' + n, label: 'Responder ' + n, x, y, z: activeFloor, equipment: [] }];
      });
      setScenarioMode(null);
      return;
    }
    if (scenarioMode === 'place-victim') {
      setVictims(prev => {
        const n = prev.length + 1;
        return [...prev, { id: 'V' + n, label: 'Victim ' + n, x, y, z: activeFloor, mobility: 'immobile' }];
      });
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
    if (scenarioMode === 'place-exit') {
      setExitNodes(prev => {
        const n = prev.length + 1;
        return [...prev, { id: 'exit_' + n, x, y, z: activeFloor, label: 'Exit ' + n, always_open: true }];
      });
      setScenarioMode(null);
      return;
    }
    if (scenarioMode === 'place-stairwell') {
      setVertConn(prev => {
        const n = prev.length + 1;
        return [...prev, { id: 'stairwell_' + n, type: 'stairwell', label: 'Stairwell ' + n, x, y, floors: [activeFloor], traversal_cost: 3, victim_carry_cost_multiplier: 2.0 }];
      });
      setScenarioMode(null);
      return;
    }
    if (scenarioMode === 'place-cell-prop') {
      const key = `${x},${y},${activeFloor}`;
      setCellPropsMap(prev => ({ ...prev, [key]: prev[key] ?? { label: '', locked: false } }));
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
  }, [activeFloor, scenarioMode]);

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
    onJsonChange?.(data.rawJson ?? null);
    const sc = data.rawJson?.scenario;
    if (sc?.responders)        setResponders(sc.responders);
    if (sc?.victims)           setVictims(sc.victims);
    if (sc?.threat)            setThreat(sc.threat);
    if (sc?.simulation_config) setSimConfig(sc.simulation_config);
    const b = data.rawJson?.building || data.rawJson;
    if (b?.exit_nodes) setExitNodes(b.exit_nodes);
    if (b?.vertical_connections?.length) {
      setVertConn(b.vertical_connections);
    } else {
      setVertConn(detectStairwells(data.floors));
    }
    if (b?.cell_properties) setCellPropsMap(b.cell_properties);
    // Go straight to stamps editor
    const converted = gridToStamps(data.floors);
    const firstFloor = data.floors[0];
    setStampsPerFloor(converted);
    setGridMeta({
      width:      firstFloor[0]?.length ?? DEFAULT_GRID_WIDTH,
      height:     firstFloor.length     ?? DEFAULT_GRID_HEIGHT,
      floorCount: data.floors.length,
    });
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
    setSimConfig({ max_turns: 80, elevator_enabled: false, urgency_weight: 1.5, contention_penalty: 0.2 });
    setExitNodes([]);
    setVertConn([]);
    setCellPropsMap({});
    setScenarioMode(null);
  }

  function handleOpenInBuildingEditor() {
    if (!rawJson) return;
    const s = JSON.stringify(rawJson);
    localStorage.setItem('rescuegrid_load_json', s);
    localStorage.setItem('rescuegrid_current_json', s);
    window.location.href = '/BuildingEditor.html';
  }

  function handleSidebarImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        handleFileLoad(processRawJson(parsed) ? { ...processRawJson(parsed), rawJson: parsed } : null);
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = '';
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
  function updateEntityLabel(type, id, label) {
    if (type === 'responder') setResponders(prev => prev.map(r => r.id === id ? { ...r, label } : r));
    else setVictims(prev => prev.map(v => v.id === id ? { ...v, label } : v));
  }
  function updateResponderEquipment(id, equipStr) {
    const equipment = equipStr.split(',').map(s => s.trim()).filter(Boolean);
    setResponders(prev => prev.map(r => r.id === id ? { ...r, equipment } : r));
  }

  // ── Exit node helpers ─────────────────────────────────────────────────────
  function removeExitNode(id)       { setExitNodes(prev => prev.filter(n => n.id !== id)); }
  function updateExitNode(id, patch){ setExitNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n)); }

  // ── Vertical connection helpers ───────────────────────────────────────────
  function removeVC(id)       { setVertConn(prev => prev.filter(v => v.id !== id)); }
  function updateVC(id, patch){ setVertConn(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v)); }
  function updateVCFloors(id, floorsStr) {
    const floors = floorsStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    updateVC(id, { floors });
  }
  function reDetectStairwells() {
    // Use compiledGrids when in stamps mode, else fall back to loaded building floors
    const floors = compiledGrids
      ? Array.from({ length: gridMeta.floorCount }, (_, i) => compiledGrids[i] ?? [])
      : building?.floors;
    if (!floors) return;
    const detected = detectStairwells(floors);
    setVertConn(detected);
  }

  // ── Cell property helpers ─────────────────────────────────────────────────
  function removeCellProp(key)        { setCellPropsMap(prev => { const n = { ...prev }; delete n[key]; return n; }); }
  function updateCellProp(key, patch) { setCellPropsMap(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } })); }

  // ── 3D view entity placement ───────────────────────────────────────────
  // Called when user clicks a cell in the 3D viewer (x, y, z are grid coords)
  const onCellClick3d = useCallback((x, y, z) => {
    if (scenarioMode === 'place-responder') {
      setResponders(prev => {
        const n = prev.length + 1;
        return [...prev, { id: 'R' + n, label: 'Responder ' + n, x, y, z, equipment: [] }];
      });
      setScenarioMode(null);
    } else if (scenarioMode === 'place-victim') {
      setVictims(prev => {
        const n = prev.length + 1;
        return [...prev, { id: 'V' + n, label: 'Victim ' + n, x, y, z, mobility: 'immobile' }];
      });
      setScenarioMode(null);
    } else if (scenarioMode === 'place-fire') {
      setThreat(prev => ({
        type: 'fire',
        origin: { x, y, z },
        fire_params: prev?.fire_params ?? { spread_probability: 0.4, stairwell_acceleration: 2.0, accelerant_bonus: 0.3 },
      }));
      setScenarioMode(null);
    } else if (scenarioMode === 'place-exit') {
      setExitNodes(prev => {
        const n = prev.length + 1;
        return [...prev, { id: 'exit_' + n, x, y, z, label: 'Exit ' + n, always_open: true }];
      });
      setScenarioMode(null);
    } else if (scenarioMode === 'place-stairwell') {
      setVertConn(prev => {
        const n = prev.length + 1;
        return [...prev, { id: 'stairwell_' + n, type: 'stairwell', label: 'Stairwell ' + n, x, y, floors: [z], traversal_cost: 3, victim_carry_cost_multiplier: 2.0 }];
      });
      setScenarioMode(null);
    } else if (scenarioMode === 'place-cell-prop') {
      const key = `${x},${y},${z}`;
      setCellPropsMap(prev => ({ ...prev, [key]: prev[key] ?? { label: '', locked: false } }));
      setScenarioMode(null);
    }
  }, [scenarioMode]);

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
    responders:          responders.length ? responders : (rawJson?.scenario?.responders ?? []),
    victims:             victims.length    ? victims    : (rawJson?.scenario?.victims    ?? []),
    threat:              threat ?? rawJson?.scenario?.threat ?? null,
    exit_nodes:          exitNodes,
    vertical_connections: vertConnections,
  };

  // ── Derived props ──────────────────────────────────────────────────────
  const currentGrid    = compiledGrids?.[activeFloor] ?? [];
  const floorCount     = gridMeta.floorCount;
  const roomLabels     = building?.roomLabels ?? {};
  const cellProperties = cellPropsMap;
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

  // ── EDITOR ─────────────────────────────────────────────────────────────
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
          {canPlace && (
            <span style={{ fontFamily: C.mono, fontSize: 7,
              color: scenarioMode === 'place-fire' ? '#ff6030' : scenarioMode === 'place-exit' ? '#22c55e' : scenarioMode === 'place-stairwell' ? '#8b5cf6' : scenarioMode === 'place-cell-prop' ? C.textDim : C.amber,
              background: scenarioMode === 'place-fire' ? 'rgba(255,96,48,.12)' : scenarioMode === 'place-exit' ? 'rgba(34,197,94,.1)' : scenarioMode === 'place-stairwell' ? 'rgba(139,92,246,.1)' : scenarioMode === 'place-cell-prop' ? 'rgba(255,255,255,.05)' : C.amberBg,
              border: `1px solid ${scenarioMode === 'place-fire' ? 'rgba(255,96,48,.3)' : scenarioMode === 'place-exit' ? 'rgba(34,197,94,.3)' : scenarioMode === 'place-stairwell' ? 'rgba(139,92,246,.3)' : scenarioMode === 'place-cell-prop' ? 'rgba(255,255,255,.15)' : C.amberBdr}`,
              padding: '2px 7px', borderRadius: 4, letterSpacing: '1px' }}>
              {{ 'place-responder': '📍 CLICK TO PLACE RESPONDER', 'place-victim': '📍 CLICK TO PLACE VICTIM', 'place-fire': '🔥 CLICK TO PLACE FIRE ORIGIN', 'place-exit': '🚪 CLICK TO PLACE EXIT NODE', 'place-stairwell': '↕ CLICK TO PLACE STAIRWELL', 'place-cell-prop': '🏷 CLICK CELL TO TAG' }[scenarioMode]}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Grid resize — only relevant in floorplan editor mode */}
          {viewMode === 'floorplan' && (
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
          {viewMode === 'floorplan' && rawJson && (
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
        {canPlace && (
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
            <SimView
              rawJson={rawJson}
              scenarioMode={scenarioMode}
              liveScenario={liveScenario}
              onCellClick={onCellClick3d}
            />
          ) : (
            <div style={S.editorRow}>
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
          )}
        </div>

        {/* ── Scenario sidebar ── */}
        {showScenario && (
          <div style={S.sidebar}>

            {/* Import JSON */}
            <div style={{ padding: '8px 10px 0', borderBottom: `1px solid ${C.border}` }}>
              <input
                ref={importJsonRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleSidebarImport}
              />
              <button
                style={{ ...S.addBtn, color: '#64b5f6', borderColor: 'rgba(100,181,246,.3)', background: 'rgba(100,181,246,.06)', marginBottom: 8 }}
                onClick={() => importJsonRef.current?.click()}
              >📂 Import JSON</button>
            </div>

            {/* Tab bar */}
            <div style={S.sideTabBar}>
              {[['entities','👥','Entities'],['building','🏗','Building'],['config','⚙','Config']].map(([id, icon, lbl]) => (
                <button key={id}
                  style={{ ...S.sideTab, ...(sidebarTab === id ? S.sideTabActive : {}) }}
                  onClick={() => setSidebarTab(id)}
                >
                  <span style={{ fontSize: 12 }}>{icon}</span>
                  <span>{lbl}</span>
                </button>
              ))}
            </div>

            {/* ── ENTITIES tab ── */}
            {sidebarTab === 'entities' && (
              <div style={S.tabPane}>

                <SideHeader label="RESPONDERS" count={responders.length} color={C.blue} />
                {responders.map((r, i) => (
                  <EntityRow key={r.id} entity={r} type="responder" index={i} floorCount={floorCount}
                    onRemove={() => removeResponder(r.id)}
                    onFloorChange={z => updateEntityFloor('responder', r.id, z)}
                    onCoordChange={(f, v) => updateEntityCoord('responder', r.id, f, v)}
                    onLabelChange={lbl => updateEntityLabel('responder', r.id, lbl)}
                    onEquipmentChange={eq => updateResponderEquipment(r.id, eq)}
                  />
                ))}
                <PlaceButton
                  active={scenarioMode === 'place-responder'} color={C.blue} bg={C.blueBg} border={C.blueBdr}
                  label="Add Responder" activeLabel="Click grid to place…"
                  onClick={() => setScenarioMode(scenarioMode === 'place-responder' ? null : 'place-responder')}
                />

                <div style={S.divider} />

                <SideHeader label="VICTIMS" count={victims.length} color={C.amber} />
                {victims.map((v, i) => (
                  <EntityRow key={v.id} entity={v} type="victim" index={i} floorCount={floorCount}
                    onRemove={() => removeVictim(v.id)}
                    onFloorChange={z => updateEntityFloor('victim', v.id, z)}
                    onCoordChange={(f, val) => updateEntityCoord('victim', v.id, f, val)}
                    onLabelChange={lbl => updateEntityLabel('victim', v.id, lbl)}
                    onMobilityChange={m => updateVictimMobility(v.id, m)}
                  />
                ))}
                <PlaceButton
                  active={scenarioMode === 'place-victim'} color={C.amber} bg={C.amberBg} border={C.amberBdr}
                  label="Add Victim" activeLabel="Click grid to place…"
                  onClick={() => setScenarioMode(scenarioMode === 'place-victim' ? null : 'place-victim')}
                />

                <div style={S.divider} />

                <SideHeader label="FIRE THREAT" count={threat ? 1 : 0} color="#ff6030" />
                {threat ? (
                  <FireCard
                    threat={threat} floorCount={floorCount}
                    scenarioMode={scenarioMode}
                    onRemove={() => setThreat(null)}
                    onOriginChange={updateFireOriginCoord}
                    onParamChange={updateFireParam}
                    onReposition={() => setScenarioMode(scenarioMode === 'place-fire' ? null : 'place-fire')}
                  />
                ) : (
                  <PlaceButton
                    active={scenarioMode === 'place-fire'} color="#ff6030" bg="rgba(255,96,48,.08)" border="rgba(255,96,48,.25)"
                    label="Add Fire Threat" activeLabel="Click grid to place…"
                    onClick={() => setScenarioMode(scenarioMode === 'place-fire' ? null : 'place-fire')}
                  />
                )}
              </div>
            )}

            {/* ── BUILDING tab ── */}
            {sidebarTab === 'building' && (
              <div style={S.tabPane}>

                <SideHeader label="EXIT NODES" count={exitNodes.length} color="#22c55e" />
                {exitNodes.map((node) => (
                  <ExitNodeRow key={node.id} node={node} floorCount={floorCount}
                    onRemove={() => removeExitNode(node.id)}
                    onUpdate={patch => updateExitNode(node.id, patch)}
                  />
                ))}
                <PlaceButton
                  active={scenarioMode === 'place-exit'} color="#22c55e" bg="rgba(34,197,94,.08)" border="rgba(34,197,94,.3)"
                  label="Add Exit Node" activeLabel="Click grid to place…"
                  onClick={() => setScenarioMode(scenarioMode === 'place-exit' ? null : 'place-exit')}
                />

                <div style={S.divider} />

                <SideHeader label="VERTICAL CONN." count={vertConnections.length} color="#8b5cf6" />
                {vertConnections.map((vc) => (
                  <VCRow key={vc.id} vc={vc} floorCount={floorCount}
                    onRemove={() => removeVC(vc.id)}
                    onUpdate={patch => updateVC(vc.id, patch)}
                    onFloorsChange={str => updateVCFloors(vc.id, str)}
                  />
                ))}
                <PlaceButton
                  active={scenarioMode === 'place-stairwell'} color="#8b5cf6" bg="rgba(139,92,246,.08)" border="rgba(139,92,246,.3)"
                  label="Add Stairwell" activeLabel="Click grid to place…"
                  onClick={() => setScenarioMode(scenarioMode === 'place-stairwell' ? null : 'place-stairwell')}
                />
                <button
                  style={{ ...S.addBtn, marginTop: 3, borderColor: 'rgba(139,92,246,.18)', color: 'rgba(139,92,246,.5)', fontSize: 8 }}
                  onClick={reDetectStairwells}
                >↺ Auto-detect from grid</button>

                <div style={S.divider} />

                <SideHeader label="CELL PROPS" count={Object.keys(cellPropsMap).length} color={C.textDim} />
                {Object.entries(cellPropsMap).map(([key, props]) => (
                  <CellPropRow key={key} propKey={key} props={props}
                    onRemove={() => removeCellProp(key)}
                    onUpdate={patch => updateCellProp(key, patch)}
                  />
                ))}
                <PlaceButton
                  active={scenarioMode === 'place-cell-prop'} color={C.textDim} bg="rgba(255,255,255,.05)" border="rgba(255,255,255,.12)"
                  label="Tag Cell" activeLabel="Click cell to tag…"
                  onClick={() => setScenarioMode(scenarioMode === 'place-cell-prop' ? null : 'place-cell-prop')}
                />
              </div>
            )}

            {/* ── CONFIG tab ── */}
            {sidebarTab === 'config' && (
              <div style={S.tabPane}>

                <SideHeader label="SIM CONFIG" color={C.accent} />
                <div style={{ background: 'rgba(91,240,165,.03)', border: '1px solid rgba(91,240,165,.1)', borderRadius: 8, padding: '10px', marginBottom: 8 }}>
                  {[
                    ['max_turns',          'Max turns',       1,   500, 1   ],
                    ['urgency_weight',     'Urgency weight',  0,   5,   0.1 ],
                    ['contention_penalty', 'Contention pen.', 0,   2,   0.05],
                  ].map(([key, label, min, max, step]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textFaint }}>{label}</span>
                      <input type="number" min={min} max={max} step={step} value={simConfig[key]}
                        onChange={e => setSimConfig(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                        style={{ ...S.entityInput, width: 54, color: C.accent }} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: C.mono, fontSize: 8, color: C.textFaint }}>Elevator enabled</span>
                    <input type="checkbox" checked={simConfig.elevator_enabled}
                      onChange={e => setSimConfig(prev => ({ ...prev, elevator_enabled: e.target.checked }))}
                      style={{ accentColor: C.accent, cursor: 'pointer', width: 14, height: 14 }} />
                  </div>
                </div>

                <div style={S.divider} />

                <SideHeader label="SUMMARY" color={C.textDim} />
                {[
                  ['Responders', responders.length, C.blue],
                  ['Victims',    victims.length,    C.amber],
                  ['Immobile',   victims.filter(v => v.mobility === 'immobile').length, C.textDim],
                  ['Exit nodes', exitNodes.length,  '#22c55e'],
                  ['Stairwells', vertConnections.length, '#8b5cf6'],
                  ['Cell props', Object.keys(cellPropsMap).length, C.textDim],
                  ['Fire threat', threat ? 1 : 0,  '#ff6030'],
                ].map(([label, val, color]) => (
                  <div key={label} style={S.summaryRow}>
                    <span style={S.summaryKey}>{label}</span>
                    <span style={{ ...S.summaryVal, color: val > 0 ? color : C.textFaint }}>{val}</span>
                  </div>
                ))}

                <div style={S.divider} />

                {(responders.length > 0 || victims.length > 0 || threat || exitNodes.length > 0 || vertConnections.length > 0) && (
                  <button
                    style={{ ...S.addBtn, borderColor: C.redBdr, color: C.red, background: C.redBg, marginTop: 4 }}
                    onClick={() => { setResponders([]); setVictims([]); setThreat(null); }}
                  >✕ Clear scenario entities</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ── Shared sidebar helpers ──────────────────────────────────────────────────

function SideHeader({ label, count, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <span style={{ fontFamily: C.mono, fontSize: 7.5, letterSpacing: '1px', color: color ?? C.textFaint, textTransform: 'uppercase' }}>{label}</span>
      {count !== undefined && (
        <span style={{ fontFamily: C.mono, fontSize: 9, fontWeight: 700, color: count > 0 ? color : C.textFaint }}>{count}</span>
      )}
    </div>
  );
}

function PlaceButton({ active, color, bg, border, label, activeLabel, onClick }) {
  return (
    <button
      style={{ ...S.addBtn, borderColor: active ? border : border, color, background: active ? bg : 'transparent' }}
      onClick={onClick}
    >
      {active ? `📍 ${activeLabel}` : `+ ${label}`}
    </button>
  );
}

function FireCard({ threat, floorCount, scenarioMode, onRemove, onOriginChange, onParamChange, onReposition }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: 'rgba(255,96,48,.05)', border: '1px solid rgba(255,96,48,.15)', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <span style={{ fontFamily: C.mono, fontSize: 8, color: '#ff6030', fontWeight: 700, flex: 1 }}>
          🔥 ({threat.origin.x},{threat.origin.y}) fl.{threat.origin.z}
        </span>
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint }}>{open ? '▾' : '▸'}</span>
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{ background: C.redBg, border: `1px solid ${C.redBdr}`, borderRadius: 4, color: C.red, cursor: 'pointer', fontFamily: C.mono, fontSize: 8, padding: '1px 5px' }}>✕</button>
      </div>
      {open && (
        <div style={{ padding: '0 9px 9px' }}>
          <div style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint, marginBottom: 4 }}>ORIGIN</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {[['x', threat.origin.x], ['y', threat.origin.y]].map(([f, v]) => (
              <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>{f.toUpperCase()}</span>
                <input type="number" min={0} value={v} onChange={e => onOriginChange(f, e.target.value)} style={S.entityInput} />
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>FL</span>
              <input type="number" min={0} max={Math.max(0, floorCount - 1)} value={threat.origin.z}
                onChange={e => onOriginChange('z', e.target.value)} style={S.entityInput} />
            </label>
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint, marginBottom: 4 }}>PARAMS</div>
          {[
            ['spread_probability',     'Spread prob',  0, 1,   0.05],
            ['stairwell_acceleration', 'Stair accel',  1, 5,   0.1 ],
            ['accelerant_bonus',       'Accel bonus',  0, 1,   0.05],
          ].map(([key, lbl, min, max, step]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontFamily: C.mono, fontSize: 7.5, color: C.textFaint }}>{lbl}</span>
              <input type="number" min={min} max={max} step={step}
                value={threat.fire_params?.[key] ?? (key === 'stairwell_acceleration' ? 2.0 : key === 'accelerant_bonus' ? 0.3 : 0.4)}
                onChange={e => onParamChange(key, e.target.value)}
                style={{ ...S.entityInput, width: 46, color: '#ff8844' }} />
            </div>
          ))}
          <button
            style={{ ...S.addBtn, marginTop: 4, borderColor: 'rgba(255,96,48,.3)', color: '#ff6030', background: scenarioMode === 'place-fire' ? 'rgba(255,96,48,.1)' : 'transparent', fontSize: 8 }}
            onClick={onReposition}
          >{scenarioMode === 'place-fire' ? 'Click grid to reposition…' : '↺ Reposition origin'}</button>
        </div>
      )}
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


function EntityRow({ entity, type, index, floorCount, onRemove, onFloorChange, onCoordChange, onLabelChange, onEquipmentChange, onMobilityChange }) {
  const [open, setOpen] = useState(false);
  const accent = type === 'responder' ? C.blue : C.amber;
  const summary = entity.label
    ? `${entity.label} · (${entity.x},${entity.y}) fl.${entity.z}`
    : `(${entity.x},${entity.y}) fl.${entity.z}`;
  return (
    <div style={{ background: 'rgba(255,255,255,.02)', border: `1px solid rgba(255,255,255,.05)`, borderRadius: 8, marginBottom: 5, overflow: 'hidden' }}>
      {/* Collapsed header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <span style={{ fontFamily: C.mono, fontSize: 8, color: accent, fontWeight: 700, minWidth: 22 }}>{entity.id}</span>
        <span style={{ fontFamily: C.mono, fontSize: 7.5, color: C.textFaint, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint }}>{open ? '▾' : '▸'}</span>
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{ background: C.redBg, border: `1px solid ${C.redBdr}`, borderRadius: 4, color: C.red, cursor: 'pointer', fontFamily: C.mono, fontSize: 8, padding: '1px 5px' }}>✕</button>
      </div>
      {/* Expanded fields */}
      {open && (
        <div style={{ padding: '0 8px 8px', borderTop: '1px solid rgba(255,255,255,.04)' }}>
          <input type="text" value={entity.label ?? ''} placeholder="Label…"
            onChange={e => onLabelChange?.(e.target.value)}
            style={{ width: '100%', padding: '4px 6px', fontFamily: C.mono, fontSize: 8, background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4, color: accent, outline: 'none', boxSizing: 'border-box', marginTop: 7, marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: type === 'responder' ? 6 : 0 }}>
            {[['x', entity.x], ['y', entity.y]].map(([field, val]) => (
              <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>{field.toUpperCase()}</span>
                <input type="number" min={0} value={val} onChange={e => onCoordChange(field, e.target.value)} style={S.entityInput} />
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>FL</span>
              <input type="number" min={0} max={Math.max(0, floorCount - 1)} value={entity.z}
                onChange={e => onFloorChange(e.target.value)} style={S.entityInput} />
            </label>
            {type === 'victim' && (
              <select value={entity.mobility || 'immobile'} onChange={e => onMobilityChange?.(e.target.value)} style={S.mobilitySelect}>
                <option value="immobile">immobile</option>
                <option value="mobile">mobile</option>
                <option value="injured">injured</option>
              </select>
            )}
          </div>
          {type === 'responder' && (
            <>
              <div style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint, marginBottom: 2 }}>EQUIPMENT</div>
              <input type="text" value={(entity.equipment ?? []).join(', ')} placeholder="ax, medic_kit, ladder…"
                onChange={e => onEquipmentChange?.(e.target.value)}
                style={{ width: '100%', padding: '4px 6px', fontFamily: C.mono, fontSize: 8, background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4, color: C.blue, outline: 'none', boxSizing: 'border-box' }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Exit Node row ───────────────────────────────────────────────────────────
function ExitNodeRow({ node, floorCount, onRemove, onUpdate }) {
  const [open, setOpen] = useState(false);
  const summary = node.label ? `${node.label} · (${node.x},${node.y}) fl.${node.z ?? 0}` : `(${node.x},${node.y}) fl.${node.z ?? 0}`;
  return (
    <div style={{ background: 'rgba(34,197,94,.03)', border: '1px solid rgba(34,197,94,.12)', borderRadius: 8, marginBottom: 5, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <span style={{ fontFamily: C.mono, fontSize: 7.5, color: '#22c55e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint }}>{open ? '▾' : '▸'}</span>
        <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ background: C.redBg, border: `1px solid ${C.redBdr}`, borderRadius: 4, color: C.red, cursor: 'pointer', fontFamily: C.mono, fontSize: 8, padding: '1px 5px' }}>✕</button>
      </div>
      {open && (
        <div style={{ padding: '0 8px 8px', borderTop: '1px solid rgba(34,197,94,.08)' }}>
          <input type="text" value={node.label ?? ''} placeholder="Label…" onChange={e => onUpdate({ label: e.target.value })}
            style={{ width: '100%', padding: '4px 6px', fontFamily: C.mono, fontSize: 8, background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4, color: '#22c55e', outline: 'none', boxSizing: 'border-box', marginTop: 7, marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {[['x', node.x], ['y', node.y]].map(([f, v]) => (
              <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>{f.toUpperCase()}</span>
                <input type="number" min={0} value={v} onChange={e => onUpdate({ [f]: Math.max(0, parseInt(e.target.value)||0) })} style={S.entityInput} />
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>FL</span>
              <input type="number" min={0} max={Math.max(0, floorCount-1)} value={node.z ?? 0} onChange={e => onUpdate({ z: Math.max(0, parseInt(e.target.value)||0) })} style={S.entityInput} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>OPEN</span>
              <input type="checkbox" checked={node.always_open ?? true} onChange={e => onUpdate({ always_open: e.target.checked })} style={{ accentColor: '#22c55e', cursor: 'pointer' }} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vertical Connection row ──────────────────────────────────────────────────
function VCRow({ vc, floorCount, onRemove, onUpdate, onFloorsChange }) {
  const [open, setOpen] = useState(false);
  const floorStr = (vc.floors ?? []).join(',');
  const summary = `${vc.label || vc.id} · (${vc.x},${vc.y}) fl.${floorStr}`;
  return (
    <div style={{ background: 'rgba(139,92,246,.03)', border: '1px solid rgba(139,92,246,.12)', borderRadius: 8, marginBottom: 5, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <span style={{ fontFamily: C.mono, fontSize: 7.5, color: '#8b5cf6', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint }}>{open ? '▾' : '▸'}</span>
        <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ background: C.redBg, border: `1px solid ${C.redBdr}`, borderRadius: 4, color: C.red, cursor: 'pointer', fontFamily: C.mono, fontSize: 8, padding: '1px 5px' }}>✕</button>
      </div>
      {open && (
        <div style={{ padding: '0 8px 8px', borderTop: '1px solid rgba(139,92,246,.08)' }}>
          <input type="text" value={vc.label ?? ''} placeholder="Label…" onChange={e => onUpdate({ label: e.target.value })}
            style={{ width: '100%', padding: '4px 6px', fontFamily: C.mono, fontSize: 8, background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4, color: '#8b5cf6', outline: 'none', boxSizing: 'border-box', marginTop: 7, marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>TYPE</span>
              <select value={vc.type ?? 'stairwell'} onChange={e => onUpdate({ type: e.target.value })} style={{ ...S.mobilitySelect, color: '#8b5cf6' }}>
                <option value="stairwell">stairwell</option>
                <option value="elevator">elevator</option>
              </select>
            </label>
            {[['x', vc.x], ['y', vc.y]].map(([f, v]) => (
              <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>{f.toUpperCase()}</span>
                <input type="number" min={0} value={v} onChange={e => onUpdate({ [f]: Math.max(0, parseInt(e.target.value)||0) })} style={S.entityInput} />
              </label>
            ))}
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint, marginBottom: 2 }}>FLOORS (e.g. 0, 1, 2)</div>
            <input type="text" value={(vc.floors ?? []).join(', ')} placeholder="0, 1, 2" onChange={e => onFloorsChange(e.target.value)}
              style={{ width: '100%', padding: '4px 6px', fontFamily: C.mono, fontSize: 8, background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4, color: '#8b5cf6', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {[['traversal_cost','Traversal cost',1,20,1],['victim_carry_cost_multiplier','Carry mult.',0.5,5,0.5]].map(([k,lbl,mn,mx,st]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontFamily: C.mono, fontSize: 7.5, color: C.textFaint }}>{lbl}</span>
              <input type="number" min={mn} max={mx} step={st} value={vc[k] ?? (k==='traversal_cost'?3:2)}
                onChange={e => onUpdate({ [k]: parseFloat(e.target.value)||mn })}
                style={{ ...S.entityInput, width: 46, color: '#8b5cf6' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cell Property row ────────────────────────────────────────────────────────
function CellPropRow({ propKey, props, onRemove, onUpdate }) {
  const [open, setOpen] = useState(false);
  const summary = props.label ? `${propKey} · ${props.label}` : propKey;
  return (
    <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 8, marginBottom: 5, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <span style={{ fontFamily: C.mono, fontSize: 7.5, color: C.textDim, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.textFaint }}>{open ? '▾' : '▸'}</span>
        <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ background: C.redBg, border: `1px solid ${C.redBdr}`, borderRadius: 4, color: C.red, cursor: 'pointer', fontFamily: C.mono, fontSize: 8, padding: '1px 5px' }}>✕</button>
      </div>
      {open && (
        <div style={{ padding: '0 8px 8px', borderTop: '1px solid rgba(255,255,255,.04)' }}>
          <input type="text" value={props.label ?? ''} placeholder="Label…" onChange={e => onUpdate({ label: e.target.value })}
            style={{ width: '100%', padding: '4px 6px', fontFamily: C.mono, fontSize: 8, background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 4, color: C.text, outline: 'none', boxSizing: 'border-box', marginTop: 7, marginBottom: 6 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: C.mono, fontSize: 7, color: C.textFaint }}>LOCKED</span>
            <input type="checkbox" checked={props.locked ?? false} onChange={e => onUpdate({ locked: e.target.checked })} style={{ accentColor: C.red, cursor: 'pointer' }} />
          </label>
        </div>
      )}
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
    width: 260, flexShrink: 0, background: 'rgba(10,10,18,.97)',
    borderLeft: '1px solid rgba(255,255,255,.06)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  sideTabBar: {
    display: 'flex', flexShrink: 0,
    borderBottom: '1px solid rgba(255,255,255,.06)',
  },
  sideTab: {
    flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    fontFamily: C.mono, fontSize: 7, letterSpacing: '.5px', color: C.textFaint,
    background: 'transparent', border: 'none', borderBottom: '2px solid transparent',
    cursor: 'pointer', transition: 'all .15s',
  },
  sideTabActive: {
    color: C.text, borderBottomColor: C.accent, background: 'rgba(255,255,255,.03)',
  },
  tabPane: {
    flex: 1, overflowY: 'auto', padding: '12px 10px',
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
