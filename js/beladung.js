'use strict';
// Beladungslogik: Passt eine Gerätegruppe auf einen Lkw (Zonen, Zurrpunkte, Rampe, Achslast, Ladereihenfolge)?
// Und: Wie verteilt man die Geräte eines Tages als Sammeltouren auf die eigenen Lkw? Kein DOM.
// Vereinfachungen (siehe daten.js): Geräte stehen hintereinander, nie nebeneinander, mit der Vorderkante zum Fahrerhaus.

const RASTER = 0.1;                   // Stellungen auf der Ladefläche in 10-cm-Schritten
const ZURR_VON = 0.2, ZURR_BIS = 1.5; // Kette schräg nach vorn bzw. hinten: Zurrpunkt 0,2–1,5 m vor bzw. hinter dem Anschlagpunkt
const ZURR_ANTEIL = 0.5;              // Annahme: jeder genutzte Zurrpunkt hält etwa das halbe Gerätegewicht (im Workshop mit den geltenden Vorgaben abgleichen)
const LADEN_JE_GERAET = 15;           // Minuten je Gerät beim Beladen am Hof und Abladen beim Kunden
const TOUR_START = 7 * 60;            // Sammeltouren beginnen um 7 Uhr mit dem Beladen
const MAX_JE_TOUR = 5;
const SUCHGRENZE = 20000;             // Stellungen je Prüfung; danach gilt die Anordnung als nicht gefunden
const REGELN_ANZAHL = 9;              // Gewicht, Breite, Steigung, Kante bzw. Ladebordwand, Länge, Höhe, Zurrpunkte, Achslast, Reihenfolge

const grad = (w) => w * Math.PI / 180;
const prozent = (w) => Math.tan(grad(w)) * 100;
const summe = (liste, f) => liste.reduce((s, x) => s + f(x), 0);
const belegteLaenge = (geraete) => summe(geraete, (g) => g.l) + LADE_ABSTAND * Math.max(0, geraete.length - 1);

// ---------- Ein Gerät, egal wo es steht ----------
// Liefert [{ regel, art: 'nein' | 'genehmigung', txt }]
function geraetHindernisse(g, l) {
  const h = [], nein = (regel, txt) => h.push({ regel, art: 'nein', txt });
  if (g.gewicht > l.nutzlast) nein('gewicht', `${g.kurz} zu schwer: ${zahl(g.gewicht, 1)} t > ${zahl(l.nutzlast, 1)} t Nutzlast`);
  if (g.b > MAX_BREITE) h.push({ regel: 'breite', art: l.nutzbreite >= MAX_BREITE ? 'genehmigung' : 'nein', txt: `${g.kurz} Überbreite: ${zahl(g.b)} m > ${zahl(MAX_BREITE)} m` });
  else if (g.b > l.nutzbreite) nein('breite', `${g.kurz} zu breit: ${zahl(g.b)} m > ${zahl(l.nutzbreite)} m zwischen Bordwänden bzw. Rungen`);
  const kette = g.gewicht * ZURR_ANTEIL;
  if (kette > l.zurrLast) nein('zurr', `${g.kurz}: Zurrpunkte halten je ${zahl(l.zurrLast, 1)} t, nötig sind ${zahl(kette, 1)} t`);
  const r = l.rampe;
  if (r.art === 'rampe') {
    if (g.steig < prozent(r.winkel)) nein('steigung', `${g.kurz} kommt die Rampe nicht hoch: ${Math.round(prozent(r.winkel))} % Steigung, Gerät schafft ${g.steig} %`);
    const noetig = g.radstand / 2 * Math.tan(grad(r.knick / 2));
    if (g.boden < noetig) nein('kante', `${g.kurz} setzt an der Rampenkante auf: ${Math.round(g.boden * 100)} cm Bodenfreiheit, nötig ${Math.ceil(noetig * 100)} cm`);
  } else if (g.gewicht > r.traglast) {
    nein('ladebordwand', `${g.kurz} zu schwer für die Ladebordwand: ${zahl(g.gewicht)} t > ${zahl(r.traglast)} t`);
  } else if (g.l > r.laenge) {
    nein('ladebordwand', `${g.kurz} zu lang für die Ladebordwand: ${zahl(g.l)} m > ${zahl(r.laenge)} m`);
  }
  return h;
}

