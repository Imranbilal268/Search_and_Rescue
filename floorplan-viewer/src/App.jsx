import { useState, useEffect } from "react";
import EditorShell from "./components/EditorShell";
import HomePage from "./pages/HomePage";
import SimulationPage from "./pages/SimulationPage";

function readStoredJson() {
  try {
    const s = localStorage.getItem('rescuegrid_current_json');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export default function App() {
  const [view, setView] = useState(() => {
    // Support hash-based navigation from standalone pages (e.g. BuildingEditor → /#scenario)
    const hash = window.location.hash.slice(1);
    if (hash === 'scenario') return 'floorplan';
    if (hash === 'simulation') return 'simulation';
    return 'home';
  });
  const [sharedJson, setSharedJson] = useState(() => readStoredJson());

  // Clear hash from URL after reading it
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Pick up JSON left by the standalone BuildingEditor when we return home
  useEffect(() => {
    if (view === 'home') {
      const json = readStoredJson();
      if (json) setSharedJson(json);
    }
  }, [view]);

  const updateSharedJson = (json) => {
    setSharedJson(json);
    try {
      if (json) localStorage.setItem('rescuegrid_current_json', JSON.stringify(json));
    } catch {}
  };

  if (view === 'home') return <HomePage onNavigate={setView} />;

  if (view === 'simulation') return (
    <SimulationPage
      onBack={() => setView('home')}
      onNavigate={setView}
      initialJson={sharedJson}
      onJsonChange={updateSharedJson}
    />
  );

  // Scenario Builder (floorplan view) — EditorShell owns its own full-page topbar
  return (
    <EditorShell
      initialJson={sharedJson}
      onJsonChange={updateSharedJson}
      onBack={() => setView('home')}
      onNavigate={setView}
    />
  );
}
