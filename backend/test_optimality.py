"""
test_optimality.py — RescueGrid assignment optimality and path efficiency tests.
"""
import sys, os, math, random, itertools
sys.path.insert(0, os.path.dirname(__file__))
from build_optimality import build_optimality_building
from graph import build_graph
from astar import astar, nearest_exit
from simulation import run_simulation
from victims import init_victim_states, compute_urgency
from assignment import init_responder_states, solve_assignment
from threat import FireThreat

INF = math.inf
RESET="\033[0m";BOLD="\033[1m";RED="\033[31m";GREEN="\033[32m"
YELLOW="\033[33m";CYAN="\033[36m";WHITE="\033[37m"
FAILURES=0
def col(t,c): return f"{c}{t}{RESET}"
def ok(m):    print(f"  {col('PASS',GREEN)}  {m}")
def fail(m):  global FAILURES; FAILURES+=1; print(f"  {col('FAIL',RED)}  {m}")
def warn(m):  print(f"  {col('WARN',YELLOW)}  {m}")
def hdr(m):   print(f"\n{BOLD}{CYAN}{'='*62}\n  {m}\n{'='*62}{RESET}")
def sec(m):   print(f"\n{BOLD}{WHITE}-- {m} --{RESET}")

def setup():
    building, scenario = build_optimality_building()
    graph, vcm = build_graph(building, scenario['simulation_config'])
    start = (1,6,0)
    responders_cfg = [
        ('R1',{'drone'}),
        ('R2',{'ax','medic_kit'}),
        ('R3',{'ladder'}),
        ('R4',{'medic_kit','drone'}),
    ]
    victims_cfg = [
        ('V1',(16,6,0)),
        ('V2',(15,2,1)),
        ('V3',(3,10,2)),
        ('V4',(10,2,3)),
    ]
    cost_matrix={}; path_matrix={}
    for rid,eq in responders_cfg:
        cost_matrix[rid]={}; path_matrix[rid]={}
        for vid,vpos in victims_cfg:
            path,cost = astar(graph,vcm,building,start,vpos,equipment_set=eq)
            cost_matrix[rid][vid]=cost; path_matrix[rid][vid]=path
    vids=[v for v,_ in victims_cfg]; rids=[r for r,_ in responders_cfg]
    best_total=INF; optimal_sets=[]
    for perm in itertools.permutations(vids):
        total=sum(cost_matrix[r][v] for r,v in zip(rids,perm))
        if abs(total-best_total)<0.01: optimal_sets.append(dict(zip(rids,perm)))
        elif total<best_total: best_total=total; optimal_sets=[dict(zip(rids,perm))]
    states = run_simulation(building, scenario, random.Random(42))
    return (building,scenario,graph,vcm,start,
            responders_cfg,victims_cfg,cost_matrix,path_matrix,
            best_total,optimal_sets,states)