// ---------- Stellungen auf der Ladefläche ----------
// Anfang und Ende der Zone, in der ein Gerät mit Vorderkante x steht. Ketten laufen nie über eine Stufe:
// nur Zurrpunkte derselben Zone zählen.
function zonenGrenzen(l, x) {
  let a = 0;
  for (const z of l.zonen) { if (x < a + z.laenge - 1e-6) return [a, a + z.laenge]; a += z.laenge; }
  return [a - l.zonen[l.zonen.length - 1].laenge, a];
}
const zurrInZone = (l, x) => { const [a, b] = zonenGrenzen(l, x); return l.zurr.filter((p) => p >= a - 1e-9 && p <= b + 1e-9); };
function zurrLuecke(g, l, x) { // null, wenn vorn und hinten ein Zurrpunkt erreichbar ist; sonst der Bereich, in dem einer fehlt
  const v = x + g.anschlag[0], h = x + g.anschlag[1], punkte = zurrInZone(l, x);
  if (!punkte.some((p) => p >= v - ZURR_BIS && p <= v - ZURR_VON)) return { seite: 'vor', von: v - ZURR_BIS, bis: v - ZURR_VON };
  if (!punkte.some((p) => p >= h + ZURR_VON && p <= h + ZURR_BIS)) return { seite: 'hinter', von: h + ZURR_VON, bis: h + ZURR_BIS };
  return null;
}
// Mögliche Vorderkanten x (m ab Vorderkante Ladefläche), das Gerät ganz in einer Zone, aufsteigend
function stellungenFuer(g, l, mitZurr, mitHoehe) {
  const liste = [];
  let z0 = 0;
  for (const z of l.zonen) {
    if (!mitHoehe || z.hoehe + g.h <= MAX_HOEHE) {
      for (let k = Math.round(z0 / RASTER); k * RASTER + g.l <= z0 + z.laenge + 1e-9; k++) {
        const x = Math.round(k * RASTER * 100) / 100;
        if (!mitZurr || !zurrLuecke(g, l, x)) liste.push({ x, zone: z });
      }
    }
    z0 += z.laenge;
  }
  return liste;
}
function achslasten(l, plaetze) { // zusätzliche Last vorn und hinten in t (Hebelgesetz)
  const a = l.achsen;
  const hinten = summe(plaetze, (p) => p.g.gewicht * (p.x + p.g.schwerpunkt - a.vorn.x)) / (a.hinten.x - a.vorn.x);
  return { vorn: summe(plaetze, (p) => p.g.gewicht) - hinten, hinten };
}
// Erlaubter Bereich für Σ Gewicht × Schwerpunktlage bei Gesamtgewicht w, damit keine Achse überladen ist
function achsFenster(l, w) {
  const a = l.achsen, hebel = a.hinten.x - a.vorn.x;
  return [a.vorn.x * w + hebel * (w - a.vorn.frei), a.vorn.x * w + hebel * a.hinten.frei];
}

// Stellungen für eine feste Folge von vorn nach hinten: [{ g, stopp }]. abschnitte = Gerätezahl vorn, die nach jedem
// Abladen übrig bleibt (Achslast auch dann prüfen). Tiefensuche, die Achslast-Grenzen schneiden früh ab.
function stellen(l, folge, r, abschnitte, zaehler) {
  const n = folge.length;
  const st = folge.map((f, i) => stellungenFuer(f.g, l, r.zurr && r.zurrAus !== f.g.id, r.hoehe));
  if (st.some((s) => !s.length)) return null;
  // Am weitesten hinten gepackt (von hinten nach vorn): größte mögliche Vorderkante je Gerät und Σ Gewicht × Schwerpunkt dahinter
  const rechts = new Array(n + 1).fill(null);
  rechts[n] = { x: Infinity, s: 0 };
  for (let i = n - 1; i >= 0; i--) {
    if (!rechts[i + 1]) break;
    const g = folge[i].g, grenze = rechts[i + 1].x - LADE_ABSTAND;
    const s = st[i].findLast((p) => p.x + g.l <= grenze + 1e-9);
    if (!s) break;
    rechts[i] = { x: s.x, s: rechts[i + 1].s + g.gewicht * (s.x + g.schwerpunkt) };
  }
  if (!rechts[0]) return null;
  // Am weitesten vorn gepackt ab Gerät i und Mindestkante m: kleinste Σ Gewicht × Schwerpunkt
  const links = (i, m) => {
    let s = 0;
    for (let j = i; j < n; j++) {
      const p = st[j].find((q) => q.x >= m - 1e-9);
      if (!p) return Infinity;
      s += folge[j].g.gewicht * (p.x + folge[j].g.schwerpunkt);
      m = p.x + folge[j].g.l + LADE_ABSTAND;
    }
    return s;
  };
  const gesamt = summe(folge, (f) => f.g.gewicht);
  const [smin, smax] = achsFenster(l, gesamt);
  const wahl = new Array(n);
  let knoten = 0;
  const tief = (i, m, s, w) => {
    for (const p of st[i]) {
      if (p.x < m - 1e-9) continue;
      if (++knoten > SUCHGRENZE) { zaehler.abbruch = true; return false; }
      const g = folge[i].g, s2 = s + g.gewicht * (p.x + g.schwerpunkt), w2 = w + g.gewicht;
      wahl[i] = p;
      if (i === n - 1) {
        if (!r.achse || (s2 >= smin - 1e-9 && s2 <= smax + 1e-9)) return true;
        if (s2 > smax) return false; // weiter hinten wird es nur schwerer
        continue;
      }
      if (r.achse && r.entladen && abschnitte.includes(i + 1)) { // nach dem Abladen der Geräte dahinter
        const [lo, hi] = achsFenster(l, w2);
        if (s2 < lo - 1e-9 || s2 > hi + 1e-9) continue;
      }
      const naechst = p.x + g.l + LADE_ABSTAND;
      if (!rechts[i + 1] || rechts[i + 1].x < naechst - 1e-9) return false; // dahinter ist kein Platz mehr
      if (r.achse) {
        if (s2 + links(i + 1, naechst) > smax + 1e-9) return false;
        if (s2 + rechts[i + 1].s < smin - 1e-9) continue;
      }
      if (tief(i + 1, naechst, s2, w2)) return true;
    }
    return false;
  };
  return tief(0, 0, 0, 0) ? folge.map((f, i) => ({ g: f.g, stopp: f.stopp, x: wahl[i].x, zone: wahl[i].zone })) : null;
}

