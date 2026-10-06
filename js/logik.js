'use strict';
// Rechenlogik: Zeiten, Ladeprüfung, Verfügbarkeit, Kombi-Touren, Kosten. Kein DOM.

const SPEICHER = 'reiter-dispo-demo-v3';
let stand;            // { alleTouren, alleSped, nr, kosten } + Tagessicht touren/sped
let datum = HEUTE;    // gewählter Tag
let zeit = DEMO_JETZT; // aktuelle (abgespielte) Uhrzeit in Minuten

const finde = (liste, id) => liste.find((x) => x.id === id);
const zahl = (n, d = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const euro = (n) => Math.round(n).toLocaleString('de-DE') + ' €';
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m) % 60).padStart(2, '0');
const ueberlappt = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
const fahrMinKm = (km) => Math.round(km / KMH * 60);

// ---------- Speicher ----------
// stand.touren und stand.sped zeigen nur den gewählten Tag; gespeichert wird alles in alleTouren/alleSped
function tagesSicht(s) {
  const sicht = (feld) => ({
    configurable: true, enumerable: false,
    get: () => s[feld].filter((x) => x.tag === datum),
    set: (liste) => { liste.forEach((x) => { if (!x.tag) x.tag = datum; }); s[feld] = [...s[feld].filter((x) => x.tag !== datum), ...liste]; },
  });
  Object.defineProperty(s, 'touren', sicht('alleTouren'));
  Object.defineProperty(s, 'sped', sicht('alleSped'));
  return s;
}
function neuerStand() {
  const b = beispielTage();
  return tagesSicht({
    alleTouren: [...structuredClone(SEED_TOUREN).map((t) => ({ ...t, tag: HEUTE })), ...b.touren],
    alleSped: [...structuredClone(SEED_SPED).map((x) => ({ ...x, tag: HEUTE })), ...b.sped],
    nr: b.nr, kosten: { ...KOSTEN_START },
  });
}
// Beispieltouren von einer Woche zurück bis drei Wochen voraus, nah voller, fern lichter (fester Zufall)
function beispielTage() {
  let saat = 20261006;
  const zufall = () => { saat = (saat * 1103515245 + 12345) % 2147483648; return saat / 2147483648; };
  const wahl = (liste) => liste[Math.floor(zufall() * liste.length)];
  const touren = [], sped = [];
  let nr = 1000;
  for (let tagNr = -7; tagNr <= 21; tagNr++) {
    const tag = tagPlus(HEUTE, tagNr);
    if (tagNr === 0 || wochentag(tag) === 0 || wochentag(tag) === 6) continue;
    const dichte = tagNr < 0 ? 0.75 : tagNr <= 4 ? 0.7 : tagNr <= 11 ? 0.45 : 0.25;
    const fahrerBelegt = {};
    for (const l of LKW) {
      if (zufall() > dichte) continue;
      let start = 7 * 60 + Math.floor(zufall() * 12) * 15;
      for (let k = 0; k < 2; k++) {
        const g = wahl(GERAETE.filter((x) => ladepruefung(x, l).ergebnis === 'ok'));
        if (!g) break;
        const ort = wahl(ORTE), art = zufall() < 0.55 ? 'Auslieferung' : 'Abholung';
        const bis = start + dauerEinfach(art, ort.id);
        if (bis > 17 * 60) break;
        const f = FAHRER.filter((x) => !x.abwesend && darfFahren(x, l) && !(fahrerBelegt[x.id] || []).some(([a, b]) => ueberlappt(start, bis, a, b)))
          .sort((a, b) => FS_RANG[a.fs] - FS_RANG[b.fs])[0];
        if (!f) break;
        (fahrerBelegt[f.id] = fahrerBelegt[f.id] || []).push([start, bis]);
        touren.push({ id: 'T' + nr++, tag, lkw: l.id, fahrer: f.id, geraet: g.id, ort: ort.id, art, start });
        start = Math.ceil((bis + 30) / 15) * 15 + Math.floor(zufall() * 4) * 15; // nächste volle Viertelstunde
        if (zufall() < 0.5) break;
      }
    }
    if (zufall() < 0.5) {
      sped.push({ id: 'S' + nr++, tag, geraet: wahl(GERAETE).id, ort: wahl(ORTE).id, art: zufall() < 0.5 ? 'Auslieferung' : 'Abholung',
        start: 8 * 60 + Math.floor(zufall() * 16) * 15, spedition: wahl(['Spedition Nord', 'Schwerlast West']),
        grund: wahl(['kein Lkw frei', 'kein Fahrer verfügbar', 'Überbreite, Schwertransport mit Genehmigung']) });
    }
  }
  return { touren, sped, nr };
}
function laden() {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER));
    const zeitOk = (x) => Number.isInteger(x.start) && x.start >= TAG_START && x.start <= 17 * 60;
    const auftragOk = (x) => x && typeof x.id === 'string' && /^[TS]\d{1,6}$/.test(x.id) && finde(GERAETE, x.geraet) && finde(ORTE, x.ort) && zeitOk(x)
      && (x.art === 'Auslieferung' || x.art === 'Abholung');
    const kombiOk = (t) => !t.kombi || (finde(GERAETE, t.kombi.geraet) && finde(ORTE, t.kombi.ort) && t.art === 'Auslieferung');
    const kostenOk = (k) => k && Object.keys(KOSTEN_START).every((n) => Number.isFinite(k[n]) && k[n] >= 0);
    if (s && Array.isArray(s.alleTouren) && Array.isArray(s.alleSped) && Number.isSafeInteger(s.nr) && s.nr >= 0 && s.nr < 1e6 && kostenOk(s.kosten)
      && s.alleTouren.every((t) => auftragOk(t) && istTag(t.tag) && kombiOk(t) && finde(LKW, t.lkw) && finde(FAHRER, t.fahrer))
      && s.alleSped.every((x) => auftragOk(x) && istTag(x.tag) && !('kombi' in x) && typeof x.grund === 'string')) {
      const ids = [...s.alleTouren, ...s.alleSped].map((x) => x.id);
      if (new Set(ids).size !== ids.length) throw new Error('doppelte IDs');
      // Zähler hinter die höchste vorhandene Nummer setzen, damit neue IDs nie kollidieren
      s.nr = Math.max(s.nr, ...ids.map((id) => Number(id.slice(1)) || 0));
      return tagesSicht(s);
    }
  } catch (e) { /* kein oder kaputter Speicher: Beispieldaten */ }
  return neuerStand();
}
function speichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(stand)); } catch (e) { /* Demo läuft auch ohne */ }
}

