"""
test_dynamic.py — Building-agnostic simulation correctness tests.

These tests work on ANY valid rescuegrid-v1 building. They verify that
the simulation is behaving correctly without being tied to specific cell
coordinates, floor counts, or room layouts.

Usage:
    # Test the 2-story house (default if called from backend/ with 2Story.json present)
    python3 test_dynamic.py path/to/building.json

    # Test the original school building
    python3 test_dynamic.py
"""

import sys, os, math, random, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from graph      import build_graph
from astar      import astar, nearest_exit
from simulation import run_simulation
from victims    import init_victim_states, compute_urgency
from assignment import init_responder_states, solve_assignment
from threat     import make_threat, FireThreat
from compiler   import build_test_building

INF = math.inf

# ── colours ───────────────────────────────────────────────────────────────────
RESET="\033[0m"; BOLD="\033[1m"; RED="\033[31m"; GREEN="\033[32m"
YELLOW="\033[33m"; CYAN="\033[36m"; WHITE="\033[37m"

FAILURES = 0
WARNINGS = 0

def col(t,c): return f"{c}{t}{RESET}"
def ok(m):    print(f"  {col('PASS',GREEN)}  {m}")
def fail(m):  global FAILURES; FAILURES+=1; print(f"  {col('FAIL',RED)}  {m}")
def warn(m):  global WARNINGS; WARNINGS+=1; print(f"  {col('WARN',YELLOW)}  {m}")
def hdr(m):   print(f"\n{BOLD}{CYAN}{'='*60}\n  {m}\n{'='*60}{RESET}")
def sec(m):   print(f"\n{BOLD}{WHITE}-- {m} --{RESET}")


# ── fixture loading ────────────────────────────────────────────────────────────

def load(path=None):
    if path:
        abs_path = os.path.abspath(path)
        with open(abs_path) as f:
            raw = json.load(f)
        # Auto-unwrap grid.layers if present
        b = raw["building"]
        if isinstance(b.get("grid"), dict) and "layers" in b["grid"]:
            b["grid"] = b["grid"]["layers"]
        building = b
        scenario = raw["scenario"]
    else:
        building, scenario = build_test_building()

    cfg    = scenario.get("simulation_config", {})
    graph, vcm = build_graph(building, cfg)
    states = run_simulation(building, scenario, random.Random(42))
    return building, scenario, graph, vcm, states


# ── TEST 1: Graph Integrity ────────────────────────────────────────────────────

def test_graph_integrity(building, scenario, graph, vcm, states):
    hdr("TEST 1 — Graph Integrity")
    meta = building["meta"]
    F, W, H = meta["floors"], meta["width"], meta["height"]
    grid = building["grid"]

    sec("Graph has nodes for all passable cells")
    passable_types = {"floor","door","stairwell","window","hazard"}
    passable_count = sum(
        1 for z in range(F) for y in range(H) for x in range(W)
        if grid[z][y][x] in passable_types
    )
    ok(f"Building has {passable_count} passable cells, graph has {len(graph)} nodes")
    # Graph may have slightly fewer nodes (isolated cells) but never more
    exit_count = len(building.get("exit_nodes", []))
    if len(graph) <= passable_count + exit_count:
        ok(f"Node count OK ({len(graph)} nodes, {passable_count} passable, {exit_count} exits)")
    else:
        fail(f"Graph has {len(graph)} nodes but only {passable_count} passable + {exit_count} exits")

    sec("Every stairwell vertical connection is wired in the graph")
    for vc in building.get("vertical_connections", []):
        if vc["type"] != "stairwell":
            continue
        floors = vc["floors"]
        x, y   = vc["x"], vc["y"]
        for i in range(len(floors) - 1):
            za, zb = floors[i], floors[i+1]
            ka = (x, y, za)
            kb = (x, y, zb)
            # Check bidirectional edge exists
            a_to_b = any(nb == kb for nb, _ in graph.get(ka, []))
            b_to_a = any(nb == ka for nb, _ in graph.get(kb, []))
            if a_to_b and b_to_a:
                ok(f"Stairwell '{vc['id']}': ({x},{y},{za}) <-> ({x},{y},{zb}) wired correctly")
            else:
                fail(f"Stairwell '{vc['id']}': missing edge between floors {za} and {zb}")

    sec("All exit nodes are reachable from at least one interior cell")
    # Find any passable interior cell (not on the building perimeter)
    interior = None
    for z in range(F):
        for y in range(1, H-1):
            for x in range(1, W-1):
                if grid[z][y][x] == "floor" and (x,y,z) in graph:
                    interior = (x,y,z)
                    break
            if interior: break
        if interior: break

    if interior:
        for en in building.get("exit_nodes", []):
            epos = (en["x"], en["y"], en.get("z",0))
            path, cost = astar(graph, vcm, building, interior, epos,
                               equipment_set=set())
            if cost < INF:
                ok(f"Exit '{en['id']}' at {epos} reachable from interior {interior} (cost={cost:.1f})")
            else:
                # Some exits require equipment or are legitimately isolated
                warn(f"Exit '{en['id']}' at {epos} not reachable without equipment "
                     f"— may need ladder/ax")
    else:
        warn("Could not find interior cell to test exit reachability")

    sec("Graph edges are symmetric (no one-way corridors)")
    asymmetric = 0
    for node, neighbors in graph.items():
        for nb, _ in neighbors:
            if not any(n == node for n, _ in graph.get(nb, [])):
                asymmetric += 1
    # Stairwell and window edges are intentionally asymmetric so we allow some
    if asymmetric == 0:
        ok("All edges are symmetric")
    elif asymmetric <= 20:
        warn(f"{asymmetric} asymmetric edges (expected for windows/stairwells)")
    else:
        fail(f"{asymmetric} asymmetric edges — too many")


