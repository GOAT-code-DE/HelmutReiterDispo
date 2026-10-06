'use strict';
// Hofansicht als stilisierte 3D-Szene (three.js). Layout ist ein Beispiel, nicht Reiters echter Hof.
// Szene in Metern: x nach Osten, z nach Süden, y nach oben. Halle im Norden, Straße im Westen.

const HALLE3D = { x0: 0, x1: 62, z0: -32, z1: -4, h: 10 };
const RAMPEN = [8, 15, 22].map((x) => ({ x }));
const RAMPE_HECK = -3.6;                 // Heck des angedockten Lkw
const PLATZ_HECK = 26;                   // Heck der geparkten Lkw
const PLAETZE = LKW.map((l, i) => ({ x: -2 + i * 5.2 }));
const GASSE = 19;                        // Fahrgasse zwischen Rampen und Stellplätzen
const TOR = { x: -16, z: GASSE }, STRASSE_X = -24, FERNE = -75;
const BEREIT = { x0: 34, x1: 60, z0: 2, z1: 13 };

let hofSzene = null;

// ---------- Logik: Rampenplan und Zustände (unabhängig von der Darstellung) ----------
// Wer zuerst kommt, bekommt die zuerst freie Rampe und behält sie.
// Ist keine frei, wartet der Lkw; die Wartezeit fehlt ihm beim Laden und verspätet die Abfahrt.
// Stapler werden im selben Durchgang verplant: Die Rampe bleibt belegt, bis der Stapler fertig ist.
function rampenPlan() {
  const ladungen = [];
  for (const t of stand.touren) {
    const ph = phasen(t);
    ph.forEach((p, i) => {
      if (p.typ === 'laden' && p.wo === 'hof') ladungen.push({ t, p, art: i === 0 ? 'laden' : i === ph.length - 1 ? 'abladen' : null });
    });
  }
  ladungen.sort((a, b) => a.p.von - b.p.von || a.t.lkw.localeCompare(b.t.lkw));
  const frei = RAMPEN.map(() => TAG_START), staplerFrei = STAPLER_HEIM.map(() => -Infinity);
  const plan = new Map();
  for (const x of ladungen) {
    const r = frei.indexOf(Math.min(...frei));
    const beginn = Math.max(x.p.von, frei[r]), warten = beginn - x.p.von;
    const e = { rampe: r, beginn, warten, ende: beginn + LADEN_MIN };
    if (x.art) {   // Stapler beginnt erst, wenn der Lkw angedockt und ein Stapler frei ist
      const k = staplerFrei.indexOf(Math.min(...staplerFrei));
      const ab = x.art === 'laden' || warten > 0 ? beginn + BEWEGUNG : x.p.von;
      e.stapler = k;
      e.von = Math.max(ab, staplerFrei[k]);
      e.bis = Math.max(e.von + STAPLER_MIN, x.p.bis + warten);
      staplerFrei[k] = e.bis;
      e.ende = Math.max(e.ende, e.bis);
    }
    frei[r] = e.ende;
    plan.set(`${x.t.id}|${x.p.von}`, e);
  }
  return plan;
}

// Wo steht jeder Lkw zur Zeit `zeit`? parkt | laedt (Rampe oder Warteschlange) | weg
function lkwZustaende() {
  const z = {};
  const ladend = [];
  for (const l of LKW) {
    let zustand = { art: 'parkt' };
    for (const t of stand.touren.filter((x) => x.lkw === l.id)) {
      const p = phaseUm(t);
      if (!p) continue;
      zustand = (p.typ === 'laden' && p.wo === 'hof') ? { art: 'laedt', tour: t, phase: p } : { art: 'weg', tour: t, phase: p };
      break;
    }
    if (zustand.art === 'parkt') {
      zustand.naechste = stand.touren.filter((x) => x.lkw === l.id && x.start > zeit).sort((a, b) => a.start - b.start)[0] || null;
    }
    if (zustand.art === 'laedt') ladend.push({ l, zustand });
    z[l.id] = zustand;
  }
  const plan = rampenPlan();
  if (datum === HEUTE) {
    for (const a of staplerAuftraege(plan)) {   // verspätet: Stapler noch nicht fertig, obwohl die Planzeit vorbei ist
      if (zeit >= a.phase.bis && zeit < a.bis) {   // Rampe oder Warteschlange entscheidet unten der Rampenplan
        const zst = { art: 'laedt', tour: a.t, phase: a.phase, verspaetet: true };
        const alt = ladend.findIndex((x) => x.l.id === a.l.id);
        if (alt >= 0) ladend.splice(alt, 1);
        ladend.push({ l: a.l, zustand: zst });
        z[a.l.id] = zst;
      }
    }
  }
  const eintrag = (x) => plan.get(`${x.zustand.tour.id}|${x.zustand.phase.von}`);
  ladend.filter((x) => zeit < eintrag(x).beginn)
    .forEach((x, i) => { x.zustand.warteplatz = i; x.zustand.warten = eintrag(x).warten; });
  ladend.filter((x) => zeit >= eintrag(x).beginn)
    .forEach((x) => { x.zustand.rampe = eintrag(x).rampe; x.zustand.warten = eintrag(x).warten; });
  return z;
}

