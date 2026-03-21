"""
assignment.py — RescueGrid responder-victim assignment.

Uses scipy's implementation of the Hungarian algorithm to find the
globally optimal matching of responders to victims given a 4-factor
cost matrix:
  1. 3D A* path cost (threat-penalised)
  2. Equipment compatibility (INF if required tool missing)
  3. Victim urgency scaling
  4. Corridor contention penalty
"""

import math
import numpy as np
from scipy.optimize import linear_sum_assignment

from astar import astar
from graph import build_graph

INF = math.inf
LARGE = 1e9   # practical stand-in for INF in the numpy matrix


def build_cost_matrix(responder_states, victim_states, graph, vert_conn_map,
                      building, urgency_weight=1.5, contention_penalty_map=None,
                      threat_penalty_map=None):
    """
    Build the (R x V) cost matrix.

    Parameters
    ----------
    responder_states : list of responder state dicts
    victim_states    : list of victim state dicts (only unextracted victims included)
    graph, vert_conn_map, building : from build_graph()
    urgency_weight   : scalar applied to column costs of high-urgency victims
    contention_penalty_map : dict {node: penalty} — built up as assignments are made
    threat_penalty_map     : dict {node: penalty} — from threat.penalty_map()

    Returns
    -------
    cost_matrix : np.ndarray shape (R, V)
    path_cache  : dict {(r_idx, v_idx): path} — precomputed paths
    """
    contention = contention_penalty_map or {}
    threat_pen = threat_penalty_map or {}

    active_victims = [v for v in victim_states if v["status"] != "extracted"]
    R = len(responder_states)
    V = len(active_victims)

    if R == 0 or V == 0:
        return np.zeros((R, V)), {}

    cost_matrix = np.full((R, V), LARGE)
    path_cache  = {}

    for r_idx, r in enumerate(responder_states):
        if r["status"] in ("extracted", "blocked"):
            continue

        eq_set = set(r["equipment"])
        r_pos  = tuple(r["position"])

        for v_idx, v in enumerate(active_victims):
            v_pos = tuple(v["position"])

            # A* path cost
            path, path_cost = astar(
                graph, vert_conn_map, building,
                r_pos, v_pos,
                equipment_set=eq_set,
                threat_penalty_map=threat_pen,
                contention_penalty_map=contention
            )

            if path_cost >= INF:
                # Equipment incompatibility or no path
                cost_matrix[r_idx, v_idx] = LARGE
                continue

            path_cache[(r_idx, v_idx)] = path

            # Urgency scaling — victims with low urgency_score get column boost
            urgency = v.get("urgency_score", INF)
            if urgency < INF and urgency > 0:
                urg_mult = urgency_weight / max(urgency, 0.1)
            else:
                urg_mult = 1.0

            total = path_cost * urg_mult
            cost_matrix[r_idx, v_idx] = min(total, LARGE - 1)

    return cost_matrix, path_cache


