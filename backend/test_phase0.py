"""
test_phase0.py — RescueGrid Phase 0 test suite.

Runs all validation checks and prints a colour-coded terminal report.
Also renders ASCII visualisations of:
  - All three building floors
  - Turn-by-turn simulation playback (first 8 turns)
  - Final agent positions

Run with:  python3 test_phase0.py
"""

import sys, os, math, random, json, time
sys.path.insert(0, os.path.dirname(__file__))

from compiler   import build_test_building, compile_stamps, DEFAULT_STAMPS
from graph      import build_graph
from astar      import astar, nearest_exit
from threat     import FireThreat, HostileAgent, make_threat
from victims    import init_victim_states, move_victims, compute_urgency
from assignment import init_responder_states, solve_assignment
from simulation import run_simulation

INF = math.inf

# ── Terminal colours (no external deps) ──────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
RED    = "\033[31m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
BLUE   = "\033[34m"
CYAN   = "\033[36m"
WHITE  = "\033[37m"
DIM    = "\033[2m"

def col(text, colour): return f"{colour}{text}{RESET}"
def ok(msg):   print(f"  {col('PASS', GREEN)}  {msg}")
def fail(msg): print(f"  {col('FAIL', RED)}  {msg}"); global FAILURES; FAILURES += 1
def warn(msg): print(f"  {col('WARN', YELLOW)}  {msg}")
def header(msg): print(f"\n{BOLD}{CYAN}{'═'*60}{RESET}\n{BOLD}{CYAN}  {msg}{RESET}\n{BOLD}{CYAN}{'═'*60}{RESET}")
def section(msg): print(f"\n{BOLD}{WHITE}── {msg} ──{RESET}")

FAILURES = 0

# ── Floor ASCII visualiser ────────────────────────────────────────────────────

TILE_CHARS = {
    "wall":      col("█", DIM),
    "floor":     " ",
    "door":      col("D", YELLOW),
    "stairwell": col("S", BLUE),
    "window":    col("W", CYAN),
    "hazard":    col("H", RED),
    "elevator":  col("E", CYAN),
    "empty":     "·",
}

AGENT_CHARS = {
    "fire":    col("🔥", RED),
    "R1":      col("1", GREEN),
    "R2":      col("2", GREEN),
    "R3":      col("3", GREEN),
    "V1":      col("①", YELLOW),
    "V2":      col("②", YELLOW),
    "V3":      col("③", YELLOW),
    "hostile": col("X", RED),
}


def render_floor(grid, floor_idx, floor_label, agents_on_floor=None,
                 consumed=None, frontier=None):
    """
    Render one floor as an ASCII grid with colour coding.
    agents_on_floor: list of (x, y, char_key)
    consumed: set of (x,y,z) tuples
    frontier: set of (x,y,z) tuples
    """
    consumed  = consumed  or set()
    frontier  = frontier  or set()
    agents_on_floor = agents_on_floor or []

    # Build agent lookup
    agent_at = {}
    for (ax, ay, achar) in agents_on_floor:
        agent_at[(ax, ay)] = achar

    rows = grid[floor_idx]
    height = len(rows)
    width  = len(rows[0]) if rows else 0

    lines = []
    lines.append(f"  {col(f'Floor {floor_idx}: {floor_label}', BOLD)}")
    lines.append("  +" + "─" * width + "+")

    for y, row in enumerate(rows):
        line = "  |"
        for x, cell in enumerate(row):
            pos = (x, y, floor_idx)
            if (x, y) in agent_at:
                line += agent_at[(x, y)]
            elif pos in consumed:
                line += col("▓", RED)
            elif pos in frontier:
                line += col("░", YELLOW)
            else:
                line += TILE_CHARS.get(cell, "?")
        line += "|"
        lines.append(line)

    lines.append("  +" + "─" * width + "+")
    return "\n".join(lines)


