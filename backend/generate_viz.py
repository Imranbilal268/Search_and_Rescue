"""
generate_viz.py — Export simulation data for the RescueGrid visualizer.

Usage
-----
# Default: uses test_building.json (original 3-floor school)
python3 generate_viz.py

# Any building JSON in rescuegrid-v1 format:
python3 generate_viz.py path/to/building.json

# Custom output file:
python3 generate_viz.py path/to/building.json path/to/output.json

# Teammate format (will auto-convert):
python3 generate_viz.py ../Floor Plans/Dorm.json

Examples
--------
python3 generate_viz.py                                  # test_building.json -> viz_data.json
python3 generate_viz.py ../Floor Plans/2Story.json      # -> viz_data.json
python3 generate_viz.py ../Floor Plans/Dorm.json        # auto-converted -> viz_data.json
python3 generate_viz.py ../Floor Plans/JPA.json out.json  # -> out.json
"""

import json
import math
import random
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from compiler   import build_test_building
from graph      import build_graph
from simulation import run_simulation


# ── helpers ────────────────────────────────────────────────────────────────────

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
    """Convert all tuple coordinates to lists (tuples are not JSON serializable)."""
    if isinstance(obj, tuple):
        return [fix_tuples(v) for v in obj]
    if isinstance(obj, dict):
        return {k: fix_tuples(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [fix_tuples(v) for v in obj]
    return obj


def validate_building(building):
    """
    Run basic sanity checks and print warnings for common problems.
    Does NOT raise — just warns so the simulation can still attempt to run.
    """
    meta = building.get("meta", {})
    F = meta.get("floors", 0)
    W = meta.get("width",  0)
    H = meta.get("height", 0)
    grid = building.get("grid", [])

    issues = []

    # Grid wrapped in {"layers": [...]}
    if isinstance(grid, dict) and "layers" in grid:
        issues.append(
            "grid is wrapped in {\"layers\": [...]} — should be a plain list. "
            "Remove the outer {\"layers\": ...} wrapper."
        )

    if isinstance(grid, list):
        if len(grid) != F:
            issues.append(f"grid has {len(grid)} floors but meta.floors={F}")
        for z, floor in enumerate(grid):
            if len(floor) != H:
                issues.append(f"floor {z} has {len(floor)} rows but meta.height={H}")
            for y, row in enumerate(floor):
                if len(row) != W:
                    issues.append(f"floor {z} row {y} has {len(row)} cols but meta.width={W}")

    # Agent positions
    scenario = building.get("_scenario", {})

    # Check stairwell VCs line up with grid cells
    for vc in building.get("vertical_connections", []):
        if vc.get("type") != "stairwell":
            continue
        x, y = vc["x"], vc["y"]
        for z in vc.get("floors", []):
            if isinstance(grid, list) and z < len(grid):
                row = grid[z]
                if y < len(row) and x < len(row[y]):
                    ct = grid[z][y][x]
                    if ct != "stairwell":
                        issues.append(
                            f"VC '{vc['id']}' declares stairwell at ({x},{y},{z}) "
                            f"but grid cell is '{ct}'"
                        )

    # Check exit nodes are on passable cells
    for en in building.get("exit_nodes", []):
        x, y, z = en["x"], en["y"], en.get("z", 0)
        if isinstance(grid, list) and z < len(grid):
            row = grid[z]
            if y < len(row) and x < len(row[y]):
                ct = grid[z][y][x]
                if ct in ("wall", "empty"):
                    issues.append(
                        f"exit_node '{en.get('id','?')}' at ({x},{y},{z}) "
                        f"is on a '{ct}' cell — unreachable"
                    )

    return issues


def load_building_json(path):
    """
    Load a building JSON file. Handles:
    - rescuegrid-v1 format (direct load)
    - teammate format without $schema (auto-converts via convert_building.py)
    - grid wrapped in {"layers": [...]} (auto-unwraps)
    """
    with open(path) as f:
        raw = json.load(f)

    # Teammate format detection: has building.{name,floors} but no building.meta
    b = raw.get("building", {})
    is_teammate_format = (
        "meta" not in b and
        "floors" in b and
        "width"  in b and
        "height" in b
    )

    if is_teammate_format:
        print(f"  Detected teammate format — auto-converting...")
        converter_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "convert_building.py")
        if not os.path.exists(converter_path):
            print("  ERROR: convert_building.py not found. Cannot auto-convert.")
            sys.exit(1)
        from convert_building import convert
        raw = convert(raw)
        b = raw["building"]
        print(f"  Converted successfully.")

    # Auto-unwrap grid.layers if present
    if isinstance(b.get("grid"), dict) and "layers" in b["grid"]:
        print("  WARNING: grid is wrapped in {\"layers\": [...]} — auto-unwrapping.")
        b["grid"] = b["grid"]["layers"]

    building = b
    scenario = raw.get("scenario", {})
    return building, scenario


def validate_scenario(building, scenario):
    """Check scenario has enough to actually run a simulation."""
    grid = building["grid"]
    issues = []
    warnings = []

    responders = scenario.get("responders", [])
    victims    = scenario.get("victims",    [])
    threat     = scenario.get("threat")

    if not responders:
        issues.append("scenario.responders is empty — add at least one responder")
    if not victims:
        issues.append("scenario.victims is empty — add at least one victim")
    if not threat:
        issues.append("scenario.threat is null — add a threat definition")

    # Check all agent positions are on passable cells
    passable = {"floor","door","stairwell","window","hazard"}
    for r in responders:
        x,y,z = r["x"], r["y"], r["z"]
        ct = grid[z][y][x]
        if ct not in passable:
            issues.append(f"Responder {r['id']} starts on '{ct}' at ({x},{y},{z}) — not passable")

    for v in victims:
        x,y,z = v["x"], v["y"], v["z"]
        ct = grid[z][y][x]
        if ct not in passable:
            issues.append(f"Victim {v['id']} starts on '{ct}' at ({x},{y},{z}) — not passable")

    if threat and threat.get("origin"):
        o = threat["origin"]
        x,y,z = o["x"], o["y"], o["z"]
        ct = grid[z][y][x]
        if ct not in passable:
            issues.append(f"Fire origin at ({x},{y},{z}) is on '{ct}' — fire cannot spread")

    return issues, warnings


# ── main ───────────────────────────────────────────────────────────────────────

def main():
    # Parse arguments
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    input_path  = args[0] if len(args) >= 1 else None
    output_path = args[1] if len(args) >= 2 else None

    print("RescueGrid — Viz Data Generator")
    print("=" * 44)

    # Load building
    if input_path:
        abs_input = os.path.abspath(input_path)
        if not os.path.exists(abs_input):
            print(f"ERROR: File not found: {abs_input}")
            sys.exit(1)
        print(f"  Input:    {abs_input}")
        building, scenario = load_building_json(abs_input)
        # Default output name derived from input filename
        if not output_path:
            stem = os.path.splitext(os.path.basename(input_path))[0]
            output_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                f"viz_data.json"
            )
    else:
        print("  Input:    test_building.json (default)")
        building, scenario = build_test_building()
        if not output_path:
            output_path = os.path.join(
                os.path.dirname(os.path.abspath(__file__)),
                "viz_data.json"
            )

    abs_output = os.path.abspath(output_path)
    print(f"  Output:   {abs_output}")

    meta = building.get("meta", {})
    print(f"  Building: {meta.get('name','?')} — "
          f"{meta.get('floors','?')} floors, "
          f"{meta.get('width','?')}×{meta.get('height','?')}")

    # Validate building
    print()
    print("Validating building...")
    b_issues = validate_building(building)
    if b_issues:
        for issue in b_issues:
            print(f"  WARNING: {issue}")
    else:
        print("  Building structure OK")

    # Validate scenario
    print()
    print("Validating scenario...")
    s_issues, s_warnings = validate_scenario(building, scenario)

    for w in s_warnings:
        print(f"  NOTE: {w}")

    if s_issues:
        for issue in s_issues:
            print(f"  ERROR: {issue}")
        print()
        print("Cannot run simulation — fix the errors above first.")
        sys.exit(1)

    r_count = len(scenario.get("responders", []))
    v_count = len(scenario.get("victims",    []))
    t_type  = scenario.get("threat", {}).get("type", "?")
    print(f"  {r_count} responder(s), {v_count} victim(s), threat={t_type}")

    # Build graph
    print()
    print("Building graph...")
    cfg = scenario.get("simulation_config", {})
    graph, vert_conn_map = build_graph(building, cfg)
    print(f"  {len(graph)} nodes, {sum(len(v) for v in graph.values())} edges")

    # Run simulation
    print()
    print("Running simulation (seed=42)...")
    rng    = random.Random(42)
    states = run_simulation(building, scenario, rng)
    status = states[-1]["status"]
    turns  = len(states)
    extracted = sum(1 for v in states[-1]["victim_states"] if v["status"] == "extracted")
    total_v   = len(states[-1]["victim_states"])
    peak_fire = max(len(s["threat_state"]["consumed_nodes"]) for s in states)

    print(f"  {turns} turns — status: {status.upper()}")
    print(f"  Extracted: {extracted}/{total_v} victims")
    print(f"  Peak fire spread: {peak_fire} nodes")

    if extracted < total_v and status == "timeout":
        not_extracted = [v["id"] for v in states[-1]["victim_states"] if v["status"] != "extracted"]
        print(f"  Not extracted: {not_extracted}")
        # Check if stairwell burned
        for ts in states:
            bc = ts["threat_state"]["blocked_connections"]
            if bc:
                print(f"  First blocked connections at T{ts['turn']}: {bc}")
                break

    # Assemble export
    print()
    print("Writing viz data...")
    export = make_serializable({
        "meta":                 building["meta"],
        "floor_labels":         building.get("floor_labels", {}),
        "grid":                 building["grid"],
        "cell_properties":      building.get("cell_properties", {}),
        "vertical_connections": building.get("vertical_connections", []),
        "exit_nodes":           building.get("exit_nodes", []),
        "scenario":             scenario,
        "states":               [fix_tuples(s) for s in states],
    })

    with open(abs_output, "w") as f:
        json.dump(export, f, separators=(",", ":"))

    size_kb = os.path.getsize(abs_output) / 1024
    print(f"  Written: {os.path.basename(abs_output)} ({size_kb:.1f} KB)")

    print()
    print("Done. Open viz.html in your browser (serve from backend/ folder).")
    print()
    print("Keyboard shortcuts:")
    print("  Space       play / pause")
    print("  ← →         step back / forward")
    print("  0 1 2 ...   switch floors")


if __name__ == "__main__":
    main()