// Alle verschiedenen Reihenfolgen einer Liste (gleiche Geräte nur einmal)
function* umstellungen(liste) {
  if (liste.length <= 1) { yield liste; return; }
  const gesehen = new Set();
  for (let i = 0; i < liste.length; i++) {
    if (gesehen.has(liste[i].g.id)) continue;
    gesehen.add(liste[i].g.id);
    for (const rest of umstellungen([...liste.slice(0, i), ...liste.slice(i + 1)])) yield [liste[i], ...rest];
  }
}
function* blockFolgen(bloecke) { // Reihenfolge der Blöcke fest, innerhalb jedes Blocks frei
  if (!bloecke.length) { yield []; return; }
  for (const erster of umstellungen(bloecke[0])) for (const rest of blockFolgen(bloecke.slice(1))) yield [...erster, ...rest];
}

// stopps: Geräte je Stopp in Fahrreihenfolge. Hinten an der Rampe steht, was beim ersten Kunden herunter muss.
// regeln schaltet einzelne Prüfungen ab (für die Begründung). zaehler.n zählt die geprüften Ladevarianten.
function anordnen(l, stopps, regeln = {}, zaehler = { n: 0 }) {
  const r = { zurr: true, zurrAus: null, hoehe: true, achse: true, entladen: true, reihenfolge: true, ...regeln };
  const bloecke = stopps.map((geraete, k) => geraete.map((g) => ({ g, stopp: k }))).reverse(); // vorn = letzter Stopp
  let abschnitte = [];
  bloecke.reduce((n, b) => { abschnitte.push(n + b.length); return n + b.length; }, 0);
  abschnitte = abschnitte.slice(0, -1);
  const folgen = r.reihenfolge ? blockFolgen(bloecke) : umstellungen(bloecke.flat());
  for (const folge of folgen) {
    zaehler.n++;
    const p = stellen(l, folge, r, r.reihenfolge ? abschnitte : [], zaehler);
    if (p) return p;
  }
  return null;
}

// ---------- Prüfung mit Begründung ----------
// Liefert { art: 'ok' | 'genehmigung' | 'nein', plaetze, gewicht, achsen, hoehe, gruende: [{ regel, art, txt }] }
function beladung(l, stopps, ortNamen = []) {
  const alle = stopps.flat();
  const gewicht = summe(alle, (g) => g.gewicht);
  const gruende = [];
  for (const g of new Set(alle)) gruende.push(...geraetHindernisse(g, l));
  if (alle.length > 1 && gewicht > l.nutzlast) gruende.push({ regel: 'gewicht', art: 'nein', txt: `zusammen zu schwer: ${zahl(gewicht, 1)} t > ${zahl(l.nutzlast, 1)} t Nutzlast` });
  if (alle.length > 1 && belegteLaenge(alle) > l.laenge) gruende.push({ regel: 'laenge', art: 'nein', txt: `zusammen zu lang: ${zahl(belegteLaenge(alle), 1)} m > ${zahl(l.laenge, 1)} m Ladefläche` });
  let plaetze = null;
  if (!gruende.some((x) => x.art === 'nein')) {
    const zaehler = { n: 0 };
    plaetze = anordnen(l, stopps, {}, zaehler);
    if (!plaetze && zaehler.abbruch) {
      gruende.push({ regel: 'suche', art: 'nein', txt: 'zu viele Varianten, nicht vollständig geprüft' });
    } else if (!plaetze) {
      const d = begruenden(l, stopps, ortNamen);
      gruende.push(d.grund);
      if (d.grund.art === 'genehmigung') plaetze = d.plaetze;
    }
  }
  const art = gruende.some((x) => x.art === 'nein') ? 'nein' : gruende.length ? 'genehmigung' : 'ok';
  return {
    art, gruende, gewicht,
    plaetze: art === 'nein' ? null : plaetze,
    achsen: plaetze && art !== 'nein' ? achslasten(l, plaetze) : null,
    hoehe: plaetze && art !== 'nein' ? Math.max(...plaetze.map((p) => p.zone.hoehe + p.g.h)) : null,
  };
}
// Warum findet sich keine Anordnung? Erst einzelne Prüfungen abschalten; die erste, ohne die es geht, ist der Grund.
function begruenden(l, stopps, ortNamen) {
  const alle = stopps.flat();
  const ohne = (regeln) => anordnen(l, stopps, regeln);
  if (!ohne({ zurr: false, hoehe: false, achse: false, reihenfolge: false })) {
    const laengste = Math.max(...l.zonen.map((z) => z.laenge));
    const g = alle.find((x) => x.l > laengste);
    return { grund: { regel: 'laenge', art: 'nein', txt: g ? `${g.kurz} zu lang: ${zahl(g.l)} m > ${zahl(laengste)} m ${l.zonen.length > 1 ? 'längste Zone' : 'Ladefläche'}`
      : `${l.zonen.length > 1 ? 'passt mit Stufe und Schwanenhals' : 'passt'} nicht hintereinander auf die Ladefläche` } };
  }
  let p = ohne({ hoehe: false });
  if (p) {
    const hoch = p.reduce((m, q) => (q.zone.hoehe + q.g.h > m.zone.hoehe + m.g.h ? q : m));
    return { plaetze: p, grund: { regel: 'hoehe', art: 'genehmigung', txt: `${hoch.g.kurz}: Gesamthöhe ${zahl(hoch.zone.hoehe + hoch.g.h)} m > ${zahl(MAX_HOEHE)} m` } };
  }
  if (stopps.length > 1 && ohne({ reihenfolge: false })) {
    return { grund: { regel: 'reihenfolge', art: 'nein', txt: `nur in anderer Ladereihenfolge möglich, dann stünde beim ersten Kunden ein anderes Gerät vor der Rampe` } };
  }
  for (const g of new Set(alle)) {
    p = ohne({ zurrAus: g.id });
    if (p) {
      // Bei zwei gleichen Geräten kann eins richtig stehen: das nehmen, dem der Zurrpunkt fehlt
      const q = p.find((x) => x.g === g && zurrLuecke(g, l, x.x)), luecke = q && zurrLuecke(g, l, q.x);
      return { grund: { regel: 'zurr', art: 'nein', txt: luecke
        ? `für ${g.kurz} kein Zurrpunkt ${luecke.seite} dem Gerät (nötig zwischen ${zahl(Math.max(0, luecke.von), 1)} und ${zahl(Math.min(l.laenge, luecke.bis), 1)} m)`
        : `für ${g.kurz} kein passender Zurrpunkt` } };
    }
  }
  if (stopps.length > 1 && ohne({ entladen: false })) {
    const nach = ortNamen[0] ? ` in ${ortNamen[0]}` : '';
    return { grund: { regel: 'achslast', art: 'nein', txt: `nach dem ersten Abladen${nach} wäre eine Achse überladen` } };
  }
  p = ohne({ achse: false });
  if (p) {
    const a = achslasten(l, p), hinten = a.hinten > l.achsen.hinten.frei;
    const achse = hinten ? 'Hinterachse' : 'Vorderachse', last = hinten ? a.hinten : a.vorn, frei = hinten ? l.achsen.hinten.frei : l.achsen.vorn.frei;
    const name = l.typ.startsWith('Sattelzug') ? (hinten ? 'Achsaggregat' : 'Sattelkupplung') : achse;
    return { grund: { regel: 'achslast', art: 'nein', txt: `${name} überladen: +${zahl(last, 1)} t, frei sind ${zahl(frei, 1)} t` } };
  }
  return { grund: { regel: 'mehrere', art: 'nein', txt: 'Zurrpunkte und Achslast lassen sich nicht zugleich einhalten' } };
}

