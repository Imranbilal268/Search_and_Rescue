import { useMemo } from "react";
import { CELL_STYLES } from "./CellStyles";

// ─────────────────────────────────────────────────────────────────────────────
// Props:
//   grid           {string[][]}  — 2-D array for the active floor: grid[y][x]
//   floorIndex     {number}      — current z value (for filtering labels)
//   roomLabels     {object}      — { "x,y,z": "Room name" }
//   cellProperties {object}      — { "x,y,z": { label, ... } }
// ─────────────────────────────────────────────────────────────────────────────

const CELL_SIZE = 40;
const PADDING   = 20;

// ─────────────────────────────────────────────────────────────────────────────
// CELL RENDERERS
// ─────────────────────────────────────────────────────────────────────────────

function WallCell({ x, y, size }) {
  const c = CELL_STYLES.wall;
  return <rect x={x} y={y} width={size} height={size} fill={c.fill} stroke={c.stroke} strokeWidth={1} />;
}

function FloorCell({ x, y, size }) {
  const c = CELL_STYLES.floor;
  return <rect x={x} y={y} width={size} height={size} fill={c.fill} stroke={c.stroke} strokeWidth={0.5} />;
}

function DoorCell({ x, y, size }) {
  const c  = CELL_STYLES.door;
  const fc = CELL_STYLES.floor;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill={fc.fill} stroke={fc.stroke} strokeWidth={0.5} />
      <rect x={x + size*0.1} y={y + size*0.35} width={size*0.8} height={size*0.3}
        fill={c.fill} stroke={c.stroke} strokeWidth={1} rx={2} />
    </g>
  );
}

function StairCell({ x, y, size }) {
  const c     = CELL_STYLES.stair;
  const steps = 4;
  const stepH = size / steps;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill={c.fill} stroke={c.stroke} strokeWidth={1} />
      {Array.from({ length: steps - 1 }, (_, i) => (
        <line key={i} x1={x} y1={y + stepH*(i+1)} x2={x+size} y2={y + stepH*(i+1)}
          stroke={c.stroke} strokeWidth={0.75} />
      ))}
      <line x1={x + size*0.2} y1={y + size*0.8} x2={x + size*0.8} y2={y + size*0.2}
        stroke={c.stroke} strokeWidth={1} strokeDasharray="2,2" />
    </g>
  );
}

// keep "stairwell" as alias
function StairwellCell({ x, y, size }) {
  return <StairCell x={x} y={y} size={size} />;
}

function WindowCell({ x, y, size }) {
  const c = CELL_STYLES.window;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill={c.fill} stroke={c.stroke} strokeWidth={1} />
      <line x1={x + size/2} y1={y+4}       x2={x + size/2} y2={y + size-4} stroke={c.stroke} strokeWidth={1} />
      <line x1={x+4}        y1={y + size/2} x2={x + size-4} y2={y + size/2} stroke={c.stroke} strokeWidth={1} />
    </g>
  );
}

function ElevatorCell({ x, y, size }) {
  const c  = CELL_STYLES.elevator;
  const cx = x + size/2, cy = y + size/2, a = size*0.2;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill={c.fill} stroke={c.stroke} strokeWidth={1} />
      <polyline points={`${cx},${cy-a*0.2} ${cx-a*0.5},${cy+a*0.4} ${cx+a*0.5},${cy+a*0.4}`}
        fill={c.stroke} stroke="none" transform={`translate(0,${-a*0.8})`} />
      <polyline points={`${cx},${cy+a*0.2} ${cx-a*0.5},${cy-a*0.4} ${cx+a*0.5},${cy-a*0.4}`}
        fill={c.stroke} stroke="none" transform={`translate(0,${a*0.8})`} />
    </g>
  );
}

