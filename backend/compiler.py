"""
compiler.py — RescueGrid stamp-to-grid compiler.

Takes a list of stamps (corridor, room, stairwell, door, window, hazard)
and produces the dense 3D voxel grid that the backend and frontend both consume.

Access pattern: grid[z][y][x]
  z = floor index (0 = ground)
  y = row from north wall (0 = north)
  x = column from west wall (0 = west)
"""

import json
import copy


# ── helpers ──────────────────────────────────────────────────────────────────

def cell_key(x, y, z):
    """Canonical cell_properties key. ALWAYS use this — never build the string manually."""
    return f"{x},{y},{z}"


def empty_floor(width, height):
    """Return a floor filled entirely with walls."""
    return [["wall"] * width for _ in range(height)]


def make_empty_grid(floors, width, height):
    return [empty_floor(width, height) for _ in range(floors)]


# ── stamp processors ──────────────────────────────────────────────────────────

def apply_corridor(grid, stamp):
    """Fill a rectangle with floor cells."""
    z, x, y = stamp["z"], stamp["x"], stamp["y"]
    w, h = stamp["width"], stamp["height"]
    for row in range(y, y + h):
        for col in range(x, x + w):
            grid[z][row][col] = "floor"


def apply_room(grid, cell_props, stamp):
    """
    Draw a walled room with a single door opening onto the corridor.
    Interior cells are floor. Perimeter cells are wall. One perimeter
    cell on the specified wall is replaced with a door.
    """
    z, x, y = stamp["z"], stamp["x"], stamp["y"]
    w, h = stamp["width"], stamp["height"]
    label = stamp.get("label", "")
    locked = stamp.get("locked", False)
    requires = stamp.get("requires", None)
    fire_acc = stamp.get("fire_accelerant", False)
    door_wall = stamp.get("door_wall", "south")
    door_pos = stamp.get("door_position", "center")

    # Fill room with wall first
    for row in range(y, y + h):
        for col in range(x, x + w):
            grid[z][row][col] = "wall"

    # Fill interior with floor
    for row in range(y + 1, y + h - 1):
        for col in range(x + 1, x + w - 1):
            grid[z][row][col] = "floor"
            if label or fire_acc:
                k = cell_key(col, row, z)
                if k not in cell_props:
                    cell_props[k] = {}
                if label:
                    cell_props[k]["label"] = label
                if fire_acc:
                    cell_props[k]["fire_accelerant"] = True

    # Compute door cell
    door_x, door_y = _door_cell(x, y, w, h, door_wall, door_pos)
    grid[z][door_y][door_x] = "door"

    # Apply door properties
    if locked or requires:
        k = cell_key(door_x, door_y, z)
        if k not in cell_props:
            cell_props[k] = {}
        if locked:
            cell_props[k]["locked"] = True
        if requires:
            cell_props[k]["requires"] = requires


def _door_cell(x, y, w, h, wall, pos):
    """Return (door_x, door_y) for a door on the given wall at start/center/end."""
    if wall == "north":
        row = y
        if pos == "start":   col = x + 1
        elif pos == "end":   col = x + w - 2
        else:                col = x + w // 2
        return col, row
    if wall == "south":
        row = y + h - 1
        if pos == "start":   col = x + 1
        elif pos == "end":   col = x + w - 2
        else:                col = x + w // 2
        return col, row
    if wall == "west":
        col = x
        if pos == "start":   row = y + 1
        elif pos == "end":   row = y + h - 2
        else:                row = y + h // 2
        return col, row
    if wall == "east":
        col = x + w - 1
        if pos == "start":   row = y + 1
        elif pos == "end":   row = y + h - 2
        else:                row = y + h // 2
        return col, row
    raise ValueError(f"Unknown door_wall: {wall}")


def apply_stairwell(grid, stamp):
    """
    Place a 2×2 block of stairwell cells at (x,y) on every floor
    listed in stamp['floors'].
    """
    sx, sy = stamp["x"], stamp["y"]
    for z in stamp["floors"]:
        for dy in range(2):
            for dx in range(2):
                grid[z][sy + dy][sx + dx] = "stairwell"


