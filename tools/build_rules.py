#!/usr/bin/env python3
"""Build assets/data/rules.js from the live PHB (/workspace/1_SSDNS_PHB/BOOK1.md). Read-only on the PHB.

v0.2.2 (2026-10-05): also parses Explosives, Storyteller Gear/Instruments, Wear & Tear, Starting Kit Crosswalk, and Calling spell lists.
v0.2 (2026-10-04): rewritten to be robust. Headings and table headers are matched loosely
(case, italics, "(ES)" suffixes ignored) and every section fails soft: a problem becomes a
warning in rules.js instead of a crash. Firearms v3 (Action/TR/Load/Cap + Light/Medium/Heavy
tiers), Carbines, the Holsters rig table, ES currency (Shard/Value), Caster Guns with hex lead
shells, Borrowed Iron and Gunsmithing are read from the current book.
"""
import re, json, sys, hashlib, datetime, os, traceback, argparse
_ap = argparse.ArgumentParser(description='Build assets/data/rules.js from the live PHB markdown.')
_ap.add_argument('--src', default=os.environ.get('SSDNS_RULES_SRC', ''), help='BOOK1.md path (or SSDNS_RULES_SRC)')
_ap.add_argument('--out', default=os.environ.get('SSDNS_RULES_OUT', ''), help='rules.js path (or SSDNS_RULES_OUT)')
_args = _ap.parse_args()
SRC = _args.src
OUT = _args.out
if not SRC or not OUT:
    sys.exit('Need --src and --out, or SSDNS_RULES_SRC and SSDNS_RULES_OUT')
raw = open(SRC, encoding='utf-8').read()
L = raw.split('\n')
N = len(L)
warnings = []

def warn(msg): warnings.append(msg)

def clean(s):
    s = re.sub(r'<!--.*?-->', '', s or '')
    s = s.replace('\\column', '').replace('\\page', '').replace('<br>', ' / ')
    s = re.sub(r'\*\*(.+?)\*\*', r'\1', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'\1', s)
    s = s.replace('*', '').replace('\\', '')
    return s.strip()

