# Search & Rescue
> Simulate emergency response scenarios in multi-floor buildings — before anyone ever sets foot inside.

**Live Demo:** [https://search-and-rescue-1.onrender.com/](https://search-and-rescue-1.onrender.com/)
Note: We have taken down the generate AI summary of the simulation due to errors with applying credits, otherwise everything works.

Search & Rescue lets you construct a precise, multi-floor building model and run AI-driven rescue simulations against it. Drop in responders, place victims, add hazard zones, and watch the backend calculate optimal extraction paths in real time.

---

## Features

### Building Import & Editor
Load any building from a structured JSON format — supporting rich schemas with room labels, door properties, and cell metadata, or a simple flat grid. A library of pre-built archetypes (apartments, hospitals, warehouses, schools) gets you started in seconds. For custom layouts, a cell-by-cell paint editor lets you draw walls, floors, windows, doors, and stairwells with drag-to-fill precision.

### 2D Floor Plan Viewer
A crisp, color-coded SVG floor plan renders every cell type instantly — walls, floors, doors, windows, stairwells, and hazard zones each in a distinct color with a live legend. Multi-floor buildings are navigated via a floor tab strip, with smooth scroll-wheel zoom and responsive scaling.

### 3D Building Visualizer
Switch to the 3D tab and the same building comes to life in an interactive WebGL model. The 3D view receives the full building data and simulation results, letting responders walk through the space spatially before entering.

### Rescue Simulation Engine
Backed by a FastAPI server, the engine runs a turn-by-turn rescue simulation. Place responders and victims at any grid coordinate on any floor, define hazard zones, and hit **Run** — the backend computes movement, extraction routes, and outcomes for every turn. Scrub through results with a timeline slider showing each turn's status from dispatch to rescue or failure.

### Agent Placement
A dedicated Rescuers & Victims panel lets operators place agents with precise x/y/floor coordinates and custom labels — no JSON editing required. Every agent feeds directly into the simulation payload.

---

## Getting Started

### Prerequisites
- Python 3.x
- Node.js v25.8.1+

### 1. Clone the repository
```bash
git clone https://github.com/your-username/Search_and_Rescue.git
cd Search_and_Rescue
```

### 2. Start the backend
```bash
cd backend
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```
> If port 8000 is already in use, stop the existing process before running.

### 3. Start the frontend
Open a new terminal:
```bash
cd floorplan-viewer
nvm install node        # if using Node Version Manager
node -v                 # should be v25.8.1 or later
npm install
npm run dev
```

The app will be available at **http://localhost:5173** (or whichever port Vite assigns).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite |
| 2D Rendering | SVG |
| 3D Rendering | WebGL |
| Backend | FastAPI (Python) |
| Data Format | JSON |
