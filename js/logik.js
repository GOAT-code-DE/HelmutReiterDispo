'use strict';
// Rechenlogik: Speicher, Zeiten, Verfügbarkeit, Pausen und Lenkzeiten, Ladeprüfung, Kosten. Kein DOM.
// Die Beladungslogik und die Tagesplanung mit Sammeltouren stehen in beladung.js.

const SPEICHER = 'reiter-dispo-demo-v4';
let stand;            // { alleTouren, alleSped, alleAuftraege, vertraege, kunden, werkstatt, nr, kosten } + Tagessicht touren/sped
let datum = HEUTE;    // gewählter Tag
const zeit = DEMO_JETZT; // Uhrzeit der Demo in Minuten

const finde = (liste, id) => liste.find((x) => x.id === id);
const zahl = (n, d = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const euro = (n) => Math.round(n).toLocaleString('de-DE') + ' €';
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m) % 60).padStart(2, '0');
const ueberlappt = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
const fahrMinKm = (km) => Math.round(km / KMH * 60);
const ladetag = () => tagPlus(HEUTE, LADETAG_NR);

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
    alleAuftraege: [...SEED_LADETAG.map(({ tagNr, ...a }) => ({ ...a, tag: tagPlus(HEUTE, tagNr ?? LADETAG_NR) })),
      // Abholungen der erzeugten Verträge, die in den nächsten drei Wochen enden
      ...VERTRAEGE_ERZEUGT.filter((v) => v.abholen && v.bis <= 21).map((v, i) => ({ id: 'B' + (300 + i), tag: tagPlus(HEUTE, v.bis), art: 'Abholung',
        vertrag: v.id, geraet: v.geraet, ort: v.kunde, ab: 8 * 60, bis: 16 * 60 }))],
    vertraege: [...SEED_VERTRAEGE, ...VERTRAEGE_ERZEUGT].map((v) => ({ ...v, von: tagPlus(HEUTE, v.von), bis: tagPlus(HEUTE, v.bis) })),
    kunden: [],    // neu angelegte Kunden; die Beispielkunden stehen in KUNDEN
    werkstatt: [], // [{ lkw, tag }]: Lkw fällt an diesem Tag aus
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
        const ort = wahl(STAEDTE), art = zufall() < 0.55 ? 'Auslieferung' : 'Abholung';
        const bis = start + dauerEinfach(art, ort.id);
        if (bis > 17 * 60) break;
        const neu = abschnitteVon({ art, geraet: g.id, ort: ort.id, start, lkw: l.id });
        const f = FAHRER.filter((x) => !x.abwesend && darfFahren(x, l) && !pausenVerstoss([...(fahrerBelegt[x.id] || []), ...neu]))
          .sort((a, b) => FS_RANG[a.fs] - FS_RANG[b.fs])[0];
        if (!f) break;
        (fahrerBelegt[f.id] = fahrerBelegt[f.id] || []).push(...neu);
        touren.push({ id: 'T' + nr++, tag, lkw: l.id, fahrer: f.id, geraet: g.id, ort: ort.id, art, start });
        start = Math.ceil((bis + 30) / 15) * 15 + Math.floor(zufall() * 4) * 15; // nächste volle Viertelstunde
        if (zufall() < 0.5) break;
      }
    }
    if (zufall() < 0.5) {
      const g = wahl(GERAETE), ort = wahl(STAEDTE).id, art = zufall() < 0.5 ? 'Auslieferung' : 'Abholung';
      const start = 8 * 60 + Math.floor(zufall() * 16) * 15, spedition = wahl(['Spedition Nord', 'Schwerlast West']);
      const grund = wahl(['kein Lkw frei', 'kein Fahrer verfügbar']); // gleich oft würfeln wie bisher, damit die übrigen Tage gleich bleiben
      const eigen = LKW.some((l) => ladepruefung(g, l).ergebnis === 'ok'); // Schwertransport nur, wenn kein eigener Lkw das Gerät laden darf
      sped.push({ id: 'S' + nr++, tag, geraet: g.id, ort, art, start, spedition, grund: eigen ? grund : 'Schwertransport mit Genehmigung' });
    }
  }
  // Erst nach dem Würfeln filtern, damit die übrigen Tage gleich bleiben
  return { touren: [...touren.filter((t) => t.tag !== ladetag() || LADETAG_BELEGT.includes(t.lkw)),
    ...LADETAG_TOUREN.map((t) => ({ ...t, tag: ladetag() }))], sped, nr };
}
function laden() {
  try {
    const s = JSON.parse(localStorage.getItem(SPEICHER));
    const zeitOk = (x) => Number.isInteger(x.start) && x.start >= TAG_START && x.start <= 17 * 60;
    const id = (x, muster) => typeof x.id === 'string' && muster.test(x.id);
    const text = (x, max) => typeof x === 'string' && x.length <= max;
    const KUNDE_FELDER = ['id', 'firma', 'strasse', 'plz', 'stadt', 'ansprechpartner', 'telefon', 'lat', 'lng'];
    const kundeOk = (k) => k && id(k, /^K\d{2,6}$/) && Object.keys(k).length === KUNDE_FELDER.length && KUNDE_FELDER.every((f) => f in k)
      && text(k.firma, 80) && k.firma.trim() && text(k.strasse, 80) && /^\d{5}$/.test(k.plz) && text(k.stadt, 60) && text(k.ansprechpartner, 60) && text(k.telefon, 40)
      && Number.isFinite(k.lat) && Number.isFinite(k.lng) && k.lat > 47 && k.lat < 55.5 && k.lng > 5.5 && k.lng < 15.5;
    if (!s || !Array.isArray(s.kunden) || !s.kunden.every(kundeOk)) throw new Error('Kunden ungültig');
    kundenEintragen(s.kunden); // erst danach kennt finde(ORTE, …) die neuen Kunden
    const vertragOk = (v) => v && id(v, /^M\d{2,6}$/) && /^K/.test(v.kunde) && finde(ORTE, v.kunde) && finde(GERAETE, v.geraet)
      && istTag(v.von) && istTag(v.bis) && v.von <= v.bis && typeof v.abholen === 'boolean' && Object.keys(v).length === 6;
    const auftragOk = (a) => a && id(a, /^B\d{1,6}$/) && finde(GERAETE, a.geraet) && finde(ORTE, a.ort) && istTag(a.tag) && !istSonntag(a.tag)
      && Number.isInteger(a.bis) && a.bis >= TAG_START && a.bis <= TAG_ENDE
      && (a.art === 'Auslieferung' ? !('ab' in a) : a.art === 'Abholung' && Number.isInteger(a.ab) && a.ab >= TAG_START && a.ab <= a.bis)
      && (!('vertrag' in a) || typeof a.vertrag === 'string');
    const einzelOk = (t) => (t.art === 'Auslieferung' || t.art === 'Abholung') && finde(GERAETE, t.geraet) && finde(ORTE, t.ort)
      && !('stopps' in t) && !('auftraege' in t);
    const paare = (liste) => liste.map(([o, g]) => o + '|' + g).sort().join();
    const sammelOk = (t) => Array.isArray(t.stopps) && t.stopps.length >= 1 && t.stopps.length <= MAX_JE_TOUR
      && t.stopps.every((h) => h && finde(ORTE, h.ort) && (h.art === 'Auslieferung' || h.art === 'Abholung')
        && Array.isArray(h.geraete) && h.geraete.length && h.geraete.every((g) => finde(GERAETE, g)))
      && t.stopps.every((h, i) => i === 0 || h.art === 'Abholung' || t.stopps[i - 1].art === 'Auslieferung') // erst ausliefern, dann abholen
      && Array.isArray(t.auftraege) && t.auftraege.every(auftragOk) && t.auftraege.every((a) => a.tag === t.tag)
      // jedes Gerät in den Stopps hat genau einen Auftrag, sonst gingen beim Stornieren Aufträge verloren
      && paare(t.stopps.flatMap((h) => h.geraete.map((g) => [h.ort + h.art, g]))) === paare(t.auftraege.map((a) => [a.ort + a.art, a.geraet]))
      && fahrplan(t.stopps.map(({ ort, art }) => ({ ort, art })), t.auftraege, t.start, finde(LKW, t.lkw).fs !== 'B', false) !== null; // Tour geht zeitlich auf
    const tourOk = (t) => t && id(t, /^T\d{1,6}$/) && istTag(t.tag) && zeitOk(t) && finde(LKW, t.lkw) && finde(FAHRER, t.fahrer)
      && (t.art === 'Sammeltour' ? sammelOk(t) : einzelOk(t));
    const spedOk = (x) => x && id(x, /^S\d{1,6}$/) && istTag(x.tag) && zeitOk(x) && einzelOk(x) && typeof x.grund === 'string' && (!('vertrag' in x) || typeof x.vertrag === 'string');
    const kostenOk = (k) => k && Object.keys(KOSTEN_START).every((n) => Number.isFinite(k[n]) && k[n] >= 0);
    if (s && !('werkstatt' in s)) s.werkstatt = [];
    const werkstattOk = (w) => w && finde(LKW, w.lkw) && istTag(w.tag) && Object.keys(w).length === 2;
    if (Array.isArray(s.alleTouren) && Array.isArray(s.alleSped) && Array.isArray(s.alleAuftraege) && Array.isArray(s.vertraege) && s.vertraege.every(vertragOk)
      && Number.isSafeInteger(s.nr) && s.nr >= 0 && s.nr < 1e6 && kostenOk(s.kosten)
      && s.alleTouren.every(tourOk) && s.alleSped.every(spedOk) && s.alleAuftraege.every(auftragOk)
      && Array.isArray(s.werkstatt) && s.werkstatt.every(werkstattOk)) {
      // Aufträge sind entweder offen oder stecken in einer Sammeltour; jede ID nur einmal
      const ids = [...s.alleTouren, ...s.alleSped, ...s.alleAuftraege, ...s.alleTouren.flatMap((t) => t.auftraege || []), ...s.vertraege, ...s.kunden].map((x) => x.id);
      if (new Set(ids).size !== ids.length) throw new Error('doppelte IDs');
      // Zähler hinter die höchste vorhandene Nummer setzen, damit neue IDs nie kollidieren
      s.nr = Math.max(s.nr, ...ids.map((x) => Number(x.slice(1)) || 0));
      return tagesSicht(s);
    }
  } catch (e) { /* kein oder kaputter Speicher: Beispieldaten */ }
  return neuerStand();
}
function speichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(stand)); } catch (e) { /* Demo läuft auch ohne */ }
}