// ---------- Tagesplanung: Sammeltouren ----------
const strecke = (von, nach) => (von === 'hof' ? finde(ORTE, nach).km : nach === 'hof' ? finde(ORTE, von).km : kmZwischen(finde(ORTE, von), finde(ORTE, nach)));

// ---------- Fahrten mit Auslieferungen und Abholungen ----------
// Eine Fahrt liefert erst alle Geräte aus und holt auf dem Rückweg ab. Halt: { ort, art }; Aufträge mit art,
// Auslieferung mit bis (spätestens), Abholung mit ab–bis (Abholfenster).
const istAbholung = (a) => a.art === 'Abholung';
const haltFolge = (ausOrte, abOrte) => [...ausOrte.map((ort) => ({ ort, art: 'Auslieferung' })), ...abOrte.map((ort) => ({ ort, art: 'Abholung' }))];
const ortsListe = (auftraege, art) => [...new Set(auftraege.filter((a) => a.art === art).map((a) => a.ort))];
const amHalt = (auftraege, h) => auftraege.filter((a) => a.ort === h.ort && a.art === h.art);

// Zeitplan: Beladen am Hof, Halte in Reihenfolge, zurück, Abholungen am Hof abladen. Bevor 6 h Arbeit oder (Lkw über 3,5 t)
// 4,5 h Lenkzeit am Stück erreicht wären, kommt eine Pause von 45 min dazu. Wer vor dem Abholfenster ankommt, wartet
// (Arbeitszeit). null, wenn ein Kunde außerhalb seiner Frist dran wäre, die Rückkehr zu spät ist oder die Tour allein gegen
// Pausen- oder Lenkzeitregeln verstößt. fristen = false lässt Verspätungen zu (für die Begründung, wer zu spät käme).
function fahrplan(route, auftraege, start = TOUR_START, eu = true, fristen = true) {
  const halte = [], abschnitte = [], pausen = [], phasen = [];
  let z = start, wo = 'hof', km = 0, block = 0, lenkBlock = 0;
  // phase: Abschnitt für die Anzeige (typ laden/fahrt/warten/pause, wo bzw. von_ort/nach, ladung = Geräte-IDs auf dem Lkw)
  const schritt = (dauer, lenk, phase) => {
    if (block + dauer > 6 * 60 || (eu && lenk && lenkBlock + dauer > 4.5 * 60)) {
      pausen.push({ von: z, bis: z + PAUSE });
      phasen.push({ typ: 'pause', wo, text: 'Pause', ladung: phase.ladung, von: z, bis: z + PAUSE });
      z += PAUSE; block = 0; lenkBlock = 0;
    }
    abschnitte.push({ von: z, bis: z + dauer, lenk, eu });
    phasen.push({ ...phase, von: z, bis: z + dauer });
    z += dauer; block += dauer; if (lenk) lenkBlock += dauer;
  };
  const aus = auftraege.filter((a) => !istAbholung(a)), ab = auftraege.filter(istAbholung);
  let geladen = aus.map((a) => a.geraet);
  if (aus.length) schritt(LADEN_JE_GERAET * aus.length, false, { typ: 'laden', wo: 'hof', text: 'Beladen', ladung: geladen });
  for (const h of route) {
    const hier = amHalt(auftraege, h), d = strecke(wo, h.ort);
    km += d; schritt(fahrMinKm(d), true, { typ: 'fahrt', von_ort: wo, nach: h.ort, km: d, ladung: geladen });
    const frueh = Math.max(0, ...hier.map((a) => a.ab || 0));
    if (z < frueh) schritt(frueh - z, false, { typ: 'warten', wo: h.ort, text: 'Warten auf das Abholfenster', ladung: geladen });
    const ankunft = z, ids = hier.map((a) => a.geraet);
    if (h.art === 'Abholung') {
      schritt(LADEN_JE_GERAET * hier.length, false, { typ: 'laden', wo: h.ort, text: 'Aufladen beim Kunden', ladung: ids });
      geladen = [...geladen, ...ids];
    } else {
      schritt(LADEN_JE_GERAET * hier.length, false, { typ: 'laden', wo: h.ort, text: 'Abladen beim Kunden', ladung: ids });
      geladen = [...geladen];
      for (const id of ids) geladen.splice(geladen.indexOf(id), 1); // je abgeladenem Gerät eins weniger
    }
    const beginn = phasen[phasen.length - 1].von; // Beginn des Ab- bzw. Aufladens, nach einer eingeschobenen Pause
    if (fristen && hier.some((a) => beginn > a.bis)) return null;
    halte.push({ ...h, ankunft, beginn, auftraege: hier });
    wo = h.ort;
  }
  const zurueck = strecke(wo, 'hof');
  km += zurueck; schritt(fahrMinKm(zurueck), true, { typ: 'fahrt', von_ort: wo, nach: 'hof', km: zurueck, ladung: geladen });
  if (ab.length) schritt(LADEN_JE_GERAET * ab.length, false, { typ: 'laden', wo: 'hof', text: 'Abladen am Hof', ladung: geladen });
  if (z > TAG_ENDE || pausenVerstoss(abschnitte)) return null;
  return { halte, km, start, ende: z, abschnitte, pausen, phasen };
}