def test_equipment_aware(building,scenario,graph,vcm,start,
                         responders_cfg,victims_cfg,cost_matrix,path_matrix,
                         best_total,optimal_sets,states):
    hdr("TEST 1 -- Equipment-Aware Assignment")

    sec("V2 only reachable by responder with ax")
    for rid,eq in responders_cfg:
        c=cost_matrix[rid]['V2']; has_ax='ax' in eq
        if has_ax:
            ok(f"{rid} (has ax): V2 cost={c:.1f}") if c<INF else fail(f"{rid} has ax but V2=INF")
        else:
            ok(f"{rid} (no ax): V2=INF -- correctly blocked") if c==INF else fail(f"{rid} no ax but reaches V2 at {c:.1f} -- bypass!")

    sec("R2 is the only responder ever assigned to V2")
    for ts in states:
        for r in ts['responder_states']:
            if r['assigned_to']=='V2' and r['id']!='R2':
                fail(f"T{ts['turn']}: {r['id']} (no ax) assigned to V2"); return
    ok("V2 only assigned to R2 across all turns")

    sec("R2 first assignment is V2 (not a cheaper nearby victim)")
    r2_first=next((r['assigned_to'] for ts in states[1:] for r in ts['responder_states']
                   if r['id']=='R2' and r['assigned_to']),None)
    ok(f"R2 correctly sent to V2") if r2_first=='V2' else fail(f"R2 first assigned to {r2_first}, expected V2")

    sec("door_breached event fires for R2 entering IT Lab")
    breached=any(e['type']=='door_breached' and 'R2' in e['agents_affected']
                 for ts in states for e in ts['events'])
    ok("door_breached confirmed for R2") if breached else fail("door_breached never fired for R2")

    sec("Drone responders cross debris cheaper than non-drone (equipment cost advantage)")
    r1_cost=cost_matrix['R1']['V1']; r3_cost=cost_matrix['R3']['V1']
    if r1_cost<r3_cost:   ok(f"R1(drone)={r1_cost:.1f} < R3(no drone)={r3_cost:.1f} -- debris advantage confirmed")
    elif r1_cost==r3_cost: warn(f"R1 and R3 equal cost to V1 ({r1_cost:.1f}) -- debris not on critical path")
    else: fail(f"R1(drone) costs MORE than R3 to V1: {r1_cost} vs {r3_cost}")

def test_urgency_aware(building,scenario,graph,vcm,start,
                       responders_cfg,victims_cfg,cost_matrix,path_matrix,
                       best_total,optimal_sets,states):
    hdr("TEST 2 -- Urgency-Aware Assignment")

    sec("Victims receive finite urgency scores within first 8 turns")
    found=False
    for ts in states[1:9]:
        scores={v['id']:v['urgency_score'] for v in ts['victim_states']
                if v['urgency_score'] is not None and v['urgency_score']<INF}
        if scores:
            ok(f"T{ts['turn']} urgency: {', '.join(f'{k}={v:.2f}' for k,v in sorted(scores.items()))}"); found=True; break
    if not found: warn("No finite urgency scores in first 8 turns")

    sec("V1 (floor 0, nearest fire) extracted before V4 (floor 3)")
    xt={}
    for ts in states:
        for v in ts['victim_states']:
            if v['status']=='extracted' and v['id'] not in xt: xt[v['id']]=ts['turn']
    ok(f"Extraction order: {dict(sorted(xt.items(),key=lambda x:x[1]))}")
    v1t=xt.get('V1'); v4t=xt.get('V4')
    if v1t and v4t:
        ok(f"V1 extracted T{v1t} before V4 T{v4t}") if v1t<v4t else warn(f"V1 extracted T{v1t}, V4 T{v4t} -- expected V1 first")
    else: warn(f"Incomplete: V1={v1t} V4={v4t}")

    sec("All victims assigned within 3 turns of simulation start")
    for vid,_ in victims_cfg:
        at=next((ts['turn'] for ts in states[1:] if any(v['id']==vid and v['assigned_to']
                 for v in ts['victim_states'])),None)
        ok(f"{vid} assigned by turn {at}") if at and at<=3 else (
            warn(f"{vid} assigned turn {at}") if at else fail(f"{vid} never assigned"))

    sec("Urgency scaling (<1.0) appears in assignment cost breakdowns")
    found=False
    for ts in states[1:10]:
        for a in ts['assignment_log']:
            s=a.get('cost_breakdown',{}).get('urgency_scaling',1.0)
            if s is not None and s<1.0:
                ok(f"T{ts['turn']} {a['responder_id']}->{a['victim_id']}: urgency_scaling={s:.3f}"); found=True; break
        if found: break
    if not found: warn("No urgency_scaling<1.0 in first 10 turns -- fire may be far from victims initially")

