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
  aufladen: 'M12 15V4M8 8l4-4 4 4M5 20h14',
  abladen: 'M12 4v11M8 11l4 4 4-4M5 20h14',
  ziel: 'M5 21V4h11l-2 4 2 4H5',
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
  $('#kpis').replaceChildren(
    kpi(`${LKW.length - weg}/${LKW.length}`, 'Lkw am Hof'),
    kpi(stand.touren.filter((t) => status(t) === 'unterwegs').length, 'unterwegs'),
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
    el('span', { class: 'tz-info' }, st === 'unterwegs' ? `zurück ${hhmm(ende(t))}` : st === 'erledigt' ? '✓' : `${kmTour(t)} km`));
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
    el('div', { class: 'hinweis' }, p ? (p.typ === 'fahrt' ? `Fahrt ${ortName(p.von_ort)} → ${ortName(p.nach)}, an ${hhmm(p.bis)}` : `${p.text} bis ${hhmm(p.bis)}`) : st === 'erledigt' ? 'Zurück am Hof' : `Abfahrt um ${hhmm(t.start)}`),
    el('div', { class: 'bild' }, lkwBild(l, p?.ladung ? finde(GERAETE, p.ladung) : (st === 'geplant' && t.art === 'Auslieferung' ? g : null))),
    el('dl', { class: 'zeilen' },
      ...zeile('Lkw', `${l.kz} · ${l.typ}`),
      ...zeile('Fahrer', `${f.name} (${f.fs})`),
      ...zeile('Abfahrt', `Hof Essen-Kray, ${hhmm(t.start)}`),
      ...zeile('Ziel', zielText(t)),
      ...zeile('Strecke', `${kmTour(t)} km`),
      ...zeile('Dauer', `${ende(t) - t.start} Min. · zurück ${hhmm(ende(t))}`),
      ...zeile('Ladung', [t.geraet, t.kombi?.geraet].filter(Boolean).map((x) => finde(GERAETE, x).kurz).join(' → ')),
      ...zeile('Gewicht', `${zahl(g.gewicht, 1)} von ${zahl(l.nutzlast, 1)} t`)),
    el('div', { class: 'kennbox' + (pr.ergebnis === 'ok' ? '' : ' warnung') },
      el('div', {}, el('b', {}, `${zahl(l.ladehoehe + g.h)} m`), el('span', {}, 'Gesamthöhe')),
      el('div', {}, el('b', {}, `${zahl(l.nutzlast - g.gewicht, 1)} t`), el('span', {}, 'Restnutzlast')),
      el('div', {}, el('b', {}, pr.ergebnis === 'ok' ? 'passt' : 'prüfen'), el('span', {}, 'Ladeprüfung'))),
    el('div', { class: 'knopfreihe' },
      el('button', { class: 'knopf klein', onclick: () => ladeplanOeffnen(t.lkw, [t.geraet]) }, '3D-Ladeplan'),
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
      el('span', {}, p.typ === 'fahrt' ? `Fahrt ${ortName(p.von_ort)} → ${ortName(p.nach)}` : `${p.text} · ${ortName(p.wo)}`,
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
function renderGewaehlt() {
  renderDetail(); renderAblauf(); renderTourKosten();
  const t = finde(stand.touren, gewaehlt);
  $('#karte-unterzeile').textContent = t ? `${t.id} · ${zielText(t)} · ${kmTour(t)} km · ${stand.touren.length} Touren heute` : `${stand.touren.length} Touren heute`;
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
  if (ansicht === 'plantafel') renderTafel();
  if (ansicht === 'hof') hofAktualisieren();
  if (ansicht === 'fuhrpark') renderFuhrpark();
  if (ansicht === 'kosten') renderKosten();
}
function abspielenUmschalten() {
  if (abspielen) { clearInterval(abspielen); abspielen = null; $('#zeit-play').textContent = '▶ Abspielen'; return; }
  if (zeit >= TAG_ENDE) setzeZeit(TAG_START);
  $('#zeit-play').textContent = '⏸ Anhalten';
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
      }, el('b', {}, `${t.art === 'Abholung' ? '←' : '→'} ${zielText(t)}`), el('span', {}, `${g.kurz}${t.kombi ? ' + ' + finde(GERAETE, t.kombi.geraet).kurz : ''} · ${f.name.split(' ')[0]}`)));
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
        el('td', {}, p.typ === 'fahrt' ? `Fahrt ${ortName(p.von_ort)} → ${ortName(p.nach)}` : `${p.text} (${ortName(p.wo)})`),
        el('td', { class: 'zahl' }, p.typ === 'fahrt' ? p.km : ''),
        el('td', {}, p.ladung ? finde(GERAETE, p.ladung).kurz : el('span', { class: 'g-genehmigung' }, 'leer')))))),
    el('div', { class: 'knopfreihe' },
      el('button', { class: 'knopf klein', onclick: () => { $('#dlg-tour').close(); waehleTour(t.id); } }, 'Auf der Karte zeigen'),
      el('button', { class: 'knopf zweit klein', onclick: () => ladeplanOeffnen(t.lkw, [t.geraet]) }, '3D-Ladeplan'),
      el('button', { class: 'knopf zweit klein', onclick: () => {
        stand.touren = stand.touren.filter((x) => x.id !== id);
        if (gewaehlt === id) gewaehlt = standardTour();
        speichern(); $('#dlg-tour').close(); allesNeu();
      } }, 'Tour stornieren')),
  );
  $('#dlg-tour').showModal();
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