def norm(s):
    s = clean(s).lower()
    s = re.sub(r'\((es|cp|gp|dex|str|cha|ft|lb\.?)\)', '', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', clean(s).lower()).strip('-')

def find(pattern, start=0, end=None, flags=0):
    end = N if end is None else end
    rx = re.compile(pattern, flags)
    for i in range(max(0, start), min(end, N)):
        if rx.search(L[i]):
            return i
    return -1

def head_find(level, text, start=0, end=None):
    """Find a heading of the given level whose normalised text starts with text (loose)."""
    end = N if end is None else end
    t = norm(text)
    for i in range(max(0, start), min(end, N)):
        m = re.match(r'^(#{1,6})\s+(.*)$', L[i])
        if m and (level is None or len(m.group(1)) == level) and norm(m.group(2)).startswith(t):
            return i
    return -1

def parse_table(i):
    hdr = [clean(c) for c in L[i].strip().strip('|').split('|')]
    j = i + 2
    rows = []
    while j < N and L[j].strip().startswith('|'):
        cells = [c.strip() for c in L[j].strip().strip('|').split('|')]
        rows.append({hdr[k]: cells[k] if k < len(cells) else '' for k in range(len(hdr))})
        j += 1
    return hdr, rows, j

def col(r, *names, default=''):
    """Loose column lookup: first header whose normalised text starts with any of names."""
    for n in names:
        nn = norm(n)
        for k in r:
            if k.startswith('_'): continue
            if norm(k) == nn: return r[k]
        for k in r:
            if k.startswith('_'): continue
            if norm(k).startswith(nn): return r[k]
    return default

def h1_sections(start, end):
    idx = [i for i in range(start, end) if L[i].startswith('# ')]
    out = []
    for n, i in enumerate(idx):
        e = idx[n+1] if n+1 < len(idx) else end
        out.append((L[i][2:].strip(), i, e))
    return out

def next_para(i, end):
    buf = []
    j = i + 1
    while j < end and (L[j].strip() == '' or L[j].strip().startswith('<!--')):
        j += 1
    while j < end and L[j].strip() and not L[j].startswith('#') and not L[j].strip().startswith('{{') and not L[j].strip().startswith('}}') and not L[j].strip().startswith('|'):
        if not L[j].strip().startswith('<!--'):
            buf.append(L[j].strip())
        j += 1
    return clean(' '.join(buf))

def loc(i): return 'BOOK1.md line %d' % (i + 1)

def num(s):
    s = clean(s).replace(',', '')
    m = re.match(r'^(\d+)', s)
    return int(m.group(1)) if m else None

def safe(name, fn, default):
    try:
        return fn()
    except Exception as e:
        warn('PARSER: section "%s" failed (%s: %s); the sheet uses an empty list for it' % (name, type(e).__name__, e))
        traceback.print_exc()
        return default

def tbd(s):
    """Book placeholders like '___ ES' or 'TBD' become 'TBD'."""
    c = clean(s)
    return 'TBD' if (re.search(r'_{2,}', c) or re.search(r'\bTBD\b', c, re.I)) else c

# ---------------- anchors
iLin = head_find(1, 'Lineages')
iCal = head_find(1, 'Callings')
iAbi = head_find(1, 'Ability Scores')
iBg = head_find(1, 'Backgrounds')
iRules = head_find(1, 'Rules of the Frontier')
iEq = head_find(1, 'Equipment')
iFeat = head_find(1, 'Feats')
iSp = head_find(1, 'Spells')
for nm, v in [('Lineages', iLin), ('Callings', iCal), ('Ability Scores', iAbi), ('Backgrounds', iBg), ('Equipment', iEq), ('Feats', iFeat), ('Spells', iSp)]:
    if v < 0: warn('PARSER: chapter heading "# %s" not found' % nm)
if iRules < 0: iRules = iEq
iSp = iSp if iSp > 0 else N

# ---------------- lineages
def p_lineages():
    out = []
    for title, s, e in h1_sections(iLin + 1, iCal):
        m = re.match(r'(.+?) \((.+?)\)', title)
        if not m: continue
        name, race = m.group(1).strip(), m.group(2).strip()
        lin = {'id': slug(name), 'name': name, 'race5e': race, 'src': loc(s), 'asi': '', 'speed': None, 'speedText': '', 'size': '', 'traits': [], 'languages': '', 'sublineages': []}
        in_note = False; sub = None
        for i in range(s + 1, e):
            ln = L[i]
            if ln.strip().startswith('{{note'): in_note = True
            if ln.strip() == '}}': in_note = False; continue
            if in_note: continue
            if ln.startswith('##### '):
                h = clean(ln[6:]); txt = next_para(i, e)
                if h.startswith('Ability Score Increase'): lin['asi'] = txt
                elif h == 'Speed':
                    lin['speedText'] = txt
                    mm = re.search(r'(\d+)\s*feet', txt); lin['speed'] = int(mm.group(1)) if mm else None
                elif h == 'Size': lin['size'] = txt
                elif h == 'Age': lin['age'] = txt
                elif h == 'Languages': lin['languages'] = txt
                else: lin['traits'].append({'name': h, 'text': txt})
            elif ln.startswith('### '):
                h = clean(ln[4:]); mm = re.match(r'(.+?)\s*\((.+?)\)$', h)
                sub = {'id': slug(mm.group(1) if mm else h), 'name': (mm.group(1) if mm else h).strip(), 'phb5e': (mm.group(2) if mm else ''), 'asi': '', 'traits': [], 'src': loc(i)}
                lin['sublineages'].append(sub)
            elif sub is not None and ln.startswith('**') and '.**' in ln:
                mm = re.match(r'\*\*(.+?)\.\*\*\s*(.*)', ln.strip())
                if mm:
                    tn, tt = clean(mm.group(1)), clean(mm.group(2))
                    if tn.startswith('Ability Score Increase'): sub['asi'] = tt
                    else:
                        sub['traits'].append({'name': tn, 'text': tt})
                        sm = re.search(r'(\d+)\s*feet', tt)
                        if tn == 'Fleet Feet' and sm: sub['speed'] = int(sm.group(1))
        out.append(lin)
    return out
lineages = safe('lineages', p_lineages, [])

# ---------------- callings
CASTER = {'Barbarian': None, 'Bard': 'full', 'Cleric': 'full', 'Druid': 'full', 'Fighter': None, 'Monk': None, 'Paladin': 'half', 'Ranger': 'half', 'Rogue': None, 'Sorcerer': 'full', 'Warlock': 'pact', 'Wizard': 'full'}
SPELLAB5E = {'Bard': 'CHA', 'Cleric': 'WIS', 'Druid': 'WIS', 'Paladin': 'CHA', 'Ranger': 'WIS', 'Sorcerer': 'CHA', 'Warlock': 'CHA', 'Wizard': 'INT'}
REST = {'full': 'long', 'half': 'long', 'pact': 'short', 'third': 'long'}
THIRD = {'Eldritch Knight': 'INT', 'Arcane Trickster': 'INT'}
ABMAP = {'str': 'STR', 'dex': 'DEX', 'con': 'CON', 'int': 'INT', 'wis': 'WIS', 'cha': 'CHA'}

def p_callings():
    calltab = {}
    iT = find(r'^\|\s*Calling\s*\|\s*5E class', iCal, iAbi)
    if iT > 0:
        _, crow, _ = parse_table(iT)
        calltab = {clean(col(r, 'Calling')): r for r in crow}
    else:
        warn('PARSER: Callings summary table (Calling | 5E class | Hit | ...) not found; hit dice come from each Calling header')
    spellab = {}
    iSA = find(r'^\|\s*Calling\s*\|\s*Spell ability', iAbi, iBg)
    if iSA > 0:
        _, sarows, _ = parse_table(iSA)
        for r in sarows:
            ab = clean(col(r, 'Spell ability'))[:3].upper()
            for cls in re.findall(r'(Wizard|Cleric|Druid|Ranger|Bard|Sorcerer|Warlock|Paladin)s?', clean(col(r, 'Calling'))):
                spellab[cls] = ab
    out = []
    for title, s, e in h1_sections(iCal + 1, iAbi):
        m = re.match(r'(.+?) \((.+?)\)$', title)
        if not m: continue
        name, cls = m.group(1).strip(), m.group(2).strip()
        t = calltab.get(name, {})
        block = '\n'.join(L[s:e])
        hd = clean(col(t, 'Hit')) if t else ''
        hm = re.search(r'\*\*Hit Die:\*\*\s*(d\d+)', block)
        if hm and hd and hm.group(1) != hd: warn('%s: Hit Die differs between the summary table (%s) and the Calling header (%s)' % (name, hd, hm.group(1)))
        if not hd and hm: hd = hm.group(1)
        saves = [ABMAP.get(x.strip().lower()[:3]) for x in clean(col(t, 'Saves')).split(',') if x.strip()] if t else []
        if not saves:
            sm = re.search(r'\*\*Saves:\*\*\s*([A-Za-z, ]+)', block)
            if sm: saves = [ABMAP.get(x.strip().lower()[:3]) for x in sm.group(1).split(',') if x.strip()]
        saves = [x for x in saves if x]
        c = {'id': slug(name), 'name': name, 'class5e': cls, 'src': loc(s), 'hitDie': hd, 'primary': clean(col(t, 'Primary')) if t else '',
             'saves': saves, 'spellAbility': spellab.get(cls) or SPELLAB5E.get(cls), 'caster': CASTER.get(cls), 'proficiencies': '', 'armorProf': '', 'weaponProf': '', 'kit': '',
             'features': [], 'subclasses': [], 'progression': None, 'multiclass': ''}
        c['hexLeadRest'] = REST.get(c['caster']) if c['caster'] else None
        sec = None
        for i in range(s + 1, e):
            ln = L[i]
            if ln.startswith('**Hit Die:**') and 'per level' in ln:
                c['proficiencies'] = clean(ln)
                pm = re.search(r'Proficiencies(?: & Kit)?:\*\*\s*(.*)$', ln)
                if pm:
                    parts = [clean(x) for x in pm.group(1).split(' · ')]
                    if len(parts) >= 1: c['armorProf'] = re.sub(r'^Armor:\s*', '', parts[0])
                    if len(parts) >= 2: c['weaponProf'] = parts[1]
                    if len(parts) >= 3: c['kit'] = ' · '.join(parts[2:])
            if ln.startswith('### '): sec = clean(ln[4:])
            if ln.startswith('##### ') and sec and sec.startswith('Frontier Retextures'):
                h = clean(ln[6:])
                if h == 'Multiclassing': c['multiclass'] = next_para(i, e)
                elif h.endswith('Progression'):
                    j = i + 1
                    while j < e and not L[j].strip().startswith('|'): j += 1
                    if j < e:
                        hdr, rows, _ = parse_table(j)
                        c['progression'] = {'columns': hdr, 'rows': [[clean(r[k]) for k in hdr] for r in rows]}
                else: c['features'].append({'name': h, 'text': next_para(i, e)})
            if sec and sec.startswith('Frontier Paths'):
                if ln.startswith('#### ') or (ln.startswith('##### ') and '(' in ln):
                    h = clean(ln.lstrip('#').strip())
                    if h.startswith('The 8 Schools'): continue
                    mm = re.match(r'(.+?)\s*\(([^()]+)\)$', h)
                    sc = {'id': slug(h), 'name': (mm.group(1) if mm else h).strip(), 'phb5e': (mm.group(2) if mm else ''), 'features': [], 'src': loc(i)}
                    c['subclasses'].append(sc)
                elif ln.startswith('- **') and (c['subclasses'] or name == 'Scholar'):
                    mm = re.match(r'- \*\*(.+?):\*\*\s*(.*)', ln)
                    if mm:
                        fn, ft = clean(mm.group(1)), clean(mm.group(2))
                        if name == 'Scholar' and not c['subclasses'][-1:] or (name == 'Scholar' and re.search(r'\(.+\)$', fn)):
                            mm2 = re.match(r'(.+?)\s*\((.+?)\)$', fn)
                            c['subclasses'].append({'id': slug(fn), 'name': mm2.group(1) if mm2 else fn, 'phb5e': mm2.group(2) if mm2 else '', 'features': [{'name': 'Discipline', 'text': ft}], 'src': loc(i)})
                        else:
                            c['subclasses'][-1]['features'].append({'name': fn, 'text': ft})
                elif c['subclasses'] and re.match(r'^\*\*Trick Shots\*\*', ln.strip()):
                    c['subclasses'][-1]['features'].append({'name': 'Trick Shots', 'text': clean(ln.strip())})
                elif c['subclasses'] and re.search(r"can't choose this oath at character creation", ln, re.I):
                    sentence = clean(ln)
                    sc = c['subclasses'][-1]
                    sc['dmOnly'] = True
                    sc['restriction'] = sentence
                    if not any(sentence in (f.get('text') or '') for f in sc['features']):
                        sc['features'].insert(0, {'name': 'DM assigned', 'text': sentence})
                elif re.match(r'^\*Additional .*:', ln.strip()):
                    for part in clean(ln).split(':', 1)[1].rstrip('.').split(','):
                        mm = re.match(r'\s*(.+?)\s*\((.+?)\)', part)
                        if mm:
                            c['subclasses'].append({'id': slug(mm.group(1)), 'name': mm.group(1).strip(), 'phb5e': mm.group(2), 'features': [], 'src': loc(i), 'note': 'Listed by name only'})
        # "Choose a Pact" style: a heading followed by a name/description table -> one option per row
        for sc in list(c['subclasses']):
            if not sc['features'] and re.match(r'choose', sc['name'], re.I):
                k = int(sc['src'].split()[-1]) - 1
                j = k + 1
                while j < e and not L[j].strip().startswith('|') and not L[j].startswith('#'): j += 1
                if j < e and L[j].strip().startswith('|'):
                    hdr, rr, _ = parse_table(j)
                    pos = c['subclasses'].index(sc)
                    intro = next_para(k, e)
                    opts = [{'id': slug(r[hdr[0]]), 'name': clean(r[hdr[0]]), 'phb5e': '', 'features': [{'name': sc['name'].replace('Choose a ', ''), 'text': clean(r[hdr[1]]) if len(hdr) > 1 else ''}], 'src': loc(j), 'group': sc['name'], 'intro': intro} for r in rr]
                    c['subclasses'][pos:pos+1] = opts
        for sc in c['subclasses']:
            if sc['phb5e'] in THIRD:
                sc['caster'] = 'third'; sc['spellAbility'] = THIRD[sc['phb5e']]; sc['hexLeadRest'] = 'long'
            if not sc['features']:
                warn('Subclass has a name but no features in the PHB: %s / %s (%s)' % (name, sc['name'], sc['src']))
        if not c['hitDie']: warn('%s: no Hit Die found' % name)
        out.append(c)
    return out
callings = safe('callings', p_callings, [])

FULL = [[2],[3],[4,2],[4,3],[4,3,2],[4,3,3],[4,3,3,1],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2,1],[4,3,3,3,2,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]]
HALF = [[],[2],[3],[3],[4,2],[4,2],[4,3],[4,3],[4,3,2],[4,3,2],[4,3,3],[4,3,3],[4,3,3,1],[4,3,3,1],[4,3,3,2],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2]]
THIRDT = [[],[],[2],[3],[3],[3],[4,2],[4,2],[4,2],[4,3],[4,3],[4,3],[4,3,2],[4,3,2],[4,3,2],[4,3,3],[4,3,3],[4,3,3],[4,3,3,1],[4,3,3,1]]
PACT = [(1,1),(2,1),(2,2),(2,2),(2,3),(2,3),(2,4),(2,4),(2,5),(2,5),(3,5),(3,5),(3,5),(3,5),(3,5),(3,5),(4,5),(4,5),(4,5),(4,5)]