// ---------- Strecken ----------
function kmZwischen(a, b) { // Luftlinie × Straßenfaktor
  const r = Math.PI / 180, R = 6371;
  const d = Math.acos(Math.min(1, Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r)));
  return Math.round(R * d * STRASSENFAKTOR);
}

// Eine Tour als Folge von Abschnitten: laden (am Hof oder beim Kunden) und fahrt.
// wo/von/nach: 'hof' oder Orts-ID; ladung: Geräte-ID auf der Ladefläche oder null
function phasen(t) {
  const p = [];
  let z = t.start;
  const laden_ = (wo, ladung, text) => { p.push({ typ: 'laden', wo, ladung, text, von: z, bis: z + LADEN_MIN }); z += LADEN_MIN; };
  const fahrt = (von, nach, ladung) => {
    const km = von === 'hof' ? finde(ORTE, nach).km : nach === 'hof' ? finde(ORTE, von).km : kmZwischen(finde(ORTE, von), finde(ORTE, nach));
    const dauer = fahrMinKm(km);
    p.push({ typ: 'fahrt', von_ort: von, nach, ladung, km, von: z, bis: z + dauer });
    z += dauer;
  };
  if (t.art === 'Auslieferung') {
    laden_('hof', t.geraet, 'Beladen');
    fahrt('hof', t.ort, t.geraet);
    laden_(t.ort, t.geraet, 'Abladen beim Kunden');
    if (t.kombi) {
      fahrt(t.ort, t.kombi.ort, null);
      laden_(t.kombi.ort, t.kombi.geraet, 'Aufladen beim Kunden');
      fahrt(t.kombi.ort, 'hof', t.kombi.geraet);
      laden_('hof', t.kombi.geraet, 'Abladen am Hof');
    } else {
      fahrt(t.ort, 'hof', null);
    }
  } else {
    fahrt('hof', t.ort, null);
    laden_(t.ort, t.geraet, 'Aufladen beim Kunden');
    fahrt(t.ort, 'hof', t.geraet);
    laden_('hof', t.geraet, 'Abladen am Hof');
  }
  return p;
}
const ende = (t) => { const p = phasen(t); return p[p.length - 1].bis; };
const kmTour = (t) => phasen(t).filter((x) => x.typ === 'fahrt').reduce((s, x) => s + x.km, 0);
const dauerEinfach = (art, ortId) => ende({ art, ort: ortId, geraet: GERAETE[0].id, start: 0 });
function status(t, z = zeit) {
  if (t.tag && t.tag < HEUTE) return 'erledigt';   // vergangene Tage sind gefahren, künftige geplant
  if (t.tag && t.tag > HEUTE) return 'geplant';
  if (ende(t) <= z) return 'erledigt';
  return t.start <= z ? 'unterwegs' : 'geplant';
}
const phaseUm = (t, z = zeit) => (t.tag && t.tag !== HEUTE ? null : phasen(t).find((x) => x.von <= z && z < x.bis) || null);
const zielText = (t) => finde(ORTE, t.ort).name + (t.kombi ? ' + ' + finde(ORTE, t.kombi.ort).name : '');