// ---------- Szene aufbauen ----------
function flaeche(bx, bz, farbe, x, z, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(bx, bz), mat(farbe, { roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}
function baum(x, z, s = 1) {
  const g = new THREE.Group();
  g.add(schatten(new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.24 * s, 2.2 * s, 8), mat('#b7a48e'))));
  g.children[0].position.y = 1.1 * s;
  const krone = schatten(new THREE.Mesh(new THREE.SphereGeometry(1.5 * s, 16, 12), mat('#7cc98f', { roughness: 0.8 })));
  krone.position.y = 3.1 * s;
  krone.scale.set(1, 1.15, 1);
  g.add(krone);
  g.position.set(x, 0, z);
  return g;
}
function zaun(punkte) {
  const g = new THREE.Group(), pfosten = mat('#c3ccd8'), gitter = mat('#d4dbe5', { transparent: true, opacity: 0.55 });
  for (let i = 1; i < punkte.length; i++) {
    const [ax, az] = punkte[i - 1], [bx, bz] = punkte[i];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3));
    for (let k = 0; k <= n; k++) g.add(quader(0.1, 2, 0.1, pfosten, ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n));
    const feld = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.8), gitter);
    feld.position.set((ax + bx) / 2, 1.05, (az + bz) / 2);
    feld.rotation.y = -Math.atan2(bz - az, bx - ax);
    g.add(feld);
  }
  return g;
}
function schriftzug(text, breite, hoehe) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 160);
  g.fillStyle = '#27a849'; g.font = '700 96px Ubuntu, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 86);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(breite, hoehe), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
  return m;
}

function mitKanten(m, farbe = '#a9b6c7') { // feine Kontur wie in Isometrie-Grafiken
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: farbe })));
  return m;
}
function halle() {
  const g = new THREE.Group(), { x0, x1, z0, z1, h } = HALLE3D;
  const w = x1 - x0, t = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  g.add(mitKanten(quader(w, h, t, mat('#f4f7fb'), cx, 0, cz)));
  g.add(quader(w - 0.6, 0.12, t - 0.6, mat('#e4eaf2'), cx, h, cz));                          // Dach
  for (const [bx, bz, x, z] of [[w + 0.3, 0.4, cx, z0], [w + 0.3, 0.4, cx, z1], [0.4, t + 0.3, x0, cz], [0.4, t + 0.3, x1, cz]]) {
    g.add(quader(bx, 0.6, bz, mat('#27a849'), x, h - 0.1, z));                                // Attika-Rand in Reiter-Grün
  }
  for (let x = x0 + 5; x < x1 - 2; x += 6) g.add(mitKanten(quader(1.6, 0.5, t - 6, mat('#dbe6f3'), x, h + 0.1, cz))); // Lichtbänder
  g.add(mitKanten(quader(16, 7, 12, mat('#fbfcfe'), x1 + 8, 0, z1 - 6)));                    // Bürotrakt
  g.add(quader(16.1, 1.3, 12.1, mat('#2f3d4a', { roughness: 0.25 }), x1 + 8, 2.2, z1 - 6));  // Fensterband
  g.add(quader(16.1, 1.3, 12.1, mat('#2f3d4a', { roughness: 0.25 }), x1 + 8, 4.6, z1 - 6));
  g.add(quader(16.4, 0.4, 12.4, mat('#27a849'), x1 + 8, 7, z1 - 6));
  const sw = schriftzug('HELMUT REITER', 22, 3.4);
  sw.position.set(x0 + 44, h - 2.4, z1 + 0.03);
  g.add(sw);
  RAMPEN.forEach((r, i) => {                                                                // Rampentore
    g.add(quader(4.2, 4.6, 0.3, mat('#27a849'), r.x, 0.9, z1 + 0.05));
    g.add(quader(3.6, 4.2, 0.32, mat('#cfd8e4'), r.x, 1.1, z1 + 0.06));
    for (let k = 0; k < 6; k++) g.add(quader(3.6, 0.04, 0.34, mat('#b9c4d2'), r.x, 1.4 + k * 0.65, z1 + 0.06));
    g.add(quader(3.4, 1.2, 1.4, mat('#9aa6b4'), r.x, 0, z1 + 0.7));                         // Ladebrücke
    const nr = schild(`Rampe ${i + 1}`, '#ffffff', '#27a849', 2.6);
    nr.userData.px = 22;
    nr.position.set(r.x, 6.6, z1 + 0.6);
    g.add(nr);
  });
  return g;
}