def p_slotcheck():
    """Compare PHB progression slot columns (any name: Slots / Hex Lead Shells / Spell Slots) with 5E; warn only."""
    for c in callings:
        p = c['progression']
        if not p or not c['caster'] or c['caster'] == 'pact': continue
        cols = p['columns']
        cand = [k for k, h in enumerate(cols) if re.search(r'slot|shell|hex lead', h, re.I)]
        if not cand:
            warn('%s progression has no slot/shell column (columns: %s); sheet uses the standard 5E table' % (c['name'], ', '.join(cols))); continue
        ci = cand[0]
        tbl = FULL if c['caster'] == 'full' else HALF
        for lv, row in enumerate(p['rows'][:20]):
            toks = re.findall(r'\d+|—', row[ci].split('(')[0])
            vals = [int(x) if x != '—' else 0 for x in toks][:5]
            std = (tbl[lv] + [0]*9)[:5]
            if vals and len(vals) >= len([x for x in std if x]) and vals[:len(std)] != std[:len(vals)] and not (row[ci].strip() == '—' and std == [0]*5):
                warn('%s level %d %s %s differ from 5E %s (sheet uses 5E)' % (c['name'], lv+1, cols[ci], vals, std))
safe('slot check', p_slotcheck, None)

# ---------------- backgrounds
def p_backgrounds():
    out = []
    for title, s, e in h1_sections(iBg + 1, iRules if iRules > iBg else iEq):
        m = re.match(r'(.+?) \((.+?)\)$', title)
        name, twin = (m.group(1).strip(), m.group(2).strip()) if m else (title, '')
        b = {'id': slug(name), 'name': name, 'twin5e': twin, 'src': loc(s), 'skills': '', 'tools': '', 'languages': '', 'equipment': '', 'feature': {'name': '', 'twin5e': '', 'text': ''}, 'traits': {}}
        for i in range(s + 1, e):
            ln = L[i]
            if ln.startswith('##### '):
                h = clean(ln[6:]); txt = next_para(i, e)
                if h.startswith('Skill Proficiencies'): b['skills'] = txt
                elif h.startswith('Tool Proficiencies'): b['tools'] = txt
                elif h.startswith('Languages'): b['languages'] = txt
                elif h.startswith('Equipment'): b['equipment'] = txt
                elif h.startswith('Feature'):
                    mm = re.match(r'Feature\s*[—-]\s*(.+?)\s*\((.+?)\)$', h)
                    b['feature'] = {'name': mm.group(1) if mm else h.replace('Feature', '').strip(' —-'), 'twin5e': mm.group(2) if mm else '', 'text': txt}
            mm = re.match(r'^\*\*(Personality Traits|Ideals|Bonds|Flaws)\*\*', ln.strip())
            if mm:
                key = {'Personality Traits': 'personality', 'Ideals': 'ideals', 'Bonds': 'bonds', 'Flaws': 'flaws'}[mm.group(1)]
                j = i + 1
                while j < e and not L[j].strip().startswith('|'): j += 1
                if j < e:
                    hdr, rows, _ = parse_table(j)
                    b['traits'][key] = [clean(r[hdr[1]]) for r in rows if len(hdr) > 1]
        if b['skills']:
            b['skillList'] = [x.strip() for x in re.split(r',| and ', b['skills']) if x.strip()]
        if not b['feature']['name']: warn('Background without a Feature: %s' % name)
        out.append(b)
    return out
backgrounds = safe('backgrounds', p_backgrounds, [])

# ---------------- equipment tables (keyed by loose heading)
eq_tables = {}
eq_lines = {}
def p_eqtables():
    head = None
    i = iEq
    while i < iFeat:
        ln = L[i]
        if ln.startswith('#'):
            head = norm(ln.lstrip('#').strip()); eq_lines[head] = i
            i += 1; continue
        if ln.strip().startswith('|') and i + 1 < N and re.match(r'^\|\s*:?-', L[i+1].strip()):
            hdr, rows, j = parse_table(i)
            eq_tables.setdefault(head, []).append({'hdr': hdr, 'rows': [dict(r, _line=i+1+2+k) for k, r in enumerate(rows)], 'line': i})
            i = j; continue
        i += 1
safe('equipment tables', p_eqtables, None)

def tables(heading, need=None):
    """All tables under a heading whose normalised text starts with heading; optional required column."""
    h = norm(heading)
    out = []
    for k, tl in eq_tables.items():
        if k and k.startswith(h):
            for t in tl:
                if need is None or any(norm(x).startswith(norm(need)) for x in t['hdr']):
                    out.append(t)
    if not out: warn('PARSER: no table found under heading "%s"%s' % (heading, (' with column "%s"' % need) if need else ''))
    return out

