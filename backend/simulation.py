"""
simulation.py — RescueGrid main simulation loop.

Orchestrates the four per-turn steps:
  1. Threat propagation
  2. Victim movement + urgency scoring
  3. Responder assignment (Hungarian)
  4. Responder routing (A*)

Returns an array of turn_state objects matching the rescuegrid-v1 schema.
"""

import math
import copy
import random

from compiler import build_test_building
from graph    import build_graph
from astar    import astar, nearest_exit
from threat   import make_threat, FireThreat
from victims  import init_victim_states, move_victims, compute_urgency
from assignment import init_responder_states, solve_assignment

INF = math.inf


# ── simulation state helpers ──────────────────────────────────────────────────

def make_turn_state(turn, status, threat_type, consumed, frontier,
                    blocked_conns, hostile_pos, hostile_proj,
                    victim_states, responder_states, assignments, events):
    return {
        "turn":   turn,
        "status": status,
        "threat_state": {
            "type":                    threat_type,
            "consumed_nodes":          [list(n) for n in consumed],
            "frontier_nodes":          [list(n) for n in frontier],
            "blocked_connections":     blocked_conns,
            "hostile_agent_position":  list(hostile_pos) if hostile_pos else None,
            "hostile_agent_projected_path": [list(n) for n in hostile_proj] if hostile_proj else None,
        },
        "victim_states":    copy.deepcopy(victim_states),
        "responder_states": copy.deepcopy(responder_states),
        "assignment_log":   copy.deepcopy(assignments),
        "events":           copy.deepcopy(events),
    }


def _node_list(nodes):
    return [tuple(n) for n in nodes]


# ── main loop ─────────────────────────────────────────────────────────────────