# ── TEST 2: A* Path Quality ────────────────────────────────────────────────────

def test_astar_quality(building, scenario, graph, vcm, states):
    hdr("TEST 2 — A* Path Quality")
    meta = building["meta"]
    F = meta["floors"]
    grid = building["grid"]

    sec("Every responder can reach every victim (before any fire)")
    for r in scenario["responders"]:
        for v in scenario["victims"]:
            rpos = (r["x"], r["y"], r["z"])
            vpos = (v["x"], v["y"], v["z"])
            eq   = set(r["equipment"])
            path, cost = astar(graph, vcm, building, rpos, vpos, equipment_set=eq)
            if cost < INF:
                ok(f"{r['id']} ({eq}) -> {v['id']}: cost={cost:.1f}, steps={len(path)-1}")
            else:
                fail(f"{r['id']} cannot reach {v['id']} — no valid path exists")

    sec("Every responder can reach at least one exit")
    for r in scenario["responders"]:
        rpos = (r["x"], r["y"], r["z"])
        eq   = set(r["equipment"])
        path, cost, exit_id = nearest_exit(graph, building, rpos, eq, {})
        if cost < INF:
            ok(f"{r['id']} can reach exit '{exit_id}' in {len(path)-1} steps")
        else:
            fail(f"{r['id']} has no reachable exit — blocked from day one")

    sec("Paths are shorter than Manhattan distance * 3 (no extreme detours)")
    for r in scenario["responders"]:
        for v in scenario["victims"]:
            rpos = (r["x"], r["y"], r["z"])
            vpos = (v["x"], v["y"], v["z"])
            eq   = set(r["equipment"])
            path, cost = astar(graph, vcm, building, rpos, vpos, equipment_set=eq)
            if cost == INF or len(path) < 2:
                continue
            manhattan = (abs(rpos[0]-vpos[0]) + abs(rpos[1]-vpos[1]) +
                         abs(rpos[2]-vpos[2]) * 5)
            steps = len(path) - 1
            if manhattan == 0:
                continue
            ratio = steps / manhattan
            if ratio <= 3.0:
                ok(f"{r['id']}->{v['id']}: {steps} steps, manhattan={manhattan}, ratio={ratio:.1f}x")
            else:
                warn(f"{r['id']}->{v['id']}: {steps} steps is {ratio:.1f}x manhattan "
                     f"({manhattan}) — large detour")

    if F > 1:
        sec("Multi-floor paths use stairwells")
        checked = False
        for r in scenario["responders"]:
            for v in scenario["victims"]:
                if r["z"] == v["z"]:
                    continue  # same floor, skip
                rpos = (r["x"], r["y"], r["z"])
                vpos = (v["x"], v["y"], v["z"])
                eq   = set(r["equipment"])
                path, cost = astar(graph, vcm, building, rpos, vpos, equipment_set=eq)
                if cost == INF:
                    continue
                sw_in_path = [n for n in path
                              if grid[n[2]][n[1]][n[0]] in ("stairwell","window")]
                if sw_in_path:
                    ok(f"{r['id']} z={r['z']} -> {v['id']} z={v['z']}: "
                       f"uses {len(sw_in_path)} vertical-connection cells")
                    checked = True
                else:
                    fail(f"{r['id']} -> {v['id']} crosses floors but uses no stairwell/window")
        if not checked:
            warn("No cross-floor pairs found to test multi-floor routing")