def rows(heading, need=None):
    r = []
    for t in tables(heading, need): r += t['rows']
    return r

def p_armor():
    out = []
    for grp, cat in [('Light Armor', 'light'), ('Medium Armor', 'medium'), ('Heavy Armor', 'heavy'), ('Shield', 'shield')]:
        for r in rows(grp, 'AC'):
            ac = clean(col(r, 'AC'))
            base = num(ac.replace('+', '')) if not ac.startswith('+') else None
            if 'Dex' in ac:
                mm = re.search(r'max (\d)', ac); dexcap = int(mm.group(1)) if mm else 99
            else: dexcap = 0
            nm = clean(col(r, 'Armor', 'Name', 'Shield'))
            out.append({'id': slug(nm), 'name': nm, 'phb5e': clean(col(r, 'PHB type', 'PHB')), 'category': cat, 'cost': clean(col(r, 'Cost')), 'ac': ac,
                        'base': base, 'bonus': 2 if cat == 'shield' else None, 'dexCap': dexcap, 'strength': clean(col(r, 'Strength')), 'stealth': clean(col(r, 'Stealth')), 'weight': clean(col(r, 'Weight', 'Wt')), 'src': loc(r['_line'] - 1)})
    return out
armor = safe('armor', p_armor, [])

def parse_tier(cell, scatter):
    c = clean(cell)
    if not c or c in ('—', '-'): return None
    if scatter:
        bm = re.search(r'B\s*(\d+d\d+)\s*·\s*([^/]+?)\s*(?:/|S\s)', c + ' /')
        sm = re.search(r'S\s*(\d+d\d+)\s+([\d/]+)\s*·\s*MF\s*([\d–-]+)', c)
        t = {}
        if bm: t['buck'] = {'damage': bm.group(1), 'range': bm.group(2).strip()}
        if sm: t['slug'] = {'damage': sm.group(1), 'range': sm.group(2), 'misfire': sm.group(3)}
        if not t: warn('PARSER: could not read shotgun tier cell "%s"' % c)
        return t or {'raw': c}
    m = re.match(r'(\d+d\d+)\s*·\s*([\d/]+)\s*·\s*MF\s*([\d–-]+)', c)
    if not m:
        warn('PARSER: could not read gun tier cell "%s"' % c); return {'raw': c}
    return {'damage': m.group(1), 'range': m.group(2), 'misfire': m.group(3)}

def rounds_line(heading):
    i = eq_lines.get(norm(heading))
    if i is None:
        for k, v in eq_lines.items():
            if k.startswith(norm(heading)): i = v; break
    out = {}
    if i is None: return out
    for j in range(i + 1, min(i + 6, N)):
        mm = re.match(r'^\*Rounds:\s*(.*)\*$', L[j].strip())
        if mm:
            for part in mm.group(1).split('·'):
                pm = re.match(r'\s*(Light|Medium|Heavy)\s+(.*?)\s*$', part)
                if pm: out[pm.group(1).lower()] = [x.strip() for x in re.split(r'\s+or\s+|\s*/\s*', pm.group(2).replace(' only', '')) if x.strip()]
            break
    return out

AMMO_BY_LOAD = {'cartridge': 'cartridge', 'shell': 'shell', 'ball & cap': 'percussion', 'ball n cap': 'percussion', 'powder & ball': 'percussion'}
def gun_rows(heading, group_id, ability):
    out = []
    rl = rounds_line(heading)
    parent = None
    parent_props = ''
    for r in rows(heading, 'Cap'):
        nm = clean(col(r, 'Name'))
        cost = clean(col(r, 'Cost'))
        if (not cost and nm.endswith(':')) or (not cost and ':' in nm and not col(r, 'Cap').strip()):
            parent = nm.split(':')[0].strip()
            after = nm.split(':', 1)[1] if ':' in nm else ''
            parent_props = clean(re.sub(r'\([^)]*\)', '', after)).strip(' ,')
            # "close quarters, martial" lives in the header, not on the variant rows
            continue
        if nm.startswith('↳'):
            vm = re.match(r'↳\s*(\w+)', nm)
            nm = '%s (%s)' % (parent or 'Variant', vm.group(1) if vm else nm[1:].strip())
        own_props = clean(col(r, 'Properties'))
        props = own_props
        # A group header like "Pony Arms ChaosMaker: close quarters, martial (...)" applies to every variant row.
        # Keep the row's own "chambered …" text intact so calibers don't swallow those properties.
        header_props = ''
        if parent_props and nm.startswith((parent or '\0') + ' ('):
            header_props = parent_props
            if header_props and props and header_props.lower() not in props.lower():
                props = props + ', ' + header_props
            elif header_props and not props:
                props = header_props
        pl = props.lower()
        scatter = 'scatter' in pl
        tiers = {}
        for t in ('light', 'medium', 'heavy'):
            v = parse_tier(col(r, t), scatter)
            if v: tiers[t] = v
        action = clean(col(r, 'Action'))
        load = clean(col(r, 'Load'))
        trc = clean(col(r, 'TR'))
        cap = num(col(r, 'Cap'))
        w = {'id': slug(nm), 'name': nm, 'model': parent if nm.startswith(parent or '\0') else nm, 'group': group_id, 'cost': tbd(cost), 'action': action, 'tr': '✓' in trc,
             'load': load, 'capacity': cap, 'tiers': tiers, 'weight': clean(col(r, 'Wt', 'Weight')), 'properties': props, 'src': loc(r['_line'] - 1),
             'slow': 'slow' in action.lower() or 'slow load' in pl, 'ability': ability}
        w['category'] = 'martial' if 'martial' in pl or (parent and 'martial' in parent.lower()) or group_id == 'caster' else 'simple'
        if group_id == 'caster': w['category'] = 'caster'
        # rounds per tier: the row's own chambered text wins, else the section's Rounds line
        chm = re.search(r'chambered (.+)$', own_props)
        w['rounds'] = {}
        for t in tiers:
            if chm and len(tiers) == 1: w['rounds'][t] = [x.strip() for x in re.split(r'\s+or\s+', chm.group(1))]
            elif t in rl: w['rounds'][t] = rl[t]
        if w.get('rounds') is not None and AMMO_BY_LOAD.get(load.lower()) == 'percussion': w['rounds'] = {}
        if group_id == 'caster': w['ammo'] = 'cartridge'; w['hexShells'] = True
        elif 'big fifty' in nm.lower() or 'bison' in nm.lower(): w['ammo'] = 'bigfifty'
        else: w['ammo'] = AMMO_BY_LOAD.get(load.lower(), 'cartridge')
        if scatter: w['scatter'] = True
        if not tiers: warn('Gun with no tier stats: %s' % nm)
        if cap is None: warn('Gun with no capacity: %s' % nm)
        out.append(w)
    return out

def p_firearms():
    f = []
    f += gun_rows('Pistols', 'pistol', 'DEX')
    f += gun_rows('Shotguns', 'shotgun', 'STR')
    f += gun_rows('Carbines', 'carbine', 'DEX')
    f += gun_rows('Rifles', 'rifle', 'DEX')
    f += gun_rows('Big Bore', 'bigbore', 'DEX')
    return f
firearms = safe('firearms', p_firearms, [])