// ---------- Kunden ----------
// Kunden sind Orte der Planung: Name „Firma (Stadt)“, kurz die Stadt, Entfernung zum Hof per Luftlinie × Straßenfaktor
// stand.kunden enthält neue Kunden und bearbeitete Beispielkunden (gleiche ID); diese überschreiben den Eintrag.
function kundenEintragen(liste) {
  for (const k of liste) {
    const ort = { id: k.id, name: `${k.firma} (${k.stadt})`, kurz: k.stadt, km: kmZwischen(HOF, k), lat: k.lat, lng: k.lng };
    const alt = finde(ORTE, k.id);
    if (alt) Object.assign(alt, ort); else ORTE.push(ort);
  }
}
const kundeVon = (id) => finde(stand.kunden, id) || finde(KUNDEN, id);
const alleKunden = () => [...KUNDEN.map((k) => finde(stand.kunden, k.id) || k), ...stand.kunden.filter((k) => !finde(KUNDEN, k.id))];

// ---------- Strecken ----------
function kmZwischen(a, b) { // Luftlinie × Straßenfaktor
  const r = Math.PI / 180, R = 6371;
  const d = Math.acos(Math.min(1, Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r)));
  return Math.round(R * d * STRASSENFAKTOR);
}

// Eine Tour als Folge von Abschnitten: laden (am Hof oder beim Kunden), fahrt und (Sammeltour) pause.
// wo/von_ort/nach: 'hof' oder Orts-ID; ladung: Geräte-IDs auf der Ladefläche
function phasen(t) {
  if (t.stopps) return fahrplan(t.stopps.map(({ ort, art }) => ({ ort, art })), t.auftraege, t.start, finde(LKW, t.lkw).fs !== 'B', false)?.phasen || [];
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
    laden_('hof', [t.geraet], 'Beladen');
    fahrt('hof', t.ort, [t.geraet]);
    laden_(t.ort, [t.geraet], 'Abladen beim Kunden');
    fahrt(t.ort, 'hof', []);
  } else {
    fahrt('hof', t.ort, []);
    laden_(t.ort, [t.geraet], 'Aufladen beim Kunden');
    fahrt(t.ort, 'hof', [t.geraet]);
    laden_('hof', [t.geraet], 'Abladen am Hof');
  }
  return p;
}
const ende = (t) => { const p = phasen(t); return p.length ? p[p.length - 1].bis : t.start; };
const kmTour = (t) => phasen(t).filter((x) => x.typ === 'fahrt').reduce((s, x) => s + x.km, 0);
const dauerEinfach = (art, ortId) => ende({ art, ort: ortId, geraet: GERAETE[0].id, start: 0 });
function status(t, z = zeit) {
  if (t.tag && t.tag < HEUTE) return 'erledigt';   // vergangene Tage sind gefahren, künftige geplant
  if (t.tag && t.tag > HEUTE) return 'geplant';
  if (ende(t) <= z) return 'erledigt';
  return t.start <= z ? 'unterwegs' : 'geplant';
}
const ortKurz = (id) => { const o = finde(ORTE, id); return o.kurz || o.name; };
const zielText = (t) => (t.stopps ? t.stopps.map((h) => ortKurz(h.ort)).join(' → ') : ortKurz(t.ort));
const tourGeraete = (t) => (t.stopps ? t.stopps.flatMap((h) => h.geraete) : [t.geraet]).map((id) => finde(GERAETE, id));

