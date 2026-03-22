import { useState, useRef } from 'react';
import SimView from '../components/SimView';
import GridView from '../components/GridView';
import FloorToggle from '../components/Floortoggle';

const S = {
  wrap: {
    height: '100vh',
    background: '#0a0a0f',
    fontFamily: "'Outfit', sans-serif",
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 18px',
    borderBottom: '1px solid rgba(255,255,255,.06)',
    background: 'rgba(10,10,18,.95)',
    backdropFilter: 'blur(20px)',
    flexShrink: 0,
    zIndex: 10,
  },
  backBtn: {
    padding: '5px 12px',
    background: 'rgba(255,255,255,.04)',
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 7,
    color: 'rgba(255,255,255,.4)',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '.5px',
  },
  navBtn: {
    padding: '5px 12px',
    background: 'rgba(91,240,165,.08)',
    border: '1px solid rgba(91,240,165,.2)',
    borderRadius: 7,
    color: 'rgba(91,240,165,.6)',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '.5px',
  },
  topTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 700,
    fontSize: 14,
    color: 'rgba(255,255,255,.7)',
    letterSpacing: -.3,
  },
  topBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 8,
    color: 'rgba(255,136,68,.5)',
    background: 'rgba(255,136,68,.08)',
    border: '1px solid rgba(255,136,68,.2)',
    padding: '2px 8px',
    borderRadius: 4,
    letterSpacing: '1px',
  },
  newSimBtn: {
    padding: '5px 12px',
    background: 'rgba(255,255,255,.04)',
    border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 7,
    color: 'rgba(255,255,255,.4)',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '.5px',
  },
  turnBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 18px',
    borderBottom: '1px solid rgba(255,255,255,.06)',
    background: 'rgba(10,10,18,.8)',
    flexShrink: 0,
  },
  turnBtn: {
    padding: '4px 10px',
    fontSize: '0.8rem',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 5,
    background: 'rgba(255,255,255,.04)',
    cursor: 'pointer',
    color: 'rgba(255,255,255,.5)',
    flexShrink: 0,
  },
  turnScrubber: {
    flex: 1,
    cursor: 'pointer',
    accentColor: '#ff8844',
  },
  turnLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,.35)',
    flexShrink: 0,
    minWidth: 120,
    textAlign: 'right',
  },
  viewTabRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '5px 18px 0',
    background: 'rgba(10,10,18,.8)',
    borderBottom: '1px solid rgba(255,255,255,.06)',
    flexShrink: 0,
  },
  viewTab: {
    padding: '5px 14px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: '.5px',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '5px 5px 0 0',
    cursor: 'pointer',
    color: 'rgba(255,255,255,.3)',
    marginBottom: -1,
    transition: 'all .15s',
  },
  viewTabActive: {
    background: 'rgba(255,255,255,.04)',
    color: '#fff',
    borderColor: 'rgba(255,255,255,.08)',
    borderBottomColor: '#0a0a0f',
  },
  // Setup panel
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '40px 48px',
  },
  bodyInner: {
    maxWidth: 780,
    margin: '0 auto',
    width: '100%',
  },
  label: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 8.5,
    color: 'rgba(255,255,255,.2)',
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  textarea: {
    width: '100%',
    height: 220,
    background: 'rgba(0,0,0,.4)',
    border: '1px solid rgba(255,255,255,.1)',
    borderRadius: 10,
    color: 'rgba(255,255,255,.75)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    padding: '12px',
    resize: 'vertical',
    lineHeight: 1.5,
    outline: 'none',
    boxSizing: 'border-box',
  },
  runBtn: {
    padding: '11px 28px',
    borderRadius: 9,
    border: '1px solid rgba(255,136,68,.35)',
    background: 'rgba(255,136,68,.1)',
    color: '#ff8844',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: '.8px',
    fontWeight: 700,
  },
  card: {
    background: 'rgba(255,255,255,.025)',
    border: '1px solid rgba(255,255,255,.07)',
    borderRadius: 12,
    padding: '20px 22px',
    marginBottom: 14,
  },
};

