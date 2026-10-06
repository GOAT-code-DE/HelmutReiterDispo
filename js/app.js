'use strict';
// Oberfläche im Dashboard-Stil. Alle Texte per textContent, keine HTML-Strings.

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
  karte: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  tafel: 'M3 4v16h18M7 8h8M10 12h8M6 16h6',
  hof: 'M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6',
  wuerfel: 'M12 3 4 7v10l8 4 8-4V7l-8-4zM4 7l8 4 8-4M12 11v10',
  euro: 'M17 6a7 7 0 1 0 0 12M5 10h9M5 14h9',
  lkw: 'M2 6h12v10H2zM14 9h4l3 3v4h-7M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  spedition: 'M4 8h13l-3-3M20 16H7l3 3',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  abspielen: 'M8 5v14l11-7z',
  links: 'M15 6l-6 6 6 6',
  rechts: 'M9 6l6 6-6 6',
  anhalten: 'M7 5h4v14H7zM13 5h4v14h-4z',
  schliessen: 'M6 6l12 12M18 6L6 18',
  aufladen: 'M12 15V4M8 8l4-4 4 4M5 20h14',
  abladen: 'M12 4v11M8 11l4 4 4-4M5 20h14',
  ziel: 'M5 21V4h11l-2 4 2 4H5',
  posteingang: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z',
  spalten: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
};
const icon = (name) => sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, sv('path', { d: ICONS[name] }));

let gewaehlt = null;
const ortName = (id) => (id === 'hof' ? 'Hof' : finde(ORTE, id).name);
function standardTour() {
  const sortiert = [...stand.touren].sort((a, b) => a.start - b.start);
  return (sortiert.find((t) => status(t) === 'unterwegs') || sortiert.find((t) => status(t) === 'geplant') || sortiert[0] || {}).id || null;
}

// ---------- Kennzahlen ----------
function renderKpis() {
  const weg = LKW.filter((l) => stand.touren.some((t) => t.lkw === l.id && (() => { const p = phaseUm(t); return p && !(p.typ === 'laden' && p.wo === 'hof'); })())).length;
  const alternativen = alternativenZuweisen();
  const vermeidbar = stand.sped.filter((x) => alternativen.get(x.id));
  const vermeidbarEuro = vermeidbar.reduce((s, x) => s + kostenSpedition(x) - kostenAlternative(x, alternativen.get(x.id)), 0);
  const kpi = (wert, name, warn) => el('div', { class: 'kpi' + (warn ? ' warn' : '') }, el('span', { class: 'wert' }, wert), el('span', { class: 'name' }, name));
  const imEinsatz = new Set(stand.touren.map((t) => t.lkw)).size;
  $('#kpis').replaceChildren(
    ...(datum === HEUTE
      ? [kpi(`${LKW.length - weg}/${LKW.length}`, 'Lkw am Hof'), kpi(stand.touren.filter((t) => status(t) === 'unterwegs').length, 'unterwegs')]
      : [kpi(stand.touren.length, 'Touren'), kpi(`${imEinsatz}/${LKW.length}`, 'Lkw im Einsatz')]),
    kpi(`${vermeidbar.length} · ${euro(vermeidbarEuro)}`, 'Spedition vermeidbar', vermeidbar.length > 0),
  );
}

// ---------- Tourenliste: eine Zeile je Tour, gruppiert nach Stand ----------
let erledigtOffen = false;
function tourZeile(t) {
  const st = status(t), l = finde(LKW, t.lkw), g = finde(GERAETE, t.geraet);
  const art = t.kombi ? 'kombi' : t.art === 'Abholung' ? 'abholung' : 'auslieferung';
  return el('button', { class: `tz ${art}` + (t.id === gewaehlt ? ' aktiv' : ''), 'data-tour': t.id, onclick: () => waehleTour(t.id),
    title: `${t.art} ${zielText(t)} · ${l.kz} · ${g.name} · ${finde(FAHRER, t.fahrer).name}` },
    el('span', { class: 'tz-zeit' }, hhmm(t.start)),
    el('span', { class: 'tz-text' }, el('b', {}, zielText(t)), el('small', {}, `${l.kz} · ${g.kurz}`)),
    el('span', { class: 'tz-info' }, st === 'unterwegs' ? `zurück ${hhmm(ende(t))}` : st === 'erledigt' ? 'fertig' : `${kmTour(t)} km`));
}
function renderListe() {
  const q = $('#suche').value.trim().toLowerCase();
  const passt = (t) => !q || [zielText(t), finde(GERAETE, t.geraet).name, finde(LKW, t.lkw).kz, finde(FAHRER, t.fahrer).name, t.id].join(' ').toLowerCase().includes(q);
  const touren = stand.touren.filter(passt).sort((a, b) => a.start - b.start);
  const nach = (st) => touren.filter((t) => status(t) === st);
  const alternativen = alternativenZuweisen();
  const sped = stand.sped.filter((s) => !q || [finde(ORTE, s.ort).name, finde(GERAETE, s.geraet).name, s.grund].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.start - b.start);
  const titel = (text, n) => el('h3', {}, text, el('span', { class: 'anzahl' }, String(n)));
  const gruppe = (id, text, liste) => el('section', { class: 'tgruppe', id: 'gruppe-' + id }, titel(text, liste.length),
    ...(liste.length ? liste.map(tourZeile) : [el('p', { class: 'hinweis leer' }, 'keine')]));
  const erledigt = nach('erledigt');
  const erl = el('details', { class: 'tgruppe', id: 'gruppe-erledigt' }, el('summary', {}, titel('Erledigt', erledigt.length)), ...erledigt.map(tourZeile));
  erl.open = erledigtOffen || !!q || erledigt.some((t) => t.id === gewaehlt);
  // nur echte Klicks merken; das toggle-Ereignis feuert auch beim Öffnen per Programm
  erl.querySelector('summary').addEventListener('click', () => { erledigtOffen = !erl.open; });
  const spedZeilen = sped.map((s) => el('button', { class: 'tz sped', onclick: () => waehleAnsicht('spedition'), title: `Grund: ${s.grund}` },
    el('span', { class: 'tz-zeit' }, hhmm(s.start)),
    el('span', { class: 'tz-text' }, el('b', {}, finde(ORTE, s.ort).name), el('small', {}, `${s.spedition} · ${finde(GERAETE, s.geraet).kurz}`)),
    alternativen.get(s.id) ? marke('vermeidbar', 'warn') : marke('ok', 'grau')));
  $('#touren-zahl').textContent = stand.touren.length;
  $('#touren-titel').textContent = datum === HEUTE ? 'Touren heute' : `Touren ${tagKurz(datum)}`;
  $('#tour-liste').replaceChildren(...[
    gruppe('unterwegs', 'Unterwegs', nach('unterwegs')),
    gruppe('geplant', 'Als Nächstes', nach('geplant')),
    erl,
    spedZeilen.length ? el('section', { class: 'tgruppe', id: 'gruppe-sped' }, titel('An Spedition', spedZeilen.length), ...spedZeilen) : null,
    q && !touren.length && !spedZeilen.length ? el('p', { class: 'hinweis' }, 'Keine Tour passt zur Suche.') : null,
  ].filter(Boolean));
}