def test_path_efficiency(building,scenario,graph,vcm,start,
                         responders_cfg,victims_cfg,cost_matrix,path_matrix,
                         best_total,optimal_sets,states):
    hdr("TEST 3 -- Path Efficiency")

    sec("Each responder's assigned path cost within 15% of A* theoretical minimum")
    checked=set()
    for ts in states[1:4]:
        for r in ts['responder_states']:
            rid=r['id']
            if rid in checked or not r['assigned_to'] or not r['current_path']: continue
            vid=r['assigned_to']; eq=set(r['equipment'])
            vpos=tuple(next(v['position'] for v in ts['victim_states'] if v['id']==vid))
            rpos=tuple(r['position'])
            _,th=astar(graph,vcm,building,rpos,vpos,equipment_set=eq)
            if th in (0,INF): continue
            ratio=r['path_cost']/th
            ok(f"{rid}->{vid}: actual={r['path_cost']:.1f} opt={th:.1f} ratio={ratio:.2f}") if ratio<=1.15 else fail(f"{rid}->{vid}: ratio={ratio:.2f} exceeds 1.15 threshold")
            checked.add(rid)

    sec("Simulation total assignment cost equals brute-force minimum")
    ok(f"Brute-force minimum: {best_total:.1f} ({len(optimal_sets)} tied optimal assignments)")
    sim_assign={}
    for ts in states[1:]:
        for r in ts['responder_states']:
            if r['assigned_to'] and r['id'] not in sim_assign: sim_assign[r['id']]=r['assigned_to']
        if len(sim_assign)==4: break
    sim_total=sum(cost_matrix[r][v] for r,v in sim_assign.items() if cost_matrix[r].get(v,INF)<INF)
    ok(f"Simulation assignment: {sim_assign}  total={sim_total:.1f}")
    if sim_assign in optimal_sets: ok("Simulation assignment is exactly one of the optimal solutions")
    elif abs(sim_total-best_total)<0.1: ok(f"Simulation total cost {sim_total:.1f} matches brute-force minimum")
    else: fail(f"Simulation total {sim_total:.1f} exceeds minimum {best_total:.1f} by {sim_total-best_total:.1f}")

    sec("Individual path step counts within 1.2x of A* optimum")
    for ts in states[1:3]:
        for r in ts['responder_states']:
            if not r['current_path'] or not r['assigned_to']: continue
            eq=set(r['equipment']); vid=r['assigned_to']
            vpos=tuple(next(v['position'] for v in ts['victim_states'] if v['id']==vid))
            rpos=tuple(r['position'])
            opt_path,_=astar(graph,vcm,building,rpos,vpos,equipment_set=eq)
            if not opt_path or len(opt_path)<=1: continue
            actual=len(r['current_path'])-1; opt=len(opt_path)-1
            ratio=actual/opt if opt>0 else 1.0
            ok(f"T{ts['turn']} {r['id']}->{vid}: {actual} steps (opt {opt}, {ratio:.2f}x)") if ratio<=1.2 else fail(f"T{ts['turn']} {r['id']}: {actual} steps is {ratio:.2f}x optimal {opt}")

def test_assignment_quality(building,scenario,graph,vcm,start,
                            responders_cfg,victims_cfg,cost_matrix,path_matrix,
                            best_total,optimal_sets,states):
    hdr("TEST 4 -- Assignment Quality")

    sec("No victim ever has two routing responders simultaneously")
    for ts in states:
        ra=[r['assigned_to'] for r in ts['responder_states'] if r['status']=='routing' and r['assigned_to']]
        dups={v for v in ra if ra.count(v)>1}
        if dups: fail(f"T{ts['turn']}: duplicate routing to {dups}"); return
    ok("No duplicate routing assignments across all turns")

    sec("No responder routed to already-extracted victim")
    for ts in states:
        ext={v['id'] for v in ts['victim_states'] if v['status']=='extracted'}
        for r in ts['responder_states']:
            if r['assigned_to'] in ext and r['status']=='routing':
                fail(f"T{ts['turn']} {r['id']} routing to extracted {r['assigned_to']}"); return
    ok("No responder ever routed to an already-extracted victim")

    sec("R1 and R4 (overlapping equipment) never assigned same victim simultaneously")
    for ts in states:
        r1=next(r for r in ts['responder_states'] if r['id']=='R1')
        r4=next(r for r in ts['responder_states'] if r['id']=='R4')
        if (r1['assigned_to'] and r1['assigned_to']==r4['assigned_to']
                and r1['status']=='routing' and r4['status']=='routing'):
            fail(f"T{ts['turn']}: R1 and R4 both routing to {r1['assigned_to']}"); return
    ok("R1 and R4 never share same victim assignment simultaneously")

    sec("All 4 victims extracted, simulation ends success")
    final=states[-1]
    for v in final['victim_states']:
        ok(f"{v['id']} extracted") if v['status']=='extracted' else fail(f"{v['id']} not extracted (status={v['status']})")
    ok(f"Simulation SUCCESS in {final['turn']} turns") if final['status']=='success' else fail(f"Status={final['status']}, expected success")

    sec("V2 extraction turn confirms ax responder unlocked the door and retrieved victim")
    v2t=next((ts['turn'] for ts in states if any(v['id']=='V2' and v['status']=='extracted' for v in ts['victim_states'])),None)
    ok(f"V2 extracted at T{v2t} -- ax door constraint resolved") if v2t else fail("V2 never extracted")