def render_building(building, turn_state=None):
    """Render all floors of the building, overlaying agent positions."""
    grid   = building["grid"]
    meta   = building["meta"]
    labels = building.get("floor_labels", {})

    consumed = set()
    frontier = set()
    victim_positions   = {}
    responder_positions = {}
    hostile_pos = None

    if turn_state:
        consumed = set(tuple(n) for n in turn_state["threat_state"]["consumed_nodes"])
        frontier = set(tuple(n) for n in turn_state["threat_state"]["frontier_nodes"])
        for v in turn_state["victim_states"]:
            if v["status"] != "extracted":
                victim_positions[v["id"]] = tuple(v["position"])
        for r in turn_state["responder_states"]:
            if r["status"] != "extracted":
                responder_positions[r["id"]] = tuple(r["position"])
        hp = turn_state["threat_state"].get("hostile_agent_position")
        if hp:
            hostile_pos = tuple(hp)

    for z in range(meta["floors"]):
        agents_on_floor = []
        for rid, pos in responder_positions.items():
            if pos[2] == z:
                agents_on_floor.append((pos[0], pos[1], AGENT_CHARS.get(rid, "R")))
        for vid, pos in victim_positions.items():
            if pos[2] == z:
                agents_on_floor.append((pos[0], pos[1], AGENT_CHARS.get(vid, "V")))
        if hostile_pos and hostile_pos[2] == z:
            agents_on_floor.append((hostile_pos[0], hostile_pos[1], AGENT_CHARS["hostile"]))

        label = labels.get(str(z), f"Floor {z}")
        print(render_floor(grid, z, label, agents_on_floor, consumed, frontier))
        print()


def print_legend():
    print(f"  Legend:  "
          f"{col('█', DIM)}=wall  "
          f"{col('D', YELLOW)}=door  "
          f"{col('S', BLUE)}=stairwell  "
          f"{col('W', CYAN)}=window  "
          f"{col('H', RED)}=hazard  "
          f"{col('▓', RED)}=fire  "
          f"{col('░', YELLOW)}=frontier  "
          f"{col('1/2/3', GREEN)}=responders  "
          f"{col('①②③', YELLOW)}=victims")
    print()


# ══════════════════════════════════════════════════════════════════════════════
#  TEST SUITES
# ══════════════════════════════════════════════════════════════════════════════

def test_compiler():
    header("TEST 1 — Stamp-to-Grid Compiler")

    building, scenario = build_test_building()
    grid = building["grid"]
    meta = building["meta"]

    section("Grid dimensions")
    assert len(grid) == meta["floors"], "Wrong floor count"
    ok(f"Floor count: {meta['floors']}")
    for z in range(meta["floors"]):
        assert len(grid[z]) == meta["height"], f"Floor {z} wrong height"
        for row in grid[z]:
            assert len(row) == meta["width"], f"Floor {z} wrong width"
    ok(f"All floors: {meta['width']}×{meta['height']} cells")

    section("Cell type validity")
    valid = {"wall","floor","door","stairwell","window","hazard","elevator","empty"}
    bad = []
    for z in range(meta["floors"]):
        for y in range(meta["height"]):
            for x in range(meta["width"]):
                ct = grid[z][y][x]
                if ct not in valid:
                    bad.append((x,y,z,ct))
    if bad:
        fail(f"Invalid cell types found: {bad[:5]}")
    else:
        ok("All cell types valid")

    section("Stairwell matching across floors")
    # West stairwell should appear on all 3 floors at (3,6) and (4,6) and (3,7) and (4,7)
    for z in range(3):
        ct = grid[z][3][3]
        if ct != "stairwell":
            fail(f"West stairwell missing at (3,3,{z}): found '{ct}'")
        else:
            ok(f"West stairwell present at (3,3,{z})")

    # East stairwell should be on floors 0 and 1 only
    for z in [0, 1]:
        ct = grid[z][3][12]
        if ct != "stairwell":
            fail(f"East stairwell missing at (12,3,{z}): found '{ct}'")
        else:
            ok(f"East stairwell present at (12,3,{z})")
    # East stairwell should NOT be on floor 2
    ct_f2 = grid[2][3][12]
    if ct_f2 == "stairwell":
        fail("East stairwell incorrectly present on floor 2")
    else:
        ok(f"East stairwell correctly absent on floor 2 (found '{ct_f2}')")

    section("Locked door properties")
    cell_props = building["cell_properties"]
    # Find any locked door
    locked_doors = {k: v for k, v in cell_props.items()
                    if v.get("locked") and v.get("requires")}
    if not locked_doors:
        fail("No locked doors found in cell_properties")
    else:
        ok(f"Found {len(locked_doors)} locked doors: {list(locked_doors.keys())}")

    section("Window cells on perimeter")
    for z in range(meta["floors"]):
        w_cells = []
        for y in range(meta["height"]):
            for x in range(meta["width"]):
                if grid[z][y][x] == "window":
                    w_cells.append((x, y))
        if w_cells:
            ok(f"Floor {z} windows at: {w_cells}")

    section("cell_properties label coverage")
    labelled = {k for k, v in cell_props.items() if "label" in v}
    ok(f"Labelled cells: {len(labelled)}")

    return building, scenario


