"""
generate_viz.py — Export simulation data for the RescueGrid visualizer.

Run this once to produce viz_data.json, then open viz.html in a browser.

Usage:
    cd phase0
    python3 generate_viz.py
    open viz.html          # macOS
    xdg-open viz.html      # Linux
    start viz.html         # Windows
"""

import json
import math
import random
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from compiler   import build_test_building
from graph      import build_graph
from simulation import run_simulation


def make_serializable(obj):
    """Recursively convert non-JSON-serializable objects."""
    if isinstance(obj, dict):
        return {k: make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [make_serializable(v) for v in obj]
    if isinstance(obj, float) and math.isinf(obj):
        return None   # JSON doesn't support Infinity — JS treats null as ∞
    if isinstance(obj, float) and math.isnan(obj):
        return None
    return obj


def main():
    print("RescueGrid — Generating visualizer data...")
    print()

    # ── Build building and run simulation ─────────────────────────────────────
    print("  Compiling building...")
    building, scenario = build_test_building()
    meta = building["meta"]
    print(f"  Building: {meta['floors']} floors, {meta['width']}×{meta['height']} cells")

    print("  Building graph...")
    graph, vert_conn_map = build_graph(building, scenario.get("simulation_config"))
    print(f"  Graph: {len(graph)} nodes, {sum(len(v) for v in graph.values())} edges")

    print("  Running simulation (seed=42)...")
    rng = random.Random(42)
    states = run_simulation(building, scenario, rng)
    print(f"  Simulation: {len(states)} turns, status={states[-1]['status']}")

    # ── Assemble export ────────────────────────────────────────────────────────
    # Convert states: positions are tuples in Python, need to be lists for JSON
    def fix_state(s):
        """Convert all tuple coordinates to lists."""
        def fix(obj):
            if isinstance(obj, tuple):
                return list(obj)
            if isinstance(obj, dict):
                return {k: fix(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [fix(v) for v in obj]
            return obj
        return fix(s)

    fixed_states = [fix_state(s) for s in states]

    export = {
        "meta":                building["meta"],
        "floor_labels":        building["floor_labels"],
        "grid":                building["grid"],
        "cell_properties":     building["cell_properties"],
        "vertical_connections": building["vertical_connections"],
        "exit_nodes":          building["exit_nodes"],
        "scenario":            scenario,
        "states":              fixed_states,
    }

    # Make fully JSON-serializable (handle Infinity from urgency scores etc.)
    export = make_serializable(export)

    # ── Write file ─────────────────────────────────────────────────────────────
    out_path = os.path.join(os.path.dirname(__file__), "viz_data.json")
    with open(out_path, "w") as f:
        json.dump(export, f, separators=(',', ':'))

    size_kb = os.path.getsize(out_path) / 1024
    print(f"  Written: viz_data.json ({size_kb:.1f} KB)")
    print()
    print("  ✓ Done. Open viz.html in your browser.")
    print()
    print("  Keyboard shortcuts in the visualizer:")
    print("    Space       — play / pause")
    print("    ← →         — step back / forward one turn")
    print("    0 / 1 / 2   — switch floor")
    print()

    # Print a quick summary of what the visualizer will show
    print("  Simulation summary:")
    fire_peak = max(len(s["threat_state"]["consumed_nodes"]) for s in fixed_states)
    events_by_type = {}
    for s in fixed_states:
        for e in s["events"]:
            events_by_type[e["type"]] = events_by_type.get(e["type"], 0) + 1
    print(f"    Peak fire spread:  {fire_peak} nodes consumed")
    print(f"    Final status:      {fixed_states[-1]['status']}")
    print(f"    Event breakdown:")
    for t, c in sorted(events_by_type.items()):
        print(f"      {t:<30} {c}")


if __name__ == "__main__":
    main()