def p_caster():
    cg = gun_rows('Caster Guns', 'caster', 'SPELL')
    for g in cg:
        # Rifle rounds the channeling rules add on top of the pistol Rounds line.
        g.setdefault('rounds', {})
        for tier, extra in (('light', ['.22 LR', '.44 rimfire']), ('medium', []), ('heavy', ['.45-70', '.50-90'])):
            have = g['rounds'].setdefault(tier, [])
            for cal in extra:
                if cal not in have: have.append(cal)
        g['rifleRounds'] = {
            '.45-70': {'damage': '2d8', 'range': '30/120', 'misfire': '1–3'},
            '.50-90': {'damage': '2d12', 'range': '150/600', 'misfire': '1–5', 'unwieldy': True},
        }
        k = head_find(5, g['name'], iEq, iFeat)
        if k > 0:
            notes = []; j = k + 1
            started = False
            while j < iFeat and not L[j].startswith('#'):
                s = L[j].strip()
                if not s or s.startswith('<!--') or s.startswith('\\page') or s.startswith('{{') or s == '}}':
                    if started and not s: break
                    j += 1
                    continue
                if s.startswith('*') or s.startswith('- '):
                    notes.append(clean(s[2:] if s.startswith('- ') else s))
                    started = True
                    j += 1
                    continue
                break
            g['notes'] = [n for n in notes if n and n != '}}']
    return cg
caster_guns = safe('caster guns', p_caster, [])

def mrows(heading, need):
    out = []
    for r in rows(heading, need):
        nm = clean(col(r, 'Name'))
        if not nm: continue
        props = clean(col(r, 'Properties'))
        w = {'id': slug(nm), 'name': nm, 'model': nm, 'group': slug(heading), 'cost': clean(col(r, 'Cost')), 'damage': clean(col(r, 'Damage')), 'dmgType': clean(col(r, 'Type')),
             'range': clean(col(r, 'Range')), 'capacity': num(col(r, 'Capacity', 'Cap')), 'misfire': clean(col(r, 'Misfire')), 'weight': clean(col(r, 'Weight', 'Wt')), 'properties': props, 'src': loc(r['_line'] - 1)}
        pl = props.lower()
        w['category'] = 'martial' if heading.startswith('Martial') else 'simple'
        w['ability'] = 'STR/DEX' if 'finesse' in pl else ('DEX' if heading.endswith('Ranged') and 'thrown' not in pl else 'STR')
        if 'ammunition' in pl:
            am = re.search(r'ammunition \(([^)]+)\)', pl); w['ammo'] = 'arrows' if am and 'arrow' in am.group(1) else (am.group(1) if am else 'arrows')
        out.append(w)
    return out
melee = safe('melee', lambda: mrows('Simple Melee', 'Damage') + mrows('Martial Melee', 'Damage'), [])
other_ranged = safe('other ranged', lambda: mrows('Simple Ranged', 'Damage') + mrows('Martial Ranged', 'Damage'), [])

def p_ammo():
    out = []
    for r in rows('Ammunition', 'Load'):
        nm = clean(col(r, 'Load', 'Name'))
        a = {'id': slug(nm), 'name': nm, 'cost': tbd(col(r, 'Cost')), 'weight': clean(col(r, 'Weight', 'Wt')), 'src': loc(r['_line'] - 1)}
        n = nm.lower()
        pm = re.search(r'\((\d+)(?: shots)?\)', nm); a['pack'] = int(pm.group(1)) if pm else None
        if n.startswith('cartridges'):
            a['type'] = 'cartridge'; tm = re.search(r'(light|medium|heavy)', n); a['tier'] = tm.group(1) if tm else ''
        elif n.startswith('shells'):
            a['type'] = 'shell'; cm = re.search(r'(\.410|\d+ ga)', n); a['caliber'] = cm.group(1) if cm else ''
        elif 'big fifty' in n: a['type'] = 'bigfifty'; a['caliber'] = '.50-90'
        elif 'powder' in n: a['type'] = 'percussion'
        elif 'arrow' in n: a['type'] = 'arrows'
        else: a['type'] = 'service'
        out.append(a)
    return out
ammo = safe('ammo', p_ammo, [])

def p_rounds():
    """Round tiers: class -> tier -> caliber list (from the Round tiers class table)."""
    out = {}
    for t in tables('Round tiers', 'Class'):
        for r in t['rows']:
            cl = norm(col(r, 'Class'))
            out[cl] = {}
            for tier in ('light', 'medium', 'heavy'):
                v = clean(col(r, tier))
                out[cl][tier] = [] if v in ('—', '') else [x.strip() for x in re.split(r'\s+or\s+|\s*/\s*', re.sub(r'\s*\(.*?\)', '', v)) if x.strip()]
    return out
round_tiers = safe('round tiers', p_rounds, {})
round_rules = safe('round tier effects', lambda: [{'tier': clean(col(r, 'Tier')), 'damage': clean(col(r, 'Damage')), 'range': clean(col(r, 'Range')), 'misfire': clean(col(r, 'Misfire')), 'also': clean(col(r, 'Also'))} for r in rows('Round tiers', 'Tier')], [])

def bonus(s):
    m = re.search(r'\+(\d+)', clean(s)); return int(m.group(1)) if m else 0
def p_holsters():
    out = []
    for r in rows('Holsters and the Quick-Draw', 'Rig'):
        nm = clean(col(r, 'Rig', 'Holster'))
        init, first = clean(col(r, 'Init')), clean(col(r, 'First shot'))
        perk = clean(col(r, 'Perk'))
        h = {'id': slug(nm), 'name': nm, 'cost': tbd(col(r, 'Cost')), 'holds': clean(col(r, 'Holds')), 'initBonus': bonus(init), 'firstShot': bonus(first),
             'initText': init, 'firstShotText': first, 'perk': perk, 'notes': clean(col(r, 'Description', 'Notes')), 'src': loc(r['_line'] - 1),
             'isRig': not perk.lower().startswith('not a rig'), 'feedsTR': 'tactical reload' in perk.lower(), 'dexBonus': 0}
        if '*' in init or '†' in init or '*' in first or '†' in first or 'mounted only' in perk.lower() or 'only then' in perk.lower():
            h['conditional'] = True
        out.append(h)
    return out
holsters = safe('holsters', p_holsters, [])

def p_gunsmith():
    out = {'capacity': [], 'mods': [], 'caster': [], 'rules': []}
    i = head_find(4, 'Gunsmithing', iEq, iFeat)
    if i < 0: warn('PARSER: Gunsmithing section not found'); return out
    j = i + 1
    while j < iFeat and not re.match(r'^#{1,4}\s', L[j]):
        if L[j].startswith('- **'): out['rules'].append(clean(L[j][2:]))
        j += 1
    for key, h in [('capacity', 'Capacity Upgrades'), ('mods', 'Modifications'), ('caster', 'Caster Gun Work')]:
        k = head_find(5, h, i, j + 200)
        if k < 0: warn('PARSER: Gunsmithing › %s not found' % h); continue
        m = k + 1
        while m < N and not L[m].strip().startswith('|') and not L[m].startswith('#'): m += 1
        if m < N and L[m].strip().startswith('|'):
            hdr, rr, _ = parse_table(m)
            for r in rr:
                d = {norm(k2).replace(' ', '_'): (tbd(v) if 'cost' in norm(k2) else clean(v)) for k2, v in r.items() if not k2.startswith('_')}
                d['name'] = clean(r[hdr[0]])
                out[key].append(d)
    return out
gunsmithing = safe('gunsmithing', p_gunsmith, {'capacity': [], 'mods': [], 'caster': [], 'rules': []})

def p_lines(pattern, start, end):
    k = find(pattern, start, end)
    return clean(L[k]) if k > 0 else ''