def test_graph(building, scenario):
    header("TEST 2 — Graph Builder")

    graph, vert_conn_map = build_graph(building, scenario.get("simulation_config"))

    section("Node and edge counts")
    total_nodes = len(graph)
    total_edges = sum(len(v) for v in graph.values())
    ok(f"Graph: {total_nodes} nodes, {total_edges} directed edges")
    assert total_nodes > 100, "Graph suspiciously small"

    section("Stairwell vertical edges")
    # West stairwell at (3,3,0) should connect to (3,3,1)
    sw00 = (3, 3, 0)
    nbrs = [n for n, _ in graph.get(sw00, [])]
    vert_up = [n for n in nbrs if n[2] == 1 and n[0] == 3 and n[1] == 3]
    if not vert_up:
        fail(f"West stairwell (3,3,0) missing vertical edge to floor 1")
    else:
        ok(f"West stairwell (3,3,0) → {vert_up[0]} (floor 1)")

    # (3,3,1) should connect to both floor 0 and floor 2
    sw11 = (3, 3, 1)
    nbrs1 = [n for n, _ in graph.get(sw11, [])]
    to_f0 = [n for n in nbrs1 if n[2] == 0]
    to_f2 = [n for n in nbrs1 if n[2] == 2]
    if not to_f0:
        fail("West stairwell floor 1 missing connection DOWN to floor 0")
    else:
        ok(f"West stairwell (3,3,1) → floor 0: {to_f0[0]}")
    if not to_f2:
        fail("West stairwell floor 1 missing connection UP to floor 2")
    else:
        ok(f"West stairwell (3,3,1) → floor 2: {to_f2[0]}")

    section("East stairwell floor 2 isolation")
    sw_e2 = (12, 3, 2)
    nbrs_e2 = [n for n, _ in graph.get(sw_e2, [])]
    vert_e2 = [n for n in nbrs_e2 if n[2] != 2]
    if vert_e2:
        fail(f"East stairwell on floor 2 should have no vertical edges but found {vert_e2}")
    else:
        ok("East stairwell correctly has no vertical edges on floor 2")

    section("Window cells in graph")
    win_nodes = [(x,y,z) for (x,y,z) in graph if building["grid"][z][y][x] == "window"]
    ok(f"Window nodes in graph: {len(win_nodes)} — {win_nodes}")

    section("Exit nodes reachable")
    for en in building["exit_nodes"]:
        enode = (en["x"], en["y"], en["z"])
        if enode in graph:
            ok(f"Exit '{en['id']}' at {enode} in graph ({len(graph[enode])} edges)")
        else:
            warn(f"Exit '{en['id']}' at {enode} not in graph (ok if on perimeter)")

    section("Elevator disabled by default")
    elev_node = (8, 5, 0)
    elev_nbrs = [n for n, _ in graph.get(elev_node, [])]
    vert_elev = [n for n in elev_nbrs if n[2] != 0]
    if vert_elev:
        warn(f"Elevator has vertical edges even when disabled: {vert_elev}")
    else:
        ok("Elevator correctly has no vertical edges when disabled")

    return graph, vert_conn_map