// Ladung einer Fahrt anordnen. Hinweg: Auslieferungen, was beim ersten Kunden herunter muss, steht hinten.
// Rückweg: Abholungen, das zuerst aufgeladene Gerät steht vorn (es fährt über die Rampe ganz nach vorn).
// Liefert { hin, rueck } mit Stoppnummern der ganzen Fahrt, oder null.
function ladungAnordnen(l, halte, zaehler = { n: 0 }) {
  const geraete = (h) => h.auftraege.map((a) => finde(GERAETE, a.geraet));
  const aus = halte.filter((h) => h.art !== 'Abholung'), ab = halte.filter((h) => h.art === 'Abholung');
  const hin = aus.length ? anordnen(l, aus.map(geraete), {}, zaehler) : [];
  if (!hin) return null;
  const rueck = ab.length ? anordnen(l, [...ab].reverse().map(geraete), {}, zaehler) : [];
  if (!rueck) return null;
  return { hin, rueck: rueck.map((p) => ({ ...p, stopp: aus.length + ab.length - 1 - p.stopp })) };
}
// Warum passt die Ladung nicht (Hin- oder Rückweg)? Text oder null
function ladungGrund(l, halte) {
  const geraete = (h) => h.auftraege.map((a) => finde(GERAETE, a.geraet));
  const aus = halte.filter((h) => h.art !== 'Abholung'), ab = [...halte.filter((h) => h.art === 'Abholung')].reverse();
  for (const [vor, teil] of [['', aus], ['auf dem Rückweg ', ab]]) {
    if (!teil.length) continue;
    const b = beladung(l, teil.map(geraete), teil.map((h) => finde(ORTE, h.ort).name));
    if (b.art !== 'ok') return vor + b.gruende.find((x) => x.art !== 'ok').txt;
  }
  return null;
}