function hofAufbauen() {
  const huelle = $('#hof3d');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return false; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  huelle.replaceChildren(renderer.domElement);
  const szene = new THREE.Scene();
  szene.background = new THREE.Color('#e9eef5');
  szene.add(new THREE.HemisphereLight(0xffffff, 0xb9c5d6, 0.85));
  const sonne = new THREE.DirectionalLight(0xffffff, 0.85);
  sonne.position.set(-70, 85, -45);
  sonne.target.position.set(22, 0, 8);
  sonne.castShadow = true;
  sonne.shadow.mapSize.set(4096, 4096);
  sonne.shadow.radius = 3;
  Object.assign(sonne.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 260 });
  szene.add(sonne, sonne.target);

  // Boden, Straße, Hofflächen, Markierungen
  szene.add(flaeche(400, 400, '#e9eef5', 20, 0, -0.02));
  szene.add(flaeche(11, 400, '#cdd6e3', STRASSE_X, 0, 0));
  for (let z = -190; z < 200; z += 8) szene.add(quader(0.25, 0.02, 3.5, mat('#ffffff'), STRASSE_X, 0.01, z));
  for (let k = 0; k < 6; k++) szene.add(quader(1.2, 0.02, 0.6, mat('#ffffff'), STRASSE_X - 3 + k * 1.2, 0.01, GASSE + 4));
  szene.add(flaeche(98, 86, '#f6f8fb', 31, 7, 0.005));
  szene.add(flaeche(84, 7, '#dfe5ee', 22, GASSE, 0.008));
  for (let x = -2; x < 80; x += 6) szene.add(quader(3, 0.02, 0.2, mat('#ffffff'), x, 0.012, GASSE));
  PLAETZE.forEach((p) => { szene.add(quader(0.15, 0.02, 20, mat('#ffffff'), p.x - 2.6, 0.012, PLATZ_HECK + 10)); });
  szene.add(quader(0.15, 0.02, 20, mat('#ffffff'), PLAETZE[PLAETZE.length - 1].x + 2.6, 0.012, PLATZ_HECK + 10));
  RAMPEN.forEach((r) => szene.add(quader(4.4, 0.02, 18, mat('#d3f0dc'), r.x, 0.011, -4 + 9)));
  szene.add(quader(BEREIT.x1 - BEREIT.x0, 0.03, BEREIT.z1 - BEREIT.z0, mat('#fff3cf'), (BEREIT.x0 + BEREIT.x1) / 2, 0.01, (BEREIT.z0 + BEREIT.z1) / 2));
  const bs = schild('Bereitstellung', '#8a6100', '#fff3cf', 4.2);
  bs.userData.px = 20;
  bs.position.set((BEREIT.x0 + BEREIT.x1) / 2, 0.8, BEREIT.z1 + 1);
  szene.add(bs);
  szene.add(halle());
  szene.add(zaun([[-18, 14], [-18, -36], [80, -36], [80, 50], [-18, 50], [-18, 25]]));
  const torSchild = schild('Ein-/Ausfahrt', '#1f2429', 'rgba(255,255,255,.95)', 3.6);
  torSchild.userData.px = 20;
  torSchild.position.set(TOR.x, 3, GASSE);
  szene.add(torSchild);
  for (const [x, z, s] of [[-31, -30, 1], [-31, -10, 1.1], [-31, 12, 0.9], [-31, 40, 1], [-12, 54, 1], [6, 54, 1.1], [26, 54, 0.9], [46, 54, 1], [66, 54, 1.1],
    [84, 40, 1], [84, 16, 0.9], [84, -12, 1.1], [84, -32, 1], [-12, -40, 1], [30, -40, 1.1], [70, -40, 0.9]]) szene.add(baum(x, z, s));

  // Rücknahme-Fläche, Stapler (Reiter ist Staplerhändler) und Geräte
  szene.add(quader(RUECKNAHME.x1 - RUECKNAHME.x0, 0.03, RUECKNAHME.z1 - RUECKNAHME.z0, mat('#e3ecf9'), (RUECKNAHME.x0 + RUECKNAHME.x1) / 2, 0.01, (RUECKNAHME.z0 + RUECKNAHME.z1) / 2));
  const rs = schild('Rücknahme / Werkstatt', '#2f5f9e', '#e3ecf9', 4.2);
  rs.userData.px = 20;
  rs.position.set((RUECKNAHME.x0 + RUECKNAHME.x1) / 2, 0.8, RUECKNAHME.z1 + 1);
  szene.add(rs);
  const stapler = STAPLER_HEIM.map(([x, z]) => {
    const s = geraetKoerper({ form: 'stapler', l: 2.7, b: 1.2, h: 2.2, farbe: '#f2b705' });
    s.position.set(x, 0, z);
    szene.add(s);
    return s;
  });
  const geraeteGruppe = new THREE.Group();
  szene.add(geraeteGruppe);

  // Lkw
  const lkw = {};
  for (const l of LKW) {
    const modell = lkwModell(l);
    const lang = modell.userData.laenge;
    modell.position.x = -(l.laenge - 2.6) / 2;      // Modell auf seine Mitte zentrieren
    const ladung = new THREE.Group();
    modell.add(ladung);
    const gruppe = new THREE.Group();
    gruppe.add(modell);
    const nummer = schild(l.kz.replace('E-HR ', ''), '#ffffff', '#1f2429', 2.2, 2);
    nummer.userData.px = 26;              // feste Bildschirmgröße, auch herausgezoomt lesbar
    nummer.position.y = 5;
    nummer.userData.versatzPx = (LKW.indexOf(l) % 2) * 30; // jede zweite Nummer höher, in Bildschirm-Pixeln
    gruppe.add(nummer);
    gruppe.userData.lkw = l.id;
    szene.add(gruppe);
    lkw[l.id] = { l, gruppe, ladung, nummer, lang };
  }

  // Kamera: orthografisch, schräg von oben; Ziehen dreht, Mausrad zoomt
  const kamera = new THREE.OrthographicCamera(-50, 50, 30, -30, 1, 800);
  const blick = { winkel: 2.15, hoehe: 0.6, zoom: 1.2, ziel: new THREE.Vector3(27, 0, 9) };
  let zieht = null, bewegt = 0;
  const c = renderer.domElement;
  c.addEventListener('pointerdown', (e) => { zieht = { x: e.clientX, y: e.clientY }; bewegt = 0; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => {
    if (!zieht) return;
    bewegt += Math.abs(e.clientX - zieht.x) + Math.abs(e.clientY - zieht.y);
    blick.winkel -= (e.clientX - zieht.x) * 0.006;
    blick.hoehe = Math.max(0.25, Math.min(1.35, blick.hoehe + (e.clientY - zieht.y) * 0.004));
    zieht = { x: e.clientX, y: e.clientY };
  });
  c.addEventListener('pointerup', (e) => {
    zieht = null;
    if (bewegt > 6) return;
    const r = c.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, kamera);
    const treffer = ray.intersectObjects(Object.values(lkw).filter((x) => x.gruppe.visible).map((x) => x.gruppe), true)[0];
    let o = treffer?.object;
    while (o && !o.userData.lkw) o = o.parent;
    const z = o && lkwZustaende()[o.userData.lkw];
    if (z?.tour) zeigeTour(z.tour.id);
  });
  c.addEventListener('pointercancel', () => { zieht = null; }); // Browser übernimmt das Scrollen (touch-action: pan-y)
  c.addEventListener('wheel', (e) => { e.preventDefault(); blick.zoom = Math.max(0.6, Math.min(3.5, blick.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); }, { passive: false });

  hofSzene = { renderer, szene, kamera, blick, lkw, stapler, geraeteGruppe, geraete: new Map(), laeuft: false };
  return true;
}