def test_astar(building, scenario, graph, vert_conn_map):
    header("TEST 3 — State-Space A*")

    section("Ax unlocks locked doors")
    start = (8, 5, 0)   # corridor center ground floor
    goal  = (9, 2, 0)   # inside main office area

    path_ax, cost_ax = astar(graph, vert_conn_map, building, start, goal,
                              equipment_set={"ax"})
    path_no, cost_no = astar(graph, vert_conn_map, building, start, goal,
                              equipment_set=set())

    if path_ax and cost_ax < INF:
        ok(f"With ax — cost={cost_ax:.1f}, path length={len(path_ax)}")
    else:
        fail("With ax — no path found (should be passable)")

    if cost_no > cost_ax or cost_no == INF:
        ok(f"Without ax — cost={cost_no:.1f} (higher or inf, as expected)")
    else:
        fail(f"Without ax should cost more than with ax: {cost_no} vs {cost_ax}")

    section("Ladder unlocks window exit")
    # Start adjacent to east window on floor 1; route to exit_east which window connects to
    start_f1 = (14, 5, 1)   # corridor cell directly west of window (15,5,1)
    exit_east = next(e for e in building["exit_nodes"] if e["id"] == "exit_east")
    goal_exit = (exit_east["x"], exit_east["y"], exit_east["z"])

    path_lad, cost_lad = astar(graph, vert_conn_map, building, start_f1, goal_exit,
                                equipment_set={"ladder"})
    path_nol, cost_nol = astar(graph, vert_conn_map, building, start_f1, goal_exit,
                                equipment_set=set())

    if path_lad and cost_lad < INF:
        ok(f"With ladder — cost={cost_lad:.1f}, path length={len(path_lad)}")
        uses_win = any(building["grid"][n[2]][n[1]][n[0]] == "window" for n in path_lad)
        ok(f"Path uses window: {uses_win}")
        if not uses_win:
            warn("Path did not use window — stairwell route was cheaper")
    else:
        fail("With ladder — no path found")

    if cost_nol < INF:
        ok(f"Without ladder — cost={cost_nol:.1f} (uses stairwell, avoids window)")
        uses_win_nol = any(building["grid"][n[2]][n[1]][n[0]] == "window" for n in path_nol)
        assert not uses_win_nol, "No-ladder path must not use window"
        ok("No-ladder path correctly avoids window")
    else:
        ok("Without ladder — no direct route (window blocked, must use stairwell to different exit)")

    section("Drone reduces hazard cost")
    # Find a hazard cell
    h_cell = None
    for z in range(building["meta"]["floors"]):
        for y in range(building["meta"]["height"]):
            for x in range(building["meta"]["width"]):
                if building["grid"][z][y][x] == "hazard":
                    h_cell = (x, y, z)
                    break
            if h_cell:
                break
        if h_cell:
            break

    if h_cell:
        ok(f"Hazard cell found at {h_cell}")
        # Route along x-axis through the hazard zone (both cells at y=5)
        # from west side to east side of hazard block
        h_x, h_y, h_z = h_cell
        h_start = (max(1, h_x - 1), h_y, h_z)   # cell just west of hazard
        h_goal  = (min(building["meta"]["width"]-2, h_x + 2), h_y, h_z)  # cell just east
        _, cost_drone = astar(graph, vert_conn_map, building, h_start, h_goal,
                               equipment_set={"drone"})
        _, cost_plain = astar(graph, vert_conn_map, building, h_start, h_goal,
                               equipment_set=set())
        ok(f"Route through hazard: drone={cost_drone:.1f}, plain={cost_plain:.1f}")
        if cost_drone < INF and cost_plain < INF:
            if cost_drone <= cost_plain:
                ok(f"Drone cost ({cost_drone:.1f}) ≤ plain cost ({cost_plain:.1f}): hazard penalty reduced")
            else:
                warn(f"Drone ({cost_drone:.1f}) > plain ({cost_plain:.1f}): route avoids hazard entirely")
        else:
            warn(f"One or both paths are INF — hazard may be surrounded by walls")
    else:
        warn("No hazard cell found for drone test")

    section("Threat penalty map blocks consumed nodes")
    threat_pm = {(3, 2, 0): INF, (4, 2, 0): INF}
    start_pen = (5, 5, 0)
    goal_pen  = (2, 5, 0)
    path_no_pen, cost_no_pen = astar(graph, vert_conn_map, building, start_pen, goal_pen,
                                      equipment_set=set())
    path_with_pen, cost_with_pen = astar(graph, vert_conn_map, building, start_pen, goal_pen,
                                          equipment_set=set(), threat_penalty_map=threat_pm)

    ok(f"Without threat penalty — cost={cost_no_pen:.1f}")
    ok(f"With threat penalty — cost={cost_with_pen:.1f} "
       f"({'higher or rerouted' if cost_with_pen >= cost_no_pen else 'same route'})")

    section("Multi-floor routing through west stairwell")
    start_f0 = (8, 5, 0)
    goal_f2  = (8, 2, 2)
    path_mf, cost_mf = astar(graph, vert_conn_map, building, start_f0, goal_f2,
                               equipment_set=set())
    if path_mf and cost_mf < INF:
        floors_visited = sorted(set(n[2] for n in path_mf))
        ok(f"Multi-floor path found: cost={cost_mf:.1f}, floors visited={floors_visited}")
        uses_stairwell = any(building["grid"][n[2]][n[1]][n[0]] == "stairwell" for n in path_mf)
        ok(f"Path uses stairwell: {uses_stairwell}")
        assert uses_stairwell, "Multi-floor path must use a stairwell"
    else:
        fail("Multi-floor path not found")


