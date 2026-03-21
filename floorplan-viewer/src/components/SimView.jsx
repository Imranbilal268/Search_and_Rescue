// SimView.jsx
// Renders BuildingVisualizer.html as a full-page iframe.
// The file must be placed in the public/ folder of your React project:
//   public/BuildingVisualizer.html

export default function SimView() {
    return (
      <div style={styles.wrapper}>
        <iframe
          src="../../public/BuildingVisualizer.html"
          style={styles.iframe}
          title="3D Building Visualizer"
          allowFullScreen
        />
      </div>
    );
  }
  
  const styles = {
    wrapper: {
      width:    "100%",
      flex:     1,
      display:  "flex",
      flexDirection: "column",
      minHeight: 0,
    },
    iframe: {
      width:   "100%",
      flex:    1,
      border:  "none",
      display: "block",
      minHeight: "80vh",
    },
  };