// ---------- Rangierfahrten: echte Kurven, rückwärts an die Rampe, vorwärts in die Bucht ----------
// Alles ist eine Funktion der Uhrzeit: Abspielen läuft weich, Springen zeigt sofort den richtigen Stand.
const R_KURVE = 7;                         // Kurvenradius in m
const BEWEGUNG = 6;                        // Minuten für eine Rangierfahrt auf dem Hof
const SPUR_SUED = STRASSE_X + 2.5, SPUR_NORD = STRASSE_X - 2.5;
const RUECKNAHME = { x0: 63, x1: 77, z0: 2, z1: 13 };
const STAPLER_HEIM = [[58, 16], [58, 19.5]];

const kurs = (dx, dz) => Math.atan2(dz, -dx);  // Modelle schauen nach −x
const pkt = (x, z, rueck = false) => ({ x, z, rueck });
function bogen(cx, cz, a0, a1, rueck = false, n = 12) { // Kreisbogen ohne Startpunkt
  const p = [];
  for (let i = 1; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push(pkt(cx + R_KURVE * Math.cos(a), cz + R_KURVE * Math.sin(a), rueck)); }
  return p;
}
// Von der Straße (südwärts) durchs Tor, endet in der Fahrgasse mit Blick nach Osten
const wegEin = () => [pkt(SPUR_SUED, FERNE), pkt(SPUR_SUED, GASSE - R_KURVE), ...bogen(SPUR_SUED + R_KURVE, GASSE - R_KURVE, Math.PI, Math.PI / 2)];
// Aus der Fahrgasse (Blick nach Westen) auf die Straße nach Norden
const wegAus = () => [pkt(SPUR_NORD + R_KURVE, GASSE), ...bogen(SPUR_NORD + R_KURVE, GASSE - R_KURVE, Math.PI / 2, Math.PI), pkt(SPUR_NORD, FERNE)];
const gasseNach = (xAkt, xZiel, blick) => (Math.abs(xZiel - xAkt) < 0.01 ? [] : [pkt(xZiel, GASSE, (xZiel - xAkt) * blick < 0)]);
// Rückwärts an die Rampe; Start bei (dockX + blick·R, GASSE) mit Blick `blick`
const andocken = (dockX, blick, mitteZ) => [...bogen(dockX + blick * R_KURVE, GASSE - R_KURVE, Math.PI / 2, blick > 0 ? Math.PI : 0, true), pkt(dockX, mitteZ, true)];
// Vorwärts von der Rampe in die Fahrgasse, danach Blick in `richtung`
const abfahrt = (dockX, richtung) => [pkt(dockX, GASSE - R_KURVE), ...bogen(dockX + richtung * R_KURVE, GASSE - R_KURVE, richtung > 0 ? Math.PI : 0, Math.PI / 2)];
// Vorwärts in die Bucht; Start bei (platzX − blick·R, GASSE)
const einparken = (platzX, blick, mitteZ) => [...bogen(platzX - blick * R_KURVE, GASSE + R_KURVE, -Math.PI / 2, blick > 0 ? 0 : -Math.PI), pkt(platzX, mitteZ)];
// Rückwärts aus der Bucht, danach Blick in `richtung`; Ende bei (platzX − richtung·R, GASSE)
const ausparken = (platzX, richtung) => [pkt(platzX, GASSE + R_KURVE, true),
  ...bogen(platzX - richtung * R_KURVE, GASSE + R_KURVE, richtung > 0 ? 0 : Math.PI, richtung > 0 ? -Math.PI / 2 : 1.5 * Math.PI, true)];

