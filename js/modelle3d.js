'use strict';
// Gemeinsame 3D-Modelle (three.js) für Hofszene und Ladeplan: Lkw, Stapler, Teleskoplader und Bühnen.
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
// Rad mit Reifen, Flanke, Felge, Nabe und Radbolzen; Achse quer (z), Mitte bei (x, y, z)
function rad(r, breite, x, y, z, felge = '#c9ced3') {
  const g = new THREE.Group();
  const reifen = new THREE.Mesh(new THREE.CylinderGeometry(r, r, breite, 30), mat('#1b1e21', { roughness: 0.92 }));
  const flanke = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, breite + 0.01, 30), mat('#24282c', { roughness: 0.85 }));
  const felgeM = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, breite + 0.02, 24), mat(felge, { roughness: 0.35, metalness: 0.6 }));
  const nabe = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.24, breite + 0.06, 16), mat('#6b737a', { roughness: 0.4, metalness: 0.6 }));
  g.add(schatten(reifen), flanke, felgeM, nabe);
  for (let i = 0; i < 6; i++) {                   // Radbolzen
    const a = i / 6 * Math.PI * 2, bolzen = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, breite + 0.08, 6), mat('#3a4046'));
    bolzen.position.set(Math.cos(a) * r * 0.36, 0, Math.sin(a) * r * 0.36);
    g.add(bolzen);
  }
  g.rotation.x = Math.PI / 2;
  g.position.set(x, y, z);
  return g;
}
// Kotflügel als halber Zylindermantel über einem Rad (Material mit side: DoubleSide übergeben)
function kotfluegel(r, breite, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, breite, 20, 1, true, Math.PI / 2, Math.PI), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return schatten(m);
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
  const lack = mat(g.farbe, { roughness: 0.42, metalness: 0.15, ...(warn ? { emissive: 0x991111 } : {}) });
  const dunkel = mat('#2a2f34', { roughness: 0.55, metalness: 0.25 }), stahl = mat('#7c858d', { roughness: 0.35, metalness: 0.7 });
  const polster = mat('#1f2226', { roughness: 0.8 }), glas = mat('#9fb8cc', { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.45 });
  const kotflg = mat(g.farbe, { roughness: 0.42, metalness: 0.15, side: THREE.DoubleSide, ...(warn ? { emissive: 0x991111 } : {}) });
  const { l, b, h } = g;
  const add = (...m) => m.forEach((x) => grp.add(x));

  if (g.form === 'stapler') {                    // Gabelstapler: Hubmast vorn, Gegengewicht hinten
    const rv = Math.min(0.42, h * 0.17), rh = rv * 0.82, mastX = -l / 2 + 0.62;
    const kL = l * 0.62, kX = l * 0.13, kY = rv * 0.55;
    add(abgerundet(kL, h * 0.28, b * 0.92, 0.18, lack, kX, kY, 0));                              // Fahrgestell
    add(abgerundet(l * 0.22, h * 0.36, b * 0.96, 0.24, dunkel, kX + kL / 2 - l * 0.05, kY, 0));     // Gegengewicht
    add(quader(kL * 0.55, 0.06, b * 0.86, dunkel, kX - kL * 0.08, kY + h * 0.28, 0));                // Bodenplatte
    add(abgerundet(0.42, 0.1, 0.46, 0.04, polster, kX + l * 0.08, kY + h * 0.36, 0));               // Sitzfläche
    add(abgerundet(0.1, 0.42, 0.44, 0.04, polster, kX + l * 0.27, kY + h * 0.4, 0));                // Lehne
    const saeule = quader(0.06, 0.45, 0.06, dunkel, kX - kL * 0.28, kY + h * 0.28, 0); saeule.rotation.z = 0.35; add(saeule);
    const lenkrad = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 20), dunkel);
    lenkrad.rotation.set(0, Math.PI / 2, 0.35 - Math.PI / 2); lenkrad.position.set(kX - kL * 0.2, kY + h * 0.28 + 0.48, 0); add(lenkrad);
    for (const sz of [-1, 1]) {                                                                   // Fahrerschutzdach
      const vorn = quader(0.07, h * 0.62, 0.07, dunkel, kX - kL * 0.22, kY + h * 0.27, sz * b * 0.4); vorn.rotation.z = -0.12; add(vorn);
      add(quader(0.07, h * 0.62, 0.07, dunkel, kX + kL * 0.34, kY + h * 0.27, sz * b * 0.4));
    }
    add(quader(kL * 0.66, 0.05, b * 0.86, dunkel, kX + kL * 0.06, h * 0.96, 0));
    for (let i = 0; i < 4; i++) add(quader(0.04, 0.06, b * 0.84, stahl, kX - kL * 0.2 + i * kL * 0.17, h * 0.95, 0));
    for (const sz of [-1, 1]) {                                                                   // Hubmast: äußere und innere Profile
      add(quader(0.12, h * 1.02, 0.1, dunkel, mastX, 0.12, sz * b * 0.3));
      add(quader(0.09, h * 0.98, 0.07, stahl, mastX - 0.07, 0.14, sz * b * 0.22));
      add(quader(0.02, h * 0.9, 0.02, mat('#4a4f55', { metalness: 0.6 }), mastX - 0.12, 0.2, sz * b * 0.12));   // Kette
    }
    for (const y of [0.35, h * 0.55, h * 0.98]) add(quader(0.1, 0.07, b * 0.66, dunkel, mastX, y, 0));
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h * 0.8, 10), stahl)); grp.children[grp.children.length - 1].position.set(mastX + 0.05, 0.15 + h * 0.4, 0);
    add(quader(0.09, 0.62, b * 0.72, dunkel, mastX - 0.15, 0.06, 0));                              // Gabelträger
    for (const sz of [-1, 1]) {                                                                   // Gabelzinken in L-Form
      add(quader(l * 0.36, 0.05, 0.12, dunkel, mastX - 0.2 - l * 0.18, 0.04, sz * b * 0.24));
      add(quader(0.05, 0.55, 0.12, dunkel, mastX - 0.21, 0.04, sz * b * 0.24));
    }
    for (const sz of [-1, 1]) {
      add(rad(rv, 0.3, mastX + 0.35, rv, sz * (b / 2 - 0.15), '#3a4046'), rad(rh, 0.26, kX + kL * 0.32, rh, sz * (b / 2 - 0.13), '#3a4046'));
      add(quader(0.2, 0.12, 0.05, mat('#c62828', { emissive: 0x330000 }), kX + kL / 2 + l * 0.05, kY + h * 0.24, sz * b * 0.38));
    }
  } else if (g.form === 'schere') {              // Scherenbühne: Fahrgestell, Scherenpaket, Plattform mit Geländer
    const rr = 0.17, chH = h * 0.22, stufen = 3, stH = h * 0.38 / stufen;
    add(abgerundet(l, chH, b * 0.96, 0.08, lack, 0, rr * 0.9, 0));
    add(quader(l * 0.3, chH * 0.6, 0.04, dunkel, -l * 0.15, rr * 0.9 + chH * 0.2, b * 0.49));       // Bedienfach
    for (let i = 0; i < stufen; i++) {
      const y = rr * 0.9 + chH + i * stH, len = Math.hypot(l * 0.86, stH), w = Math.atan2(stH, l * 0.86);
      for (const sz of [-1, 1]) for (const s of [-1, 1]) {
        const arm = quader(len, 0.07, 0.06, dunkel, 0, 0, sz * b * 0.36 + s * 0.035);
        arm.position.y = y + stH / 2; arm.rotation.z = s * w; add(arm);
      }
    }
    const pY = rr * 0.9 + chH + stufen * stH;
    add(quader(l * 1.02, 0.08, b, mat('#5f666d', { metalness: 0.4 }), 0, pY, 0));                // Plattform
    add(quader(l * 1.02, 0.15, 0.03, lack, 0, pY + 0.08, b / 2), quader(l * 1.02, 0.15, 0.03, lack, 0, pY + 0.08, -b / 2)); // Fußleisten
    const gH = h - pY - 0.08;
    for (const yy of [gH * 0.5, gH]) {
      add(quader(l, 0.04, 0.04, lack, 0, pY + yy, b / 2 - 0.02), quader(l, 0.04, 0.04, lack, 0, pY + yy, -b / 2 + 0.02));
      add(quader(0.04, 0.04, b, lack, l / 2 - 0.02, pY + yy, 0), quader(0.04, 0.04, b, lack, -l / 2 + 0.02, pY + yy, 0));
    }
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) add(quader(0.04, gH, 0.04, lack, sx * (l / 2 - 0.02), pY + 0.04, sz * (b / 2 - 0.02)));
    add(quader(0.18, 0.22, 0.12, dunkel, -l / 2 + 0.25, pY + gH - 0.15, b / 2 - 0.12));              // Steuerpult
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(rad(rr, 0.13, sx * l * 0.36, rr, sz * (b / 2 - 0.08), '#3a4046'));
  } else if (g.form === 'gelenk') {              // Gelenkteleskopbühne: Drehkranz, Gegengewicht, Ausleger, Korb
    const rr = Math.min(0.38, h * 0.18), chH = h * 0.2;
    add(abgerundet(l * 0.62, chH, b * 0.9, 0.12, dunkel, l * 0.12, rr * 0.8, 0));                    // Unterwagen
    const kranz = new THREE.Mesh(new THREE.CylinderGeometry(b * 0.32, b * 0.34, 0.14, 24), stahl);
    kranz.position.set(l * 0.18, rr * 0.8 + chH + 0.07, 0); add(kranz);
    add(abgerundet(l * 0.34, h * 0.3, b * 0.78, 0.15, lack, l * 0.22, rr * 0.8 + chH + 0.14, 0));    // Oberwagen
    add(abgerundet(l * 0.12, h * 0.28, b * 0.82, 0.08, dunkel, l * 0.36, rr * 0.8 + chH + 0.14, 0)); // Gegengewicht
    const yA = rr * 0.8 + chH + h * 0.42;
    add(abgerundet(l * 0.7, 0.26, 0.3, 0.08, lack, -l * 0.02, yA, 0.12));                             // unterer Ausleger
    add(abgerundet(l * 0.82, 0.22, 0.24, 0.08, mat('#e7eaed', { roughness: 0.4 }), -l * 0.06, yA + 0.28, -0.1)); // Teleskop
    add(quader(0.18, 0.5, 0.18, lack, -l / 2 + 0.75, yA - 0.2, 0));                                    // Gelenk zum Korb
    add(quader(0.82, 0.07, b * 0.82, mat('#5f666d', { metalness: 0.4 }), -l / 2 + 0.41, h * 0.32, 0)); // Korbboden
    for (const yy of [0.5, 1.0]) {
      add(quader(0.82, 0.04, 0.04, lack, -l / 2 + 0.41, h * 0.32 + yy, b * 0.4), quader(0.82, 0.04, 0.04, lack, -l / 2 + 0.41, h * 0.32 + yy, -b * 0.4));
      add(quader(0.04, 0.04, b * 0.82, lack, -l / 2 + 0.02, h * 0.32 + yy, 0));
    }
    for (const sx of [0.02, 0.8]) for (const sz of [-1, 1]) add(quader(0.04, 1.0, 0.04, lack, -l / 2 + sx, h * 0.32, sz * b * 0.4));
    for (const sx of [-l * 0.12, l * 0.36]) for (const sz of [-1, 1]) add(rad(rr, 0.3, sx, rr, sz * (b / 2 - 0.16), '#3a4046'));
  } else {                                        // Teleskoplader: Kabine links, Motor rechts, Teleskoparm mittig
    const rr = Math.min(0.66, h * 0.27), bodenY = rr * 0.55;
    add(abgerundet(l * 0.74, h * 0.2, b * 0.5, 0.12, lack, l * 0.04, bodenY, 0));                    // Rahmen
    add(abgerundet(l * 0.42, h * 0.3, b * 0.34, 0.16, lack, l * 0.16, bodenY + h * 0.16, -b * 0.3)); // Motorhaube
    for (let i = 0; i < 4; i++) add(quader(0.04, 0.03, b * 0.24, dunkel, l * 0.02 + i * 0.16, bodenY + h * 0.46, -b * 0.3)); // Lüftung
    const kabX = -l * 0.04, kabZ = b * 0.3, kabB = b * 0.36, kabH = h * 0.62, kabL = l * 0.3;
    add(quader(kabL, kabH * 0.95, kabB, glas, kabX, bodenY + h * 0.16, kabZ));                      // Kabine
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(quader(0.06, kabH, 0.06, dunkel, kabX + sx * kabL / 2, bodenY + h * 0.16, kabZ + sz * kabB / 2));
    add(abgerundet(kabL + 0.08, 0.08, kabB + 0.08, 0.03, lack, kabX, bodenY + h * 0.16 + kabH, kabZ));     // Kabinendach
    add(abgerundet(0.38, 0.3, 0.42, 0.06, polster, kabX + 0.1, bodenY + h * 0.2, kabZ));                  // Sitz
    const arm = new THREE.Group();                                                                   // Teleskoparm: Drehpunkt hinten oben
    arm.add(abgerundet(l * 0.62, 0.42, 0.46, 0.1, lack, -l * 0.31, -0.21, 0));
    arm.add(abgerundet(l * 0.42, 0.32, 0.36, 0.08, mat('#d9dde0', { roughness: 0.35, metalness: 0.4 }), -l * 0.78, -0.16, 0));
    arm.position.set(l * 0.4, h * 0.82, -b * 0.02); arm.rotation.z = 0.1; add(arm);
    add(quader(0.14, 0.75, b * 0.72, dunkel, -l / 2 + 0.12, 0.05, 0));                                // Gabelträger
    for (const sz of [-1, 1]) add(quader(0.95, 0.06, 0.13, dunkel, -l / 2 - 0.35, 0.04, sz * b * 0.22), quader(0.06, 0.6, 0.13, dunkel, -l / 2 + 0.08, 0.04, sz * b * 0.22));
    for (const sx of [-l * 0.22, l * 0.3]) for (const sz of [-1, 1]) {
      add(rad(rr, 0.44, sx, rr, sz * (b / 2 - 0.22), '#b0262b'));
      add(kotfluegel(rr + 0.08, 0.5, kotflg, sx, rr, sz * (b / 2 - 0.22)));
    }
  }
  // Modell exakt in Länge, Breite und Höhe einpassen, damit Bild und Ladeprüfung übereinstimmen
  grp.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(grp);
  const sx = Math.min(1, l / (box.max.x - box.min.x)), sy = Math.min(1, h / box.max.y), sz = Math.min(1, b / (box.max.z - box.min.z));
  grp.scale.set(sx, sy, sz);
  grp.position.set(-((box.min.x + box.max.x) / 2) * sx, 0, -((box.min.z + box.max.z) / 2) * sz);
  const huelle = new THREE.Group();
  huelle.add(grp);
  return huelle;
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
function lkwModell(l, kabinenFarbe = '#f2f4f5') {
  const grp = new THREE.Group();
  const add = (...m) => m.forEach((x) => grp.add(x));
  const lack = mat(kabinenFarbe, { roughness: 0.32, metalness: 0.15 }), gruen = mat('#27a849', { roughness: 0.35 });
  const dunkel = mat('#2b3035', { roughness: 0.6, metalness: 0.2 }), grau = mat('#4c535a', { roughness: 0.5, metalness: 0.4 });
  const alu = mat('#c3c9cf', { roughness: 0.3, metalness: 0.75 }), deckMat = mat('#6a7178', { roughness: 0.7, metalness: 0.35 });
  const glas = mat('#1f2b35', { roughness: 0.06, metalness: 0.6 }), glanz = mat('#9fb7cb', { roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55 });
  const licht = mat('#fffbe6', { emissive: 0x6b6650 }), orange = mat('#ff9800', { emissive: 0x3a2300 }), rot = mat('#c62828', { emissive: 0x3a0000 });
  const kotflg = mat('#1f2326', { roughness: 0.7, side: THREE.DoubleSide });
  const L = l.laenge, B = l.breite, sattel = L > 11, klein = l.nutzlast < 2;
  const r = klein ? 0.36 : 0.52;
  const kabL = sattel ? 2.4 : klein ? 2.0 : 2.25, kabH = klein ? 2.1 : sattel ? 2.85 : 2.6, kabB = klein ? 2.0 : 2.45;
  const kx = -kabL / 2 - 0.3, ky = r + 0.35, front = kx - kabL / 2;

  // Fahrerhaus mit Sockel, Reiter-Streifen und (Sattelzug) Hochdach
  add(abgerundet(kabL, kabH, kabB, 0.28, lack, kx, ky, 0));
  add(quader(kabL + 0.03, 0.5, kabB + 0.03, dunkel, kx, ky - 0.04, 0));
  add(quader(kabL * 0.97, 0.24, kabB + 0.02, gruen, kx, ky + kabH * 0.3, 0));
  if (sattel) add(abgerundet(kabL * 0.82, 0.5, kabB * 0.9, 0.2, lack, kx + 0.12, ky + kabH - 0.05, 0));
  // Front: Kühlergrill mit Lamellen, Scheinwerfer, Blinker, Stoßfänger
  const grillH = kabH * 0.26;
  add(quader(0.05, grillH, kabB * 0.6, dunkel, front - 0.02, ky + 0.48, 0));
  for (let i = 0; i < 5; i++) add(quader(0.06, 0.025, kabB * 0.58, grau, front - 0.03, ky + 0.52 + i * grillH / 5.2, 0));
  for (const sz of [-1, 1]) {
    add(quader(0.06, 0.16, 0.4, licht, front - 0.03, ky + 0.26, sz * kabB * 0.35));
    add(quader(0.06, 0.08, 0.13, orange, front - 0.03, ky + 0.26, sz * kabB * 0.46));
  }
  add(quader(0.24, 0.34, kabB + 0.06, grau, front - 0.08, ky - 0.28, 0));
  // Windschutzscheibe (geneigt) mit Rahmen, Spiegelung, Sonnenblende und Wischern
  const sH = kabH * 0.36, sY = ky + kabH * 0.53;
  const scheibe = (m, dx, hh, bb, y, z) => { const q = quader(0.05, hh, bb, m, front + dx, y, z); q.rotation.z = -0.12; add(q); };
  scheibe(dunkel, -0.01, sH + 0.12, kabB * 0.92, sY - 0.06, 0);
  scheibe(glas, -0.05, sH, kabB * 0.86, sY, 0);
  scheibe(glanz, -0.065, sH * 0.2, kabB * 0.42, sY + sH * 0.62, -kabB * 0.16);
  add(quader(0.16, 0.09, kabB * 0.9, dunkel, front - 0.04, sY + sH + 0.08, 0));
  for (const sz of [-0.2, 0.22]) { const w = quader(0.025, 0.025, kabB * 0.3, dunkel, front - 0.09, sY + 0.04, sz * kabB); w.rotation.x = 0.35; add(w); }
  // Seiten: Fenster, Türfuge, Griff, Trittstufen, Spiegel am Arm, Schriftzug
  for (const sz of [-1, 1]) {
    const zs = sz * (kabB / 2 + 0.012);
    add(quader(kabL * 0.46, kabH * 0.3, 0.02, glas, kx - kabL * 0.15, ky + kabH * 0.56, zs));
    add(quader(0.02, kabH * 0.7, 0.02, dunkel, kx + kabL * 0.2, ky + 0.25, zs));
    add(quader(0.2, 0.04, 0.03, dunkel, kx + kabL * 0.1, ky + kabH * 0.47, zs));
    for (const y of [ky - 0.42, ky - 0.12]) add(quader(0.5, 0.05, 0.26, dunkel, kx - 0.02, y, sz * (kabB / 2 - 0.06)));
    add(quader(0.04, 0.04, 0.34, dunkel, front + 0.28, sY + sH * 0.72, sz * (kabB / 2 + 0.17)));
    add(abgerundet(0.1, 0.55, 0.22, 0.04, dunkel, front + 0.24, sY - 0.08, sz * (kabB / 2 + 0.34)));
    const t = new THREE.Mesh(new THREE.PlaneGeometry(kabL * 0.86, kabL * 0.86 / 5), reiterSchrift());
    t.position.set(kx + 0.02, ky + kabH * 0.42, sz * (kabB / 2 + 0.03));
    if (sz < 0) t.rotation.y = Math.PI;
    add(t);
  }

  // Rahmen, Tank, Batteriekasten, Seitenschutz
  const rahmenY = Math.max(r * 0.95, l.ladehoehe - 0.48);
  for (const sz of [-1, 1]) add(quader(L + kabL + 0.5, 0.26, 0.12, dunkel, (L - kabL) / 2 - 0.2, rahmenY, sz * 0.45));
  if (!klein) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 20), alu);
    tank.rotation.z = Math.PI / 2; tank.position.set(0.6, rahmenY - 0.05, -(B / 2 - 0.4)); add(schatten(tank));
    add(quader(0.6, 0.45, 0.45, dunkel, 0.6, rahmenY - 0.3, B / 2 - 0.35));
  }

  // Ladefläche: Stahlboden, Seitenprofile, Rungentaschen, Stirnwand als Gitter, Rampen, Rücklichter
  add(quader(L, 0.16, B, deckMat, L / 2, l.ladehoehe - 0.16, 0));
  for (let x = 0.6; x < L - 0.3; x += 0.6) add(quader(0.03, 0.005, B * 0.98, mat('#575d63'), x, l.ladehoehe, 0)); // Bodenfugen
  for (const sz of [-1, 1]) {
    add(quader(L, 0.2, 0.08, alu, L / 2, l.ladehoehe - 0.24, sz * (B / 2 - 0.04)));
    add(quader(L, 0.05, 0.1, gruen, L / 2, l.ladehoehe - 0.3, sz * (B / 2 - 0.02)));
    for (let x = 0.5; x < L - 0.2; x += 1.2) add(quader(0.1, 0.18, 0.06, dunkel, x, l.ladehoehe - 0.22, sz * (B / 2 + 0.01)));
  }
  const stirnH = klein ? 0.6 : 1.0;
  for (const sz of [-1, 1]) add(quader(0.1, stirnH, 0.1, alu, -0.05, l.ladehoehe, sz * (B / 2 - 0.05)));
  add(quader(0.1, 0.08, B, alu, -0.05, l.ladehoehe + stirnH - 0.08, 0));
  for (let i = 1; i < 6; i++) add(quader(0.04, stirnH - 0.1, 0.04, alu, -0.05, l.ladehoehe, -B / 2 + i * B / 6));
  if (/Rampen/.test(l.typ)) for (const sz of [-1, 1]) {                                      // hochgeklappte Auffahrrampen
    const rampe = quader(0.1, Math.min(2.2, l.laenge * 0.3), 0.45, alu, L - 0.08, l.ladehoehe, sz * (B / 2 - 0.4));
    rampe.rotation.z = 0.12; add(rampe);
  }
  for (const sz of [-1, 1]) add(quader(0.05, 0.12, 0.3, rot, L + 0.02, l.ladehoehe - 0.34, sz * (B / 2 - 0.3)));
  add(quader(0.03, 0.12, 0.5, mat('#f5f5f5'), L + 0.02, l.ladehoehe - 0.36, 0));                  // Kennzeichen

  // Räder: vorne einzeln, hinten Zwilling; Sattelzug mit Zugmaschinen- und Aufliegerachsen
  const vorn = kx - 0.05, zRad = (Math.max(B, kabB) / 2 - 0.22);
  for (const sz of [-1, 1]) {
    add(rad(r, 0.36, vorn, r, sz * zRad));
    add(kotfluegel(r + 0.08, 0.42, kotflg, vorn, r, sz * zRad));
  }
  const rTrailer = sattel && l.ladehoehe < 0.8 ? 0.38 : r;
  const tief = sattel && l.ladehoehe < 0.8;
  const hinten = tief ? [L - 2.2, L - 1.3, L - 0.4] : sattel ? [L - 3.2, L - 1.95, L - 0.7] : L > 7 ? [L - 1.95, L - 0.7] : [L - 1.1];
  const achsen = [...(sattel ? [{ x: 0.7, r, zwilling: true }] : []), ...hinten.map((x) => ({ x, r: rTrailer, zwilling: !sattel }))];
  for (const a of achsen) for (const sz of [-1, 1]) {
    add(rad(a.r, 0.32, a.x, a.r, sz * zRad));
    if (a.zwilling) add(rad(a.r, 0.32, a.x, a.r, sz * (zRad - 0.34)));
  }
  if (rTrailer * 2 + 0.1 > l.ladehoehe) {                                                        // Tiefbett: Radkasten über den Achsen
    add(quader(2.7, rTrailer * 2 + 0.16 - l.ladehoehe, B, deckMat, L - 1.35, l.ladehoehe, 0));
  }
  for (const sz of [-1, 1]) add(quader(0.04, 0.5, 0.5, kotflg, (hinten[hinten.length - 1]) + 0.65, rTrailer * 1.1, sz * zRad));   // Spritzlappen
  grp.userData.laenge = L + kabL + 0.6;
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