packs = safe('packs', lambda: [{'phb5e': clean(col(r, 'PHB pack', 'PHB')), 'name': clean(col(r, 'Frontier label', 'Frontier', 'Name')), 'use': clean(col(r, 'Use'))} for r in rows('Packs')], [])
gear = safe('gear', lambda: [{'phb5e': clean(col(r, 'PHB item', 'PHB')), 'name': clean(col(r, 'Frontier name', 'Frontier', 'Name'))} for r in rows('Adventuring gear')], [])
tools = safe('tools', lambda: [{'phb5e': clean(col(r, 'PHB')), 'note': clean(col(r, 'Frontier note', 'Frontier', 'Note'))} for r in rows('Tools')], [])
mounts = safe('mounts', lambda: [{'phb5e': clean(col(r, 'PHB')), 'name': clean(col(r, 'Frontier label', 'Frontier', 'Name'))} for r in rows('Mounts')], [])
def p_frontier_gear():
    out = []
    for r in rows('Frontier gear and services'):
        nm = clean(col(r, 'Item', 'Name') or list(r.values())[0])
        if not nm or norm(nm) in ('item',): continue
        cost = col(r, 'Cost', 'ES')
        out.append({'name': nm, 'cost': tbd(cost) if cost else '', 'notes': clean(col(r, 'Notes', 'What', 'Use', 'Description')), 'src': loc(r.get('_line', 1) - 1)})
    for r in rows('Prices that aren'):
        nm = clean(col(r, 'Item', 'Name') or list(r.values())[0])
        if not nm or norm(nm) in ('item',): continue
        cost = col(r, 'Cost', 'ES')
        out.append({'name': nm, 'cost': tbd(cost) if cost else '', 'notes': "Price isn't PHB ×100", 'exception': True, 'src': loc(r.get('_line', 1) - 1)})
    return out
frontier_gear = safe('frontier gear', p_frontier_gear, [])

def p_explosives():
    items = []
    for r in rows('Explosives', 'Item'):
        nm = clean(col(r, 'Item'))
        if not nm or norm(nm) in ('item',): continue
        items.append({
            'id': slug(nm), 'name': nm, 'cost': tbd(col(r, 'Cost')), 'weight': clean(col(r, 'Weight')),
            'notes': clean(col(r, 'Notes')), 'src': loc(r.get('_line', 1) - 1),
            'trackable': True,  # count on the sheet like ammo
        })
    bundles = []
    for r in rows('Bundles and placed charges', 'Charge'):
        bundles.append({
            'charge': clean(col(r, 'Charge')), 'damage': clean(col(r, 'Damage')),
            'radius': clean(col(r, 'Radius')), 'save': clean(col(r, 'Dex save', 'Save')),
        })
    misfire = []
    for r in rows('Misfires', 'd6'):
        misfire.append({'roll': clean(col(r, 'd6')), 'result': clean(col(r, 'Bad fuse', 'Result'))})
    # lighting / carrying notes (short)
    rules = []
    k = head_find(5, 'Lighting and throwing', iEq, iFeat)
    if k > 0:
        j = k + 1
        while j < iFeat and not L[j].startswith('#'):
            if L[j].startswith('- '): rules.append(clean(L[j][2:]))
            j += 1
    carry = []
    k = head_find(5, 'Carrying it', iEq, iFeat)
    if k > 0:
        j = k + 1
        while j < iFeat and not L[j].startswith('#'):
            if L[j].startswith('- '): carry.append(clean(L[j][2:]))
            j += 1
    return {'items': items, 'bundles': bundles, 'misfire': misfire, 'rules': rules, 'carrying': carry,
            'note': 'Anyone can buy dynamite and anyone can throw it. The Powder Man feat makes you good at explosives.'}
explosives = safe('explosives', p_explosives, {'items': [], 'bundles': [], 'misfire': [], 'rules': [], 'carrying': [], 'note': ''})

def p_storyteller_gear():
    accessories = []
    for r in rows('Storyteller Gear', 'Item'):
        nm = clean(col(r, 'Item'))
        if not nm: continue
        accessories.append({
            'id': slug(nm), 'name': nm, 'cost': tbd(col(r, 'Cost')),
            'effect': clean(col(r, 'What it does', 'What', 'Notes')),
            'storyteller': True, 'src': loc(r.get('_line', 1) - 1),
        })
    instruments = []
    for r in rows('Instruments', 'Instrument'):
        nm = clean(col(r, 'Instrument'))
        if not nm: continue
        cost = clean(col(r, 'Cost'))
        # "4,000 / 2,000" or "Not for sale"
        quality, cheap = cost, ''
        if '/' in cost and not re.search(r'[a-zA-Z]{3,}', cost.replace('Not for sale','')):
            parts = [p.strip() for p in cost.split('/')]
            quality, cheap = parts[0], (parts[1] if len(parts) > 1 else '')
        instruments.append({
            'id': slug(nm), 'name': nm, 'costQuality': tbd(quality), 'costCheap': tbd(cheap) if cheap else '',
            'cost': cost, 'perk': clean(col(r, 'Quality perk', 'Perk')),
            'storyteller': True, 'src': loc(r.get('_line', 1) - 1),
        })
    # voice as a virtual instrument (Calling can pick voice)
    instruments.append({
        'id': 'voice', 'name': 'Voice', 'costQuality': '—', 'costCheap': '—', 'cost': '—',
        'perk': 'Hands free; everyone knows you are the caster. Gag or Silence shuts you down; creature-target spells reach 30 ft.',
        'storyteller': True, 'src': 'Calling feature (Storyteller)',
    })
    wear = []
    for r in rows('Wear', 'd8'):
        wear.append({'roll': clean(list(r.values())[0]), 'result': clean(list(r.values())[1]) if len(r) > 1 else ''})
    # Wear intro bullets
    wearRules = []
    k = head_find(5, 'Wear', iEq, iFeat)
    if k > 0:
        j = k + 1
        while j < iFeat and not (L[j].startswith('#') and j > k + 1):
            if L[j].startswith('- '): wearRules.append(clean(L[j][2:]))
            if L[j].startswith('|') and j > k + 3: break
            j += 1
        # also bullets after the table
        while j < iFeat and not L[j].startswith('#'):
            if L[j].startswith('- '): wearRules.append(clean(L[j][2:]))
            j += 1
    return {'accessories': accessories, 'instruments': instruments, 'wearTable': wear, 'wearRules': wearRules,
            'note': 'WB = Whiskey Bend Music Store only; SS = Silver Springs only. Starting-kit instrument is cheap unless Background says otherwise.'}
storyteller_gear = safe('storyteller gear', p_storyteller_gear, {'accessories': [], 'instruments': [], 'wearTable': [], 'wearRules': [], 'note': ''})

def p_kit_crosswalk():
    out = []
    for r in rows('Starting Kit Crosswalk', 'Old'):
        out.append({'old': clean(col(r, 'Old kit', 'Old')), 'frontier': clean(col(r, 'Frontier weapon', 'Frontier'))})
    street = []
    for r in rows('Street names', 'You'):
        street.append({'hear': clean(col(r, 'You', 'Youll hear', "You'll hear")), 'means': clean(col(r, 'Means'))})
    return {'crosswalk': out, 'streetNames': street}
kit_crosswalk = safe('starting kit crosswalk', p_kit_crosswalk, {'crosswalk': [], 'streetNames': []})