function aufPfad(roh, f) { // Position und Ausrichtung bei Anteil f; rückwärts zählt doppelt (langsamer)
  // doppelte Punkte entfernen, sonst ergibt ein Abschnitt der Länge null eine zufällige Ausrichtung
  const pfad = roh.filter((q, i) => i === 0 || Math.hypot(q.x - roh[i - 1].x, q.z - roh[i - 1].z) > 0.01);
  if (pfad.length < 2) return { x: pfad[0].x, z: pfad[0].z, rot: kurs(0, 1) };
  const l = [0];
  for (let i = 1; i < pfad.length; i++) l.push(l[i - 1] + Math.hypot(pfad[i].x - pfad[i - 1].x, pfad[i].z - pfad[i - 1].z) * (pfad[i].rueck ? 2 : 1));
  const ziel = Math.max(0, Math.min(1, f)) * l[l.length - 1];
  let i = 1;
  while (i < pfad.length - 1 && l[i] < ziel) i++;
  const a = pfad[i - 1], b = pfad[i], t = l[i] === l[i - 1] ? 1 : (ziel - l[i - 1]) / (l[i] - l[i - 1]);
  const dx = b.x - a.x, dz = b.z - a.z;
  return { x: a.x + dx * t, z: a.z + dz * t, rot: b.rueck ? kurs(-dx, -dz) : kurs(dx, dz) };
}

// Fahrplan eines Lkw für den ganzen Tag: Abschnitte mit Pfad, fester Position oder „weg“
function lkwFahrplan(l, lang, plan, auftraege) {
  const i = LKW.indexOf(l);
  const platzX = PLAETZE[i].x, platzZ = PLATZ_HECK + lang / 2, dockZ = RAMPE_HECK + lang / 2;
  const e = [];
  const fahrt = (von, pfad) => e.push({ von, bis: von + BEWEGUNG, pfad });
  const einfahrtX = SPUR_SUED + R_KURVE;
  for (const t of stand.touren.filter((x) => x.lkw === l.id).sort((a, b) => a.start - b.start)) {
    const ph = phasen(t);
    let wegAb;
    if (ph[0].typ === 'laden' && ph[0].wo === 'hof') {            // Beladen am Hof
      const p = ph[0], r = plan.get(`${t.id}|${p.von}`), dockX = RAMPEN[r.rampe].x;
      const d = dockX >= platzX ? 1 : -1, ausX = platzX - d * R_KURVE;
      if (r.warten > 0) {
        const raus = [pkt(platzX, platzZ), ...ausparken(platzX, d)];
        fahrt(p.von, raus);
        e.push({ von: p.von + BEWEGUNG, bis: r.beginn, pose: { x: ausX, z: GASSE, rot: aufPfad(raus, 1).rot } }); // Ausrichtung vom Wegende
        fahrt(r.beginn, [pkt(ausX, GASSE), ...gasseNach(ausX, dockX + d * R_KURVE, d), ...andocken(dockX, d, dockZ)]);
      } else {
        fahrt(p.von, [pkt(platzX, platzZ), ...ausparken(platzX, d), ...gasseNach(ausX, dockX + d * R_KURVE, d), ...andocken(dockX, d, dockZ)]);
      }
      const losAb = fertigUm(auftraege, t, 'laden', p.bis + r.warten);   // erst los, wenn der Stapler fertig ist
      e.push({ von: r.beginn + BEWEGUNG, bis: losAb, pose: { x: dockX, z: dockZ, rot: kurs(0, 1) } });
      fahrt(losAb, [pkt(dockX, dockZ), ...abfahrt(dockX, -1), ...gasseNach(dockX - R_KURVE, SPUR_NORD + R_KURVE, -1), ...wegAus()]);
      wegAb = losAb + BEWEGUNG;
    } else {                                                        // Abholung: leer los
      fahrt(t.start, [pkt(platzX, platzZ), ...ausparken(platzX, -1), ...gasseNach(platzX + R_KURVE, SPUR_NORD + R_KURVE, -1), ...wegAus()]);
      wegAb = t.start + BEWEGUNG;
    }
    const letzte = ph[ph.length - 1];
    if (letzte.typ === 'laden' && letzte.wo === 'hof') {            // Abladen am Hof
      const r = plan.get(`${t.id}|${letzte.von}`), dockX = RAMPEN[r.rampe].x;
      e.push({ von: wegAb, bis: letzte.von - BEWEGUNG, weg: true });
      if (r.warten > 0) {
        const wx = einfahrtX + 4;
        const rein = [...wegEin(), ...gasseNach(einfahrtX, wx, 1)];
        fahrt(letzte.von - BEWEGUNG, rein);
        e.push({ von: letzte.von, bis: r.beginn, pose: { x: wx, z: GASSE, rot: aufPfad(rein, 1).rot } });
        fahrt(r.beginn, [pkt(wx, GASSE), ...gasseNach(wx, dockX + R_KURVE, 1), ...andocken(dockX, 1, dockZ)]);
      } else {
        fahrt(letzte.von - BEWEGUNG, [...wegEin(), ...gasseNach(einfahrtX, dockX + R_KURVE, 1), ...andocken(dockX, 1, dockZ)]);
      }
      const dockAb = r.warten > 0 ? r.beginn + BEWEGUNG : letzte.von;
      const fertig = fertigUm(auftraege, t, 'abladen', letzte.bis + r.warten);
      e.push({ von: dockAb, bis: fertig, pose: { x: dockX, z: dockZ, rot: kurs(0, 1) } });
      const d2 = platzX >= dockX ? 1 : -1;
      fahrt(fertig, [pkt(dockX, dockZ), ...abfahrt(dockX, d2), ...gasseNach(dockX + d2 * R_KURVE, platzX - d2 * R_KURVE, d2), ...einparken(platzX, d2, platzZ)]);
    } else {                                                        // leer zurück in die Bucht
      const ankunft = Math.max(ende(t) - BEWEGUNG, wegAb);   // nie zurück, bevor die verspätete Beladung fertig ist
      e.push({ von: wegAb, bis: ankunft, weg: true });
      fahrt(ankunft, [...wegEin(), ...gasseNach(einfahrtX, platzX - R_KURVE, 1), ...einparken(platzX, 1, platzZ)]);
    }
  }
  return { e, geparkt: { x: platzX, z: platzZ, rot: kurs(0, 1) }, dockZ };
}
function lkwPose(fp, hz) {
  let treffer = null;
  for (const a of fp.e) if (a.von <= hz && hz < a.bis) treffer = a; // spätere Tour gewinnt
  if (!treffer) return { ...fp.geparkt, sichtbar: true };
  if (treffer.weg) return { sichtbar: false };
  if (treffer.pose) return { ...treffer.pose, sichtbar: true };
  return { ...aufPfad(treffer.pfad, (hz - treffer.von) / (treffer.bis - treffer.von)), sichtbar: true };
}