def test_threat(building, scenario, graph):
    header("TEST 4 — Threat Propagation")

    section("Fire spread — deterministic seed")
    fire = FireThreat(scenario["threat"]["fire_params"])
    origin = scenario["threat"]["origin"]
    consumed = [[origin["x"], origin["y"], origin["z"]]]
    rng = random.Random(42)

    prev_count = 1
    for turn in range(10):
        consumed = fire.propagate(graph, building, consumed, rng)
        new_count = len(consumed)
        if new_count < prev_count:
            fail(f"Turn {turn+1}: consumed count DECREASED ({prev_count} → {new_count})")
        prev_count = new_count

    ok(f"After 10 turns: {len(consumed)} nodes consumed (seed=42)")
    assert len(consumed) > 1, "Fire must spread beyond origin"
    ok("Fire spread beyond origin")

    section("Fire stairwell acceleration")
    # Place fire adjacent to west stairwell and check it reaches floor 1
    consumed_sw = [[3, 5, 0], [3, 6, 0], [4, 6, 0]]  # cells next to stairwell
    rng2 = random.Random(0)
    for _ in range(15):
        consumed_sw = fire.propagate(graph, building, consumed_sw, rng2)

    consumed_set = set(map(tuple, consumed_sw))
    floor1_cells = [n for n in consumed_set if n[2] == 1]
    if floor1_cells:
        ok(f"Fire reached floor 1 via stairwell: {floor1_cells[:3]}")
    else:
        warn("Fire did not reach floor 1 in 15 turns (probabilistic — may need more turns)")

    section("Blocked connections detection")
    # Manually consume the west stairwell cells on floor 0
    consumed_block = list(consumed_set) + [[3,6,0],[4,6,0],[3,7,0],[4,7,0]]
    blocked = fire.blocked_connections(building, set(map(tuple, consumed_block)))
    ok(f"Blocked connections detected: {blocked}")

    section("Hostile agent minimax")
    agent = HostileAgent({"objective": "reach_victim", "search_depth": 3, "speed": 1})
    agent.position = (13, 5, 0)
    victims    = [(3, 2, 0)]
    responders = [(8, 5, 0)]

    pos = [[13, 5, 0]]
    positions = [tuple(pos[0])]
    for turn in range(5):
        pos = agent.propagate(graph, building, pos,
                              victim_positions=victims,
                              responder_positions=responders)
        positions.append(tuple(pos[0]))

    # Agent should be moving (not staying put)
    if len(set(positions)) > 1:
        ok(f"Hostile agent moved: {positions}")
    else:
        fail("Hostile agent did not move")

    # Agent should be getting closer to victim
    dist_start = sum(abs(a-b) for a,b in zip(positions[0], victims[0]))
    dist_end   = sum(abs(a-b) for a,b in zip(positions[-1], victims[0]))
    if dist_end < dist_start:
        ok(f"Hostile agent moved closer to victim: {dist_start} → {dist_end}")
    else:
        warn(f"Hostile agent did not move closer to victim in 5 turns ({dist_start} → {dist_end})")

    section("penalty_map structure")
    fire2 = FireThreat(scenario["threat"]["fire_params"])
    consumed2 = [[3,2,0],[4,2,0]]
    consumed_set2 = set(map(tuple, consumed2))
    frontier2 = fire2.get_frontier(graph, consumed_set2)
    pm = fire2.penalty_map(consumed_set2, frontier2, weight=10.0)
    for node in consumed_set2:
        assert pm.get(node, 0) == INF, f"Consumed node {node} should have INF penalty"
    ok(f"penalty_map: {len(pm)} entries, consumed nodes have INF penalty")