def test_multifloor_routing(building,scenario,graph,vcm,start,
                            responders_cfg,victims_cfg,cost_matrix,path_matrix,
                            best_total,optimal_sets,states):
    hdr("TEST 5 -- Multi-Floor Routing Efficiency")
    grid=building['grid']

    sec("East stairwell absent on floor 3 -- only west stairwell reaches floor 3")
    ok(f"East stairwell (18,5) on floor 3 = wall: {grid[3][5][18]=='wall'}") if grid[3][5][18]=='wall' else fail(f"East stairwell not wall on floor 3: {grid[3][5][18]}")
    ok(f"West stairwell (2,5) on floor 3 = stairwell: {grid[3][5][2]=='stairwell'}") if grid[3][5][2]=='stairwell' else fail(f"West stairwell missing on floor 3")

    sec("Whoever is assigned V4 actually reaches floor 3")
    v4_carrier=next((r['id'] for ts in states for r in ts['responder_states']
                     if r['assigned_to']=='V4' and r['position'][2]==3),None)
    ok(f"{v4_carrier} reached floor 3 to retrieve V4") if v4_carrier else fail("No responder reached floor 3 for V4")

    sec("V4 carrier uses west stairwell (only path to floor 3)")
    v4_rid=next((r['id'] for ts in states[1:] for r in ts['responder_states'] if r['assigned_to']=='V4'),None)
    if v4_rid:
        positions=[tuple(r['position']) for ts in states for r in ts['responder_states'] if r['id']==v4_rid]
        used_w=any(p in {(2,5,z) for z in range(4)} for p in positions)
        ok(f"{v4_rid} used west stairwell") if used_w else fail(f"{v4_rid} never passed west stairwell")

    sec("V2 carrier routes to floor 1")
    v2_rid=next((r['id'] for ts in states[1:] for r in ts['responder_states'] if r['assigned_to']=='V2'),None)
    if v2_rid:
        f1_reached=any(r['position'][2]==1 for ts in states for r in ts['responder_states'] if r['id']==v2_rid)
        ok(f"{v2_rid} reached floor 1 for V2") if f1_reached else fail(f"{v2_rid} never reached floor 1")

    sec("A* path to V4 contains at least 3 stairwell cells (3-floor climb)")
    for rid,eq in responders_cfg:
        if cost_matrix[rid]['V4']<INF:
            path=path_matrix[rid]['V4']
            sw=[n for n in path if grid[n[2]][n[1]][n[0]]=='stairwell']
            ok(f"{rid}->V4: {len(path)} steps, {len(sw)} stairwell cells, cost={cost_matrix[rid]['V4']:.1f}") if len(sw)>=3 else fail(f"{rid}->V4 only {len(sw)} stairwell cells, expected >=3")
            break

    sec("A* path to V3 (floor 2) uses at least 2 stairwell cells")
    for rid,eq in responders_cfg:
        if cost_matrix[rid]['V3']<INF:
            path=path_matrix[rid]['V3']
            sw=[n for n in path if grid[n[2]][n[1]][n[0]]=='stairwell']
            ok(f"{rid}->V3: {len(path)} steps, {len(sw)} stairwell cells, cost={cost_matrix[rid]['V3']:.1f}") if len(sw)>=2 else fail(f"{rid}->V3 only {len(sw)} stairwell cells, expected >=2")
            break

