'use strict';
// Gemeinsame 3D-Modelle (three.js) für Hofszene und Ladeplan: stilisierte Lkw, Stapler und Bühnen.
// Achsen: x = Länge, y = Höhe, z = Breite, Meter. Lkw: Ladefläche ab x = 0 nach +x, Fahrerhaus bei x < 0 (vorn = −x).

const MAT_CACHE = new Map();
function mat(farbe, extra = {}) {
  const key = farbe + JSON.stringify(extra);
  if (!MAT_CACHE.has(key)) MAT_CACHE.set(key, new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.62, metalness: 0.05, ...extra }));
  return MAT_CACHE.get(key);
}
function schatten(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function quader(bx, by, bz, material, x, y, z) { // x/z Mitte, y Unterkante
  const m = new THREE.Mesh(new THREE.BoxGeometry(bx, by, bz), material);
  m.position.set(x, y + by / 2, z);
  return schatten(m);
}
// Quader mit runden Kanten (Profil in x/y gerundet, in z extrudiert); x/z Mitte, y Unterkante
function abgerundet(bx, by, bz, r, material, x, y, z) {
  const s = new THREE.Shape(), w = bx / 2, h = by / 2;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  const kante = Math.min(0.12, r * 0.6);
  const geo = new THREE.ExtrudeGeometry(s, { depth: bz - 2 * kante, bevelEnabled: true, bevelThickness: kante, bevelSize: kante * 0.6, bevelSegments: 3, curveSegments: 6 });
  geo.translate(0, 0, -(bz - 2 * kante) / 2);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y + h, z);
  return schatten(m);
}
function rad(r, breite, x, y, z, nabe = '#d5dbe0') {
  const g = new THREE.Group();
  const reifen = new THREE.Mesh(new THREE.CylinderGeometry(r, r, breite, 22), mat('#1f2326', { roughness: 0.9 }));
  const kappe = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.48, r * 0.48, breite + 0.02, 16), mat(nabe, { metalness: 0.3 }));
  g.add(schatten(reifen), kappe);
  g.rotation.x = Math.PI / 2;
  g.position.set(x, y, z);
  return g;
}
function schild(text, farbe = '#212529', hintergrund = 'rgba(255,255,255,.94)', breite = 3.2, verhaeltnis = 4) {
  const c = document.createElement('canvas');
  c.width = 128 * verhaeltnis; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = hintergrund;
  g.beginPath(); g.roundRect(4, 4, c.width - 8, 120, 40); g.fill();
  g.fillStyle = farbe;
  g.font = `700 ${verhaeltnis < 3 ? 72 : 58}px Ubuntu, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, 68, c.width - 24);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sp.scale.set(breite, breite / verhaeltnis, 1);
  sp.userData.verhaeltnis = verhaeltnis;
  sp.renderOrder = 10;
  return sp;
}

// ---------- Geräte: Unterkante y = 0, mittig in x und z, Fahrtrichtung −x ----------
function geraetKoerper(g, warn) {
  const grp = new THREE.Group();
  const haupt = mat(g.farbe, warn ? { emissive: 0x991111 } : {});
  const dunkel = mat('#2f3439'), sitz = mat('#3a3f44'), glas = mat('#a9c4d8', { transparent: true, opacity: 0.55 });
  const { l, b, h } = g;
  if (g.form === 'stapler') {
    const r = Math.min(0.42, h * 0.16);
    grp.add(abgerundet(l * 0.62, h * 0.36, b * 0.92, 0.18, haupt, l * 0.12, r * 0.7, 0));          // Rumpf
    grp.add(abgerundet(l * 0.2, h * 0.3, b * 0.92, 0.2, haupt, l * 0.36, r * 0.7 + h * 0.2, 0));     // Gegengewicht
    grp.add(quader(l * 0.22, 0.12, b * 0.4, sitz, l * 0.12, r * 0.7 + h * 0.36, 0));                 // Sitz
    grp.add(quader(0.06, h * 0.22, b * 0.4, sitz, l * 0.22, r * 0.7 + h * 0.36, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {                                            // Fahrerschutzdach
      grp.add(quader(0.07, h * 0.58, 0.07, dunkel, l * 0.1 + sx * l * 0.17, r * 0.7 + h * 0.36, sz * b * 0.4));
    }
    grp.add(quader(l * 0.44, 0.07, b * 0.88, dunkel, l * 0.1, h * 0.94, 0));
    grp.add(quader(0.14, h, 0.12, dunkel, -l / 2 + 0.55, 0.05, b * 0.3));                            // Hubmast
    grp.add(quader(0.14, h, 0.12, dunkel, -l / 2 + 0.55, 0.05, -b * 0.3));
    grp.add(quader(0.1, 0.5, b * 0.7, dunkel, -l / 2 + 0.47, 0.15, 0));                              // Gabelträger
    for (const sz of [-1, 1]) grp.add(quader(l * 0.32, 0.05, 0.11, dunkel, -l / 2 + l * 0.16, 0.12, sz * b * 0.22)); // Gabeln
    for (const sx of [-l * 0.2, l * 0.3]) for (const sz of [-1, 1]) grp.add(rad(r, 0.26, sx, r, sz * (b / 2 - 0.14)));
  } else if (g.form === 'schere') {
    grp.add(abgerundet(l, h * 0.22, b * 0.95, 0.1, haupt, 0, 0.18, 0));                               // Fahrgestell
    for (let i = 0; i < 3; i++) {                                                                    // Scherenpaket
      const y = 0.18 + h * 0.22 + i * h * 0.12;
      for (const sz of [-1, 1]) {
        const arm = quader(l * 0.92, 0.07, 0.07, dunkel, 0, 0, sz * b * 0.38);
        arm.position.y = y + h * 0.06;
        arm.rotation.z = (i % 2 ? 1 : -1) * 0.13;
        grp.add(arm);
      }
    }
    grp.add(quader(l * 1.02, 0.1, b, haupt, 0, h * 0.6, 0));                                          // Plattform
    for (const sz of [-1, 1]) grp.add(quader(l, 0.05, 0.05, haupt, 0, h * 0.98, sz * (b / 2 - 0.03)));
    for (const sx of [-1, 1]) grp.add(quader(0.05, 0.05, b, haupt, sx * (l / 2 - 0.03), h * 0.98, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) grp.add(quader(0.05, h * 0.38, 0.05, haupt, sx * (l / 2 - 0.03), h * 0.6, sz * (b / 2 - 0.03)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) grp.add(rad(0.18, 0.14, sx * l * 0.36, 0.18, sz * (b / 2 - 0.08)));
  } else if (g.form === 'gelenk') {
    const r = Math.min(0.38, h * 0.18);
    grp.add(abgerundet(l * 0.52, h * 0.3, b * 0.95, 0.15, haupt, l * 0.22, r * 0.6, 0));              // Unterwagen
    grp.add(abgerundet(l * 0.26, h * 0.32, b * 0.62, 0.15, haupt, l * 0.24, r * 0.6 + h * 0.3, 0));   // Drehturm
    const arm = abgerundet(l * 0.88, 0.32, 0.36, 0.12, mat('#eceff1'), 0, 0, 0);                       // Ausleger
    arm.position.set(-l * 0.02, h * 0.76, 0); arm.rotation.z = -0.04;
    grp.add(arm);
    grp.add(quader(0.85, 0.12, b * 0.82, haupt, -l / 2 + 0.43, h * 0.32, 0));                        // Korb
    for (const sz of [-1, 1]) grp.add(quader(0.85, 0.05, 0.05, haupt, -l / 2 + 0.43, h * 0.76, sz * b * 0.4));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) grp.add(quader(0.05, h * 0.32, 0.05, haupt, -l / 2 + 0.43 + sx * 0.4, h * 0.44, sz * b * 0.4));
    for (const sx of [l * 0.02, l * 0.42]) for (const sz of [-1, 1]) grp.add(rad(r, 0.3, sx, r, sz * (b / 2 - 0.16)));
  } else { // Teleskoplader
    const r = Math.min(0.62, h * 0.24);
    grp.add(abgerundet(l * 0.66, h * 0.3, b * 0.6, 0.15, haupt, l * 0.02, r * 0.75, 0));              // Rahmen
    grp.add(abgerundet(l * 0.22, h * 0.32, b * 0.42, 0.2, haupt, l * 0.3, r * 0.75 + h * 0.2, -b * 0.08)); // Motorhaube
    const kab = abgerundet(l * 0.24, h * 0.6, b * 0.34, 0.15, haupt, -l * 0.02, r * 0.75 + h * 0.18, b * 0.3);
    grp.add(kab);
    grp.add(quader(l * 0.2, h * 0.42, b * 0.36, glas, -l * 0.02, r * 0.75 + h * 0.3, b * 0.3));
    const arm = abgerundet(l * 0.98, 0.42, 0.46, 0.14, haupt, 0, 0, -b * 0.1);                         // Teleskoparm
    arm.position.set(-l * 0.02, h * 0.62, -b * 0.1); arm.rotation.z = -0.07;
    grp.add(arm);
    grp.add(quader(0.12, 0.6, b * 0.75, dunkel, -l / 2 + 0.08, 0.1, 0));                             // Gabelträger
    for (const sz of [-1, 1]) grp.add(quader(0.9, 0.06, 0.12, dunkel, -l / 2 + 0.45, 0.08, sz * b * 0.22));
    for (const sx of [-l * 0.2, l * 0.28]) for (const sz of [-1, 1]) grp.add(rad(r, 0.42, sx, r, sz * (b / 2 - 0.21)));
  }
  return grp;
}

// „HELMUT REITER“ als Schriftzug-Material, einmal erzeugt und von allen Lkw geteilt
let reiterSchriftMat = null;
function reiterSchrift() {
  if (reiterSchriftMat) return reiterSchriftMat;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 205;
  const g = c.getContext('2d');
  g.fillStyle = '#27a849';
  g.font = '700 118px Ubuntu, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('HELMUT REITER', 512, 108, 990);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  reiterSchriftMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  MAT_CACHE.set('__reiterSchrift', reiterSchriftMat); // wie Cache-Material behandeln, nie freigeben
  return reiterSchriftMat;
}

// ---------- Lkw im Reiter-Design ----------
function lkwModell(l, kabinenFarbe = '#ffffff') {
  const grp = new THREE.Group();
  const weiss = mat(kabinenFarbe), gruen = mat('#27a849'), scheibe = mat('#28343f', { roughness: 0.2, metalness: 0.3 });
  const dunkel = mat('#3a4248'), deckMat = mat('#a3adb5'), chrom = mat('#d5dbe0', { metalness: 0.4 });
  const L = l.laenge, B = l.breite, sattel = L > 11;
  const kabL = sattel ? 2.5 : 2.3, kabH = l.nutzlast < 2 ? 2.2 : 2.75, kabB = Math.min(2.45, B);
  const r = l.nutzlast < 2 ? 0.36 : 0.5;
  const kx = -kabL / 2 - 0.25, ky = r + 0.15;
  grp.add(abgerundet(kabL, kabH, kabB, 0.42, weiss, kx, ky, 0));                                     // Fahrerhaus
  grp.add(quader(kabL * 0.98, 0.32, kabB + 0.02, gruen, kx, ky + kabH * 0.28, 0));                    // Reiter-Streifen
  // Windschutzscheibe: leicht nach hinten geneigt, mit dunklem Rahmen und hellem Spiegelstreifen
  const front = kx - kabL / 2, scheibeH = kabH * 0.4, scheibeY = ky + kabH * 0.52;
  const rahmen = quader(0.1, scheibeH + 0.12, kabB * 0.9, dunkel, front - 0.02, scheibeY - 0.06, 0);
  const glas = quader(0.06, scheibeH, kabB * 0.84, mat('#33495c', { roughness: 0.12, metalness: 0.55 }), front - 0.06, scheibeY, 0);
  const glanz = quader(0.07, scheibeH * 0.18, kabB * 0.5, mat('#9fbad0', { roughness: 0.1, metalness: 0.4 }), front - 0.07, scheibeY + scheibeH * 0.6, -kabB * 0.12);
  for (const teil of [rahmen, glas, glanz]) { teil.rotation.z = -0.1; grp.add(teil); }
  grp.add(quader(0.04, 0.05, kabB * 0.5, dunkel, front - 0.1, scheibeY + 0.02, 0));                  // Scheibenwischer
  grp.add(quader(kabL * 0.42, kabH * 0.3, kabB + 0.02, scheibe, kx - kabL * 0.2, ky + kabH * 0.56, 0)); // Seitenfenster
  for (const seite of [1, -1]) {                                                                   // Schriftzug an den Türen
    const t = new THREE.Mesh(new THREE.PlaneGeometry(kabL * 0.92, kabL * 0.92 / 5), reiterSchrift());
    t.position.set(kx + 0.02, ky + kabH * 0.47, seite * (kabB / 2 + 0.03));
    if (seite < 0) t.rotation.y = Math.PI;
    grp.add(t);
  }
  grp.add(quader(0.18, 0.38, kabB * 0.96, chrom, kx - kabL / 2 - 0.06, ky - 0.05, 0));                  // Stoßfänger
  for (const sz of [-1, 1]) {
    grp.add(quader(0.06, 0.14, 0.32, mat('#fff8d6', { emissive: 0x6b5e1e }), kx - kabL / 2 - 0.16, ky + 0.08, sz * kabB * 0.33)); // Scheinwerfer
    grp.add(quader(0.22, 0.42, 0.06, dunkel, kx - kabL / 2 + 0.1, ky + kabH * 0.55, sz * (kabB / 2 + 0.12))); // Spiegel
  }
  if (sattel) grp.add(quader(kabL * 0.9, 0.5, kabB * 0.9, weiss, kx, ky + kabH, 0));                  // Dachspoiler
  grp.add(quader(L + kabL + 0.3, 0.32, 0.95, dunkel, (L - kabL) / 2 - 0.1, Math.max(r * 0.8, l.ladehoehe - 0.5), 0)); // Rahmen
  grp.add(quader(L, 0.18, B, deckMat, L / 2, l.ladehoehe - 0.18, 0));                                // Ladefläche
  for (const sz of [-1, 1]) grp.add(quader(L, 0.16, 0.07, gruen, L / 2, l.ladehoehe - 0.24, sz * (B / 2 - 0.035))); // Randleiste
  grp.add(quader(0.12, 0.9, B, deckMat, -0.06, l.ladehoehe - 0.18, 0));                              // Stirnwand
  const hinten = sattel ? [L - 3.2, L - 2.0, L - 0.8] : L > 7 ? [L - 2.0, L - 0.8] : [L - 1.1];
  for (const ax of [kx, ...(sattel ? [0.9] : []), ...hinten]) for (const sz of [-1, 1]) {
    grp.add(rad(r, 0.42, ax, r, sz * (Math.max(B, kabB) / 2 - 0.22)));
  }
  grp.userData.laenge = L + kabL + 0.25;
  return grp;
}

// Grafikspeicher einer Gruppe freigeben (Geometrien, Texturen, eigene Materialien; Cache-Materialien bleiben)
function freigeben(grp) {
  const geteilt = new Set(MAT_CACHE.values());
  grp.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !geteilt.has(o.material)) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
}
