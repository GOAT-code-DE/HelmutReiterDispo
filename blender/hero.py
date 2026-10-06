# Blender 4.2: Hero-Bild vom Reiter-Hof im hellen Dashboard-Stil.
# Aufruf: blender -b -P hero.py -- szene.json ausgabe.png [prozent] [samples]
import bpy, bmesh, json, math, sys

argv = sys.argv[sys.argv.index('--') + 1:]
daten = json.load(open(argv[0]))
ausgabe, prozent = argv[1], int(argv[2]) if len(argv) > 2 else 100
samples = int(argv[3]) if len(argv) > 3 else 128

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def lin(hexfarbe):  # sRGB-Hex → lineare Farbe
    c = [int(hexfarbe[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def material(name, farbe, rau=0.85, leuchten=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(farbe), 1)
    b.inputs['Roughness'].default_value = rau
    if leuchten:
        b.inputs['Emission Color'].default_value = (*lin(farbe), 1)
        b.inputs['Emission Strength'].default_value = leuchten
    return m

WEISS = material('weiss', '#f3f4f6')
ORANGE = material('orange', '#f59e0b', 0.6, 0.35)
BODEN = material('boden', '#d6dbe0')
STRASSE = material('strasse', '#fafbfc', 0.95)
ROUTE = material('route', '#0f7a32', 0.4)
KABINE = material('kabine', '#ffffff', 0.4)
STREIFEN = material('streifen', '#27a849', 0.5)
DECK = material('deck', '#5b6770', 0.7)
REIFEN = material('reifen', '#222629', 0.9)
GERAET = {'rot': material('rot', '#d32f2f', 0.5), 'gelb': material('gelb', '#f2b705', 0.5), 'gruen': material('gruen2', '#2e7d32', 0.5)}

def objekt(name, bm, mat, fase=0.0):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    sc.collection.objects.link(ob)
    if fase:
        mod = ob.modifiers.new('fase', 'BEVEL')
        mod.width, mod.segments, mod.limit_method = fase, 2, 'ANGLE'
    return ob

def prisma(name, pts, h, mat, z0=0.0, fase=0.25):
    flaeche = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    if flaeche < 0:
        pts = pts[::-1]
    bm = bmesh.new()
    try:
        f = bm.faces.new([bm.verts.new((x, y, z0)) for x, y in pts])
    except ValueError:
        bm.free()
        return None
    neu = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, verts=[v for v in neu['geom'] if isinstance(v, bmesh.types.BMVert)], vec=(0, 0, h))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return objekt(name, bm, mat, fase)

def band(name, pts, breite, z, mat):  # Linie als flaches Band
    bm = bmesh.new()
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy) or 1
        ox, oy = -dy / n * breite / 2, dx / n * breite / 2
        v = [bm.verts.new(p) for p in ((x1 + ox, y1 + oy, z), (x2 + ox, y2 + oy, z), (x2 - ox, y2 - oy, z), (x1 - ox, y1 - oy, z))]
        bm.faces.new(v)
    for (x, y) in pts:  # runde Gelenke
        bmesh.ops.create_circle(bm, cap_ends=True, segments=12, radius=breite / 2, matrix=__import__('mathutils').Matrix.Translation((x, y, z)))
    return objekt(name, bm, mat)

def quader(name, groesse, ort, mat, drehung=0.0, fase=0.08):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= groesse[0]; v.co.y *= groesse[1]; v.co.z *= groesse[2]
    ob = objekt(name, bm, mat, fase)
    ob.location = ort
    ob.rotation_euler[2] = drehung
    return ob

def lkw(name, x, y, drehung, laenge, ladung=None):
    """Lkw in Fahrtrichtung `drehung` (Bogenmaß), Fahrerhaus vorn."""
    teile = []
    c, s = math.cos(drehung), math.sin(drehung)
    at = lambda vor, z: (x + c * vor, y + s * vor, z)
    gesamt = laenge + 2.6
    teile.append(quader(name + '_kabine', (2.4, 2.5, 2.8), at(gesamt / 2 - 1.2, 2.0), KABINE, drehung))
    teile.append(quader(name + '_streifen', (2.42, 2.52, 0.3), at(gesamt / 2 - 1.2, 2.2), STREIFEN, drehung, 0.02))
    teile.append(quader(name + '_deck', (laenge, 2.5, 0.25), at(gesamt / 2 - 2.6 - laenge / 2, 1.2), DECK, drehung, 0.04))
    for vor in (gesamt / 2 - 1.2, -gesamt / 2 + 1.5, -gesamt / 2 + 2.8):
        for seite in (-1, 1):
            r = bpy.data.objects.new(name + '_rad', bpy.data.meshes.new(name + '_radm'))
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.5, radius2=0.5, depth=0.45)
            bm.to_mesh(r.data); bm.free()
            r.data.materials.append(REIFEN)
            sc.collection.objects.link(r)
            r.rotation_euler = (math.pi / 2, 0, drehung)
            r.location = (x + c * vor - s * seite * 1.1, y + s * vor + c * seite * 1.1, 0.5)
    if ladung:
        farbe, l, h = ladung
        teile.append(quader(name + '_ladung', (l, 2.2, h), at(gesamt / 2 - 3.0 - l / 2, 1.33 + h / 2), GERAET[farbe], drehung, 0.12))
    return teile