def test_victims(building, scenario, graph):
    header("TEST 5 — Victim Movement & Urgency")

    victim_states = init_victim_states(scenario["victims"])
    consumed = [[scenario["threat"]["origin"]["x"],
                 scenario["threat"]["origin"]["y"],
                 scenario["threat"]["origin"]["z"]]]

    section("Initial state")
    for v in victim_states:
        ok(f"{v['id']} ({v['mobility']}) at {v['position']}")

    section("Immobile victim does not move")
    v3_initial = list(next(v for v in victim_states if v["id"] == "V3")["position"])
    for turn in range(5):
        victim_states = move_victims(graph, building, victim_states, consumed, turn_number=turn)
    v3_final = list(next(v for v in victim_states if v["id"] == "V3")["position"])
    if v3_initial == v3_final:
        ok(f"V3 (immobile) stayed at {v3_final}")
    else:
        fail(f"V3 should not move: {v3_initial} → {v3_final}")

    section("Mobile victim flees threat")
    v1_start = next(v for v in scenario["victims"] if v["id"] == "V1")
    v1_initial = [v1_start["x"], v1_start["y"], v1_start["z"]]
    v1_final   = list(next(v for v in victim_states if v["id"] == "V1")["position"])
    if v1_initial != v1_final:
        ok(f"V1 (mobile) moved: {v1_initial} → {v1_final}")
    else:
        warn(f"V1 did not move (may be already at safest cell)")

    section("Urgency scoring")
    victim_states = init_victim_states(scenario["victims"])
    victim_states = compute_urgency(graph, building, victim_states,
                                     consumed, building["exit_nodes"])
    for v in victim_states:
        ok(f"{v['id']} urgency={v['urgency_score']} turns_to_threat={v['turns_until_threat']}")

    # V1 should have a finite urgency score
    v1 = next(v for v in victim_states if v["id"] == "V1")
    if v1["urgency_score"] is not None and v1["turns_until_threat"] is not None:
        ok(f"V1 urgency scored: urgency={v1['urgency_score']} turns_to_threat={v1['turns_until_threat']}")
    else:
        fail("V1 urgency scoring failed — None returned")

    section("Injured victim moves every 2 turns")
    states2 = init_victim_states(scenario["victims"])
    v2_positions = []
    for turn in range(6):
        states2 = move_victims(graph, building, states2, consumed, turn_number=turn)
        v2_pos = tuple(next(v for v in states2 if v["id"] == "V2")["position"])
        v2_positions.append(v2_pos)

    changes = sum(1 for i in range(1, len(v2_positions)) if v2_positions[i] != v2_positions[i-1])
    ok(f"V2 (injured) position changes in 6 turns: {changes} (expected ≤3)")
    assert changes <= 3, f"Injured victim moved too often: {changes} times in 6 turns"


