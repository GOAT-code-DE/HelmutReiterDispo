'use strict';
// Rechenlogik: Zeiten, Ladeprüfung, Verfügbarkeit, Kombi-Touren, Kosten. Kein DOM.

const SPEICHER = 'reiter-dispo-demo-v2';
let stand;            // { touren, sped, nr, kosten }
let zeit = DEMO_JETZT; // aktuelle (abgespielte) Uhrzeit in Minuten

const finde = (liste, id) => liste.find((x) => x.id === id);
const zahl = (n, d = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const euro = (n) => Math.round(n).toLocaleString('de-DE') + ' €';
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m) % 60).padStart(2, '0');
const ueberlappt = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
const fahrMinKm = (km) => Math.round(km / KMH * 60);

// ---------- Speicher ----------
function neuerStand() {
  return { touren: structuredClone(SEED_TOUREN), sped: structuredClone(SEED_SPED), nr: 100, kosten: { ...KOSTEN_START } };
}
function laden() {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER));
    const zeitOk = (x) => Number.isInteger(x.start) && x.start >= TAG_START && x.start <= 17 * 60;
    const auftragOk = (x) => x && typeof x.id === 'string' && /^[TS]\d{1,6}$/.test(x.id) && finde(GERAETE, x.geraet) && finde(ORTE, x.ort) && zeitOk(x)
      && (x.art === 'Auslieferung' || x.art === 'Abholung');
    const kombiOk = (t) => !t.kombi || (finde(GERAETE, t.kombi.geraet) && finde(ORTE, t.kombi.ort) && t.art === 'Auslieferung');
    const kostenOk = (k) => k && Object.keys(KOSTEN_START).every((n) => Number.isFinite(k[n]) && k[n] >= 0);
    if (s && Array.isArray(s.touren) && Array.isArray(s.sped) && Number.isSafeInteger(s.nr) && s.nr >= 0 && s.nr < 1e6 && kostenOk(s.kosten)
      && s.touren.every((t) => auftragOk(t) && kombiOk(t) && finde(LKW, t.lkw) && finde(FAHRER, t.fahrer))
      && s.sped.every((x) => auftragOk(x) && !('kombi' in x) && typeof x.grund === 'string')) {
      const ids = [...s.touren, ...s.sped].map((x) => x.id);
      if (new Set(ids).size !== ids.length) throw new Error('doppelte IDs');
      // Zähler hinter die höchste vorhandene Nummer setzen, damit neue IDs nie kollidieren
      s.nr = Math.max(s.nr, ...ids.map((id) => Number(id.slice(1)) || 0));
      return s;
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
  if (ende(t) <= z) return 'erledigt';
  return t.start <= z ? 'unterwegs' : 'geplant';
}
const phaseUm = (t, z = zeit) => phasen(t).find((x) => x.von <= z && z < x.bis) || null;
const zielText = (t) => finde(ORTE, t.ort).name + (t.kombi ? ' + ' + finde(ORTE, t.kombi.ort).name : '');

// ---------- Verfügbarkeit ----------
function lkwFrei(lkwId, von, bis, ohne = []) {
  return !stand.touren.some((t) => t.lkw === lkwId && !ohne.includes(t.id) && ueberlappt(von, bis, t.start, ende(t)));
}
function fahrerFrei(fahrerId, von, bis, ohne = []) {
  if (finde(FAHRER, fahrerId).abwesend) return false;
  return !stand.touren.some((t) => t.fahrer === fahrerId && !ohne.includes(t.id) && ueberlappt(von, bis, t.start, ende(t)));
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

function kandidaten(art, geraetId, ortId, start) {
  const g = finde(GERAETE, geraetId);
  const bis = start + dauerEinfach(art, ortId);
  return LKW.map((l) => ({
    lkw: l,
    pruefung: ladepruefung(g, l),
    frei: lkwFrei(l.id, start, bis),
    // kleinster ausreichender Führerschein zuerst, damit CE-Fahrer für Sattelzüge frei bleiben
    fahrer: FAHRER.filter((f) => darfFahren(f, l) && fahrerFrei(f.id, start, bis)).sort((a, b) => FS_RANG[a.fs] - FS_RANG[b.fs]),
  }));
}
// Hätte ein eigener Lkw ohne Genehmigung fahren können?
function interneAlternative(a) {
  if (a.start + dauerEinfach(a.art, a.ort) > TAG_ENDE) return null; // intern nicht mehr am selben Tag machbar
  return kandidaten(a.art, a.geraet, a.ort, a.start)
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
        const platzhalter = { ...sp, id: '_res' + sp.id, lkw: alt.lkw.id, fahrer: alt.fahrer[0].id };
        stand.touren.push(platzhalter);
        reserviert.push(platzhalter);
      }
    }
  } finally { // nur die eigenen Platzhalter-Objekte entfernen, nie echte Touren mit gleicher ID
    stand.touren = stand.touren.filter((t) => !reserviert.includes(t));
  }
  return ergebnis;
}

// ---------- Kombi-Touren gegen Leerfahrten ----------
// Auslieferung A + Abholung B: nach dem Abladen bei A direkt zu B, statt leer heimzufahren.
const ABHOLFENSTER = 120; // Abholung darf sich um höchstens so viele Minuten verschieben
function kombiVorschlaege() {
  const liste = [];
  const offen = stand.touren.filter((t) => t.start > zeit); // nur, was noch nicht losgefahren ist
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
