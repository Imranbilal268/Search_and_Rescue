import { STAMP_META, STAMP_TYPES, AREA_STAMPS } from "./Stamptypes";
import { CELL_STYLES } from "./CellStyles";

// ─────────────────────────────────────────────────────────────────────────────
// StampPalette
//
// A sidebar showing one draggable button per stamp type.
// Uses the HTML5 drag API — onDragStart writes the stamp type into
// dataTransfer so FloorCanvas can read it on drop.
//
// Props:
//   selectedType  {string|null}  — the currently active stamp type
//   onSelect      {function}     — called with type when a button is clicked
//                                  (allows click-to-place as well as drag)
// ─────────────────────────────────────────────────────────────────────────────

export default function StampPalette({ selectedType, onSelect }) {
  function handleDragStart(e, type) {
    e.dataTransfer.setData("stampType", type);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <aside style={styles.sidebar}>
      <p style={styles.heading}>Stamps</p>

      <div style={styles.list}>
        {Object.values(STAMP_TYPES).map((type) => {
          const meta     = STAMP_META[type];
          const color    = CELL_STYLES[type] ?? CELL_STYLES.floor;
          const isActive = type === selectedType;

          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => handleDragStart(e, type)}
              onClick={() => onSelect(type === selectedType ? null : type)}
              style={{
                ...styles.stampBtn,
                borderColor:     isActive ? "#2563eb" : color.stroke,
                backgroundColor: isActive ? "#eff6ff" : color.fill,
                boxShadow:       isActive ? "0 0 0 2px #93c5fd" : "none",
              }}
              title={meta.description}
            >
              {/* Colour swatch */}
              <span style={styles.swatch}>
                <svg width={14} height={14}>
                  <rect x={1} y={1} width={12} height={12}
                    fill={color.fill} stroke={color.stroke} strokeWidth={1.5} rx={2} />
                </svg>
              </span>

              {/* Label + description */}
              <div style={styles.stampText}>
                <span style={styles.stampLabel}>{meta.icon} {meta.label}</span>
                <span style={styles.stampDesc}>
                  {AREA_STAMPS.has(type) ? "area" : "point"} · {meta.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hint */}
      <p style={styles.hint}>
        Drag onto the canvas, or click to select then click a cell.
      </p>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  sidebar: {
    display:         "flex",
    flexDirection:   "column",
    gap:             "0.5rem",
    width:           "180px",
    flexShrink:      0,
    backgroundColor: "#fff",
    border:          "1px solid #ddd",
    borderRadius:    "10px",
    padding:         "0.75rem",
    alignSelf:       "flex-start",
    boxShadow:       "0 1px 4px rgba(0,0,0,0.06)",
  },
  heading: {
    fontSize:    "0.7rem",
    fontWeight:  "700",
    color:       "#888",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin:      0,
  },
  list: {
    display:       "flex",
    flexDirection: "column",
    gap:           "0.35rem",
  },
  stampBtn: {
    display:       "flex",
    alignItems:    "center",
    gap:           "0.45rem",
    padding:       "0.45rem 0.6rem",
    border:        "1.5px solid",
    borderRadius:  "7px",
    cursor:        "grab",
    userSelect:    "none",
    transition:    "box-shadow 0.12s, background-color 0.12s",
  },
  swatch: {
    flexShrink: 0,
    lineHeight: 0,
  },
  stampText: {
    display:       "flex",
    flexDirection: "column",
    gap:           "0.1rem",
    minWidth:      0,
  },
  stampLabel: {
    fontSize:   "0.78rem",
    fontWeight: "600",
    color:      "#222",
    whiteSpace: "nowrap",
  },
  stampDesc: {
    fontSize:     "0.62rem",
    color:        "#888",
    whiteSpace:   "nowrap",
    overflow:     "hidden",
    textOverflow: "ellipsis",
  },
  hint: {
    fontSize:  "0.65rem",
    color:     "#aaa",
    margin:    "0.25rem 0 0 0",
    lineHeight: 1.4,
  },
};