// Beste Fahrt eines Lkw für diese Aufträge: frühester Start (7 Uhr oder wenn der Lkw oder ein passender Fahrer zurück ist),
// kürzeste Route, die pünktlich ist, auf der der Lkw frei ist und die sich laden lässt.
// Bei gleicher Länge zuerst die Route, die die Kunden früher erreicht.
function tourBauen(l, auftraege, tag, zaehler) {
  const geraete = (liste) => liste.map((a) => finde(GERAETE, a.geraet));
  if (geraete(auftraege).some((g) => geraetHindernisse(g, l).length)) return null;
  for (const teil of [geraete(auftraege.filter((a) => !istAbholung(a))), geraete(auftraege.filter(istAbholung))]) {
    if (summe(teil, (g) => g.gewicht) > l.nutzlast || belegteLaenge(teil) > l.laenge) return null;
  }
  if (ortsListe(auftraege, 'Auslieferung').length + ortsListe(auftraege, 'Abholung').length > MAX_JE_TOUR) return null; // höchstens so viele Halte
  const folgen = (orte) => [...umstellungen(orte.map((o) => ({ g: { id: o }, o })))].map((r) => r.map((x) => x.o));
  const routen = folgen(ortsListe(auftraege, 'Auslieferung')).flatMap((r1) => folgen(ortsListe(auftraege, 'Abholung')).map((r2) => haltFolge(r1, r2)));
  const fahrer = FAHRER.filter((f) => darfFahren(f, l)).map((f) => f.id);
  const zurueck = stand.alleTouren.filter((t) => t.tag === tag && (t.lkw === l.id || fahrer.includes(t.fahrer))).map((t) => Math.ceil(ende(t) / 15) * 15);
  // Startzeiten: 7 Uhr, wenn Lkw oder Fahrer zurück sind, und so, dass eine Abholung ohne langes Warten im Fenster ankommt
  const beladen = LADEN_JE_GERAET * auftraege.filter((a) => !istAbholung(a)).length;
  const passend = auftraege.filter(istAbholung).map((a) => Math.floor((a.ab - fahrMinKm(strecke('hof', a.ort)) - beladen) / 15) * 15).filter((m) => m > TOUR_START);
  let beste = null; // unter allen Startzeiten die kürzeste Fahrt (wenig Warten), bei Gleichstand die frühere
  for (const start of [...new Set([TOUR_START, ...zurueck, ...passend])].sort((a, b) => a - b)) {
    const plaene = routen.map((route) => fahrplan(route, auftraege, start, l.fs !== 'B')).filter(Boolean)
      .sort((a, b) => a.km - b.km || summe(a.halte, (h) => h.ankunft) - summe(b.halte, (h) => h.ankunft));
    for (const f of plaene) {
      if (!lkwFrei(l.id, f.start, f.ende, [], tag)) continue;
      const ladung = ladungAnordnen(l, f.halte, zaehler);
      if (!ladung) continue;
      const tour = { lkw: l, auftraege, ...f, plaetze: ladung.hin, plaetzeRueck: ladung.rueck };
      if (!moeglicheFahrer(tour, tag).length) continue; // sonst einen späteren Start probieren, wenn dann ein Fahrer frei ist
      if (!beste || tour.ende - tour.start < beste.ende - beste.start) beste = tour;
      break; // für diese Startzeit ist die kürzeste passende Route gefunden
    }
  }
  return beste;
}
// Fahrer zuordnen: jede Tour braucht einen freien Fahrer mit passender Klasse, dessen ganzer Tag mit Pausen und
// Lenkzeiten aufgeht; keiner doppelt (kleine Paarungssuche)
const moeglicheFahrer = (t, tag) => FAHRER.filter((f) => darfFahren(f, t.lkw) && fahrerFrei(f.id, t.start, t.ende, [], tag, t.abschnitte))
  .sort((a, b) => FS_RANG[a.fs] - FS_RANG[b.fs]);
function fahrerZuordnen(touren, tag) {
  const passend = touren.map((t) => t.fahrerListe || moeglicheFahrer(t, tag)); // fahrerListe: in der Tagesplanung einmal je Tour gemerkt
  const belegt = new Map(); // Fahrer-ID → Tourindex
  const versuche = (i, besucht) => passend[i].some((f) => {
    if (besucht.has(f.id)) return false;
    besucht.add(f.id);
    if (!belegt.has(f.id) || versuche(belegt.get(f.id), besucht)) { belegt.set(f.id, i); return true; }
    return false;
  });
  for (let i = 0; i < touren.length; i++) if (!versuche(i, new Set())) return null;
  const zu = new Array(touren.length);
  for (const [fid, i] of belegt) zu[i] = finde(FAHRER, fid);
  return zu;
}

const sammelKosten = (t) => t.km * t.lkw.kmSatz + (t.ende - t.start) / 60 * stand.kosten.fahrerStunde;