// ---------- Detail, Ablauf, Kosten der gewählten Tour ----------
function lkwBild(l, g) { // Seitenansicht maßstäblich im Stil der 3D-Modelle: Fahrerhaus, Ladefläche, Gerät, 4-m-Linie
  const s = Math.min(15, 290 / (l.laenge + 2.8)), boden = 104, x0 = 14;
  const r = Math.max(5, (l.nutzlast < 2 ? 0.36 : 0.5) * s);
  const kabL = 2.4 * s, kabH = (l.nutzlast < 2 ? 2.2 : 2.75) * s, kabY = boden - r - 0.15 * s - kabH;
  const deckX = x0 + kabL + 0.25 * s, deckTop = boden - l.ladehoehe * s, deckEnde = deckX + l.laenge * s;
  const teile = [
    sv('rect', { x: 0, y: boden, width: 330, height: 8, fill: '#e3e9f1' }),
    sv('line', { x1: 0, y1: boden - MAX_HOEHE * s, x2: 330, y2: boden - MAX_HOEHE * s, stroke: '#d64545', 'stroke-dasharray': '4 3', 'stroke-width': 1 }),
    sv('text', { x: 326, y: boden - MAX_HOEHE * s - 3, 'text-anchor': 'end', 'font-size': 9, fill: '#d64545' }, '4,00 m'),
    sv('rect', { x: x0 + kabL * 0.4, y: deckTop + 0.15 * s, width: deckEnde - x0 - kabL * 0.4, height: 0.32 * s, rx: 2, fill: '#3a4248' }),       // Rahmen
    sv('path', { d: `M${x0 + 6},${kabY} h${kabL - 10} q4,0 4,4 v${kabH - 4} h-${kabL} v-${kabH - 10} q0,-6 6,-6 z`, fill: '#fff', stroke: '#b9c4d0' }), // Fahrerhaus
    sv('path', { d: `M${x0 + 2},${kabY + 0.45 * s} q1,-${0.3 * s} 6,-${0.3 * s} h${kabL * 0.38} v${kabH * 0.34} h-${kabL * 0.38 + 6} z`, fill: '#28343f' }), // Frontscheibe
    sv('rect', { x: x0 + kabL * 0.5, y: kabY + 0.25 * s, width: kabL * 0.38, height: kabH * 0.3, rx: 2, fill: '#28343f' }),                        // Seitenfenster
    sv('rect', { x: x0, y: kabY + kabH * 0.62, width: kabL, height: 0.32 * s, fill: '#27a849' }),                                              // Reiter-Streifen
    sv('rect', { x: x0 - 2, y: boden - r - 0.45 * s, width: 5, height: 0.4 * s, rx: 1.5, fill: '#d5dbe0' }),                                     // Stoßfänger
    sv('rect', { x: deckX, y: deckTop - 0.18 * s, width: l.laenge * s, height: 0.18 * s, fill: '#a3adb5' }),                                     // Ladefläche
    sv('rect', { x: deckX, y: deckTop - 0.06 * s, width: l.laenge * s, height: 0.12 * s, fill: '#27a849' }),                                     // Randleiste
    sv('rect', { x: deckX, y: deckTop - 1.05 * s, width: 0.12 * s, height: 0.9 * s, fill: '#a3adb5' }),                                          // Stirnwand
  ];
  if (g) {
    const gx = deckX + 0.3 * s, gw = g.l * s, gh = g.h * s, gy = deckTop - 0.18 * s;
    const warn = l.ladehoehe + g.h > MAX_HOEHE || g.l > l.laenge;
    const rand = warn ? { stroke: '#d64545', 'stroke-width': 2 } : {};
    const dunkel = '#2f3439', gr = Math.min(0.42, g.h * 0.16) * s;
    if (g.form === 'stapler') {
      teile.push(sv('rect', { x: gx + gw * 0.3, y: gy - gr - gh * 0.38, width: gw * 0.66, height: gh * 0.38, rx: 4, fill: g.farbe, ...rand }));
      teile.push(sv('rect', { x: gx + gw * 0.12, y: gy - gh, width: 3, height: gh - 2, fill: dunkel }));
      teile.push(sv('path', { d: `M${gx + gw * 0.35},${gy - gr - gh * 0.38} V${gy - gh * 0.96} H${gx + gw * 0.72} V${gy - gr - gh * 0.38}`, fill: 'none', stroke: dunkel, 'stroke-width': 2 }));
      teile.push(sv('rect', { x: gx, y: gy - 3, width: gw * 0.3, height: 2, fill: dunkel }));
    } else if (g.form === 'tele') {
      teile.push(sv('rect', { x: gx + gw * 0.1, y: gy - gr - gh * 0.4, width: gw * 0.8, height: gh * 0.4, rx: 4, fill: g.farbe, ...rand }));
      teile.push(sv('rect', { x: gx + gw * 0.3, y: gy - gh, width: gw * 0.24, height: gh * 0.62, rx: 3, fill: g.farbe, opacity: 0.85 }));
      teile.push(sv('rect', { x: gx + gw * 0.33, y: gy - gh * 0.93, width: gw * 0.18, height: gh * 0.3, rx: 2, fill: '#a9c4d8' }));
      teile.push(sv('rect', { x: gx, y: gy - gh * 0.72, width: gw, height: 0.42 * s, rx: 3, fill: g.farbe, transform: `rotate(-4 ${gx + gw / 2} ${gy - gh * 0.62})` }));
    } else {
      teile.push(sv('rect', { x: gx, y: gy - gr - gh * 0.3, width: gw, height: gh * 0.3, rx: 3, fill: g.farbe, ...rand }));
      teile.push(sv('path', { d: `M${gx + gw * 0.08},${gy - gr - gh * 0.3} L${gx + gw * 0.92},${gy - gh * 0.62} M${gx + gw * 0.92},${gy - gr - gh * 0.3} L${gx + gw * 0.08},${gy - gh * 0.62}`, stroke: dunkel, 'stroke-width': 2 }));
      teile.push(sv('rect', { x: gx - 2, y: gy - gh * 0.66, width: gw + 4, height: 3, fill: g.farbe }));
      teile.push(sv('path', { d: `M${gx},${gy - gh * 0.66} V${gy - gh} H${gx + gw} V${gy - gh * 0.66}`, fill: 'none', stroke: g.farbe, 'stroke-width': 2 }));
    }
    for (const fx of [0.22, 0.78]) teile.push(sv('circle', { cx: gx + gw * fx, cy: gy - gr, r: gr, fill: '#1f2326' }));
  }
  const hinten = l.laenge > 11 ? [l.laenge - 3.2, l.laenge - 2.0, l.laenge - 0.8] : l.laenge > 7 ? [l.laenge - 2.0, l.laenge - 0.8] : [l.laenge - 1.1];
  for (const ax of [x0 + kabL * 0.5, ...hinten.map((m) => deckX + m * s)]) {
    teile.push(sv('circle', { cx: ax, cy: boden - r, r, fill: '#1f2326' }), sv('circle', { cx: ax, cy: boden - r, r: r * 0.45, fill: '#d5dbe0' }));
  }
  return sv('svg', { viewBox: '0 0 330 112', role: 'img', 'aria-label': `${l.typ}${g ? ' mit ' + g.name : ''}` }, ...teile);
}

function renderDetail() {
  const t = finde(stand.touren, gewaehlt);
  if (!t) { $('#tour-detail').replaceChildren(el('p', { class: 'hinweis' }, 'Keine Tour gewählt.')); return; }
  const l = finde(LKW, t.lkw), g = finde(GERAETE, t.geraet), f = finde(FAHRER, t.fahrer), st = status(t);
  const p = phaseUm(t);
  const pr = ladepruefung(g, l);
  const zeile = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
  $('#tour-detail').replaceChildren(
    el('h2', {}, 'Tourdetails', marke(st, st === 'unterwegs' ? 'unterwegs' : st === 'erledigt' ? 'grau' : 'frei')),
    el('div', { class: 'hinweis' }, p ? (p.typ === 'fahrt' ? `Fahrt nach ${ortName(p.nach)}, Ankunft ${hhmm(p.bis)}` : `${p.text} bis ${hhmm(p.bis)}`) : st === 'erledigt' ? 'Zurück am Hof' : `Abfahrt um ${hhmm(t.start)}`),
    el('div', { class: 'bild' }, lkwBild(l, p?.ladung ? finde(GERAETE, p.ladung) : (st === 'geplant' && t.art === 'Auslieferung' ? g : null))),
    el('dl', { class: 'zeilen' },
      ...zeile('Lkw', `${l.kz} · ${l.typ}`),
      ...zeile('Fahrer', `${f.name} (${f.fs})`),
      ...zeile('Abfahrt', `Hof Essen-Kray, ${hhmm(t.start)}`),
      ...zeile('Ziel', zielText(t)),
      ...zeile('Strecke', `${kmTour(t)} km`),
      ...zeile('Dauer', `${ende(t) - t.start} Min. · zurück ${hhmm(ende(t))}`),
      ...zeile('Ladung', [t.geraet, t.kombi?.geraet].filter(Boolean).map((x) => finde(GERAETE, x).kurz).join(', danach ')),
      ...zeile('Gewicht', `${zahl(g.gewicht, 1)} von ${zahl(l.nutzlast, 1)} t`)),
    el('div', { class: 'kennbox' + (pr.ergebnis === 'ok' ? '' : ' warnung') },
      el('div', {}, el('b', {}, `${zahl(l.ladehoehe + g.h)} m`), el('span', {}, 'Gesamthöhe')),
      el('div', {}, el('b', {}, `${zahl(l.nutzlast - g.gewicht, 1)} t`), el('span', {}, 'Restnutzlast')),
      el('div', {}, el('b', {}, pr.ergebnis === 'ok' ? 'passt' : 'prüfen'), el('span', {}, 'Ladeprüfung'))),
    el('div', { class: 'knopfreihe' },
      el('button', { class: 'knopf klein', onclick: () => ladeplanOeffnen(t.lkw, [t.geraet], t) }, '3D-Ladeplan'),
      el('button', { class: 'knopf zweit klein', onclick: () => zeigeTour(t.id) }, 'Bearbeiten')));
}

