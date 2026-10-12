'use strict';
// Oberfläche. Alle Texte per textContent, keine HTML-Strings.

const $ = (sel) => document.querySelector(sel);
function el(tag, attrs, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kinder) if (k != null) e.append(k instanceof Node ? k : String(k));
  return e;
}
const marke = (text, art) => el('span', { class: 'marke ' + art }, text);
const NS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs, ...kinder) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  for (const k of kinder) if (k != null) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
const ICONS = {
  planen: 'M9 3h6v3H9zM7 4.5H5v16.5h14V4.5h-2M8 11h8M8 15h8M8 19h5',
  tafel: 'M3 4v16h18M7 8h8M10 12h8M6 16h6',
  wuerfel: 'M12 3 4 7v10l8 4 8-4V7l-8-4zM4 7l8 4 8-4M12 11v10',
  lkw: 'M2 6h12v10H2zM14 9h4l3 3v4h-7M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  kunden: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 10h2M14 10h2',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  links: 'M15 6l-6 6 6 6',
  rechts: 'M9 6l6 6-6 6',
  schliessen: 'M6 6l12 12M18 6L6 18',
};
const icon = (name) => sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, sv('path', { d: ICONS[name] }));
const ortName = (id) => (id === 'hof' ? 'Hof' : finde(ORTE, id).name);
const ortKurz2 = (id) => (id === 'hof' ? 'Hof' : ortKurz(id));
const knopf = (text, attrs, aktion, aus = false) => { const b = el('button', { ...attrs, onclick: aktion }, text); b.disabled = aus; return b; };

// ---------- Planen: Aufträge des Tages auf die Lkw verteilen ----------
let plan = null, vorschlag = null, planGewaehlt = 0;
let meldung = null; // { art: 'ok' | 'warn', text, woche }
const offeneAuftraege = () => stand.alleAuftraege.filter((a) => a.tag === datum);
const wann = () => (datum === tagPlus(HEUTE, 1) ? 'morgen' : datum === HEUTE ? 'heute' : `am ${tagLang(datum)}`);
const kmSumme = (p) => p.touren.reduce((s, t) => s + t.km, 0);
function planZuruecksetzen() { plan = null; vorschlag = null; planGewaehlt = 0; richtung3d = 'hin'; etappe = null; }
// die Fahrt mit den meisten Stopps zuerst auf der Karte
const standardAuswahl = (p) => p.touren.reduce((b, t, i, l) => (t.halte.length > l[b].halte.length ? i : b), 0);
function planBerechnen() {
  plan = beladungVerteilen(offeneAuftraege(), datum);
  vorschlag = plan;
  planGewaehlt = standardAuswahl(plan);
  meldung = null;
  renderPlanen();
}

const artWort = (a) => (istAbholung(a) ? 'abholen' : 'ausliefern');
const halteFuerLadeplan = (halte) => halte.map((h) => ({ ort: h.ort, art: h.art, geraete: h.auftraege.map((a) => a.geraet) }));
// Links: vor dem Berechnen die Transporte des Tages (nach Frist), danach Ergebnis und Fahrten; unten die Knöpfe.
// Rechts (renderDetail): die gewählte Fahrt, vor dem Berechnen die Kunden des Tages auf der Karte.
const fristVon = (a) => (istAbholung(a) ? a.ab : a.bis);
function auftragZeile(a) {
  const g = finde(GERAETE, a.geraet);
  return el('li', { class: 'auftrag-zeile', 'data-auftrag': a.id, 'data-art': a.art }, el('i', { class: 'art-strich', 'aria-hidden': 'true' }),
    el('span', {}, el('b', {}, g.name), el('small', {}, ortName(a.ort))),
    el('span', { class: 'zeit' }, istAbholung(a) ? `${hhmm(a.ab)}–${hhmm(a.bis)} Uhr` : `bis ${hhmm(a.bis)} Uhr`, el('small', {}, artWort(a))),
    el('button', { class: 'x klein', 'aria-label': `${g.kurz} ${artWort(a)} bei ${ortName(a.ort)} entfernen`, title: 'Transport entfernen', onclick: () => auftragEntfernen(a.id) }, icon('schliessen')));
}
function renderPlanen() {
  const auftraege = [...offeneAuftraege()].sort((x, y) => fristVon(x) - fristVon(y)), gesperrt = istSonntag(datum) || datum < HEUTE;
  $('#plan-datum').textContent = tagLang(datum);
  const ab = auftraege.filter(istAbholung).length, kunden = new Set(auftraege.map((a) => a.ort)).size;
  const hinweis = meldung ? el('p', { class: 'meldung' + (meldung.art === 'warn' ? ' warn' : ''), id: 'plan-meldung', role: 'status' }, meldung.text,
    ...(meldung.woche ? [' ', knopf('In der Woche ansehen', { class: 'knopf zweit klein' }, zurWoche)] : [])) : null;
  const links = [];
  if (plan) {
    links.push(ergebnisKopf(), hinweis, el('h2', { class: 'liste-titel' }, `${plan.touren.length} Fahrten`),
      ...plan.touren.map(fahrtZeile));
    if (plan.spedition.length) {
      links.push(el('h2', { class: 'liste-titel' }, `${plan.spedition.length} an Spedition`), ...plan.spedition.map((s) => {
        const g = finde(GERAETE, s.auftrag.geraet);
        return el('div', { class: 'sped-zeile', 'data-spedition': s.auftrag.id }, el('b', {}, g.name), ` ${artWort(s.auftrag)} · ${ortKurz(s.auftrag.ort)}`,
          el('small', {}, `${s.grund} · ca. ${euro(kostenSpedition(s.auftrag))}`), geraetZeile(s.auftrag, null));
      }));
    }
    links.push(el('details', { class: 'offen-klapp' }, el('summary', {}, `Alle ${auftraege.length} Transporte ${wann()}`), el('ul', { class: 'zeilen' }, ...auftraege.map(auftragZeile))));
  } else if (auftraege.length) {
    links.push(el('p', { class: 'ergebnis-text', id: 'plan-zahl' }, `${auftraege.length} Transporte ${wann()}: ${auftraege.length - ab} ausliefern, ${ab} abholen, ${kunden} Kunden.`),
      hinweis, el('ul', { class: 'zeilen', id: 'auftrag-liste' }, ...auftraege.map(auftragZeile)));
    if (istSonntag(datum)) links.push(el('p', { class: 'g-nein' }, 'Sonntags wird nicht gefahren (Lkw-Fahrverbot).'));
  } else {
    const eingeplant = stand.touren.some((t) => t.stopps);
    links.push(hinweis, el('p', { class: 'hinweis' }, eingeplant ? 'Für diesen Tag ist alles eingeplant. Die Touren stehen in der Woche.' : `Keine offenen Transporte ${wann()}.`));
  }
  const kaputt = stand.werkstatt.filter((w) => w.tag === datum);
  if (kaputt.length) {
    links.push(el('p', { class: 'werkstatt-hinweis' }, 'In der Werkstatt: ', ...kaputt.flatMap((w) => [`${finde(LKW, w.lkw).kz} `,
      knopf('zurückholen', { class: 'knopf zweit klein', 'data-zurueckholen': w.lkw }, () => werkstattSetzen(w.lkw, false)), ' '])));
  }
  $('#plan-auftraege').replaceChildren(...links.filter(Boolean));

  const knoepfe = [];
  if (plan) knoepfe.push(knopf('Plan übernehmen', { class: 'knopf gross', id: 'plan-uebernehmen' }, planUebernehmen));
  if (auftraege.length) knoepfe.push(knopf(plan ? 'Neu berechnen' : 'Beladung berechnen', { class: plan ? 'knopf zweit' : 'knopf gross', id: 'beladung-berechnen' }, planBerechnen, gesperrt));
  if (!gesperrt) knoepfe.push(knopf('Neuer Transport', { class: plan || auftraege.length ? 'knopf zweit' : 'knopf', id: 'neuer-transport' }, () => transportOeffnen()));
  if (!auftraege.length && stand.touren.some((t) => t.stopps)) knoepfe.push(knopf('In der Woche ansehen', { class: 'knopf zweit' }, zurWoche));
  if (!auftraege.length && datum !== ladetag() && stand.alleAuftraege.some((a) => a.tag === ladetag())) {
    knoepfe.push(knopf(`Zum Beispieltag (${tagKurz(ladetag())})`, { class: 'knopf' }, () => datumSetzen(ladetag())));
  }
  $('#plan-ergebnis').replaceChildren(...knoepfe);
  $('#plan-ergebnis').hidden = !knoepfe.length;
  renderDetail();
}
// Plan, Umlegen und Wiederherstellen rufen renderErgebnis: die ganze Seite folgt dem Plan
function renderErgebnis() { renderPlanen(); }

function ergebnisKopf() {
  const n = plan.touren.reduce((s, t) => s + t.auftraege.length, 0) + plan.spedition.length;
  const kosten = plan.touren.reduce((s, t) => s + t.kosten, 0) + plan.spedition.reduce((s, x) => s + kostenSpedition(x.auftrag), 0);
  const geaendert = plan !== vorschlag;
  const kachel = (wert, text) => el('div', { class: 'zahl-kachel' }, el('b', {}, String(wert)), el('small', {}, text));
  return el('div', { id: 'plan-pruef' },
    el('div', { class: 'zahlen' }, kachel(plan.touren.length, plan.touren.length === 1 ? 'eigener Lkw' : 'eigene Lkw'), kachel(plan.spedition.length, 'an Spedition'), kachel(euro(kosten), 'Kosten ca.')),
    el('p', { class: 'ergebnis-text' }, `${n} Transporte: ${plan.varianten} Ladevarianten geprüft, jede gegen ${REGELN_ANZAHL} Regeln, dazu Abholfenster sowie Pausen- und Lenkzeiten der Fahrer. `
      + `Statt ${n} Einzelfahrten reichen ${plan.touren.length} Fahrten.`
      + (plan.vollstaendig ? '' : ' Die Suche wurde nach 1,5 Sekunden beendet: Das ist die beste bis dahin gefundene Verteilung.')),
    geaendert ? el('p', { class: 'ergebnis-text geaendert' }, `Von Hand geändert: ${plan.touren.length} Lkw, ${kmSumme(plan)} km. Der Vorschlag hatte ${vorschlag.touren.length} Lkw, ${kmSumme(vorschlag)} km. `,
      knopf('Vorschlag wiederherstellen', { class: 'knopf zweit klein', id: 'vorschlag-zurueck' }, () => { plan = vorschlag; planGewaehlt = standardAuswahl(plan); meldung = null; renderPlanen(); })) : null);
}
function fahrtZeile(t, i) {
  const gewaehlt = i === planGewaehlt;
  return el('button', { class: 'fahrt-zeile', 'aria-pressed': String(gewaehlt), 'data-fahrt': t.lkw.id, 'data-stopps': String(t.halte.length),
    onclick: () => { planGewaehlt = i; renderPlanen(); } },
  el('span', { class: 'fz-kopf' }, el('b', {}, t.lkw.kz), el('small', {}, t.lkw.typ), el('span', { class: 'fz-zeit' }, `${hhmm(t.start)}–${hhmm(t.ende)}`)),
  el('span', { class: 'fz-stopps' }, ...t.halte.map((h, k) => el('span', {}, el('span', { class: 'stopp-nr klein', style: `background:${stoppFarbe(k)}` }, String(k + 1)),
    `${ortKurz(h.ort)}${h.art === 'Abholung' ? ' (abholen)' : ''}`))),
  el('span', { class: 'fz-info' }, `${t.auftraege.length} ${t.auftraege.length === 1 ? 'Gerät' : 'Geräte'} · ${t.km} km · ${t.fahrer.name}`));
}

