"""
graph.py — RescueGrid 3D graph builder.

Converts the dense voxel grid into a weighted adjacency graph.
Nodes are (x, y, z) tuples.

Edge cost rules (base, before equipment modifiers):
  floor          -> 1.0
  door unlocked  -> 1.0   (locked -> INF until equipment check in A*)
  hazard         -> cell_properties traversal_cost_multiplier
  stairwell      -> vertical_connection traversal_cost (default 3)
  window         -> vertical_connection traversal_cost (default 5+2z)
                   (requires ladder above z=0 — enforced in A*)
  elevator       -> traversal_cost if enabled, else INF
"""

import math
from collections import defaultdict
from compiler import cell_key

INF = math.inf
PASSABLE = {"floor", "door", "stairwell", "window", "hazard", "elevator"}
HORIZONTAL_DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def build_graph(building, scenario_config=None):
    """
    Build the weighted graph from the compiled building dict.

    Returns
    -------
    graph        : dict  {(x,y,z): [(neighbour_xyz, base_cost), ...]}
    vert_conn_map: dict  {(x,y,z): vertical_connection_dict}
    """
    grid       = building["grid"]
    meta       = building["meta"]
    cell_props = building["cell_properties"]
    vert_conns = building["vertical_connections"]
    exit_nodes = building["exit_nodes"]

    floors = meta["floors"]
    width  = meta["width"]
    height = meta["height"]

    elevator_enabled = (scenario_config or {}).get("elevator_enabled", False)

    # ── vertical connection lookups ───────────────────────────────────────────
    vert_by_xy = defaultdict(list)
    for vc in vert_conns:
        vert_by_xy[(vc["x"], vc["y"])].append(vc)

    vert_conn_map = {}
    for vc in vert_conns:
        x, y = vc["x"], vc["y"]
        if vc["type"] == "window":
            z = vc["floor"]
            vert_conn_map[(x, y, z)] = vc
        else:
            for z in vc.get("floors", []):
                vert_conn_map[(x, y, z)] = vc

    # ── helpers ───────────────────────────────────────────────────────────────
    def cell_type(x, y, z):
        if x < 0 or x >= width or y < 0 or y >= height or z < 0 or z >= floors:
            return "wall"
        return grid[z][y][x]

    def is_passable(x, y, z):
        ct = cell_type(x, y, z)
        if ct not in PASSABLE:
            return False
        if ct == "elevator" and not elevator_enabled:
            return False
        return True

    def base_cost(x, y, z):
        ct = cell_type(x, y, z)
        if ct == "hazard":
            k = cell_key(x, y, z)
            return cell_props.get(k, {}).get("traversal_cost_multiplier", 2.0)
        return 1.0

    # ── build adjacency graph ─────────────────────────────────────────────────
    graph = defaultdict(list)

    for z in range(floors):
        for y in range(height):
            for x in range(width):
                if not is_passable(x, y, z):
                    continue
                node = (x, y, z)
                ct   = cell_type(x, y, z)

                # Horizontal neighbours
                for dx, dy in HORIZONTAL_DIRS:
                    nx, ny = x + dx, y + dy
                    if is_passable(nx, ny, z):
                        graph[node].append(((nx, ny, z), base_cost(nx, ny, z)))

                # Stairwell / elevator vertical neighbours
                if ct in ("stairwell", "elevator"):
                    added_vert = set()
                    for vc in vert_by_xy.get((x, y), []):
                        if vc["type"] not in ("stairwell", "elevator"):
                            continue
                        if vc["type"] == "elevator" and not elevator_enabled:
                            continue
                        vc_floors = vc.get("floors", [])
                        if z not in vc_floors:
                            continue
                        idx = vc_floors.index(z)
                        tc  = vc.get("traversal_cost", 3)
                        for dz in (-1, 1):
                            nz   = z + dz
                            nidx = idx + dz
                            if (0 <= nidx < len(vc_floors)
                                    and vc_floors[nidx] == nz
                                    and (x, y, nz) not in added_vert):
                                target_ct = cell_type(x, y, nz)
                                if target_ct in ("stairwell", "elevator"):
                                    graph[node].append(((x, y, nz), tc))
                                    added_vert.add((x, y, nz))

                # Window exits (outbound: window -> nearest exit node)
                # Inbound edges are already added by the horizontal loop above
                # because window cells are in PASSABLE.
                if ct == "window":
                    vc  = vert_conn_map.get((x, y, z))
                    tc  = 5 + 2 * z
                    if vc and vc["type"] == "window":
                        tc = vc.get("traversal_cost", tc)
                    best_exit = _nearest_exit(x, y, z, exit_nodes)
                    if best_exit:
                        graph[node].append((best_exit, tc))

    # Wire exit nodes into adjacent passable cells
    for en in exit_nodes:
        ex, ey, ez = en["x"], en["y"], en["z"]
        enode = (ex, ey, ez)
        for dx, dy in HORIZONTAL_DIRS:
            nx, ny = ex + dx, ey + dy
            if is_passable(nx, ny, ez):
                nbr  = (nx, ny, ez)
                cost = base_cost(nx, ny, ez)
                existing_from_e = {n for n, _ in graph[enode]}
                if nbr not in existing_from_e:
                    graph[enode].append((nbr, cost))
                existing_from_n = {n for n, _ in graph[nbr]}
                if enode not in existing_from_n:
                    graph[nbr].append((enode, cost))

    return dict(graph), vert_conn_map


