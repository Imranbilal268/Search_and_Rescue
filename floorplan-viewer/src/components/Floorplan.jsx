import { useMemo } from "react";

import { CELL_STYLES } from './fileUpload'
// CELL_STYLES is the single source of truth — defined in FileUpload.jsx and
// used here so the legend swatches and the rendered cells always match.

const CELL_SIZE = 40; // px per grid cell
const PADDING   = 20; // px around the grid

// ─── Individual cell renderers ────────────────────────────────────────────────

function WallCell({ x, y, size }) {
  const s = CELL_STYLES.wall;
  return (
    <rect
      x={x} y={y} width={size} height={size}
      fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
    />
  );
}

function FloorCell({ x, y, size }) {
  const s = CELL_STYLES.floor;
  return (
    <rect
      x={x} y={y} width={size} height={size}
      fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
    />
  );
}

function DoorCell({ x, y, size }) {
  // Draw as a floor base + a contrasting door-coloured bar on one edge
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill={CELL_STYLES.floor.fill} stroke="#ddd" strokeWidth={0.5} />
      <rect x={x + size * 0.1} y={y + size * 0.35} width={size * 0.8} height={size * 0.3}
        fill={CELL_STYLES.door.fill} stroke={CELL_STYLES.door.stroke} strokeWidth={1} rx={2} />
    </g>
  );
}

function StairwellCell({ x, y, size }) {
  const s = CELL_STYLES.stairwell;
  const steps = 4;
  const stepH = size / steps;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />
      {/* Horizontal step lines */}
      {Array.from({ length: steps - 1 }, (_, i) => (
        <line
          key={i}
          x1={x} y1={y + stepH * (i + 1)}
          x2={x + size} y2={y + stepH * (i + 1)}
          stroke={s.stroke} strokeWidth={0.75}
        />
      ))}
      {/* Diagonal arrow hint */}
      <line x1={x + size * 0.2} y1={y + size * 0.8} x2={x + size * 0.8} y2={y + size * 0.2}
        stroke={s.stroke} strokeWidth={1} strokeDasharray="2,2" />
    </g>
  );
}

function WindowCell({ x, y, size }) {
  const s = CELL_STYLES.window;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />
      {/* Pane cross */}
      <line x1={x + size / 2} y1={y + 4} x2={x + size / 2} y2={y + size - 4}
        stroke={s.stroke} strokeWidth={1} />
      <line x1={x + 4} y1={y + size / 2} x2={x + size - 4} y2={y + size / 2}
        stroke={s.stroke} strokeWidth={1} />
    </g>
  );
}

function ElevatorCell({ x, y, size }) {
  const s = CELL_STYLES.elevator;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const arrowH = size * 0.2;
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />
      {/* Up arrow */}
      <polyline
        points={`${cx},${cy - arrowH * 0.2} ${cx - arrowH * 0.5},${cy + arrowH * 0.4} ${cx + arrowH * 0.5},${cy + arrowH * 0.4}`}
        fill={s.stroke} stroke="none"
        transform={`translate(0, ${-arrowH * 0.8})`}
      />
      {/* Down arrow */}
      <polyline
        points={`${cx},${cy + arrowH * 0.2} ${cx - arrowH * 0.5},${cy - arrowH * 0.4} ${cx + arrowH * 0.5},${cy - arrowH * 0.4}`}
        fill={s.stroke} stroke="none"
        transform={`translate(0, ${arrowH * 0.8})`}
      />
    </g>
  );
}

function HazardCell({ x, y, size }) {
  const s = CELL_STYLES.hazard;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r  = size * 0.35;
  // Triangle warning shape
  const pts = [
    `${cx},${cy - r}`,
    `${cx + r * 0.866},${cy + r * 0.5}`,
    `${cx - r * 0.866},${cy + r * 0.5}`,
  ].join(" ");
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth} />
      <polygon points={pts} fill="#f59e0b" stroke="#92400e" strokeWidth={1} />
      <text x={cx} y={cy + r * 0.35} textAnchor="middle" fontSize={size * 0.3} fontWeight="bold" fill="#92400e">!</text>
    </g>
  );
}

function EmptyCell() {
  return null;
}

// ─── Cell dispatcher ──────────────────────────────────────────────────────────

function Cell({ type, col, row, size }) {
  const x = PADDING + col * size;
  const y = PADDING + row * size;

  switch (type) {
    case "wall":      return <WallCell      x={x} y={y} size={size} />;
    case "floor":     return <FloorCell     x={x} y={y} size={size} />;
    case "door":      return <DoorCell      x={x} y={y} size={size} />;
    case "stairwell": return <StairwellCell x={x} y={y} size={size} />;
    case "window":    return <WindowCell    x={x} y={y} size={size} />;
    case "elevator":  return <ElevatorCell  x={x} y={y} size={size} />;
    case "hazard":    return <HazardCell    x={x} y={y} size={size} />;
    case "empty":
    default:          return <EmptyCell />;
  }
}

// ─── Legend ───────────────────────────────────────────────────────────────────
// Derived automatically from CELL_STYLES so it never goes out of sync.

function Legend() {
  return (
    <div style={styles.legend}>
      {Object.entries(CELL_STYLES).map(([type, s]) => (
        <div key={type} style={styles.legendItem}>
          <svg width={16} height={16}>
            <rect
              x={1} y={1} width={14} height={14}
              fill={s.fill === "transparent" ? "#eee" : s.fill}
              stroke={s.stroke === "none" ? "#ccc" : s.stroke}
              strokeWidth={1}
              rx={1}
            />
          </svg>
          <span style={styles.legendLabel}>{type}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main FloorPlan component ─────────────────────────────────────────────────

export default function FloorPlan({ grid }) {
  // grid is a 2D array: grid[y][x]

  const { rows, cols, svgWidth, svgHeight } = useMemo(() => {
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;
    return {
      rows,
      cols,
      svgWidth:  cols * CELL_SIZE + PADDING * 2,
      svgHeight: rows * CELL_SIZE + PADDING * 2,
    };
  }, [grid]);

  return (
    <div style={styles.container}>
      {/* Scrollable SVG canvas */}
      <div style={styles.canvasWrapper}>
        <svg
          width={svgWidth}
          height={svgHeight}
          style={styles.svg}
          xmlns="http://www.w3.org/2000/svg"
        >
          {grid.map((row, y) =>
            row.map((cellType, x) => (
              <Cell
                key={`${y}-${x}`}
                type={cellType}
                col={x}
                row={y}
                size={CELL_SIZE}
              />
            ))
          )}
        </svg>
      </div>

      <Legend />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
    width: "100%",
  },
  canvasWrapper: {
    overflow: "auto",
    maxWidth: "100%",
    border: "1px solid #ccc",
    borderRadius: "8px",
    backgroundColor: "#fafafa",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  svg: {
    display: "block",
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.75rem 1.5rem",
    padding: "0.75rem 1.25rem",
    backgroundColor: "#fff",
    border: "1px solid #ddd",
    borderRadius: "8px",
    maxWidth: "600px",
    width: "100%",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  legendLabel: {
    fontSize: "0.8rem",
    color: "#444",
  },
};