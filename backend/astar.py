"""
astar.py — RescueGrid State-Space A* pathfinder.

Finds the least-cost path through the 3D graph for a specific responder,
accounting for their equipment set and a threat penalty map.
"""

import math
import heapq
from graph import equipment_edge_cost

INF = math.inf


def heuristic(a, b):
    """3D Manhattan distance. Admissible for unit-cost grids."""
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2]) * 3


def astar(graph, vert_conn_map, building, start, goal, equipment_set,
          threat_penalty_map=None, contention_penalty_map=None):
    """
    A* search from start to goal for a responder with the given equipment.

    Parameters
    ----------
    graph              : dict from graph.build_graph()
    vert_conn_map      : dict from graph.build_graph()
    building           : compiled building dict
    start              : (x, y, z) tuple
    goal               : (x, y, z) tuple
    equipment_set      : set of strings e.g. {'ax', 'medic_kit'}
    threat_penalty_map : dict {(x,y,z): penalty_cost} — nodes consumed or
                         projected by threat; added to edge cost
    contention_penalty_map : dict {(x,y,z): penalty} — nodes claimed by
                             earlier-assigned responders this turn

    Returns
    -------
    path : list of (x,y,z) from start to goal (inclusive), or [] if no path
    cost : total path cost (float), or INF if no path
    """
    if start == goal:
        return [start], 0.0

    cell_props = building["cell_properties"]
    threat_penalty  = threat_penalty_map or {}
    contention      = contention_penalty_map or {}

    open_heap = []          # (f, g, node)
    heapq.heappush(open_heap, (heuristic(start, goal), 0.0, start))

    came_from = {}
    g_score   = {start: 0.0}
    closed    = set()

    while open_heap:
        f, g, current = heapq.heappop(open_heap)

        if current in closed:
            continue
        closed.add(current)

        if current == goal:
            return _reconstruct(came_from, current), g

        for neighbour, base in graph.get(current, []):
            if neighbour in closed:
                continue

            nx, ny, nz = neighbour
            adj_cost = equipment_edge_cost(
                base, nx, ny, nz,
                cell_props, vert_conn_map, equipment_set, building
            )

            if adj_cost >= INF:
                continue

            # Threat penalty — responders should route around consumed/projected nodes
            adj_cost += threat_penalty.get(neighbour, 0.0)
            # Contention penalty — discourage corridor-sharing with other responders
            adj_cost += contention.get(neighbour, 0.0)

            tentative_g = g + adj_cost
            if tentative_g < g_score.get(neighbour, INF):
                g_score[neighbour] = tentative_g
                came_from[neighbour] = current
                f_new = tentative_g + heuristic(neighbour, goal)
                heapq.heappush(open_heap, (f_new, tentative_g, neighbour))

    return [], INF


def _reconstruct(came_from, current):
    path = [current]
    while current in came_from:
        current = came_from[current]
        path.append(current)
    path.reverse()
    return path


def nearest_exit(graph, vert_conn_map, building, start, equipment_set, threat_penalty_map=None):
    """
    Find the cheapest path from start to any exit_node.
    Returns (path, cost, exit_id).
    """
    exit_nodes = building["exit_nodes"]
    best_path, best_cost, best_id = [], INF, None

    for en in exit_nodes:
        goal = (en["x"], en["y"], en["z"])
        path, cost = astar(
            graph, vert_conn_map, building,
            start, goal, equipment_set, threat_penalty_map
        )
        if cost < best_cost:
            best_path, best_cost, best_id = path, cost, en["id"]

    return best_path, best_cost, best_id


if __name__ == "__main__":
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from compiler import build_test_building
    from graph import build_graph

    building, scenario = build_test_building()
    graph, vert_conn_map = build_graph(building, scenario.get("simulation_config"))

    # Test 1: responder WITH ax should route through locked Main Office door
    start = (8, 5, 0)
    goal  = (9, 2, 0)  # inside the office region
    path_with_ax, cost_with_ax = astar(
        graph, vert_conn_map, building, start, goal,
        equipment_set={"ax"}
    )
    print(f"With ax    — cost: {cost_with_ax:.1f}, path length: {len(path_with_ax)}")

    # Test 2: responder WITHOUT ax should take longer route
    path_no_ax, cost_no_ax = astar(
        graph, vert_conn_map, building, start, goal,
        equipment_set=set()
    )
    print(f"Without ax — cost: {cost_no_ax:.1f}, path length: {len(path_no_ax)}")

    # Test 3: responder WITH ladder should route to window exit on floor 1
    start_f1 = (8, 2, 1)
    exit_node = building["exit_nodes"][0]
    goal_exit = (exit_node["x"], exit_node["y"], exit_node["z"])

    path_ladder, cost_ladder = astar(
        graph, vert_conn_map, building, start_f1, goal_exit,
        equipment_set={"ladder"}
    )
    path_no_ladder, cost_no_ladder = astar(
        graph, vert_conn_map, building, start_f1, goal_exit,
        equipment_set=set()
    )
    print(f"Floor 1 to exit WITH ladder    — cost: {cost_ladder:.1f}")
    print(f"Floor 1 to exit WITHOUT ladder — cost: {cost_no_ladder:.1f}")

    uses_window_with    = any(building["grid"][n[2]][n[1]][n[0]] == "window" for n in path_ladder)
    uses_window_without = any(building["grid"][n[2]][n[1]][n[0]] == "window" for n in path_no_ladder)
    print(f"Uses window (ladder): {uses_window_with}, uses window (no ladder): {uses_window_without}")