// ---------- Verfügbarkeit ----------
const inWerkstatt = (lkwId, tag = datum) => stand.werkstatt.some((w) => w.lkw === lkwId && w.tag === tag);
function lkwFrei(lkwId, von, bis, ohne = [], tag = datum) {
  if (inWerkstatt(lkwId, tag)) return false;
  return !stand.alleTouren.some((t) => t.tag === tag && t.lkw === lkwId && !ohne.includes(t.id) && ueberlappt(von, bis, t.start, ende(t)));
}
// neu: Abschnitte der geplanten Tour; dann zählen auch Pausen und Lenkzeiten über den ganzen Tag des Fahrers
function fahrerFrei(fahrerId, von, bis, ohne = [], tag = datum, neu = null) {
  if (finde(FAHRER, fahrerId).abwesend && tag === HEUTE) return false; // heute krank
  const tagesTouren = stand.alleTouren.filter((t) => t.tag === tag && t.fahrer === fahrerId && !ohne.includes(t.id));
  if (tagesTouren.some((t) => ueberlappt(von, bis, t.start, ende(t)))) return false;
  return !neu || !pausenVerstoss([...tagesTouren.flatMap(abschnitteVon), ...neu]);
}

// ---------- Pausen und Lenkzeiten ----------
// Arbeitszeitgesetz §§ 3, 4: höchstens 10 h Arbeit am Tag, nie mehr als 6 h am Stück; Pausen insgesamt 30 min ab 6 h,
// 45 min ab 9 h, in Abschnitten von mindestens 15 min. EU-Verordnung 561/2006 für Lkw über 3,5 t: nach 4,5 h Lenkzeit
// 45 min Unterbrechung (auch 15 + 30 min). Planungsregel: höchstens 9 h Lenkzeit am Tag (10 h wären nur zweimal pro Woche
// erlaubt, das wird hier nicht genutzt). Fahrten mit Fahrzeugen bis 3,5 t zählen nicht als EU-Lenkzeit, nur als Arbeitszeit.
// Lücken entstehen im Modell nur zwischen zwei Touren am Hof oder als eingeplante Pause, nie als Warten beim Kunden;
// ab 15 min gelten sie als Pause, kürzere als Arbeitszeit.
const PAUSE = 45;
const abschnitteVon = (t) => {
  const eu = finde(LKW, t.lkw).fs !== 'B';
  return phasen(t).filter((p) => p.typ !== 'pause').map((p) => ({ von: p.von, bis: p.bis, lenk: p.typ === 'fahrt', eu }));
};
// abschnitte eines Fahrers an einem Tag: [{ von, bis, lenk, eu }]; liefert den ersten Verstoß als Text oder null
function pausenVerstoss(abschnitte) {
  let arbeit = 0, lenk = 0, block = 0, lenkBlock = 0, pausen = 0, teilpause = false, bisher = null;
  for (const s of [...abschnitte].sort((a, b) => a.von - b.von)) {
    if (bisher !== null) {
      const luecke = s.von - bisher;
      if (luecke < 0) return 'zwei Einsätze zur selben Zeit';
      if (luecke >= 15) {
        pausen += luecke; block = 0;
        if (luecke >= PAUSE || (teilpause && luecke >= 30)) { lenkBlock = 0; teilpause = false; } else teilpause = true;
      } else { arbeit += luecke; block += luecke; }
    }
    const d = s.bis - s.von;
    arbeit += d; block += d;
    if (s.lenk && s.eu) { lenk += d; lenkBlock += d; }
    if (block > 6 * 60) return 'mehr als 6 Stunden Arbeit ohne Pause';
    if (lenkBlock > 4.5 * 60) return 'mehr als 4,5 Stunden Lenkzeit ohne 45 Minuten Pause';
    bisher = s.bis;
  }
  if (arbeit > 10 * 60) return `${zahl(arbeit / 60, 1)} Stunden Arbeitszeit, erlaubt sind 10`;
  if (lenk > 9 * 60) return `${zahl(lenk / 60, 1)} Stunden Lenkzeit, geplant werden höchstens 9`;
  if (arbeit > 9 * 60 && pausen < 45) return 'bei über 9 Stunden Arbeit fehlen 45 Minuten Pause';
  if (arbeit > 6 * 60 && pausen < 30) return 'bei über 6 Stunden Arbeit fehlen 30 Minuten Pause';
  return null;
}
const darfFahren = (f, l) => FS_RANG[f.fs] >= FS_RANG[l.fs];

