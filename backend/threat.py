"""
threat.py — RescueGrid threat propagation module.

Pluggable interface:
    threat.propagate(graph, building, consumed_nodes, rng) -> new_consumed_nodes

Two implementations:
  FireThreat    — cellular automaton spread with stairwell acceleration
  HostileAgent  — minimax adversarial search with alpha-beta pruning
"""

import math
import random
import heapq
from collections import deque
from graph import cell_key

INF = math.inf


# ── base class ────────────────────────────────────────────────────────────────

class ThreatBase:
    def propagate(self, graph, building, consumed_nodes, rng=None):
        raise NotImplementedError

    def penalty_map(self, consumed_nodes, frontier_nodes, weight=10.0):
        """
        Build the threat penalty map passed to A*.
        Consumed nodes → INF (impassable).
        Frontier nodes → weight (high but traversable in emergencies).
        """
        pm = {}
        for node in consumed_nodes:
            pm[node] = INF
        for node in frontier_nodes:
            if node not in pm:
                pm[node] = weight
        return pm

    def get_frontier(self, graph, consumed_set):
        """All non-consumed neighbours of consumed nodes."""
        frontier = set()
        for node in consumed_set:
            for nbr, _ in graph.get(node, []):
                if nbr not in consumed_set:
                    frontier.add(nbr)
        return frontier


# ── FireThreat ────────────────────────────────────────────────────────────────

class FireThreat(ThreatBase):
    def __init__(self, params):
        self.spread_prob      = params.get("spread_probability",    0.4)
        self.stair_accel      = params.get("stairwell_acceleration", 2.0)
        self.accelerant_bonus = params.get("accelerant_bonus",       0.3)

    def propagate(self, graph, building, consumed_nodes, rng=None):
        """
        Each burning node tries to ignite each adjacent non-burning node.
        Stairwell cells use spread_prob * stair_accel for vertical spread.
        Accelerant cells use spread_prob + accelerant_bonus.
        """
        rng = rng or random
        grid       = building["grid"]
        cell_props = building["cell_properties"]
        meta       = building["meta"]
        floors, w, h = meta["floors"], meta["width"], meta["height"]

        consumed_set  = set(map(tuple, consumed_nodes))
        new_consumed  = set(consumed_set)

        for node in list(consumed_set):
            x, y, z = node
            for nbr, _ in graph.get(node, []):
                nx, ny, nz = nbr
                if nbr in new_consumed:
                    continue

                # Only spread to physically adjacent cells (ignore long-distance
                # window→exit escape-route edges in the graph)
                if abs(nx - x) + abs(ny - y) + abs(nz - z) > 1:
                    continue

                # Determine ignition probability
                ct = grid[nz][ny][nx] if (0 <= nz < floors and 0 <= ny < h and 0 <= nx < w) else "wall"
                if ct in ("wall", "empty"):
                    continue

                # Vertical spread through stairwell
                is_vertical = (nz != z)
                p = self.spread_prob * (self.stair_accel if is_vertical else 1.0)

                # Accelerant bonus
                k = cell_key(nx, ny, nz)
                if cell_props.get(k, {}).get("fire_accelerant", False):
                    p = min(1.0, p + self.accelerant_bonus)

                if rng.random() < p:
                    new_consumed.add(nbr)

        return [list(n) for n in new_consumed]

    def projected_penalty_map(self, graph, consumed_set, lookahead=3, base_weight=20.0):
        """
        Build a penalty map that includes where fire will likely spread.

        Consumed nodes -> INF (impassable now).
        1-step-ahead frontier -> base_weight (fire arrives next turn).
        2-step-ahead frontier -> base_weight * 2/3
        3-step-ahead frontier -> base_weight * 1/3

        Uses worst-case (deterministic) spread: every frontier cell is
        treated as ignited for the next projection step.
        """
        pm = {}
        for node in consumed_set:
            pm[node] = INF

        proj = set(consumed_set)
        for step in range(1, lookahead + 1):
            frontier = self.get_frontier(graph, proj)
            weight = base_weight * (lookahead + 1 - step) / lookahead
            for node in frontier:
                if node not in pm:
                    pm[node] = weight
            proj = proj | frontier

        return pm

    def blocked_connections(self, building, consumed_set):
        """Return ids of vertical connections fully consumed on any floor."""
        blocked = []
        for vc in building["vertical_connections"]:
            if vc["type"] == "window":
                x, y, z = vc["x"], vc["y"], vc["floor"]
                if (x, y, z) in consumed_set:
                    blocked.append(vc["id"])
            else:
                vc_floors = vc.get("floors", [])
                for z in vc_floors:
                    if (vc["x"], vc["y"], z) in consumed_set:
                        blocked.append(vc["id"])
                        break
        return list(set(blocked))


# ── HostileAgent (Minimax + Alpha-Beta) ───────────────────────────────────────

