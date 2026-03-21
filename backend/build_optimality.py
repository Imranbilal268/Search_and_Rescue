"""
build_optimality.py — Compiles the optimality test building from stamps
and returns (building, scenario) in the same format as build_test_building().
"""

import json, copy, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from compiler import compile_stamps, cell_key


OPTIMALITY_STAMPS = [
    # ── Main corridors (y=6–7, full width, all 4 floors) ──────────────────────
    {'id':'c0','type':'corridor','x':0,'y':6,'z':0,'width':20,'height':2},
    {'id':'c1','type':'corridor','x':0,'y':6,'z':1,'width':20,'height':2},
    {'id':'c2','type':'corridor','x':0,'y':6,'z':2,'width':20,'height':2},
    {'id':'c3','type':'corridor','x':0,'y':6,'z':3,'width':20,'height':2},

    # ── Floor 0 north rooms (open onto corridor y=5 door, room top-wall y=1) ──
    {'id':'r0_nw','type':'room','x':1, 'y':1,'z':0,'width':5,'height':5,
     'label':'Lobby',      'door_wall':'south','door_position':'center'},
    {'id':'r0_nc','type':'room','x':7, 'y':1,'z':0,'width':6,'height':5,
     'label':'Reception',  'door_wall':'south','door_position':'center'},
    {'id':'r0_ne','type':'room','x':14,'y':1,'z':0,'width':5,'height':5,
     'label':'Storage A',  'fire_accelerant':True,
     'door_wall':'south','door_position':'center'},

    # ── Floor 0 south rooms (y=8 start, door opens onto corridor at y=7) ─────
    {'id':'r0_sw','type':'room','x':1, 'y':8,'z':0,'width':5,'height':5,
     'label':'Break Room', 'door_wall':'north','door_position':'center'},
    {'id':'r0_se','type':'room','x':14,'y':8,'z':0,'width':5,'height':5,
     'label':'Server Room','door_wall':'north','door_position':'center'},

    # ── Floor 1 north rooms ───────────────────────────────────────────────────
    {'id':'r1_nw','type':'room','x':1, 'y':1,'z':1,'width':5,'height':5,
     'label':'Office A',   'door_wall':'south','door_position':'center'},
    {'id':'r1_nc','type':'room','x':7, 'y':1,'z':1,'width':6,'height':5,
     'label':'Conference', 'door_wall':'south','door_position':'center'},
    # IT Lab: locked door requires ax
    {'id':'r1_ne','type':'room','x':13,'y':1,'z':1,'width':5,'height':5,
     'label':'IT Lab',     'locked':True,'requires':'ax',
     'door_wall':'south','door_position':'center'},

    # ── Floor 1 south rooms ───────────────────────────────────────────────────
    {'id':'r1_sw','type':'room','x':1, 'y':8,'z':1,'width':5,'height':5,
     'label':'Office B',   'door_wall':'north','door_position':'center'},
    {'id':'r1_se','type':'room','x':14,'y':8,'z':1,'width':5,'height':5,
     'label':'Archive',    'door_wall':'north','door_position':'center'},

    # ── Floor 2 north rooms ───────────────────────────────────────────────────
    {'id':'r2_nw','type':'room','x':1, 'y':1,'z':2,'width':5,'height':5,
     'label':'Lab A',      'door_wall':'south','door_position':'center'},
    {'id':'r2_nc','type':'room','x':7, 'y':1,'z':2,'width':6,'height':5,
     'label':'Lab B',      'door_wall':'south','door_position':'center'},
    {'id':'r2_ne','type':'room','x':14,'y':1,'z':2,'width':5,'height':5,
     'label':'Lab C',      'door_wall':'south','door_position':'center'},

    # ── Floor 2 south rooms ───────────────────────────────────────────────────
    {'id':'r2_sw','type':'room','x':1, 'y':8,'z':2,'width':5,'height':5,
     'label':'Storage B',  'door_wall':'north','door_position':'center'},
    {'id':'r2_se','type':'room','x':14,'y':8,'z':2,'width':5,'height':5,
     'label':'Utility',    'door_wall':'north','door_position':'center'},

    # ── Floor 3 north rooms ───────────────────────────────────────────────────
    {'id':'r3_nw','type':'room','x':1, 'y':1,'z':3,'width':5,'height':5,
     'label':'Suite A',    'door_wall':'south','door_position':'center'},
    {'id':'r3_nc','type':'room','x':7, 'y':1,'z':3,'width':6,'height':5,
     'label':'Suite B',    'door_wall':'south','door_position':'center'},
    {'id':'r3_ne','type':'room','x':14,'y':1,'z':3,'width':5,'height':5,
     'label':'Suite C',    'door_wall':'south','door_position':'center'},

    # ── Floor 3 south rooms ───────────────────────────────────────────────────
    {'id':'r3_sw','type':'room','x':1, 'y':8,'z':3,'width':5,'height':5,
     'label':'Rooftop A',  'door_wall':'north','door_position':'center'},
    {'id':'r3_se','type':'room','x':14,'y':8,'z':3,'width':5,'height':5,
     'label':'Rooftop B',  'door_wall':'north','door_position':'center'},

    # ── Vertical connections ──────────────────────────────────────────────────
    # West stairwell: all 4 floors (only way to floor 3)
    {'id':'sw_w','type':'stairwell','x':2,'y':5,'z':0,'floors':[0,1,2,3]},
    # East stairwell: floors 0–2 only (no floor 3 access — forces west route for V4)
    {'id':'sw_e','type':'stairwell','x':18,'y':5,'z':0,'floors':[0,1,2]},

    # Window exit on floor 1 east wall (requires ladder)
    {'id':'win_f1','type':'window','x':19,'y':6,'z':1,
     'requires':'ladder','label':'Floor 1 East Window'},

    # Hazard zone: debris blocking center of ground floor corridor
    {'id':'haz0','type':'hazard','x':9,'y':6,'z':0,'width':2,'height':2,
     'traversal_cost_multiplier':3.0,'label':'Debris Field'},
]


def build_optimality_building():
    """
    Compile the optimality test building and return (building, scenario).
    Drop-in replacement for build_test_building().
    """
    with open(os.path.join(os.path.dirname(__file__), 'optimality_building.json')) as f:
        base = json.load(f)

    meta            = base['building']['meta']
    existing_props  = base['building']['cell_properties']

    grid, cell_props = compile_stamps(OPTIMALITY_STAMPS, meta, existing_props)

    building = copy.deepcopy(base['building'])
    building['grid']           = grid
    building['cell_properties']= cell_props

    return building, base['scenario']