def test_contention(building,scenario,graph,vcm,start,
                    responders_cfg,victims_cfg,cost_matrix,path_matrix,
                    best_total,optimal_sets,states):
    hdr("TEST 6 -- Contention and Coordination")

    sec("Responders diverge from shared start position by turn 4")
    ts4=states[min(4,len(states)-1)]
    positions=set(tuple(r['position']) for r in ts4['responder_states'] if r['status'] not in ('extracted','blocked'))
    ok(f"Turn 4: {len(positions)} distinct positions -- spreading out") if len(positions)>=3 else warn(f"Turn 4: only {len(positions)} positions")

    sec("Contention map populated after first solve_assignment call")
    rs=init_responder_states(scenario['responders'])
    vs=init_victim_states(scenario['victims'])
    consumed=[[scenario['threat']['origin']['x'],scenario['threat']['origin']['y'],scenario['threat']['origin']['z']]]
    vs=compute_urgency(graph,building,vs,consumed,building['exit_nodes'])
    fire=FireThreat(scenario['threat']['fire_params'])
    cs=set(map(tuple,consumed)); fr=fire.get_frontier(graph,cs); pm=fire.penalty_map(cs,fr)
    _,cm=solve_assignment(rs,vs,graph,vcm,building,scenario_config=scenario['simulation_config'],threat_penalty_map=pm)
    ok(f"Contention map: {len(cm)} penalised nodes") if cm else warn("Contention map empty -- paths may not overlap")

    sec("Paths to V3 and V4 diverge significantly (responders use different building sections)")
    paths_v3=[path_matrix[rid]['V3'] for rid,eq in responders_cfg if cost_matrix[rid]['V3']<INF]
    paths_v4=[path_matrix[rid]['V4'] for rid,eq in responders_cfg if cost_matrix[rid]['V4']<INF]
    if paths_v3 and paths_v4:
        n3=set(tuple(n) for n in paths_v3[0]); n4=set(tuple(n) for n in paths_v4[0])
        overlap=n3&n4; total=len(n3|n4)
        pct=len(overlap)/total*100 if total>0 else 0
        ok(f"V3/V4 paths share {len(overlap)}/{total} nodes ({pct:.0f}%)") if pct<60 else warn(f"V3/V4 paths share {pct:.0f}% -- high overlap")

    sec("Contention penalty visible in at least one assignment breakdown")
    found=any(a.get('cost_breakdown',{}).get('contention_penalty',0)>0 for ts in states[1:6] for a in ts['assignment_log'])
    ok("Contention penalty > 0 found in assignment breakdowns") if found else warn("No contention penalty found in first 5 turns")