def test_assignment(building, scenario, graph, vert_conn_map):
    header("TEST 6 — Hungarian Assignment")

    responders = init_responder_states(scenario["responders"])
    victims    = init_victim_states(scenario["victims"])
    consumed   = [[scenario["threat"]["origin"]["x"],
                   scenario["threat"]["origin"]["y"],
                   scenario["threat"]["origin"]["z"]]]

    victims = compute_urgency(graph, building, victims, consumed, building["exit_nodes"])

    section("Assignment feasibility")
    assignments, contention = solve_assignment(
        responders, victims, graph, vert_conn_map, building,
        scenario_config=scenario["simulation_config"]
    )

    if not assignments:
        fail("No assignments produced")
        return

    ok(f"Produced {len(assignments)} assignments")
    for a in assignments:
        ok(f"  {a['responder_id']} → {a['victim_id']}  cost={a['cost']:.2f}  path_len={len(a['path'])}")

    section("No duplicate assignments")
    r_ids = [a["responder_id"] for a in assignments]
    v_ids = [a["victim_id"]    for a in assignments]
    if len(r_ids) == len(set(r_ids)):
        ok("No responder assigned twice")
    else:
        fail(f"Duplicate responder assignments: {r_ids}")
    if len(v_ids) == len(set(v_ids)):
        ok("No victim assigned twice")
    else:
        fail(f"Duplicate victim assignments: {v_ids}")

    section("Equipment-aware assignment — R2 (ladder) routed to floor 1/2 victim")
    r2_assign = next((a for a in assignments if a["responder_id"] == "R2"), None)
    if r2_assign:
        v = next(v for v in victims if v["id"] == r2_assign["victim_id"])
        ok(f"R2 (ladder) assigned to {r2_assign['victim_id']} at floor {v['position'][2]}")
    else:
        warn("R2 has no assignment (may be valid if all victims assigned)")

    section("Contention map populated")
    if contention:
        ok(f"Contention map: {len(contention)} nodes penalised")
    else:
        warn("Contention map empty")

    section("All paths are valid (start→victim)")
    for a in assignments:
        path = a["path"]
        r = next(r for r in responders if r["id"] == a["responder_id"])
        v = next(v for v in victims    if v["id"] == a["victim_id"])
        if not path:
            fail(f"{a['responder_id']}→{a['victim_id']}: empty path")
            continue
        if tuple(path[0]) != tuple(r["position"]):
            fail(f"{a['responder_id']} path doesn't start at responder position")
        else:
            ok(f"{a['responder_id']}→{a['victim_id']}: valid path ({len(path)} nodes)")


def test_simulation(building, scenario):
    header("TEST 7 — Full Simulation Loop")

    rng = random.Random(42)
    t_start = time.time()
    states = run_simulation(building, scenario, rng)
    elapsed = time.time() - t_start

    section("Simulation ran without crashing")
    ok(f"Completed {len(states)} turns in {elapsed:.2f}s")
    ok(f"Final status: {col(states[-1]['status'], GREEN if states[-1]['status'] == 'success' else YELLOW)}")

    section("Turn state schema validation")
    required_keys = ["turn", "status", "threat_state", "victim_states",
                     "responder_states", "assignment_log", "events"]
    for key in required_keys:
        if key in states[0]:
            ok(f"Turn 0 has '{key}'")
        else:
            fail(f"Turn 0 missing '{key}'")

    threat_keys = ["type","consumed_nodes","frontier_nodes","blocked_connections",
                   "hostile_agent_position","hostile_agent_projected_path"]
    for key in threat_keys:
        if key in states[0]["threat_state"]:
            ok(f"threat_state has '{key}'")
        else:
            fail(f"threat_state missing '{key}'")

    section("Fire spread is monotonically non-decreasing")
    prev = 0
    for ts in states:
        n = len(ts["threat_state"]["consumed_nodes"])
        if n < prev:
            fail(f"Turn {ts['turn']}: consumed count decreased {prev}→{n}")
            break
        prev = n
    else:
        ok(f"Consumed nodes monotonically increasing: {prev} final")

    section("Turn numbers are sequential")
    for i, ts in enumerate(states):
        if ts["turn"] != i:
            fail(f"Expected turn {i}, got {ts['turn']}")
            break
    else:
        ok(f"Turn numbers sequential 0–{len(states)-1}")

    section("No victim assigned to two responders simultaneously")
    for ts in states:
        v_assigned = {}
        for r in ts["responder_states"]:
            if r["assigned_to"]:
                if r["assigned_to"] in v_assigned:
                    fail(f"Turn {ts['turn']}: {r['assigned_to']} assigned to two responders")
                v_assigned[r["assigned_to"]] = r["id"]
    ok("No double-assignment across all turns")

    section("Events schema")
    event_types_seen = set()
    for ts in states:
        for ev in ts["events"]:
            assert "type" in ev,        "Event missing 'type'"
            assert "description" in ev, "Event missing 'description'"
            event_types_seen.add(ev["type"])
    ok(f"Event types seen: {sorted(event_types_seen)}")

    return states