// Verteilt die Aufträge eines Tages als Fahrten auf freie eigene Lkw.
// Rangfolge: 1. pünktlich (Bedingung), 2. eigene Lkw vor Spedition, 3. wenige Lkw und Fahrer, 4. wenige Kilometer.
// Nach ZEITBUDGET ms endet die Suche mit der besten bis dahin gefundenen Lösung (vollstaendig = false).
const ZEITBUDGET = 1500;
function beladungVerteilen(auftraege, tag) {
  const zaehler = { n: 0 }, beginn = performance.now();
  const kandidaten = [];
  for (const l of LKW) {
    const passend = auftraege.filter((a) => !geraetHindernisse(finde(GERAETE, a.geraet), l).length);
    const gerechnet = new Map(); // gleiche Geräte, Kunden, Arten und Fristen ergeben dieselbe Fahrt: nur einmal rechnen
    const zuViel = (liste) => { const g = liste.map((a) => finde(GERAETE, a.geraet)); return summe(g, (x) => x.gewicht) > l.nutzlast || belegteLaenge(g) > l.laenge; };
    // Gruppen schrittweise aufbauen. Reine Auslieferungen nur erweitern, wenn sie fahrbar sind: mit einem Auftrag mehr wird es
    // nie leichter (mehr Gewicht, Länge, Stopps, Zeit). Mit Abholungen gilt das nicht sicher (Wartezeit, andere Startzeit),
    // dort wird auch eine unfahrbare Gruppe weiter erweitert; Gewicht und Länge beschneiden immer.
    const erweitern = (ab, teil) => {
      for (let i = ab; i < passend.length; i++) {
        if (performance.now() - beginn > ZEITBUDGET) { zaehler.abbruch = true; return; }
        const neu = [...teil, passend[i]];
        if (zuViel(neu.filter((a) => !istAbholung(a))) || zuViel(neu.filter(istAbholung))) continue;
        const schluessel = neu.map((a) => `${a.art}|${a.geraet}|${a.ort}|${a.ab || ''}|${a.bis}`).sort().join(',');
        if (!gerechnet.has(schluessel)) gerechnet.set(schluessel, tourBauen(l, neu, tag, zaehler));
        const t = gerechnet.get(schluessel);
        if (t) kandidaten.push({ ...t, auftraege: neu, halte: t.halte.map((h) => ({ ...h, auftraege: amHalt(neu, h) })) });
        if ((t || neu.some(istAbholung)) && neu.length < MAX_JE_TOUR) erweitern(i + 1, neu);
      }
    };
    erweitern(0, []);
  }
  for (const t of kandidaten) t.fahrerListe = moeglicheFahrer(t, tag); // ändert sich während der Suche nicht
  // Größere Touren zuerst probieren, damit früh eine gute Lösung als Schranke da ist
  kandidaten.sort((a, b) => b.auftraege.length - a.auftraege.length || a.km - b.km);
  const reihe = [...auftraege].sort((a, b) => kandidaten.filter((t) => t.auftraege.includes(a)).length - kandidaten.filter((t) => t.auftraege.includes(b)).length);
  let beste = null, schritte = 0;
  const besser = (x, y) => !y || x.sped < y.sped || (x.sped === y.sped && (x.touren.length < y.touren.length
    || (x.touren.length === y.touren.length && x.km < y.km)));
  let vollstaendig = true;
  const suche = (offen, touren, sped, km) => {
    if (++schritte % 1000 === 0 && performance.now() - beginn > ZEITBUDGET) vollstaendig = false;
    if (!vollstaendig && beste) return;
    const rest = offen.filter((a) => !touren.some((t) => t.auftraege.includes(a)) && !sped.includes(a));
    if (beste && (sped.length > beste.sped || (sped.length === beste.sped && touren.length + (rest.length ? 1 : 0) > beste.touren.length))) return;
    if (!rest.length) {
      const fahrer = fahrerZuordnen(touren, tag);
      const loesung = { sped: sped.length, touren, spedition: sped, km, fahrer };
      if (fahrer && besser(loesung, beste)) beste = loesung;
      return;
    }
    const a = rest[0];
    for (const t of kandidaten) {
      if (!t.auftraege.includes(a) || touren.some((u) => u.lkw === t.lkw) || !t.auftraege.every((x) => rest.includes(x))) continue;
      if (!fahrerZuordnen([...touren, t], tag)) continue;
      suche(rest, [...touren, t], sped, km + t.km);
    }
    suche(rest, touren, [...sped, a], km);
  };
  suche(reihe, [], [], 0);
  const touren = beste.touren.map((t, i) => ({ ...t, fahrer: beste.fahrer[i], kosten: sammelKosten(t) }));
  return {
    touren,
    spedition: beste.spedition.map((a) => ({ auftrag: a, grund: speditionsGrundTag(a, tag, touren, kandidaten) })),
    varianten: zaehler.n,
    vollstaendig: vollstaendig && !zaehler.abbruch,
  };
}
const fristText = (a) => (istAbholung(a) ? `Abholfenster ${hhmm(a.ab)}–${hhmm(a.bis)} Uhr` : `zugesagt bis ${hhmm(a.bis)} Uhr`);
function speditionsGrundTag(a, tag, touren, kandidaten) {
  const g = finde(GERAETE, a.geraet);
  const arten = LKW.map((l) => beladung(l, [[g]]).art);
  if (!arten.includes('ok')) return arten.includes('genehmigung') ? 'nur mit Genehmigung transportierbar (Schwertransport)' : 'passt auf keinen eigenen Lkw';
  const allein = kandidaten.filter((t) => t.auftraege.length === 1 && t.auftraege[0] === a);
  if (!allein.length) {
    const lkwPasst = LKW.filter((l) => beladung(l, [[g]]).art === 'ok');
    if (!lkwPasst.some((l) => fahrplan([{ ort: a.ort, art: a.art }], [a], TOUR_START, l.fs !== 'B'))) return `${fristText(a)} nicht zu schaffen`;
    return 'kein passender Lkw frei';
  }
  return allein.some((t) => !touren.some((u) => u.lkw === t.lkw)) ? 'kein Fahrer frei, der Klasse, Pausen und Lenkzeiten einhält' : 'kein passender Lkw frei';
}
// Warum fährt dieser Auftrag nicht auf dieser Tour mit? Ist sein Kunde neu, wird jede Stelle der Hin- bzw. Rückfahrt probiert.
// Liefert die Begründung der Route mit den wenigsten Kilometern, oder null, wenn er an einer Stelle passen würde.
function warumNichtDazu(tour, auftrag) {
  const aus = tour.halte.filter((h) => h.art !== 'Abholung').map((h) => h.ort), ab = tour.halte.filter((h) => h.art === 'Abholung').map((h) => h.ort);
  const liste = istAbholung(auftrag) ? ab : aus;
  const varianten = liste.includes(auftrag.ort) ? [liste]
    : liste.map((_, i) => [...liste.slice(0, i), auftrag.ort, ...liste.slice(i)]).concat([[...liste, auftrag.ort]]);
  const routen = varianten.map((v) => (istAbholung(auftrag) ? haltFolge(aus, v) : haltFolge(v, ab)));
  const gruende = routen.map((route) => ({ route, grund: warumNichtAufRoute(tour, auftrag, route) }));
  if (gruende.some((x) => !x.grund)) return null;
  const km = (route) => [...route.map((h) => h.ort), 'hof'].reduce((s, o, i, r) => s + strecke(i ? r[i - 1] : 'hof', o), 0);
  return gruende.sort((a, b) => km(a.route) - km(b.route))[0].grund;
}
// Zuerst die Ladung (passt es überhaupt auf den Lkw?), dann Fristen, Lkw und Fahrer
function warumNichtAufRoute(tour, auftrag, route) {
  const alle = [...tour.auftraege, auftrag];
  const grund = ladungGrund(tour.lkw, route.map((h) => ({ ...h, auftraege: amHalt(alle, h) })));
  if (grund) return grund;
  const plan = fahrplan(route, alle, tour.start, tour.lkw.fs !== 'B', false);
  if (!plan) return `die Fahrt würde zu lang (Rückkehr nach ${hhmm(TAG_ENDE)} Uhr oder Pausenregeln)`;
  const spaet = plan.halte.find((h) => h.auftraege.some((a) => h.beginn > a.bis));
  if (spaet) return `dann wäre ${finde(ORTE, spaet.ort).name} erst um ${hhmm(spaet.beginn)} Uhr dran, ${fristText(spaet.auftraege.reduce((m, a) => (a.bis < m.bis ? a : m)))}`;
  if (!lkwFrei(tour.lkw.id, plan.start, plan.ende, [], auftrag.tag)) {
    const naechste = Math.min(...stand.alleTouren.filter((t) => t.tag === auftrag.tag && t.lkw === tour.lkw.id && t.start >= tour.start).map((t) => t.start));
    return `dann wäre ${tour.lkw.kz} erst um ${hhmm(plan.ende)} Uhr zurück, ist aber ab ${hhmm(naechste)} Uhr schon verplant`;
  }
  if (tour.fahrer && !fahrerFrei(tour.fahrer.id, plan.start, plan.ende, [], auftrag.tag, plan.abschnitte)) {
    return `${tour.fahrer.name} käme dann über die Pausen- und Lenkzeiten oder ist schon verplant`;
  }
  return null;
}
// Warum nimmt der Plan nicht einen anderen freien Lkw? Der kleinste freie, ungenutzte Lkw mit genug Nutzlast,
// auf den die Ladung dieser Fahrt nicht passt, mit seinem Hindernis (oder null).
function freiAber(tour, planTouren, tag) {
  const genutzt = new Set(planTouren.map((t) => t.lkw.id));
  const last = (art) => summe(tour.auftraege.filter((a) => (a.art === 'Abholung') === art), (a) => finde(GERAETE, a.geraet).gewicht);
  const gewicht = Math.max(last(false), last(true));
  for (const l of LKW.filter((x) => !genutzt.has(x.id) && x.nutzlast >= gewicht && lkwFrei(x.id, tour.start, tour.ende, [], tag)).sort((x, y) => x.nutzlast - y.nutzlast)) {
    const grund = ladungGrund(l, tour.halte);
    if (grund) return { lkw: l, grund };
  }
  return null;
}