// ---------- Verfügbarkeit ----------
function lkwFrei(lkwId, von, bis, ohne = [], tag = datum) {
  return !stand.alleTouren.some((t) => t.tag === tag && t.lkw === lkwId && !ohne.includes(t.id) && ueberlappt(von, bis, t.start, ende(t)));
}
function fahrerFrei(fahrerId, von, bis, ohne = [], tag = datum) {
  if (finde(FAHRER, fahrerId).abwesend && tag === HEUTE) return false; // heute krank
  return !stand.alleTouren.some((t) => t.tag === tag && t.fahrer === fahrerId && !ohne.includes(t.id) && ueberlappt(von, bis, t.start, ende(t)));
}
const darfFahren = (f, l) => FS_RANG[f.fs] >= FS_RANG[l.fs];

// ---------- Ladeprüfung ----------
// Passt das Gerät auf den Lkw? ergebnis: ok | genehmigung | nein
function ladepruefung(g, l) {
  const gruende = [];
  let ergebnis = 'ok';
  const nein = (txt) => { gruende.push({ art: 'nein', txt }); ergebnis = 'nein'; };
  const gen = (txt) => { gruende.push({ art: 'genehmigung', txt }); if (ergebnis === 'ok') ergebnis = 'genehmigung'; };
  if (g.gewicht > l.nutzlast) nein(`zu schwer: ${zahl(g.gewicht, 1)} t > ${zahl(l.nutzlast, 1)} t Nutzlast`);
  if (g.l > l.laenge) nein(`zu lang: ${zahl(g.l)} m > ${zahl(l.laenge)} m Ladefläche`);
  if (g.b > MAX_BREITE) {
    if (l.breite < MAX_BREITE) nein(`zu breit: ${zahl(g.b)} m > ${zahl(l.breite)} m Ladefläche`);
    else gen(`Überbreite: ${zahl(g.b)} m > ${zahl(MAX_BREITE)} m erlaubt`);
  } else if (g.b > l.breite) {
    nein(`zu breit: ${zahl(g.b)} m > ${zahl(l.breite)} m Ladefläche`);
  }
  const gesamt = l.ladehoehe + g.h;
  if (gesamt > MAX_HOEHE) gen(`Gesamthöhe ${zahl(gesamt)} m > ${zahl(MAX_HOEHE)} m erlaubt`);
  if (ergebnis === 'ok') gruende.push({ art: 'ok', txt: `passt · Gesamthöhe ${zahl(gesamt)} m · Restnutzlast ${zahl(l.nutzlast - g.gewicht, 1)} t` });
  return { ergebnis, gruende };
}