export default function SimulationPage({ onBack, onNavigate, initialJson, onJsonChange }) {
  const [json, setJson] = useState(() =>
    initialJson ? JSON.stringify(initialJson, null, 2) : ''
  );
  const [turns, setTurns] = useState(
    () => initialJson?.scenario?.simulation_config?.max_turns ?? 10
  );
  const [status, setStatus] = useState('idle');
  const [simData, setSimData] = useState(null);
  const [rawJson, setRawJson] = useState(null);
  const [error, setError] = useState('');
  const [simTurn, setSimTurn] = useState(0);
  // View mode for results: '3d' | '2d'
  const [simViewMode, setSimViewMode] = useState('3d');
  const [simFloor, setSimFloor] = useState(0);
  const fileRef = useRef();

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';


  const loadFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setJson(text);
      try {
        const p = JSON.parse(text);
        onJsonChange?.(p);
        const mt = p?.scenario?.simulation_config?.max_turns;
        if (mt) setTurns(mt);
      } catch {}
    };
    reader.readAsText(file);
  };

  const runSim = async () => {
    if (!json.trim()) { setError('Paste or upload a building JSON first.'); return; }
    let parsed;
    try { parsed = JSON.parse(json); }
    catch (e) { setError('JSON parse error: ' + e.message); return; }

    setRawJson(parsed);
    onJsonChange?.(parsed);
    setStatus('running'); setError(''); setSimData(null); setSimTurn(0);
    try {
      const requestBody = {
        ...parsed,
        scenario: {
          ...parsed.scenario,
          simulation_config: {
            ...(parsed.scenario?.simulation_config || {}),
            max_turns: turns,
          },
        },
      };

      //fetch(`api/simulate)
      const res = await fetch(`${API_URL}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? res.statusText);
      }
      const data = await res.json();
      setSimData(data);
      setStatus('done');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  };

  const resetSim = () => {
    setStatus('idle');
    setSimData(null);
    setSimTurn(0);
    setError('');
    setSimViewMode('3d');
    setSimFloor(0);
  };

  // ── Results view ──────────────────────────────────────────────────────────
  if (status === 'done' && simData) {
    const state = simData.states[simTurn];
    const numFloors = rawJson?.building?.grid?.length ?? 1;

    // Map simulation state to scenario format for GridView
    const turnScenario = {
      responders: state?.agents  ?? [],
      victims:    state?.victims ?? [],
    };
    const floorGrid = rawJson?.building?.grid?.[simFloor] ?? [];

    return (
      <div style={S.wrap}>
        <div style={S.topbar}>
          <button style={S.backBtn} onClick={onBack}>← HOME</button>
          {onNavigate && (
            <button style={S.navBtn} onClick={() => onNavigate('floorplan')}>← Scenario Builder</button>
          )}
          <div style={S.topTitle}>Run Simulation</div>
          <div style={S.topBadge}>SIMULATE</div>
          <div style={{ flex: 1 }} />
          <button style={S.newSimBtn} onClick={resetSim}>↩ NEW SIMULATION</button>
        </div>

        {/* Turn scrubber */}
        <div style={S.turnBar}>
          <button style={S.turnBtn} onClick={() => setSimTurn(t => Math.max(0, t - 1))}>◀</button>
          <input
            type="range"
            min={0}
            max={simData.states.length - 1}
            value={simTurn}
            onChange={e => setSimTurn(+e.target.value)}
            style={S.turnScrubber}
          />
          <button style={S.turnBtn} onClick={() => setSimTurn(t => Math.min(simData.states.length - 1, t + 1))}>▶</button>
          <span style={S.turnLabel}>
            T{simTurn} / T{simData.states.length - 1}
            {' · '}
            <span style={{
              color: state?.status === 'success' ? '#5bf0a5'
                : state?.status === 'failed' ? '#ff4444'
                : '#888',
            }}>
              {state?.status?.toUpperCase() ?? '—'}
            </span>
          </span>
        </div>

        {/* View mode tabs */}
        <div style={S.viewTabRow}>
          {[['3d', '🧊 3D View'], ['2d', '🗺 2D Floor Plan']].map(([v, label]) => (
            <button key={v}
              style={{ ...S.viewTab, ...(simViewMode === v ? S.viewTabActive : {}) }}
              onClick={() => setSimViewMode(v)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Floor toggle — 2D only */}
        {simViewMode === '2d' && (
          <FloorToggle count={numFloors} active={simFloor} onChange={setSimFloor} />
        )}

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {simViewMode === '3d' ? (
            <SimView rawJson={rawJson} simData={simData} />
          ) : (
            <div style={{ flex: 1, overflow: 'auto', background: '#0a0a0f' }}>
              <GridView
                grid={floorGrid}
                floorIndex={simFloor}
                scenario={turnScenario}
                turnState={state}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Setup panel — idle / running / error ─────────────────────────────────
  const jsonValid = (() => {
    if (!json.trim()) return null;
    try { JSON.parse(json); return true; } catch { return false; }
  })();

  // Pre-run validation warnings
  const warnings = (() => {
    if (!jsonValid) return [];
    try {
      const p = JSON.parse(json);
      const w = [];
      if (!p.scenario?.threat) w.push('No fire threat defined — add one in Scenario Builder or the backend will reject this request.');
      if (!p.scenario?.responders?.length) w.push('No responders defined.');
      if (!p.scenario?.victims?.length) w.push('No victims defined.');
      return w;
    } catch { return []; }
  })();

  return (
    <div style={S.wrap}>
      <div style={S.topbar}>
        <button style={S.backBtn} onClick={onBack}>← HOME</button>
        {onNavigate && (
          <button style={S.navBtn} onClick={() => onNavigate('floorplan')}>← Scenario Builder</button>
        )}
        <div style={S.topTitle}>Run Simulation</div>
        <div style={S.topBadge}>SIMULATE</div>
      </div>

      <div style={S.body}>
        <div style={S.bodyInner}>

          {/* Step 1: Load JSON */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ ...S.label, marginBottom: 2 }}>Step 1 — Building JSON</div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 16, color: 'rgba(255,255,255,.75)' }}>
                  Load Your Building
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => fileRef.current.click()}
                  style={{ padding: '6px 14px', background: 'rgba(100,180,255,.06)', border: '1px solid rgba(100,180,255,.15)', borderRadius: 7, color: 'rgba(140,200,255,.6)', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '.5px' }}
                >
                  UPLOAD FILE
                </button>
                <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={loadFile} />
                {json && (
                  <button
                    onClick={() => { setJson(''); setError(''); }}
                    style={{ padding: '6px 10px', background: 'rgba(255,60,60,.05)', border: '1px solid rgba(255,60,60,.1)', borderRadius: 7, color: 'rgba(255,100,100,.4)', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 9 }}
                  >
                    CLEAR
                  </button>
                )}
              </div>
            </div>
            <textarea
              style={{
                ...S.textarea,
                borderColor: jsonValid === true ? 'rgba(91,240,165,.2)'
                  : jsonValid === false ? 'rgba(255,100,100,.3)'
                  : 'rgba(255,255,255,.1)',
              }}
              value={json}
              onChange={e => setJson(e.target.value)}
              placeholder={'{\n  "building": {\n    "meta": { "schema_version": "1.0", "name": "My Building", "floors": 2 },\n    "floor_labels": { "0": "Ground Floor" },\n    "grid": [...],\n    "cell_properties": {},\n    "vertical_connections": [],\n    "exit_nodes": []\n  },\n  "scenario": {\n    "responders": [...],\n    "victims": [...],\n    "simulation_config": { "max_turns": 40 }\n  }\n}'}
            />
            {json && (
              <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: jsonValid ? 'rgba(91,240,165,.5)' : 'rgba(255,100,100,.6)' }}>
                {jsonValid ? (() => {
                  const p = JSON.parse(json);
                  const b = p.building || {};
                  const grids = b.grid || [];
                  const meta = b.meta || {};
                  const name = meta.name || b.name;
                  const nF = meta.floors || grids.length;
                  const w = meta.width, h = meta.height;
                  const nR = p.scenario?.responders?.length ?? 0;
                  const nV = p.scenario?.victims?.length ?? 0;
                  return `✓ Valid JSON · ${nF} floor${nF !== 1 ? 's' : ''}${name ? ` · "${name}"` : ''}${w ? ` · ${w}×${h}` : ''}${nR ? ` · ${nR} responder${nR !== 1 ? 's' : ''}` : ''}${nV ? ` · ${nV} victim${nV !== 1 ? 's' : ''}` : ''}`;
                })() : '✗ Invalid JSON'}
              </div>
            )}
          </div>

          {/* Step 2: Config */}
          <div style={S.card}>
            <div style={{ ...S.label, marginBottom: 2 }}>Step 2 — Configuration</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 600, fontSize: 16, color: 'rgba(255,255,255,.75)', marginBottom: 14 }}>
              Simulation Parameters
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Turns</div>
                <input
                  type="number" min={1} max={100} value={turns}
                  onChange={e => setTurns(parseInt(e.target.value) || 10)}
                  style={{ width: 80, padding: '7px 10px', background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, color: 'rgba(255,255,255,.7)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, outline: 'none', textAlign: 'center' }}
                />
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,.2)', lineHeight: 1.6 }}>
                Each turn: threats propagate → victims flee<br />
                → responders assigned → A* routes computed
              </div>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {warnings.map((w, i) => (
                <div key={i} style={{ padding: '8px 14px', background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(245,158,11,.8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Run */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <button
              style={{ ...S.runBtn, opacity: status === 'running' ? .5 : 1, cursor: status === 'running' ? 'not-allowed' : 'pointer' }}
              onClick={runSim}
              disabled={status === 'running'}
            >
              {status === 'running' ? '⏳ RUNNING…' : '⚡ RUN SIMULATION'}
            </button>
            {status === 'running' && (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,136,68,.5)' }}>
                Calling backend…
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '12px 16px', background: 'rgba(255,60,60,.06)', border: '1px solid rgba(255,60,60,.15)', borderRadius: 9, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'rgba(255,100,100,.7)' }}>
              ✗ {error}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