const auftragAusFormular = () => ({ art: $('#f-art').value, geraet: $('#f-geraet').value, ort: $('#f-ort').value, start: startMinuten() });

function renderNeu() {
  const a = auftragAusFormular();
  const g = finde(GERAETE, a.geraet), ort = finde(ORTE, a.ort);
  const bis = a.start + dauerEinfach(a.art, a.ort);
  const zuSpaet = bis > TAG_ENDE;
  $('#f-info').replaceChildren(
    el('strong', {}, g.name), ` · ${zahl(g.gewicht, 1)} t · ${zahl(g.l)} × ${zahl(g.b)} × ${zahl(g.h)} m`,
    el('br'), `${ort.name}, ${ort.km} km · Lkw belegt ${hhmm(a.start)}–${hhmm(bis)}`,
    zuSpaet ? el('div', { class: 'g-nein' }, `Rückkehr nach ${hhmm(TAG_ENDE)} Uhr – bitte früher abfahren.`) : null);

  const liste = kandidaten(a.art, a.geraet, a.ort, a.start);
  const rang = (k) => (k.pruefung.ergebnis === 'ok' && k.frei && k.fahrer.length ? 0 : k.pruefung.ergebnis === 'ok' ? 1 : k.pruefung.ergebnis === 'genehmigung' ? 2 : 3);
  liste.sort((x, y) => rang(x) - rang(y) || x.lkw.nutzlast - y.lkw.nutzlast);
  const zeilen = liste.map((k) => {
    const gruende = k.pruefung.gruende.map((x) => el('div', { class: 'g-' + x.art }, x.txt));
    if (k.pruefung.ergebnis !== 'nein' && !k.frei) gruende.push(el('div', { class: 'g-nein' }, 'zu der Zeit schon verplant'));
    if (k.pruefung.ergebnis !== 'nein' && k.frei && !k.fahrer.length) gruende.push(el('div', { class: 'g-nein' }, `kein freier Fahrer mit Klasse ${k.lkw.fs}`));
    if (k.pruefung.ergebnis === 'genehmigung') gruende.push(el('div', { class: 'g-genehmigung' }, 'erst nach erteilter Genehmigung einplanbar'));
    const aktion = el('div', { class: 'aktion' },
      el('button', { class: 'knopf zweit klein', title: 'Im 3D-Ladeplan weiterplanen', onclick: () => ladeplanOeffnen(k.lkw.id, [a.geraet], a) }, '3D'));
    if (k.pruefung.ergebnis === 'ok' && k.frei && k.fahrer.length && !zuSpaet) {
      const wahl = el('select', { 'aria-label': `Fahrer für ${k.lkw.kz}` }, ...k.fahrer.map((f) => el('option', { value: f.id }, `${f.name} (${f.fs})`)));
      aktion.append(wahl, el('button', { class: 'knopf klein', 'data-einplanen': k.lkw.id, onclick: () => einplanen(a, k.lkw.id, wahl.value) }, 'Einplanen'));
    }
    return el('div', { class: 'kandidat' + (rang(k) === 0 ? ' passt' : '') },
      el('div', { class: 'kz' }, el('strong', {}, k.lkw.kz), el('small', {}, `${k.lkw.typ} · ${zahl(k.lkw.nutzlast, 1)} t`)),
      el('div', { class: 'gruende' }, ...gruende), aktion);
  });
  $('#f-kandidaten').replaceChildren(el('h2', {}, 'Welche Lkw passen?'), ...zeilen);

  const alt = interneAlternative(a);
  const hinweis = $('#f-sped-hinweis');
  hinweis.className = 'hinweis' + (alt ? ' warn' : '');
  hinweis.textContent = alt
    ? `Achtung: ${alt.lkw.kz} passt ohne Genehmigung und ist frei, ${alt.fahrer[0].name} könnte fahren. Der Auftrag wird als vermeidbar markiert.`
    : 'Kein eigener Lkw passt ohne Genehmigung und ist frei. Spedition ist hier begründet.';
}