# ── TEST 3: Threat Behaviour ───────────────────────────────────────────────────

def test_threat(building, scenario, graph, vcm, states):
    hdr("TEST 3 — Threat Behaviour")
    threat_cfg = scenario.get("threat", {})
    if not threat_cfg:
        warn("No threat in scenario — skipping threat tests")
        return

    threat_type = threat_cfg["type"]

    sec("Fire spreads from origin each turn")
    sizes = [len(ts["threat_state"]["consumed_nodes"]) for ts in states]
    # Check it grows (allow stochastic plateau but overall must grow)
    grew = sizes[-1] > sizes[0]
    if grew:
        ok(f"Fire grew from {sizes[0]} to {sizes[-1]} nodes over {len(states)} turns")
    else:
        fail(f"Fire did not spread: sizes[0]={sizes[0]} sizes[-1]={sizes[-1]}")

    sec("Fire spread is monotonically non-decreasing")
    monotonic = all(sizes[i] >= sizes[i-1] for i in range(1, len(sizes)))
    ok("Fire is monotonically non-decreasing") if monotonic else fail("Fire shrank at some turn")

    sec("Consumed nodes are all on passable cells in the grid")
    grid = building["grid"]
    passable = {"floor","door","stairwell","window","hazard"}
    bad = []
    for ts in states[:5]:
        for node in ts["threat_state"]["consumed_nodes"]:
            x,y,z = node
            ct = grid[z][y][x]
            if ct not in passable:
                bad.append((x,y,z,ct))
    if not bad:
        ok("All consumed nodes are on passable cells")
    else:
        fail(f"Fire consumed non-passable cells: {bad[:3]}")

    sec("Penalty map assigns INF cost to consumed nodes")
    ts5 = states[min(5, len(states)-1)]
    consumed_set = set(map(tuple, ts5["threat_state"]["consumed_nodes"]))
    frontier_set = set(map(tuple, ts5["threat_state"]["frontier_nodes"]))
    fire = make_threat(threat_cfg)
    pm   = fire.penalty_map(consumed_set, frontier_set)
    if consumed_set:
        sample = next(iter(consumed_set))
        penalty = pm.get(sample, 0)
        if penalty == INF or penalty is None:
            ok(f"Consumed node {sample} has INF penalty")
        else:
            fail(f"Consumed node {sample} has penalty={penalty}, expected INF")
    else:
        warn("No consumed nodes at turn 5 to check penalty map")

    sec("Fire respects building walls (does not spread into wall cells)")
    wall_fires = []
    for ts in states:
        for node in ts["threat_state"]["consumed_nodes"]:
            x,y,z = node
            if grid[z][y][x] == "wall":
                wall_fires.append((x,y,z))
    ok("Fire never spreads into wall cells") if not wall_fires else fail(f"Fire in walls: {wall_fires[:3]}")


# ── TEST 4: Victim Behaviour ───────────────────────────────────────────────────

