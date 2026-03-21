"""
victims.py — RescueGrid victim movement and urgency scoring.

Each mobile victim flees away from the nearest threat node each turn.
Immobile victims stay put. Injured victims move every other turn.
Victims treat each other's nodes as partially obstructed.
"""

import math
from collections import deque

INF = math.inf

def bfs_distances(graph, sources):
    """
    BFS from all source nodes simultaneously.
    Returns dict {node: min_distance_to_any_source}.
    """
    dist = {}
    queue = deque()
    for s in sources:
        s = tuple(s)
        if s not in dist:
            dist[s] = 0
            queue.append(s)
    while queue:
        node = queue.popleft()
        for nbr, _ in graph.get(node, []):
            if nbr not in dist:
                dist[nbr] = dist[node] + 1
                queue.append(nbr)
    return dist


def move_victims(graph, building, victim_states, consumed_nodes,
                 partial_obstruction_cost=3.0, turn_number=0):
    """
    Move all victims one step away from the threat frontier.

    Parameters
    ----------
    graph              : adjacency graph from build_graph()
    building           : compiled building dict
    victim_states      : list of victim state dicts (mutated in place)
    consumed_nodes     : list of [x,y,z] currently consumed by threat
    partial_obstruction_cost : extra cost added to move into another victim's cell
    turn_number        : used to skip injured victims on odd turns

    Returns
    -------
    updated victim_states list
    """
    consumed_set = set(tuple(n) for n in consumed_nodes)

    # BFS distance from all consumed nodes
    threat_dist = bfs_distances(graph, consumed_nodes)

    # Current positions of ALL victims (for mutual obstruction)
    occupied = {tuple(v["position"]): v["id"] for v in victim_states
                if v["status"] != "extracted"}

    for v in victim_states:
        if v["status"] in ("extracted", "being_extracted"):
            continue
        if v["mobility"] == "immobile":
            continue
        if v["mobility"] == "injured" and turn_number % 2 != 0:
            continue

        pos = tuple(v["position"])

        if pos in consumed_set:
            # Victim has been overtaken — mark as in danger (handled by simulation)
            v["status"] = "waiting"
            continue

        # Score each neighbour: higher threat_dist = safer
        best_pos   = pos
        best_score = threat_dist.get(pos, INF)

        for nbr, _ in graph.get(pos, []):
            if nbr in consumed_set:
                continue

            score = threat_dist.get(nbr, INF)

            # Partial obstruction if another victim is already there
            if nbr in occupied and occupied[nbr] != v["id"]:
                score -= partial_obstruction_cost

            if score > best_score:
                best_score = score
                best_pos   = nbr

        if best_pos != pos:
            # Update occupied map
            del occupied[pos]
            occupied[best_pos] = v["id"]
            v["position"] = list(best_pos)
            v["status"] = "fleeing"
        else:
            v["status"] = "waiting"

    return victim_states


def compute_urgency(graph, building, victim_states, consumed_nodes, exit_nodes):
    """
    Compute urgency_score and turns_until_threat for each victim.

    urgency_score: lower = more urgent.
    turns_until_threat: BFS steps from nearest consumed node to victim.
    """
    consumed_set = set(tuple(n) for n in consumed_nodes)

    # BFS distance from threat
    threat_dist = bfs_distances(graph, consumed_nodes)

    # BFS distance from each victim to exits
    for v in victim_states:
        if v["status"] == "extracted":
            v["urgency_score"]     = INF
            v["turns_until_threat"] = INF
            continue

        pos = tuple(v["position"])
        turns_to_threat = threat_dist.get(pos, INF)

        # Count viable exit routes (exits reachable without crossing consumed nodes)
        viable_exits = _count_viable_exits(graph, pos, consumed_set, exit_nodes, building)
        viable_exits = max(viable_exits, 1)  # avoid division by zero

        if turns_to_threat == INF:
            urgency = INF
        else:
            urgency = turns_to_threat / viable_exits

        v["urgency_score"]      = round(urgency, 2)
        v["turns_until_threat"] = turns_to_threat if turns_to_threat < INF else None

    return victim_states


def _count_viable_exits(graph, start, consumed_set, exit_nodes, building):
    """Count exit nodes reachable from start without crossing consumed nodes."""
    exit_set = {(en["x"], en["y"], en["z"]) for en in exit_nodes}
    reachable = set()
    visited = {start}
    queue = deque([start])

    while queue:
        node = queue.popleft()
        if node in exit_set:
            reachable.add(node)
            continue
        for nbr, _ in graph.get(node, []):
            if nbr not in visited and nbr not in consumed_set:
                visited.add(nbr)
                queue.append(nbr)

    return len(reachable)


def init_victim_states(scenario_victims):
    """Build initial victim state objects from scenario definition."""
    states = []
    for v in scenario_victims:
        states.append({
            "id":               v["id"],
            "label":            v.get("label", v["id"]),
            "position":         [v["x"], v["y"], v["z"]],
            "mobility":         v.get("mobility", "mobile"),
            "status":           "waiting",
            "urgency_score":    INF,
            "turns_until_threat": None,
            "assigned_to":      None,
        })
    return states


if __name__ == "__main__":
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from compiler import build_test_building
    from graph import build_graph

    building, scenario = build_test_building()
    graph, _ = build_graph(building, scenario.get("simulation_config"))

    victim_states = init_victim_states(scenario["victims"])
    consumed = [[scenario["threat"]["origin"]["x"],
                 scenario["threat"]["origin"]["y"],
                 scenario["threat"]["origin"]["z"]]]

    print("Initial victim positions:")
    for v in victim_states:
        print(f"  {v['id']} at {v['position']} ({v['mobility']})")

    # Simulate 5 turns of movement
    for turn in range(5):
        victim_states = move_victims(graph, building, victim_states, consumed, turn_number=turn)
        victim_states = compute_urgency(graph, building, victim_states,
                                        consumed, building["exit_nodes"])

    print("\nAfter 5 turns:")
    for v in victim_states:
        print(f"  {v['id']} at {v['position']} status={v['status']} "
              f"urgency={v['urgency_score']} turns_to_threat={v['turns_until_threat']}")

    # Verify immobile victim did not move
    v3 = next(v for v in victim_states if v["id"] == "V3")
    sv3 = next(v for v in scenario["victims"] if v["id"] == "V3")
    assert v3["position"] == [sv3["x"], sv3["y"], sv3["z"]], "Immobile victim must not move"
    print("Immobile victim constraint OK")
