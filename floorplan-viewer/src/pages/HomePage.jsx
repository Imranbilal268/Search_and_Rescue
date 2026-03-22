function ClippyHero() {
  return (
    <svg width="130" height="172" viewBox="0 -14 72 102" style={{ display: 'block' }}>
      {/* ── Cowboy hat ── */}
      <ellipse cx="36" cy="5" rx="28" ry="6.5" fill="#7a3f12" stroke="#3d1f06" strokeWidth="1.2" />
      <path d="M22 5 Q21 -7 36 -11 Q51 -7 50 5" fill="#8B4713" stroke="#3d1f06" strokeWidth="1.2" />
      <ellipse cx="36" cy="-11" rx="14" ry="3.5" fill="#8B4713" stroke="#3d1f06" strokeWidth="1.2" />
      <ellipse cx="36" cy="5" rx="19" ry="4" fill="#4a2208" stroke="none" opacity="0.55" />
      <path d="M22 4 Q36 5.5 50 4" fill="none" stroke="#1a0800" strokeWidth="3.5" />
      <polygon points="36,1.2 37.1,3.2 39.3,3.2 37.7,4.7 38.3,6.9 36,5.7 33.7,6.9 34.3,4.7 32.7,3.2 34.9,3.2"
        fill="#d4a017" stroke="#8a6000" strokeWidth="0.4" />
      {/* ── Paperclip body ── */}
      <path d="M36 5 Q18 5 18 20 L18 66 Q18 78 30 78 L42 78 Q54 78 54 66 L54 33 Q54 21 42 21 L30 21 Q25 21 25 27 L25 61 Q25 66 30 66 L42 66 Q47 66 47 61 L47 27"
        fill="none" stroke="#7a9cc0" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Sheriff badge */}
      <polygon points="58,48 59.5,51.5 63,52 60.5,54.5 61,58 58,56.5 55,58 55.5,54.5 53,52 56.5,51.5"
        fill="#d4a017" stroke="#8a6000" strokeWidth="0.7" />
      <text x="58" y="55.5" textAnchor="middle" fontSize="3.5" fontWeight="bold" fill="#3d2000">★</text>
      {/* Lasso loop */}
      <path d="M54 30 Q66 22 67 34 Q68 46 58 44" fill="none" stroke="#c8a060" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M54 30 Q52 28 54 26 Q57 24 58 27" fill="none" stroke="#c8a060" strokeWidth="1.5" strokeLinecap="round" />
      {/* Eyes */}
      <ellipse cx="29" cy="46" rx="5" ry="5.5" fill="white" stroke="#5577aa" strokeWidth="0.8" />
      <ellipse cx="43" cy="46" rx="5" ry="5.5" fill="white" stroke="#5577aa" strokeWidth="0.8" />
      <circle cx="30" cy="47" r="3" fill="#223388" />
      <circle cx="44" cy="47" r="3" fill="#223388" />
      <circle cx="31" cy="46" r="1.2" fill="white" />
      <circle cx="45" cy="46" r="1.2" fill="white" />
      <path d="M24 39 Q29 36 34 39" fill="none" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M38 39 Q43 36 48 39" fill="none" stroke="#8899bb" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M27 57 Q36 64 45 57" fill="none" stroke="#8899bb" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const CARD_HOVER_CSS = `
  .feature-card {
    transition: transform .2s, background .2s, border-color .2s, box-shadow .2s;
    cursor: pointer;
  }
  .feature-card:hover {
    transform: translateY(-3px);
    background: rgba(255,255,255,.05) !important;
    border-color: rgba(232,184,75,.2) !important;
    box-shadow: 0 16px 48px rgba(0,0,0,.5) !important;
  }
  .feature-card.sim:hover {
    border-color: rgba(212,102,42,.25) !important;
  }
  .feature-card:hover .card-cta {
    background: rgba(232,184,75,.1) !important;
    border-color: rgba(232,184,75,.45) !important;
  }
  .feature-card.sim:hover .card-cta {
    background: rgba(212,102,42,.12) !important;
    border-color: rgba(212,102,42,.45) !important;
    color: #d4662a !important;
  }
  .stat-chip {
    transition: all .15s;
  }
`;

const FEATURES = [
  {
    key: 'editor',
    icon: '🏚️',
    tag: 'BLUEPRINT',
    name: 'Building Editor',
    desc: 'Draw accurate structural layouts for any rescue site. Model stairwells, locked doors, hazard zones, elevator shafts, and windows across multiple floors. Export to JSON and ride straight into your mission plan.',
    meta: '3D + 2D view  ·  JSON import/export  ·  Multi-floor',
    accent: '#e8b84b',
    href: '/BuildingEditor.html',
    label: 'OPEN EDITOR',
    stats: [{ v: '21', l: 'materials' }, { v: '8', l: 'tools' }, { v: '5', l: 'view modes' }],
  },
  {
    key: 'floorplan',
    nav: 'floorplan',
    icon: '🗺️',
    tag: 'FIELD PLAN',
    name: 'Scenario Builder',
    desc: 'Deploy your posse — place rescue personnel, victims, fire threats, and exit routes on the map. Gear up responders with the right equipment, set the threat origin, then hand it off to the simulation engine.',
    meta: 'Place responders  ·  Place victims  ·  Threat config  ·  3D preview',
    accent: '#e8b84b',
    label: 'OPEN BUILDER',
    stats: [{ v: 'R+V', l: 'placement' }, { v: 'JSON', l: 'import' }, { v: '3D', l: 'preview' }],
  },
  {
    key: 'simulation',
    nav: 'simulation',
    icon: '⚡',
    tag: 'RIDE OUT',
    name: 'Run Simulation',
    desc: 'Sound the alarm and watch the operation unfold turn by turn. Responders are optimally assigned and routed around spreading threats. Replay every decision with per-floor detail and AI debrief from Clippy.',
    meta: 'Optimal assignment  ·  Threat-aware routing  ·  AI debrief',
    accent: '#d4662a',
    label: 'LAUNCH',
    sim: true,
    stats: [{ v: 'A*', l: 'pathfinding' }, { v: 'HUN', l: 'assignment' }, { v: 'AI', l: 'debrief' }],
  },
];

export default function HomePage({ onNavigate }) {
  return (
    <>
      <style>{CARD_HOVER_CSS}</style>
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        fontFamily: "'Outfit', sans-serif",
        color: '#fff',
        overflowY: 'auto',
      }}>

        {/* Hero */}
        <div style={{ padding: '56px 48px 0', maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 48, marginBottom: 0 }}>

            {/* Left: text */}
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                color: 'rgba(232,184,75,.7)',
                letterSpacing: '2.5px',
                textTransform: 'uppercase',
                marginBottom: 20,
              }}>
                🤠 RESCUEGRID · SHERIFF'S AI RESCUE COMMAND
              </div>

              <h1 style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 700,
                fontSize: 68,
                letterSpacing: -2,
                color: '#fff',
                margin: '0 0 8px',
                lineHeight: 1,
              }}>
                Search and Rescue
              </h1>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 16,
                color: 'rgba(232,184,75,.55)',
                letterSpacing: '1px',
                marginBottom: 24,
              }}>
                — Operations Command Platform
              </div>

              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14,
                color: 'rgba(255,255,255,.42)',
                maxWidth: 560,
                lineHeight: 1.9,
                marginBottom: 40,
              }}>
                Plan your operation before boots hit the ground. Map real buildings
                floor-by-floor, deploy your team, introduce fire or hostile threats —
                then let the AI ride out the optimal extraction routes and replay every
                call turn by turn with a full tactical debrief.
              </p>
            </div>

            {/* Right: Clippy mascot */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingTop: 8 }}>
              {/* Speech bubble */}
              <div style={{
                position: 'relative',
                background: 'rgba(20,40,70,.9)',
                border: '1px solid rgba(232,184,75,.25)',
                borderRadius: 12,
                padding: '10px 14px',
                marginBottom: 12,
                maxWidth: 230,
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10.5,
                  color: 'rgba(255,255,255,.7)',
                  lineHeight: 1.7,
                }}>
                  "Howdy, partner. Looks like you're planning a rescue. Need a hand?"
                </div>
                {/* Bubble tail */}
                <div style={{
                  position: 'absolute', bottom: -9, right: 36,
                  width: 0, height: 0,
                  borderLeft: '9px solid transparent',
                  borderRight: '9px solid transparent',
                  borderTop: '9px solid rgba(232,184,75,.25)',
                }} />
              </div>
              <ClippyHero />
            </div>
          </div>

          <div style={{
            height: 1,
            background: 'linear-gradient(90deg, rgba(232,184,75,.2) 0%, rgba(232,184,75,.04) 60%, transparent 100%)',
            margin: '32px 0 48px',
          }} />
        </div>

        {/* Feature grid */}
        <div style={{
          padding: '0 48px 80px',
          maxWidth: 1120,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
        }}>
          {FEATURES.map(f => (
            <div
              key={f.key}
              className={'feature-card' + (f.sim ? ' sim' : '')}
              onClick={() => {
                if (f.href) window.location.href = f.href;
                else if (f.nav) onNavigate(f.nav);
              }}
              style={{
                background: 'rgba(255,255,255,.025)',
                border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 16,
                padding: '26px 26px 22px',
                boxShadow: '0 4px 20px rgba(0,0,0,.25)',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 20 }}>{f.icon}</span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: f.accent,
                  letterSpacing: '1.5px',
                  background: f.accent + '15',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: `1px solid ${f.accent}30`,
                }}>{f.tag}</span>
              </div>

              {/* Name */}
              <div style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 700,
                fontSize: 26,
                color: 'rgba(255,255,255,.88)',
                marginBottom: 12,
                letterSpacing: -.4,
              }}>{f.name}</div>

              {/* Description */}
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                color: 'rgba(255,255,255,.35)',
                lineHeight: 1.8,
                margin: '0 0 14px',
              }}>{f.desc}</p>

              {/* Meta */}
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: 'rgba(255,255,255,.2)',
                letterSpacing: '.4px',
                marginBottom: 18,
              }}>{f.meta}</div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                {f.stats.map(s => (
                  <div key={s.l} className="stat-chip" style={{
                    padding: '4px 10px',
                    background: 'rgba(255,255,255,.03)',
                    border: '1px solid rgba(255,255,255,.05)',
                    borderRadius: 5,
                    textAlign: 'center',
                  }}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'rgba(255,255,255,.5)',
                    }}>{s.v}</div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 9,
                      color: 'rgba(255,255,255,.2)',
                      letterSpacing: '.3px',
                    }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="card-cta" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 16px',
                borderRadius: 7,
                background: f.accent + '0d',
                border: `1px solid ${f.accent}28`,
                color: f.accent,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                letterSpacing: '.8px',
                fontWeight: 600,
              }}>
                {f.label} →
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          paddingBottom: 36,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: 'rgba(255,255,255,.15)',
          letterSpacing: '1px',
        }}>
          🤠&nbsp;&nbsp;RESCUEGRID v0.1&nbsp;&nbsp;·&nbsp;&nbsp;SHERIFF'S AI DIVISION&nbsp;&nbsp;·&nbsp;&nbsp;cd backend && uvicorn api:app --reload
        </div>
      </div>
    </>
  );
}