// ---------- Stapler-Aufträge: Gerät von der Bereitstellung auf den Lkw bzw. vom Lkw in die Rücknahme ----------
// Stapler, Beginn und Ende stammen aus dem Rampenplan. Das Ende (a.bis) ist der Moment, ab dem der Lkw fertig ist.
const STAPLER_MIN = 8;   // Minuten, die ein Stapler mindestens für ein Gerät braucht
function staplerAuftraege(plan) {
  const auftraege = [];
  for (const t of stand.touren) {
    const ph = phasen(t), l = finde(LKW, t.lkw);
    if (ph[0].typ === 'laden' && ph[0].wo === 'hof') {
      const p = ph[0], r = plan.get(`${t.id}|${p.von}`);
      auftraege.push({ art: 'laden', t, l, g: finde(GERAETE, p.ladung), rampe: r.rampe, dockX: RAMPEN[r.rampe].x, phase: p,
        stapler: r.stapler, von: r.von, bis: r.bis, sichtbarAb: p.von - 120 });
    }
    const letzte = ph[ph.length - 1];
    if (ph.length > 1 && letzte.typ === 'laden' && letzte.wo === 'hof') {
      const r = plan.get(`${t.id}|${letzte.von}`);
      auftraege.push({ art: 'abladen', t, l, g: finde(GERAETE, letzte.ladung), rampe: r.rampe, dockX: RAMPEN[r.rampe].x, phase: letzte,
        stapler: r.stapler, von: r.von, bis: r.bis, sichtbarAb: letzte.von - BEWEGUNG });
    }
  }
  auftraege.sort((a, b) => a.von - b.von);
  let nBereit = 0, nRueck = 0;
  for (const a of auftraege) {
    a.sichtbarBis = a.art === 'laden' ? a.bis + BEWEGUNG : a.bis + 60;
    a.platz = a.art === 'laden'
      ? { x: BEREIT.x0 + 4 + (nBereit++ % 3) * 8, z: (BEREIT.z0 + BEREIT.z1) / 2 }
      : { x: RUECKNAHME.x0 + 3.5 + (nRueck++ % 2) * 7, z: (RUECKNAHME.z0 + RUECKNAHME.z1) / 2 };
  }
  return auftraege;
}
const fertigUm = (auftraege, t, art, sonst) => auftraege.find((a) => a.t.id === t.id && a.art === art)?.bis ?? sonst;
// Ablauf eines Auftrags in Anteilen: hinfahren 0–0,3, aufnehmen –0,4, transportieren –0,7, absetzen –0,8, zurück –1
function staplerPose(a, f) {
  const heim = STAPLER_HEIM[a.stapler];
  const vorPlatz = [a.platz.x, a.platz.z + a.g.l / 2 + 1.9];                     // vor dem Gerät, Gabeln nach Norden
  const amLkw = [a.dockX + a.l.breite / 2 + a.g.b / 2 + 1.9, a.dockZ - (a.g.l / 2 + 0.2 - (a.l.laenge - 2.6) / 2)]; // neben der Ladefläche
  const p = (x, z, r = false) => pkt(x, z, r);
  const [quelle, ziel] = a.art === 'laden' ? [vorPlatz, amLkw] : [amLkw, vorPlatz];
  const zuQuelle = a.art === 'laden'
    ? [p(...heim), p(vorPlatz[0], vorPlatz[1] + 4), p(...vorPlatz)]
    : [p(...heim), p(amLkw[0] + 4, amLkw[1]), p(...amLkw)];
  const zuZiel = a.art === 'laden'
    ? [p(...vorPlatz), p(vorPlatz[0], vorPlatz[1] + 4, true), p(amLkw[0] + 4, amLkw[1]), p(...amLkw)]
    : [p(...amLkw), p(amLkw[0] + 4, amLkw[1], true), p(vorPlatz[0], vorPlatz[1] + 4), p(...vorPlatz)];
  const zurueck = a.art === 'laden'
    ? [p(...amLkw), p(amLkw[0] + 4, amLkw[1], true), p(...heim)]
    : [p(...vorPlatz), p(vorPlatz[0], vorPlatz[1] + 4, true), p(...heim)];
  if (f < 0.3) return { ...aufPfad(zuQuelle, f / 0.3), traegt: false };
  if (f < 0.4) return { ...aufPfad(zuQuelle, 1), traegt: true, heben: (f - 0.3) / 0.1 };
  if (f < 0.7) return { ...aufPfad(zuZiel, (f - 0.4) / 0.3), traegt: true, heben: 1 };
  if (f < 0.8) return { ...aufPfad(zuZiel, 1), traegt: true, heben: 1 - (f - 0.7) / 0.1 };
  return { ...aufPfad(zurueck, (f - 0.8) / 0.2), traegt: false, quelle, ziel };
}