def split_bonus_body(body):
    """Character-level groups ('3rd Bless, Cure Wounds') are when the spells are gained, not slot levels."""
    entries, note = [], ''
    for part in re.split(r'\s*·\s*', body or ''):
        part = part.strip()
        mm = re.match(r'^(\d+)(?:st|nd|rd|th)\s+(.+)$', part)
        if not mm:
            if part:
                note = (note + ' ' + clean(part)).strip()
            continue
        names = []
        for bit in re.split(r',\s*', mm.group(2)):
            bit = bit.strip().rstrip('.')
            cut = re.split(r'\.\s+', bit, maxsplit=1)
            if cut[0].strip():
                names.append(clean(cut[0]))
            if len(cut) > 1:
                note = (note + ' ' + clean(cut[1])).strip()
        if names:
            entries.append({'atLevel': int(mm.group(1)), 'spells': names})
    return entries, note

def p_spell_lists():
    """Parse ##### Calling (5e) blocks under ### Calling spell lists into {cantrip: [...], 1: [...], ...}."""
    k = head_find(3, 'Calling spell lists', iSp, N)
    if k < 0:
        warn('PARSER: Calling spell lists not found'); return {}
    out = {}
    i = k + 1
    while i < N:
        m = re.match(r'^#####\s+(.+?)\s*$', L[i])
        if m:
            title = clean(m.group(1))
            # "Storyteller (Bard)" -> id storyteller
            base = title.split('(')[0].strip()
            cid = slug(base)
            levels = {}
            bonuses = []
            blurb = ''
            j = i + 1
            while j < N and not L[j].startswith('#####' ) and not (L[j].startswith('# ') or L[j].startswith('## ') or L[j].startswith('### ')):
                line = L[j].strip()
                if line.startswith('*') and not line.startswith('**') and not blurb and not re.search(r":\*", line):
                    blurb = clean(line.strip('*'))
                mm = re.match(r'^\*\*(Cantrips|\d+(?:st|nd|rd|th)):\*\*\s*(.*)$', line)
                if mm:
                    key = '0' if mm.group(1) == 'Cantrips' else re.match(r'(\d+)', mm.group(1)).group(1)
                    text = mm.group(2)
                    spells = [clean(x) for x in re.split(r',\s*', text) if clean(x)]
                    levels[key] = spells
                else:
                    bm = re.match(r'^\*\*(.+?):\*\*\s*(.+)$', line)
                    im = re.match(r'^\*([^*].+?):\*\s*(.+)$', line)
                    hit = bm or im
                    if hit and not re.match(r'^(Cantrips|\d+(?:st|nd|rd|th))$', hit.group(1).strip()):
                        btitle = clean(hit.group(1))
                        entries, note = split_bonus_body(hit.group(2))
                        if entries:
                            bname = btitle.split('(')[0].strip().split('.')[0].strip()
                            bonuses.append({
                                'name': bname,
                                'title': btitle,
                                'dmOnly': bool(re.search(r"can't choose|your DM tells you", btitle, re.I)),
                                'note': note,
                                'entries': entries,
                            })
                j += 1
            out[cid] = {'name': base, 'title': title, 'blurb': blurb, 'levels': levels, 'bonusLists': bonuses}
            i = j; continue
        if L[i].startswith('# ') or (L[i].startswith('## ') and i > k + 5):
            break
        i += 1
    return out
spell_lists = safe('spell lists', p_spell_lists, {})


def p_currency():
    out = []
    for r in rows('Currency', 'Value'):
        colr = clean(col(r, 'Shard', 'Color'))
        val = clean(col(r, 'Value'))
        es = num(val)
        out.append({'id': colr.lower(), 'color': colr, 'equals': val, 'es': es, 'cp': es, 'src': loc(r['_line'] - 1)})
    return out
currency = safe('currency', p_currency, [])

def p_wild():
    out = []
    for r in rows('Wild spark'):
        ks = list(r.keys())
        out.append({'roll': clean(r[ks[0]]), 'text': clean(r[ks[1]]) if len(ks) > 2 else ''})
    return out
wild = safe('wild spark', p_wild, [])

def p_reload_table():
    return [{'action': clean(col(r, 'Action')), 'reload': clean(col(r, 'Reload')), 'tr': clean(col(r, 'TR')), 'quick': clean(col(r, 'Quick Reload'))} for r in rows('Reloading', 'Reload')]
reload_table = safe('reload table', p_reload_table, [])
# ---------------- feats
def p_feats():
    iFQ = find(r'^\|\s*Western name\s*\|', iFeat, iSp)
    if iFQ < 0:
        warn('PARSER: Feats quick reference table not found'); return []
    hdr, frows, _ = parse_table(iFQ)
    out = []
    for r in frows:
        nm = clean(col(r, 'Western name'))
        f = {'id': slug(nm), 'name': nm, 'phb5e': clean(col(r, '5E name', '5E')), 'gist': clean(col(r, 'Gist')), 'prereq': '', 'bullets': []}
        k = find(r'^### ' + re.escape(nm) + r'(\s|$)', iFeat, iSp)
        if k > 0:
            f['src'] = loc(k); j = k + 1
            while j < iSp and not L[j].startswith('### ') and not L[j].startswith('# '):
                if L[j].startswith('**Prerequisite:**'): f['prereq'] = clean(L[j]).replace('Prerequisite:', '').strip()
                if L[j].startswith('- '): f['bullets'].append(clean(L[j][2:]))
                j += 1
        else: warn('Feat in quick reference has no detail section: ' + nm)
        out.append(f)
    return out
feats = safe('feats', p_feats, [])

def p_spells():
    out = []
    k = head_find(3, 'Frontier spell flavor', iSp, N)
    if k < 0: warn('PARSER: "Frontier spell flavor" table not found'); return out
    j = k
    while j < N and not L[j].strip().startswith('|'): j += 1
    hdr, r1, _ = parse_table(j)
    for r in r1:
        out.append({'phb': clean(col(r, 'PHB cantrip', 'PHB')), 'alias': clean(col(r, 'Frontier alias', 'Frontier')), 'sketch': clean(col(r, 'Fiction sketch', 'Fiction')), 'level': 0})
    # other alias tables in the Spells chapter (any table with a PHB + Frontier column)
    i = j + len(r1) + 2
    while i < N:
        if L[i].strip().startswith('|') and i + 1 < N and re.match(r'^\|\s*:?-', L[i+1].strip()):
            hdr, rr, nxt = parse_table(i)
            ph = [h for h in hdr if norm(h).startswith('phb')]; fr = [h for h in hdr if norm(h).startswith('frontier') or norm(h).startswith('western')]
            if ph and fr:
                for r in rr:
                    p = clean(r[ph[0]]).replace('(repeat ok)', '').strip()
                    a = clean(r[fr[0]])
                    if p and a and not any(x['phb'] == p for x in out): out.append({'phb': p, 'alias': a, 'level': 1})
            i = nxt; continue
        i += 1
    return out
spell_alias = safe('spell aliases', p_spells, [])

def p_insp():
    iIns = find(r'^\*\*Inspiration\.\*\*', iAbi, iBg)
    out = []
    if iIns < 0: warn('PARSER: Inspiration block not found'); return out
    for j in range(iIns, min(iIns + 20, N)):
        mm = re.match(r'- \*\*(.+?)\.\*\*\s*(.*)', L[j])
        if mm: out.append({'name': mm.group(1), 'text': clean(mm.group(2))})
    return out
insp = safe('inspiration', p_insp, [])