let etappe = null; // { t, i }: gewählte Etappe i der Fahrt t
let richtung3d = 'hin'; // bei gemischten Fahrten: Ladung bei Abfahrt am Hof oder auf dem Rückweg
function renderDetail() {
  const t = plan?.touren[planGewaehlt], warLeer = $('.plan-detail').classList.contains('leer');
  $('.plan-detail').classList.toggle('leer', !t);
  $('#detail-3d').hidden = !t;
  if (warLeer !== !t) karte?.resize(); // die Karte hat jetzt eine andere Höhe; vor dem Einpassen neu messen
  if (!t) {
    const auftraege = offeneAuftraege(), orte = [...new Set(auftraege.map((a) => a.ort))];
    const text = plan ? 'Alle Transporte gehen an die Spedition, kein eigener Lkw fährt.'
      : auftraege.length ? `Auf der Karte stehen die Kunden ${wann()}. „Beladung berechnen“ verteilt die ${auftraege.length} Geräte auf die freien Lkw: passend nach Gewicht, Maßen, Rampe und Zurrpunkten, pünktlich und mit möglichst wenigen Fahrten.`
        : 'Für diesen Tag gibt es nichts zu verteilen.';
    $('#detail-kopf').replaceChildren(el('div', { class: 'detail-leer' }, el('h2', {}, auftraege.length && !plan ? `${orte.length} Kunden, ${auftraege.length} Geräte` : 'Keine Fahrt'), el('p', {}, text)));
    $('#etappen').replaceChildren();
    $('#detail-inhalt').replaceChildren();
    karteZeigen(orte, null, true);
    return;
  }
  const l = t.lkw;
  $('#detail-kopf').replaceChildren(el('div', { class: 'detail-kopf', 'data-lkw': l.id },
    el('div', {}, el('h2', {}, l.kz, el('small', {}, l.typ)),
      el('p', {}, `${t.fahrer.name} · ${hhmm(t.start)}–${hhmm(t.ende)} Uhr · ${t.km} km · ${t.auftraege.length} ${t.auftraege.length === 1 ? 'Gerät' : 'Geräte'}`)),
    el('div', { class: 'knopfreihe' },
      knopf('Im Ladeplan öffnen', { class: 'knopf zweit klein', 'data-ladeplan': l.id }, () => ladeplanOeffnen(l.id, halteFuerLadeplan(t.halte), true)),
      knopf('Ladeliste drucken', { class: 'knopf zweit klein', 'data-ladeliste': l.id }, () => ladelisteDrucken(t, datum)),
      knopf('Lkw fällt aus', { class: 'knopf zweit klein', 'data-ausfall': l.id }, () => werkstattSetzen(l.id, true)))));

  const teile = ladungTeile(t);
  if (!teile.some((x) => x.richtung === richtung3d)) richtung3d = teile[0]?.richtung || 'hin';
  $('#rechts-richtung').hidden = teile.length < 2;
  document.querySelectorAll('#rechts-richtung [data-richtung]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.richtung === richtung3d)));
  if (teile.length) planDreiZeigen(l, teile.find((x) => x.richtung === richtung3d).plaetze);

  const aktiv = etappe?.t === t ? etappe.i : null, waehlen = (i) => { etappe = i === null ? null : { t, i }; renderDetail(); };
  const liste = etappenVon(t);
  $('#etappen').replaceChildren(
    el('ol', { class: 'etappen' }, ...liste.map((e, i) => el('li', {}, el('button', { class: 'etappe', 'aria-pressed': String(aktiv === i), 'data-etappe': String(i),
      onclick: () => waehlen(aktiv === i ? null : i) },
    el('span', { class: 'stopp-nr klein', style: `background:${e.nummern.length ? stoppFarbe(e.nummern[0] - 1) : 'var(--orange)'}` }, e.nummern.length ? e.nummern.join(' · ') : 'H'),
    el('span', {}, el('b', {}, `${ortKurz2(e.von)} → ${ortKurz2(e.nach)}`), el('small', {}, e.text)),
    el('span', { class: 'etappe-zeit' }, `${hhmm(e.ab)}–${hhmm(e.an)}`, el('small', {}, `${e.km} km`)))))),
    el('p', { class: 'hinweis etappen-fuss' }, aktiv === null ? 'Eine Etappe antippen, um ihre Strecke auf der Karte hervorzuheben.'
      : knopf('Ganze Fahrt zeigen', { class: 'knopf zweit klein', id: 'ganze-fahrt' }, () => waehlen(null))));
  karteZeigen(t.halte.map((h) => h.ort), aktiv === null ? null : liste[aktiv].nr);

  $('#detail-inhalt').replaceChildren(
    el('section', { class: 'detail-abschnitt' }, el('h3', {}, 'Stopps und Geräte'),
      el('ol', { class: 'stopps' }, ...t.halte.map((h, k) => el('li', { 'data-art': h.art },
        el('span', { class: 'stopp-nr', style: `background:${stoppFarbe(k)}` }, String(k + 1)),
        el('div', {},
          el('div', { class: 'stopp-kopf' }, ortName(h.ort), ' ', marke(h.art === 'Abholung' ? 'aufladen' : 'abladen', h.art === 'Abholung' ? 'unterwegs' : 'frei'), ' ',
            el('small', {}, `an ${hhmm(h.ankunft)} Uhr, ${fristText(h.auftraege.reduce((m, a) => (a.bis < m.bis ? a : m)))}`)),
          ...h.auftraege.map((a) => geraetZeile(a, l.id))))))),
    el('section', { class: 'detail-abschnitt' }, el('h3', {}, 'Warum so'),
      el('ul', { class: 'begruendung' }, ...begruendungen(t).map(([art, txt]) => el('li', { class: art }, txt)))));
}
function zurWoche() { waehleAnsicht('plantafel'); planReiter('tag'); }

function auftragEntfernen(id) {
  stand.alleAuftraege = stand.alleAuftraege.filter((a) => !(a.id === id && a.tag === datum));
  speichern();
  planZuruecksetzen(); meldung = null;
  renderPlanen();
}
// Lkw fällt am gewählten Tag aus (oder ist wieder da); ein vorhandener Plan wird sofort neu berechnet
function werkstattSetzen(lkwId, an) {
  const hattePlan = !!plan, l = finde(LKW, lkwId);
  stand.werkstatt = stand.werkstatt.filter((w) => !(w.lkw === lkwId && w.tag === datum));
  if (an) stand.werkstatt.push({ lkw: lkwId, tag: datum });
  speichern();
  planZuruecksetzen();
  if (hattePlan && offeneAuftraege().length) planBerechnen();
  const verteilt = plan ? `, neu verteilt: ${plan.touren.length} Lkw${plan.spedition.length ? `, ${plan.spedition.length} an Spedition` : ''}` : '';
  const weitere = stand.touren.filter((t) => t.lkw === lkwId).length;
  meldung = an
    ? { art: 'warn', text: `${l.kz} fällt am ${tagKurz(datum)} aus${verteilt}.${weitere ? ` Er hatte an dem Tag noch ${weitere} weitere Tour${weitere > 1 ? 'en' : ''}, die umgeplant werden müssen.` : ''}` }
    : { art: 'ok', text: `${l.kz} ist am ${tagKurz(datum)} wieder verfügbar${verteilt}.` };
  allesNeu();
}

// Ladung der gewählten Fahrt rechts in 3D zum Drehen, Schilder mit Stoppnummer wie in der Liste und auf der Karte
const planBlick = { winkel: -0.85, neigung: 0.55, abstand: 13.5 };
let planDrei = null;
function planDreiZeigen(l, plaetze) {
  if (!planDrei) planDrei = betrachter($('#plan-3d'), planBlick);
  if (!planDrei) { $('#plan-3d').replaceChildren(el('div', { class: 'karten-fehler' }, '3D-Ansicht nicht verfügbar (three.js oder WebGL fehlt).')); return; }
  szeneFuellen(planDrei, ladungGruppe(l, plaetze, stoppSchild, false, false)); // ohne 4-m-Ebene ruhiger; die Höhe prüft der Ladeplan
}
// Etappen einer Fahrt: je Fahrt-Abschnitt Start, Ziel, Zeit, km und was danach am Ziel passiert (Warten, Pause, Ab- oder Aufladen).
// Bleibt der Lkw am Ort (ausliefern und abholen beim selben Kunden), gehört der zweite Stopp zur selben Etappe; nr zählt die Abschnitte für die Karte.
const LADEN_WORT = { 'Abladen beim Kunden': 'abladen', 'Aufladen beim Kunden': 'aufladen', 'Abladen am Hof': 'am Hof abladen' };
function geraeteKurz(ids) { // ['G1', 'G1', 'G2'] → „2× 78 SEC, 80 VJR“
  const n = new Map();
  for (const id of ids) n.set(id, (n.get(id) || 0) + 1);
  return [...n].map(([id, k]) => `${k > 1 ? `${k}× ` : ''}${finde(GERAETE, id).kurz}`).join(', ');
}
function etappenVon(t) {
  const liste = [];
  let nr = 0;
  for (const p of t.phasen) {
    if (p.typ !== 'fahrt') { if (liste.length) liste[liste.length - 1].danach.push(p); continue; }
    if (p.von_ort === p.nach && liste.length) liste[liste.length - 1].nummern.push(nr + 1);
    else liste.push({ nr, nummern: p.nach === 'hof' ? [] : [nr + 1], von: p.von_ort, nach: p.nach, ab: p.von, an: p.bis, km: p.km, danach: [] });
    nr++;
  }
  return liste.map((e) => ({ ...e, text: e.danach.map((p) => (p.typ === 'warten' ? `wartet bis ${hhmm(p.bis)} Uhr`
    : p.typ === 'pause' ? `Pause ${hhmm(p.von)}–${hhmm(p.bis)} Uhr` : `${LADEN_WORT[p.text]}: ${geraeteKurz(p.ladung)}`)).join(' · ') || 'zurück am Hof' }));
}

// Teile der Ladung einer Fahrt mit Bild: ab Hof (Auslieferungen) und Rückweg (Abholungen), nur die vorhandenen
const LADUNG_TEILE = [['hin', 'Abfahrt am Hof', 'plaetze'], ['rueck', 'Rückweg', 'plaetzeRueck']];
const ladungTeile = (t) => LADUNG_TEILE.filter(([, , feld]) => t[feld]?.length).map(([richtung, titel, feld]) => ({ richtung, titel, plaetze: t[feld] }));
// Ein Gerät mit Auswahl, um es von Hand auf einen anderen Lkw zu legen
function geraetZeile(a, lkwId) {
  const g = finde(GERAETE, a.geraet);
  const wahl = el('select', { 'aria-label': `${g.kurz} auf einen anderen Lkw legen`, 'data-verschieben': a.id,
    onchange: (e) => { if (e.target.value) planVerschieben(a, e.target.value); } },
  el('option', { value: '' }, lkwId ? 'anderer Lkw …' : 'eigener Lkw …'), ...LKW.filter((l) => l.id !== lkwId).map((l) => el('option', { value: l.id }, l.kz)));
  return el('div', { class: 'geraet-zeile' }, el('i', { class: 'farbpunkt', style: `background:${g.farbe}` }), `${g.name} · ${zahl(g.gewicht, 1)} t`, wahl);
}
// Kurze Sätze zur Tour: Reihenfolge, Warten, Pausen und warum Geräte für dieselben Kunden nicht mitfahren
function begruendungen(t) {
  const liste = [], aus = t.halte.filter((h) => h.art !== 'Abholung'), ab = t.halte.filter((h) => h.art === 'Abholung');
  if (aus.length > 1) liste.push(['info', `Ladereihenfolge: Was bei ${ortKurz(aus[0].ort)} herunter muss, steht hinten an der Rampe, ${ortKurz(aus[aus.length - 1].ort)} steht vorn.`]);
  if (ab.length) {
    liste.push(['info', aus.length
      ? `Auf dem Rückweg wird ${ab.map((h) => `bei ${ortKurz(h.ort)}`).join(', dann ')} aufgeladen${ab.length > 1 ? '; was zuerst aufgeladen wird, steht vorn' : ''}.`
      : `Abholfahrt: ${ab.map((h) => ortKurz(h.ort)).join(', dann ')}${ab.length > 1 ? '; was zuerst aufgeladen wird, steht vorn' : ''}.`]);
  }
  for (const p of t.phasen.filter((x) => x.typ === 'warten')) liste.push(['info', `Wartet bei ${ortKurz(p.wo)} bis ${hhmm(p.bis)} Uhr auf das Abholfenster.`]);
  if (t.pausen.length) liste.push(['info', `Pause ${t.pausen.map((p) => `${hhmm(p.von)}–${hhmm(p.bis)}`).join(', ')} Uhr eingeplant (Arbeits- und Lenkzeit).`]);
  const orte = new Set(t.halte.map((h) => h.ort)), gesehen = new Set();
  const andere = [...plan.touren.filter((u) => u !== t).flatMap((u) => u.auftraege), ...plan.spedition.map((s) => s.auftrag)];
  for (const a of andere.filter((x) => orte.has(x.ort))) {
    if (gesehen.has(a.geraet + a.ort + a.art)) continue;
    gesehen.add(a.geraet + a.ort + a.art);
    const kurz = finde(GERAETE, a.geraet).kurz, grund = warumNichtDazu(t, a);
    if (grund) liste.push(['', `${kurz} (${artWort(a)}) nicht mit dazu: ${ohneName(grund, kurz)}`]);
  }
  const frei = freiAber(t, plan.touren, datum);
  if (frei) liste.push(['', `${frei.lkw.kz} wäre frei, aber: ${frei.grund}`]);
  return liste;
}

// „MT 1440: Zurrpunkte …“ bzw. „MT 1440 zu schwer …“ → ohne den Gerätenamen, wenn er davor schon steht
const ohneName = (txt, kurz) => (txt.startsWith(kurz + ': ') ? txt.slice(kurz.length + 2) : txt.startsWith(kurz + ' ') ? txt.slice(kurz.length + 1) : txt);

// Gerät von Hand auf einen anderen Lkw legen: sofort neu prüfen, bei Erfolg den Plan ändern, sonst den Grund nennen
function planVerschieben(a, lkwId) {
  const l = finde(LKW, lkwId), g = finde(GERAETE, a.geraet);
  const quelle = plan.touren.find((t) => t.auftraege.includes(a)), ziel = plan.touren.find((t) => t.lkw.id === lkwId);
  const zaehler = { n: 0 };
  const neuZiel = tourBauen(l, [...(ziel ? ziel.auftraege : []), a], datum, zaehler);
  let grund = neuZiel ? null : ziel ? warumNichtDazu(ziel, a) || 'die Fahrt ließe sich so nicht planen' : grundNeuerLkw(l, a);
  const rest = quelle ? quelle.auftraege.filter((x) => x !== a) : [];
  const neuQuelle = !grund && rest.length ? tourBauen(quelle.lkw, rest, datum, zaehler) : null;
  if (!grund && rest.length && !neuQuelle) grund = `${quelle.lkw.kz} ließe sich ohne das Gerät nicht mehr laden`;
  let touren = null, fahrer = null;
  if (!grund) {
    touren = [...plan.touren.filter((t) => t !== quelle && t !== ziel), ...(neuQuelle ? [neuQuelle] : []), neuZiel];
    fahrer = fahrerZuordnen(touren, datum);
    if (!fahrer) grund = 'dann fände sich kein Fahrer, der Klasse, Pausen und Lenkzeiten einhält';
  }
  if (grund) {
    meldung = { art: 'warn', text: `${g.kurz} passt nicht auf ${l.kz}: ${grund}` };
    renderErgebnis();
    return;
  }
  plan = { ...plan, touren: touren.map((t, i) => ({ ...t, fahrer: fahrer[i], kosten: sammelKosten(t) })), spedition: plan.spedition.filter((s) => s.auftrag !== a) };
  planGewaehlt = plan.touren.findIndex((t) => t.lkw.id === lkwId);
  const schlechter = plan.spedition.length > vorschlag.spedition.length || plan.touren.length > vorschlag.touren.length
    || (plan.touren.length === vorschlag.touren.length && kmSumme(plan) > kmSumme(vorschlag));
  meldung = { art: 'ok', text: `${g.kurz} liegt jetzt auf ${l.kz}.${schlechter ? ' Das ist schlechter als der Vorschlag, siehe oben.' : ''}` };
  renderErgebnis();
}
function grundNeuerLkw(l, a) {
  const b = beladung(l, [[finde(GERAETE, a.geraet)]]);
  if (b.art !== 'ok') return b.gruende.find((x) => x.art !== 'ok').txt;
  if (!fahrplan([{ ort: a.ort, art: a.art }], [a], TOUR_START, l.fs !== 'B')) return `${ortName(a.ort)}: ${fristText(a)} nicht zu schaffen`;
  return `${l.kz} ist zu der Zeit schon verplant`;
}

// Geplante Fahrt als Sammeltour speichern
const tourSpeicherform = (t, fahrerId, tag) => ({ id: 'T' + (++stand.nr), tag, lkw: t.lkw.id, fahrer: fahrerId, art: 'Sammeltour', start: t.start,
  stopps: t.halte.map((h) => ({ ort: h.ort, art: h.art, geraete: h.auftraege.map((a) => a.geraet) })), auftraege: t.auftraege.map((a) => ({ ...a })) });
const spedSpeicherform = (a, grund) => ({ id: 'S' + (++stand.nr), tag: a.tag, art: a.art, geraet: a.geraet, ort: a.ort,
  start: istAbholung(a) ? Math.min(17 * 60, a.ab) : TOUR_START, spedition: 'noch offen', grund, ...(a.vertrag ? { vertrag: a.vertrag } : {}) });
// Plan als Sammeltouren speichern; die Aufträge sind danach erledigt
function planUebernehmen() {
  const veraltet = plan.touren.some((t) => !lkwFrei(t.lkw.id, t.start, t.ende, [], datum) || !fahrerFrei(t.fahrer.id, t.start, t.ende, [], datum, t.abschnitte));
  if (veraltet) {
    planZuruecksetzen();
    meldung = { art: 'warn', text: 'Inzwischen hat sich etwas geändert. Bitte neu berechnen.' };
    renderPlanen();
    return;
  }
  for (const t of plan.touren) stand.alleTouren.push(tourSpeicherform(t, t.fahrer.id, datum));
  for (const s of plan.spedition) stand.alleSped.push(spedSpeicherform(s.auftrag, s.grund));
  const erledigt = new Set([...plan.touren.flatMap((t) => t.auftraege), ...plan.spedition.map((s) => s.auftrag)].map((a) => a.id));
  stand.alleAuftraege = stand.alleAuftraege.filter((a) => a.tag !== datum || !erledigt.has(a.id));
  speichern();
  meldung = { art: 'ok', text: `${plan.touren.length} Touren für ${tagKurz(datum)} eingeplant${plan.spedition.length ? `, ${plan.spedition.length} an Spedition` : ''}.`, woche: true };
  planZuruecksetzen();
  renderPlanen();
}

// ---------- Ladeliste für den Fahrer (Druckansicht) ----------
// t: Fahrt mit lkw, fahrer, start, ende, km, halte [{ ort, art, ankunft, auftraege }] und pausen
const adresseText = (id) => { const k = kundeVon(id); return k ? `${k.firma}, ${k.strasse}, ${k.plz} ${k.stadt} · ${k.ansprechpartner}, Tel. ${k.telefon}` : ortName(id); };
function ladelisteDrucken(t, tag) {
  const l = t.lkw, ladung = ladungAnordnen(l, t.halte) || { hin: [], rueck: [] };
  const zelle = (...w) => el('tr', {}, ...w.map((x) => el('td', {}, x)));
  const tabelle = (plaetze) => el('table', {}, el('tr', {}, ...['Nr.', 'Gerät', 'Gewicht', 'Stopp', 'Stellplatz'].map((x) => el('th', {}, x))),
    ...[...plaetze].sort((x, y) => x.x - y.x).map((p, i) => zelle(String(i + 1), p.g.name, `${zahl(p.g.gewicht, 1)} t`, `${p.stopp + 1} · ${ortKurz(t.halte[p.stopp].ort)}`,
      `${zahl(p.x, 1)} bis ${zahl(p.x + p.g.l, 1)} m (${p.zone.name})`)));
  const bild = (plaetze, text) => { const url = ladungBild(l, plaetze, 1400, 420); return url ? el('img', { class: 'druck-bild', src: url, alt: text }) : null; };
  $('#druck').replaceChildren(...[ // ohne WebGL fehlen die Bilder; replaceChildren würde null als Text einfügen
    el('h1', {}, `Ladeliste ${l.kz} · ${tagLang(tag)}`),
    el('p', {}, `${l.typ} · Fahrer ${t.fahrer.name} · ab Hof ${hhmm(t.start)} Uhr · zurück ca. ${hhmm(t.ende)} Uhr · ${t.km} km`),
    ...(ladung.hin.length ? [el('h2', {}, 'Am Hof aufladen, in dieser Reihenfolge, jedes Gerät auf seinen Stellplatz (gemessen ab Stirnwand)'),
      bild(ladung.hin, `3D-Ansicht ${l.kz} bei Abfahrt am Hof`), tabelle(ladung.hin)] : []),
    ...(ladung.rueck.length ? [el('h2', {}, 'Unterwegs aufladen: so stehen die abgeholten Geräte auf dem Rückweg'),
      bild(ladung.rueck, `3D-Ansicht ${l.kz} auf dem Rückweg`), tabelle(ladung.rueck)] : []),
    el('h2', {}, 'Stopps'),
    el('ol', {}, ...t.halte.map((h) => el('li', {}, `${adresseText(h.ort)}. An ${hhmm(h.ankunft)} Uhr (${fristText(h.auftraege[0])}): `
      + `${h.auftraege.map((a) => finde(GERAETE, a.geraet).name).join(', ')} ${h.art === 'Abholung' ? 'aufladen' : 'abladen'}`))),
    ...(t.pausen?.length ? [el('p', {}, `Pause: ${t.pausen.map((p) => `${hhmm(p.von)}–${hhmm(p.bis)} Uhr`).join(', ')}`)] : []),
    el('p', { class: 'klein' }, 'Stellplätze gemessen ab Vorderkante Ladefläche (Stirnwand). Ladungssicherung vor Abfahrt nach den geltenden Vorgaben prüfen. Beispieldaten der Klick-Demo.')].filter(Boolean));
  // erst drucken, wenn die Bilder dekodiert sind, sonst fehlen sie auf dem Blatt
  Promise.all([...$('#druck').querySelectorAll('img')].map((i) => i.decode().catch(() => {}))).then(() => window.print());
}
// gespeicherte Sammeltour in die Form einer geplanten Fahrt bringen
function fahrtAus(t) { // laden() und kundeSpeichern() sorgen dafür, dass der Fahrplan gespeicherter Touren aufgeht
  const l = finde(LKW, t.lkw), f = fahrplan(t.stopps.map(({ ort, art }) => ({ ort, art })), t.auftraege, t.start, l.fs !== 'B', false);
  return { lkw: l, fahrer: finde(FAHRER, t.fahrer), start: t.start, ende: f.ende, km: f.km, halte: f.halte, pausen: f.pausen };
}

// ---------- Kunden: Adressen, Mietverträge, Abholung zum Mietende ----------
function restlaufzeit(v) {
  if (v.von > HEUTE) return `beginnt ${tagKurz(v.von)}`;
  const tage = Math.round((tagDatum(v.bis) - tagDatum(HEUTE)) / 864e5);
  if (tage < 0) return 'beendet';
  if (tage === 0) return 'endet heute';
  const monate = Math.floor(tage / 30.44), jahre = Math.floor(monate / 12), rest = monate % 12;
  if (!monate) return `noch ${tage} Tag${tage > 1 ? 'e' : ''}`;
  return 'noch ' + [jahre ? `${jahre} Jahr${jahre > 1 ? 'e' : ''}` : '', rest ? `${rest} Monat${rest > 1 ? 'e' : ''}` : ''].filter(Boolean).join(', ');
}
// Abholung eines Vertrags: offen als Auftrag, schon eingeplant in einer Tour, oder keiner
function abholStand(v) {
  const offen = stand.alleAuftraege.find((a) => a.vertrag === v.id && istAbholung(a));
  if (offen) return { art: 'offen', tag: offen.tag };
  const tour = stand.alleTouren.find((t) => (t.auftraege || []).some((a) => a.vertrag === v.id && istAbholung(a)));
  if (tour) return { art: 'eingeplant', tag: tour.tag };
  const sped = stand.alleSped.find((s) => s.vertrag === v.id);
  return sped ? { art: 'eingeplant', tag: sped.tag } : null;
}
const naechsterWerktag = (tag) => (istSonntag(tag) ? tagPlus(tag, 1) : tag);
function abholenSetzen(v, an) {
  const st = abholStand(v);
  if (!an && st?.art === 'eingeplant') return; // eingeplante Abholung zuerst in der Woche stornieren
  v.abholen = an;
  stand.alleAuftraege = stand.alleAuftraege.filter((a) => !(a.vertrag === v.id && istAbholung(a)));
  if (an && v.bis >= HEUTE && !st) {
    stand.alleAuftraege.push({ id: 'B' + (++stand.nr), tag: naechsterWerktag(v.bis), art: 'Abholung', vertrag: v.id, geraet: v.geraet, ort: v.kunde, ab: 8 * 60, bis: 16 * 60 });
  }
  speichern(); planZuruecksetzen();
  renderKunden();
}
const tagKompakt = (tag) => `${tag.slice(8)}.${tag.slice(5, 7)}.${tag.slice(0, 4) !== HEUTE.slice(0, 4) ? tag.slice(0, 4) : ''}`;
// Kunden: links die Liste zum Scrollen (Suche, Filter), rechts der gewählte Kunde mit Verträgen und „Bearbeiten“
const kf = { suche: '', filter: 'alle', gewaehlt: null, bearbeiten: null };
const tageBis = (tag) => Math.round((tagDatum(tag) - tagDatum(HEUTE)) / 864e5);
function kundenZahlen(k) { // laufende Verträge, nächstes Mietende, nächste Abholung
  const laufend = stand.vertraege.filter((v) => v.kunde === k.id && v.bis >= HEUTE).sort((a, b) => a.bis.localeCompare(b.bis));
  const abholung = stand.alleAuftraege.filter((a) => a.ort === k.id && istAbholung(a)).sort((a, b) => a.tag.localeCompare(b.tag))[0] || null;
  return { k, laufend, naechstes: laufend[0] || null, abholung };
}
const KUNDEN_FILTER = [['alle', 'Alle'], ['abholung', 'Abholung in 7 Tagen'], ['ende', 'Mietende in 30 Tagen']];
function renderKunden() {
  const alle = alleKunden().map(kundenZahlen), q = kf.suche.trim().toLowerCase();
  const treffer = alle.filter((x) => {
    if (kf.filter === 'abholung' && !(x.abholung && tageBis(x.abholung.tag) <= 7)) return false;
    if (kf.filter === 'ende' && !(x.naechstes && tageBis(x.naechstes.bis) <= 30)) return false;
    if (!q) return true;
    return [x.k.firma, x.k.stadt, x.k.plz, x.k.strasse, x.k.ansprechpartner, ...x.laufend.map((v) => finde(GERAETE, v.geraet).name)].join(' ').toLowerCase().includes(q);
  }).sort((a, b) => (a.abholung?.tag || a.naechstes?.bis || '9999').localeCompare(b.abholung?.tag || b.naechstes?.bis || '9999') || a.k.firma.localeCompare(b.k.firma));
  if (!kf.gewaehlt || !alle.some((x) => x.k.id === kf.gewaehlt)) kf.gewaehlt = treffer[0]?.k.id || null;
  document.querySelectorAll('#kunden-filter button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filter === kf.filter)));
  $('#kunden-zahl').textContent = `${treffer.length} von ${alle.length} Kunden`;
  $('#kunden-liste').replaceChildren(...treffer.map(({ k, laufend, abholung }) => el('li', {},
    el('button', { class: 'kunde-eintrag' + (k.id === kf.gewaehlt ? ' aktiv' : ''), 'data-kunde': k.id, 'aria-current': String(k.id === kf.gewaehlt),
      onclick: () => { kf.gewaehlt = k.id; kf.bearbeiten = null; renderKunden(); } },
    el('b', {}, k.firma),
    el('small', {}, `${k.stadt} · ${laufend.length ? `${laufend.length} Mietgerät${laufend.length > 1 ? 'e' : ''}` : 'keine Miete'}`),
    abholung && tageBis(abholung.tag) <= 7 ? el('span', { class: 'kunde-hinweis' }, `Abholung ${tagKurz(abholung.tag)}`) : null))),
  ...(treffer.length ? [] : [el('li', { class: 'hinweis' }, 'Kein Kunde passt zur Suche.')]));
  renderKundeDetail();
}
function renderKundeDetail() {
  const k = kf.gewaehlt && kundeVon(kf.gewaehlt), box = $('#kunde-detail');
  if (!k) { box.replaceChildren(el('p', { class: 'hinweis' }, 'Links einen Kunden wählen.')); return; }
  if (kf.bearbeiten) { box.replaceChildren(...kundeBearbeitenFelder(k)); return; }
  const vertraege = stand.vertraege.filter((v) => v.kunde === k.id).sort((a, b) => a.bis.localeCompare(b.bis));
  const zeilen = vertraege.map((v) => {
    const g = finde(GERAETE, v.geraet), st = abholStand(v), vorbei = v.bis < HEUTE;
    const abholung = !v.abholen ? 'Kunde bringt es zurück'
      : st ? `${st.art === 'eingeplant' ? 'eingeplant' : 'offen'}: ${tagKurz(st.tag)}` : vorbei ? 'abgeholt' : `am ${tagKurz(naechsterWerktag(v.bis))}`;
    const wahl = vorbei || st?.art === 'eingeplant' ? '' : knopf(v.abholen ? 'nicht abholen' : 'doch abholen', { class: 'knopf zweit klein', 'data-abholen': v.id }, () => abholenSetzen(v, !v.abholen));
    return el('tr', { class: vorbei ? 'vorbei' : '', 'data-vertrag': v.id }, el('td', {}, g.name), el('td', {}, `${tagKompakt(v.von)} – ${tagKompakt(v.bis)}`),
      el('td', {}, restlaufzeit(v)), el('td', {}, abholung), el('td', {}, wahl));
  });
  box.replaceChildren(
    el('div', { class: 'detail-kopf' },
      el('div', {}, el('h2', {}, k.firma), el('p', {}, `${k.strasse}, ${k.plz} ${k.stadt}`), el('p', { class: 'hinweis' }, `${k.ansprechpartner} · Tel. ${k.telefon} · ${finde(ORTE, k.id).km} km vom Hof`)),
      el('div', { class: 'knopfreihe' },
        knopf('Bearbeiten', { class: 'knopf zweit', id: 'kunde-bearbeiten' }, () => { kf.bearbeiten = { ...k, adresse: null }; renderKundeDetail(); }),
        knopf('Neuer Transport', { class: 'knopf', 'data-transport': k.id }, () => transportOeffnen(k.id)))),
    el('h3', {}, 'Mietgeräte'),
    vertraege.length ? el('div', { class: 'tab-rahmen' }, el('table', {}, el('tr', {}, ...['Gerät', 'Mietzeit', 'Laufzeit', 'Abholung', ''].map((x) => el('th', {}, x))), ...zeilen))
      : el('p', { class: 'hinweis' }, 'Zurzeit keine Mietgeräte.'));
}
// Adresse und Kontakt bearbeiten; eine neue Adresse wird über die Suche gewählt (damit Lage und Entfernung stimmen)
function kundeBearbeitenFelder(k) {
  const b = kf.bearbeiten;
  const text = (id, feld, titel) => { const i = el('input', { id, type: 'text', value: b[feld], maxlength: '80' }); i.addEventListener('input', (e) => { b[feld] = e.target.value; }); return el('label', {}, titel, i); };
  const treffer = el('ul', { class: 'treffer-liste', id: 'kb-treffer' });
  const suche = el('input', { id: 'kb-suche', type: 'search', placeholder: 'Neue Adresse suchen: Straße, Hausnummer, Ort', autocomplete: 'off' });
  suche.addEventListener('input', (e) => adresseSuchen(e.target.value, treffer, (t) => { b.adresse = t; renderKundeDetail(); }));
  const adresse = b.adresse || b;
  return [el('h2', {}, `${k.firma} bearbeiten`),
    el('div', { class: 'formular' },
      text('kb-firma', 'firma', 'Firma'), text('kb-person', 'ansprechpartner', 'Ansprechpartner'), text('kb-telefon', 'telefon', 'Telefon'),
      el('div', { class: 'breit' }, el('p', { id: 'kb-adresse' }, `Adresse: ${adresse.strasse}, ${adresse.plz} ${adresse.stadt}${b.adresse ? ' (neu)' : ''}`)),
      el('label', { class: 'breit' }, 'Andere Adresse', suche), el('div', { class: 'breit' }, treffer)),
    el('p', { class: 'meldung warn', id: 'kb-fehler', role: 'alert' }),
    el('div', { class: 'knopfreihe' }, knopf('Speichern', { class: 'knopf', id: 'kb-speichern' }, kundeSpeichern),
      knopf('Abbrechen', { class: 'knopf zweit', id: 'kb-abbrechen' }, () => { kf.bearbeiten = null; renderKundeDetail(); }))];
}
function kundeSpeichern() {
  const b = kf.bearbeiten;
  if (!b.firma.trim()) { $('#kb-fehler').textContent = 'Bitte die Firma eintragen.'; return; }
  const a = b.adresse || b;
  const k = { id: b.id, firma: b.firma.trim().slice(0, 80), strasse: a.strasse, plz: a.plz, stadt: a.stadt,
    ansprechpartner: b.ansprechpartner.trim().slice(0, 60), telefon: b.telefon.trim().slice(0, 40), lat: a.lat, lng: a.lng };
  const vorher = { ...finde(ORTE, k.id) };
  kundenEintragen([k]);
  const betroffen = stand.alleTouren.filter((t) => t.stopps?.some((h) => h.ort === k.id) && t.tag >= HEUTE);
  const kaputt = betroffen.filter((t) => !fahrplan(t.stopps.map(({ ort, art }) => ({ ort, art })), t.auftraege, t.start, finde(LKW, t.lkw).fs !== 'B'));
  if (kaputt.length) { // zurück zur alten Lage, sonst passen eingeplante Touren nicht mehr
    Object.assign(finde(ORTE, k.id), vorher);
    $('#kb-fehler').textContent = `Mit dieser Adresse gingen ${kaputt.length} eingeplante Tour(en) nicht mehr auf (${kaputt.map((t) => tagKurz(t.tag)).join(', ')}). Bitte die Tour(en) zuerst in der Woche stornieren.`;
    return;
  }
  stand.kunden = [...stand.kunden.filter((x) => x.id !== k.id), k];
  speichern(); planZuruecksetzen();
  kf.bearbeiten = null;
  renderKunden();
}

// ---------- Dialog „Neuer Transport“: ausliefern (neue Vermietung) oder abholen ----------
let nt = null;
const zeitOptionen = (von, bis) => { const z = []; for (let m = von; m <= bis; m += 30) z.push(el('option', { value: String(m) }, `${hhmm(m)} Uhr`)); return z; };
// kundeId: vorgewählter Kunde, 'neu' für einen neuen Kunden
function transportOeffnen(kundeId) {
  const start = datum >= HEUTE && !istSonntag(datum) ? datum : naechsterWerktag(tagPlus(HEUTE, 1));
  const neu = kundeId === 'neu' ? { firma: '', ansprechpartner: '', telefon: '', adresse: null } : null;
  nt = { art: 'Auslieferung', kunde: (!neu && kundeId) || alleKunden()[0].id, neu, geraet: GERAETE[0].id, von: start, liefernBis: 10 * 60,
    bis: naechsterWerktag(tagPlus(start, 28)), abholen: true, ab: 8 * 60, abBis: 16 * 60, vertrag: null, abholtag: start, fehler: '', ergebnis: null };
  renderTransport();
  if (!$('#dlg-transport').open) $('#dlg-transport').showModal();
}
function renderTransport() {
  const feld = (text, kind, breit) => el('label', breit ? { class: 'breit' } : {}, text, kind);
  const auswahl = (id, optionen, wert, aendern) => { const s = el('select', { id }, ...optionen); s.value = wert; s.addEventListener('change', (e) => aendern(e.target.value)); return s; };
  const datumFeld = (id, wert, aendern) => { const d = el('input', { id, type: 'date', min: HEUTE, value: wert }); d.addEventListener('change', (e) => aendern(e.target.value)); return d; };
  const reiter = el('div', { class: 'plan-reiter', role: 'tablist', 'aria-label': 'Art des Transports' },
    ...[['Auslieferung', 'Gerät ausliefern'], ['Abholung', 'Gerät abholen']].map(([art, text]) => el('button', { role: 'tab', 'data-nt-art': art,
      'aria-selected': String(nt.art === art), onclick: () => { nt.art = art; nt.fehler = ''; nt.ergebnis = null; renderTransport(); } }, text)));
  const kunden = [...alleKunden().map((k) => el('option', { value: k.id }, `${k.firma} (${k.stadt})`)), el('option', { value: 'neu' }, '+ Neuer Kunde …')];
  const teile = [reiter, el('div', { class: 'formular' },
    feld('Kunde', auswahl('nt-kunde', kunden, nt.neu ? 'neu' : nt.kunde, (w) => { if (w === 'neu') nt.neu = { firma: '', ansprechpartner: '', telefon: '', adresse: null }; else { nt.neu = null; nt.kunde = w; } nt.vertrag = null; renderTransport(); }), true))];
  if (nt.neu) teile.push(neuerKundeFelder());
  const form = el('div', { class: 'formular' });
  if (nt.art === 'Auslieferung') {
    form.append(
      feld('Gerät', auswahl('nt-geraet', GERAETE.map((g) => el('option', { value: g.id }, g.name)), nt.geraet, (w) => { nt.geraet = w; }), true),
      feld('Mietbeginn (Auslieferung)', datumFeld('nt-von', nt.von, (w) => { nt.von = w; })),
      feld('Spätestens beim Kunden', auswahl('nt-liefern', zeitOptionen(7 * 60 + 30, 17 * 60), String(nt.liefernBis), (w) => { nt.liefernBis = Number(w); })),
      feld('Mietende', datumFeld('nt-bis', nt.bis, (w) => { nt.bis = w; })),
      el('fieldset', { class: 'radio-zeile breit' }, el('legend', {}, 'Am Mietende'),
        ...[[true, 'Gerät abholen'], [false, 'nicht abholen (Kunde bringt es zurück)']].map(([wert, text]) => {
          const r = el('input', { type: 'radio', name: 'nt-abholen', value: String(wert), 'data-abholen': String(wert) });
          r.checked = nt.abholen === wert;
          r.addEventListener('change', () => { nt.abholen = wert; renderTransport(); });
          return el('label', {}, r, text);
        })));
    if (nt.abholen) form.append(abholFenster());
  } else {
    const vertraege = nt.neu ? [] : stand.vertraege.filter((v) => v.kunde === nt.kunde && v.bis >= HEUTE && abholStand(v)?.art !== 'eingeplant');
    if (!vertraege.length) form.append(el('p', { class: 'hinweis breit' }, 'Bei diesem Kunden steht kein Mietgerät zur Abholung an.'));
    else {
      if (!vertraege.some((v) => v.id === nt.vertrag)) { nt.vertrag = vertraege[0].id; nt.abholtag = naechsterWerktag(vertraege[0].bis < HEUTE ? HEUTE : vertraege[0].bis); }
      form.append(
        feld('Mietgerät', auswahl('nt-vertrag', vertraege.map((v) => el('option', { value: v.id }, `${finde(GERAETE, v.geraet).name} · gemietet bis ${tagKurz(v.bis)}`)), nt.vertrag,
          (w) => { nt.vertrag = w; nt.abholtag = naechsterWerktag(finde(stand.vertraege, w).bis); renderTransport(); }), true),
        feld('Abholtag', datumFeld('nt-abholtag', nt.abholtag, (w) => { nt.abholtag = w; })), abholFenster());
    }
  }
  teile.push(form);
  if (nt.fehler) teile.push(el('p', { class: 'meldung warn', id: 'nt-fehler', role: 'alert' }, nt.fehler));
  if (nt.ergebnis) teile.push(vorschlagsTeil());
  else teile.push(el('div', { class: 'knopfreihe' }, knopf('Speichern', { class: 'knopf gross', id: 'nt-speichern' }, transportSpeichern)));
  $('#dlg-transport-inhalt').replaceChildren(...teile);
}
function abholFenster() {
  const s = (id, wert, aendern) => { const x = el('select', { id }, ...zeitOptionen(7 * 60, 17 * 60)); x.value = String(wert); x.addEventListener('change', (e) => aendern(Number(e.target.value))); return x; };
  return el('div', { class: 'fenster' }, el('label', {}, 'Abholen ab', s('nt-ab', nt.ab, (w) => { nt.ab = w; })), el('label', {}, 'bis', s('nt-abbis', nt.abBis, (w) => { nt.abBis = w; })));
}
function neuerKundeFelder() {
  const text = (id, wert, platz, aendern) => { const i = el('input', { id, type: 'text', value: wert, placeholder: platz, maxlength: '80' }); i.addEventListener('input', (e) => aendern(e.target.value)); return i; };
  const treffer = el('ul', { class: 'treffer-liste', id: 'nt-treffer' });
  const suche = el('input', { id: 'nt-suche', type: 'search', placeholder: 'Straße, Hausnummer, Ort', autocomplete: 'off' });
  suche.addEventListener('input', (e) => adresseSuchen(e.target.value, treffer, (t) => { nt.neu.adresse = t; renderTransport(); }));
  return el('div', { class: 'formular' },
    el('label', {}, 'Firma', text('nt-firma', nt.neu.firma, 'z. B. Muster Bau GmbH', (w) => { nt.neu.firma = w; })),
    el('label', {}, 'Ansprechpartner', text('nt-person', nt.neu.ansprechpartner, 'Name', (w) => { nt.neu.ansprechpartner = w; })),
    el('label', {}, 'Telefon', text('nt-telefon', nt.neu.telefon, 'Nummer', (w) => { nt.neu.telefon = w; })),
    el('label', { class: 'breit' }, 'Adresse suchen', suche),
    el('div', { class: 'breit' }, treffer, el('p', { class: 'hinweis', id: 'nt-adresse' }, nt.neu.adresse
      ? `Gewählt: ${nt.neu.adresse.strasse}, ${nt.neu.adresse.plz} ${nt.neu.adresse.stadt}` : 'Die Adresssuche nutzt OpenStreetMap (Photon); die eingegebene Adresse geht an diesen Dienst.')));
}
let suchZeit = null;
function adresseSuchen(q, liste, waehlen) {
  clearTimeout(suchZeit);
  if (q.trim().length < 4) { liste.replaceChildren(); return; }
  suchZeit = setTimeout(async () => {
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q.slice(0, 120))}&limit=5&lang=de&bbox=5.8,47.2,15.1,55.1`);
      if (!res.ok) throw new Error('Suche');
      const treffer = ((await res.json())?.features || []).map(adresseAus).filter(Boolean);
      liste.replaceChildren(...(treffer.length ? treffer.map((t) => el('li', {}, knopf(`${t.strasse}, ${t.plz} ${t.stadt}`, { class: 'treffer' }, () => waehlen(t))))
        : [el('li', { class: 'hinweis' }, 'Keine passende Adresse gefunden.')]));
    } catch (e) { liste.replaceChildren(el('li', { class: 'hinweis' }, 'Adresssuche gerade nicht erreichbar.')); }
  }, 350);
}
function adresseAus(f) { // Treffer der Adresssuche prüfen und auf die Felder eines Kunden bringen
  const p = f?.properties || {}, c = f?.geometry?.coordinates;
  const strasse = [p.street || p.name, p.housenumber].filter(Boolean).join(' ').slice(0, 80);
  const plz = String(p.postcode || ''), stadt = String(p.city || p.town || p.village || p.district || '').slice(0, 60);
  if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || !/^\d{5}$/.test(plz) || !strasse || !stadt) return null;
  if (c[1] < 47 || c[1] > 55.5 || c[0] < 5.5 || c[0] > 15.5) return null;
  return { strasse, plz, stadt, lat: c[1], lng: c[0] };
}
const MAX_AUFTRAEGE = 20; // offene Transporte je Tag, damit die Berechnung in der Demo schnell bleibt
function transportSpeichern() {
  const fehler = (text) => { nt.fehler = text; renderTransport(); };
  const tagOk = (tag) => istTag(tag) && tag >= HEUTE && !istSonntag(tag);
  const voll = (tag) => stand.alleAuftraege.filter((a) => a.tag === tag).length >= MAX_AUFTRAEGE;
  let kunde = nt.kunde;
  if (nt.neu) {
    const n = nt.neu;
    if (!n.firma.trim()) return fehler('Bitte die Firma eintragen.');
    if (!n.adresse) return fehler('Bitte eine Adresse über die Suche auswählen.');
    kunde = 'K' + String(++stand.nr).padStart(3, '0');
    const k = { id: kunde, firma: n.firma.trim().slice(0, 80), strasse: n.adresse.strasse, plz: n.adresse.plz, stadt: n.adresse.stadt,
      ansprechpartner: n.ansprechpartner.trim().slice(0, 60), telefon: n.telefon.trim().slice(0, 40), lat: n.adresse.lat, lng: n.adresse.lng };
    stand.kunden.push(k);
    kundenEintragen([k]);
  }
  let auftrag;
  if (nt.art === 'Auslieferung') {
    if (!tagOk(nt.von)) return fehler('Mietbeginn: ein Werktag ab heute (sonntags wird nicht gefahren).');
    if (!istTag(nt.bis) || nt.bis < nt.von || (nt.abholen && istSonntag(nt.bis))) return fehler('Mietende: frühestens der Mietbeginn, für eine Abholung kein Sonntag.');
    if (nt.abholen && nt.ab > nt.abBis) return fehler('Abholfenster: „ab“ muss vor „bis“ liegen.');
    if (voll(nt.von) || (nt.abholen && voll(nt.bis))) return fehler(`In der Demo höchstens ${MAX_AUFTRAEGE} offene Transporte je Tag.`);
    const v = { id: 'M' + String(++stand.nr).padStart(2, '0'), kunde, geraet: nt.geraet, von: nt.von, bis: nt.bis, abholen: nt.abholen };
    stand.vertraege.push(v);
    auftrag = { id: 'B' + (++stand.nr), tag: v.von, art: 'Auslieferung', vertrag: v.id, geraet: v.geraet, ort: kunde, bis: nt.liefernBis };
    stand.alleAuftraege.push(auftrag);
    if (nt.abholen) stand.alleAuftraege.push({ id: 'B' + (++stand.nr), tag: v.bis, art: 'Abholung', vertrag: v.id, geraet: v.geraet, ort: kunde, ab: nt.ab, bis: nt.abBis });
  } else {
    const v = finde(stand.vertraege, nt.vertrag);
    if (!v) return fehler('Bitte ein Mietgerät wählen.');
    if (!tagOk(nt.abholtag)) return fehler('Abholtag: ein Werktag ab heute.');
    if (nt.abholtag < v.von) return fehler(`Abholtag: frühestens zum Mietbeginn (${tagKurz(v.von)}).`);
    if (nt.ab > nt.abBis) return fehler('Abholfenster: „ab“ muss vor „bis“ liegen.');
    if (voll(nt.abholtag)) return fehler(`In der Demo höchstens ${MAX_AUFTRAEGE} offene Transporte je Tag.`);
    stand.alleAuftraege = stand.alleAuftraege.filter((a) => !(a.vertrag === v.id && istAbholung(a)));
    v.bis = nt.abholtag; v.abholen = true;
    auftrag = { id: 'B' + (++stand.nr), tag: nt.abholtag, art: 'Abholung', vertrag: v.id, geraet: v.geraet, ort: v.kunde, ab: nt.ab, bis: nt.abBis };
    stand.alleAuftraege.push(auftrag);
  }
  speichern();
  planZuruecksetzen(); meldung = null;
  nt.fehler = '';
  nt.ergebnis = { auftrag, vorschlaege: einzelVorschlaege(auftrag) };
  renderTransport();
  allesNeu();
}
// Nach dem Speichern: gleich einplanen (auf eine schon geplante Fahrt, eigener Lkw, Spedition) oder später mit der Tagesplanung
function vorschlagsTeil() {
  const { auftrag, vorschlaege, erledigt } = nt.ergebnis, g = finde(GERAETE, auftrag.geraet);
  const kopf = el('p', { class: 'meldung' }, `Gespeichert: ${g.name} ${artWort(auftrag)} bei ${ortName(auftrag.ort)} am ${tagKurz(auftrag.tag)}`);
  if (erledigt) return el('div', { id: 'nt-vorschlaege' }, kopf, el('p', { class: 'meldung', role: 'status' }, erledigt));
  const zeile = (v, i) => {
    const text = v.art === 'dazu' ? `Auf die schon geplante Fahrt von ${finde(LKW, v.tour.lkw).kz} (${zielText(v.tour)}) dazu: ${v.mehrKm >= 0 ? '+' : ''}${v.mehrKm} km, zurück ${hhmm(v.neu.ende)} Uhr`
      : v.art === 'eigen' ? `Eigene Fahrt mit ${v.neu.lkw.kz}, ${v.fahrer.name} fährt ${hhmm(v.neu.start)}–${hhmm(v.neu.ende)} Uhr, ca. ${euro(sammelKosten(v.neu))}`
        : `An Spedition: ${v.grund}, ca. ${euro(kostenSpedition(auftrag))}`;
    return el('li', { 'data-vorschlag': v.art }, el('span', {}, text), knopf('Einplanen', { class: i ? 'knopf zweit klein' : 'knopf klein' }, () => vorschlagEinplanen(v)));
  };
  return el('div', { id: 'nt-vorschlaege' }, kopf, el('h3', {}, 'Gleich einplanen?'), el('ol', { class: 'vorschlaege' }, ...vorschlaege.map(zeile)),
    el('div', { class: 'knopfreihe' }, knopf('Später mit der Tagesplanung', { class: 'knopf zweit', id: 'nt-spaeter' }, () => $('#dlg-transport').close())));
}
function vorschlagEinplanen(v) {
  const a = nt.ergebnis.auftrag;
  if (v.art === 'dazu') {
    Object.assign(v.tour, { start: v.neu.start, stopps: tourSpeicherform(v.neu, v.tour.fahrer, a.tag).stopps, auftraege: v.neu.auftraege.map((x) => ({ ...x })) });
    stand.nr--; // tourSpeicherform hat eine Nummer gezogen, die bestehende Tour behält ihre
  } else if (v.art === 'eigen') {
    stand.alleTouren.push(tourSpeicherform(v.neu, v.fahrer.id, a.tag));
  } else {
    stand.alleSped.push(spedSpeicherform(a, v.grund));
  }
  stand.alleAuftraege = stand.alleAuftraege.filter((x) => x.id !== a.id);
  speichern(); planZuruecksetzen();
  nt.ergebnis.erledigt = v.art === 'sped' ? 'An die Spedition übergeben.' : `Eingeplant am ${tagKurz(a.tag)}, steht in der Woche.`;
  renderTransport();
  allesNeu();
}

// ---------- Woche: Tag, Woche, Monat ----------
const pos = (m) => ((Math.max(TAG_START, Math.min(TAG_ENDE, m)) - TAG_START) / SPANNE) * 100;
const ladungKurz = (t) => tourGeraete(t).map((g) => g.kurz).join(', ');
function renderTafel() {
  const kopf = el('div', { class: 'zeile kopfzeile' }, el('div', { class: 'label' }, el('strong', {}, 'Lkw')));
  const stunden = el('div', { class: 'spur' });
  for (let h = 6; h < 19; h++) stunden.append(el('span', {}, `${h}:00`));
  kopf.append(stunden);
  const zeilen = LKW.map((l) => {
    const spur = el('div', { class: 'spur' }, datum === HEUTE ? el('div', { class: 'jetzt', style: `left:${pos(zeit)}%` }) : null);
    const touren = stand.touren.filter((t) => t.lkw === l.id).sort((a, b) => a.start - b.start);
    if (!touren.length) spur.append(el('div', { class: 'frei-hinweis' + (inWerkstatt(l.id) ? ' werkstatt' : '') }, inWerkstatt(l.id) ? 'in der Werkstatt' : 'ganztägig frei'));
    for (const t of touren) {
      const f = finde(FAHRER, t.fahrer), links = pos(t.start), breite = pos(ende(t)) - links;
      spur.append(el('button', {
        class: 'block' + (inWerkstatt(l.id, t.tag) ? ' konflikt' : ''), 'data-art': t.art, 'data-status': status(t), 'data-tour': t.id,
        style: `left:${links}%;width:${breite}%`,
        title: `${inWerkstatt(l.id, t.tag) ? 'Konflikt: Lkw in der Werkstatt. ' : ''}${t.art} ${zielText(t)}, ${hhmm(t.start)}–${hhmm(ende(t))}, ${ladungKurz(t)}, ${f.name}`,
        onclick: () => zeigeTour(t.id),
      }, el('b', {}, zielText(t)), el('span', {}, `${ladungKurz(t)} · ${f.name.split(' ')[0]}`)));
    }
    return el('div', { class: 'zeile' },
      el('div', { class: 'label' }, el('strong', {}, l.kz, inWerkstatt(l.id) ? marke('Werkstatt', 'weg') : null), el('small', {}, l.typ), el('small', {}, `${zahl(l.nutzlast, 1)} t · ${zahl(l.laenge, 1)} m · Kl. ${l.fs}`)),
      spur);
  });
  $('#tafel').replaceChildren(kopf, ...zeilen);
}
let planAnsicht = 'tag';
function planReiter(art) {
  planAnsicht = art;
  document.querySelectorAll('#v-plantafel .plan-reiter button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.plan === art)));
  for (const a of ['tag', 'woche', 'monat']) $('#plan-' + a).hidden = a !== art;
  renderPlan();
}
function renderPlan() {
  if (planAnsicht === 'woche') renderWoche();
  else if (planAnsicht === 'monat') renderMonat();
  else renderTafel();
}
const toureAm = (tag) => stand.alleTouren.filter((t) => t.tag === tag).sort((a, b) => a.start - b.start);
function navKnopf(richtung, text, aktion) {
  return el('button', { class: 'knopf zweit klein symbol', 'aria-label': text, title: text, onclick: aktion }, icon(richtung));
}
function renderWoche() {
  const start = wochenStart(datum), tage = [0, 1, 2, 3, 4, 5].map((i) => tagPlus(start, i));
  const zelleKlasse = (tag) => [tag === HEUTE ? 'heute' : '', tag === datum ? 'gewaehlt' : ''].join(' ').trim();
  const kopf = el('tr', {}, el('th', {}, 'Lkw'), ...tage.map((tag) => {
    const tt = toureAm(tag), frei = LKW.filter((l) => !inWerkstatt(l.id, tag) && !tt.some((t) => t.lkw === l.id)).length;
    return el('th', { class: zelleKlasse(tag) }, el('button', { onclick: () => { datumSetzen(tag); planReiter('tag'); }, title: `${tagLang(tag)} öffnen` },
      tagKurz(tag), el('small', {}, `${tt.length} Touren · ${frei} Lkw frei`)));
  }));
  const zeilen = LKW.map((l) => el('tr', {}, el('td', { class: 'lkw' }, l.kz, el('small', {}, `${zahl(l.nutzlast, 1)} t`)),
    ...tage.map((tag) => {
      const tt = toureAm(tag).filter((t) => t.lkw === l.id);
      const werkstatt = inWerkstatt(l.id, tag) ? [marke('Werkstatt', 'weg')] : [];
      return el('td', { class: zelleKlasse(tag) }, ...werkstatt, ...(tt.length ? tt.map((t) => el('button', {
        class: 'wchip ' + (t.stopps ? 'sammel' : t.art === 'Abholung' ? 'abholung' : '') + (werkstatt.length ? ' konflikt' : ''), 'data-tour': t.id,
        title: `${t.art} ${zielText(t)} · ${ladungKurz(t)}`, onclick: () => zeigeTour(t.id),
      }, el('b', {}, hhmm(t.start)), zielText(t))) : werkstatt.length ? [] : [el('span', { class: 'frei' }, 'frei')]));
    })));
  const sped = el('tr', {}, el('td', { class: 'lkw' }, 'Spedition'), ...tage.map((tag) => {
    const n = stand.alleSped.filter((x) => x.tag === tag).length;
    return el('td', { class: zelleKlasse(tag) }, n ? `${n} Auftr${n === 1 ? 'ag' : 'äge'}` : el('span', { class: 'frei' }, '–'));
  }));
  $('#plan-woche').replaceChildren(
    el('div', { class: 'plan-nav' },
      navKnopf('links', 'Vorherige Woche', () => datumSetzen(tagPlus(datum, -7))),
      el('strong', {}, `KW ${kalenderwoche(start)} · ${tagKurz(tage[0])} bis ${tagKurz(tage[5])}`),
      navKnopf('rechts', 'Nächste Woche', () => datumSetzen(tagPlus(datum, 7)))),
    el('div', { class: 'tab-rahmen' }, el('table', { class: 'woche' }, kopf, ...zeilen, sped)));
}
function renderMonat() {
  const erster = datum.slice(0, 8) + '01';
  let tag = wochenStart(erster);
  const zellen = WOCHENTAGE.slice(1).concat('So').map((w) => el('div', { class: 'wtag' }, w));
  do {
    for (let i = 0; i < 7; i++, tag = tagPlus(tag, 1)) {
      const tt = toureAm(tag), einsatz = new Set(tt.map((t) => t.lkw)).size, sp = stand.alleSped.filter((x) => x.tag === tag).length;
      const t0 = tag;
      zellen.push(el('button', {
        class: ['mtag', tag.slice(5, 7) !== erster.slice(5, 7) ? 'anders' : '', wochentag(tag) % 6 === 0 ? 'wochenende' : '', tag === HEUTE ? 'heute' : '', tag === datum ? 'gewaehlt' : ''].join(' ').trim(),
        'data-tag': tag, title: `${tagLang(tag)} öffnen`, onclick: () => { datumSetzen(t0); planReiter('tag'); },
      }, el('span', { class: 'zahl-tag' }, String(Number(tag.slice(8)))),
      ...(tt.length ? [el('span', {}, `${tt.length} Touren`), el('span', { class: 'auslastung' }, el('i', { style: `width:${einsatz / LKW.length * 100}%` })),
        el('small', {}, `${einsatz} von ${LKW.length} Lkw`)] : []),
      ...(sp ? [el('small', {}, `${sp} Spedition`)] : [])));
    }
  } while (tag.slice(5, 7) === erster.slice(5, 7));
  const vorMonat = tagPlus(erster, -1).slice(0, 8) + '01', nachMonat = tagPlus(erster, 32).slice(0, 8) + '01';
  $('#plan-monat').replaceChildren(
    el('div', { class: 'plan-nav' },
      navKnopf('links', 'Vorheriger Monat', () => datumSetzen(vorMonat)),
      el('strong', {}, `${MONATE[Number(erster.slice(5, 7)) - 1]} ${erster.slice(0, 4)}`),
      navKnopf('rechts', 'Nächster Monat', () => datumSetzen(nachMonat))),
    el('div', { class: 'monat' }, ...zellen));
}

// ---------- Tour im Dialog ----------
// Halte einer gespeicherten Tour für den Ladeplan; eine Einzeltour hat einen Halt
const halteVon = (t) => (t.stopps ? t.stopps.map((h) => ({ ...h, geraete: [...h.geraete] }))
  : [{ ort: t.ort, art: t.art === 'Abholung' ? 'Abholung' : 'Auslieferung', geraete: [t.geraet] }]);
function zeigeTour(id) {
  const t = finde(stand.alleTouren, id);
  if (!t) return;
  const l = finde(LKW, t.lkw), f = finde(FAHRER, t.fahrer), st = status(t);
  const grund = ladungGrund(l, halteVon(t).map((h) => ({ ...h, auftraege: h.geraete.map((g) => ({ geraet: g })) })));
  const zeile = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
  const ladung = (p) => (p.ladung?.length ? p.ladung.map((g) => finde(GERAETE, g).kurz).join(', ') : '–');
  const konflikt = inWerkstatt(t.lkw, t.tag);
  $('#dlg-tour-titel').textContent = `${t.art} ${zielText(t)}`;
  $('#dlg-tour-inhalt').replaceChildren(
    ...(konflikt ? [el('p', { class: 'werkstatt-hinweis', id: 'dlg-konflikt' }, `${l.kz} ist an diesem Tag in der Werkstatt. Diese Tour bitte stornieren und neu planen.`)] : []),
    el('dl', { class: 'daten' },
      ...zeile('Status', marke(st, st === 'unterwegs' ? 'unterwegs' : st === 'erledigt' ? 'grau' : 'frei')),
      ...zeile('Tag', tagLang(t.tag)),
      ...zeile('Zeit', `${hhmm(t.start)} ab Hof – ${hhmm(ende(t))} zurück (${ende(t) - t.start} Min.)`),
      ...zeile('Strecke', `${kmTour(t)} km gesamt`),
      ...zeile('Lkw', `${l.kz} · ${l.typ}`),
      ...zeile('Fahrer', `${f.name} (Kl. ${f.fs})`),
      ...zeile('Ladung', tourGeraete(t).map((g) => g.name).join(' · ')),
      ...zeile('Ladeprüfung', grund ? el('div', { class: 'g-nein' }, grund) : el('div', { class: 'g-ok' }, 'passt: Rampe, Zonen, Zurrpunkte, Achslast und Reihenfolge geprüft'))),
    el('h2', {}, 'Ablauf'),
    el('div', { class: 'tab-rahmen' }, el('table', {},
      el('tr', {}, el('th', {}, 'Zeit'), el('th', {}, 'Abschnitt'), el('th', { class: 'zahl' }, 'km'), el('th', {}, 'Ladung')),
      ...phasen(t).map((p) => el('tr', { class: t.tag === HEUTE && p.von <= zeit && zeit < p.bis ? 'aktiv' : '' },
        el('td', {}, `${hhmm(p.von)}–${hhmm(p.bis)}`),
        el('td', {}, p.typ === 'fahrt' ? `Fahrt von ${ortKurz2(p.von_ort)} nach ${ortKurz2(p.nach)}` : p.typ === 'pause' ? `Pause (${ortKurz2(p.wo)})` : `${p.text} (${ortKurz2(p.wo)})`),
        el('td', { class: 'zahl' }, p.typ === 'fahrt' ? p.km : ''),
        el('td', {}, ladung(p)))))),
    el('div', { class: 'knopfreihe' },
      knopf('Im Ladeplan ansehen', { class: 'knopf klein' }, () => ladeplanOeffnen(t.lkw, halteVon(t))),
      ...(t.stopps ? [knopf('Ladeliste drucken', { class: 'knopf zweit klein', id: 'dlg-ladeliste' }, () => ladelisteDrucken(fahrtAus(t), t.tag), konflikt)] : []),
      knopf('Tour stornieren', { class: 'knopf zweit klein' }, () => {
        stand.alleTouren = stand.alleTouren.filter((x) => x.id !== id);
        // Geräte einer stornierten Sammeltour sind wieder offen
        for (const a of t.auftraege || []) if (!stand.alleAuftraege.some((x) => x.id === a.id && x.tag === a.tag)) stand.alleAuftraege.push({ ...a });
        speichern(); $('#dlg-tour').close(); planZuruecksetzen(); allesNeu();
      })));
  $('#dlg-tour').showModal();
}

// ---------- Fahrzeuge ----------
// Seitenansicht eines Lkw: Zonen mit Höhe, Stufe, Zurrpunkte (gelb), Rampe mit Steigung bzw. Ladebordwand
function seitenansicht(l) {
  const hinten = l.zonen[l.zonen.length - 1].hoehe;
  const rampeL = l.rampe.art === 'rampe' ? hinten / Math.tan(l.rampe.winkel * Math.PI / 180) : 1.2;
  const s = Math.min(21, 310 / (2.6 + l.laenge + rampeL + 0.4)), boden = 100, x0 = 8; // 4 m Höhe passen immer ins Bild
  const kabL = 2.3 * s, kabH = (l.nutzlast < 2 ? 2.1 : 2.6) * s, r = Math.max(4, 0.45 * s);
  const deckX = x0 + kabL + 0.3 * s, y = (h) => boden - h * s;
  const teile = [
    sv('rect', { x: 0, y: boden, width: 330, height: 8, fill: '#e3e9f1' }),
    sv('line', { x1: 0, y1: y(MAX_HOEHE), x2: 330, y2: y(MAX_HOEHE), stroke: '#d64545', 'stroke-dasharray': '4 3', 'stroke-width': 1 }),
    sv('text', { x: 326, y: y(MAX_HOEHE) - 3, 'text-anchor': 'end', 'font-size': 9, fill: '#d64545' }, '4,00 m'),
    sv('rect', { x: x0, y: boden - r - kabH, width: kabL, height: kabH, rx: 6, fill: '#fff', stroke: '#b9c4d0' }),
    sv('rect', { x: x0 + kabL * 0.5, y: boden - r - kabH + 0.25 * s, width: kabL * 0.38, height: kabH * 0.3, rx: 2, fill: '#28343f' }),
    sv('rect', { x: x0, y: boden - r - kabH * 0.38, width: kabL, height: 0.3 * s, fill: '#27a849' }),
  ];
  let a = 0, vorher = null;
  for (const z of l.zonen) {
    const zx = deckX + a * s;
    if (vorher !== null && vorher !== z.hoehe) teile.push(sv('line', { x1: zx, y1: y(vorher), x2: zx, y2: y(z.hoehe), stroke: '#6a7178', 'stroke-width': 3 }));
    teile.push(sv('rect', { x: zx, y: y(z.hoehe), width: z.laenge * s, height: 0.2 * s, fill: '#8a949c' }));
    // Maßkette unter dem Fahrzeug: Strich an jeder Zonengrenze, Name und Länge, wenn Platz ist, sonst nur die Länge
    const breite = z.laenge * s, lang = `${l.zonen.length > 1 ? z.name + ' ' : ''}${zahl(z.laenge, 1)} m`;
    teile.push(sv('line', { x1: zx, y1: 110, x2: zx, y2: 118, stroke: '#9aa3ab' }));
    teile.push(sv('text', { x: zx + breite / 2, y: 126, 'text-anchor': 'middle', 'font-size': 8.5, fill: '#5b6770' },
      lang.length * 4.6 < breite - 4 ? lang : `${zahl(z.laenge, 1)} m`));
    a += z.laenge; vorher = z.hoehe;
  }
  teile.push(sv('line', { x1: deckX, y1: 114, x2: deckX + l.laenge * s, y2: 114, stroke: '#9aa3ab' }),
    sv('line', { x1: deckX + l.laenge * s, y1: 110, x2: deckX + l.laenge * s, y2: 118, stroke: '#9aa3ab' }));
  const deckEnde = deckX + l.laenge * s;
  if (l.rampe.art === 'rampe') {
    teile.push(sv('line', { x1: deckEnde, y1: y(hinten), x2: deckEnde + rampeL * s, y2: boden, stroke: '#9aa3ab', 'stroke-width': 3 }));
    teile.push(sv('text', { x: deckEnde + 6, y: boden - 4, 'font-size': 9, fill: '#5b6770' }, `${l.rampe.winkel}°`));
  } else {
    teile.push(sv('rect', { x: deckEnde, y: y(hinten), width: 1.2 * s, height: 0.12 * s, fill: '#9aa3ab' }));
    teile.push(sv('text', { x: deckEnde + 2, y: y(hinten) - 4, 'font-size': 8.5, fill: '#5b6770' }, 'Ladebordwand'));
  }
  const zoneBei = (p) => { let b0 = 0; for (const z of l.zonen) { if (p <= b0 + z.laenge + 1e-9) return z; b0 += z.laenge; } return l.zonen[l.zonen.length - 1]; };
  for (const p of l.zurr) teile.push(sv('circle', { cx: deckX + p * s, cy: y(zoneBei(p).hoehe) - 2.5, r: 2.6, fill: '#f2b705', stroke: '#8a6d00', 'stroke-width': 0.8 }));
  const raeder = [x0 + kabL * 0.5, ...(l.laenge > 11 ? [l.laenge - 2.2, l.laenge - 1.0] : l.laenge > 7 ? [l.laenge - 1.8, l.laenge - 0.7] : [l.laenge - 1.1]).map((m) => deckX + m * s)];
  for (const ax of raeder) teile.push(sv('circle', { cx: ax, cy: boden - r, r, fill: '#1f2326' }), sv('circle', { cx: ax, cy: boden - r, r: r * 0.45, fill: '#d5dbe0' }));
  return sv('svg', { viewBox: '0 0 330 130', role: 'img', 'aria-label': `Seitenansicht ${l.kz}: ${l.zonen.map((z) => `${z.name} ${zahl(z.laenge, 1)} m auf ${zahl(z.hoehe)} m`).join(', ')}` }, ...teile);
}
function renderFuhrpark() {
  const zeile = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
  $('#steckbriefe').replaceChildren(...LKW.map((l) => el('article', { class: 'steckbrief', 'data-lkw': l.id },
    el('h3', {}, l.kz, ' ', inWerkstatt(l.id) ? marke(`Werkstatt ${tagKurz(datum)}`, 'weg') : null, el('small', {}, l.typ)),
    lkwBild(l) ? el('img', { class: 'lkw-bild', src: lkwBild(l), alt: `3D-Ansicht ${l.kz}, ${l.typ}` }) : null,
    seitenansicht(l),
    el('dl', { class: 'daten' },
      ...zeile('Nutzlast', `${zahl(l.nutzlast, 1)} t · Klasse ${l.fs}`),
      ...zeile('Ladefläche', l.zonen.map((z) => `${z.name} ${zahl(z.laenge, 1)} m auf ${zahl(z.hoehe)} m`).join(' · ')),
      ...zeile('Nutzbreite', `${zahl(l.nutzbreite)} m zwischen Bordwänden bzw. Rungen`),
      ...zeile('Auffahren', l.rampe.art === 'rampe' ? `Rampe ${l.rampe.winkel}° (${Math.round(prozent(l.rampe.winkel))} %), Kante ${l.rampe.knick}°`
        : `Ladebordwand bis ${zahl(l.rampe.traglast)} t, ${zahl(l.rampe.laenge, 1)} m`),
      ...zeile('Zurrpunkte', `${l.zurr.length} Paare, halten je ${zahl(l.zurrLast, 1)} t`),
      ...zeile('Achslast frei', `${l.typ.startsWith('Sattelzug') ? 'Sattelkupplung' : 'vorn'} ${zahl(l.achsen.vorn.frei, 1)} t · ${l.typ.startsWith('Sattelzug') ? 'Aggregat' : 'hinten'} ${zahl(l.achsen.hinten.frei, 1)} t`)),
    el('div', { class: 'knopfreihe' }, knopf('Im Ladeplan ansehen', { class: 'knopf zweit klein' }, () => ladeplanOeffnen(l.id, [{ ort: null, art: 'Auslieferung', geraete: [] }])),
      knopf(inWerkstatt(l.id) ? 'Aus der Werkstatt zurück' : `In die Werkstatt (${tagKurz(datum)})`, { class: 'knopf zweit klein', 'data-werkstatt': l.id },
        () => werkstattSetzen(l.id, !inWerkstatt(l.id)))))));
  const kopfzeile = (...spalten) => el('tr', {}, ...spalten.map((s) => el('th', s.startsWith('#') ? { class: 'zahl' } : {}, s.replace(/^#/, ''))));
  $('#tab-fahrer').replaceChildren(
    kopfzeile('Name', 'Klasse', 'Stand', `#Touren ${datum === HEUTE ? 'heute' : tagKurz(datum)}`),
    ...FAHRER.map((f) => el('tr', {}, el('td', {}, f.name), el('td', {}, f.fs),
      el('td', {}, f.abwesend ? marke(`${f.abwesend} (heute)`, 'weg') : marke('verfügbar', 'frei')),
      el('td', { class: 'zahl' }, stand.touren.filter((t) => t.fahrer === f.id).length))));
  $('#tab-geraete').replaceChildren(
    kopfzeile('Gerät', '#Gewicht', '#L × B × H', '#Steigfähigkeit', '#Bodenfreiheit', 'passt ohne Genehmigung auf'),
    ...GERAETE.map((g) => {
      const ok = LKW.filter((l) => ladepruefung(g, l).ergebnis === 'ok').map((l) => l.kz.replace('E-HR ', ''));
      return el('tr', {}, el('td', {}, g.name),
        el('td', { class: 'zahl' }, `${zahl(g.gewicht, 1)} t`),
        el('td', { class: 'zahl' }, `${zahl(g.l)} × ${zahl(g.b)} × ${zahl(g.h)} m`),
        el('td', { class: 'zahl' }, `${g.steig} %`),
        el('td', { class: 'zahl' }, `${Math.round(g.boden * 100)} cm`),
        el('td', {}, ok.length ? ok.join(', ') : marke('keinem', 'weg')));
    }));
}

// ---------- Rundgang: kurze Geschichte beim ersten Öffnen, danach über den Knopf ----------
const RUNDGANG_GESEHEN = 'reiter-dispo-rundgang';
const RUNDGANG = [
  { ziel: () => $('#auftrag-liste') || $('#plan-auftraege'), titel: () => `${offeneAuftraege().length} Transporte morgen`,
    text: () => `Auslieferungen zum Mietbeginn und Abholungen zum Mietende bei ${new Set(offeneAuftraege().map((a) => a.ort)).size} Kunden. Jedes Gerät passt nur auf bestimmte Lkw: Rampe, Kante, Zurrpunkte, Breite, Gewicht und Achslast müssen stimmen.` },
  { ziel: () => $('#beladung-berechnen'), titel: () => 'Ein Klick statt Ausprobieren',
    text: () => 'Statt Gerät für Gerät aufzuladen und dann zu merken, dass das dritte nicht mehr passt, rechnet das System alle sinnvollen Ladevarianten durch.' },
  { vorher: () => { if (!plan) planBerechnen(); }, ziel: () => $('#plan-pruef'), titel: () => 'Das wurde geprüft',
    text: () => `${plan.varianten} Ladevarianten, jede gegen ${REGELN_ANZAHL} Regeln, dazu die Pausen- und Lenkzeiten jedes Fahrers. Von Hand ist das nicht zu schaffen.` },
  { vorher: () => fahrtWaehlen((t) => t.halte.length === 3), ziel: () => $('.fahrt-zeile[aria-pressed="true"]'), titel: () => 'Ausliefern und auf dem Rückweg abholen',
    text: () => 'Eine Fahrt bringt Geräte zu mehreren Kunden und nimmt auf dem Rückweg ein Gerät mit, dessen Miete endet. Was beim ersten Kunden herunter muss, steht hinten an der Rampe.' },
  { vorher: () => fahrtWaehlen((t) => begruendungen(t).some(([, txt]) => txt.includes('Zurrpunkt'))), ziel: () => $('#detail-inhalt'), titel: () => 'Jede Entscheidung mit Grund',
    text: () => 'Zum Beispiel, warum ein Gerät nicht mehr mitpasst oder ein freier Lkw nicht taugt, oft wegen der Zurrpunkte. Über „anderer Lkw“ lässt sich jedes Gerät von Hand umlegen, die Prüfung läuft sofort neu.' },
  { ziel: () => $('.detail-unten'), titel: () => 'Die Route Etappe für Etappe',
    text: () => 'Links eine Fahrt wählen, hier stehen ihre Etappen vom Hof bis zurück, mit Zeit, Kilometern und was ab- oder aufgeladen wird. Ein Klick auf eine Etappe hebt ihre Strecke auf der Karte hervor.' },
  { ziel: () => $('#detail-3d'), titel: () => 'Die Ladung in 3D',
    text: () => 'So steht jedes Gerät auf der Ladefläche, mit Stoppnummer, Zonen und Zurrpunkten; zum Drehen seitlich ziehen. Im Ladeplan lässt sich alles nachprüfen und ändern. Die Ladeliste für den Fahrer gibt es zum Drucken; fällt ein Lkw aus, rechnet der Plan sofort neu.' },
  { ziel: () => $('.marken'), titel: () => 'Made by GOAT code',
    text: () => 'Diesen Rundgang gibt es jederzeit wieder über den Knopf „Rundgang“ oben rechts.' },
];
// Rundgang: die erste Fahrt wählen, auf die bed passt (sonst bleibt die Auswahl)
function fahrtWaehlen(bed) { const i = plan ? plan.touren.findIndex(bed) : -1; if (i >= 0 && i !== planGewaehlt) { planGewaehlt = i; renderPlanen(); } }
let rg = null;
function rundgangStarten() {
  if (datum !== ladetag()) datumSetzen(ladetag());
  waehleAnsicht('planen');
  planZuruecksetzen(); meldung = null; renderPlanen();
  if (!rg) {
    rg = { schritt: 0, huelle: el('div', { class: 'rundgang', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rg-titel' }) };
    document.body.append(rg.huelle);
  }
  $('.app').inert = true; // Hintergrund weder per Maus noch per Tab erreichbar
  rg.schritt = 0;
  rundgangZeigen();
}
function rundgangEnde() {
  try { localStorage.setItem(RUNDGANG_GESEHEN, 'ja'); } catch (e) { /* ohne Speicher startet er beim nächsten Öffnen wieder */ }
  rg?.huelle.remove();
  rg = null;
  $('.app').inert = false;
  $('#rundgang-knopf').focus();
}
function rundgangZeigen() {
  const s = RUNDGANG[rg.schritt], letzter = rg.schritt === RUNDGANG.length - 1;
  s.vorher?.();
  const weiter = knopf(letzter ? 'Fertig' : 'Weiter', { class: 'knopf', id: 'rg-weiter' }, () => { if (letzter) rundgangEnde(); else { rg.schritt++; rundgangZeigen(); } });
  const karte = el('div', { class: 'rg-karte' },
    el('h2', { id: 'rg-titel' }, s.titel()), el('p', {}, s.text()),
    el('div', { class: 'rg-fuss' }, el('span', { class: 'rg-zahl' }, `${rg.schritt + 1} von ${RUNDGANG.length}`),
      knopf('Überspringen', { class: 'knopf zweit', id: 'rg-ueberspringen' }, rundgangEnde),
      ...(rg.schritt ? [knopf('Zurück', { class: 'knopf zweit', id: 'rg-zurueck' }, () => { rg.schritt--; rundgangZeigen(); })] : []),
      weiter));
  const loch = el('div', { class: 'rg-loch' });
  rg.huelle.replaceChildren(loch, karte);
  const ziel = s.ziel();
  ziel?.scrollIntoView({ block: 'center' });
  rundgangPlatzieren();
  weiter.focus();
}
function rundgangPlatzieren() {
  if (!rg) return;
  const ziel = RUNDGANG[rg.schritt].ziel(), loch = rg.huelle.querySelector('.rg-loch'), karte = rg.huelle.querySelector('.rg-karte');
  const r = ziel ? ziel.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0, bottom: innerHeight / 2 };
  const rand = 6, oben = Math.max(4, r.top - rand), links = Math.max(4, r.left - rand);
  Object.assign(loch.style, { top: `${oben}px`, left: `${links}px`, width: `${Math.min(innerWidth - 8, r.width + 2 * rand)}px`, height: `${Math.min(innerHeight - 8, r.height + 2 * rand)}px` });
  const kb = karte.offsetWidth, kh = karte.offsetHeight;
  let y = r.bottom + 14;
  if (y + kh > innerHeight - 8) y = r.top - kh - 14;
  if (y < 8) y = innerHeight - kh - 12;
  karte.style.top = `${Math.max(8, y)}px`;
  karte.style.left = `${Math.max(12, Math.min(innerWidth - kb - 12, r.left))}px`;
}

// ---------- Ansichten und Datum ----------
const ANSICHTEN = ['planen', 'kunden', 'ladeplan', 'plantafel', 'fuhrpark'];
let ansicht = 'planen';
function waehleAnsicht(name) {
  ansicht = name;
  $('.app').dataset.ansicht = name;
  document.querySelectorAll('.icons button[data-ansicht]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ansicht === name)));
  for (const v of ANSICHTEN) $('#v-' + v).hidden = v !== name;
  if (name === 'planen') { renderPlanen(); karte?.resize(); }
  if (name === 'ladeplan') renderLadeplan();
  if (name === 'plantafel') renderPlan();
  if (name === 'fuhrpark') renderFuhrpark();
  if (name === 'kunden') renderKunden();
}
function allesNeu() {
  $('#datum-eingabe').value = datum;
  if (ansicht === 'planen') renderPlanen();
  if (ansicht === 'plantafel') renderPlan();
  if (ansicht === 'fuhrpark') renderFuhrpark();
  if (ansicht === 'kunden') renderKunden();
}
function datumSetzen(tag) {
  if (!istTag(tag)) return;
  if (tag !== datum) { planZuruecksetzen(); meldung = null; }
  datum = tag;
  allesNeu();
}

// ---------- Start ----------
stand = laden();
datum = ladetag(); // die Demo beginnt mit dem Tag, für den geplant wird
document.querySelectorAll('[data-icon]').forEach((b) => { b.prepend(icon(b.dataset.icon)); if (b.dataset.label) b.append(el('span', {}, b.dataset.label)); });
document.querySelectorAll('[data-schliessen]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('.icons button[data-ansicht]').forEach((b) => b.addEventListener('click', () => waehleAnsicht(b.dataset.ansicht)));
document.querySelectorAll('#v-plantafel .plan-reiter button').forEach((b) => b.addEventListener('click', () => planReiter(b.dataset.plan)));
$('#reset-knopf').addEventListener('click', () => { stand = neuerStand(); speichern(); planZuruecksetzen(); meldung = null; allesNeu(); if (ansicht === 'ladeplan') renderLadeplan(); });
$('#datum-eingabe').addEventListener('change', (e) => datumSetzen(e.target.value));
$('#tag-zurueck').addEventListener('click', () => datumSetzen(tagPlus(datum, -1)));
$('#tag-vor').addEventListener('click', () => datumSetzen(tagPlus(datum, 1)));
$('#tag-heute').addEventListener('click', () => datumSetzen(HEUTE));
$('#rundgang-knopf').addEventListener('click', rundgangStarten);
document.querySelectorAll('#rechts-richtung [data-richtung]').forEach((b) => b.addEventListener('click', () => { richtung3d = b.dataset.richtung; renderDetail(); }));
$('#kunden-neu').addEventListener('click', () => transportOeffnen('neu'));
$('#kunden-suche').addEventListener('input', (e) => { kf.suche = e.target.value; renderKunden(); });
document.querySelectorAll('#kunden-filter button').forEach((b) => b.addEventListener('click', () => { kf.filter = b.dataset.filter; renderKunden(); }));
document.addEventListener('keydown', (e) => { if (rg && e.key === 'Escape') rundgangEnde(); });
window.addEventListener('resize', rundgangPlatzieren);
ladeplanBedienungAufbauen();
karteAufbauen();
waehleAnsicht('planen');
allesNeu();
let gesehen = null;
try { gesehen = localStorage.getItem(RUNDGANG_GESEHEN); } catch (e) { /* ohne Speicher: Rundgang zeigen */ }
if (!gesehen) setTimeout(rundgangStarten, 400);
