'use strict';
// 3D-Ladeplan mit three.js: Lkw mit Zonen und Zurrpunkten, Geräte an den Stellungen aus beladung.js, 4-m-Grenze als rote Ebene.
// Achsen: x = Fahrzeuglänge (Fahrerhaus bei x < 0), y = Höhe, z = Breite. Einheit Meter.

// halte: Halte der Fahrt [{ ort, art, geraete }]. Gezeigt wird der Hinweg (Auslieferungen, erster Kunde hinten) oder der
// Rückweg (Abholungen, zuerst aufgeladenes Gerät vorn). stopps/orte/nummern beschreiben die gezeigte Richtung: Geräte-IDs je
// Halt in der Reihenfolge für beladung(), Orte dazu und die Stoppnummer der ganzen Fahrt.
const lp = { lkw: 'L07', halte: null, richtung: 'hin', stopps: [['G06']], orte: [], nummern: [1], ausPlan: false, drei: null,
  blick: { winkel: -0.85, neigung: 0.6, abstand: 16 } };
const LP_MAX = 6;

function ladeplanOeffnen(lkwId, halte, ausPlan = false) {
  lp.lkw = lkwId;
  lp.halte = halte.map((h) => ({ ...h, geraete: [...h.geraete] }));
  lp.ausPlan = ausPlan;
  richtungSetzen(lp.halte.some((h) => h.art !== 'Abholung') ? 'hin' : 'rueck');
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  waehleAnsicht('ladeplan');
}
function richtungSetzen(richtung) {
  lp.richtung = richtung;
  const teil = lp.halte.map((h, i) => ({ h, nr: i + 1 })).filter((x) => (x.h.art === 'Abholung') === (richtung === 'rueck'));
  if (richtung === 'rueck') teil.reverse(); // für beladung(): der zuletzt aufgeladene Halt steht hinten
  lp.stopps = teil.map((x) => x.h.geraete); // dieselben Felder wie in lp.halte: Ändern wirkt auf beide Richtungen
  lp.orte = teil.map((x) => x.h.ort);
  lp.nummern = teil.map((x) => x.nr);
  if (!lp.stopps.length) { lp.stopps = [[]]; lp.orte = [null]; lp.nummern = [1]; }
}

function dreiAufbauen() {
  if (typeof THREE === 'undefined') return null;
  const huelle = $('#lp-szene');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  huelle.replaceChildren(renderer.domElement);
  const szene = new THREE.Scene();
  szene.background = new THREE.Color('#eef2f8');
  const kamera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  szene.add(new THREE.HemisphereLight(0xffffff, 0xb8c2cf, 0.95));
  const sonne = new THREE.DirectionalLight(0xffffff, 0.9);
  sonne.position.set(-12, 22, 12);
  sonne.castShadow = true;
  sonne.shadow.mapSize.set(2048, 2048);
  sonne.shadow.radius = 4;
  Object.assign(sonne.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15 });
  szene.add(sonne);
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#e6ebf2', roughness: 1 }));
  boden.rotation.x = -Math.PI / 2;
  boden.receiveShadow = true;
  szene.add(boden);
  const raster = new THREE.GridHelper(80, 80, 0xd3dae4, 0xdde3ec);
  raster.position.y = 0.005;
  szene.add(raster);
  const gruppe = new THREE.Group();
  szene.add(gruppe);

  // Drehen per Ziehen, Zoomen per Mausrad
  let zieht = null;
  const c = renderer.domElement;
  c.addEventListener('pointerdown', (e) => { zieht = { x: e.clientX, y: e.clientY }; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointerup', () => { zieht = null; });
  c.addEventListener('pointermove', (e) => {
    if (!zieht) return;
    lp.blick.winkel -= (e.clientX - zieht.x) * 0.008;
    lp.blick.neigung = Math.max(0.05, Math.min(1.45, lp.blick.neigung + (e.clientY - zieht.y) * 0.006));
    zieht = { x: e.clientX, y: e.clientY };
    zeichne();
  });
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    lp.blick.abstand = Math.max(8, Math.min(60, lp.blick.abstand * (e.deltaY > 0 ? 1.1 : 0.9)));
    zeichne();
  }, { passive: false });
  window.addEventListener('resize', () => { if (!$('#v-ladeplan').hidden) zeichne(); });
  return { renderer, szene, kamera, gruppe };
}