def section_text(level, heading, start, end, maxlines=12):
    k = head_find(level, heading, start, end)
    if k < 0: warn('PARSER: rules text "%s" not found' % heading); return ''
    buf = []; j = k + 1
    while j < end and j < k + 1 + maxlines and not L[j].startswith('#'):
        s = L[j].strip()
        if s and not s.startswith('<!--') and not s.startswith('|') and not s.startswith('{{') and s != '}}' and not s.startswith('\\'):
            buf.append(clean(s[2:] if s.startswith('- ') else s))
        j += 1
    return ' '.join(buf)

skills = [('Acrobatics', 'DEX'), ('Animal Handling', 'WIS'), ('Arcana', 'INT'), ('Athletics', 'STR'), ('Deception', 'CHA'), ('History', 'INT'), ('Insight', 'WIS'), ('Intimidation', 'CHA'), ('Investigation', 'INT'), ('Medicine', 'WIS'), ('Nature', 'INT'), ('Perception', 'WIS'), ('Performance', 'CHA'), ('Persuasion', 'CHA'), ('Religion', 'INT'), ('Sleight of Hand', 'DEX'), ('Stealth', 'DEX'), ('Survival', 'WIS')]

rt = {}
rt['takeCover'] = safe('take cover', lambda: section_text(4, 'Take Cover', iEq, iFeat, 4) or section_text(5, 'Take Cover', iRules, iEq, 4), '')
rt['reloading'] = safe('reloading', lambda: 'Reloading takes an action and fills the whole gun. Slow-load guns take a full turn. Tactical Reload (TR ✓): bonus action, load one round from a gun belt or bandolier. Quick Reload (Gunslinger) makes the reload a bonus action (not slow guns).' if head_find(4, 'Reloading', iEq, iFeat) > 0 else '', '')
rt['reloadingFull'] = safe('reloading full', lambda: section_text(4, 'Reloading', iEq, iFeat, 14), '')
rt['misfire'] = safe('misfire', lambda: section_text(4, 'Misfires', iEq, iFeat, 16), '')
rt['holster'] = 'Rig bonuses don\'t stack: use the single best initiative bonus and the single best first-shot bonus. A gun belt isn\'t a rig and always pairs. Holsters work only for pistols (the saddle scabbard holds long guns).'
rt['casterGun'] = safe('caster gun', lambda: section_text(5, 'How channeling works', iEq, iFeat, 10), '')
rt['borrowedIron'] = safe('borrowed iron', lambda: section_text(4, 'Borrowed Iron', iEq, iFeat, 3), '')
rt['chambering'] = safe('chambering', lambda: clean(L[find(r'\*\*Chambering\.\*\*', iEq, iFeat)]) if find(r'\*\*Chambering\.\*\*', iEq, iFeat) > 0 else '', '')
rt['hexLeadRest'] = safe('hex lead rest', lambda: clean(L[find(r'^- \*\*Hex lead shells\.\*\*', iCal, iAbi)]) if find(r'^- \*\*Hex lead shells\.\*\*', iCal, iAbi) > 0 else '', '')
rt['hexCylinder'] = safe('hex cylinder', lambda: clean(L[find(r'^- \*\*The cylinder\.\*\*', iCal, iAbi)]) if find(r'^- \*\*The cylinder\.\*\*', iCal, iAbi) > 0 else '', '')
rt['currency'] = safe('currency text', lambda: p_lines(r'^\*\*Reading PHB prices:\*\*', iEq, iFeat) + ' ' + p_lines(r"^\*\*Shops don't make change\*\*", iEq, iFeat), '')
rt['addiction'] = ''
rt['explosives'] = safe('explosives text', lambda: (explosives.get('note') or '') + ' ' + ' '.join(explosives.get('rules') or [])[:400], '')
rt['storytellerWear'] = safe('storyteller wear', lambda: ' '.join((storyteller_gear.get('wearRules') or [])[:6]), '')
if not re.search(r'addict', raw, re.I):
    warn('The PHB has no Eldorite addiction rule yet; the DM Command Center keeps the chart (players do not see it).')

rules = {
    'meta': {'title': 'Six-Shooters & Sorcery: Dust and Shadows', 'short': 'SSDNS', 'source': os.path.basename(SRC), 'sourceSha1': hashlib.sha1(raw.encode()).hexdigest()[:12],
             'builtAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M CT'), 'rulesVersion': 3, 'currencyUnit': 'ES',
             'note': 'Generated from the live PHB markdown by tools/build_rules.py. Do not hand-edit; re-run the script.'},
    'abilities': [{'id': 'STR', 'name': 'Strength', 'frontier': 'Muscle & Haul'}, {'id': 'DEX', 'name': 'Dexterity', 'frontier': 'Quick Iron & Balance'}, {'id': 'CON', 'name': 'Constitution', 'frontier': 'Dust Lung & Grit'},
                  {'id': 'INT', 'name': 'Intelligence', 'frontier': 'Book, Cipher & Claim Map'}, {'id': 'WIS', 'name': 'Wisdom', 'frontier': 'Trail Eye & Nerve'}, {'id': 'CHA', 'name': 'Charisma', 'frontier': 'Presence & Pay Tongue'}],
    'skills': [{'name': n, 'ability': a} for n, a in skills],
    'lineages': lineages, 'callings': callings, 'backgrounds': backgrounds,
    'armor': armor, 'firearms': firearms, 'casterGuns': caster_guns, 'melee': melee, 'otherRanged': other_ranged,
    'ammo': ammo, 'roundTiers': round_tiers, 'roundTierRules': round_rules, 'holsters': holsters, 'gunsmithing': gunsmithing, 'reloadTable': reload_table,
    'packs': packs, 'gear': gear, 'frontierGear': frontier_gear, 'tools': tools, 'mounts': mounts,
    'explosives': explosives, 'storytellerGear': storyteller_gear, 'kitCrosswalk': kit_crosswalk,
    'currency': currency, 'wildSpark': wild, 'feats': feats, 'spellAliases': spell_alias, 'spellLists': spell_lists, 'inspiration': insp,
    'slots5e': {'full': FULL, 'half': HALF, 'third': THIRDT, 'pact': PACT},
    'rulesText': rt,
    'warnings': warnings,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write('/* SSDNS rules data. GENERATED from %s (sha1 %s) on %s by tools/build_rules.py. Do not hand-edit. */\n' % (os.path.basename(SRC), rules['meta']['sourceSha1'], rules['meta']['builtAt']))
    f.write('window.SSDNS_RULES = ')
    json.dump(rules, f, ensure_ascii=False, indent=1)
    f.write(';\n')
print('lineages', len(lineages), [(l['name'], len(l['sublineages'])) for l in lineages])
print('callings', len(callings), [(c['name'], c['hitDie'], len(c['subclasses'])) for c in callings])
print('backgrounds', len(backgrounds), 'armor', len(armor), 'firearms', len(firearms), 'caster', len(caster_guns), 'melee', len(melee), 'otherRanged', len(other_ranged))
print('ammo', len(ammo), 'holsters', len(holsters), 'feats', len(feats), 'aliases', len(spell_alias), 'currency', len(currency), 'insp', len(insp), 'wild', len(wild), 'mods', len(gunsmithing['mods']), 'capUp', len(gunsmithing['capacity']))
print('explosives', len(explosives.get('items', [])), 'bundles', len(explosives.get('bundles', [])), 'storytellerAcc', len(storyteller_gear.get('accessories', [])), 'instruments', len(storyteller_gear.get('instruments', [])), 'spellLists', list(spell_lists.keys()), 'kitCrosswalk', len(kit_crosswalk.get('crosswalk', [])))
print('--- warnings (%d)' % len(warnings))
for w in warnings: print(' *', w)
