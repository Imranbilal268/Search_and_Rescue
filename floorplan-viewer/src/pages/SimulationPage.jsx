import { useState, useRef, useEffect, useCallback } from 'react';
import SimView from '../components/SimView';
import GridView from '../components/GridView';

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

function ClippyAvatar() {
  return (
    <svg width="72" height="96" viewBox="0 -14 72 102" style={{ display: 'block' }}>
      {/* ── Cowboy hat ── */}
      {/* Brim */}
      <ellipse cx="36" cy="5" rx="28" ry="6.5" fill="#7a3f12" stroke="#3d1f06" strokeWidth="1.2" />
      {/* Crown */}
      <path d="M22 5 Q21 -7 36 -11 Q51 -7 50 5" fill="#8B4713" stroke="#3d1f06" strokeWidth="1.2" />
      {/* Crown top */}
      <ellipse cx="36" cy="-11" rx="14" ry="3.5" fill="#8B4713" stroke="#3d1f06" strokeWidth="1.2" />
      {/* Brim shadow / inner */}
      <ellipse cx="36" cy="5" rx="19" ry="4" fill="#4a2208" stroke="none" opacity="0.55" />
      {/* Hat band */}
      <path d="M22 4 Q36 5.5 50 4" fill="none" stroke="#1a0800" strokeWidth="3.5" />
      {/* Star buckle */}
      <polygon points="36,1.2 37.1,3.2 39.3,3.2 37.7,4.7 38.3,6.9 36,5.7 33.7,6.9 34.3,4.7 32.7,3.2 34.9,3.2"
        fill="#d4a017" stroke="#8a6000" strokeWidth="0.4" />
      {/* ── Paperclip body ── */}
      <path d="M36 5 Q18 5 18 20 L18 66 Q18 78 30 78 L42 78 Q54 78 54 66 L54 33 Q54 21 42 21 L30 21 Q25 21 25 27 L25 61 Q25 66 30 66 L42 66 Q47 66 47 61 L47 27"
        fill="none" stroke="#7a9cc0" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Eyes */}
      <ellipse cx="29" cy="46" rx="5" ry="5.5" fill="white" stroke="#5577aa" strokeWidth="0.8" />
      <ellipse cx="43" cy="46" rx="5" ry="5.5" fill="white" stroke="#5577aa" strokeWidth="0.8" />
      <circle cx="30" cy="47" r="3" fill="#223388" />
      <circle cx="44" cy="47" r="3" fill="#223388" />
      <circle cx="31" cy="46" r="1.2" fill="white" />
      <circle cx="45" cy="46" r="1.2" fill="white" />
      {/* Eyebrows */}
      <path d="M24 39 Q29 36 34 39" fill="none" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M38 39 Q43 36 48 39" fill="none" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" />
      {/* Smile */}
      <path d="M27 57 Q36 64 45 57" fill="none" stroke="#8899bb" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function SimulationPage({ onBack, onNavigate, initialJson, onJsonChange }) {
  const [json, setJson] = useState(() =>
    initialJson ? JSON.stringify(initialJson, null, 2) : ''
  );
  const [turns, setTurns] = useState(
    () => initialJson?.scenario?.simulation_config?.max_turns ?? 100
  );
  const [status, setStatus] = useState('idle');
  const [simData, setSimData] = useState(null);
  const [rawJson, setRawJson] = useState(null);
  const [error, setError] = useState('');
  const [simTurn, setSimTurn] = useState(0);
  // View mode for results: '3d' | '2d'
  const [simViewMode, setSimViewMode] = useState('3d');
  // Auto-play
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(100); // ms per turn
  const playRef = useRef(null);
  // LLM explainer
  const [wallOpacity, setWallOpacity] = useState(100);
  const [llmDisplayed, setLlmDisplayed] = useState('');
  const [llmPrompt, setLlmPrompt] = useState(
    'You are a tactical AI advisor embedded in a search and rescue command system. Based on this simulation, generate a concise operational action plan in present tense — written as direct instructions to an incident commander in the field right now.\n\nStrict rules:\n- Use full designations only: "Responder 1", "Responder 2", "Victim 1", etc. — never R1, R2, V1, V2.\n- Describe locations by structural feature and floor level (e.g. "the second-floor stairwell", "the ground-floor north exit corridor") — never use grid coordinates or numbers.\n- Write as active present-tense instructions: "Deploy Responder 1 to...", "Route around the fire spreading through...", "Victim 2 is trapped in... and requires..."\n- Cover: where each victim is located and their urgency level, which responder to assign to each victim and what equipment they should carry, how to route around the threat, and the priority extraction order.\n- End with one contingency note if any victim was at elevated risk from the threat.\n\nIMPORTANT: Keep the entire response under 200 words. Present tense. 2-3 direct paragraphs. No bullet points, no headers.'
  );
  const [llmResponse, setLlmResponse] = useState('');
  const [llmLoading, setLlmLoading] = useState(false);
  const fileRef = useRef();

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  // Auto-play effect
  useEffect(() => {
    if (!isPlaying || !simData) return;
    playRef.current = setInterval(() => {
      setSimTurn(t => {
        if (t >= simData.states.length - 1) {
          setIsPlaying(false);
          return t;
        }
        return t + 1;
      });
    }, playSpeed);
    return () => clearInterval(playRef.current);
  }, [isPlaying, playSpeed, simData]);

  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);

  function highlightAgents(text) {
    const parts = text.split(/\b(Responder \d+|Victim \d+)\b/gi);
    return parts.map((part, i) => {
      if (/^Responder \d+$/i.test(part))
        return <span key={i} style={{ background: 'rgba(91,240,165,.15)', color: '#5bf0a5', borderRadius: 3, padding: '1px 4px', fontWeight: 600 }}>{part}</span>;
      if (/^Victim \d+$/i.test(part))
        return <span key={i} style={{ background: 'rgba(245,158,11,.15)', color: '#fbbf24', borderRadius: 3, padding: '1px 4px', fontWeight: 600 }}>{part}</span>;
      return part;
    });
  }

  // Typewriter effect: advance llmDisplayed toward llmResponse character by character
  useEffect(() => {
    if (!llmResponse) { setLlmDisplayed(''); return; }
    if (llmDisplayed.length >= llmResponse.length) return;
    const t = setTimeout(() => {
      setLlmDisplayed(llmResponse.slice(0, Math.min(llmResponse.length, llmDisplayed.length + 5)));
    }, 22);
    return () => clearTimeout(t);
  }, [llmResponse, llmDisplayed]);

  // Build a compact simulation summary for the LLM (no grid data — keeps token count low)
  function buildLlmPayload() {
    if (!simData) return '';
    const meta = simData?.meta || {};
    // Only include event-rich turns + first/last to keep tokens small
    const states = simData.states;
    const keyTurns = states.filter((s, i) =>
      i === 0 || i === states.length - 1 || (s.events?.length ?? 0) > 0
    );
    const summary = {
      building: { name: meta.name, floors: meta.floors, width: meta.width, height: meta.height },
      total_turns: states.length,
      final_status: states[states.length - 1]?.status,
      responders: states[0]?.responder_states?.map(r => ({ id: r.id, equipment: r.equipment })),
      victims: states[0]?.victim_states?.map(v => ({ id: v.id, mobility: v.mobility })),
      key_turns: keyTurns.map(s => ({
        turn: s.turn,
        status: s.status,
        fire_consumed: s.threat_state?.consumed_nodes?.length ?? 0,
        responders: (s.responder_states ?? []).map(r => ({
          id: r.id, status: r.status, pos: r.position, assigned_to: r.assigned_to,
        })),
        victims: (s.victim_states ?? []).map(v => ({
          id: v.id, status: v.status, pos: v.position,
        })),
        events: (s.events ?? []).map(e => e.description),
      })),
    };
    return JSON.stringify(summary, null, 2);
  }

  async function runLlmAnalysis() {
    const apiKey = import.meta.env.VITE_GEMINI_KEY;
    if (!apiKey) { setLlmResponse('⚠ VITE_GEMINI_KEY not set in .env'); return; }
    setLlmLoading(true);
    setLlmResponse('');
    try {
      const payload = buildLlmPayload();
      const fullPrompt = llmPrompt + '\n\nSimulation data:\n' + payload;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: { temperature: 0.7 },
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || res.statusText);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const chunk = JSON.parse(jsonStr);
            const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (text) setLlmResponse(prev => prev + text);
          } catch {}
        }
      }
    } catch (e) {
      setLlmResponse(prev => prev + (prev ? '\n\n' : '') + 'Error: ' + e.message);
    } finally {
      setLlmLoading(false);
    }
  }

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
    setIsPlaying(false);
    setSimViewMode('3d');
    setLlmResponse('');
    setLlmDisplayed('');
  };

  // ── Results view ──────────────────────────────────────────────────────────
  if (status === 'done' && simData) {
    const state = simData.states[simTurn];
    // simData.grid is the API-normalised grid (always a proper array); rawJson.building.grid
    // may be wrapped in {"layers":[...]} format from the building editor, so don't use it here.
    const allGrids = simData.grid ?? [];
    const numFloors = allGrids.length;

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

        {/* Turn scrubber + playback controls */}
        <div style={S.turnBar}>
          <button style={S.turnBtn} onClick={() => { setIsPlaying(false); setSimTurn(0); }}>⏮</button>
          <button style={S.turnBtn} onClick={() => { setIsPlaying(false); setSimTurn(t => Math.max(0, t - 1)); }}>◀</button>
          <button
            style={{ ...S.turnBtn, color: isPlaying ? '#ff8844' : '#5bf0a5', borderColor: isPlaying ? 'rgba(255,136,68,.3)' : 'rgba(91,240,165,.3)' }}
            onClick={togglePlay}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button style={S.turnBtn} onClick={() => { setIsPlaying(false); setSimTurn(t => Math.min(simData.states.length - 1, t + 1)); }}>▶|</button>
          <input
            type="range" min={0} max={simData.states.length - 1} value={simTurn}
            onChange={e => { setIsPlaying(false); setSimTurn(+e.target.value); }}
            style={S.turnScrubber}
          />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,.3)', flexShrink: 0 }}>SPD</span>
          <input
            type="range" min={50} max={800} step={50} value={playSpeed}
            onChange={e => setPlaySpeed(+e.target.value)}
            style={{ width: 70, cursor: 'pointer', accentColor: '#ff8844' }}
            title={`${playSpeed}ms/turn`}
          />
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
          {[['3d', '🧊 3D View'], ['2d', '🗺 All Floors']].map(([v, label]) => (
            <button key={v}
              style={{ ...S.viewTab, ...(simViewMode === v ? S.viewTabActive : {}) }}
              onClick={() => setSimViewMode(v)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Main content: viewer + LLM sidebar */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

          {/* Left: viewer */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            {simViewMode === '3d' ? (
              <SimView rawJson={rawJson} simData={simData} simTurn={simTurn} wallOpacity={wallOpacity} />
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', background: '#0a0a0f', padding: '16px 20px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
                  {allGrids.map((floorGrid, fi) => {
                    const gridW = floorGrid[0]?.length ?? 1;
                    const gridH = floorGrid.length;
                    const CELL = 40, PAD = 20;
                    const svgW = gridW * CELL + PAD * 2;
                    const svgH = gridH * CELL + PAD * 2;
                    const displayW = Math.min(700, Math.max(350, Math.round(1400 / numFloors)));
                    const displayH = Math.round(displayW * svgH / svgW);
                    const floorLabel = simData?.floor_labels?.[String(fi)]
                      ?? rawJson?.building?.floor_labels?.[String(fi)]
                      ?? null;
                    return (
                      <div key={fi} style={{ flexShrink: 0 }}>
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#5bf0a5',
                          letterSpacing: '1.5px',
                          textTransform: 'uppercase',
                          marginBottom: 8,
                          padding: '4px 12px',
                          background: 'rgba(91,240,165,.08)',
                          border: '1px solid rgba(91,240,165,.15)',
                          borderRadius: 6,
                          display: 'inline-block',
                        }}>
                          Floor {fi + 1}{floorLabel ? ` — ${floorLabel}` : ''}
                        </div>
                        <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, overflow: 'hidden', background: '#0e0e16' }}>
                          <GridView
                            grid={floorGrid}
                            floorIndex={fi}
                            roomLabels={simData?.room_labels ?? rawJson?.building?.room_labels ?? {}}
                            cellProperties={simData?.cell_properties ?? rawJson?.building?.cell_properties ?? {}}
                            exactWidth={displayW}
                            exactHeight={displayH}
                            turnState={state}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: LLM Explainer */}
          <div style={{
            width: 360,
            flexShrink: 0,
            borderLeft: '1px solid rgba(255,255,255,.07)',
            background: 'rgba(10,10,18,.97)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(91,240,165,.5)', letterSpacing: '2px', marginBottom: 4 }}>AI EXPLAINER</div>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 16, color: 'rgba(255,255,255,.85)' }}>Rescue Plan Analysis</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,.2)', marginTop: 4, lineHeight: 1.6 }}>Powered by Gemini 2.5 Flash · AI tactical debrief</div>
            </div>

            {/* Config */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {simViewMode === '3d' && (
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,.25)', letterSpacing: '1px', marginBottom: 6 }}>WALL OPACITY</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="range" min={5} max={100} value={wallOpacity}
                      onChange={e => setWallOpacity(+e.target.value)}
                      style={{ flex: 1, cursor: 'pointer', accentColor: '#5bf0a5' }}
                    />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,.35)', flexShrink: 0, minWidth: 28 }}>{wallOpacity}%</span>
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,.25)', letterSpacing: '1px', marginBottom: 4 }}>ANALYSIS PROMPT</div>
                <textarea
                  value={llmPrompt}
                  onChange={e => setLlmPrompt(e.target.value)}
                  rows={5}
                  style={{ width: '100%', padding: '6px 10px', background: 'rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, color: 'rgba(255,255,255,.5)', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
                />
              </div>
              <button
                onClick={runLlmAnalysis}
                disabled={llmLoading}
                style={{ padding: '8px 0', background: llmLoading ? 'rgba(91,240,165,.04)' : 'rgba(91,240,165,.1)', border: '1px solid rgba(91,240,165,.25)', borderRadius: 7, color: '#5bf0a5', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '.8px', fontWeight: 700, cursor: llmLoading ? 'not-allowed' : 'pointer', opacity: llmLoading ? .5 : 1 }}
              >
                {llmLoading ? '⏳ ANALYZING…' : '✦ ANALYZE WITH AI'}
              </button>
            </div>

            {/* Hint when no response yet */}
            {!llmResponse && !llmLoading && (
              <div style={{ padding: '14px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,.12)', lineHeight: 1.8, textAlign: 'center' }}>
                Analysis will appear<br />in the dialog below.
              </div>
            )}
          </div>
        </div>

      {/* ── Clippy Dialog Box ── */}
      {(llmDisplayed || llmLoading) && (
        <div style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'stretch',
          background: 'linear-gradient(180deg, #071410 0%, #050e09 100%)',
          borderTop: '2px solid #1a4a2a',
          boxShadow: '0 -6px 40px rgba(0,140,60,.18), inset 0 1px 0 rgba(91,240,165,.07)',
          minHeight: 0,
          maxHeight: 200,
          position: 'relative',
          zIndex: 20,
        }}>
          {/* Corner brackets — top-left */}
          <div style={{ position: 'absolute', top: 6, left: 6, width: 14, height: 14, borderTop: '2px solid rgba(91,240,165,.35)', borderLeft: '2px solid rgba(91,240,165,.35)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 6, right: 6, width: 14, height: 14, borderTop: '2px solid rgba(91,240,165,.35)', borderRight: '2px solid rgba(91,240,165,.35)', pointerEvents: 'none' }} />

          {/* Clippy portrait */}
          <div style={{
            flexShrink: 0, width: 110,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 4, padding: '10px 8px',
            borderRight: '1px solid rgba(91,240,165,.12)',
            background: 'rgba(10,40,20,.25)',
          }}>
            <ClippyAvatar />
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#5bf0a5', letterSpacing: '2px', textTransform: 'uppercase' }}>CLIPPY</div>
          </div>

          {/* Dialog text */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 20px 12px 16px', minWidth: 0 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: 'rgba(91,240,165,.55)', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#5bf0a5' }}>▸</span> AI RESCUE ANALYSIS
              {llmLoading && <span style={{ color: 'rgba(91,240,165,.4)', fontSize: 7, letterSpacing: '1px' }}>STREAMING...</span>}
            </div>
            <div style={{
              flex: 1, overflowY: 'auto',
              fontFamily: "'Outfit', sans-serif", fontSize: 15, color: 'rgba(200,225,255,.88)',
              lineHeight: 1.75, whiteSpace: 'pre-wrap',
            }}>
              {highlightAgents(llmDisplayed)}
              {(llmLoading || llmDisplayed.length < llmResponse.length) && (
                <span style={{ display: 'inline-block', width: 2, height: '1em', background: '#5bf0a5', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 0.6s step-end infinite' }} />
              )}
            </div>
          </div>
        </div>
      )}
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
                  type="number" min={1} max={500} value={turns}
                  onChange={e => setTurns(parseInt(e.target.value) || 100)}
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