// ---------- Einzelner neuer Transport außerhalb der Tagesplanung ----------
// Wo passt ein neuer Auftrag noch hin? 1. auf eine schon eingeplante Fahrt des Tages (ohne zusätzlichen Lkw),
// 2. als eigene Fahrt mit einem freien Lkw und Fahrer, 3. sonst Spedition. Liefert Vorschläge, der beste zuerst.
function einzelVorschlaege(auftrag) {
  const tag = auftrag.tag, vorschlaege = [], zaehler = { n: 0 };
  for (const t of stand.alleTouren.filter((x) => x.tag === tag && x.stopps)) {
    const l = finde(LKW, t.lkw);
    const ohne = { ...stand, alleTouren: stand.alleTouren.filter((x) => x !== t) };
    const alt = stand; stand = ohne; // die eigene Tour zählt beim Neuberechnen nicht als Belegung
    let neu = null;
    try { neu = tourBauen(l, [...t.auftraege, auftrag], tag, zaehler); } finally { stand = alt; }
    if (neu && fahrerFrei(t.fahrer, neu.start, neu.ende, [t.id], tag, neu.abschnitte)) {
      vorschlaege.push({ art: 'dazu', tour: t, neu, fahrer: finde(FAHRER, t.fahrer), mehrKm: neu.km - kmTour(t) });
    }
  }
  vorschlaege.sort((a, b) => a.mehrKm - b.mehrKm);
  const eigene = LKW.map((l) => tourBauen(l, [auftrag], tag, zaehler)).filter(Boolean)
    .map((neu) => ({ neu, fahrer: fahrerZuordnen([neu], tag)?.[0] })).filter((x) => x.fahrer)
    .sort((a, b) => sammelKosten(a.neu) - sammelKosten(b.neu));
  if (eigene.length) vorschlaege.push({ art: 'eigen', ...eigene[0] });
  if (!vorschlaege.length) vorschlaege.push({ art: 'sped', grund: speditionsGrundTag(auftrag, tag, [], []) });
  return vorschlaege;
}