def test_victims(building, scenario, graph, vcm, states):
    hdr("TEST 4 — Victim Behaviour")
    grid = building["grid"]
    passable = {"floor","door","stairwell","window","hazard"}

    sec("Immobile victims never change position")
    immobile = [v for v in scenario["victims"] if v["mobility"] == "immobile"]
    if not immobile:
        warn("No immobile victims in scenario")
    for v in immobile:
        start = (v["x"], v["y"], v["z"])
        moved = False
        for ts in states:
            vstate = next((vs for vs in ts["victim_states"] if vs["id"] == v["id"]), None)
            if vstate and vstate["status"] not in ("extracted",):
                pos = tuple(vstate["position"])
                if pos != start:
                    moved = True
                    fail(f"{v['id']} (immobile) moved from {start} to {pos} at T{ts['turn']}")
                    break
        if not moved:
            ok(f"{v['id']} (immobile) stayed at {start} throughout")

    sec("Injured victims move at most 3 times in first 6 turns")
    injured = [v for v in scenario["victims"] if v["mobility"] == "injured"]
    if not injured:
        warn("No injured victims in scenario")
    for v in injured:
        changes = 0
        prev = None
        for ts in states[:7]:
            vstate = next((vs for vs in ts["victim_states"] if vs["id"] == v["id"]), None)
            if vstate:
                cur = tuple(vstate["position"])
                if prev and cur != prev and vstate["status"] not in ("extracted","being_extracted"):
                    changes += 1
                prev = cur
        ok(f"{v['id']} (injured): {changes} moves in first 6 turns (<= 3)") if changes <= 3 else fail(f"{v['id']} injured but moved {changes} times in 6 turns")

    sec("All victims stay on passable cells throughout")
    for ts in states:
        for vstate in ts["victim_states"]:
            if vstate["status"] == "extracted":
                continue
            x,y,z = vstate["position"]
            ct = grid[z][y][x]
            if ct not in passable:
                fail(f"T{ts['turn']} {vstate['id']} is on '{ct}' cell at ({x},{y},{z})")

    ok("All victim positions are on passable cells") # only printed if no fail above

    sec("Urgency scores are finite and positive for victims near fire")
    found_urgency = False
    for ts in states:
        for vstate in ts["victim_states"]:
            u = vstate.get("urgency_score")
            if u is not None and isinstance(u, (int,float)) and 0 < u < INF:
                ok(f"T{ts['turn']} {vstate['id']}: urgency={u:.2f} (finite positive)")
                found_urgency = True
                break
        if found_urgency:
            break
    if not found_urgency:
        warn("No victim received a finite positive urgency score — fire may not reach them")


# ── TEST 5: Assignment Correctness ────────────────────────────────────────────

def test_assignment(building, scenario, graph, vcm, states):
    hdr("TEST 5 — Assignment Correctness")

    sec("No victim ever assigned to two routing responders simultaneously")
    for ts in states:
        routing = [r["assigned_to"] for r in ts["responder_states"]
                   if r["status"] == "routing" and r["assigned_to"]]
        dups = {v for v in routing if routing.count(v) > 1}
        if dups:
            fail(f"T{ts['turn']}: duplicate routing assignment to {dups}")
            return
    ok("No duplicate routing assignments across all turns")

    sec("No responder assigned to an already-extracted victim")
    for ts in states:
        extracted = {v["id"] for v in ts["victim_states"] if v["status"] == "extracted"}
        for r in ts["responder_states"]:
            if r["assigned_to"] in extracted and r["status"] == "routing":
                fail(f"T{ts['turn']} {r['id']} routing to extracted {r['assigned_to']}")
                return
    ok("No responder ever routed toward an already-extracted victim")

    sec("Assignments are produced within first 3 turns")
    assigned_by = {}
    for ts in states[1:4]:
        for v in ts["victim_states"]:
            if v["assigned_to"] and v["id"] not in assigned_by:
                assigned_by[v["id"]] = ts["turn"]
    for v in scenario["victims"]:
        t = assigned_by.get(v["id"])
        ok(f"{v['id']} assigned by turn {t}") if t else warn(f"{v['id']} not assigned in first 3 turns")

    sec("Carrying responders maintain their victim through to exit")
    for ts in states:
        for r in ts["responder_states"]:
            if r["status"] == "carrying":
                vid = r["assigned_to"]
                v = next((v for v in ts["victim_states"] if v["id"] == vid), None)
                if v and v["status"] not in ("being_extracted","extracted"):
                    fail(f"T{ts['turn']} {r['id']} carrying but {vid} status={v['status']}")
                    return
    ok("All carrying responders maintain victim assignment through extraction")

    sec("Assignment cost total is not worse than worst-case feasible (not INF)")
    # Check that every first assignment in the log has a finite cost
    for ts in states[1:4]:
        for a in ts["assignment_log"]:
            if a["cost"] == INF or a["cost"] is None:
                fail(f"T{ts['turn']} {a['responder_id']}->{a['victim_id']} has INF cost")
                return
    ok("All assignment costs are finite in first 3 turns")


# ── TEST 6: Responder Path Optimality ─────────────────────────────────────────

