'use strict';
// Beispieldaten der Klick-Demo. Echt sind Hofadresse, Ortskoordinaten, die Straßenadressen der Beispielkunden und die Gerätewerte
// aus den Herstellerdatenblättern (siehe GERAETE); Lkw, Fahrer, Firmen, Personen, Verträge und Aufträge sind erfunden.

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
const istSonntag = (tag) => wochentag(tag) === 0;   // Lkw-Fahrverbot: sonntags wird nicht geplant
const MAX_HOEHE = 4.0, MAX_BREITE = 2.55; // StVZO, darüber nur mit Genehmigung
const LADEN_MIN = 30, KMH = 50, STRASSENFAKTOR = 1.3;
const FS_RANG = { B: 1, C: 2, CE: 3 };

// Städte für die erzeugten Beispieltouren; ORTE enthält zusätzlich die Kunden (logik.js trägt sie ein)
const STAEDTE = [
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
const ORTE = [...STAEDTE];
const HOF = { lat: 51.4559, lng: 7.05868 }; // Wilhelm-Beckmann-Straße 16, Essen-Kray

// Beispielkunden: echte Straßenadressen (Koordinaten über die OSM-Adresssuche), Firmen, Personen und Telefonnummern erfunden
const KUNDEN = [
  { id: 'K01', firma: 'Innenhafen Bau GmbH',               strasse: 'Philosophenweg 21',       plz: '47051', stadt: 'Duisburg',       ansprechpartner: 'Frau Kaya',    telefon: '0203 555 0101', lat: 51.44051, lng: 6.76959 },
  { id: 'K02', firma: 'Campus Gebäudetechnik GmbH',        strasse: 'Universitätsstraße 150',  plz: '44801', stadt: 'Bochum',         ansprechpartner: 'Herr Brandt',  telefon: '0234 555 0102', lat: 51.44416, lng: 7.26100 },
  { id: 'K03', firma: 'Neue Mitte Ausbau KG',              strasse: 'Essener Straße 3',        plz: '46047', stadt: 'Oberhausen',     ansprechpartner: 'Frau Lehmann', telefon: '0208 555 0103', lat: 51.48725, lng: 6.86512 },
  { id: 'K04', firma: 'Arena Veranstaltungstechnik GmbH',  strasse: 'Rudi-Assauer-Platz 1',    plz: '45891', stadt: 'Gelsenkirchen',  ansprechpartner: 'Herr Nowak',   telefon: '0209 555 0104', lat: 51.55459, lng: 7.06760 },
  { id: 'K05', firma: 'Messebau Westfalen GmbH',           strasse: 'Rheinlanddamm 200',       plz: '44139', stadt: 'Dortmund',       ansprechpartner: 'Frau Schulte', telefon: '0231 555 0105', lat: 51.49651, lng: 7.45693 },
  { id: 'K06', firma: 'Vestische Industriemontage GmbH',   strasse: 'Blitzkuhlenstraße 101',   plz: '45659', stadt: 'Recklinghausen', ansprechpartner: 'Herr Peters',  telefon: '02361 555 0106', lat: 51.59382, lng: 7.22124 },
  { id: 'K07', firma: 'Hafen Logistik Düsseldorf GmbH',    strasse: 'Speditionstraße 1',       plz: '40221', stadt: 'Düsseldorf',     ansprechpartner: 'Frau Wolff',   telefon: '0211 555 0107', lat: 51.21418, lng: 6.74924 },
  { id: 'K08', firma: 'Bergische Hallenbau GmbH',          strasse: 'Uellendahler Straße 353', plz: '42109', stadt: 'Wuppertal',      ansprechpartner: 'Herr Krause',  telefon: '0202 555 0108', lat: 51.27859, lng: 7.15922 },
  { id: 'K09', firma: 'Rheinhafen Krefeld Umschlag GmbH',  strasse: 'Untergath 43',            plz: '47805', stadt: 'Krefeld',        ansprechpartner: 'Frau Arslan',  telefon: '02151 555 0109', lat: 51.31713, lng: 6.57961 },
  { id: 'K10', firma: 'Messeaufbau Köln GmbH',             strasse: 'Messeplatz 1',            plz: '50679', stadt: 'Köln',           ansprechpartner: 'Herr Jansen',  telefon: '0221 555 0110', lat: 50.94827, lng: 6.98394 },
  { id: 'K11', firma: 'Hafenquartier Münster Bau GmbH',    strasse: 'Hafenweg 26',             plz: '48155', stadt: 'Münster',        ansprechpartner: 'Frau Becker',  telefon: '0251 555 0111', lat: 51.95219, lng: 7.64325 },
  { id: 'K12', firma: 'Lippe Lager Hamm GmbH',             strasse: 'Hafenstraße 45',          plz: '59067', stadt: 'Hamm',           ansprechpartner: 'Herr Schmitz', telefon: '02381 555 0112', lat: 51.67780, lng: 7.79245 },
];

// Nutzlast t, Ladefläche m, Ladehöhe = Oberkante Ladefläche über Straße, kmSatz = Fahrzeugkosten €/km (Annahme)
// Aufbau für die Beladungslogik, Werte angelehnt an Herstellerdatenblätter (Goldhofer, Broshuis, Böckmann), nicht Reiters echte Lkw.
// Längen in m ab Vorderkante Ladefläche:
//   zonen      Abschnitte von vorn nach hinten (Schwanenhals, Ladefläche …) mit Länge und Höhe über Straße; ein Gerät steht ganz in einer Zone.
//              Stufen zwischen Zonen gelten als befahrbar (Auffahrkeile an Bord). ladehoehe bleibt die Höhe der niedrigsten Zone für den bisherigen Code.
//   nutzbreite Breite zwischen Bordwänden bzw. Rungen
//   rampe      Auffahrrampe: Steigung und Knick an der Kante zur Ladefläche in Grad. Knick kleiner als Steigung = Heckabschrägung
//              oder Übergangsblech teilt den Knick. Oder Ladebordwand mit Traglast t (vereinfacht ohne Lastabstand) und Plattformlänge m
//   zurr       Zurrpunkte (je ein Paar links/rechts) als Position: ältere Aufbauten wenige an festen Stellen, neuere ein dichtes Raster
//   zurrLast   was ein Zurrpunkt hält in t (Bodenöse am Transporter bis 10-t-Ring am Tieflader)
//   achsen     Lastpunkte vorn (Vorderachse bzw. Sattelkupplung) und hinten (Hinterachse bzw. Achsaggregat): Position und freie Achslast t
//              bis zur zulässigen Achslast. Geprüft wird nur Überlast, keine Mindestlast der Lenkachse.
const LKW = [
  { id: 'L01', kz: 'E-HR 101', typ: 'Transporter 3,5 t, Pritsche', nutzlast: 1.4,  laenge: 4.3,  breite: 2.1,  ladehoehe: 0.75, fs: 'B',  kmSatz: 0.45,
    zonen: [{ name: 'Pritsche', laenge: 4.3, hoehe: 0.75 }], nutzbreite: 2.0,
    rampe: { art: 'ladebordwand', traglast: 1.5, laenge: 2.2 }, zurr: [0.2, 1.2, 2.2, 3.2, 4.1], zurrLast: 0.8,
    achsen: { vorn: { x: -1.4, frei: 0.5 }, hinten: { x: 2.4, frei: 1.0 } } },
  { id: 'L02', kz: 'E-HR 102', typ: '7,5 t Plateau mit Rampen',    nutzlast: 3.5,  laenge: 6.2,  breite: 2.45, ladehoehe: 0.95, fs: 'C',  kmSatz: 0.85,
    zonen: [{ name: 'Plateau', laenge: 6.2, hoehe: 0.95 }], nutzbreite: 2.3,
    rampe: { art: 'rampe', winkel: 16, knick: 12 }, zurr: [0.3, 2.0, 4.6, 6.0], zurrLast: 2.0,
    achsen: { vorn: { x: -1.6, frei: 1.1 }, hinten: { x: 3.7, frei: 3.2 } } },
  { id: 'L03', kz: 'E-HR 103', typ: '7,5 t Plateau mit Rampen',    nutzlast: 3.5,  laenge: 6.2,  breite: 2.45, ladehoehe: 0.95, fs: 'C',  kmSatz: 0.85,
    zonen: [{ name: 'Plateau', laenge: 6.2, hoehe: 0.95 }], nutzbreite: 2.35,
    rampe: { art: 'rampe', winkel: 12, knick: 6 }, zurr: [0.5, 3.0, 5.8], zurrLast: 2.0,
    achsen: { vorn: { x: -1.6, frei: 1.1 }, hinten: { x: 3.7, frei: 3.2 } } },
  { id: 'L04', kz: 'E-HR 104', typ: '12 t Plateau mit Rampen',     nutzlast: 5.5,  laenge: 7.0,  breite: 2.48, ladehoehe: 1.0,  fs: 'C',  kmSatz: 1.05,
    zonen: [{ name: 'Plateau', laenge: 7.0, hoehe: 1.0 }], nutzbreite: 2.48,
    rampe: { art: 'rampe', winkel: 17, knick: 17 }, zurr: [0.3, 1.5, 2.7, 3.9, 5.1, 6.3, 6.8], zurrLast: 3.0,
    achsen: { vorn: { x: -1.5, frei: 1.6 }, hinten: { x: 4.2, frei: 4.6 } } },
  { id: 'L05', kz: 'E-HR 105', typ: '18 t Plateau mit Rampen',     nutzlast: 9.0,  laenge: 7.5,  breite: 2.5,  ladehoehe: 1.1,  fs: 'C',  kmSatz: 1.25,
    zonen: [{ name: 'Plateau', laenge: 7.5, hoehe: 1.1 }], nutzbreite: 2.4,
    rampe: { art: 'rampe', winkel: 15, knick: 12 }, zurr: [0.3, 1.5, 2.7, 3.9, 5.1, 6.3, 7.3], zurrLast: 4.0,
    achsen: { vorn: { x: -1.6, frei: 2.2 }, hinten: { x: 4.8, frei: 7.8 } } },
  { id: 'L06', kz: 'E-HR 106', typ: '18 t Plateau mit Rampen',     nutzlast: 9.0,  laenge: 7.5,  breite: 2.5,  ladehoehe: 1.1,  fs: 'C',  kmSatz: 1.25,
    zonen: [{ name: 'Plateau', laenge: 7.5, hoehe: 1.1 }], nutzbreite: 2.5,
    rampe: { art: 'rampe', winkel: 11, knick: 6 }, zurr: [0.3, 0.9, 1.5, 2.1, 2.7, 3.3, 3.9, 4.5, 5.1, 5.7, 6.3, 6.9, 7.3], zurrLast: 5.0,
    achsen: { vorn: { x: -1.6, frei: 2.2 }, hinten: { x: 4.8, frei: 7.8 } } },
  { id: 'L07', kz: 'E-HR 107', typ: '26 t Plateau mit Rampen',     nutzlast: 13.0, laenge: 8.2,  breite: 2.5,  ladehoehe: 1.15, fs: 'C',  kmSatz: 1.45,
    zonen: [{ name: 'Plateau', laenge: 8.2, hoehe: 1.15 }], nutzbreite: 2.38,
    rampe: { art: 'rampe', winkel: 16, knick: 16 }, zurr: [0.3, 1.5, 2.7, 3.9, 5.1, 6.3, 7.5, 8.0], zurrLast: 6.0,
    achsen: { vorn: { x: -1.8, frei: 3.0 }, hinten: { x: 5.4, frei: 11.0 } } },
  { id: 'L08', kz: 'E-HR 108', typ: 'Sattelzug, Semi-Tieflader',   nutzlast: 26.0, laenge: 13.6, breite: 2.55, ladehoehe: 0.9,  fs: 'CE', kmSatz: 1.75,
    zonen: [{ name: 'Schwanenhals', laenge: 3.6, hoehe: 1.35 }, { name: 'Ladefläche', laenge: 10.0, hoehe: 0.9 }], nutzbreite: 2.55,
    rampe: { art: 'rampe', winkel: 15, knick: 8 }, zurr: [0.4, 1.6, 2.8, 3.4, 3.9, 5.1, 6.3, 7.5, 8.7, 9.9, 11.1, 12.3, 13.3], zurrLast: 10.0,
    achsen: { vorn: { x: 1.0, frei: 9.0 }, hinten: { x: 11.0, frei: 21.0 } } },
  { id: 'L09', kz: 'E-HR 109', typ: 'Sattelzug, Tiefbett',         nutzlast: 30.0, laenge: 12.0, breite: 2.55, ladehoehe: 0.45, fs: 'CE', kmSatz: 1.85,
    zonen: [{ name: 'Schwanenhals', laenge: 3.2, hoehe: 1.3 }, { name: 'Tiefbett', laenge: 6.8, hoehe: 0.45 }, { name: 'Heck über den Achsen', laenge: 2.0, hoehe: 1.05 }], nutzbreite: 2.55,
    rampe: { art: 'rampe', winkel: 12, knick: 8 }, zurr: [0.4, 1.6, 2.8, 3.4, 4.6, 5.8, 7.0, 8.2, 9.8, 10.6, 11.8], zurrLast: 10.0,
    achsen: { vorn: { x: 1.0, frei: 9.0 }, hinten: { x: 10.8, frei: 22.0 } } },
  { id: 'L10', kz: 'E-HR 110', typ: 'Lkw mit Tiefladeanhänger',    nutzlast: 16.0, laenge: 9.0,  breite: 2.55, ladehoehe: 0.6,  fs: 'CE', kmSatz: 1.6,
    zonen: [{ name: 'Ladefläche', laenge: 9.0, hoehe: 0.6 }], nutzbreite: 2.55,
    rampe: { art: 'rampe', winkel: 10, knick: 8 }, zurr: [0.3, 2.4, 4.5, 6.6, 8.7], zurrLast: 6.0,
    achsen: { vorn: { x: 1.0, frei: 6.0 }, hinten: { x: 6.5, frei: 12.0 } } },
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

// Geräte aus Reiters Mietpark mit Werten aus den Herstellerdatenblättern (Abruf 09.10.2026, PDFs auf helmutreiter.com
// unter /fileadmin/products/download/download/, HR21 bei niftylift.com). Gewicht t, Länge × Breite × Höhe m in Transportlage,
// Radstand und Bodenfreiheit (Mitte Radstand bzw. Maschine) m, Steigfähigkeit % ohne Last; form steuert die 3D-Darstellung.
// - Stapler und Teleskoplader mit Gabeln (Länge l1, MS16X in Geh-Ausführung); Teleskoplader: l2 + 1,2 m Gabeln. Höhe Stapler = Hubgerüst eingefahren (h1).
// - Steigfähigkeit Elektrostapler: Kurzzeitwert (5 min), die Rampe dauert Sekunden. Manitou-Teleskoplader: nicht im Datenblatt, Annahme 45 %.
// - Annahme (in keinem Datenblatt): Anschlagpunkte (je ein Paar links/rechts) vorn/hinten und Schwerpunkt in m ab Vorderkante
//   Gerät (Gerät steht mit der Vorderkante zum Fahrerhaus), dazu die Bodenfreiheit der HR21. Echte Werte stehen in den Betriebsanleitungen.
// - Gewicht und Bauhöhe hängen an Mast, Batterie und Baujahr; im Workshop gegen Reiters Bestand prüfen.
const GERAETE = [
  { id: 'G01', name: 'Yale ERP16VT Elektrostapler',              kurz: 'ERP16VT',    gewicht: 3.26,  l: 3.01, b: 1.05, h: 2.23, form: 'stapler', farbe: '#f2b705', radstand: 1.49, boden: 0.1,   steig: 35, anschlag: [0.5, 2.8],   schwerpunkt: 1.95 },
  { id: 'G02', name: 'Manitou 100 SEC Scherenbühne 10 m',        kurz: '100 SEC',    gewicht: 1.96,  l: 2.44, b: 0.81, h: 2.26, form: 'schere',  farbe: '#e8772e', radstand: 1.85, boden: 0.09,  steig: 25, anschlag: [0.2, 2.25],  schwerpunkt: 1.15 },
  { id: 'G03', name: 'Manitou 120 AETJ-C Gelenkteleskopbühne 12 m', kurz: '120 AETJ-C', gewicht: 6.66, l: 5.48, b: 1.2, h: 2.16, form: 'gelenk',  farbe: '#e8772e', radstand: 1.65, boden: 0.1,   steig: 25, anschlag: [0.8, 4.65],  schwerpunkt: 3.55 },
  { id: 'G04', name: 'Yale GDP3.5N Dieselstapler',               kurz: 'GDP3.5N',    gewicht: 4.88,  l: 3.89, b: 1.23, h: 2.18, form: 'stapler', farbe: '#f2b705', radstand: 1.7,  boden: 0.2,   steig: 25, anschlag: [0.6, 3.7],   schwerpunkt: 2.55 },
  { id: 'G05', name: 'Manitou MT 1440 easy Teleskoplader',       kurz: 'MT 1440',    gewicht: 10.86, l: 7.33, b: 2.36, h: 2.45, form: 'tele',    farbe: '#d32f2f', radstand: 3.07, boden: 0.37,  steig: 45, anschlag: [1.1, 6.8],   schwerpunkt: 4.05 },
  { id: 'G06', name: 'Manitou MT 1840 easy Teleskoplader',       kurz: 'MT 1840',    gewicht: 11.71, l: 7.47, b: 2.36, h: 2.45, form: 'tele',    farbe: '#d32f2f', radstand: 3.07, boden: 0.37,  steig: 45, anschlag: [1.1, 6.95],  schwerpunkt: 4.1 },
  { id: 'G07', name: 'Niftylift HR21 4x4 Gelenkbühne 21 m',      kurz: 'HR21',       gewicht: 6.64,  l: 5.47, b: 2.27, h: 2.18, form: 'gelenk',  farbe: '#2e7d32', radstand: 2.3,  boden: 0.25,  steig: 45, anschlag: [0.7, 5.1],   schwerpunkt: 3.65 },
  { id: 'G08', name: 'Bulmor DQ 50/14 Seitenstapler',            kurz: 'DQ 50',      gewicht: 8.12,  l: 4.83, b: 2.2,  h: 2.83, form: 'stapler', farbe: '#1565c0', radstand: 2.84, boden: 0.2,   steig: 24, anschlag: [0.35, 4.45], schwerpunkt: 2.4 },
  { id: 'G09', name: 'Manitou MRT 2550 Privilege Plus Roto',     kurz: 'MRT 2550',   gewicht: 18.9,  l: 9.04, b: 2.49, h: 3.05, form: 'tele',    farbe: '#d32f2f', radstand: 3.05, boden: 0.35,  steig: 45, anschlag: [1.3, 8.5],   schwerpunkt: 4.7 },
  { id: 'G10', name: 'Yale GDP80VX9 Dieselstapler (8 t)',        kurz: 'GDP80VX9',   gewicht: 12.42, l: 5.24, b: 2.24, h: 3.46, form: 'stapler', farbe: '#f2b705', radstand: 2.45, boden: 0.25,  steig: 26, anschlag: [0.85, 4.95], schwerpunkt: 3.35 },
  { id: 'G11', name: 'Yale GDP160EF Schwerlaststapler (16 t)',   kurz: 'GDP160EF',   gewicht: 19.46, l: 6.81, b: 2.54, h: 4.19, form: 'stapler', farbe: '#f2b705', radstand: 3.3,  boden: 0.34,  steig: 32, anschlag: [1.05, 6.5],  schwerpunkt: 4.2 },
  { id: 'G12', name: 'Yale MS16X Elektro-Hochhubwagen',          kurz: 'MS16X',      gewicht: 1.24,  l: 2.08, b: 0.79, h: 2.1,  form: 'stapler', farbe: '#f2b705', radstand: 1.39, boden: 0.032, steig: 20, anschlag: [0.2, 1.85],  schwerpunkt: 1.3 },
  { id: 'G13', name: 'Manitou 78 SEC Scherenbühne 8 m',          kurz: '78 SEC',     gewicht: 1.5,   l: 1.83, b: 0.81, h: 2.11, form: 'schere',  farbe: '#e8772e', radstand: 1.32, boden: 0.06,  steig: 25, anschlag: [0.15, 1.7],  schwerpunkt: 0.9 },
  { id: 'G14', name: 'Manitou 80 VJR Vertikalmastbühne 8 m',     kurz: '80 VJR',     gewicht: 2.41,  l: 2.9,  b: 0.99, h: 1.99, form: 'schere',  farbe: '#e8772e', radstand: 1.2,  boden: 0.09,  steig: 25, anschlag: [0.3, 2.6],   schwerpunkt: 1.45 },
  { id: 'G15', name: 'Manitou 140 SC Dieselschere 14 m, 4x4',    kurz: '140 SC',     gewicht: 5.22,  l: 3.76, b: 1.75, h: 2.74, form: 'schere',  farbe: '#e8772e', radstand: 2.29, boden: 0.24,  steig: 30, anschlag: [0.3, 3.5],   schwerpunkt: 1.9 },
  { id: 'G16', name: 'Yale ERP20VF Elektrostapler',              kurz: 'ERP20VF',    gewicht: 3.39,  l: 3.08, b: 1.12, h: 2.18, form: 'stapler', farbe: '#f2b705', radstand: 1.54, boden: 0.1,   steig: 36, anschlag: [0.5, 2.9],   schwerpunkt: 2.0 },
  { id: 'G17', name: 'Yale GLP2.5N Treibgasstapler',             kurz: 'GLP2.5N',    gewicht: 3.87,  l: 3.69, b: 1.21, h: 2.15, form: 'stapler', farbe: '#f2b705', radstand: 1.65, boden: 0.18,  steig: 25, anschlag: [0.5, 3.5],   schwerpunkt: 2.4 },
  { id: 'G18', name: 'Manitou MT 625 H Teleskoplader, kompakt',  kurz: 'MT 625 H',   gewicht: 4.8,   l: 5.1,  b: 1.81, h: 1.92, form: 'tele',    farbe: '#d32f2f', radstand: 2.3,  boden: 0.33,  steig: 45, anschlag: [0.8, 4.7],   schwerpunkt: 2.9 },
];

const SEED_TOUREN = [
  { id: 'T01', lkw: 'L02', fahrer: 'F04', geraet: 'G01', ort: 'du', art: 'Auslieferung', start: 7 * 60 },
  { id: 'T02', lkw: 'L02', fahrer: 'F04', geraet: 'G16', ort: 'bo', art: 'Abholung',     start: 11 * 60 },
  { id: 'T03', lkw: 'L04', fahrer: 'F05', geraet: 'G18', ort: 'do', art: 'Auslieferung', start: 8 * 60 },
  { id: 'T04', lkw: 'L05', fahrer: 'F06', geraet: 'G07', ort: 'ds', art: 'Auslieferung', start: 11 * 60 },
  { id: 'T05', lkw: 'L08', fahrer: 'F01', geraet: 'G09', ort: 'k',  art: 'Auslieferung', start: 7 * 60 + 20 },
  { id: 'T06', lkw: 'L08', fahrer: 'F01', geraet: 'G05', ort: 'kr', art: 'Abholung',     start: 13 * 60 },
  { id: 'T07', lkw: 'L09', fahrer: 'F02', geraet: 'G08', ort: 'ms', art: 'Abholung',     start: 12 * 60 },
  { id: 'T08', lkw: 'L01', fahrer: 'F09', geraet: 'G12', ort: 'ob', art: 'Auslieferung', start: 7 * 60 + 15 },
  { id: 'T09', lkw: 'L01', fahrer: 'F09', geraet: 'G12', ort: 'ge', art: 'Abholung',     start: 13 * 60 + 30 },
  { id: 'T10', lkw: 'L03', fahrer: 'F07', geraet: 'G02', ort: 'wu', art: 'Auslieferung', start: 14 * 60 },
  { id: 'T11', lkw: 'L06', fahrer: 'F08', geraet: 'G03', ort: 're', art: 'Abholung',     start: 7 * 60 + 15 },
  { id: 'T12', lkw: 'L10', fahrer: 'F03', geraet: 'G06', ort: 'ge', art: 'Auslieferung', start: 7 * 60 + 10 },
  { id: 'T13', lkw: 'L06', fahrer: 'F08', geraet: 'G01', ort: 'kr', art: 'Abholung',     start: 11 * 60 + 30 },
];
const SEED_SPED = [
  { id: 'S01', geraet: 'G06', ort: 'do', art: 'Auslieferung', start: 9 * 60,  spedition: 'Spedition Nord',  grund: 'kein Lkw frei' },
  { id: 'S02', geraet: 'G11', ort: 'k',  art: 'Auslieferung', start: 8 * 60,  spedition: 'Schwerlast West', grund: 'Bauhöhe 4,19 m, Schwertransport mit Genehmigung' },
  { id: 'S03', geraet: 'G02', ort: 'ms', art: 'Abholung',     start: 13 * 60, spedition: 'Spedition Nord',  grund: 'kein Fahrer verfügbar' },
];

// Weitere Beispielkunden mit Mietverträgen, damit die Kundenansicht mit vielen Kunden gezeigt werden kann.
// Fester Zufall; Adressen erfunden und nur ungefähr in der Stadt (Koordinaten nahe der Stadtmitte).
const KUNDEN_ERZEUGT = [], VERTRAEGE_ERZEUGT = [];
(() => {
  let saat = 4711;
  const zufall = () => { saat = (saat * 1103515245 + 12345) % 2147483648; return saat / 2147483648; };
  const wahl = (liste) => liste[Math.floor(zufall() * liste.length)];
  const PLZ = { ob: '46045', ge: '45879', bo: '44787', du: '47051', re: '45657', ds: '40213', wu: '42103', do: '44135', kr: '47798', mg: '41061', ha: '59065', k: '50667', ms: '48143' };
  const VORWAHL = { ob: '0208', ge: '0209', bo: '0234', du: '0203', re: '02361', ds: '0211', wu: '0202', do: '0231', kr: '02151', mg: '02161', ha: '02381', k: '0221', ms: '0251' };
  const VORN = ['Rhein', 'Ruhr', 'Westfalen', 'Emscher', 'Lippe', 'Revier', 'Niederrhein', 'Kanal', 'Zeche', 'Hafen', 'Stern', 'Nord'];
  const ART = ['Bau', 'Montage', 'Logistik', 'Gerüstbau', 'Elektrotechnik', 'Hallenbau', 'Facility Service', 'Veranstaltungstechnik', 'Industrieservice', 'Dachtechnik', 'Stahlbau', 'Gebäudereinigung'];
  const FORM = ['GmbH', 'GmbH & Co. KG', 'KG', 'AG'];
  const STRASSE = ['Industriestraße', 'Gewerbering', 'Werkstraße', 'Am Bauhof', 'Kanalstraße', 'Zechenstraße', 'Robert-Bosch-Straße', 'Siemensstraße', 'Daimlerstraße', 'Gutenbergstraße', 'Hafenstraße', 'Bahnhofstraße'];
  const NAME = ['Albers', 'Bauer', 'Demir', 'Engel', 'Fischer', 'Graf', 'Hahn', 'Jung', 'König', 'Lorenz', 'Möller', 'Neumann', 'Otto', 'Pohl', 'Richter', 'Sommer', 'Thiel', 'Vogel', 'Weber', 'Yıldız'];
  const firmen = new Set(KUNDEN.map((k) => k.firma));
  for (let i = 0; i < 120; i++) {
    const s = wahl(STAEDTE);
    let firma = `${wahl(VORN)} ${wahl(ART)} ${wahl(FORM)}`;
    if (firmen.has(firma)) firma = firma.replace(/ (GmbH|KG|AG)/, ` ${s.name} $1`);
    if (firmen.has(firma)) continue;
    firmen.add(firma);
    const id = 'K' + (101 + i);
    KUNDEN_ERZEUGT.push({ id, firma, strasse: `${wahl(STRASSE)} ${1 + Math.floor(zufall() * 120)}`, plz: PLZ[s.id], stadt: s.name,
      ansprechpartner: `${zufall() < 0.5 ? 'Frau' : 'Herr'} ${wahl(NAME)}`, telefon: `${VORWAHL[s.id]} 555 ${String(1000 + i).slice(-4)}`,
      lat: s.lat + (zufall() - 0.5) * 0.05, lng: s.lng + (zufall() - 0.5) * 0.08 });
    const anzahl = zufall() < 0.35 ? 0 : 1 + Math.floor(zufall() * 3);
    for (let k = 0; k < anzahl; k++) {
      const von = -5 - Math.floor(zufall() * 400);
      let bis = 2 + Math.floor(zufall() * 500);
      if ((new Date(Date.UTC(2026, 9, 6 + bis))).getUTCDay() === 0) bis++; // nicht am Sonntag enden
      VERTRAEGE_ERZEUGT.push({ id: 'M' + (100 + VERTRAEGE_ERZEUGT.length + 1), kunde: id, geraet: wahl(GERAETE.filter((g) => g.gewicht < 13)).id, von, bis, abholen: zufall() < 0.8 });
    }
  }
})();
KUNDEN.push(...KUNDEN_ERZEUGT);

// Mietverträge (Tage relativ zu HEUTE): abholen = am Mietende holt Reiter das Gerät ab, sonst bringt der Kunde es zurück
const LADETAG_NR = 1;
const SEED_VERTRAEGE = [
  { id: 'M01', kunde: 'K01', geraet: 'G13', von: 1, bis: 22, abholen: true },
  { id: 'M02', kunde: 'K01', geraet: 'G13', von: 1, bis: 22, abholen: true },
  { id: 'M03', kunde: 'K01', geraet: 'G14', von: 1, bis: 15, abholen: true },
  { id: 'M04', kunde: 'K02', geraet: 'G16', von: 1, bis: 45, abholen: true },
  { id: 'M05', kunde: 'K02', geraet: 'G17', von: 1, bis: 45, abholen: false },
  { id: 'M06', kunde: 'K03', geraet: 'G18', von: 1, bis: 120, abholen: true },
  { id: 'M07', kunde: 'K04', geraet: 'G15', von: 1, bis: 10, abholen: true },
  { id: 'M08', kunde: 'K04', geraet: 'G03', von: 1, bis: 10, abholen: true },
  { id: 'M09', kunde: 'K05', geraet: 'G05', von: 1, bis: 400, abholen: true },
  { id: 'M10', kunde: 'K06', geraet: 'G05', von: 1, bis: 60, abholen: true },
  { id: 'M11', kunde: 'K06', geraet: 'G01', von: 1, bis: 60, abholen: true },
  { id: 'M12', kunde: 'K08', geraet: 'G02', von: -40, bis: 1, abholen: true },
  { id: 'M13', kunde: 'K06', geraet: 'G04', von: -90, bis: 1, abholen: true },
  { id: 'M14', kunde: 'K03', geraet: 'G14', von: -21, bis: 1, abholen: true },
  { id: 'M20', kunde: 'K05', geraet: 'G06', von: -585, bis: 451, abholen: true },
  { id: 'M21', kunde: 'K10', geraet: 'G10', von: -264, bis: 465, abholen: true },
  { id: 'M22', kunde: 'K07', geraet: 'G01', von: -35, bis: 24, abholen: false },
  { id: 'M23', kunde: 'K11', geraet: 'G03', von: -57, bis: 8, abholen: true },
  { id: 'M24', kunde: 'K09', geraet: 'G07', von: -158, bis: 206, abholen: true },
];
// Transportaufträge: Auslieferung zum Mietbeginn (bis = spätestens beim Kunden),
// Abholung zum Mietende (ab–bis = Abholfenster). tagNr relativ zu HEUTE, ohne Angabe der Beispieltag.
const SEED_LADETAG = [
  { id: 'B01', art: 'Auslieferung', vertrag: 'M01', geraet: 'G13', ort: 'K01', bis: 9 * 60 },
  { id: 'B02', art: 'Auslieferung', vertrag: 'M02', geraet: 'G13', ort: 'K01', bis: 9 * 60 },
  { id: 'B03', art: 'Auslieferung', vertrag: 'M03', geraet: 'G14', ort: 'K01', bis: 9 * 60 },
  { id: 'B04', art: 'Auslieferung', vertrag: 'M04', geraet: 'G16', ort: 'K02', bis: 10 * 60 },
  { id: 'B05', art: 'Auslieferung', vertrag: 'M05', geraet: 'G17', ort: 'K02', bis: 10 * 60 },
  { id: 'B06', art: 'Auslieferung', vertrag: 'M06', geraet: 'G18', ort: 'K03', bis: 9 * 60 + 30 },
  { id: 'B07', art: 'Auslieferung', vertrag: 'M07', geraet: 'G15', ort: 'K04', bis: 11 * 60 },
  { id: 'B08', art: 'Auslieferung', vertrag: 'M08', geraet: 'G03', ort: 'K04', bis: 11 * 60 },
  { id: 'B09', art: 'Auslieferung', vertrag: 'M09', geraet: 'G05', ort: 'K05', bis: 12 * 60 },
  { id: 'B10', art: 'Auslieferung', vertrag: 'M10', geraet: 'G05', ort: 'K06', bis: 12 * 60 },
  { id: 'B11', art: 'Auslieferung', vertrag: 'M11', geraet: 'G01', ort: 'K06', bis: 12 * 60 },
  { id: 'B12', art: 'Abholung', vertrag: 'M12', geraet: 'G02', ort: 'K08', ab: 10 * 60, bis: 16 * 60 },
  { id: 'B13', art: 'Abholung', vertrag: 'M13', geraet: 'G04', ort: 'K06', ab: 11 * 60, bis: 16 * 60 },
  { id: 'B14', art: 'Abholung', vertrag: 'M14', geraet: 'G14', ort: 'K03', ab: 9 * 60, bis: 15 * 60 },
  { id: 'B20', art: 'Abholung', vertrag: 'M23', geraet: 'G03', ort: 'K11', ab: 8 * 60, bis: 16 * 60, tagNr: 8 },
];
const LADETAG_BELEGT = ['L06', 'L09']; // nur diese Lkw behalten am Beispieltag ihre erzeugten Touren, sonst ist der Fuhrpark fast voll
const LADETAG_TOUREN = [                // und diese Tour steht für den Beispieltag schon fest
  { id: 'T901', lkw: 'L10', fahrer: 'F02', geraet: 'G06', ort: 'k', art: 'Auslieferung', start: 7 * 60 },
];

// Kostenannahmen für die Schätzung im Ergebnis (Beispielwerte, mit Reiter abstimmen)
const KOSTEN_START = { fahrerStunde: 38, spedKm: 2.4, spedGrund: 140, schwerFaktor: 2.5 };