def apply_door(grid, cell_props, stamp):
    """Place a single door cell and optionally mark it locked."""
    x, y, z = stamp["x"], stamp["y"], stamp["z"]
    grid[z][y][x] = "door"
    locked = stamp.get("locked", False)
    requires = stamp.get("requires", None)
    if locked or requires:
        k = cell_key(x, y, z)
        if k not in cell_props:
            cell_props[k] = {}
        if locked:
            cell_props[k]["locked"] = True
        if requires:
            cell_props[k]["requires"] = requires


def apply_window(grid, cell_props, stamp):
    """Place a window cell and record any tool requirement."""
    x, y, z = stamp["x"], stamp["y"], stamp["z"]
    grid[z][y][x] = "window"
    requires = stamp.get("requires", None)
    label = stamp.get("label", None)
    if requires or label:
        k = cell_key(x, y, z)
        if k not in cell_props:
            cell_props[k] = {}
        if requires:
            cell_props[k]["requires"] = requires
        if label:
            cell_props[k]["label"] = label


def apply_hazard(grid, cell_props, stamp):
    """Fill a rectangle with hazard cells and record the cost multiplier."""
    z, x, y = stamp["z"], stamp["x"], stamp["y"]
    w, h = stamp["width"], stamp["height"]
    mult = stamp.get("traversal_cost_multiplier", 2.0)
    label = stamp.get("label", None)
    for row in range(y, y + h):
        for col in range(x, x + w):
            grid[z][row][col] = "hazard"
            k = cell_key(col, row, z)
            if k not in cell_props:
                cell_props[k] = {}
            cell_props[k]["traversal_cost_multiplier"] = mult
            if label:
                cell_props[k]["label"] = label


# ── order-sensitive dispatch ──────────────────────────────────────────────────

STAMP_ORDER = ["corridor", "room", "stairwell", "hazard", "door", "window"]


def compile_stamps(stamps, meta, existing_cell_props=None):
    """
    Main entry point.

    Parameters
    ----------
    stamps : list of stamp dicts
    meta   : dict with keys: floors, width, height
    existing_cell_props : dict — pre-populated cell_properties from the
                          building JSON (e.g. locked doors not expressed
                          as stamps). These are merged with compiled props.

    Returns
    -------
    grid        : 3D list  grid[z][y][x]
    cell_props  : dict     "x,y,z" -> property dict
    """
    floors = meta["floors"]
    width  = meta["width"]
    height = meta["height"]

    grid = make_empty_grid(floors, width, height)
    cell_props = copy.deepcopy(existing_cell_props or {})

    # Process in defined order so later stamps (doors) can overwrite earlier ones (rooms)
    for stype in STAMP_ORDER:
        for stamp in stamps:
            if stamp["type"] != stype:
                continue
            if stype == "corridor":
                apply_corridor(grid, stamp)
            elif stype == "room":
                apply_room(grid, cell_props, stamp)
            elif stype == "stairwell":
                apply_stairwell(grid, stamp)
            elif stype == "door":
                apply_door(grid, cell_props, stamp)
            elif stype == "window":
                apply_window(grid, cell_props, stamp)
            elif stype == "hazard":
                apply_hazard(grid, cell_props, stamp)

    return grid, cell_props


# ── default stamp list for test building ─────────────────────────────────────

