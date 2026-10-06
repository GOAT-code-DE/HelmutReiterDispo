import json, math, sys
osm, route, aus = sys.argv[1], sys.argv[2], sys.argv[3]
LAT0, LON0 = 51.4559, 7.05868
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110540
lokal = lambda lon, lat: [round((lon - LON0) * KX, 2), round((lat - LAT0) * KY, 2)]
d = json.load(open(osm, encoding='utf-8'))
gebaeude, strassen = [], []
for e in d['elements']:
    t, g = e.get('tags', {}), e.get('geometry') or []
    if len(g) < 2: continue
    pts = [lokal(p['lon'], p['lat']) for p in g]
    if 'building' in t:
        if pts[0] == pts[-1]: pts = pts[:-1]
        if len(pts) < 3: continue
        h = None
        try: h = float(str(t.get('height', '')).replace('m', '').strip())
        except ValueError: pass
        if h is None and t.get('building:levels', '').isdigit(): h = int(t['building:levels']) * 3.2 + 1
        if h is None: h = {'industrial': 9, 'warehouse': 10, 'commercial': 9, 'office': 12, 'house': 7, 'garage': 3, 'roof': 4}.get(t['building'], 8)
        gebaeude.append({'id': e['id'], 'h': h, 'pts': pts, 'reiter': e['id'] == 458047286})
    elif 'highway' in t:
        b = {'motorway': 14, 'trunk': 12, 'primary': 11, 'secondary': 9, 'tertiary': 8, 'residential': 6, 'unclassified': 6, 'service': 4}.get(t['highway'], 5)
        strassen.append({'b': b, 'pts': pts})
r = json.load(open(route))['routes'][0]['geometry']['coordinates']
rpts = [lokal(lon, lat) for lon, lat in r]
rpts = [p for p in rpts if math.hypot(*p) < 380][:400]
json.dump({'gebaeude': gebaeude, 'strassen': strassen, 'route': rpts}, open(aus, 'w'))
print(len(gebaeude), 'Gebäude', len(strassen), 'Straßen', len(rpts), 'Routenpunkte', 'Reiter:', sum(g['reiter'] for g in gebaeude))
