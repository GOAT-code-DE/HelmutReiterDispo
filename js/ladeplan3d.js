'use strict';
// 3D-Ladeplan mit three.js: Lkw und Geräte aus modelle3d.js, 4-m-Grenze als rote Ebene.
// Achsen: x = Fahrzeuglänge (Fahrerhaus bei x < 0), y = Höhe, z = Breite. Einheit Meter.

const lp = { lkw: 'L07', geraete: ['G06'], auftrag: { art: 'Auslieferung', ort: 'ha', start: 13 * 60 }, drei: null, blick: { winkel: -0.75, neigung: 0.42, abstand: 17 } };
const LP_MAX = 6;

function ladeplanOeffnen(lkwId, geraetIds, auftrag) {
  lp.lkw = lkwId;
  lp.geraete = geraetIds.slice(0, LP_MAX);
  if (auftrag) lp.auftrag = { art: auftrag.art, ort: auftrag.ort, start: auftrag.start, tag: auftrag.tag };
  lp.anfrage = auftrag?.anfrage || null; // aus dem Cockpit über „Anders planen“ gekommen: nach dem Einplanen erledigt
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  waehleAnsicht('ladeplan');
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
  const geraete = lp.geraete.map((id) => finde(GERAETE, id));
  const plan = ladeplan(l, geraete);

  // Bedienfeld
  $('#lp-lkw').value = l.id;
  $('#lp-liste').replaceChildren(...(geraete.length ? geraete.map((g, i) => el('li', {},
    el('i', { class: 'farbpunkt', style: `background:${g.farbe}` }), `${g.kurz} · ${zahl(g.gewicht, 1)} t · ${zahl(g.l)} m`,
    el('button', { class: 'x klein', 'aria-label': `${g.kurz} entfernen`, title: 'Entfernen', onclick: () => { lp.geraete.splice(i, 1); renderLadeplan(); } }, icon('schliessen'))))
    : [el('li', { class: 'hinweis' }, 'Noch nichts geladen.')]));
  $('#lp-dazu').disabled = lp.geraete.length >= LP_MAX;
  const balken = (wert, max, text) => el('div', { class: 'lp-wert' },
    el('div', {}, text),
    el('span', { class: 'balken breit' }, el('i', { style: `width:${Math.min(100, wert / max * 100)}%;${wert > max ? 'background:var(--rot)' : ''}` })));
  const fazit = !geraete.length ? null
    : plan.probleme.length
      ? el('div', {}, ...plan.probleme.map((p) => el('div', { class: 'g-' + p.art }, (p.art === 'nein' ? 'Passt nicht: ' : 'Genehmigung nötig: ') + p.txt)))
      : el('div', { class: 'g-ok' }, 'Ladung passt ohne Genehmigung');
  $('#lp-werte').replaceChildren(
    balken(plan.gewicht, l.nutzlast, `Gewicht ${zahl(plan.gewicht, 1)} von ${zahl(l.nutzlast, 1)} t`),
    balken(plan.laenge, l.laenge, `Ladelänge ${zahl(plan.laenge, 1)} von ${zahl(l.laenge, 1)} m`),
    balken(plan.hoehe, MAX_HOEHE, `Gesamthöhe ${zahl(plan.hoehe)} von ${zahl(MAX_HOEHE)} m`),
    fazit);

  renderLpPlanung();

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
  for (const p of plan.plaetze) {
    const zuHoch = l.ladehoehe + p.g.h > MAX_HOEHE;
    const k = geraetKoerper(p.g, p.ueberhang || zuHoch);
    k.position.set(p.x + p.g.l / 2, l.ladehoehe, 0);
    grp.add(k);
    const sch = schild(p.g.kurz, p.ueberhang || zuHoch ? '#c0392b' : '#212529');
    sch.position.set(p.x + p.g.l / 2, l.ladehoehe + p.g.h + 0.7, 0);
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

// ---------- Tour direkt aus dem Ladeplan einplanen ----------
function lpAuftrag() {
  if (!lp.auftrag.tag || lp.auftrag.tag < HEUTE) lp.auftrag.tag = datum >= HEUTE ? datum : HEUTE;
  return { art: lp.auftrag.art, geraet: lp.geraete[0], ort: lp.auftrag.ort, start: lp.auftrag.start, tag: lp.auftrag.tag };
}
function renderLpPlanung() {
  $('#lp-art').value = lp.auftrag.art;
  $('#lp-ort').value = lp.auftrag.ort;
  $('#lp-start').value = hhmm(lp.auftrag.start);
  const l = finde(LKW, lp.lkw), a = lpAuftrag();
  $('#lp-tag').min = HEUTE;
  $('#lp-tag').value = a.tag;
  const pruefungen = istSonntag(a.tag) ? [['nein', 'Sonntags wird nicht gefahren (Lkw-Fahrverbot)']] : [];
  let fahrer = [];
  if (lp.geraete.length !== 1) {
    pruefungen.push(['nein', lp.geraete.length ? 'Für eine Tour genau ein Gerät aufladen (Sammeltouren folgen später).' : 'Erst ein Gerät aufladen.']);
  } else {
    const bis = a.start + dauerEinfach(a.art, a.ort);
    const pr = ladepruefung(finde(GERAETE, a.geraet), l);
    pruefungen.push(pr.ergebnis === 'ok' ? ['ok', 'Ladung passt ohne Genehmigung'] : ['nein', 'Ladung passt nicht ohne Genehmigung']);
    pruefungen.push(bis <= TAG_ENDE ? ['ok', `Rückkehr ${hhmm(bis)} Uhr`] : ['nein', `Rückkehr erst ${hhmm(bis)} – früher abfahren`]);
    pruefungen.push(lkwFrei(l.id, a.start, bis, [], a.tag) ? ['ok', `${l.kz} ist ${tagKurz(a.tag)} ${hhmm(a.start)}–${hhmm(bis)} frei`] : ['nein', `${l.kz} ist zu der Zeit schon verplant`]);
    fahrer = FAHRER.filter((f) => darfFahren(f, l) && fahrerFrei(f.id, a.start, bis, [], a.tag)).sort((x, y) => FS_RANG[x.fs] - FS_RANG[y.fs]);
    pruefungen.push(fahrer.length ? ['ok', `${fahrer.length} Fahrer mit Klasse ${l.fs} frei`] : ['nein', `kein freier Fahrer mit Klasse ${l.fs}`]);
  }
  const alteWahl = $('#lp-fahrer').value;
  $('#lp-fahrer').replaceChildren(...(fahrer.length ? fahrer.map((f) => el('option', { value: f.id }, `${f.name} (${f.fs})`)) : [el('option', { value: '' }, '–')]));
  if (fahrer.some((f) => f.id === alteWahl)) $('#lp-fahrer').value = alteWahl;
  $('#lp-status').replaceChildren(...pruefungen.map(([art, txt]) => el('div', { class: 'g-' + art }, txt)));
  $('#lp-einplanen').disabled = pruefungen.some(([art]) => art !== 'ok');
}
function lpPlanungAufbauen() {
  $('#lp-ort').replaceChildren(...ORTE.map((o) => el('option', { value: o.id }, `${o.name} (${o.km} km)`)));
  $('#lp-art').addEventListener('change', (e) => { lp.auftrag.art = e.target.value; renderLpPlanung(); });
  $('#lp-ort').addEventListener('change', (e) => { lp.auftrag.ort = e.target.value; renderLpPlanung(); });
  $('#lp-start').addEventListener('change', () => { lp.auftrag.start = feldMinuten('#lp-start'); renderLpPlanung(); });
  $('#lp-tag').addEventListener('change', (e) => { if (istTag(e.target.value) && e.target.value >= HEUTE) lp.auftrag.tag = e.target.value; renderLpPlanung(); });
  $('#lp-einplanen').addEventListener('click', () => {
    const anfrage = lp.anfrage; // tourAnlegen wechselt zur Tourenansicht und löscht dabei den Bezug
    if (!tourAnlegen(lpAuftrag(), lp.lkw, $('#lp-fahrer').value)) { renderLpPlanung(); return; }
    if (anfrage) { anfrageEntfernen(anfrage); speichern(); }
  });
}