// Fahrpläne und Aufträge nur neu berechnen, wenn sich die Touren ändern
let hofCache = { schluessel: '', fahrplaene: null, auftraege: null };
function hofPlaene() {
  const schluessel = JSON.stringify(stand.touren);
  if (schluessel !== hofCache.schluessel) {
    const plan = rampenPlan();
    const auftraege = staplerAuftraege(plan);
    const fahrplaene = {};
    for (const l of LKW) fahrplaene[l.id] = lkwFahrplan(l, hofSzene.lkw[l.id].lang, plan, auftraege);
    auftraege.forEach((a) => { a.dockZ = fahrplaene[a.l.id].dockZ; });
    hofCache = { schluessel, fahrplaene, auftraege };
  }
  return hofCache;
}
// Angezeigte Uhrzeit: beim Abspielen zwischen den Schritten weich weiterlaufen lassen
function hofZeit() {
  if (!abspielen) return zeit;
  const tempo = Number($('#zeit-tempo').value) || 1;
  return Math.min(TAG_ENDE, abspielStand + Math.min(0.1, (performance.now() - abspielTick) / 1000) * tempo);
}

function hofAktualisieren() {
  if (typeof THREE === 'undefined') {
    $('#hof3d').replaceChildren(el('div', { class: 'karten-fehler' }, 'Die Hofszene braucht three.js (Internetverbindung).'));
    return;
  }
  if (!hofSzene && !hofAufbauen()) return;
  const zustaende = lkwZustaende();
  for (const l of LKW) hofSzene.lkw[l.id].nummer.material.color.set(zustaende[l.id].warteplatz != null ? '#ffb74d' : '#ffffff');
  hofPanels(zustaende);
  if (!hofSzene.laeuft) { hofSzene.laeuft = true; requestAnimationFrame(hofSchleife); }
}

function geraetModell(a) { // ein Modell je Auftrag, wiederverwendet
  let m = hofSzene.geraete.get(a.t.id + a.art);
  if (!m) { m = geraetKoerper(a.g); hofSzene.geraete.set(a.t.id + a.art, m); }
  return m;
}
function hofSchleife() {
  const hs = hofSzene;
  if (ansicht !== 'hof') { hs.laeuft = false; return; }
  const hz = hofZeit();
  const { fahrplaene } = hofPlaene();
  const auftraege = datum === HEUTE ? hofPlaene().auftraege : [];   // an anderen Tagen stehen alle Lkw, keine Stapler im Einsatz

  for (const l of LKW) {
    const sp = hs.lkw[l.id], pose = datum === HEUTE ? lkwPose(fahrplaene[l.id], hz) : { ...fahrplaene[l.id].geparkt, sichtbar: true };
    sp.gruppe.visible = pose.sichtbar;
    if (pose.sichtbar) { sp.gruppe.position.set(pose.x, 0, pose.z); sp.gruppe.rotation.y = pose.rot; }
  }

  // Stapler und Geräte
  const genutzt = new Set();
  const staplerFrei = STAPLER_HEIM.map(() => true);
  for (const a of auftraege) {
    if (hz < a.sichtbarAb || hz >= a.sichtbarBis) continue;
    const m = geraetModell(a);
    genutzt.add(m);
    const f = (hz - a.von) / (a.bis - a.von);
    const aufLkw = a.art === 'laden' ? f >= 0.75 : f < 0.35;
    if (f >= 0 && f < 1) { // Stapler bei der Arbeit
      const s = hs.stapler[a.stapler], sp = staplerPose(a, f);
      staplerFrei[a.stapler] = false;
      s.position.set(sp.x, 0, sp.z); s.rotation.y = sp.rot;
      if (sp.traegt && !aufLkw) { // Gerät auf den Gabeln, quer zur Fahrtrichtung immer längs zur Lkw-Achse
        const vx = -Math.cos(sp.rot), vz = Math.sin(sp.rot);
        const vor = 1.35 + Math.abs(vx) * a.g.b / 2 + Math.abs(vz) * a.g.l / 2;
        if (m.parent !== hs.geraeteGruppe) hs.geraeteGruppe.add(m);
        m.position.set(sp.x + vx * vor, 0.15 + 0.45 * sp.heben, sp.z + vz * vor);
        m.rotation.set(0, Math.PI / 2, 0);
        continue;
      }
    }
    if (aufLkw) {
      const lad = hs.lkw[a.l.id].ladung;
      if (m.parent !== lad) lad.add(m);
      m.position.set(a.g.l / 2 + 0.2, a.l.ladehoehe, 0);
      m.rotation.set(0, 0, 0);
    } else {
      if (m.parent !== hs.geraeteGruppe) hs.geraeteGruppe.add(m);
      m.position.set(a.platz.x, 0.03, a.platz.z);
      m.rotation.set(0, Math.PI / 2, 0);
    }
  }
  for (const [schl, m] of hs.geraete) if (!genutzt.has(m)) { m.parent?.remove(m); }
  hs.stapler.forEach((s, k) => { if (staplerFrei[k]) { s.position.set(...[STAPLER_HEIM[k][0], 0, STAPLER_HEIM[k][1]]); s.rotation.y = kurs(-1, 0); } });

  // Kamera
  const huelle = $('#hof3d');
  const w = huelle.clientWidth || 800, h = huelle.clientHeight || 500, a = w / h, sicht = 78 / hs.blick.zoom;
  if (hs.groesse !== w + 'x' + h) { // nur bei Größenänderung, sonst wird der Zeichenpuffer jedes Bild neu angelegt
    hs.groesse = w + 'x' + h;
    hs.renderer.setSize(w, h, false);
    hs.renderer.domElement.style.width = '100%';
    hs.renderer.domElement.style.height = '100%';
  }
  Object.assign(hs.kamera, { left: -sicht * a / 2, right: sicht * a / 2, top: sicht / 2, bottom: -sicht / 2 });
  hs.kamera.updateProjectionMatrix();
  const { winkel, hoehe, ziel } = hs.blick;
  hs.kamera.position.set(ziel.x + Math.cos(winkel) * Math.cos(hoehe) * 200, Math.sin(hoehe) * 200, ziel.z + Math.sin(winkel) * Math.cos(hoehe) * 200);
  hs.kamera.lookAt(ziel);
  const meterProPixel = sicht / h; // Schilder auf feste Pixelhöhe bringen
  hs.szene.traverse((o) => {
    if (o.isSprite && o.userData.px) {
      const hoch = o.userData.px * meterProPixel;
      o.scale.set(hoch * (o.userData.verhaeltnis || 4), hoch, 1);
      if (o.userData.versatzPx != null) o.position.y = 5 + o.userData.versatzPx * meterProPixel;
    }
  });
  hs.renderer.render(hs.szene, hs.kamera);
  requestAnimationFrame(hofSchleife);
}

