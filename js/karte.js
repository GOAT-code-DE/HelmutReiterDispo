'use strict';
// Karte (MapLibre + OpenFreeMap): nur der Hof und die Stopps der gewählten Fahrt, nummeriert wie im Plan und im Ladeplan.
// Strecke von OSRM, ohne Verbindung als Luftlinie. Koordinaten als [lng, lat].

const HOF_PUNKT = [7.05868, 51.45590]; // Wilhelm-Beckmann-Straße 16, Essen-Kray
const STOPP_FARBEN = ['#2f6fd6', '#27a849', '#c47f17', '#8e44ad', '#d64545'];
const stoppFarbe = (k) => STOPP_FARBEN[k % STOPP_FARBEN.length];

let karte = null, karteBereit = false, karteOrte = [], karteEtappe = null, karteMarker = [];
const routen = new Map();
const punkt = (id) => (id === 'hof' ? HOF_PUNKT : [finde(ORTE, id).lng, finde(ORTE, id).lat]);
const routeVon = (a, b) => routen.get(`${a}>${b}`) || [punkt(a), punkt(b)];

function karteAufbauen() {
  if (typeof maplibregl === 'undefined') {
    $('#plan-karte').replaceChildren(el('div', { class: 'karten-fehler' }, 'Die Karte braucht eine Internetverbindung.'));
    return;
  }
  karte = new maplibregl.Map({
    container: 'plan-karte', style: 'https://tiles.openfreemap.org/styles/positron',
    center: HOF_PUNKT, zoom: 9, attributionControl: { compact: true },
  });
  karte.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
  karte.on('load', () => {
    karte.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const linie = { 'line-cap': 'round', 'line-join': 'round' };
    const aktiv = (ja, nein) => ['case', ['get', 'aktiv'], ja, nein]; // gewählte Etappe kräftig grün, die übrigen grau
    karte.addLayer({ id: 'route-rand', type: 'line', source: 'route', layout: { ...linie, 'line-sort-key': aktiv(1, 0) }, paint: { 'line-color': '#ffffff', 'line-width': aktiv(9, 6) } });
    karte.addLayer({ id: 'route', type: 'line', source: 'route', layout: { ...linie, 'line-sort-key': aktiv(1, 0) }, paint: { 'line-color': aktiv('#27a849', '#aab3bb'), 'line-width': aktiv(5, 3) } });
    karteBereit = true;
    karteZeigen(karteOrte, karteEtappe);
  });
}
// orte: Orts-IDs der Stopps in Fahrreihenfolge (leer = nur der Hof). Ein Ort mit mehreren Stopps (ausliefern und abholen)
// bekommt einen Marker mit allen Nummern. etappe: Nummer der hervorgehobenen Etappe (0 = Hof bis erster Stopp), null = ganze Fahrt.
function karteZeigen(orte, etappe = null) {
  karteOrte = orte; karteEtappe = etappe;
  if (!karteBereit) return;
  karteMarker.forEach((m) => m.remove());
  const stellen = [...new Set(orte)].map((o) => ({ o, nummern: orte.map((x, k) => (x === o ? k + 1 : 0)).filter(Boolean) }));
  karteMarker = [
    new maplibregl.Marker({ element: el('div', { class: 'karten-hof' }, 'Hof') }).setLngLat(HOF_PUNKT).addTo(karte),
    ...stellen.map(({ o, nummern }) => new maplibregl.Marker({ element: el('div', { class: 'karten-stopp', style: `background:${stoppFarbe(nummern[0] - 1)}` },
      el('b', {}, nummern.join(' · ')), ortKurz(o)) }).setLngLat(punkt(o)).addTo(karte)),
  ];
  const folge = ['hof', ...orte, 'hof'], teil = etappe === null ? folge : folge.slice(etappe, etappe + 2);
  const grenzen = new maplibregl.LngLatBounds(punkt(teil[0]), punkt(teil[0]));
  teil.forEach((o) => grenzen.extend(punkt(o)));
  karte.fitBounds(grenzen, { padding: 70, maxZoom: etappe === null ? 11 : 12, duration: 700 });
  karteLinie();
  routenHolen(['hof', ...orte, 'hof']);
}
function karteLinie() {
  const folge = ['hof', ...karteOrte, 'hof'];
  const features = karteOrte.length ? folge.slice(1).map((o, i) => ({ type: 'Feature', properties: { aktiv: karteEtappe === null || karteEtappe === i },
    geometry: { type: 'LineString', coordinates: routeVon(folge[i], o) } })) : [];
  karte.getSource('route').setData({ type: 'FeatureCollection', features });
}
async function routenHolen(folge) {
  let neu = false;
  for (let i = 1; i < folge.length; i++) {
    const schluessel = `${folge[i - 1]}>${folge[i]}`;
    if (routen.has(schluessel)) continue;
    const a = punkt(folge[i - 1]), b = punkt(folge[i]);
    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson`);
      if (!res.ok) continue;
      const c = (await res.json())?.routes?.[0]?.geometry?.coordinates;
      if (Array.isArray(c) && c.length > 1 && c.every((x) => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]))) {
        routen.set(schluessel, c);
        neu = true;
      }
    } catch (e) { /* Routendienst nicht erreichbar: Luftlinie bleibt */ }
  }
  if (neu && karteBereit) karteLinie();
}