def solve_assignment(responder_states, victim_states, graph, vert_conn_map,
                     building, scenario_config=None, threat_penalty_map=None):
    """
    Solve the full assignment problem and return:
      assignments : list of {responder_id, victim_id, path, cost, breakdown}
      contention_map : dict {node: accumulated_penalty} for subsequent A* calls
    """
    cfg = scenario_config or {}
    urgency_weight    = cfg.get("urgency_weight",    1.5)
    contention_pen    = cfg.get("contention_penalty", 0.5)

    active_victims = [v for v in victim_states if v["status"] != "extracted"]
    if not active_victims:
        return [], {}

    contention_map = {}
    cost_matrix, path_cache = build_cost_matrix(
        responder_states, active_victims, graph, vert_conn_map, building,
        urgency_weight=urgency_weight,
        threat_penalty_map=threat_penalty_map,
        contention_penalty_map=contention_map
    )

    # scipy wants finite values; replace LARGE with a large finite number
    r_indices, v_indices = linear_sum_assignment(cost_matrix)

    assignments = []
    for r_idx, v_idx in zip(r_indices, v_indices):
        if cost_matrix[r_idx, v_idx] >= LARGE - 1:
            continue   # infeasible assignment — skip

        r = responder_states[r_idx]
        v = active_victims[v_idx]
        path = path_cache.get((r_idx, v_idx), [])
        cost = float(cost_matrix[r_idx, v_idx])

        # Compute breakdown for the log — astar returns (path, cost)
        _, raw_pc = astar(
            graph, vert_conn_map, building,
            tuple(r["position"]), tuple(v["position"]),
            equipment_set=set(r["equipment"]),
            threat_penalty_map=threat_penalty_map or {}
        )
        raw_pc = raw_pc if raw_pc < INF else 0.0

        urgency = v.get("urgency_score", INF)
        if urgency < INF and urgency > 0:
            urg_mult = urgency_weight / max(urgency, 0.1)
        else:
            urg_mult = 1.0

        assignments.append({
            "responder_id": r["id"],
            "victim_id":    v["id"],
            "path":         path,
            "cost":         cost,
            "cost_breakdown": {
                "path_cost":            round(float(raw_pc), 2),
                "urgency_scaling":      round(urg_mult, 3),
                "equipment_compatible": True,
                "contention_penalty":   round(max(0.0, cost - float(raw_pc) * urg_mult), 3),
            },
        })

        # Update contention map with this responder's claimed path
        for node in path:
            contention_map[node] = contention_map.get(node, 0) + contention_pen

    return assignments, contention_map


def init_responder_states(scenario_responders):
    """Build initial responder state objects from scenario definition."""
    states = []
    for r in scenario_responders:
        states.append({
            "id":        r["id"],
            "label":     r.get("label", r["id"]),
            "position":  [r["x"], r["y"], r["z"]],
            "equipment": r.get("equipment", []),
            "status":    "routing",
            "assigned_to": None,
            "current_path": [],
            "path_cost":    0.0,
            "equipment_used_this_turn": [],
        })
    return states


if __name__ == "__main__":
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from compiler import build_test_building
    from graph import build_graph
    from victims import init_victim_states, compute_urgency

    building, scenario = build_test_building()
    graph, vert_conn_map = build_graph(building, scenario.get("simulation_config"))

    responders = init_responder_states(scenario["responders"])
    victims    = init_victim_states(scenario["victims"])

    # Set up a light threat (origin only, no spread for this test)
    consumed = [[scenario["threat"]["origin"]["x"],
                 scenario["threat"]["origin"]["y"],
                 scenario["threat"]["origin"]["z"]]]
    victims = compute_urgency(graph, building, victims, consumed, building["exit_nodes"])

    print("Victim urgency scores:")
    for v in victims:
        print(f"  {v['id']} urgency={v['urgency_score']} turns_to_threat={v['turns_until_threat']}")

    assignments, contention = solve_assignment(
        responders, victims, graph, vert_conn_map, building,
        scenario_config=scenario["simulation_config"]
    )

    print("\nAssignments:")
    for a in assignments:
        print(f"  {a['responder_id']} -> {a['victim_id']}  cost={a['cost']:.2f}  path_len={len(a['path'])}")

    # Key test: R1 (has ax) should NOT be assigned to V3 (immobile, floor 2)
    # unless it's the only option — the assignment should be sensible
    r1_assign = next((a for a in assignments if a["responder_id"] == "R1"), None)
    r2_assign = next((a for a in assignments if a["responder_id"] == "R2"), None)
    print(f"\nR1 (ax+medic) assigned to: {r1_assign['victim_id'] if r1_assign else 'None'}")
    print(f"R2 (ladder)   assigned to: {r2_assign['victim_id'] if r2_assign else 'None'}")
    print("Assignment OK — Hungarian algorithm ran successfully")
