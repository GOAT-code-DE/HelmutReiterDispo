'use strict';
// Beispieldaten der Klick-Demo. Alles erfunden außer Hofadresse und Ortskoordinaten.

const TAG_START = 6 * 60, TAG_ENDE = 19 * 60, SPANNE = TAG_ENDE - TAG_START;
const DEMO_JETZT = 10 * 60 + 30;
const HEUTE = '2026-10-06';               // Demo-Datum (Dienstag)

// ---------- Datum als Zeichenkette JJJJ-MM-TT (Mittag UTC, damit Sommerzeit nichts verschiebt) ----------
const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WOCHENTAGE_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const tagDatum = (tag) => new Date(tag + 'T12:00:00Z');
const tagPlus = (tag, n) => { const x = tagDatum(tag); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const wochentag = (tag) => tagDatum(tag).getUTCDay();
const tagKurz = (tag) => `${WOCHENTAGE[wochentag(tag)]} ${tag.slice(8)}.${tag.slice(5, 7)}.`;
const tagLang = (tag) => `${WOCHENTAGE_LANG[wochentag(tag)]}, ${Number(tag.slice(8))}. ${MONATE[Number(tag.slice(5, 7)) - 1]}`;
const wochenStart = (tag) => tagPlus(tag, -((wochentag(tag) + 6) % 7));
function kalenderwoche(tag) { // ISO-Kalenderwoche
  const donnerstag = tagPlus(wochenStart(tag), 3), jan4 = donnerstag.slice(0, 4) + '-01-04';
  return 1 + Math.round((tagDatum(wochenStart(donnerstag)) - tagDatum(wochenStart(jan4))) / 604800000);
}
const istTag = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && tagPlus(x, 0) === x;
const MAX_HOEHE = 4.0, MAX_BREITE = 2.55; // StVZO, darüber nur mit Genehmigung
const LADEN_MIN = 30, KMH = 50, STRASSENFAKTOR = 1.3;
const FS_RANG = { B: 1, C: 2, CE: 3 };

const ORTE = [
  { id: 'ob', name: 'Oberhausen',      km: 15, lat: 51.4963, lng: 6.8638 },
  { id: 'ge', name: 'Gelsenkirchen',   km: 15, lat: 51.5177, lng: 7.0857 },
  { id: 'bo', name: 'Bochum',          km: 20, lat: 51.4818, lng: 7.2162 },
  { id: 'du', name: 'Duisburg',        km: 25, lat: 51.4344, lng: 6.7623 },
  { id: 're', name: 'Recklinghausen',  km: 30, lat: 51.6141, lng: 7.1979 },
  { id: 'ds', name: 'Düsseldorf',      km: 35, lat: 51.2277, lng: 6.7735 },
  { id: 'wu', name: 'Wuppertal',       km: 35, lat: 51.2562, lng: 7.1508 },
  { id: 'do', name: 'Dortmund',        km: 40, lat: 51.5136, lng: 7.4653 },
  { id: 'kr', name: 'Krefeld',         km: 45, lat: 51.3388, lng: 6.5853 },
  { id: 'mg', name: 'Mönchengladbach', km: 60, lat: 51.1805, lng: 6.4428 },
  { id: 'ha', name: 'Hamm',            km: 70, lat: 51.6739, lng: 7.8150 },
  { id: 'k',  name: 'Köln',            km: 75, lat: 50.9375, lng: 6.9603 },
  { id: 'ms', name: 'Münster',         km: 85, lat: 51.9607, lng: 7.6261 },
];

// Nutzlast t, Ladefläche m, Ladehöhe = Oberkante Ladefläche über Straße, kmSatz = Fahrzeugkosten €/km (Annahme)
const LKW = [
  { id: 'L01', kz: 'E-HR 101', typ: 'Transporter 3,5 t, Pritsche', nutzlast: 1.2,  laenge: 4.3,  breite: 2.1,  ladehoehe: 0.75, fs: 'B',  kmSatz: 0.45 },
  { id: 'L02', kz: 'E-HR 102', typ: '7,5 t Plateau mit Rampen',    nutzlast: 2.9,  laenge: 6.2,  breite: 2.45, ladehoehe: 0.95, fs: 'C',  kmSatz: 0.85 },
  { id: 'L03', kz: 'E-HR 103', typ: '7,5 t Plateau mit Rampen',    nutzlast: 2.9,  laenge: 6.2,  breite: 2.45, ladehoehe: 0.95, fs: 'C',  kmSatz: 0.85 },
  { id: 'L04', kz: 'E-HR 104', typ: '12 t Plateau mit Rampen',     nutzlast: 5.5,  laenge: 7.0,  breite: 2.48, ladehoehe: 1.0,  fs: 'C',  kmSatz: 1.05 },
  { id: 'L05', kz: 'E-HR 105', typ: '18 t Plateau mit Rampen',     nutzlast: 9.0,  laenge: 7.5,  breite: 2.5,  ladehoehe: 1.1,  fs: 'C',  kmSatz: 1.25 },
  { id: 'L06', kz: 'E-HR 106', typ: '18 t Plateau mit Rampen',     nutzlast: 9.0,  laenge: 7.5,  breite: 2.5,  ladehoehe: 1.1,  fs: 'C',  kmSatz: 1.25 },
  { id: 'L07', kz: 'E-HR 107', typ: '26 t Plateau mit Rampen',     nutzlast: 13.0, laenge: 8.2,  breite: 2.5,  ladehoehe: 1.15, fs: 'C',  kmSatz: 1.45 },
  { id: 'L08', kz: 'E-HR 108', typ: 'Sattelzug, Semi-Tieflader',   nutzlast: 26.0, laenge: 13.6, breite: 2.55, ladehoehe: 0.9,  fs: 'CE', kmSatz: 1.75 },
  { id: 'L09', kz: 'E-HR 109', typ: 'Sattelzug, Tiefbett',         nutzlast: 30.0, laenge: 12.0, breite: 2.55, ladehoehe: 0.45, fs: 'CE', kmSatz: 1.85 },
  { id: 'L10', kz: 'E-HR 110', typ: 'Lkw mit Tiefladeanhänger',    nutzlast: 16.0, laenge: 9.0,  breite: 2.55, ladehoehe: 0.6,  fs: 'CE', kmSatz: 1.6 },
];

const FAHRER = [
  { id: 'F01', name: 'Jan Becker',    fs: 'CE' },
  { id: 'F02', name: 'Murat Yilmaz',  fs: 'CE' },
  { id: 'F03', name: 'Sven Krüger',   fs: 'CE' },
  { id: 'F04', name: 'Tobias Wagner', fs: 'C' },
  { id: 'F05', name: 'Dirk Hoffmann', fs: 'C' },
  { id: 'F06', name: 'Lukas Schäfer', fs: 'C' },
  { id: 'F07', name: 'Ali Demir',     fs: 'C' },
  { id: 'F08', name: 'Kevin Schulz',  fs: 'C' },
  { id: 'F09', name: 'Marco Richter', fs: 'B' },
  { id: 'F10', name: 'Peter Lange',   fs: 'C', abwesend: 'krank' },
];

// Transportmaße: Gewicht t, Länge × Breite × Höhe m; form steuert die 3D-Darstellung
const GERAETE = [
  { id: 'G01', name: 'Yale ERP16 Elektrostapler',            kurz: 'ERP16',        gewicht: 2.9,  l: 2.9, b: 1.1,  h: 2.1, form: 'stapler', farbe: '#f2b705' },
  { id: 'G02', name: 'Scherenarbeitsbühne 10 m, elektrisch', kurz: 'Schere 10 m',  gewicht: 2.3,  l: 2.5, b: 0.85, h: 2.3, form: 'schere',  farbe: '#e8772e' },
  { id: 'G03', name: 'Gelenkteleskopbühne 12 m',             kurz: 'Gelenk 12 m',  gewicht: 2.7,  l: 4.0, b: 1.5,  h: 2.0, form: 'gelenk',  farbe: '#e8772e' },
  { id: 'G04', name: 'Yale GDP35 Dieselstapler',             kurz: 'GDP35',        gewicht: 5.2,  l: 3.8, b: 1.3,  h: 2.3, form: 'stapler', farbe: '#f2b705' },
  { id: 'G05', name: 'Manitou MT 1440 Teleskoplader',        kurz: 'MT 1440',      gewicht: 8.6,  l: 5.4, b: 2.3,  h: 2.4, form: 'tele',    farbe: '#d32f2f' },
  { id: 'G06', name: 'Manitou MT 1840 Teleskoplader',        kurz: 'MT 1840',      gewicht: 10.8, l: 6.0, b: 2.4,  h: 2.5, form: 'tele',    farbe: '#d32f2f' },
  { id: 'G07', name: 'Niftylift HR21 Gelenkbühne 21 m',      kurz: 'HR21',         gewicht: 6.8,  l: 6.3, b: 2.3,  h: 2.6, form: 'gelenk',  farbe: '#2e7d32' },
  { id: 'G08', name: 'Bulmor DQ 50 Seitenstapler',           kurz: 'DQ 50',        gewicht: 9.8,  l: 5.2, b: 2.5,  h: 3.0, form: 'stapler', farbe: '#1565c0' },
  { id: 'G09', name: 'Manitou MRT 2550 Roto',                kurz: 'MRT 2550',     gewicht: 16.5, l: 6.9, b: 2.5,  h: 3.0, form: 'tele',    farbe: '#d32f2f' },
  { id: 'G10', name: 'Yale GDP80 Dieselstapler (8 t)',       kurz: 'GDP80',        gewicht: 12.0, l: 5.0, b: 2.3,  h: 3.1, form: 'stapler', farbe: '#f2b705' },
  { id: 'G11', name: 'Yale GDP160 Schwerlaststapler (16 t)', kurz: 'GDP160',       gewicht: 24.0, l: 6.5, b: 2.8,  h: 3.6, form: 'stapler', farbe: '#f2b705' },
  { id: 'G12', name: 'Elektro-Hochhubwagen',                 kurz: 'Hochhubwagen', gewicht: 0.6,  l: 1.9, b: 0.8,  h: 1.4, form: 'stapler', farbe: '#f2b705' },
];

const SEED_TOUREN = [
  { id: 'T01', lkw: 'L02', fahrer: 'F04', geraet: 'G01', ort: 'du', art: 'Auslieferung', start: 7 * 60 },
  { id: 'T02', lkw: 'L02', fahrer: 'F04', geraet: 'G03', ort: 'bo', art: 'Abholung',     start: 11 * 60 },
  { id: 'T03', lkw: 'L04', fahrer: 'F05', geraet: 'G04', ort: 'do', art: 'Auslieferung', start: 8 * 60 },
  { id: 'T04', lkw: 'L05', fahrer: 'F06', geraet: 'G07', ort: 'ds', art: 'Auslieferung', start: 11 * 60 },
  { id: 'T05', lkw: 'L08', fahrer: 'F01', geraet: 'G09', ort: 'k',  art: 'Auslieferung', start: 7 * 60 + 20 },
  { id: 'T06', lkw: 'L08', fahrer: 'F01', geraet: 'G10', ort: 'kr', art: 'Abholung',     start: 13 * 60 },
  { id: 'T07', lkw: 'L09', fahrer: 'F02', geraet: 'G08', ort: 'ms', art: 'Abholung',     start: 12 * 60 },
  { id: 'T08', lkw: 'L01', fahrer: 'F09', geraet: 'G12', ort: 'ob', art: 'Auslieferung', start: 7 * 60 + 15 },
  { id: 'T09', lkw: 'L01', fahrer: 'F09', geraet: 'G12', ort: 'ge', art: 'Abholung',     start: 13 * 60 + 30 },
  { id: 'T10', lkw: 'L03', fahrer: 'F07', geraet: 'G02', ort: 'wu', art: 'Auslieferung', start: 14 * 60 },
  { id: 'T11', lkw: 'L06', fahrer: 'F08', geraet: 'G05', ort: 're', art: 'Abholung',     start: 7 * 60 + 15 },
  { id: 'T12', lkw: 'L10', fahrer: 'F03', geraet: 'G06', ort: 'ge', art: 'Auslieferung', start: 7 * 60 + 10 },
  { id: 'T13', lkw: 'L06', fahrer: 'F08', geraet: 'G01', ort: 'kr', art: 'Abholung',     start: 11 * 60 + 30 },
];
const SEED_SPED = [
  { id: 'S01', geraet: 'G06', ort: 'do', art: 'Auslieferung', start: 9 * 60,  spedition: 'Spedition Nord',  grund: 'kein Lkw frei' },
  { id: 'S02', geraet: 'G11', ort: 'k',  art: 'Auslieferung', start: 8 * 60,  spedition: 'Schwerlast West', grund: 'Überbreite 2,80 m, Schwertransport mit Genehmigung' },
  { id: 'S03', geraet: 'G02', ort: 'ms', art: 'Abholung',     start: 13 * 60, spedition: 'Spedition Nord',  grund: 'kein Fahrer verfügbar' },
];

// Kostenannahmen, im Reiter „Kosten“ änderbar
const KOSTEN_START = { fahrerStunde: 38, spedKm: 2.4, spedGrund: 140, schwerFaktor: 2.5, arbeitstage: 21 };