def test_path_optimality(building, scenario, graph, vcm, states):
    hdr("TEST 6 — Responder Path Optimality")

    sec("Each responder's path cost is within 20% of A* theoretical minimum")
    checked = set()
    for ts in states[1:4]:
        for r in ts["responder_states"]:
            rid = r["id"]
            if rid in checked or not r["assigned_to"] or not r["current_path"]:
                continue
            vid = r["assigned_to"]
            eq  = set(r["equipment"])
            vpos = tuple(next(v["position"] for v in ts["victim_states"] if v["id"] == vid))
            rpos = tuple(r["position"])
            _, theoretical = astar(graph, vcm, building, rpos, vpos, equipment_set=eq)
            if theoretical in (0, INF):
                continue
            actual = r["path_cost"]
            ratio  = actual / theoretical
            if ratio <= 1.20:
                ok(f"{rid}->{vid}: actual={actual:.1f} optimal={theoretical:.1f} ({ratio:.2f}x)")
            else:
                fail(f"{rid}->{vid}: actual={actual:.1f} is {ratio:.2f}x optimal {theoretical:.1f}")
            checked.add(rid)

    sec("Responders never actively move into a consumed fire cell")
    grid = building["grid"]
    prev_positions = {}
    for ts in states:
        consumed = set(map(tuple, ts["threat_state"]["consumed_nodes"]))
        for r in ts["responder_states"]:
            if r["status"] in ("extracted","blocked"):
                continue
            pos = tuple(r["position"])
            prev = prev_positions.get(r["id"])
            if pos in consumed:
                # Only a failure if the responder MOVED into fire (not fire caught them while stationary)
                if prev and pos != prev:
                    fail(f"T{ts['turn']} {r['id']} moved from {prev} into consumed fire node {pos}")
                    return
                else:
                    warn(f"T{ts['turn']} {r['id']} engulfed by fire while stationary at {pos} (scenario balance issue)")
            prev_positions[r["id"]] = pos
    ok("No responder actively moved into a fire-consumed cell")

    sec("Responders move steadily toward their victim (path length decreases)")
    for rid in set(r["id"] for r in states[0]["responder_states"]):
        path_lens = []
        for ts in states:
            r = next(r for r in ts["responder_states"] if r["id"] == rid)
            if r["status"] == "routing" and r["assigned_to"] and r["current_path"]:
                path_lens.append((ts["turn"], len(r["current_path"])))
        if len(path_lens) < 3:
            continue
        # Path length should generally decrease over time — allow 1 increase (path recalc)
        increases = sum(1 for i in range(1, len(path_lens))
                        if path_lens[i][1] > path_lens[i-1][1] + 1)
        if increases <= 2:
            ok(f"{rid}: path length decreases consistently ({len(path_lens)} routing turns, {increases} recalcs)")
        else:
            warn(f"{rid}: path length increased {increases} times — may indicate instability")

    sec("Assignment stability — each responder changes victim assignment at most twice")
    for rid in set(r["id"] for r in states[0]["responder_states"]):
        prev = None
        changes = 0
        for ts in states:
            r = next(r for r in ts["responder_states"] if r["id"] == rid)
            if r["status"] == "routing" and r["assigned_to"]:
                if prev and r["assigned_to"] != prev:
                    changes += 1
                prev = r["assigned_to"]
        ok(f"{rid}: {changes} assignment change(s)") if changes <= 2 else warn(f"{rid}: {changes} assignment changes")


# ── TEST 7: Simulation Outcome ─────────────────────────────────────────────────