// Mehrere Geräte zugleich (3D-Ladeplan): hintereinander auf der Ladefläche, 0,3 m Abstand
const LADE_ABSTAND = 0.3;
function ladeplan(lkw, geraete) {
  let x = 0;
  const plaetze = geraete.map((g) => { const p = { g, x, ueberhang: x + g.l > lkw.laenge }; x += g.l + LADE_ABSTAND; return p; });
  const laenge = Math.max(0, x - LADE_ABSTAND);
  const gewicht = geraete.reduce((s, g) => s + g.gewicht, 0);
  const hoehe = geraete.reduce((m, g) => Math.max(m, lkw.ladehoehe + g.h), lkw.ladehoehe);
  const breite = geraete.reduce((m, g) => Math.max(m, g.b), 0);
  const probleme = [];
  if (gewicht > lkw.nutzlast) probleme.push({ art: 'nein', txt: `zu schwer: ${zahl(gewicht, 1)} t > ${zahl(lkw.nutzlast, 1)} t Nutzlast` });
  if (laenge > lkw.laenge) probleme.push({ art: 'nein', txt: `zu lang: ${zahl(laenge)} m > ${zahl(lkw.laenge)} m Ladefläche` });
  if (breite > lkw.breite && breite <= MAX_BREITE) probleme.push({ art: 'nein', txt: `zu breit: ${zahl(breite)} m > ${zahl(lkw.breite)} m Ladefläche` });
  if (breite > MAX_BREITE) probleme.push({ art: lkw.breite >= MAX_BREITE ? 'genehmigung' : 'nein', txt: `Überbreite: ${zahl(breite)} m > ${zahl(MAX_BREITE)} m` });
  if (hoehe > MAX_HOEHE) probleme.push({ art: 'genehmigung', txt: `Gesamthöhe ${zahl(hoehe)} m > ${zahl(MAX_HOEHE)} m` });
  return { plaetze, laenge, gewicht, hoehe, breite, probleme };
}

function kandidaten(art, geraetId, ortId, start, tag = datum) {
  const g = finde(GERAETE, geraetId);
  const bis = start + dauerEinfach(art, ortId);
  return LKW.map((l) => ({
    lkw: l,
    pruefung: ladepruefung(g, l),
    frei: lkwFrei(l.id, start, bis, [], tag),
    // kleinster ausreichender Führerschein zuerst, damit CE-Fahrer für Sattelzüge frei bleiben
    fahrer: FAHRER.filter((f) => darfFahren(f, l) && fahrerFrei(f.id, start, bis, [], tag)).sort((a, b) => FS_RANG[a.fs] - FS_RANG[b.fs]),
  }));
}
// Hätte ein eigener Lkw ohne Genehmigung fahren können?
function interneAlternative(a) {
  if (a.start + dauerEinfach(a.art, a.ort) > TAG_ENDE) return null; // intern nicht mehr am selben Tag machbar
  return kandidaten(a.art, a.geraet, a.ort, a.start, a.tag || datum)
    .find((k) => k.pruefung.ergebnis === 'ok' && k.frei && k.fahrer.length) || null;
}

// Alle Speditionsaufträge zugleich: jeder freie Lkw und Fahrer zählt nur für einen Auftrag.
// Liefert Map Spedition-ID → Alternative (oder null).
function alternativenZuweisen() {
  const ergebnis = new Map();
  const reserviert = [];
  try {
    for (const sp of [...stand.sped].sort((a, b) => a.start - b.start)) {
      const alt = interneAlternative(sp);
      ergebnis.set(sp.id, alt);
      if (alt) { // vorläufig belegen, damit der nächste Auftrag ihn nicht auch bekommt
        const platzhalter = { ...sp, id: '_res' + sp.id, tag: sp.tag || datum, lkw: alt.lkw.id, fahrer: alt.fahrer[0].id };
        stand.alleTouren.push(platzhalter);
        reserviert.push(platzhalter);
      }
    }
  } finally { // nur die eigenen Platzhalter-Objekte entfernen, nie echte Touren mit gleicher ID
    stand.alleTouren = stand.alleTouren.filter((t) => !reserviert.includes(t));
  }
  return ergebnis;
}

