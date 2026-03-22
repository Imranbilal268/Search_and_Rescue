const CARD_HOVER_CSS = `
  .feature-card {
    transition: transform .2s, background .2s, border-color .2s, box-shadow .2s;
    cursor: pointer;
  }
  .feature-card:hover {
    transform: translateY(-3px);
    background: rgba(255,255,255,.05) !important;
    border-color: rgba(91,240,165,.2) !important;
    box-shadow: 0 16px 48px rgba(0,0,0,.5) !important;
  }
  .feature-card.sim:hover {
    border-color: rgba(255,136,68,.2) !important;
  }
  .feature-card:hover .card-cta {
    background: rgba(91,240,165,.12) !important;
    border-color: rgba(91,240,165,.45) !important;
  }
  .feature-card.sim:hover .card-cta {
    background: rgba(255,136,68,.12) !important;
    border-color: rgba(255,136,68,.45) !important;
    color: #ff8844 !important;
  }
  .stat-chip {
    transition: all .15s;
  }
`;

const FEATURES = [
  {
    key: 'editor',
    icon: '🏗️',
    tag: 'BUILD',
    name: 'Building Editor',
    desc: 'Design multi-floor buildings with 21 material types. Use pen, line, rect, wall, and room tools across a full 3D viewport and 2D plan view. Import, edit, and export floorplan JSON.',
    meta: '3D + 2D view  ·  JSON import/export  ·  Presets',
    accent: '#5bf0a5',
    href: '/BuildingEditor.html',
    label: 'OPEN EDITOR',
    stats: [{ v: '21', l: 'materials' }, { v: '8', l: 'tools' }, { v: '5', l: 'view modes' }],
  },
  {
    key: 'floorplan',
    nav: 'floorplan',
    icon: '🎯',
    tag: 'SCENARIO',
    name: 'Scenario Builder',
    desc: 'Define rescue scenarios on your floor plans. Place responders and victims, set mobility types, design rooms and walls with the stamp editor, then export directly to the simulation engine.',
    meta: 'Place responders  ·  Place victims  ·  Stamp editor  ·  3D preview',
    accent: '#5bf0a5',
    label: 'OPEN BUILDER',
    stats: [{ v: 'R+V', l: 'placement' }, { v: 'JSON', l: 'import' }, { v: '3D', l: 'preview' }],
  },
  {
    key: 'simulation',
    nav: 'simulation',
    icon: '⚡',
    tag: 'SIMULATE',
    name: 'Run Simulation',
    desc: 'Upload a building JSON and run the AI-powered rescue simulation. Responders are assigned via Hungarian algorithm and routed with A* pathfinding. Fire and hostile threats propagate dynamically each turn.',
    meta: 'Hungarian alg  ·  A* pathfinding  ·  Dynamic threats',
    accent: '#ff8844',
    label: 'LAUNCH',
    sim: true,
    stats: [{ v: 'A*', l: 'pathfinding' }, { v: 'HUN', l: 'assignment' }, { v: 'SIM', l: 'engine' }],
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
        <div style={{ padding: '64px 48px 0', maxWidth: 1120, margin: '0 auto' }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: 'rgba(91,240,165,.5)',
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            marginBottom: 18,
          }}>
            RESCUEGRID · AI-POWERED EMERGENCY RESPONSE PLATFORM
          </div>

          <h1 style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 700,
            fontSize: 52,
            letterSpacing: -2,
            color: '#fff',
            margin: '0 0 20px',
            lineHeight: 1,
          }}>
            Search and Rescue
          </h1>

          <p style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: 'rgba(255,255,255,.3)',
            maxWidth: 560,
            lineHeight: 1.8,
            marginBottom: 32,
          }}>
            A multi-phase simulation platform for emergency response planning.
            Design buildings, define rescue scenarios, run AI-optimized simulations,
            and replay results with full spatial awareness across all floors.
          </p>

          {/* Quick stats row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 48, flexWrap: 'wrap' }}>
            {[
              ['Python', 'FastAPI backend'],
              ['React', 'frontend'],
              ['Three.js', '3D renderer'],
              ['A* + Hungarian', 'algorithms'],
            ].map(([val, lbl]) => (
              <div key={val} style={{
                padding: '5px 14px',
                background: 'rgba(255,255,255,.03)',
                border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 6,
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: 'rgba(91,240,165,.7)',
                  fontWeight: 700,
                }}>{val}</span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: 'rgba(255,255,255,.2)',
                }}>{lbl}</span>
              </div>
            ))}
          </div>

          <div style={{
            height: 1,
            background: 'linear-gradient(90deg, rgba(91,240,165,.15) 0%, rgba(91,240,165,.03) 60%, transparent 100%)',
            marginBottom: 40,
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
                  fontSize: 8,
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
                fontSize: 20,
                color: 'rgba(255,255,255,.88)',
                marginBottom: 10,
                letterSpacing: -.4,
              }}>{f.name}</div>

              {/* Description */}
              <p style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10.5,
                color: 'rgba(255,255,255,.3)',
                lineHeight: 1.75,
                margin: '0 0 14px',
              }}>{f.desc}</p>

              {/* Meta */}
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 8.5,
                color: 'rgba(255,255,255,.17)',
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
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'rgba(255,255,255,.5)',
                    }}>{s.v}</div>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 7,
                      color: 'rgba(255,255,255,.18)',
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
                fontSize: 9,
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
          fontSize: 8.5,
          color: 'rgba(255,255,255,.1)',
          letterSpacing: '1px',
        }}>
          RESCUEGRID v0.1&nbsp;&nbsp;·&nbsp;&nbsp;BACKEND: cd backend && uvicorn api:app --reload
        </div>
      </div>
    </>
  );
}