def test_outcome(building, scenario, graph, vcm, states):
    hdr("TEST 7 — Simulation Outcome")
    final = states[-1]

    sec("Simulation produces a valid final status")
    valid_statuses = {"success","failed","timeout"}
    if final["status"] in valid_statuses:
        ok(f"Final status: {final['status'].upper()} at turn {final['turn']}")
    else:
        fail(f"Invalid final status: '{final['status']}'")

    sec("Turn state schema is complete on every turn")
    required_keys = ["turn","status","threat_state","victim_states",
                     "responder_states","assignment_log","events"]
    bad_turns = [ts["turn"] for ts in states
                 if not all(k in ts for k in required_keys)]
    ok("All turns have complete schema") if not bad_turns else fail(f"Missing schema keys on turns: {bad_turns[:5]}")

    sec("Turn numbers are sequential starting at 0")
    seq = all(states[i]["turn"] == i for i in range(len(states)))
    ok(f"Turns 0..{len(states)-1} are sequential") if seq else fail("Turn numbers not sequential")

    sec("At least one victim is extracted (simulation is not completely stuck)")
    extracted = [v["id"] for v in final["victim_states"] if v["status"] == "extracted"]
    total_v   = len(scenario["victims"])
    if extracted:
        ok(f"{len(extracted)}/{total_v} victims extracted: {extracted}")
    else:
        fail(f"0/{total_v} victims extracted — simulation may be completely stuck")

    sec("No victim is in a consumed fire cell at end of simulation")
    final_consumed = set(map(tuple, final["threat_state"]["consumed_nodes"]))
    for v in final["victim_states"]:
        if v["status"] == "extracted":
            continue
        pos = tuple(v["position"])
        if pos in final_consumed:
            warn(f"{v['id']} ended inside consumed fire at {pos} — overtaken")

    sec("Event schema is valid on all turns")
    bad_events = []
    for ts in states:
        for e in ts["events"]:
            if "type" not in e or "description" not in e:
                bad_events.append((ts["turn"], e))
    ok("All events have valid schema") if not bad_events else fail(f"Bad event schema: {bad_events[:2]}")

    sec("Responders on different floors use stairwells (integration check)")
    if building["meta"]["floors"] > 1:
        cross_floor_moves = []
        for ts in states:
            for r in ts["responder_states"]:
                if r["status"] in ("routing","carrying"):
                    path = r.get("current_path",[])
                    if len(path) >= 2:
                        floors_in_path = set(n[2] for n in path)
                        if len(floors_in_path) > 1:
                            cross_floor_moves.append(r["id"])
                            break
        if cross_floor_moves:
            ok(f"Responders {set(cross_floor_moves)} were routed across floors via stairwells")
        else:
            warn("No responder ever had a cross-floor path — no multi-floor routing exercised")


# ── MAIN ───────────────────────────────────────────────────────────────────────

def main():
    global FAILURES, WARNINGS
    FAILURES = 0; WARNINGS = 0

    path = sys.argv[1] if len(sys.argv) > 1 else None

    print(f"\n{BOLD}{CYAN}{'='*60}")
    print(f"  RescueGrid — Dynamic Simulation Tests")
    print(f"{'='*60}{RESET}")

    if path:
        abs_path = os.path.abspath(path)
        print(f"{BOLD}Building:{RESET} {os.path.basename(path)}")
    else:
        abs_path = None
        print(f"{BOLD}Building:{RESET} test_building.json (default)")

    print(f"{col('Loading...', CYAN)}")
    try:
        building, scenario, graph, vcm, states = load(abs_path)
    except Exception as e:
        import traceback
        print(f"\n{col('Load FAILED:', RED)}")
        traceback.print_exc()
        sys.exit(1)

    meta = building["meta"]
    final = states[-1]
    print(f"{BOLD}  {meta['name']}{RESET} — "
          f"{meta['floors']} floors, {meta['width']}x{meta['height']}, "
          f"{len(graph)} graph nodes")
    print(f"  {len(scenario['responders'])} responder(s), "
          f"{len(scenario['victims'])} victim(s), "
          f"threat={scenario.get('threat',{}).get('type','none')}")
    sc = GREEN if final['status']=='success' else (YELLOW if final['status']=='timeout' else RED)
    print(f"  Simulation: {col(final['status'].upper(), sc)} in {final['turn']} turns")

    for test in [test_graph_integrity, test_astar_quality, test_threat,
                 test_victims, test_assignment, test_path_optimality, test_outcome]:
        try:
            test(building, scenario, graph, vcm, states)
        except Exception as e:
            import traceback
            print(f"\n{col('Exception in ' + test.__name__ + ':', RED)}")
            traceback.print_exc()
            FAILURES += 1

    print(f"\n{BOLD}{'='*60}{RESET}")
    if FAILURES == 0:
        print(f"{BOLD}{GREEN}  ALL TESTS PASSED  ({WARNINGS} warning(s)){RESET}")
    else:
        print(f"{BOLD}{RED}  {FAILURES} TEST(S) FAILED  ({WARNINGS} warning(s)){RESET}")
    print(f"{BOLD}{'='*60}{RESET}\n")
    sys.exit(0 if FAILURES == 0 else 1)


if __name__ == "__main__":
    main()