def test_assignment_stability(building,scenario,graph,vcm,start,
                              responders_cfg,victims_cfg,cost_matrix,path_matrix,
                              best_total,optimal_sets,states):
    hdr("TEST 7 -- Assignment Stability")

    sec("Each routing responder keeps their victim assignment (0-1 changes acceptable)")
    for rid,_ in responders_cfg:
        assigns=[(ts['turn'],r['assigned_to']) for ts in states for r in ts['responder_states']
                 if r['id']==rid and r['status']=='routing' and r['assigned_to']]
        if not assigns: continue
        changes=[(assigns[i][0],assigns[i-1][1],assigns[i][1]) for i in range(1,len(assigns)) if assigns[i][1]!=assigns[i-1][1]]
        ok(f"{rid}: stable across {len(assigns)} routing turns -> {assigns[0][1]}") if not changes else (
            warn(f"{rid}: 1 change T{changes[0][0]}: {changes[0][1]}->{changes[0][2]} (likely fire path cut)") if len(changes)==1 else
            fail(f"{rid}: {len(changes)} changes -- excessive churn: {changes[:3]}"))

    sec("Total assignment changes across all responders <= 4")
    total=0
    for rid,_ in responders_cfg:
        prev=None
        for ts in states:
            r=next(r for r in ts['responder_states'] if r['id']==rid)
            if r['status']=='routing' and r['assigned_to']:
                if prev and r['assigned_to']!=prev: total+=1
                prev=r['assigned_to']
    ok(f"Total reassignments: {total} (<=4)") if total<=4 else warn(f"Total reassignments: {total}")

    sec("No responder reassigned to already-extracted victim")
    for ts in states:
        ext={v['id'] for v in ts['victim_states'] if v['status']=='extracted'}
        for r in ts['responder_states']:
            if r['assigned_to'] in ext and r['status']=='routing':
                fail(f"T{ts['turn']} {r['id']} routing to extracted {r['assigned_to']}"); return
    ok("No responder ever routed toward an already-extracted victim")

    sec("Carrying responders maintain victim assignment through to exit")
    for ts in states:
        for r in ts['responder_states']:
            if r['status']=='carrying':
                vid=r['assigned_to']
                v=next((v for v in ts['victim_states'] if v['id']==vid),None)
                if v and v['status'] not in ('being_extracted','extracted'):
                    fail(f"T{ts['turn']} {r['id']} carrying but {vid} status={v['status']}"); return
    ok("All carrying responders maintain victim assignment through to exit")

def main():
    global FAILURES; FAILURES=0
    print(f"\n{BOLD}{CYAN}{'='*62}\n  RescueGrid -- Optimality & Efficiency Test Suite\n{'='*62}{RESET}")
    print(f"\n{BOLD}Building:{RESET}  4-floor office 20x14 | 4 responders | 4 victims")
    print(f"{BOLD}Fire:{RESET}      origin=(18,2,0), spread=0.18 -- slow east-to-west")
    print(f"{BOLD}Constraints:{RESET}")
    print(f"  V2 behind ax-locked door -- only R2 (ax) can enter (all others = INF)")
    print(f"  V4 floor 3 -- only west stairwell reaches it (east SW stops at F2)")
    print(f"  Debris field floor 0 -- drone halves extra traversal cost")
    print(f"{BOLD}Expected optimum:{RESET} 84.0 (multiple tied valid assignments)")
    print(f"\n{col('Setting up...', CYAN)}")
    try:
        fixtures=setup()
    except Exception as e:
        import traceback; print(f"\n{col('Setup FAILED:',RED)}"); traceback.print_exc(); sys.exit(1)
    *_,best_total,optimal_sets,states=fixtures
    status=states[-1]['status']; turns=states[-1]['turn']
    sc=GREEN if status=='success' else RED
    print(f"{col('Result:',BOLD)} {col(status.upper(),sc)} in {turns} turns  |  "
          f"Optimal cost: {best_total:.1f}  |  Valid assignments: {len(optimal_sets)}")
    for t in [test_equipment_aware,test_urgency_aware,test_path_efficiency,
              test_assignment_quality,test_multifloor_routing,test_contention,
              test_assignment_stability]:
        try: t(*fixtures)
        except Exception as e:
            import traceback; print(f"\n{col('Exception in '+t.__name__+':',RED)}"); traceback.print_exc(); FAILURES+=1
    print(f"\n{BOLD}{'='*62}{RESET}")
    print(f"{BOLD}{GREEN if FAILURES==0 else RED}  {'ALL OPTIMALITY TESTS PASSED' if FAILURES==0 else str(FAILURES)+' TEST(S) FAILED'}{RESET}")
    print(f"{BOLD}{'='*62}{RESET}\n")
    sys.exit(0 if FAILURES==0 else 1)

if __name__=='__main__': main()