const SCHRITT_ICON = (p) => (p.typ === 'fahrt' ? 'lkw' : p.wo === 'hof' ? (p.text === 'Beladen' ? 'aufladen' : 'abladen') : p.text.startsWith('Ablad') ? 'ziel' : 'aufladen');
function renderAblauf() {
  const t = finde(stand.touren, gewaehlt);
  if (!t) { $('#tour-ablauf').replaceChildren(); return; }
  const ph = phasen(t);
  const zustand = (p) => (p.bis <= zeit ? 'fertig' : p.von <= zeit ? 'aktuell' : '');
  $('#tour-ablauf').replaceChildren(
    el('h2', {}, 'Ablauf'),
    el('ol', { class: 'ablauf-liste' }, ...ph.map((p) => el('li', { class: zustand(p) },
      icon(SCHRITT_ICON(p)),
      el('span', { class: 'al-zeit' }, hhmm(p.von)),
      el('span', {}, p.typ === 'fahrt' ? `Fahrt nach ${ortName(p.nach)}` : `${p.text} · ${ortName(p.wo)}`,
        el('small', {}, p.typ === 'fahrt' ? `${p.km} km · ${p.ladung ? finde(GERAETE, p.ladung).kurz : 'leer'}` : `bis ${hhmm(p.bis)} · ${finde(GERAETE, p.ladung).kurz}`))))));
}
function renderTourKosten() {
  const t = finde(stand.touren, gewaehlt);
  if (!t) { $('#tour-kosten').replaceChildren(); return; }
  const l = finde(LKW, t.lkw), km = kmTour(t), std = (ende(t) - t.start) / 60;
  const intern = kostenIntern(t);
  const sped = kostenSpedition(t) + (t.kombi ? kostenSpedition({ ...t, art: 'Abholung', geraet: t.kombi.geraet, ort: t.kombi.ort }) : 0);
  const zeile = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
  $('#tour-kosten').replaceChildren(
    el('h2', {}, 'Kosten'),
    el('div', { class: 'preis' }, euro(intern)),
    el('dl', { class: 'zeilen' },
      ...zeile('Fahrzeug', `${km} km × ${zahl(l.kmSatz)} € = ${euro(km * l.kmSatz)}`),
      ...zeile('Fahrer', `${zahl(std, 1)} Std. × ${stand.kosten.fahrerStunde} € = ${euro(std * stand.kosten.fahrerStunde)}`),
      ...zeile('Spedition', `ca. ${euro(sped)}`)),
    el('div', { class: 'befund ' + (sped > intern ? 'ok' : 'vermeidbar') },
      sped > intern ? `Eigener Lkw spart ca. ${euro(sped - intern)}` : `Spedition wäre ca. ${euro(intern - sped)} günstiger`));
}
const tageText = () => `${stand.touren.length} Touren ${datum === HEUTE ? 'heute' : 'am ' + tagKurz(datum)}`;
function renderGewaehlt() {
  renderDetail(); renderAblauf(); renderTourKosten();
  const t = finde(stand.touren, gewaehlt);
  $('#karte-unterzeile').textContent = t ? `${t.id} · ${zielText(t)} · ${kmTour(t)} km · ${tageText()}` : tageText();
}
function waehleTour(id, fokus = true) {
  gewaehlt = id;
  setzeKartenModus('einzeln');
  renderListe();
  renderGewaehlt();
  if (ansicht !== 'dashboard') waehleAnsicht('dashboard');
  karte3dDaten();
  if (fokus) fokusTour(id);
}

// ---------- Zeitleiste ----------
let abspielen = null, abspielStand = 0, abspielTick = 0;
function setzeZeit(m) {
  zeit = Math.max(TAG_START, Math.min(TAG_ENDE, m));
  $('#zeit-regler').value = zeit;
  $('#zeit-anzeige').textContent = hhmm(zeit) + ' Uhr';
  zeitStrich();
  renderKpis();
  renderListe();
  if (ansicht === 'dashboard') { renderGewaehlt(); karte3dZeit(); }
  if (ansicht === 'plantafel') renderPlan();
  if (ansicht === 'board') renderBoard();
  if (ansicht === 'hof') hofAktualisieren();
  if (ansicht === 'fuhrpark') renderFuhrpark();
  if (ansicht === 'kosten') renderKosten();
}
function abspielKnopf(laeuft) {
  $('#zeit-play').replaceChildren(icon(laeuft ? 'anhalten' : 'abspielen'), el('span', {}, laeuft ? 'Anhalten' : 'Abspielen'));
}
function abspielenUmschalten() {
  if (abspielen) { clearInterval(abspielen); abspielen = null; abspielKnopf(false); return; }
  if (zeit >= TAG_ENDE) setzeZeit(TAG_START);
  abspielKnopf(true);
  abspielStand = zeit;
  abspielen = setInterval(() => { // zehnmal pro Sekunde, Tempo in Minuten pro Sekunde
    if (zeit >= TAG_ENDE) { abspielenUmschalten(); return; }
    if (Math.abs(abspielStand - zeit) >= 1) abspielStand = zeit; // jemand hat zwischendurch gesprungen
    abspielStand += Number($('#zeit-tempo').value) / 10;
    abspielTick = performance.now();
    if (Math.floor(abspielStand) !== zeit) setzeZeit(Math.floor(abspielStand));
  }, 100);
}