class HostileAgent(ThreatBase):
    def __init__(self, params):
        self.objective  = params.get("objective",    "reach_victim")
        self.depth      = params.get("search_depth", 4)
        self.speed      = params.get("speed",        1)
        self.position   = None   # set externally before first propagate call

    def propagate(self, graph, building, consumed_nodes, rng=None,
                  victim_positions=None, responder_positions=None):
        """
        Move the hostile agent speed steps using minimax with alpha-beta pruning.
        consumed_nodes here is a single-element list: [current position].
        Returns new position as single-element list.
        """
        if not consumed_nodes:
            return consumed_nodes

        current = tuple(consumed_nodes[0])
        victims     = [tuple(v) for v in (victim_positions or [])]
        responders  = [tuple(r) for r in (responder_positions or [])]

        best_pos = current
        for _ in range(self.speed):
            best_pos = self._minimax_move(graph, best_pos, victims, responders)

        self.position = best_pos
        return [list(best_pos)]

    def _minimax_move(self, graph, pos, victims, responders):
        """Return the best next single step from pos using minimax."""
        neighbours = [nbr for nbr, _ in graph.get(pos, [])]
        if not neighbours:
            return pos

        best_val  = -INF
        best_node = pos

        for nbr in neighbours:
            val = self._minimax(graph, nbr, self.depth - 1, False,
                                -INF, INF, victims, responders)
            if val > best_val:
                best_val  = val
                best_node = nbr

        return best_node

    def _minimax(self, graph, pos, depth, is_max, alpha, beta,
                 victims, responders):
        if depth == 0:
            return self._evaluate(pos, victims, responders)

        neighbours = [nbr for nbr, _ in graph.get(pos, [])]
        if not neighbours:
            return self._evaluate(pos, victims, responders)

        if is_max:
            val = -INF
            for nbr in neighbours:
                val = max(val, self._minimax(graph, nbr, depth - 1, False,
                                             alpha, beta, victims, responders))
                alpha = max(alpha, val)
                if beta <= alpha:
                    break   # β-cutoff
            return val
        else:
            val = INF
            for nbr in neighbours:
                val = min(val, self._minimax(graph, nbr, depth - 1, True,
                                             alpha, beta, victims, responders))
                beta = min(beta, val)
                if beta <= alpha:
                    break   # α-cutoff
            return val

    def _evaluate(self, pos, victims, responders):
        """
        Evaluation function — higher is better for the hostile agent.
        """
        if self.objective == "reach_victim":
            if not victims:
                return 0
            # Negative min distance to nearest victim (closer = higher score)
            min_d = min(self._dist(pos, v) for v in victims)
            return -min_d

        if self.objective == "block_responders":
            if not responders:
                return 0
            # Reward being close to responders (blocking paths)
            min_d = min(self._dist(pos, r) for r in responders)
            return -min_d

        if self.objective == "maximize_coverage":
            # Heuristic: reward being far from starting position
            return pos[0] + pos[1] + pos[2]

        return 0

    @staticmethod
    def _dist(a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2]) * 3


# ── factory ───────────────────────────────────────────────────────────────────

def make_threat(threat_config):
    """Instantiate the correct threat class from the scenario threat block."""
    t = threat_config["type"]
    if t == "fire":
        return FireThreat(threat_config.get("fire_params", {}))
    if t == "hostile_agent":
        agent = HostileAgent(threat_config.get("hostile_agent_params", {}))
        origin = threat_config["origin"]
        agent.position = (origin["x"], origin["y"], origin["z"])
        return agent
    raise ValueError(f"Unknown threat type: {t}")


if __name__ == "__main__":
    import sys, os
    sys.path.insert(0, os.path.dirname(__file__))
    from compiler import build_test_building
    from graph import build_graph

    building, scenario = build_test_building()
    graph, _ = build_graph(building, scenario.get("simulation_config"))

    # Test fire spread
    fire = FireThreat(scenario["threat"]["fire_params"])
    origin = scenario["threat"]["origin"]
    consumed = [[origin["x"], origin["y"], origin["z"]]]

    rng = random.Random(42)  # deterministic seed for tests
    for turn in range(5):
        consumed = fire.propagate(graph, building, consumed, rng)
        print(f"Turn {turn+1}: {len(consumed)} nodes consumed")

    assert len(consumed) > 1, "Fire should spread beyond origin"
    print("Fire spread OK")

    # Test hostile agent
    agent = HostileAgent({"objective": "reach_victim", "search_depth": 3, "speed": 1})
    agent.position = (14, 10, 0)
    victims    = [(3, 2, 0)]
    responders = [(8, 1, 0)]

    pos = [[14, 10, 0]]
    for turn in range(3):
        pos = agent.propagate(graph, building, pos,
                              victim_positions=victims,
                              responder_positions=responders)
        print(f"Hostile agent turn {turn+1}: {pos[0]}")

    print("Hostile agent minimax OK")
