'use strict';
// 3D-Karte (MapLibre + OpenFreeMap): weiße Gebäude aus OpenStreetMap, Reiter-Halle orange,
// Routen von OSRM, Lkw-Positionen zur Uhrzeit `zeit`. Koordinaten hier als [lng, lat].

// Umriss Wilhelm-Beckmann-Straße 16 (OSM way 458047286)
const HALLE = [[7.058308, 51.45583], [7.05819, 51.455899], [7.058464, 51.45608], [7.058475, 51.456074], [7.058613, 51.456166],
  [7.05862, 51.456172], [7.058624, 51.456174], [7.058731, 51.45611], [7.059202, 51.455831], [7.059141, 51.45579],
  [7.058953, 51.455901], [7.058801, 51.4558], [7.058593, 51.455662], [7.058308, 51.45583]];
const HALLE_MITTE = [7.05868, 51.45590];

let m3 = null, m3Bereit = false, m3Eingepasst = false;
const m3Marker = new Map();
let m3Schilder = [];

// ---------- Routen (gerichtet, je Richtung eine Abfrage) ----------
const routen = new Map();
let routenLaeuft = false, routenNochmal = false;
const punkt = (id) => (id === 'hof' ? { lat: HALLE_MITTE[1], lng: HALLE_MITTE[0] } : finde(ORTE, id));
function route(a, b) {
  const r = routen.get(`${a}>${b}`);
  if (r) return r;
  const pa = punkt(a), pb = punkt(b);
  return [[pa.lng, pa.lat], [pb.lng, pb.lat]];
}
function benoetigteRouten() {
  const paare = new Set();
  for (const t of stand.touren) for (const p of phasen(t)) if (p.typ === 'fahrt') paare.add(`${p.von_ort}>${p.nach}`);
  for (const sp of stand.sped) { paare.add(`hof>${sp.ort}`); paare.add(`${sp.ort}>hof`); }
  return [...paare].filter((k) => !routen.has(k));
}
async function routenHolen() {
  if (routenLaeuft) { routenNochmal = true; return; }
  routenLaeuft = true;
  do {
    routenNochmal = false;
    let neu = false;
    for (const key of benoetigteRouten()) {
      const [a, b] = key.split('>'), pa = punkt(a), pb = punkt(b);
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${pa.lng},${pa.lat};${pb.lng},${pb.lat}?overview=full&geometries=geojson`);
        if (!res.ok) continue;
        const c = (await res.json())?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(c) && c.length > 1 && c.every((x) => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]))) {
          routen.set(key, c);
          neu = true;
        }
      } catch (e) { /* Routendienst nicht erreichbar: Luftlinie bleibt */ }
    }
    if (neu) karte3dDaten();
  } while (routenNochmal);
  routenLaeuft = false;
}

function aufLinie(pkt, f) { // Punkt bei Anteil f (0..1) entlang der Linie, [lng, lat]
  const d = [0];
  for (let i = 1; i < pkt.length; i++) d.push(d[i - 1] + Math.hypot((pkt[i][0] - pkt[i - 1][0]) * 0.62, pkt[i][1] - pkt[i - 1][1]));
  const ziel = Math.max(0, Math.min(1, f)) * d[d.length - 1];
  for (let i = 1; i < pkt.length; i++) {
    if (d[i] >= ziel) {
      const t = d[i] === d[i - 1] ? 0 : (ziel - d[i - 1]) / (d[i] - d[i - 1]);
      return [pkt[i - 1][0] + t * (pkt[i][0] - pkt[i - 1][0]), pkt[i - 1][1] + t * (pkt[i][1] - pkt[i - 1][1])];
    }
  }
  return pkt[pkt.length - 1];
}
function quadrat([lng, lat], m) { // Grundfläche m × m um einen Punkt
  const dLat = m / 2 / 111320, dLng = dLat / Math.cos(lat * Math.PI / 180);
  return [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]];
}

// ---------- Aufbau ----------
function karte3dAufbauen() {
  if (typeof maplibregl === 'undefined') {
    $('#karte3d').replaceChildren(el('div', { class: 'karten-fehler' }, 'Die 3D-Karte braucht eine Internetverbindung (MapLibre nicht geladen).'));
    return;
  }
  m3 = new maplibregl.Map({
    container: 'karte3d', style: 'https://tiles.openfreemap.org/styles/positron',
    center: HALLE_MITTE, zoom: 9.2, pitch: 52, bearing: -18, attributionControl: { compact: true }, canvasContextAttributes: { antialias: true },
  });
  m3.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');
  m3.on('load', () => {
    const ersteBeschriftung = m3.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    m3.setLight({ anchor: 'viewport', color: '#ffffff', intensity: 0.35, position: [1.4, 210, 40] });
    m3.addLayer({
      id: 'gebaeude-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 12.5,
      paint: {
        'fill-extrusion-color': '#fbfbfa',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.95,
      },
    }, ersteBeschriftung);
    m3.addSource('halle', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [HALLE] } } });
    m3.addLayer({ id: 'halle', type: 'fill-extrusion', source: 'halle', paint: { 'fill-extrusion-color': '#f59e0b', 'fill-extrusion-height': 14, 'fill-extrusion-opacity': 0.95 } });
    m3.addSource('kunden', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m3.addLayer({ id: 'kunden', type: 'fill-extrusion', source: 'kunden', paint: {
      'fill-extrusion-color': ['get', 'farbe'], 'fill-extrusion-height': ['get', 'hoehe'], 'fill-extrusion-opacity': 0.92 } });
    m3.addSource('routen', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    m3.addLayer({ id: 'routen-rand', type: 'line', source: 'routen', filter: ['==', ['get', 'gewaehlt'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } });
    const linienFarbe = {
      'line-color': ['case', ['get', 'gewaehlt'], '#27a849', ['==', ['get', 'art'], 'Abholung'], '#7fa3d9', '#9ccfa9'],
      'line-width': ['case', ['get', 'gewaehlt'], 5, 2.5],
      'line-opacity': ['case', ['get', 'vorbei'], 0.35, 0.95],
    };
    m3.addLayer({ id: 'routen', type: 'line', source: 'routen', filter: ['all', ['!=', ['get', 'art'], 'sped'], ['!', ['get', 'leer']]],
      layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['case', ['get', 'gewaehlt'], 2, 1] }, paint: linienFarbe });
    m3.addLayer({ id: 'routen-leer', type: 'line', source: 'routen', filter: ['all', ['!=', ['get', 'art'], 'sped'], ['get', 'leer']],
      layout: { 'line-join': 'round' }, paint: { ...linienFarbe, 'line-dasharray': [1, 1.6] } });
    m3.addLayer({ id: 'routen-sped', type: 'line', source: 'routen', filter: ['==', ['get', 'art'], 'sped'],
      paint: { 'line-color': '#c47f17', 'line-width': 2.5, 'line-dasharray': [3, 2], 'line-opacity': 0.8 } });
    for (const ebene of ['routen', 'routen-leer']) m3.on('click', ebene, (e) => { const id = e.features[0]?.properties?.tour; if (id) waehleTour(id); });
    m3.on('mouseenter', 'routen', () => { m3.getCanvas().style.cursor = 'pointer'; });
    m3.on('mouseleave', 'routen', () => { m3.getCanvas().style.cursor = ''; });
    m3Bereit = true;
    karte3dDaten();
    routenHolen();
    if (gewaehlt && kartenModus === 'einzeln') fokusTour(gewaehlt); else fokusAlle();
  });
}

// ---------- Anzeige-Modus: nur die gewählte Tour oder alle ----------
let kartenModus = 'einzeln';
function setzeKartenModus(modus) {
  kartenModus = modus;
  $('#k-alle').setAttribute('aria-pressed', String(modus === 'alle'));
  karte3dDaten();
}
const sichtbareTouren = () => (kartenModus === 'alle' ? stand.touren : stand.touren.filter((t) => t.id === gewaehlt));

// ---------- Daten: Kundenblöcke, Routen, Schilder ----------
function karte3dDaten() {
  if (!m3Bereit) return;
  const t0 = finde(stand.touren, gewaehlt);
  const ziele = new Set(t0 ? [t0.ort, t0.kombi?.ort].filter(Boolean) : []);
  const orte = new Set(sichtbareTouren().flatMap((t) => [t.ort, t.kombi?.ort].filter(Boolean)));
  m3.getSource('kunden').setData({ type: 'FeatureCollection', features: [...orte].map((id) => {
    const o = finde(ORTE, id), ziel = ziele.has(id);
    return { type: 'Feature', properties: { farbe: ziel ? '#f0626e' : '#cfe9d6', hoehe: ziel ? 60 : 30 }, geometry: { type: 'Polygon', coordinates: quadrat([o.lng, o.lat], ziel ? 260 : 180) } };
  }) });
  routenSetzen();
  // Schilder am Hof und an den Zielen der gewählten Tour
  m3Schilder.forEach((m) => m.remove());
  m3Schilder = [new maplibregl.Marker({ element: el('div', { class: 'ort-schild halle' }, 'Helmut Reiter · Hof'), anchor: 'bottom', offset: [0, -18] }).setLngLat(HALLE_MITTE).addTo(m3)];
  if (t0) {
    for (const p of phasen(t0).filter((x) => x.typ === 'laden' && x.wo !== 'hof')) {
      const o = finde(ORTE, p.wo);
      m3Schilder.push(new maplibregl.Marker({ element: el('div', { class: 'ort-schild ziel' }, `${o.name} · ${hhmm(p.von)}`), anchor: 'bottom', offset: [0, -30] }).setLngLat([o.lng, o.lat]).addTo(m3));
    }
  }
  karte3dZeit();
}
function routenSetzen() {
  const features = [];
  for (const t of sichtbareTouren()) {
    for (const p of phasen(t).filter((x) => x.typ === 'fahrt')) {
      features.push({ type: 'Feature', properties: { tour: t.id, art: t.art, gewaehlt: t.id === gewaehlt, leer: !p.ladung, vorbei: p.bis <= zeit },
        geometry: { type: 'LineString', coordinates: route(p.von_ort, p.nach) } });
    }
  }
  for (const sp of kartenModus === 'alle' ? stand.sped : []) {
    features.push({ type: 'Feature', properties: { tour: '', art: 'sped', gewaehlt: false, leer: false, vorbei: false },
      geometry: { type: 'LineString', coordinates: sp.art === 'Abholung' ? route(sp.ort, 'hof') : route('hof', sp.ort) } });
  }
  m3.getSource('routen').setData({ type: 'FeatureCollection', features });
}

// ---------- Uhrzeit: Lkw bewegen ----------
let letzteRoutenZeit = -1;
function karte3dZeit() {
  if (!m3Bereit) return;
  if (Math.abs(zeit - letzteRoutenZeit) >= 5) { routenSetzen(); letzteRoutenZeit = zeit; }
  const aktiv = new Set();
  for (const t of sichtbareTouren()) {
    const p = phaseUm(t);
    if (!p || (p.typ === 'laden' && p.wo === 'hof')) continue;
    const l = finde(LKW, t.lkw);
    const pos = p.typ === 'fahrt' ? aufLinie(route(p.von_ort, p.nach), (zeit - p.von) / (p.bis - p.von)) : [finde(ORTE, p.wo).lng, finde(ORTE, p.wo).lat];
    const klasse = 'lkw-marke' + (t.art === 'Abholung' ? ' abholung' : '') + (p.ladung ? '' : ' leer') + (t.id === gewaehlt ? ' gewaehlt' : '');
    let mk = m3Marker.get(t.id);
    if (!mk) { // äußeres Element gehört MapLibre (Positionierung), gestaltet wird das innere
      const huelle = el('div', {}, el('div', { class: klasse }, l.kz.replace('E-HR ', '')));
      huelle.addEventListener('click', (ev) => { ev.stopPropagation(); waehleTour(t.id); });
      mk = new maplibregl.Marker({ element: huelle }).setLngLat(pos).addTo(m3);
      m3Marker.set(t.id, mk);
    }
    mk.setLngLat(pos);
    const e = mk.getElement().firstChild;
    e.className = klasse;
    e.title = p.typ === 'fahrt'
      ? `${l.kz} → ${p.nach === 'hof' ? 'Hof' : finde(ORTE, p.nach).name}, an ${hhmm(p.bis)}`
      : `${l.kz}: ${p.text} bis ${hhmm(p.bis)}`;
    aktiv.add(t.id);
  }
  for (const [id, mk] of m3Marker) if (!aktiv.has(id)) { mk.remove(); m3Marker.delete(id); }
}

// ---------- Kamera ----------
function grenzenVon(koords) {
  const b = new maplibregl.LngLatBounds(koords[0], koords[0]);
  koords.forEach((c) => b.extend(c));
  return b;
}
const randDetail = () => (window.innerWidth > 900 ? { top: 90, bottom: 50, left: 50, right: 50 } : 40);
function fokusTour(id) {
  if (!m3Bereit) return;
  const t = finde(stand.touren, id);
  if (!t) return;
  const koords = phasen(t).filter((p) => p.typ === 'fahrt').flatMap((p) => route(p.von_ort, p.nach));
  m3.fitBounds(grenzenVon(koords), { padding: randDetail(), pitch: m3.getPitch() > 5 ? 55 : 0, bearing: -15, duration: 1400, maxZoom: 13 });
}
function fokusAlle() {
  if (!m3Bereit) return;
  const koords = [HALLE_MITTE, ...stand.touren.flatMap((t) => [t.ort, t.kombi?.ort].filter(Boolean).map((o) => [finde(ORTE, o).lng, finde(ORTE, o).lat]))];
  m3.fitBounds(grenzenVon(koords), { padding: randDetail(), pitch: m3.getPitch() > 5 ? 45 : 0, bearing: -12, duration: 1400 });
}
function fokusHof() {
  if (!m3Bereit) return;
  m3.flyTo({ center: HALLE_MITTE, zoom: 16.6, pitch: 62, bearing: -38, duration: 2200 });
}
function umschalten3d(an) {
  if (!m3Bereit) return;
  m3.easeTo({ pitch: an ? 55 : 0, bearing: an ? -15 : 0, duration: 900 });
}