// ---------- Panels über der Szene ----------
function hofPanels(zustaende) {
  const weg = Object.values(zustaende).filter((z) => z.art === 'weg').length;
  const belegt = Object.values(zustaende).filter((z) => z.rampe != null).length;
  const wartend = Object.entries(zustaende).filter(([, z]) => z.warteplatz != null);
  const naechste = stand.touren.filter((t) => t.start > zeit).sort((a, b) => a.start - b.start);
  const kpi = (wert, name, warn) => el('div', { class: 'kpi' + (warn ? ' warn' : '') }, el('span', { class: 'wert' }, wert), el('span', { class: 'name' }, name));
  $('#hof-kpis').replaceChildren(
    kpi(`${LKW.length - weg}/${LKW.length}`, 'Lkw am Hof'),
    kpi(`${belegt}/${RAMPEN.length}`, 'Rampen belegt'),
    kpi(wartend.length, 'warten', wartend.length > 0),
    kpi(naechste[0] ? hhmm(naechste[0].start) : '–', 'nächste Abfahrt'));

  $('#hof-info').replaceChildren(
    el('h2', {}, `Hof um ${hhmm(zeit)} Uhr`),
    wartend.length
      ? el('div', { class: 'befund vermeidbar' }, el('strong', {}, 'Engpass: '),
        wartend.map(([id, z]) => `${finde(LKW, id).kz} wartet ${z.warten} Min. auf eine Rampe, die Abfahrt verspätet sich.`).join(' '), ' Ladezeiten entzerren!')
      : el('div', { class: 'befund ok' }, 'Kein Rampen-Engpass.'),
    el('h2', {}, 'Nächste Abfahrten'),
    naechste.length
      ? el('ul', { class: 'liste' }, ...naechste.slice(0, 5).map((t) => el('li', {}, el('strong', {}, hhmm(t.start) + ' '), `${finde(LKW, t.lkw).kz} nach ${zielText(t)} (${finde(GERAETE, t.geraet).kurz})`)))
      : el('p', { class: 'hinweis' }, 'Heute keine weiteren Abfahrten.'),
    el('p', { class: 'hinweis' }, 'Hof-Layout ist ein Beispiel und muss mit Reiter abgeglichen werden.'));

  const zeilen = RAMPEN.map((r, i) => {
    const e = Object.entries(zustaende).find(([, z]) => z.rampe === i);
    if (!e) return el('tr', {}, el('td', {}, `Rampe ${i + 1}`), el('td', {}, '–'), el('td', {}, marke('frei', 'grau')), el('td', {}, ''), el('td', {}, ''));
    const [id, z] = e, g = finde(GERAETE, z.phase.ladung);
    return el('tr', {}, el('td', {}, `Rampe ${i + 1}`), el('td', {}, finde(LKW, id).kz),
      el('td', {}, marke(z.phase.text, z.phase.text === 'Beladen' ? 'frei' : 'abholung')), el('td', {}, g.kurz), el('td', {}, `bis ${hhmm(z.phase.bis)}`));
  });
  for (const [id, z] of wartend) {
    zeilen.push(el('tr', {}, el('td', {}, 'Fahrgasse'), el('td', {}, finde(LKW, id).kz), el('td', {}, marke('wartet', 'warn')),
      el('td', {}, finde(GERAETE, z.phase.ladung).kurz), el('td', {}, `+${z.warten} Min.`)));
  }
  $('#hof-docks').replaceChildren(el('table', {},
    el('tr', {}, el('th', {}, 'Rampe'), el('th', {}, 'Lkw'), el('th', {}, 'Status'), el('th', {}, 'Ladung'), el('th', {}, 'Zeit')), ...zeilen));
}