# ---------- Szene ----------
boden = quader('boden', (1600, 1600, 0.2), (0, 0, -0.1), BODEN, 0, 0)
for i, st in enumerate(daten['strassen']):
    band(f'strasse{i}', st['pts'], st['b'], 0.02 + i * 0.0001, STRASSE)
for g in daten['gebaeude']:
    prisma(f"haus{g['id']}", g['pts'], g['h'] + (5 if g['reiter'] else 0), ORANGE if g['reiter'] else WEISS)
route = daten['route']
if len(route) >= 2:
    band('route', route, 5.0, 0.3, ROUTE)

def im_gebaeude(x, y, rand=0.0):
    for g in daten['gebaeude']:
        p = g['pts']
        xs, ys = [q[0] for q in p], [q[1] for q in p]
        if not (min(xs) - rand <= x <= max(xs) + rand and min(ys) - rand <= y <= max(ys) + rand):
            continue
        drin = False
        for i in range(len(p)):
            (x1, y1), (x2, y2) = p[i], p[i - 1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                drin = not drin
        if drin or rand:
            return True
    return False

def an_strasse(x, y, rand):
    for st in daten['strassen']:
        for (x1, y1), (x2, y2) in zip(st['pts'], st['pts'][1:]):
            dx, dy = x2 - x1, y2 - y1
            t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / ((dx * dx + dy * dy) or 1)))
            if math.hypot(x - x1 - t * dx, y - y1 - t * dy) < st['b'] / 2 + rand:
                return True
    return False

# Lkw auf dem Gerätehof südlich der Halle (Lage aus dem Luftbild), nebeneinander geparkt
reihe, ausrichtung = math.radians(-53.4), math.radians(36.6)
for i, (l, ladung) in enumerate([(7.5, ('rot', 6.0, 2.5)), (6.2, ('gelb', 2.9, 2.1)), (13.6, ('rot', 6.9, 3.0)), (7.5, None), (9.0, ('gruen', 6.3, 2.6))]):
    x, y = -12 + i * 4.6 * math.cos(reihe), -70 + i * 4.6 * math.sin(reihe)
    if im_gebaeude(x, y):
        print('WARNUNG: Hof-Lkw', i, 'steht in einem Gebäude', round(x, 1), round(y, 1))
    lkw(f'hoflkw{i}', x, y, ausrichtung, l, ladung)

# Weiße Bäume auf freien Flächen, gleichmäßig gestreut (fester Zufall)
import random
random.seed(7)
BAUM = material('baum', '#fdfdfd', 0.9)
baeume = 0
for gx in range(-330, 331, 11):
    for gy in range(-330, 331, 11):
        x, y = gx + random.uniform(-4, 4), gy + random.uniform(-4, 4)
        if random.random() > 0.17 or math.hypot(x, y) > 340 or im_gebaeude(x, y, 0) or an_strasse(x, y, 2.5):
            continue
        if any(math.hypot(x - g['pts'][0][0], y - g['pts'][0][1]) < 3 for g in daten['gebaeude']):
            continue
        r = random.uniform(1.8, 2.8)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
        krone = objekt('baum', bm, BAUM)
        krone.location = (x, y, r + 1.2)
        krone.scale = (1, 1, 0.85)
        baeume += 1
print('Bäume:', baeume)
if len(route) >= 2:
    k = min(14, len(route) - 2)
    (x1, y1), (x2, y2) = route[k], route[k + 1]
    lkw('routenlkw', x1, y1, math.atan2(y2 - y1, x2 - x1), 7.5, ('gruen', 6.3, 2.6))

# ---------- Licht, Kamera, Render ----------
welt = bpy.data.worlds.new('welt')
sc.world = welt
welt.use_nodes = True
welt.node_tree.nodes['Background'].inputs['Color'].default_value = (*lin('#eef1f4'), 1)
welt.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
sonne = bpy.data.objects.new('sonne', bpy.data.lights.new('sonne', 'SUN'))
sonne.data.energy, sonne.data.angle = 5.0, math.radians(5)
sonne.rotation_euler = (math.radians(42), 0, math.radians(150))
sc.collection.objects.link(sonne)

ziel = bpy.data.objects.new('ziel', None)
ziel.location = (-6, -50, 0)
sc.collection.objects.link(ziel)
kam = bpy.data.objects.new('kamera', bpy.data.cameras.new('kamera'))
kam.data.lens = 50
abstand, hoehe, richtung = 340, math.radians(46), math.radians(232)
kam.location = (ziel.location.x + abstand * math.cos(hoehe) * math.cos(richtung),
                ziel.location.y + abstand * math.cos(hoehe) * math.sin(richtung),
                abstand * math.sin(hoehe))
kam.constraints.new('TRACK_TO').target = ziel
sc.collection.objects.link(kam)
sc.camera = kam

sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
gpu = False
for typ in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = typ
        prefs.get_devices()
        geraete = [d for d in prefs.devices if d.type == typ]
        if geraete:
            for d in prefs.devices: d.use = d.type == typ
            gpu = True
            break
    except TypeError:
        continue
sc.cycles.device = 'GPU' if gpu else 'CPU'
print('Render-Gerät:', sc.cycles.device, prefs.compute_device_type)
sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, prozent
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Punchy'
sc.view_settings.exposure = 0.2
sc.render.filepath = ausgabe
bpy.ops.render.render(write_still=True)
print('fertig:', ausgabe)