// ---------- Kombi-Touren gegen Leerfahrten ----------
// Auslieferung A + Abholung B: nach dem Abladen bei A direkt zu B, statt leer heimzufahren.
const ABHOLFENSTER = 120; // Abholung darf sich um höchstens so viele Minuten verschieben
function kombiVorschlaege() {
  const liste = [];
  const offen = stand.touren.filter((t) => status(t) === 'geplant' && !t.id.startsWith('_')); // nur Geplantes, keine Platzhalter
  for (const a of offen) {
    if (a.art !== 'Auslieferung' || a.kombi) continue;
    const lkwA = finde(LKW, a.lkw);
    for (const b of offen) {
      if (b.art !== 'Abholung' || b.id === a.id) continue;
      if (ladepruefung(finde(GERAETE, b.geraet), lkwA).ergebnis !== 'ok') continue;
      const kombi = { ...a, kombi: { geraet: b.geraet, ort: b.ort, von: b.id } };
      const kmVorher = kmTour(a) + kmTour(b), kmNachher = kmTour(kombi);
      if (kmVorher - kmNachher < 20) continue;
      const p = phasen(kombi), bis = p[p.length - 1].bis;
      if (bis > TAG_ENDE) continue;
      // das Aufladen ist immer der letzte Halt beim Kunden, auch wenn Liefer- und Abholort gleich sind
      const abholNeu = p.filter((x) => x.typ === 'laden' && x.wo === b.ort).pop().von;
      const abholAlt = b.start + fahrMinKm(finde(ORTE, b.ort).km);
      if (Math.abs(abholNeu - abholAlt) > ABHOLFENSTER) continue;
      const ohne = [a.id, b.id];
      if (!lkwFrei(a.lkw, a.start, bis, ohne) || !fahrerFrei(a.fahrer, a.start, bis, ohne)) continue;
      const sparKm = kmVorher - kmNachher;
      const sparEuro = kostenIntern(a) + kostenIntern(b) - kostenIntern(kombi);
      if (sparEuro <= 0) continue;
      liste.push({ a, b, kmVorher, kmNachher, sparKm, sparEuro, abholNeu, abholAlt, bis });
    }
  }
  // Jede Tour nur in einem Vorschlag, der beste zuerst
  const vergeben = new Set();
  return liste.sort((x, y) => y.sparEuro - x.sparEuro).filter((v) => {
    if (vergeben.has(v.a.id) || vergeben.has(v.b.id)) return false;
    vergeben.add(v.a.id); vergeben.add(v.b.id);
    return true;
  });
}
function kombiUebernehmen(aId, bId) {
  const a = finde(stand.touren, aId), b = finde(stand.touren, bId);
  if (!a || !b) return false;
  const v = kombiVorschlaege().find((x) => x.a.id === aId && x.b.id === bId);
  if (!v) return false; // inzwischen nicht mehr gültig
  a.kombi = { geraet: b.geraet, ort: b.ort, von: b.id };
  stand.touren = stand.touren.filter((t) => t.id !== bId);
  speichern();
  return true;
}

// ---------- Kosten ----------
function kostenIntern(t) {
  const l = finde(LKW, t.lkw);
  return kmTour(t) * l.kmSatz + (ende(t) - t.start) / 60 * stand.kosten.fahrerStunde;
}
function kostenSpedition(s) {
  const k = stand.kosten, g = finde(GERAETE, s.geraet), o = finde(ORTE, s.ort);
  const schwer = !LKW.some((l) => ladepruefung(g, l).ergebnis === 'ok');
  return (k.spedGrund + 2 * o.km * k.spedKm) * (schwer ? k.schwerFaktor : 1);
}
function kostenAlternative(s, alt) { // interne Kosten, wenn der freie eigene Lkw gefahren wäre
  return kostenIntern({ ...s, lkw: alt.lkw.id, fahrer: alt.fahrer[0].id });
}
function leerKm() {
  return stand.touren.reduce((s, t) => s + phasen(t).filter((x) => x.typ === 'fahrt' && !x.ladung).reduce((a, x) => a + x.km, 0), 0);
}
