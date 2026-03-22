"""
api.py — RescueGrid FastAPI server.

Endpoints:
  GET  /api/health   — health check
  POST /api/simulate — run full simulation on a rescuegrid-v1 building JSON

Usage:
  cd backend
  uvicorn api:app --reload --port 8000
"""

import math
import random
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from graph      import build_graph
from simulation import run_simulation


app = FastAPI(title="RescueGrid API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── helpers ───────────────────────────────────────────────────────────────────

def make_serializable(obj):
    """Recursively make an object JSON-safe (handles Infinity, NaN, tuples)."""
    if isinstance(obj, dict):
        return {k: make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [make_serializable(v) for v in obj]
    if isinstance(obj, float) and (math.isinf(obj) or math.isnan(obj)):
        return None
    return obj


def fix_tuples(obj):
    """Convert all tuple coordinates to lists (tuples are not JSON-serialisable)."""
    if isinstance(obj, tuple):
        return [fix_tuples(v) for v in obj]
    if isinstance(obj, dict):
        return {k: fix_tuples(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [fix_tuples(v) for v in obj]
    return obj


# ── endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/simulate")
def simulate(payload: dict):
    """
    Accept a rescuegrid-v1 JSON body, run the full simulation, and return
    the viz data that SimViz.html can consume directly.

    Expected payload shape:
      {
        "building": { "meta": {...}, "grid": [...], ... },
        "scenario": { "responders": [...], "victims": [...], "threat": {...} }
      }
    """
    try:
        building = payload.get("building")
        scenario = payload.get("scenario")

        if not building:
            raise ValueError("Missing 'building' key in request body.")
        if not scenario:
            raise ValueError("Missing 'scenario' key in request body.")

        # Auto-unwrap grid wrapped in {"layers": [...]}
        grid = building.get("grid")
        if isinstance(grid, dict) and "layers" in grid:
            building["grid"] = grid["layers"]

        # Basic validation
        if not building.get("grid"):
            raise ValueError("building.grid is required and must be a non-empty list.")
        if not scenario.get("responders"):
            raise ValueError("scenario.responders must have at least one entry.")
        if not scenario.get("victims"):
            raise ValueError("scenario.victims must have at least one entry.")
        if not scenario.get("threat"):
            raise ValueError("scenario.threat is required.")

        # Build graph and run simulation
        cfg = scenario.get("simulation_config", {})
        graph, vert_conn_map = build_graph(building, cfg)

        rng    = random.Random(42)
        states = run_simulation(building, scenario, rng)

        # Assemble the same export format as generate_viz.py
        export = make_serializable({
            "meta":                 building.get("meta", {}),
            "floor_labels":         building.get("floor_labels", {}),
            "grid":                 building["grid"],
            "cell_properties":      building.get("cell_properties", {}),
            "vertical_connections": building.get("vertical_connections", []),
            "exit_nodes":           building.get("exit_nodes", []),
            "scenario":             scenario,
            "states":               [fix_tuples(s) for s in states],
        })

        return export

    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