def _nearest_exit(x, y, z, exit_nodes):
    best   = None
    best_d = INF
    for en in exit_nodes:
        d = abs(en["x"] - x) + abs(en["y"] - y) + abs(en["z"] - z) * 4
        if d < best_d:
            best_d = d
            best   = (en["x"], en["y"], en["z"])
    return best


def equipment_edge_cost(base, nx, ny, nz, cell_props, vert_conn_map,
                        equipment_set, building):
    """
    Adjust a base edge cost for a specific responder's equipment.
    Returns INF if the cell is impassable for this responder.
    """
    grid = building["grid"]
    meta = building["meta"]
    floors, width, height = meta["floors"], meta["width"], meta["height"]

    if nx < 0 or nx >= width or ny < 0 or ny >= height or nz < 0 or nz >= floors:
        return INF

    ct    = grid[nz][ny][nx]
    k     = cell_key(nx, ny, nz)
    props = cell_props.get(k, {})

    if ct == "door":
        if props.get("locked", False):
            req = props.get("requires")
            if req and req not in equipment_set:
                return INF
        return base

    if ct == "window":
        if nz > 0:
            vc  = vert_conn_map.get((nx, ny, nz))
            req = (vc or {}).get("requires")
            if req and req not in equipment_set:
                return INF
        vc   = vert_conn_map.get((nx, ny, nz))
        cost = (vc or {}).get("traversal_cost", 5 + 2 * nz)
        if "ladder" in equipment_set:
            cost = max(1, cost - 2)
        return cost

    if ct in ("stairwell", "elevator"):
        vc = vert_conn_map.get((nx, ny, nz))
        if vc:
            return vc.get("traversal_cost", 3)
        return base

    if ct == "hazard":
        mult = props.get("traversal_cost_multiplier", 2.0)
        if "drone" in equipment_set:
            mult = 1.0 + (mult - 1.0) / 2.0
        return mult

    return base


if __name__ == "__main__":
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from compiler import build_test_building

    building, scenario = build_test_building()
    graph, vert_conn_map = build_graph(building, scenario.get("simulation_config"))

    total_nodes = len(graph)
    total_edges = sum(len(v) for v in graph.values())
    print(f"Graph: {total_nodes} nodes, {total_edges} directed edges")

    sw = (3, 3, 0)
    nbrs = graph.get(sw, [])
    vert = [n for n, _ in nbrs if n[2] != 0]
    print(f"West stairwell (3,3,0) vertical neighbours: {vert}")
    assert (3, 3, 1) in vert, "Must connect to floor 1"

    sw1 = (3, 3, 1)
    nbrs1 = graph.get(sw1, [])
    to_f0 = [n for n, _ in nbrs1 if n[2] == 0]
    to_f2 = [n for n, _ in nbrs1 if n[2] == 2]
    print(f"West stairwell (3,3,1) -> floor 0: {to_f0}  -> floor 2: {to_f2}")
    assert to_f0 and to_f2, "Floor 1 must connect both up and down"

    win_nodes = [(x,y,z) for (x,y,z) in graph if building["grid"][z][y][x] == "window"]
    print(f"Window nodes in graph: {win_nodes}")
    assert win_nodes, "Window cells must appear in graph"

    print("graph.py OK")