DEFAULT_STAMPS = [
    # Ground floor corridors
    {"id": "c_gf_main", "type": "corridor", "x": 0,  "y": 5,  "z": 0, "width": 16, "height": 2},
    # First floor corridor
    {"id": "c_ff_main", "type": "corridor", "x": 0,  "y": 5,  "z": 1, "width": 16, "height": 2},
    # Second floor corridor
    {"id": "c_sf_main", "type": "corridor", "x": 0,  "y": 5,  "z": 2, "width": 16, "height": 2},

    # Ground floor rooms
    {"id": "r_cafe",    "type": "room", "x": 1,  "y": 1, "z": 0, "width": 5, "height": 4,
     "label": "Cafeteria", "fire_accelerant": True,
     "door_wall": "south", "door_position": "center"},
    {"id": "r_office",  "type": "room", "x": 7,  "y": 1, "z": 0, "width": 4, "height": 4,
     "label": "Main Office", "locked": True, "requires": "ax",
     "door_wall": "south", "door_position": "center"},
    {"id": "r_it",      "type": "room", "x": 12, "y": 1, "z": 0, "width": 3, "height": 4,
     "label": "IT Closet", "locked": True, "requires": "ax",
     "door_wall": "south", "door_position": "center"},

    # First floor rooms
    {"id": "r_class_a", "type": "room", "x": 1,  "y": 1, "z": 1, "width": 5, "height": 4,
     "label": "Classroom A", "door_wall": "south", "door_position": "center"},
    {"id": "r_class_b", "type": "room", "x": 7,  "y": 1, "z": 1, "width": 4, "height": 4,
     "label": "Library", "door_wall": "south", "door_position": "center"},
    {"id": "r_sci",     "type": "room", "x": 12, "y": 1, "z": 1, "width": 3, "height": 4,
     "label": "Science Lab", "fire_accelerant": True,
     "door_wall": "south", "door_position": "center"},

    # Second floor rooms
    {"id": "r_art",     "type": "room", "x": 1,  "y": 1, "z": 2, "width": 5, "height": 4,
     "label": "Art Room", "door_wall": "south", "door_position": "center"},
    {"id": "r_gym",     "type": "room", "x": 7,  "y": 1, "z": 2, "width": 4, "height": 4,
     "label": "Gymnasium", "door_wall": "south", "door_position": "center"},
    {"id": "r_store",   "type": "room", "x": 12, "y": 1, "z": 2, "width": 3, "height": 4,
     "label": "Storage", "door_wall": "south", "door_position": "center"},

    # Stairwells — x,y must match vertical_connections declarations in test_building.json
    # west: x=3,y=3 spans floors 0,1,2.  east: x=12,y=3 spans floors 0,1 only
    {"id": "sw_west",  "type": "stairwell", "x": 3,  "y": 3, "z": 0, "floors": [0, 1, 2]},
    {"id": "sw_east",  "type": "stairwell", "x": 12, "y": 3, "z": 0, "floors": [0, 1]},

    # Windows (south wall bottom row)
    {"id": "win_gf",   "type": "window", "x": 15, "y": 5, "z": 0, "requires": None,     "label": "Ground Floor East Window"},
    {"id": "win_ff",   "type": "window", "x": 15, "y": 5, "z": 1, "requires": "ladder", "label": "First Floor East Window"},
    {"id": "win_sf",   "type": "window", "x": 15, "y": 5, "z": 2, "requires": "ladder", "label": "Second Floor East Window"},

    # Hazard zone (debris in ground floor lobby area)
    {"id": "haz_lobby","type": "hazard",    "x": 6, "y": 5, "z": 0, "width": 2, "height": 2,
     "label": "Collapsed Lobby", "traversal_cost_multiplier": 3.0},
]


def build_test_building():
    """
    Compile the default stamp list into a building dict that matches
    the rescuegrid-v1 schema. This is the Phase 0 shared test fixture.
    """
    with open("test_building.json") as f:
        base = json.load(f)

    meta = base["building"]["meta"]
    existing_props = base["building"]["cell_properties"]

    grid, cell_props = compile_stamps(DEFAULT_STAMPS, meta, existing_props)

    building = copy.deepcopy(base["building"])
    building["grid"] = grid
    building["cell_properties"] = cell_props

    return building, base["scenario"]


if __name__ == "__main__":
    building, scenario = build_test_building()
    floors = building["meta"]["floors"]
    width  = building["meta"]["width"]
    height = building["meta"]["height"]
    print(f"Compiled: {floors} floors, {width}x{height} cells per floor")
    print(f"cell_properties entries: {len(building['cell_properties'])}")
    print("grid[z][y][x] access confirmed:", building["grid"][0][5][0])
