import { useRef, useState, useCallback, useEffect } from "react";
import GridView from "./GridView";
import { CELL_STYLES } from "./CellStyles";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — must stay in sync with FloorPlan.jsx
// ─────────────────────────────────────────────────────────────────────────────

const CELL_SIZE = 40;
const PADDING   = 20;

export default function FloorCanvas({
  grid,
  floorIndex,
  roomLabels,
  cellProperties,
  stamps,
  gridWidth,
  gridHeight,
  selectedType,
  onCellPaint,
  onStampRemove,
}) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  // scrollRef  → the outer scrollable container (getBoundingClientRect for offset)
  // innerRef   → the exact-size inner div (fixed at canvasW × canvasH)
  const scrollRef  = useRef(null);
  const isPainting = useRef(false);

  const [hoverCell, setHoverCell] = useState(null);

  // ── Pixel dimensions — the inner canvas is always this exact size ─────────
  const canvasW = gridWidth  * CELL_SIZE + PADDING * 2;
  const canvasH = gridHeight * CELL_SIZE + PADDING * 2;

  // ── Convert mouse event → grid cell ──────────────────────────────────────
  // Uses the outer scroll container's bounding rect + scroll offset so the
  // math is correct regardless of where the component sits on the page.
  const eventToCell = useCallback((e) => {
    const el = scrollRef.current;
    if (!el) return null;
    const rect   = el.getBoundingClientRect();
    // position relative to the inner canvas top-left, accounting for scroll
    const px = e.clientX - rect.left  + el.scrollLeft  - PADDING;
    const py = e.clientY - rect.top   + el.scrollTop   - PADDING;
    const col = Math.floor(px / CELL_SIZE);
    const row = Math.floor(py / CELL_SIZE);
    if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) return null;
    return { col, row };
  }, [gridWidth, gridHeight]);

  // ── Paint ──────────────────────────────────────────────────────────────────
  const paintAt = useCallback((e) => {
    if (!selectedType) return;
    const cell = eventToCell(e);
    if (!cell) return;
    onCellPaint(selectedType, cell.col, cell.row);
  }, [selectedType, eventToCell, onCellPaint]);

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    isPainting.current = true;
    paintAt(e);
  }, [paintAt]);

  const handleMouseMove = useCallback((e) => {
    const cell = eventToCell(e);
    setHoverCell(cell);
    if (isPainting.current) paintAt(e);
  }, [eventToCell, paintAt]);

  const handleMouseUp   = useCallback(() => { isPainting.current = false; }, []);
  const handleMouseLeave = useCallback(() => { isPainting.current = false; setHoverCell(null); }, []);

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  // ── Right-click erases ────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const cell = eventToCell(e);
    if (!cell) return;
    const target = stamps.find(s => s.x === cell.col && s.y === cell.row);
    if (target) onStampRemove(target.id);
  }, [eventToCell, stamps, onStampRemove]);

  // ── Drag-drop from palette ────────────────────────────────────────────────
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("stampType");
    if (!type) return;
    const cell = eventToCell(e);
    if (!cell) return;
    onCellPaint(type, cell.col, cell.row);
  }, [eventToCell, onCellPaint]);

  // ── Hover highlight colour ────────────────────────────────────────────────
  const hoverColor = selectedType
    ? (CELL_STYLES[selectedType]?.fill ?? "#ccc")
    : "rgba(0,0,0,0.1)";

  return (
    <div style={styles.wrapper}>

      {/* Hint bar */}
      <div style={styles.hint}>
        {selectedType
          ? <>Painting <strong>{selectedType}</strong> — drag to fill · right-click to erase</>
          : <>Select a stamp type from the palette, then drag to paint</>}
      </div>

      {/* Outer scroll container — fills available flex space */}
      <div
        ref={scrollRef}
        style={{
          ...styles.scrollContainer,
          cursor: selectedType ? "crosshair" : "default",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Inner canvas — always exactly canvasW × canvasH pixels
            The SVG inside GridView fills this div 1-to-1, so CELL_SIZE math is exact */}
        <div style={{ position: "relative", width: canvasW, height: canvasH, flexShrink: 0 }}>

          {/* Layer 1: compiled grid */}
          <div style={styles.gridLayer}>
            <GridView
              grid={grid}
              floorIndex={floorIndex}
              roomLabels={roomLabels}
              cellProperties={cellProperties}
              exactWidth={canvasW}
              exactHeight={canvasH}
            />
          </div>

          {/* Layer 2: hover highlight */}
          {hoverCell && selectedType && (
            <div style={{
              position:        "absolute",
              left:            PADDING + hoverCell.col * CELL_SIZE,
              top:             PADDING + hoverCell.row * CELL_SIZE,
              width:           CELL_SIZE,
              height:          CELL_SIZE,
              backgroundColor: hoverColor,
              opacity:         0.45,
              pointerEvents:   "none",
              borderRadius:    "2px",
              border:          "2px solid rgba(0,0,0,0.25)",
              boxSizing:       "border-box",
            }} />
          )}
        </div>
      </div>

      <div style={styles.footer}>
        {stamps.length} cell{stamps.length !== 1 ? "s" : ""} placed on this floor
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display:       "flex",
    flexDirection: "column",
    alignItems:    "flex-start",
    gap:           "0.5rem",
    flex:          1,
    minWidth:      0,
  },
  hint: {
    fontSize:        "0.78rem",
    color:           "#666",
    backgroundColor: "#fff",
    border:          "1px solid #e5e7eb",
    borderRadius:    "6px",
    padding:         "0.3rem 0.75rem",
  },
  scrollContainer: {
    overflow:        "auto",
    flex:            1,
    width:           "100%",
    minHeight:       "60vh",
    border:          "1px solid #ccc",
    borderRadius:    "8px",
    backgroundColor: "#fafafa",
    boxShadow:       "0 2px 8px rgba(0,0,0,0.08)",
    userSelect:      "none",
  },
  gridLayer: {
    position:      "absolute",
    top:           0,
    left:          0,
    width:         "100%",
    height:        "100%",
    pointerEvents: "none",
  },
  footer: {
    fontSize: "0.72rem",
    color:    "#aaa",
  },
};