function zeichne() {
  const d = lp.drei;
  if (!d) return;
  const huelle = $('#lp-szene');
  const b = huelle.clientWidth || 600, h = huelle.clientHeight || 420;
  d.renderer.setSize(b, h, false);
  d.renderer.domElement.style.width = '100%';
  d.renderer.domElement.style.height = h + 'px';
  d.kamera.aspect = b / h;
  d.kamera.updateProjectionMatrix();
  const { winkel, neigung, abstand } = lp.blick;
  d.kamera.position.set(Math.cos(winkel) * Math.cos(neigung) * abstand, 1.8 + Math.sin(neigung) * abstand, Math.sin(winkel) * Math.cos(neigung) * abstand);
  d.kamera.lookAt(0, 1.8, 0);
  d.renderer.render(d.szene, d.kamera);
}

function renderLadeplan() {
  const l = finde(LKW, lp.lkw);
  // leere Stopps (alles entfernt) fallen weg, die Orte rücken mit; mindestens eine Gruppe bleibt zum Aufladen
  const voll = lp.stopps.map((st) => st.length > 0);
  lp.orte = lp.orte.filter((_, k) => voll[k]);
  lp.nummern = lp.nummern.filter((_, k) => voll[k]);
  lp.stopps = lp.stopps.filter((_, k) => voll[k]);
  if (!lp.stopps.length) { lp.stopps = [[]]; lp.orte = [null]; lp.nummern = [1]; }
  const stopps = lp.stopps.map((st) => st.map((id) => finde(GERAETE, id)));
  const alle = stopps.flat(), mehrere = stopps.filter((st) => st.length).length > 1;
  const ortNamen = lp.orte.map((o) => (o ? finde(ORTE, o).name : ''));
  const nr = (k) => lp.nummern[k] ?? k + 1;
  const b = alle.length ? beladung(l, stopps, ortNamen) : null;
  // Stellungen aus der Prüfung; passt es nicht, zum Zeigen hintereinander (vorn der letzte Kunde)
  let x = 0;
  const zoneBei = (pos) => { let a = 0; for (const zo of l.zonen) { if (pos < a + zo.laenge) return zo; a += zo.laenge; } return l.zonen[l.zonen.length - 1]; };
  const plaetze = b?.plaetze || stopps.flatMap((st, k) => st.map((g) => ({ g, stopp: k }))).reverse()
    .map((p) => { const q = { ...p, x, zone: zoneBei(x), ueberhang: x + p.g.l > l.laenge }; x += p.g.l + LADE_ABSTAND; return q; });
  const passt = b && b.art === 'ok';

  // Bedienfeld
  $('#lp-lkw').value = l.id;
  $('#lp-zurueck').hidden = !lp.ausPlan;
  const beides = lp.halte && lp.halte.some((h) => h.art === 'Abholung') && lp.halte.some((h) => h.art !== 'Abholung');
  $('#lp-richtung').hidden = !beides;
  document.querySelectorAll('#lp-richtung button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.richtung === lp.richtung)));
  const nummer = (k) => el('span', { class: 'stopp-nr klein', style: `background:${stoppFarbe(nr(k) - 1)}` }, String(nr(k)));
  const wort = lp.richtung === 'rueck' ? ' (abholen)' : '';
  $('#lp-liste').replaceChildren(...(alle.length ? stopps.flatMap((st, k) => [
    ...(mehrere && st.length ? [el('li', { class: 'lp-stopp' }, nummer(k), ortNamen[k] ? `Stopp ${nr(k)} · ${ortNamen[k]}${wort}` : `Stopp ${nr(k)}`)] : []),
    ...st.map((g, i) => el('li', {},
      mehrere ? nummer(k) : el('i', { class: 'farbpunkt', style: `background:${g.farbe}` }), `${g.kurz} · ${zahl(g.gewicht, 1)} t · ${zahl(g.l)} m`,
      el('button', { class: 'x klein', 'aria-label': `${g.kurz} entfernen`, title: 'Entfernen', onclick: () => { lp.stopps[k].splice(i, 1); renderLadeplan(); } }, icon('schliessen')))),
  ]) : [el('li', { class: 'hinweis' }, 'Noch nichts geladen.')]));
  $('#lp-dazu').disabled = alle.length >= LP_MAX;
  const balken = (wert, max, text, art) => el('div', { class: 'lp-wert', 'data-wert': art },
    el('div', {}, text),
    el('span', { class: 'balken breit' }, el('i', { style: `width:${Math.min(100, Math.max(0, wert) / max * 100)}%;${wert > max + 1e-9 ? 'background:var(--rot)' : ''}` })));
  const sattel = l.typ.startsWith('Sattelzug');
  const achsen = alle.length ? achslasten(l, plaetze) : { vorn: 0, hinten: 0 };
  const belegt = alle.reduce((s, g) => s + g.l, 0) + LADE_ABSTAND * Math.max(0, alle.length - 1);
  const hoehe = plaetze.reduce((m, p) => Math.max(m, p.zone.hoehe + p.g.h), l.ladehoehe);
  $('#lp-werte').replaceChildren(...[
    balken(b ? b.gewicht : 0, l.nutzlast, `Gewicht ${zahl(b ? b.gewicht : 0, 1)} von ${zahl(l.nutzlast, 1)} t`, 'gewicht'),
    balken(belegt, l.laenge, `Ladelänge ${zahl(belegt, 1)} von ${zahl(l.laenge, 1)} m`, 'laenge'),
    balken(hoehe, MAX_HOEHE, `Gesamthöhe ${zahl(hoehe)} von ${zahl(MAX_HOEHE)} m`, 'hoehe'),
    balken(achsen.vorn, l.achsen.vorn.frei, `${sattel ? 'Sattelkupplung' : 'Vorderachse'} +${zahl(Math.max(0, achsen.vorn), 1)} von ${zahl(l.achsen.vorn.frei, 1)} t frei`, 'achse-vorn'),
    balken(achsen.hinten, l.achsen.hinten.frei, `${sattel ? 'Achsaggregat' : 'Hinterachse'} +${zahl(Math.max(0, achsen.hinten), 1)} von ${zahl(l.achsen.hinten.frei, 1)} t frei`, 'achse-hinten'),
    !alle.length ? null : passt
      ? el('div', { class: 'g-ok' }, `Passt${lp.richtung === 'rueck' ? ' auf dem Rückweg' : ''}: Rampe, Zonen, Zurrpunkte, Achslast${mehrere ? ' und Ladereihenfolge' : ''} geprüft`)
      : el('div', {}, ...b.gruende.map((p) => el('div', { class: 'g-' + p.art }, (p.art === 'nein' ? 'Passt nicht: ' : 'Genehmigung nötig: ') + p.txt))),
  ].filter(Boolean)); // replaceChildren würde null als Text einfügen

  // Szene
  if (!lp.drei) lp.drei = dreiAufbauen();
  if (!lp.drei) {
    $('#lp-szene').replaceChildren(el('div', { class: 'karten-fehler' }, '3D-Ansicht nicht verfügbar (three.js oder WebGL fehlt).'));
    return;
  }
  const grp = lp.drei.gruppe;
  freigeben(grp); // Grafikspeicher freigeben, sonst wächst er bei jedem Neuaufbau
  grp.clear();
  grp.add(lkwModell(l));
  for (const p of plaetze) {
    const warn = !passt;
    const k = geraetKoerper(p.g, warn);
    k.position.set(p.x + p.g.l / 2, p.zone.hoehe, 0);
    grp.add(k);
    const sch = schild(mehrere ? `${nr(p.stopp)} · ${p.g.kurz}` : p.g.kurz, warn ? '#c0392b' : mehrere ? stoppFarbe(nr(p.stopp) - 1) : '#212529');
    sch.position.set(p.x + p.g.l / 2, p.zone.hoehe + p.g.h + 0.7, 0);
    grp.add(sch);
  }
  const breite = l.laenge + 4.5;
  const grenze = new THREE.Mesh(new THREE.PlaneGeometry(breite, 3.6),
    new THREE.MeshBasicMaterial({ color: '#e53935', transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
  grenze.rotation.x = -Math.PI / 2;
  grenze.position.set(l.laenge / 2 - 1.2, MAX_HOEHE, 0);
  grp.add(grenze);
  const rand = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(breite, 3.6)), new THREE.LineBasicMaterial({ color: '#e53935' }));
  rand.rotation.x = -Math.PI / 2;
  rand.position.copy(grenze.position);
  grp.add(rand);
  const hs = schild('max. 4,00 m', '#c0392b');
  hs.position.set(-3.2, MAX_HOEHE + 0.4, 0);
  grp.add(hs);
  grp.position.x = -(l.laenge - 2.4) / 2;
  zeichne();
}

function ladeplanBedienungAufbauen() {
  $('#lp-lkw').replaceChildren(...LKW.map((l) => el('option', { value: l.id }, `${l.kz} · ${l.typ}`)));
  $('#lp-geraet').replaceChildren(...GERAETE.map((g) => el('option', { value: g.id }, g.name)));
  $('#lp-lkw').addEventListener('change', (e) => { lp.lkw = e.target.value; renderLadeplan(); });
  $('#lp-dazu').addEventListener('click', () => {
    if (lp.stopps.flat().length >= LP_MAX) return;
    lp.stopps[lp.stopps.length - 1].push($('#lp-geraet').value); // zum letzten Kunden dazu
    renderLadeplan();
  });
  $('#lp-zurueck').addEventListener('click', () => waehleAnsicht('planen'));
  document.querySelectorAll('#lp-richtung button').forEach((b) => b.addEventListener('click', () => { richtungSetzen(b.dataset.richtung); renderLadeplan(); }));
}

// Bild je Lkw für die Steckbriefe: mit einem gemeinsamen Renderer einmal zeichnen und als PNG merken
const lkwBilder = new Map();
let bildRenderer = null;
function lkwBild(l) {
  if (lkwBilder.has(l.id)) return lkwBilder.get(l.id);
  if (typeof THREE === 'undefined') return null;
  const b = 640, h = 300;
  if (!bildRenderer) {
    try { bildRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true }); } catch (e) { return null; }
    bildRenderer.setSize(b, h, false);
    bildRenderer.outputEncoding = THREE.sRGBEncoding;
  }
  const szene = new THREE.Scene();
  szene.add(new THREE.HemisphereLight(0xffffff, 0xb8c2cf, 1.0));
  const sonne = new THREE.DirectionalLight(0xffffff, 0.8);
  sonne.position.set(-10, 18, 14);
  szene.add(sonne);
  const modell = lkwModell(l);
  modell.position.x = -(l.laenge - 2.4) / 2;
  szene.add(modell);
  const kamera = new THREE.PerspectiveCamera(30, b / h, 0.1, 200);
  const abstand = (l.laenge + 3) * 1.55;
  kamera.position.set(-abstand * 0.45, abstand * 0.32, abstand * 0.82);
  kamera.lookAt(0.4, 1.0, 0);
  bildRenderer.render(szene, kamera);
  const url = bildRenderer.domElement.toDataURL('image/png');
  freigeben(modell);
  lkwBilder.set(l.id, url);
  return url;
}