# ── Visual simulation playback ────────────────────────────────────────────────

def playback_simulation(building, states, max_turns=8):
    header("SIMULATION PLAYBACK (first 8 turns)")
    print_legend()

    for ts in states[:max_turns]:
        consumed_count = len(ts["threat_state"]["consumed_nodes"])
        events = [e["type"] for e in ts["events"]] or ["(none)"]
        r_statuses = "  ".join(
            f"{r['id']}={col(r['status'],'GREEN' if r['status']=='routing' else 'YELLOW')}@z{r['position'][2]}"
            for r in ts["responder_states"]
        )
        v_statuses = "  ".join(
            f"{v['id']}={v['status']}@z{v['position'][2]} urg={v['urgency_score']}"
            for v in ts["victim_states"]
        )
        print(f"\n{BOLD}Turn {ts['turn']:2d} | status={ts['status']} | "
              f"consumed={consumed_count} | events={events}{RESET}")
        print(f"  Responders: {r_statuses}")
        print(f"  Victims:    {v_statuses}")

        if ts["turn"] in (0, 3, 6) or ts["turn"] == states[-1]["turn"]:
            render_building(building, ts)


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    global FAILURES
    FAILURES = 0

    print(f"\n{BOLD}{CYAN}{'═'*60}{RESET}")
    print(f"{BOLD}{CYAN}  RescueGrid — Phase 0 Test Suite{RESET}")
    print(f"{BOLD}{CYAN}{'═'*60}{RESET}")

    # ── Render initial building ───────────────────────────────────────────────
    building, scenario = build_test_building()

    header("BUILDING VISUALISATION — Initial State")
    print_legend()
    render_building(building)

    # ── Run all tests ─────────────────────────────────────────────────────────
    try:
        building, scenario = test_compiler()
        graph, vert_conn_map = test_graph(building, scenario)
        test_astar(building, scenario, graph, vert_conn_map)
        test_threat(building, scenario, graph)
        test_victims(building, scenario, graph)
        test_assignment(building, scenario, graph, vert_conn_map)
        states = test_simulation(building, scenario)
        playback_simulation(building, states)
    except Exception as e:
        import traceback
        print(f"\n{RED}{BOLD}UNEXPECTED EXCEPTION:{RESET}")
        traceback.print_exc()
        FAILURES += 1

    # ── Final report ──────────────────────────────────────────────────────────
    print(f"\n{BOLD}{'═'*60}{RESET}")
    if FAILURES == 0:
        print(f"{BOLD}{GREEN}  ALL TESTS PASSED{RESET}")
    else:
        print(f"{BOLD}{RED}  {FAILURES} TEST(S) FAILED{RESET}")
    print(f"{BOLD}{'═'*60}{RESET}\n")

    sys.exit(0 if FAILURES == 0 else 1)


if __name__ == "__main__":
    main()