def run_simulation(building, scenario, rng=None):
    """
    Run the full simulation and return a list of turn_state dicts.

    Parameters
    ----------
    building : compiled building dict (from compiler.build_test_building or equivalent)
    scenario : scenario dict from the JSON
    rng      : random.Random instance (for deterministic tests)

    Returns
    -------
    turn_states : list of turn_state dicts, one per turn (turn 0 = initial state)
    """
    rng = rng or random.Random()
    cfg = scenario.get("simulation_config", {})
    max_turns      = cfg.get("max_turns",      40)
    urgency_weight = cfg.get("urgency_weight",  1.5)

    # Build graph
    graph, vert_conn_map = build_graph(building, cfg)

    # Initialise agents
    responders = init_responder_states(scenario["responders"])
    victims    = init_victim_states(scenario["victims"])

    # Initialise threat
    threat_cfg = scenario["threat"]
    threat = make_threat(threat_cfg)
    origin = threat_cfg["origin"]
    consumed = [[origin["x"], origin["y"], origin["z"]]]

    threat_type = threat_cfg["type"]
    turn_states = []

    # Compute initial frontier + urgency
    consumed_set = set(map(tuple, consumed))
    frontier     = threat.get_frontier(graph, consumed_set)
    victims      = compute_urgency(graph, building, victims, consumed, building["exit_nodes"])

    turn_states.append(make_turn_state(
        0, "running", threat_type, consumed_set, frontier,
        [], None, None, victims, responders, [], []
    ))

    for turn in range(1, max_turns + 1):
        events = []

        # ── Step 1: Threat propagation ────────────────────────────────────────
        victim_positions    = [v["position"] for v in victims if v["status"] != "extracted"]
        responder_positions = [r["position"] for r in responders if r["status"] != "extracted"]

        if threat_type == "fire":
            consumed = threat.propagate(graph, building, consumed, rng)
        else:
            consumed = threat.propagate(
                graph, building, consumed, rng,
                victim_positions=victim_positions,
                responder_positions=responder_positions
            )

        consumed_set = set(map(tuple, consumed))
        frontier     = threat.get_frontier(graph, consumed_set)

        # Check for newly blocked connections
        blocked_conns = []
        if isinstance(threat, FireThreat):
            blocked_conns = threat.blocked_connections(building, consumed_set)
            for bc in blocked_conns:
                events.append({
                    "type":        "stairwell_consumed",
                    "description": f"Connection '{bc}' consumed by fire.",
                    "agents_affected": [],
                    "location":    None,
                })

        # Check if any victim has been consumed
        for v in victims:
            if v["status"] == "extracted":
                continue
            if tuple(v["position"]) in consumed_set:
                events.append({
                    "type":        "victim_in_danger",
                    "description": f"{v['id']} overtaken by threat.",
                    "agents_affected": [v["id"]],
                    "location":    v["position"],
                })

        # ── Step 2: Victim movement ───────────────────────────────────────────
        victims = move_victims(graph, building, victims, consumed, turn_number=turn)
        victims = compute_urgency(graph, building, victims, consumed, building["exit_nodes"])

        for v in victims:
            if v["turns_until_threat"] is not None and v["turns_until_threat"] <= 2:
                if v["status"] != "extracted":
                    events.append({
                        "type":        "victim_in_danger",
                        "description": f"{v['id']} has {v['turns_until_threat']} turns until threat reaches them.",
                        "agents_affected": [v["id"]],
                        "location":    v["position"],
                    })

        # ── Step 3: Responder assignment ──────────────────────────────────────
        penalty_map = threat.penalty_map(consumed_set, frontier)
        assignments, contention_map = solve_assignment(
            responders, victims, graph, vert_conn_map, building,
            scenario_config=cfg,
            threat_penalty_map=penalty_map
        )

        # Remove assignments that conflict with already-locked responders.
        # A victim is locked if a routing responder with a valid path already
        # owns it. The locked responder keeps priority; the new assignment is
        # dropped so the displaced responder can pick up an uncontested victim.
        locked_victims = {
            r["assigned_to"]
            for r in responders
            if r["status"] == "routing"
            and r["assigned_to"]
            and r["current_path"]
        }
        # Only exclude from new assignments — don't touch the locked responder itself
        filtered_assignments = []
        for a in assignments:
            locker = next(
                (r for r in responders
                 if r["assigned_to"] == a["victim_id"]
                 and r["id"] != a["responder_id"]
                 and r["status"] == "routing"
                 and r["current_path"]),
                None
            )
            if locker is None:
                filtered_assignments.append(a)
            # else: skip — victim already claimed by a locked responder
        assignments = filtered_assignments

        # Update responder assigned_to
        assigned = {a["responder_id"]: a for a in assignments}
        for r in responders:
            if r["status"] in ("extracted", "carrying"):
                continue
            a = assigned.get(r["id"])
            # If this responder already has an assignment and a valid path,
            # keep it — only switch if the path is gone or victim extracted.
            if r["assigned_to"] and r["current_path"]:
                current_vid = r["assigned_to"]
                current_v = vic_map.get(current_vid)
                if current_v and current_v["status"] not in ("extracted", "being_extracted"):
                    # Check no other responder already committed to this victim
                    already_claimed = any(
                        other["id"] != r["id"]
                        and other["assigned_to"] == current_vid
                        and other["status"] == "routing"
                        and other["current_path"]
                        for other in responders
                        if other["id"] < r["id"]  # lower ID wins tie-break
                    )
                    if not already_claimed:
                        from astar import astar as _astar
                        refreshed, cost = _astar(
                            graph, vert_conn_map, building,
                            tuple(r["position"]), tuple(current_v["position"]),
                            equipment_set=set(r["equipment"]),
                            threat_penalty_map=penalty_map,
                            contention_penalty_map=contention_map
                        )
                        if refreshed and cost < INF:
                            r["current_path"] = refreshed
                            r["path_cost"]    = cost
                            continue
                    # Victim claimed by another or path gone — fall through to reassign
                    r["assigned_to"]  = None
                    r["current_path"] = []
            if a:
                r["assigned_to"]  = a["victim_id"]
                r["current_path"] = a["path"]
                r["path_cost"]    = a["cost"]
            else:
                r["assigned_to"]  = None
                r["current_path"] = []

        # Update victim assigned_to
        vic_map = {v["id"]: v for v in victims}
        for v in victims:
            v["assigned_to"] = None
        for a in assignments:
            v = vic_map.get(a["victim_id"])
            if v:
                v["assigned_to"] = a["responder_id"]

        # ── Step 4: Responder routing ─────────────────────────────────────────
        for r in responders:
            if r["status"] in ("extracted", "blocked"):
                continue

            r["equipment_used_this_turn"] = []
            path = r.get("current_path", [])

            if r["status"] == "carrying" and (not path or len(path) < 2):
                # Carrying responder has no exit path yet — calculate one now.
                # This runs once when carrying begins, and again only if the
                # path gets fully consumed (handled below).
                exit_path, _, exit_id = nearest_exit(
                    graph, building, tuple(r["position"]),
                    set(r["equipment"]), penalty_map
                )
                if exit_path:
                    r["current_path"] = exit_path
                    path = exit_path
                else:
                    r["status"]      = "blocked"
                    r["assigned_to"] = None
                    events.append({
                        "type":        "responder_blocked",
                        "description": f"{r['id']} is blocked — no viable exit.",
                        "agents_affected": [r["id"]],
                        "location":    r["position"],
                    })
                    continue
            elif not path or len(path) < 2:
                continue

            # Before advancing, verify the next step is not on fire.
            # Cached paths become stale when fire spreads into them between
            # the turn the path was calculated and the turn it is walked.
            if len(path) > 1 and tuple(path[1]) in consumed_set:
                if r["status"] == "carrying":
                    exit_path, _, _ = nearest_exit(
                        graph, building, tuple(r["position"]),
                        set(r["equipment"]), penalty_map
                    )
                    if exit_path and len(exit_path) > 1:
                        r["current_path"] = exit_path
                        path = exit_path
                    else:
                        r["status"]      = "blocked"
                        r["assigned_to"] = None
                        events.append({
                            "type":        "responder_blocked",
                            "description": r["id"] + " is blocked — exit path consumed by fire.",
                            "agents_affected": [r["id"]],
                            "location":    r["position"],
                        })
                        continue
                else:
                    # Routing responder — skip this turn, assignment will
                    # recalculate next turn via the threat penalty map
                    continue

            # Advance one step
            next_node = path[1] if len(path) > 1 else path[0]
            nx, ny, nz = next_node
            ct = building["grid"][nz][ny][nx]

            # Record equipment usage
            from graph import cell_key
            props = building["cell_properties"].get(cell_key(nx, ny, nz), {})
            if ct == "door" and props.get("locked"):
                req = props.get("requires")
                if req and req in r["equipment"]:
                    r["equipment_used_this_turn"].append(req)
                    events.append({
                        "type":        "door_breached",
                        "description": f"{r['id']} breached locked door at ({nx},{ny},{nz}) using {req}.",
                        "agents_affected": [r["id"]],
                        "location":    [nx, ny, nz],
                    })
            if ct == "window":
                if "ladder" in r["equipment"]:
                    r["equipment_used_this_turn"].append("ladder")
                    events.append({
                        "type":        "window_used",
                        "description": f"{r['id']} exited via window at ({nx},{ny},{nz}) using ladder.",
                        "agents_affected": [r["id"]],
                        "location":    [nx, ny, nz],
                    })

            r["position"] = list(next_node)
            r["current_path"] = path[1:]

            # Check if responder reached their victim
            if r["assigned_to"]:
                v = vic_map.get(r["assigned_to"])
                if v and tuple(r["position"]) == tuple(v["position"]) and v["status"] not in ("being_extracted", "extracted"):
                    r["status"] = "carrying"
                    v["status"] = "being_extracted"
                    # Release any other responders heading to this same victim
                    for other in responders:
                        if other["id"] != r["id"] and other["assigned_to"] == r["assigned_to"] and other["status"] == "routing":
                            other["assigned_to"]  = None
                            other["current_path"] = []

            # Check if responder reached an exit
            exit_ids = {(en["x"], en["y"], en["z"]) for en in building["exit_nodes"]}
            if tuple(r["position"]) in exit_ids and r["status"] == "carrying":
                r["status"] = "extracted"
                if r["assigned_to"]:
                    v = vic_map.get(r["assigned_to"])
                    if v:
                        v["status"] = "extracted"
                events.append({
                    "type":        "victim_extracted",
                    "description": f"{r['id']} extracted {r['assigned_to']} via exit.",
                    "agents_affected": [r["id"], r["assigned_to"] or ""],
                    "location":    r["position"],
                })

        # ── Termination check ─────────────────────────────────────────────────
        all_extracted = all(v["status"] == "extracted" for v in victims)
        all_blocked   = all(r["status"] in ("blocked", "extracted") for r in responders)

        if all_extracted:
            status = "success"
        elif all_blocked and not all_extracted:
            status = "failed"
        else:
            status = "running"

        # Hostile agent state
        hostile_pos  = None
        hostile_proj = None
        if threat_type == "hostile_agent":
            hostile_pos = consumed[0] if consumed else None

        turn_states.append(make_turn_state(
            turn, status, threat_type,
            consumed_set, frontier, blocked_conns,
            hostile_pos, hostile_proj,
            victims, responders, assignments, events
        ))

        if status in ("success", "failed"):
            break

    if turn_states[-1]["status"] == "running":
        turn_states[-1]["status"] = "timeout"

    return turn_states


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json

    building, scenario = build_test_building()
    rng = random.Random(42)
    states = run_simulation(building, scenario, rng)

    print(f"Simulation completed: {len(states)} turns, final status: {states[-1]['status']}")
    print()

    for ts in states[:6]:
        consumed_count = len(ts["threat_state"]["consumed_nodes"])
        r_statuses = {r["id"]: r["status"] for r in ts["responder_states"]}
        v_statuses = {v["id"]: f"{v['status']}@{v['position']}" for v in ts["victim_states"]}
        events = [e["type"] for e in ts["events"]]
        print(f"Turn {ts['turn']:2d} | consumed={consumed_count:3d} | "
              f"responders={r_statuses} | events={events}")
        for v in ts["victim_states"]:
            print(f"         {v['id']}: {v['status']} pos={v['position']} "
                  f"urgency={v['urgency_score']} assigned_to={v['assigned_to']}")

    # Final assignments summary
    print("\nFinal assignment log:")
    for a in states[-1]["assignment_log"]:
        print(f"  {a['responder_id']} -> {a['victim_id']}  cost={a['cost']:.2f}")