// Uhrzeit-Knöpfe 6:00–18:00: ein Klick springt zur vollen Stunde, die laufende Stunde ist markiert
function uhrzeitenAufbauen() {
  const knoepfe = [];
  for (let h = 6; h <= 18; h++) knoepfe.push(el('button', { type: 'button', 'data-stunde': String(h), onclick: () => setzeZeit(h * 60) }, `${h}:00`));
  $('#uhrzeiten').replaceChildren(...knoepfe);
  zeitStrich();
}
function zeitStrich() {
  const h = String(Math.floor(zeit / 60));
  document.querySelectorAll('#uhrzeiten button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.stunde === h)));
}

// ---------- Plantafel ----------
const pos = (m) => ((Math.max(TAG_START, Math.min(TAG_ENDE, m)) - TAG_START) / SPANNE) * 100;
function renderTafel() {
  const kopf = el('div', { class: 'zeile kopfzeile' }, el('div', { class: 'label' }, el('strong', {}, 'Lkw')));
  const stunden = el('div', { class: 'spur' });
  for (let h = 6; h < 19; h++) stunden.append(el('span', {}, `${h}:00`));
  kopf.append(stunden);
  const zeilen = LKW.map((l) => {
    const spur = el('div', { class: 'spur' }, el('div', { class: 'jetzt', style: `left:${pos(zeit)}%` }));
    const touren = stand.touren.filter((t) => t.lkw === l.id).sort((a, b) => a.start - b.start);
    if (!touren.length) spur.append(el('div', { class: 'frei-hinweis' }, 'ganztägig frei'));
    for (const t of touren) {
      const g = finde(GERAETE, t.geraet), f = finde(FAHRER, t.fahrer);
      const links = pos(t.start), breite = pos(ende(t)) - links;
      spur.append(el('button', {
        class: 'block', 'data-art': t.art, 'data-status': status(t), 'data-kombi': t.kombi ? 'ja' : 'nein',
        style: `left:${links}%;width:${breite}%`,
        title: `${t.art} ${zielText(t)}, ${hhmm(t.start)}–${hhmm(ende(t))}, ${g.name}, ${f.name}`,
        onclick: () => zeigeTour(t.id),
      }, el('b', {}, zielText(t)), el('span', {}, `${g.kurz}${t.kombi ? ' + ' + finde(GERAETE, t.kombi.geraet).kurz : ''} · ${f.name.split(' ')[0]}`)));
    }
    return el('div', { class: 'zeile' },
      el('div', { class: 'label' }, el('strong', {}, l.kz), el('small', {}, l.typ), el('small', {}, `${zahl(l.nutzlast, 1)} t · ${zahl(l.laenge, 1)} m · Kl. ${l.fs}`)),
      spur);
  });
  $('#tafel').replaceChildren(kopf, ...zeilen);
}

function zeigeTour(id) {
  const t = finde(stand.touren, id);
  if (!t) return;
  const l = finde(LKW, t.lkw), g = finde(GERAETE, t.geraet), f = finde(FAHRER, t.fahrer);
  const st = status(t);
  const zeile = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
  const ladungen = [t.geraet, t.kombi?.geraet].filter(Boolean);
  $('#dlg-tour-titel').textContent = `${t.art} ${zielText(t)}`;
  $('#dlg-tour-inhalt').replaceChildren(
    el('dl', { class: 'daten' },
      ...zeile('Status', marke(st, st === 'unterwegs' ? 'unterwegs' : st === 'erledigt' ? 'weg' : 'frei')),
      ...zeile('Zeit', `${hhmm(t.start)} ab Hof – ${hhmm(ende(t))} zurück (${ende(t) - t.start} Min.)`),
      ...zeile('Strecke', `${kmTour(t)} km gesamt`),
      ...zeile('Lkw', `${l.kz} · ${l.typ}`),
      ...zeile('Fahrer', `${f.name} (Kl. ${f.fs})`),
      ...zeile('Ladung', ladungen.map((x) => finde(GERAETE, x).name).join(' · danach ')),
      ...zeile('Ladeprüfung', el('div', {}, ...ladepruefung(g, l).gruende.map((x) => el('div', { class: 'g-' + x.art }, x.txt)))),
    ),
    el('h2', {}, 'Ablauf'),
    el('div', { class: 'tab-rahmen' }, el('table', {},
      el('tr', {}, el('th', {}, 'Zeit'), el('th', {}, 'Abschnitt'), el('th', { class: 'zahl' }, 'km'), el('th', {}, 'Ladung')),
      ...phasen(t).map((p) => el('tr', { class: p.von <= zeit && zeit < p.bis ? 'aktiv' : '' },
        el('td', {}, `${hhmm(p.von)}–${hhmm(p.bis)}`),
        el('td', {}, p.typ === 'fahrt' ? `Fahrt von ${ortName(p.von_ort)} nach ${ortName(p.nach)}` : `${p.text} (${ortName(p.wo)})`),
        el('td', { class: 'zahl' }, p.typ === 'fahrt' ? p.km : ''),
        el('td', {}, p.ladung ? finde(GERAETE, p.ladung).kurz : el('span', { class: 'g-genehmigung' }, 'leer')))))),
    el('div', { class: 'knopfreihe' },
      el('button', { class: 'knopf klein', onclick: () => { $('#dlg-tour').close(); waehleTour(t.id); } }, 'Auf der Karte zeigen'),
      el('button', { class: 'knopf zweit klein', onclick: () => ladeplanOeffnen(t.lkw, [t.geraet], t) }, '3D-Ladeplan'),
      el('button', { class: 'knopf zweit klein', onclick: () => {
        stand.touren = stand.touren.filter((x) => x.id !== id);
        if (gewaehlt === id) gewaehlt = standardTour();
        speichern(); $('#dlg-tour').close(); allesNeu();
      } }, 'Tour stornieren')),
  );
  $('#dlg-tour').showModal();
}

// ---------- Planung: Tag, Woche, Monat ----------
let planAnsicht = 'tag';
function planReiter(art) {
  if (abspielen && art !== 'tag') abspielenUmschalten();
  planAnsicht = art;
  $('.app').dataset.plan = art;
  document.querySelectorAll('.plan-reiter button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.plan === art)));
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
    const tt = toureAm(tag), frei = LKW.length - new Set(tt.map((t) => t.lkw)).size;
    return el('th', { class: zelleKlasse(tag) }, el('button', { onclick: () => { datumSetzen(tag); planReiter('tag'); }, title: `${tagLang(tag)} öffnen` },
      tagKurz(tag), el('small', {}, `${tt.length} Touren · ${frei} Lkw frei`)));
  }));
  const zeilen = LKW.map((l) => el('tr', {}, el('td', { class: 'lkw' }, l.kz, el('small', {}, `${zahl(l.nutzlast, 1)} t`)),
    ...tage.map((tag) => {
      const tt = toureAm(tag).filter((t) => t.lkw === l.id);
      return el('td', { class: zelleKlasse(tag) }, ...(tt.length ? tt.map((t) => el('button', {
        class: 'wchip ' + (t.kombi ? 'kombi' : t.art === 'Abholung' ? 'abholung' : ''), 'data-tour': t.id,
        title: `${t.art} ${zielText(t)} · ${finde(GERAETE, t.geraet).name}`,
        onclick: () => { datumSetzen(tag); waehleTour(t.id); },
      }, el('b', {}, hhmm(t.start)), zielText(t))) : [el('span', { class: 'frei' }, 'frei')]));
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

// ---------- Datum ----------
function datumSetzen(tag) {
  if (!istTag(tag)) return;
  if (abspielen && tag !== HEUTE) abspielenUmschalten();
  datum = tag;
  $('#datum-eingabe').value = tag;
  if (!finde(stand.touren, gewaehlt)) gewaehlt = standardTour();
  allesNeu();
  if (ansicht === 'dashboard' && gewaehlt) fokusTour(gewaehlt);
}

// ---------- Neuer Transport ----------
function feldMinuten(sel) {
  const [h, m] = ($(sel).value || '13:00').split(':').map(Number);
  const roh = h * 60 + m;
  // auf Viertelstunden runden, auf 06:00–17:00 begrenzen und im Feld sichtbar machen
  const v = Math.min(17 * 60, Math.max(TAG_START, Math.round((Number.isFinite(roh) ? roh : 13 * 60) / 15) * 15));
  $(sel).value = hhmm(v);
  return v;
}
const startMinuten = () => feldMinuten('#f-start');

const feldTag = (sel) => { const v = $(sel).value; const tag = istTag(v) && v >= HEUTE ? v : (datum >= HEUTE ? datum : HEUTE); $(sel).value = tag; return tag; };
const auftragAusFormular = () => ({ art: $('#f-art').value, geraet: $('#f-geraet').value, ort: $('#f-ort').value, start: startMinuten(), tag: feldTag('#f-tag') });

function renderNeu() {
  const a = auftragAusFormular();
  const g = finde(GERAETE, a.geraet), ort = finde(ORTE, a.ort);
  const bis = a.start + dauerEinfach(a.art, a.ort);
  const sonntag = istSonntag(a.tag), zuSpaet = bis > TAG_ENDE || sonntag;
  $('#f-info').replaceChildren(
    el('strong', {}, g.name), ` · ${zahl(g.gewicht, 1)} t · ${zahl(g.l)} × ${zahl(g.b)} × ${zahl(g.h)} m`,
    el('br'), `${tagLang(a.tag)} · ${ort.name}, ${ort.km} km · Lkw belegt ${hhmm(a.start)}–${hhmm(bis)}`,
    ...(sonntag ? [el('div', { class: 'g-nein' }, 'Sonntags wird nicht gefahren (Lkw-Fahrverbot) – bitte einen anderen Tag wählen.')]
      : bis > TAG_ENDE ? [el('div', { class: 'g-nein' }, `Rückkehr nach ${hhmm(TAG_ENDE)} Uhr – bitte früher abfahren.`)] : []));

  const liste = kandidaten(a.art, a.geraet, a.ort, a.start, a.tag);
  const rang = (k) => (k.pruefung.ergebnis === 'ok' && k.frei && k.fahrer.length ? 0 : k.pruefung.ergebnis === 'ok' ? 1 : k.pruefung.ergebnis === 'genehmigung' ? 2 : 3);
  liste.sort((x, y) => rang(x) - rang(y) || x.lkw.nutzlast - y.lkw.nutzlast);
  // nur Lkw zeigen, die ohne Genehmigung passen, frei sind und einen freien Fahrer haben
  const passende = zuSpaet ? [] : liste.filter((k) => rang(k) === 0);
  const zeilen = passende.map((k) => {
    const wahl = el('select', { 'aria-label': `Fahrer für ${k.lkw.kz}` }, ...k.fahrer.map((f) => el('option', { value: f.id }, `${f.name} (${f.fs})`)));
    return el('div', { class: 'kandidat passt' },
      el('div', { class: 'kz' }, el('strong', {}, k.lkw.kz), el('small', {}, `${k.lkw.typ} · ${zahl(k.lkw.nutzlast, 1)} t`)),
      el('div', { class: 'gruende' }, ...k.pruefung.gruende.map((x) => el('div', { class: 'g-' + x.art }, x.txt))),
      el('div', { class: 'aktion' },
        el('button', { class: 'knopf zweit klein', title: 'Im 3D-Ladeplan weiterplanen', onclick: () => ladeplanOeffnen(k.lkw.id, [a.geraet], { ...a, anfrage: anfrageImDialog }) }, '3D'),
        wahl, el('button', { class: 'knopf klein', 'data-einplanen': k.lkw.id, onclick: () => einplanen(a, k.lkw.id, wahl.value) }, 'Einplanen')));
  });
  const ausgeblendet = liste.length - passende.length;
  $('#f-kandidaten').replaceChildren(
    el('h2', {}, passende.length ? `Passende freie Lkw (${passende.length})` : 'Kein eigener Lkw passt und ist frei'),
    ...zeilen,
    ...(ausgeblendet ? [el('p', { class: 'hinweis' }, `${ausgeblendet} weitere Lkw ausgeblendet: zu klein, nur mit Genehmigung oder zu der Zeit verplant.`)] : []));

  const alt = sonntag ? null : interneAlternative(a);
  const hinweis = $('#f-sped-hinweis');
  hinweis.className = 'hinweis' + (alt ? ' warn' : '');
  hinweis.textContent = sonntag ? 'Sonntags fahren auch Speditionen nicht.' : alt
    ? `Achtung: ${alt.lkw.kz} passt ohne Genehmigung und ist frei, ${alt.fahrer[0].name} könnte fahren. Der Auftrag wird als vermeidbar markiert.`
    : 'Kein eigener Lkw passt ohne Genehmigung und ist frei. Spedition ist hier begründet.';
  $('#f-sped-knopf').disabled = sonntag;
}

// Tour anlegen, wenn alles passt (aus Dialog und 3D-Ladeplan). Liefert die neue ID oder null.
// Tour prüfen und speichern, ohne die Ansicht zu wechseln. Liefert die neue ID oder null.
function tourSpeichern(a, lkwId, fahrerId) {
  const bis = a.start + dauerEinfach(a.art, a.ort);
  const passt = ladepruefung(finde(GERAETE, a.geraet), finde(LKW, lkwId)).ergebnis === 'ok';
  const f = finde(FAHRER, fahrerId);
  const tag = a.tag || datum;
  if (!passt || !f || !darfFahren(f, finde(LKW, lkwId)) || bis > TAG_ENDE || !istTag(tag) || tag < HEUTE || istSonntag(tag)
    || !lkwFrei(lkwId, a.start, bis, [], tag) || !fahrerFrei(fahrerId, a.start, bis, [], tag)) return null;
  const id = 'T' + (++stand.nr);
  stand.alleTouren.push({ id, tag, lkw: lkwId, fahrer: fahrerId, art: a.art, geraet: a.geraet, ort: a.ort, start: a.start });
  speichern();
  return id;
}
function tourAnlegen(a, lkwId, fahrerId) {
  const id = tourSpeichern(a, lkwId, fahrerId);
  if (!id) return null;
  datum = a.tag || datum;            // zum geplanten Tag springen, damit man die neue Tour sieht
  allesNeu();
  waehleTour(id);
  return id;
}
let anfrageImDialog = null; // Anfrage aus dem Cockpit, die gerade im Dialog „Neuer Transport“ geplant wird
function einplanen(a, lkwId, fahrerId) {
  const anfrage = anfrageImDialog;
  // Doppelt prüfen: der Dialog kann veraltet sein
  if (!tourAnlegen(a, lkwId, fahrerId)) { renderNeu(); return; }
  if (anfrage) { anfrageEntfernen(anfrage); speichern(); }
  $('#dlg-neu').close();
}

function anSpedition() {
  const grund = $('#f-grund').value.trim();
  if (!grund) { $('#f-grund').focus(); $('#f-grund').placeholder = 'Bitte einen Grund angeben – ohne Grund keine Spedition.'; return; }
  const a = auftragAusFormular();
  if (istSonntag(a.tag)) { renderNeu(); return; }
  if (anfrageImDialog) anfrageEntfernen(anfrageImDialog);
  stand.alleSped.push({ id: 'S' + (++stand.nr), spedition: 'noch offen', grund, ...a });
  datum = a.tag;
  speichern(); $('#dlg-neu').close(); allesNeu();
  waehleAnsicht('spedition');
}

// ---------- Fuhrpark ----------
function auslastung(lkwId) {
  const min = stand.touren.filter((t) => t.lkw === lkwId)
    .reduce((s, t) => s + Math.max(0, Math.min(TAG_ENDE, ende(t)) - Math.max(TAG_START, t.start)), 0);
  return Math.min(100, Math.round(min / SPANNE * 100));
}
const kopfzeile = (...spalten) => el('tr', {}, ...spalten.map((s) => el('th', s.startsWith('#') ? { class: 'zahl' } : {}, s.replace(/^#/, ''))));
function unterwegsText(t) { const p = phaseUm(t); return p && !(p.typ === 'laden' && p.wo === 'hof') ? `unterwegs bis ${hhmm(ende(t))}` : null; }

function renderFuhrpark() {
  $('#tab-lkw').replaceChildren(
    kopfzeile('Kennzeichen', 'Typ', '#Nutzlast', '#Ladefläche', '#Ladehöhe', '#max. Gerätehöhe', 'Klasse', 'jetzt', 'Auslastung heute', ''),
    ...LKW.map((l) => {
      const weg = stand.touren.map(unterwegsText).find((x, i) => x && stand.touren[i].lkw === l.id);
      const a = auslastung(l.id);
      return el('tr', {},
        el('td', {}, el('strong', {}, l.kz)), el('td', {}, l.typ),
        el('td', { class: 'zahl' }, `${zahl(l.nutzlast, 1)} t`),
        el('td', { class: 'zahl' }, `${zahl(l.laenge, 1)} × ${zahl(l.breite)} m`),
        el('td', { class: 'zahl' }, `${zahl(l.ladehoehe)} m`),
        el('td', { class: 'zahl' }, `${zahl(MAX_HOEHE - l.ladehoehe)} m`),
        el('td', {}, l.fs),
        el('td', {}, weg ? marke(weg, 'unterwegs') : marke('am Hof', 'frei')),
        el('td', {}, el('span', { class: 'balken' }, el('i', { style: `width:${a}%` })), `${a} %`),
        el('td', {}, el('button', { class: 'knopf zweit klein', onclick: () => ladeplanOeffnen(l.id, []) }, '3D')));
    }));
  $('#tab-fahrer').replaceChildren(
    kopfzeile('Name', 'Klasse', 'jetzt', '#Touren heute'),
    ...FAHRER.map((f) => {
      const weg = stand.touren.map(unterwegsText).find((x, i) => x && stand.touren[i].fahrer === f.id);
      return el('tr', {}, el('td', {}, f.name), el('td', {}, f.fs),
        el('td', {}, f.abwesend ? marke(f.abwesend, 'weg') : weg ? marke(weg, 'unterwegs') : marke('verfügbar', 'frei')),
        el('td', { class: 'zahl' }, stand.touren.filter((t) => t.fahrer === f.id).length));
    }));
  $('#tab-geraete').replaceChildren(
    kopfzeile('Gerät', '#Gewicht', '#L × B × H', 'passt ohne Genehmigung auf', 'nur mit Genehmigung'),
    ...GERAETE.map((g) => {
      const ok = LKW.filter((l) => ladepruefung(g, l).ergebnis === 'ok').map((l) => l.kz.replace('E-HR ', ''));
      const gen = LKW.filter((l) => ladepruefung(g, l).ergebnis === 'genehmigung').map((l) => l.kz.replace('E-HR ', ''));
      return el('tr', {}, el('td', {}, g.name),
        el('td', { class: 'zahl' }, `${zahl(g.gewicht, 1)} t`),
        el('td', { class: 'zahl' }, `${zahl(g.l)} × ${zahl(g.b)} × ${zahl(g.h)} m`),
        el('td', {}, ok.length ? ok.join(', ') : marke('keinem', 'weg')),
        el('td', {}, gen.length ? marke(gen.join(', '), 'warn') : '–'));
    }));
}

// ---------- Spedition ----------
function renderSpedition() {
  const alternativen = alternativenZuweisen();
  const karten = stand.sped.map((sp) => {
    const g = finde(GERAETE, sp.geraet), ort = finde(ORTE, sp.ort);
    const alt = alternativen.get(sp.id);
    const preis = kostenSpedition(sp);
    const befund = alt
      ? el('div', { class: 'befund vermeidbar' }, el('strong', {}, 'Vermeidbar: '),
        `${alt.lkw.kz} (${alt.lkw.typ}) war frei und passt, ${alt.fahrer[0].name} hätte fahren können. Ersparnis ca. ${euro(preis - kostenAlternative(sp, alt))}.`)
      : el('div', { class: 'befund ok' }, el('strong', {}, 'Begründet: '), 'kein eigener Lkw passte ohne Genehmigung und war zu der Zeit frei.');
    return el('div', { class: 'karte' },
      el('h3', {}, `${sp.art} ${ort.name} · ${hhmm(sp.start)}`),
      el('p', {}, `${g.name} · ${zahl(g.gewicht, 1)} t · ${zahl(g.l)} × ${zahl(g.b)} × ${zahl(g.h)} m`),
      el('p', {}, `Spedition: ${sp.spedition} · Preis ca. ${euro(preis)}`),
      el('p', {}, `Grund laut Dispo: „${sp.grund}“`),
      befund);
  });
  $('#sped-liste').replaceChildren(...(karten.length ? karten : [el('p', { class: 'hinweis' }, 'Heute keine Speditionsaufträge.')]));
}

// ---------- Kosten & Leerfahrten ----------
const ANNAHMEN = [
  ['fahrerStunde', 'Fahrer €/Std.'], ['spedGrund', 'Spedition Grundpreis €'], ['spedKm', 'Spedition €/km'],
  ['schwerFaktor', 'Faktor Schwertransport'], ['arbeitstage', 'Arbeitstage/Monat'],
];
function renderKosten() {
  const k = stand.kosten;
  const intern = stand.touren.reduce((x, t) => x + kostenIntern(t), 0);
  const kmGesamt = stand.touren.reduce((x, t) => x + kmTour(t), 0);
  const leer = leerKm();
  const spedSumme = stand.sped.reduce((x, s) => x + kostenSpedition(s), 0);
  const alternativen = alternativenZuweisen();
  const selbst = stand.sped.map((x) => ({ x, alt: alternativen.get(x.id) })).filter((v) => v.alt)
    .map((v) => ({ ...v, spar: kostenSpedition(v.x) - kostenAlternative(v.x, v.alt) })).filter((v) => v.spar > 0);
  // Kombis erst prüfen, nachdem die Selbst-fahren-Vorschläge Lkw und Fahrer belegt haben (sonst doppelt gezählt)
  const reserviert = selbst.map((v) => ({ ...v.x, id: '_kos' + v.x.id, tag: v.x.tag || datum, lkw: v.alt.lkw.id, fahrer: v.alt.fahrer[0].id }));
  let kombis;
  try { stand.alleTouren.push(...reserviert); kombis = kombiVorschlaege(); } finally { stand.alleTouren = stand.alleTouren.filter((t) => !reserviert.includes(t)); }
  const sparen = selbst.reduce((x, v) => x + v.spar, 0) + kombis.reduce((x, v) => x + v.sparEuro, 0);
  const tagText = datum === HEUTE ? 'Heute' : `Am ${tagLang(datum)}`;

  // Der Tag in einem Satz
  $('#kosten-satz').replaceChildren(   // flache Liste: el()/replaceChildren würden verschachtelte Listen als Text ausgeben
    `${tagText} kosten `, el('b', {}, `${stand.touren.length} eigene Touren rund ${euro(intern)}`),
    ...(stand.sped.length ? [', dazu kommen ', el('b', {}, `${stand.sped.length} Speditionsaufträge für rund ${euro(spedSumme)}`)] : []),
    '. ',
    ...(sparen > 0
      ? ['Mit den Vorschlägen unten ließen sich rund ', el('b', {}, euro(sparen)), ` sparen, hochgerechnet auf ${k.arbeitstage} Arbeitstage etwa `, el('b', {}, euro(sparen * k.arbeitstage)), ' im Monat.']
      : ['Für diesen Tag gibt es keine Sparvorschläge.']));

  // 1. Was kostet der Tag?
  const max = Math.max(intern, spedSumme, 1);
  const balken = (klasse, titel, betrag, unten) => el('div', { class: 'kostenbalken ' + klasse },
    el('div', { class: 'zeile-oben' }, el('span', {}, titel), el('b', {}, euro(betrag))),
    el('div', { class: 'spur-k' }, el('i', { style: `width:${betrag / max * 100}%` })),
    el('small', {}, unten));
  $('#kosten-tag').replaceChildren(
    balken('', 'Eigene Lkw', intern, `${stand.touren.length} Touren, ${kmGesamt} km`),
    balken('sped', 'Spedition', spedSumme, `${stand.sped.length} Aufträge`),
    el('p', { class: 'hinweis' }, `So wird gerechnet: Eine eigene Tour kostet die gefahrenen Kilometer mal den Satz des Lkw plus die Fahrerzeit mal ${k.fahrerStunde} € je Stunde. `
      + `Eine Spedition kostet ${k.spedGrund} € Grundpreis plus ${zahl(k.spedKm)} € je Kilometer hin und zurück, ein Schwertransport das ${zahl(k.schwerFaktor, 1)}-fache.`));

  // 2. Wie viel fahren wir leer?
  const anteil = kmGesamt ? Math.round(leer / kmGesamt * 100) : 0;
  $('#kosten-leer').replaceChildren(
    el('div', { class: 'kostenbalken leer' },
      el('div', { class: 'zeile-oben' }, el('span', {}, 'Ohne Ladung gefahren'), el('b', {}, `${leer} km`)),
      el('div', { class: 'spur-k' }, el('i', { style: `width:${anteil}%` })),
      el('small', {}, `${anteil} % von ${kmGesamt} km`)),
    el('p', { class: 'hinweis' }, 'Nach einer Auslieferung fährt der Lkw meist leer zurück, vor einer Abholung leer hin. '
      + 'Das lässt sich nur verringern, wenn eine Auslieferung und eine Abholung in der Nähe zu einer Tour zusammengelegt werden. Passende Paare stehen unten.'));

  // 3. Wo können wir sparen?
  $('#sped-vorschlaege').replaceChildren(...selbst.map((v) => {
    const o = finde(ORTE, v.x.ort), g = finde(GERAETE, v.x.geraet);
    return el('div', { class: 'sparzeile' },
      el('div', {}, el('strong', {}, `Spedition ${o.name} um ${hhmm(v.x.start)} selbst fahren`),
        el('p', {}, `${v.alt.lkw.kz} ist frei und passt für ${g.kurz}, ${v.alt.fahrer[0].name} kann fahren. Spedition ${euro(kostenSpedition(v.x))}, selbst ${euro(kostenAlternative(v.x, v.alt))}.`)),
      el('span', { class: 'betrag' }, `spart ${euro(v.spar)}`),
      el('button', { class: 'knopf klein', 'data-selbst': v.x.id, onclick: () => {
        const id = tourSpeichern({ art: v.x.art, geraet: v.x.geraet, ort: v.x.ort, start: v.x.start, tag: v.x.tag }, v.alt.lkw.id, v.alt.fahrer[0].id);
        if (id) { stand.alleSped = stand.alleSped.filter((x) => x.id !== v.x.id); speichern(); }
        allesNeu();
      } }, 'Selbst fahren'));
  }));
  $('#kombi-liste').replaceChildren(...kombis.slice(0, 6).map((v) => {
    const la = finde(LKW, v.a.lkw), oa = finde(ORTE, v.a.ort).name, ob = finde(ORTE, v.b.ort).name;
    return el('div', { class: 'sparzeile karte-kombi' },
      el('div', {}, el('strong', {}, `${la.kz}: ${oa} + ${ob}`),
        el('p', {}, `Nach dem Abladen in ${oa} holt ${la.kz} das Gerät ${finde(GERAETE, v.b.geraet).kurz} in ${ob} ab, statt leer zurückzufahren. `
          + `${v.kmVorher - v.kmNachher} km weniger, Abholung ${hhmm(v.abholNeu)} statt ${hhmm(v.abholAlt)}.`)),
      el('span', { class: 'betrag' }, `spart ${euro(v.sparEuro)}`),
      el('button', { class: 'knopf klein', onclick: () => {
        if (kombiUebernehmen(v.a.id, v.b.id)) { if (gewaehlt === v.b.id) gewaehlt = v.a.id; allesNeu(); } else renderKosten();
      } }, 'Übernehmen'));
  }));
  if (!selbst.length && !kombis.length) $('#sped-vorschlaege').replaceChildren(el('p', { class: 'hinweis' }, 'Keine Vorschläge: Speditionen sind begründet und es gibt keine passenden Kombi-Touren.'));
}
function annahmenAufbauen() {
  $('#annahmen').replaceChildren(...ANNAHMEN.map(([key, text]) => el('label', {}, text,
    el('input', { type: 'number', min: '0', step: key === 'spedKm' || key === 'schwerFaktor' ? '0.1' : '1', value: String(stand.kosten[key]), 'data-key': key,
      onchange: (e) => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v) || v < 0) { e.target.value = String(stand.kosten[key]); return; }
        stand.kosten[key] = v; speichern(); renderKosten(); renderKpis(); renderListe(); renderSpedition();
      } }))));
}

// ---------- Anfrage-Cockpit ----------
function anfrageEntfernen(id) { stand.alleAnfragen = stand.alleAnfragen.filter((x) => x.id !== id); }
function anfrageKarte(a, v) {
  const g = finde(GERAETE, a.geraet), o = finde(ORTE, a.ort), sped = kostenSpedition(a);
  const vorschlag = v.lkw
    ? el('div', { class: 'vorschlag eigen' }, el('strong', {}, `Vorschlag: ${v.lkw.kz} · ${v.lkw.typ}`),
      el('span', {}, `${v.fahrer.name} fährt, zurück ${hhmm(v.bis)} · ca. ${euro(v.kosten)} statt ${euro(sped)} Spedition`))
    : el('div', { class: 'vorschlag sped' }, el('strong', {}, 'Vorschlag: Spedition'), el('span', {}, `Grund: ${v.grund} · ca. ${euro(sped)}`));
  return el('div', { class: 'anfrage' + (a.art === 'Abholung' ? ' abholung' : ''), 'data-anfrage': a.id },
    el('div', {},
      el('h3', {}, `${a.art} ${o.name} · ${hhmm(a.start)}`),
      el('p', {}, `${g.name} · ${zahl(g.gewicht, 1)} t`),
      el('p', {}, marke(a.quelle, 'grau'), ` ${o.km} km vom Hof`)),
    vorschlag,
    el('div', { class: 'knopfreihe' },
      v.lkw
        ? el('button', { class: 'knopf klein', 'data-einplanen': a.id, onclick: () => anfrageEinplanen(a) }, 'Einplanen')
        : el('button', { class: 'knopf warn klein', 'data-spedition': a.id, onclick: () => anfrageAnSpedition(a) }, 'An Spedition'),
      el('button', { class: 'knopf zweit klein', onclick: () => anfrageAndersPlanen(a) }, 'Anders planen')));
}
function renderAnfragen() {
  const vorschlaege = anfrageVorschlaege();
  const offen = stand.alleAnfragen.filter((a) => vorschlaege.has(a.id)).sort((x, y) => x.tag.localeCompare(y.tag) || x.start - y.start);
  const tage = [...new Set(offen.map((a) => a.tag))];
  $('#anf-liste').replaceChildren(...(offen.length ? tage.flatMap((tag) => [
    el('h2', { class: 'anf-tag' }, tag === HEUTE ? `Heute, ${tagLang(tag)}` : tagLang(tag)),
    ...offen.filter((a) => a.tag === tag).map((a) => anfrageKarte(a, vorschlaege.get(a.id))),
  ]) : [el('p', { class: 'hinweis' }, 'Keine offenen Anfragen.')]));
}
// Beim Klick neu rechnen: der angezeigte Vorschlag kann inzwischen überholt sein
function anfrageEinplanen(a) {
  const v = anfrageVorschlaege().get(a.id);
  const id = v?.lkw ? tourSpeichern(a, v.lkw.id, v.fahrer.id) : null;
  if (id) { anfrageEntfernen(a.id); speichern(); }
  $('#anf-meldung').textContent = id
    ? `Eingeplant: ${a.art} ${finde(ORTE, a.ort).name}, ${tagKurz(a.tag)} ${hhmm(a.start)} mit ${v.lkw.kz}.`
    : 'Der Vorschlag war nicht mehr gültig und wurde neu berechnet.';
  allesNeu();
}
function anfrageAnSpedition(a) {
  const v = anfrageVorschlaege().get(a.id);
  if (v && !v.lkw) {
    stand.alleSped.push({ id: 'S' + (++stand.nr), tag: a.tag, art: a.art, geraet: a.geraet, ort: a.ort, start: a.start, spedition: 'noch offen', grund: v.grund });
    anfrageEntfernen(a.id);
    speichern();
  }
  $('#anf-meldung').textContent = v && !v.lkw
    ? `An Spedition: ${a.art} ${finde(ORTE, a.ort).name}, ${tagKurz(a.tag)} ${hhmm(a.start)}.`
    : 'Inzwischen ist ein eigener Lkw frei, der Vorschlag wurde neu berechnet.';
  allesNeu();
}
function anfrageAndersPlanen(a) {
  $('#f-art').value = a.art; $('#f-geraet').value = a.geraet; $('#f-ort').value = a.ort;
  $('#f-start').value = hhmm(a.start); $('#f-tag').min = HEUTE; $('#f-tag').value = a.tag;
  $('#f-grund').value = '';
  anfrageImDialog = a.id;
  renderNeu();
  $('#dlg-neu').showModal();
}

// ---------- Board: jede Tour in der Spalte ihres Zustands, läuft mit der Uhrzeit ----------
const BOARD_SPALTEN = [['geplant', 'Geplant'], ['hof', 'Laden am Hof'], ['unterwegs', 'Unterwegs'], ['kunde', 'Beim Kunden'], ['erledigt', 'Erledigt']];
function boardSpalte(t) {
  const st = status(t), p = st === 'unterwegs' ? phaseUm(t) : null;
  if (!p) return st === 'erledigt' ? 'erledigt' : 'geplant';
  return p.typ === 'fahrt' ? 'unterwegs' : p.wo === 'hof' ? 'hof' : 'kunde';
}
function boardZeit(t, spalte) {
  if (spalte === 'geplant') return `Abfahrt ${hhmm(t.start)}`;
  if (spalte === 'erledigt') return `zurück ${hhmm(ende(t))}`;
  const p = phaseUm(t);
  if (p.typ === 'fahrt') return `${p.nach === 'hof' ? 'zum Hof' : 'nach ' + ortName(p.nach)}, an ${hhmm(p.bis)}`;
  return `${p.text.replace(/ (beim Kunden|am Hof)$/, '')} bis ${hhmm(p.bis)}`;
}
function renderBoard() {
  const touren = [...stand.touren].sort((a, b) => a.start - b.start);
  $('#board').replaceChildren(...BOARD_SPALTEN.map(([key, titel]) => {
    const liste = touren.filter((t) => boardSpalte(t) === key);
    return el('section', { class: 'bspalte', 'data-spalte': key, 'aria-label': titel },
      el('h2', {}, titel, el('span', { class: 'anzahl' }, String(liste.length))),
      ...(liste.length ? liste.map((t) => el('button', {
        class: 'bkarte ' + (t.kombi ? 'kombi' : t.art === 'Abholung' ? 'abholung' : ''), 'data-tour': t.id, onclick: () => zeigeTour(t.id),
      }, el('b', {}, zielText(t)),
      el('small', {}, `${finde(LKW, t.lkw).kz} · ${finde(GERAETE, t.geraet).kurz} · ${finde(FAHRER, t.fahrer).name}`),
      el('small', { class: 'bzeit' }, boardZeit(t, key)))) : [el('p', { class: 'leer' }, 'keine')]));
  }));
}

// ---------- 3D-Ladeplan Bedienung ----------
function ladeplanBedienungAufbauen() {
  $('#lp-lkw').replaceChildren(...LKW.map((l) => el('option', { value: l.id }, `${l.kz} · ${l.typ}`)));
  $('#lp-geraet').replaceChildren(...GERAETE.map((g) => el('option', { value: g.id }, g.name)));
  $('#lp-lkw').addEventListener('change', (e) => { lp.lkw = e.target.value; renderLadeplan(); });
  $('#lp-dazu').addEventListener('click', () => { if (lp.geraete.length < LP_MAX) { lp.geraete.push($('#lp-geraet').value); renderLadeplan(); } });
}

// ---------- Ansichten ----------
const ANSICHTEN = ['anfragen', 'dashboard', 'plantafel', 'board', 'hof', 'ladeplan', 'kosten', 'fuhrpark', 'spedition'];
let ansicht = 'dashboard';
function waehleAnsicht(name) {
  if (abspielen && !['dashboard', 'plantafel', 'board', 'hof'].includes(name)) abspielenUmschalten();
  if (name !== 'ladeplan') lp.anfrage = null; // Bezug zur Anfrage gilt nur, solange man im Ladeplan bleibt
  ansicht = name;
  $('.app').dataset.ansicht = name; // für Tablet-Layout: Tourenliste nur in der Tourenübersicht
  document.querySelectorAll('.icons button[data-ansicht]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ansicht === name)));
  for (const v of ANSICHTEN) $('#v-' + v).hidden = v !== name;
  if (name === 'dashboard') { renderGewaehlt(); if (m3) m3.resize(); karte3dDaten(); }
  if (name === 'anfragen') { $('#anf-meldung').textContent = ''; renderAnfragen(); }
  if (name === 'plantafel') renderPlan();
  if (name === 'board') renderBoard();
  if (name === 'hof') hofAktualisieren();
  if (name === 'ladeplan') renderLadeplan();
  if (name === 'kosten') renderKosten();
  if (name === 'fuhrpark') renderFuhrpark();
}
function allesNeu() {
  $('#datum-eingabe').value = datum;   // Datumsfeld immer mit dem gewählten Tag abgleichen
  $('.app').dataset.heute = datum === HEUTE ? 'ja' : 'nein';
  if (!finde(stand.touren, gewaehlt)) gewaehlt = standardTour();
  renderKpis(); renderListe(); renderSpedition();
  if (ansicht === 'dashboard') { renderGewaehlt(); karte3dDaten(); }
  routenHolen();
  if (ansicht === 'anfragen') renderAnfragen();
  if (ansicht === 'plantafel') renderPlan();
  if (ansicht === 'board') renderBoard();
  if (ansicht === 'hof') hofAktualisieren();
  if (ansicht === 'kosten') renderKosten();
  if (ansicht === 'fuhrpark') renderFuhrpark();
}

// ---------- Start ----------
stand = laden();
gewaehlt = standardTour();
document.querySelectorAll('[data-icon]').forEach((b) => { b.prepend(icon(b.dataset.icon)); if (b.dataset.label) b.append(el('span', {}, b.dataset.label)); });
$('#f-geraet').replaceChildren(...GERAETE.map((g) => el('option', { value: g.id }, g.name)));
$('#f-ort').replaceChildren(...ORTE.map((o) => el('option', { value: o.id }, `${o.name} (${o.km} km)`)));
$('#f-geraet').value = 'G06';
$('#f-ort').value = 'ha';
['#f-art', '#f-geraet', '#f-ort', '#f-start', '#f-tag'].forEach((sel) => $(sel).addEventListener('change', renderNeu));
$('#neu-knopf').addEventListener('click', () => {
  $('#f-grund').value = '';
  $('#f-tag').min = HEUTE;
  $('#f-tag').value = datum >= HEUTE ? datum : HEUTE;
  renderNeu();
  $('#dlg-neu').showModal();
});
$('#f-sped-knopf').addEventListener('click', anSpedition);
$('#dlg-neu').addEventListener('close', () => { anfrageImDialog = null; });
document.querySelectorAll('[data-schliessen]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('.icons button[data-ansicht]').forEach((b) => b.addEventListener('click', () => waehleAnsicht(b.dataset.ansicht)));
$('#suche').addEventListener('input', renderListe);
$('#reset-knopf').addEventListener('click', () => { stand = neuerStand(); lp.anfrage = null; speichern(); gewaehlt = standardTour(); annahmenAufbauen(); allesNeu(); fokusTour(gewaehlt); });
$('#zeit-regler').addEventListener('input', (e) => setzeZeit(Number(e.target.value)));
$('#zeit-play').addEventListener('click', abspielenUmschalten);
$('#zeit-jetzt').addEventListener('click', () => { if (datum !== HEUTE) datumSetzen(HEUTE); setzeZeit(DEMO_JETZT); });
$('#datum-eingabe').value = datum;
$('#datum-eingabe').addEventListener('change', (e) => datumSetzen(e.target.value));
$('#tag-zurueck').addEventListener('click', () => datumSetzen(tagPlus(datum, -1)));
$('#tag-vor').addEventListener('click', () => datumSetzen(tagPlus(datum, 1)));
$('#tag-heute').addEventListener('click', () => datumSetzen(HEUTE));
document.querySelectorAll('.plan-reiter button').forEach((b) => b.addEventListener('click', () => planReiter(b.dataset.plan)));
$('.app').dataset.plan = 'tag';
$('#k-alle').addEventListener('click', () => {
  // umschalten: alle Touren zeigen oder zurück zur gewählten Tour
  if (kartenModus === 'alle') { setzeKartenModus('einzeln'); fokusTour(gewaehlt); } else { setzeKartenModus('alle'); fokusAlle(); }
});
$('#k-hof').addEventListener('click', fokusHof);
$('#k-3d').addEventListener('click', (e) => {
  const an = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(an));
  umschalten3d(an);
});
uhrzeitenAufbauen();
annahmenAufbauen();
ladeplanBedienungAufbauen();
lpPlanungAufbauen();
karte3dAufbauen();
setzeZeit(DEMO_JETZT);
allesNeu();