// Tour anlegen, wenn alles passt (aus Dialog und 3D-Ladeplan). Liefert die neue ID oder null.
function tourAnlegen(a, lkwId, fahrerId) {
  const bis = a.start + dauerEinfach(a.art, a.ort);
  const passt = ladepruefung(finde(GERAETE, a.geraet), finde(LKW, lkwId)).ergebnis === 'ok';
  const f = finde(FAHRER, fahrerId);
  if (!passt || !f || !darfFahren(f, finde(LKW, lkwId)) || bis > TAG_ENDE || !lkwFrei(lkwId, a.start, bis) || !fahrerFrei(fahrerId, a.start, bis)) return null;
  const id = 'T' + (++stand.nr);
  stand.touren.push({ id, lkw: lkwId, fahrer: fahrerId, art: a.art, geraet: a.geraet, ort: a.ort, start: a.start });
  speichern(); allesNeu();
  waehleTour(id);
  return id;
}
function einplanen(a, lkwId, fahrerId) {
  // Doppelt prüfen: der Dialog kann veraltet sein
  if (!tourAnlegen(a, lkwId, fahrerId)) { renderNeu(); return; }
  $('#dlg-neu').close();
}

function anSpedition() {
  const grund = $('#f-grund').value.trim();
  if (!grund) { $('#f-grund').focus(); $('#f-grund').placeholder = 'Bitte einen Grund angeben – ohne Grund keine Spedition.'; return; }
  stand.sped.push({ id: 'S' + (++stand.nr), spedition: 'noch offen', grund, ...auftragAusFormular() });
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
  const intern = stand.touren.reduce((s, t) => s + kostenIntern(t), 0);
  const kmGesamt = stand.touren.reduce((s, t) => s + kmTour(t), 0);
  const leer = leerKm();
  const sped = stand.sped.reduce((s, x) => s + kostenSpedition(x), 0);
  const alternativen = alternativenZuweisen();
  const vermeidbar = stand.sped.map((x) => ({ x, alt: alternativen.get(x.id) })).filter((v) => v.alt)
    .reduce((s, v) => s + kostenSpedition(v.x) - kostenAlternative(v.x, v.alt), 0);
  const vorschlaege = kombiVorschlaege();
  const kombiEuro = vorschlaege.reduce((s, v) => s + v.sparEuro, 0);
  const kpi = (wert, name, art = '') => el('div', { class: 'kpi ' + art }, el('div', { class: 'wert' }, wert), el('div', { class: 'name' }, name));
  $('#kosten-kpis').replaceChildren(
    kpi(euro(intern), `eigene Touren heute · ${kmGesamt} km`),
    kpi(euro(sped), `Speditionen heute · ${stand.sped.length} Aufträge`),
    kpi(`${leer} km`, `Leerfahrten heute · ${kmGesamt ? Math.round(leer / kmGesamt * 100) : 0} % der Strecke`),
    kpi(euro((vermeidbar + kombiEuro) * stand.kosten.arbeitstage), 'Sparpotenzial pro Monat (hochgerechnet)', 'warn'));

  $('#kombi-liste').replaceChildren(...(vorschlaege.length ? vorschlaege.slice(0, 6).map((v) => {
    const la = finde(LKW, v.a.lkw), lb = finde(LKW, v.b.lkw);
    return el('div', { class: 'karte' },
      el('h3', {}, `${la.kz}: ${finde(ORTE, v.a.ort).name} + ${finde(ORTE, v.b.ort).name}`),
      el('p', {}, `Liefert ${finde(GERAETE, v.a.geraet).kurz} nach ${finde(ORTE, v.a.ort).name} und nimmt auf dem Rückweg ${finde(GERAETE, v.b.geraet).kurz} in ${finde(ORTE, v.b.ort).name} mit.`),
      el('p', {}, `Abholung ${hhmm(v.abholNeu)} statt ${hhmm(v.abholAlt)} · Rückkehr ${hhmm(v.bis)}${lb.id === la.id ? '' : ' · ' + lb.kz + ' wird frei'}`),
      el('div', { class: 'befund ok' }, el('strong', {}, `spart ${v.sparKm} km · ca. ${euro(v.sparEuro)}`), ` (${v.kmVorher} → ${v.kmNachher} km)`),
      el('div', { class: 'knopfreihe' }, el('button', { class: 'knopf klein', onclick: () => {
        if (kombiUebernehmen(v.a.id, v.b.id)) { if (gewaehlt === v.b.id) gewaehlt = v.a.id; allesNeu(); } else renderKosten();
      } }, 'Übernehmen')));
  }) : [el('p', { class: 'hinweis' }, 'Keine sinnvollen Kombinationen gefunden.')]));

  $('#sped-kosten').replaceChildren(
    kopfzeile('Auftrag', '#Spedition', '#eigener Lkw', '#Differenz', 'Befund'),
    ...stand.sped.map((x) => {
      const alt = alternativen.get(x.id), preis = kostenSpedition(x);
      return el('tr', {},
        el('td', {}, `${hhmm(x.start)} ${x.art} ${finde(ORTE, x.ort).name} · ${finde(GERAETE, x.geraet).kurz}`),
        el('td', { class: 'zahl' }, euro(preis)),
        el('td', { class: 'zahl' }, alt ? euro(kostenAlternative(x, alt)) : '–'),
        el('td', { class: 'zahl' }, alt ? euro(preis - kostenAlternative(x, alt)) : '–'),
        el('td', {}, alt ? marke('vermeidbar', 'warn') : marke('begründet', 'frei')));
    }));
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

// ---------- 3D-Ladeplan Bedienung ----------
function ladeplanBedienungAufbauen() {
  $('#lp-lkw').replaceChildren(...LKW.map((l) => el('option', { value: l.id }, `${l.kz} · ${l.typ}`)));
  $('#lp-geraet').replaceChildren(...GERAETE.map((g) => el('option', { value: g.id }, g.name)));
  $('#lp-lkw').addEventListener('change', (e) => { lp.lkw = e.target.value; renderLadeplan(); });
  $('#lp-dazu').addEventListener('click', () => { if (lp.geraete.length < LP_MAX) { lp.geraete.push($('#lp-geraet').value); renderLadeplan(); } });
}

// ---------- Ansichten ----------
const ANSICHTEN = ['dashboard', 'plantafel', 'hof', 'ladeplan', 'kosten', 'fuhrpark', 'spedition'];
let ansicht = 'dashboard';
function waehleAnsicht(name) {
  ansicht = name;
  $('.app').dataset.ansicht = name; // für Tablet-Layout: Tourenliste nur in der Tourenübersicht
  document.querySelectorAll('.icons button[data-ansicht]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ansicht === name)));
  for (const v of ANSICHTEN) $('#v-' + v).hidden = v !== name;
  if (name === 'dashboard') { renderGewaehlt(); if (m3) m3.resize(); karte3dDaten(); }
  if (name === 'plantafel') renderTafel();
  if (name === 'hof') hofAktualisieren();
  if (name === 'ladeplan') renderLadeplan();
  if (name === 'kosten') renderKosten();
  if (name === 'fuhrpark') renderFuhrpark();
}
function allesNeu() {
  if (!finde(stand.touren, gewaehlt)) gewaehlt = standardTour();
  renderKpis(); renderListe(); renderSpedition();
  if (ansicht === 'dashboard') { renderGewaehlt(); karte3dDaten(); }
  routenHolen();
  if (ansicht === 'plantafel') renderTafel();
  if (ansicht === 'hof') hofAktualisieren();
  if (ansicht === 'kosten') renderKosten();
  if (ansicht === 'fuhrpark') renderFuhrpark();
}

// ---------- Start ----------
stand = laden();
gewaehlt = standardTour();
document.querySelectorAll('[data-icon]').forEach((b) => { b.append(icon(b.dataset.icon)); if (b.dataset.label) b.append(el('span', {}, b.dataset.label)); });
$('#f-geraet').replaceChildren(...GERAETE.map((g) => el('option', { value: g.id }, g.name)));
$('#f-ort').replaceChildren(...ORTE.map((o) => el('option', { value: o.id }, `${o.name} (${o.km} km)`)));
$('#f-geraet').value = 'G06';
$('#f-ort').value = 'ha';
['#f-art', '#f-geraet', '#f-ort', '#f-start'].forEach((sel) => $(sel).addEventListener('change', renderNeu));
$('#neu-knopf').addEventListener('click', () => { $('#f-grund').value = ''; renderNeu(); $('#dlg-neu').showModal(); });
$('#f-sped-knopf').addEventListener('click', anSpedition);
document.querySelectorAll('[data-schliessen]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('.icons button[data-ansicht]').forEach((b) => b.addEventListener('click', () => waehleAnsicht(b.dataset.ansicht)));
$('#suche').addEventListener('input', renderListe);
$('#reset-knopf').addEventListener('click', () => { stand = neuerStand(); speichern(); gewaehlt = standardTour(); annahmenAufbauen(); allesNeu(); fokusTour(gewaehlt); });
$('#zeit-regler').addEventListener('input', (e) => setzeZeit(Number(e.target.value)));
$('#zeit-play').addEventListener('click', abspielenUmschalten);
$('#zeit-jetzt').addEventListener('click', () => setzeZeit(DEMO_JETZT));
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