function HazardCell({ x, y, size }) {
  const c  = CELL_STYLES.hazard;
  const cx = x + size/2, cy = y + size/2, r = size*0.35;
  const pts = [`${cx},${cy-r}`, `${cx+r*0.866},${cy+r*0.5}`, `${cx-r*0.866},${cy+r*0.5}`].join(" ");
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill={c.fill} stroke={c.stroke} strokeWidth={1} />
      <polygon points={pts} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
      <text x={cx} y={cy + r*0.35} textAnchor="middle" fontSize={size*0.3} fontWeight="bold" fill={c.stroke}>!</text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CELL DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

function Cell({ type, col, row, size }) {
  const x = PADDING + col * size;
  const y = PADDING + row * size;
  switch (type) {
    case "wall":      return <WallCell      x={x} y={y} size={size} />;
    case "floor":     return <FloorCell     x={x} y={y} size={size} />;
    case "door":      return <DoorCell      x={x} y={y} size={size} />;
    case "stair":     return <StairCell     x={x} y={y} size={size} />;
    case "stairwell": return <StairwellCell x={x} y={y} size={size} />;
    case "window":    return <WindowCell    x={x} y={y} size={size} />;
    case "elevator":  return <ElevatorCell  x={x} y={y} size={size} />;
    case "hazard":    return <HazardCell    x={x} y={y} size={size} />;
    case "empty":
    default:          return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOM LABEL — rendered once per entry in room_labels for this floor
// Positioned at the centre of the labelled cell, text wraps if long
// ─────────────────────────────────────────────────────────────────────────────

function RoomLabel({ col, row, size, text }) {
  const cx = PADDING + col * size + size / 2;
  const cy = PADDING + row * size + size / 2;

  // Split into two lines if the label has a space and is longer than 10 chars
  const words  = text.split(" ");
  const lines  = [];
  let   current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > 9 && current) {
      lines.push(current.trim());
      current = w;
    } else {
      current = current ? current + " " + w : w;
    }
  }
  if (current) lines.push(current.trim());

  const lineH    = 7.5;
  const totalH   = lines.length * lineH;
  const startY   = cy - totalH / 2 + lineH * 0.75;

  return (
    <g pointerEvents="none">
      {lines.map((line, i) => (
        <text key={i}
          x={cx} y={startY + i * lineH}
          textAnchor="middle"
          fontSize={6.5}
          fontWeight="600"
          fontFamily="sans-serif"
          fill="#1e3a5f"
          opacity={0.85}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CELL PROPERTY LABEL — small label on special cells (doors, windows, stairs)
// Rendered as a tiny italic tag just inside the cell
// ─────────────────────────────────────────────────────────────────────────────

function CellLabel({ col, row, size, text }) {
  const x  = PADDING + col * size + size / 2;
  const y  = PADDING + row * size + size - 5;
  // Truncate long labels
  const display = text.length > 14 ? text.slice(0, 13) + "…" : text;
  return (
    <text
      x={x} y={y}
      textAnchor="middle"
      fontSize={5.5}
      fontStyle="italic"
      fontFamily="sans-serif"
      fill="#333"
      opacity={0.9}
      pointerEvents="none"
    >
      {display}
    </text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGEND
// ─────────────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={styles.legend}>
      {Object.entries(CELL_STYLES).map(([type, c]) => (
        <div key={type} style={styles.legendItem}>
          <svg width={16} height={16}>
            <rect x={1} y={1} width={14} height={14}
              fill={c.fill} stroke={c.stroke} strokeWidth={1} rx={1} />
          </svg>
          <span style={styles.legendLabel}>{type}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLOORPLAN — default export
// ─────────────────────────────────────────────────────────────────────────────

export default function FloorPlan({ grid, floorIndex = 0, roomLabels = {}, cellProperties = {} }) {
  const { svgWidth, svgHeight } = useMemo(() => ({
    svgWidth:  (grid[0]?.length ?? 0) * CELL_SIZE + PADDING * 2,
    svgHeight: grid.length            * CELL_SIZE + PADDING * 2,
  }), [grid]);

  // ── Filter labels for this floor ─────────────────────────────────────────
  // Keys are "x,y,z" — we only want entries where z === floorIndex
  const floorRoomLabels = useMemo(() => {
    const out = {};
    Object.entries(roomLabels).forEach(([key, label]) => {
      const [x, y, z] = key.split(",").map(Number);
      if (z === floorIndex) out[`${x},${y}`] = label;
    });
    return out;
  }, [roomLabels, floorIndex]);

  const floorCellProps = useMemo(() => {
    const out = {};
    Object.entries(cellProperties).forEach(([key, props]) => {
      const [x, y, z] = key.split(",").map(Number);
      if (z === floorIndex) out[`${x},${y}`] = props;
    });
    return out;
  }, [cellProperties, floorIndex]);

  return (
    <div style={styles.container}>
      <div style={styles.canvasWrapper}>
        <svg width={svgWidth} height={svgHeight} style={{ display: "block" }}>

          {/* ── Tile layer ── */}
          {grid.map((row, y) =>
            row.map((type, x) => (
              <Cell key={`tile-${y}-${x}`} type={type} col={x} row={y} size={CELL_SIZE} />
            ))
          )}

          {/* ── Room label layer ── */}
          {Object.entries(floorRoomLabels).map(([key, label]) => {
            const [x, y] = key.split(",").map(Number);
            return (
              <RoomLabel key={`room-${key}`} col={x} row={y} size={CELL_SIZE} text={label} />
            );
          })}

          {/* ── Cell property label layer (doors, windows, stairs) ── */}
          {Object.entries(floorCellProps).map(([key, props]) => {
            if (!props.label) return null;
            const [x, y] = key.split(",").map(Number);
            return (
              <CellLabel key={`cell-${key}`} col={x} row={y} size={CELL_SIZE} text={props.label} />
            );
          })}

        </svg>
      </div>

      <Legend />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "1rem", width: "100%",
  },
  canvasWrapper: {
    overflow: "auto", maxWidth: "100%",
    border: "1px solid #ccc", borderRadius: "8px",
    backgroundColor: "#fafafa", boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  legend: {
    display: "flex", flexWrap: "wrap", gap: "0.6rem 1.25rem",
    padding: "0.75rem 1.25rem", backgroundColor: "#fff",
    border: "1px solid #ddd", borderRadius: "8px",
    maxWidth: "600px", width: "100%",
  },
  legendItem: { display: "flex", alignItems: "center", gap: "0.4rem" },
  legendLabel: { fontSize: "0.8rem", color: "#444" },
};