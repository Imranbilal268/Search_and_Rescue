// FloorToggle.jsx
// Renders one button per floor (z-axis index).
// Props:
//   count    {number}   — total number of floors
//   active   {number}   — index of the currently visible floor
//   onChange {function} — called with the new index when a button is clicked

export default function FloorToggle({ count, active, onChange }) {
    if (!count || count === 0) return null;
  
    return (
      <div style={styles.wrapper}>
        <span style={styles.label}>Floor</span>
  
        <div style={styles.buttonRow}>
          {Array.from({ length: count }, (_, i) => {
            const isActive = i === active;
            return (
              <button
                key={i}
                onClick={() => onChange(i)}
                style={{
                  ...styles.btn,
                  ...(isActive ? styles.btnActive : styles.btnIdle),
                }}
                title={`Switch to Floor ${i + 1}`}
                aria-pressed={isActive}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
  
        {/* Small readout showing which floor is active */}
        <span style={styles.readout}>
          Viewing floor {active + 1} of {count}
        </span>
      </div>
    );
  }
  
  // ─── Styles ───────────────────────────────────────────────────────────────────
  
  const styles = {
    wrapper: {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      padding: "0.6rem 1rem",
      backgroundColor: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "10px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      width: "100%",
      maxWidth: "900px",
      flexWrap: "wrap",
    },
    label: {
      fontSize: "0.8rem",
      fontWeight: "600",
      color: "#888",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      flexShrink: 0,
    },
    buttonRow: {
      display: "flex",
      flexWrap: "wrap",
      gap: "0.4rem",
      flex: 1,
    },
    btn: {
      width: "36px",
      height: "36px",
      border: "1px solid",
      borderRadius: "6px",
      fontSize: "0.85rem",
      fontWeight: "600",
      cursor: "pointer",
      transition: "background-color 0.15s, color 0.15s, border-color 0.15s",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
    },
    btnIdle: {
      backgroundColor: "rgba(255,255,255,0.06)",
      borderColor: "rgba(255,255,255,0.12)",
      color: "#aaa",
    },
    btnActive: {
      backgroundColor: "#5bf0a5",
      borderColor: "#5bf0a5",
      color: "#0a0a0f",
    },
    readout: {
      fontSize: "0.78rem",
      color: "rgba(255,255,255,0.35)",
      flexShrink: 0,
      marginLeft: "auto",
    },
  };