// ---------- Ladeprüfung ----------
// Passt das Gerät allein auf den Lkw? ergebnis: ok | genehmigung | nein. Die Regeln stehen in beladung.js;
// die Daten ändern sich nicht, darum wird das Ergebnis je Paar gemerkt.
const ladeErgebnisse = new Map();
function ladepruefung(g, l) {
  const schluessel = g.id + l.id;
  if (!ladeErgebnisse.has(schluessel)) {
    const b = beladung(l, [[g]]);
    const gruende = b.art === 'ok'
      ? [{ art: 'ok', txt: `passt · Gesamthöhe ${zahl(b.hoehe)} m · Restnutzlast ${zahl(l.nutzlast - g.gewicht, 1)} t` }]
      : b.gruende.map(({ art, txt }) => ({ art, txt }));
    ladeErgebnisse.set(schluessel, { ergebnis: b.art, gruende });
  }
  return ladeErgebnisse.get(schluessel);
}
const LADE_ABSTAND = 0.3; // Abstand zwischen zwei Geräten auf der Ladefläche in m

kundenEintragen(KUNDEN);

// ---------- Kosten (Schätzung aus den Annahmen in KOSTEN_START) ----------
function kostenSpedition(s) {
  const k = stand.kosten, g = finde(GERAETE, s.geraet), o = finde(ORTE, s.ort);
  const schwer = !LKW.some((l) => ladepruefung(g, l).ergebnis === 'ok');
  return (k.spedGrund + 2 * o.km * k.spedKm) * (schwer ? k.schwerFaktor : 1);
}
