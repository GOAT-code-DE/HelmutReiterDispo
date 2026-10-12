"""Prüfskript der Klick-Demo. Aufruf: python pruefung.py index.html <ausgabeordner>
Nutzt den installierten Edge (Playwright ohne eigenen Chromium). Karte und Routen brauchen Internet."""
import sys, pathlib
from playwright.sync_api import sync_playwright

seite = pathlib.Path(sys.argv[1]).resolve().as_uri()
aus = pathlib.Path(sys.argv[2])
aus.mkdir(exist_ok=True)
SPEICHER, RUNDGANG = 'reiter-dispo-demo-v4', 'reiter-dispo-rundgang'
fehler, ergebnisse = [], []

def pruefe(name, bed):
    ergebnisse.append((name, bool(bed)))

def ansicht(pg, name, warten=400):
    pg.click(f'.icons [data-ansicht="{name}"]')
    pg.wait_for_timeout(warten)

def ohne_rundgang(pg):  # Rundgang als gesehen markieren, damit er die Prüfungen nicht überdeckt
    pg.evaluate(f"localStorage.setItem('{RUNDGANG}', 'ja')")

def frisch(pg, rundgang=False):
    pg.evaluate("localStorage.clear()")
    if not rundgang: ohne_rundgang(pg)
    pg.reload(); pg.wait_for_timeout(1500)

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1600, 'height': 960})
    pg.on('console', lambda m: m.type == 'error' and fehler.append(m.text))
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.goto(seite); pg.wait_for_timeout(1000)
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_function('karteBereit', timeout=20000); pg.wait_for_timeout(800)

    # Start: Planen für den Beispieltag, schlanke Navigation, „Made by GOAT code“, Rundgang beim ersten Öffnen
    pruefe('Start: Ansicht Planen für den Beispieltag 07.10.', pg.get_attribute('.icons [data-ansicht="planen"]', 'aria-selected') == 'true'
           and pg.input_value('#datum-eingabe') == '2026-10-07')
    nav = pg.locator('.icons button[data-ansicht]').evaluate_all('l => l.map(b => b.dataset.ansicht)')
    pruefe(f'Navigation: genau Planen, Kunden, Ladeplan, Woche, Fahrzeuge ({nav})', nav == ['planen', 'kunden', 'ladeplan', 'plantafel', 'fuhrpark'])
    made = pg.evaluate("""(() => { const m = document.querySelector('#made-by'), r = m.getBoundingClientRect(), l = document.querySelector('.kopf .logo').getBoundingClientRect();
      return { text: m.innerText.trim(), rechts: r.left >= l.right, zeile: Math.abs((r.top + r.bottom) / 2 - (l.top + l.bottom) / 2) < 12 }; })()""")
    pruefe(f'Kopfleiste: „Made by GOAT code“ rechts neben dem Logo ({made})', made['text'] == 'Made by GOAT code' and made['rechts'] and made['zeile'])
    pruefe('Rundgang: startet beim ersten Öffnen', pg.locator('.rundgang .rg-karte').count() == 1 and '1 von 8' in pg.inner_text('.rg-karte'))
    pg.keyboard.press('Tab'); pg.keyboard.press('Tab'); pg.keyboard.press('Tab'); pg.keyboard.press('Tab')
    pruefe('Rundgang: Hintergrund gesperrt, Tab bleibt in der Rundgang-Karte', pg.evaluate("document.querySelector('.app').inert && !document.querySelector('.app').contains(document.activeElement)"))
    pg.screenshot(path=str(aus / 'rundgang_1.png'))
    LAGE_RG = """(() => { const l = document.querySelector('.rg-loch').getBoundingClientRect(), k = document.querySelector('.rg-karte').getBoundingClientRect();
      return { loch: l.width > 20 && l.height > 20 && l.top >= 0 && l.bottom <= innerHeight + 1,
               karte: k.top >= 0 && k.bottom <= innerHeight + 1 && k.left >= 0 && k.right <= innerWidth + 1 }; })()"""
    schritte = []
    for i in range(8):
        lage = pg.evaluate(LAGE_RG)
        schritte.append(lage['loch'] and lage['karte'])
        pg.click('#rg-weiter'); pg.wait_for_timeout(400)
    pruefe(f'Rundgang: 8 Schritte, Ziel und Karte jeweils ganz im Bild {schritte}', all(schritte))
    pruefe('Rundgang: nach „Fertig“ geschlossen, Plan berechnet', pg.locator('.rundgang').count() == 0 and pg.locator('.tourkarte').count() == 7)
    pg.reload(); pg.wait_for_timeout(1500)
    pruefe('Rundgang: beim zweiten Öffnen nicht mehr von selbst', pg.locator('.rundgang').count() == 0)
    pg.click('#rundgang-knopf'); pg.wait_for_timeout(500)
    pruefe('Rundgang: Knopf startet ihn wieder bei Schritt 1', pg.locator('.rundgang').count() == 1 and '1 von 8' in pg.inner_text('.rg-karte'))
    pg.click('#rg-weiter'); pg.wait_for_timeout(300); pg.click('#rg-zurueck'); pg.wait_for_timeout(300)
    pruefe('Rundgang: Zurück geht einen Schritt zurück', '1 von 8' in pg.inner_text('.rg-karte'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pruefe('Rundgang: Escape schließt und gibt den Hintergrund frei', pg.locator('.rundgang').count() == 0 and not pg.evaluate("document.querySelector('.app').inert"))
    frisch(pg, rundgang=True)
    pg.click('#rg-ueberspringen'); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(1500)
    pruefe('Rundgang: Überspringen gilt als gesehen', pg.locator('.rundgang').count() == 0)

    # Planen: Ausliefern und Abholen, Berechnung, Begründungen, Karte
    frisch(pg)
    kopf = pg.inner_text('#plan-auftraege h2')
    pruefe(f'Planen: 14 Transporte, 11 ausliefern, 3 abholen, 7 Kunden ({kopf})', pg.locator('#plan-auftraege [data-auftrag]').count() == 14
           and '11 ausliefern, 3 abholen' in kopf and '7 Kunden' in kopf and pg.locator('#plan-auftraege [data-art="Abholung"]').count() == 3)
    pruefe('Planen: Abholungen mit Abholfenster, Kunden mit Firmennamen', 'abholen 11:00–16:00 Uhr' in pg.inner_text('#plan-auftraege')
           and 'Vestische Industriemontage GmbH (Recklinghausen)' in pg.inner_text('#plan-auftraege'))
    gr = pg.evaluate("[...document.querySelectorAll('#plan-auftraege .kunde-gruppe')].map(s => [s.dataset.ort, s.querySelectorAll('[data-auftrag]').length])")
    pruefe(f'Planen: Transporte nach Kunde gruppiert, 7 Gruppen, Duisburg mit 3 Geräten zuerst ({gr})', len(gr) == 7 and sum(n for _, n in gr) == 14
           and gr[0][1] == 3 and 'Duisburg' in pg.inner_text('#plan-auftraege .kunde-gruppe h3'))
    # Reihenfolge der Gruppen gegen die Daten: früheste Frist je Kunde (Abholung: Fensterbeginn) aufsteigend
    folge = pg.evaluate("""(() => { const f = (a) => (istAbholung(a) ? a.ab : a.bis), m = {};
      for (const a of offeneAuftraege()) m[a.ort] = Math.min(m[a.ort] ?? 1e9, f(a));
      return [...document.querySelectorAll('#plan-auftraege .kunde-gruppe')].map(s => m[s.dataset.ort]); })()""")
    pruefe(f'Planen: Kundengruppen nach frühester Frist sortiert ({folge})', len(folge) == 7 and folge == sorted(folge))
    reihen = pg.evaluate("""[...document.querySelectorAll('#plan-auftraege .kunde-gruppe')].map(s => [s.querySelector('h3 small').textContent,
      [...s.querySelectorAll('li')].map(l => l.querySelector('small').textContent)])""")
    wuppertal = [r for r in reihen if r[0].startswith('abholen ab')]
    pruefe(f'Planen: reine Abholgruppe mit „abholen ab“ im Kopf und Fenster je Zeile, Auslieferung ohne doppelte Frist ({wuppertal}, {reihen[0]})',
           len(wuppertal) == 1 and all('–' in z for z in wuppertal[0][1]) and reihen[0][1] == ['ausliefern'] * 3)
    pruefe('Planen: vor dem Berechnen kein Ergebnis', pg.locator('.tourkarte').count() == 0)
    pg.click('#beladung-berechnen'); pg.wait_for_timeout(800)
    pruef = pg.inner_text('#plan-pruef')
    pruefe(f'Planen: Prüfzeile mit Ladevarianten und Ergebnis ({pruef[:80]})', 'Ladevarianten geprüft' in pruef and '14 Transporte auf 7 Lkw, 2 an Spedition' in pruef
           and 'Statt 14 Einzelfahrten' in pruef and 'Abholfenster' in pruef)
    pruefe('Planen: 7 Fahrten, vier mit 2 Stopps, E-HR 103 bringt beide Scheren zum selben Kunden', pg.locator('.tourkarte').count() == 7
           and pg.locator('.tourkarte[data-stopps="2"]').count() == 4 and pg.locator('.tourkarte[data-lkw="L03"] .stopps > li').first.inner_text().count('78 SEC') == 2)
    gemischt = pg.locator('.tourkarte[data-lkw="L10"] .stopps > li').evaluate_all('l => l.map(x => x.dataset.art).join()')
    pruefe(f'Planen: E-HR 110 liefert erst aus und holt auf dem Rückweg ab ({gemischt})', gemischt == 'Auslieferung,Abholung')
    texte = pg.inner_text('#plan-ergebnis')
    pruefe('Planen: Begründungen im Klartext (zu schwer, Rückweg, Ladereihenfolge)', 'zusammen zu schwer' in texte and 'Auf dem Rückweg wird bei Recklinghausen aufgeladen' in texte
           and 'Ladereihenfolge' in texte)
    pruefe('Planen: Wartezeit aufs Abholfenster wird erklärt, E-HR 110 startet nach seiner Köln-Fahrt ohne Warten',
           'Wartet bei Oberhausen bis 09:00 Uhr auf das Abholfenster' in pg.inner_text('.tourkarte[data-lkw="L03"]')
           and 'Wartet' not in pg.inner_text('.tourkarte[data-lkw="L10"]') and '11:00' in pg.inner_text('.tourkarte[data-lkw="L10"] .tk-kopf'))
    pruefe('Planen: Grund für eine Abholung, die nicht mitfährt', '80 VJR (abholen) nicht mit dazu: auf dem Rückweg 80 VJR kommt die Rampe nicht hoch' in texte)
    pruefe('Planen: „wäre frei, aber“ erklärt ungenutzte freie Lkw mit Datenblattwert', 'E-HR 102 wäre frei, aber: 78 SEC kommt die Rampe nicht hoch: 29 % Steigung, Gerät schafft 25 %' in texte)
    pruefe('Planen: Spedition mit Grund', 'An Spedition: Manitou 80 VJR Vertikalmastbühne 8 m ausliefern' in texte and 'kein passender Lkw frei' in texte)
    pruefe('Planen: Fahrt von E-HR 103 vorgewählt, Karte zeigt Hof und 2 Stopps', pg.locator('.tourkarte.gewaehlt[data-lkw="L03"]').count() == 1
           and pg.locator('.karten-stopp').count() == 2 and pg.locator('.karten-hof').count() == 1)
    pg.screenshot(path=str(aus / 'planen.png'))
    pg.locator('.tourkarte[data-lkw="L10"] .tk-kopf').click(); pg.wait_for_timeout(500)
    pruefe('Planen: Karte fasst Ausliefern und Abholen in Recklinghausen zu einem Marker „1 · 2“ zusammen',
           pg.locator('.karten-stopp').count() == 1 and pg.locator('.karten-stopp b', has_text='1 · 2').count() == 1)
    pg.locator('.tourkarte[data-lkw="L05"] .tk-kopf').click(); pg.wait_for_timeout(500)
    pruefe('Planen: andere Fahrt gewählt, Karte zeigt deren 2 Stopps', pg.locator('.karten-stopp').count() == 2 and 'E-HR 105' in pg.inner_text('#karte-titel'))

    # Route rechts: Fahrt über die Auswahl wählen, Etappen vom Hof bis zurück, eine Etappe hervorheben
    pruefe('Route: je Fahrt ein Auswahlknopf, die gewählte ist gedrückt', pg.locator('#fahrt-wahl [data-fahrt]').count() == 7
           and pg.get_attribute('#fahrt-wahl [data-fahrt="L05"]', 'aria-pressed') == 'true')
    pg.click('#fahrt-wahl [data-fahrt="L03"]'); pg.wait_for_timeout(500)
    et = pg.locator('#etappen .etappe').all_inner_texts()
    pruefe(f'Route: E-HR 103 in 3 Etappen Hof → Duisburg → Oberhausen → Hof, mit Abladen, Warten und Aufladen ({[x.splitlines()[1] for x in et]})',
           len(et) == 3 and 'Hof → Duisburg' in et[0] and 'abladen: 2× 78 SEC' in et[0] and 'Duisburg → Oberhausen' in et[1]
           and 'wartet bis 09:00 Uhr' in et[1] and 'aufladen: 80 VJR' in et[1] and 'Oberhausen → Hof' in et[2] and 'am Hof abladen: 80 VJR' in et[2]
           and pg.locator('.tourkarte.gewaehlt[data-lkw="L03"]').count() == 1)
    pg.click('#etappen [data-etappe="1"]'); pg.wait_for_timeout(500)
    linien = pg.evaluate("karte.getSource('route').serialize().data.features.map(f => f.properties.aktiv)")
    pruefe(f'Route: Klick auf Etappe 2 hebt nur diese Strecke hervor ({linien})', linien == [False, True, False]
           and pg.get_attribute('#etappen [data-etappe="1"]', 'aria-pressed') == 'true' and pg.locator('#ganze-fahrt').count() == 1)
    pg.click('#ganze-fahrt'); pg.wait_for_timeout(500)
    pruefe('Route: „Ganze Fahrt zeigen“ hebt alle Etappen wieder hervor', pg.evaluate("karte.getSource('route').serialize().data.features.every(f => f.properties.aktiv)")
           and pg.locator('#etappen [aria-pressed="true"]').count() == 0)
    pg.click('#fahrt-wahl [data-fahrt="L10"]'); pg.wait_for_timeout(500)
    et = pg.locator('#etappen .etappe').all_inner_texts()
    pruefe(f'Route: Ausliefern und Abholen beim selben Kunden ist eine Etappe „1 · 2“ ({len(et)} Etappen)', len(et) == 2 and et[0].startswith('1 · 2')
           and 'abladen: MT 1440 · aufladen: GDP3.5N' in et[0])
    pg.click('#etappen [data-etappe="1"]'); pg.wait_for_timeout(500)
    linien = pg.evaluate("karte.getSource('route').serialize().data.features.map(f => f.properties.aktiv)")
    pruefe(f'Route: Rückfahrt nach dem zusammengefassten Stopp hebt den richtigen Kartenabschnitt hervor ({linien})', linien == [False, False, True])

    # Planen: flacher Ladeplan je Fahrt in der Tourkarte (jedes Gerät ein Block mit Stoppnummer), rechts Umschalter Karte / Ladung in 3D
    bilder = pg.evaluate("""[...document.querySelectorAll('.tourkarte')].map(k => [k.dataset.lkw, k.querySelectorAll('.tk-bild svg').length,
      k.querySelectorAll('.tk-bild svg [data-geraet]').length, k.querySelectorAll('[data-verschieben]').length])""")
    pruefe(f'Flacher Ladeplan: jede Fahrt mit Plan, jedes Gerät als Block, gemischte Fahrten (103, 110) mit Hinweg und Rückweg ({bilder})',
           len(bilder) == 7 and all(n >= 1 and bl == g for _, n, bl, g in bilder) and {x[0]: x[1] for x in bilder}['L03'] == 2 and {x[0]: x[1] for x in bilder}['L10'] == 2
           and pg.locator('.tourkarte[data-lkw="L03"] .tk-bild small').all_inner_texts() == ['Abfahrt am Hof', 'Rückweg'])
    nummern = pg.locator('.tourkarte[data-lkw="L03"] .tk-bild svg [data-geraet] text:first-of-type').all_text_contents()  # SVG-Text hat kein innerText
    pruefe(f'Flacher Ladeplan: Blöcke tragen die Stoppnummer ({nummern})', nummern == ['1', '1', '2'])
    # Blöcke: echte Rechtecke in Stoppfarbe, ganz im Bildausschnitt, nicht übereinander
    lage = pg.evaluate("""[...document.querySelectorAll('.tourkarte .tk-bild svg')].map(svg => {
      const vb = svg.viewBox.baseVal, r = [...svg.querySelectorAll('[data-geraet] rect')].map(e => e.getBBox()).sort((a, b) => a.x - b.x);
      return { n: r.length, farbe: [...svg.querySelectorAll('[data-geraet] rect')].every(e => /^#[0-9a-f]{6}$/i.test(e.getAttribute('fill'))),
        drin: r.every(b => b.width > 4 && b.height > 4 && b.x >= vb.x && b.y >= vb.y && b.x + b.width <= vb.x + vb.width && b.y + b.height <= vb.y + vb.height),
        frei: r.every((b, i) => i === 0 || b.x >= r[i - 1].x + r[i - 1].width - 0.5) }; })""")
    pruefe(f'Flacher Ladeplan: Blöcke sichtbar, im Bild, ohne Überdeckung ({lage})', len(lage) == 9 and all(x['n'] > 0 and x['farbe'] and x['drin'] and x['frei'] for x in lage))
    hoch = pg.evaluate("""(() => { const l = finde(LKW, 'L09'), g = GERAETE.reduce((m, x) => (x.h > m.h ? x : m)), svg = seitenansicht(l, [{ g, x: 0.5, zone: l.zonen[l.zonen.length - 1], stopp: 0 }]);
      document.body.append(svg); const vb = svg.viewBox.baseVal, b = svg.querySelector('[data-geraet] rect').getBBox(); svg.remove();
      return [g.kurz, b.y >= vb.y]; })()""")
    pruefe(f'Flacher Ladeplan: höchstes Gerät über 4 m wird nicht abgeschnitten ({hoch})', hoch[1])
    pruefe('3D Planen: Umschalter sichtbar, Karte gewählt, keine 3D-Fläche', pg.locator('#rechts-wahl').is_visible()
           and pg.get_attribute('#rechts-wahl [data-rechts="karte"]', 'aria-selected') == 'true' and not pg.locator('#plan-3d').is_visible())
    pg.click('#rechts-wahl [data-rechts="ladung"]'); pg.wait_for_timeout(600)
    pruefe('3D Planen: „Ladung in 3D“ zeigt drehbare Szene statt Karte, Hin/Rückweg-Wahl bei gemischter Fahrt',
           pg.locator('#plan-3d canvas').is_visible() and not pg.locator('#plan-karte').is_visible()
           and pg.inner_text('#karte-titel') == 'Ladung · E-HR 110' and pg.locator('#rechts-richtung').is_visible())
    pg.click('#fahrt-wahl [data-fahrt="L04"]'); pg.wait_for_timeout(500)
    pruefe('3D Planen: Fahrt nur mit Auslieferung ohne Hin/Rückweg-Wahl', pg.locator('#plan-3d canvas').is_visible() and not pg.locator('#rechts-richtung').is_visible())
    rbild = pg.locator('.tourkarte[data-lkw="L03"] .tk-bild[data-richtung="rueck"]')
    if rbild.count(): rbild.click(); pg.wait_for_timeout(500)  # ohne Bild wird die Prüfung rot statt abzubrechen
    pruefe('3D Planen: Klick aufs Rückweg-Bild wählt die Fahrt und zeigt rechts den Rückweg in 3D',
           pg.inner_text('#karte-titel') == 'Ladung · E-HR 103' and pg.get_attribute('#rechts-richtung [data-richtung="rueck"]', 'aria-selected') == 'true')
    pg.click('#etappen [data-etappe="0"]'); pg.wait_for_timeout(500)
    pruefe('3D Planen: Klick auf eine Etappe schaltet zurück auf die Karte', pg.locator('#plan-karte').is_visible() and not pg.locator('#plan-3d').is_visible()
           and pg.inner_text('#karte-titel') == 'Route · E-HR 103')
    pg.click('#fahrt-wahl [data-fahrt="L05"]'); pg.wait_for_timeout(300)

    # Von Hand umlegen: abgelehnt mit Grund, gelungen, schlechter als Vorschlag, wiederherstellen
    pg.select_option('[data-verschieben="B03"]', 'L03'); pg.wait_for_timeout(500)
    m = pg.inner_text('#plan-meldung')
    pruefe(f'Umlegen: Mastbühne auf E-HR 103 abgelehnt mit Grund ({m})', 'passt nicht auf E-HR 103' in m and 'zu schwer' in m and pg.locator('#vorschlag-zurueck').count() == 0)
    pg.select_option('[data-verschieben="B01"]', 'L01'); pg.wait_for_timeout(500)
    m = pg.inner_text('#plan-meldung')
    pruefe(f'Umlegen: 78 SEC auf den Transporter abgelehnt ({m})', 'passt nicht auf E-HR 101' in m and 'zu schwer' in m and pg.locator('#vorschlag-zurueck').count() == 0)
    pg.select_option('[data-verschieben="B07"]', 'L07'); pg.wait_for_timeout(500)
    pruefe('Umlegen: 140 SC auf E-HR 107 gelingt, ein Lkw mehr wird als schlechter gemeldet',
           'liegt jetzt auf E-HR 107' in pg.inner_text('#plan-meldung') and 'schlechter als der Vorschlag' in pg.inner_text('#plan-meldung')
           and pg.locator('.tourkarte[data-lkw="L07"]').count() == 1 and pg.locator('.tourkarte').count() == 8 and pg.locator('#vorschlag-zurueck').count() == 1)
    pg.click('#vorschlag-zurueck'); pg.wait_for_timeout(500)
    pruefe('Umlegen: Vorschlag wiederhergestellt, Fahrt von E-HR 103 wieder gewählt', pg.locator('.tourkarte').count() == 7 and pg.locator('#vorschlag-zurueck').count() == 0
           and pg.locator('.tourkarte[data-lkw="L07"]').count() == 0 and pg.locator('.tourkarte.gewaehlt[data-lkw="L03"]').count() == 1)
    pg.select_option('[data-verschieben="B05"]', 'L06'); pg.wait_for_timeout(500)
    pruefe('Umlegen: GLP2.5N auf belegten E-HR 106 abgelehnt', 'passt nicht auf E-HR 106' in pg.inner_text('#plan-meldung') and pg.locator('#vorschlag-zurueck').count() == 0)
    pg.select_option('[data-verschieben="B10"]', 'L05'); pg.wait_for_timeout(500)
    pruefe('Umlegen: MT 1440 auf E-HR 105 abgelehnt, laut Datenblatt zu schwer', 'zu schwer: 10,9 t > 9,0 t Nutzlast' in pg.inner_text('#plan-meldung'))

    # Ladeplan aus dem Plan: Hinweg und Rückweg, Stoppnummern, Zurrpunkte, Achslast, zurück zum Plan
    pg.locator('.tourkarte[data-lkw="L08"] [data-ladeplan]').click(); pg.wait_for_timeout(1500)
    werte = pg.inner_text('#lp-werte')
    pruefe(f'Ladeplan: Hinweg passt, Achslast vorn und hinten als Balken', 'Passt' in werte and 'Sattelkupplung' in werte and 'Achsaggregat' in werte
           and pg.locator('#lp-werte [data-wert="achse-vorn"] .balken').count() == 1 and pg.locator('#lp-werte [data-wert="achse-hinten"] .balken').count() == 1)
    pruefe('Ladeplan: Hinweg mit zwei Stopps, ohne Abholung kein Umschalter Hin/Rück', pg.locator('#lp-liste .lp-stopp').count() == 2 and pg.locator('#lp-richtung').is_hidden())
    oesen = pg.evaluate("(() => { let n = 0; lp.drei.gruppe.traverse(o => { if (o.userData.zurr) n++; }); return n === finde(LKW, lp.lkw).zurr.length * 2; })()")
    pruefe('Ladeplan: jede Zurrpunkt-Position links und rechts als Öse in 3D', oesen)
    reihe = pg.evaluate("(() => { const b = beladung(finde(LKW, lp.lkw), lp.stopps.map(s => s.map(id => finde(GERAETE, id)))); const p = [...b.plaetze].sort((x, y) => x.x - y.x); return p.map(x => x.stopp).join(); })()")
    pruefe(f'Ladeplan: hinten steht der erste Kunde ({reihe})', reihe == '1,0')
    pg.screenshot(path=str(aus / 'ladeplan.png'))
    pg.click('#lp-zurueck'); pg.wait_for_timeout(500)
    pruefe('Ladeplan: „Zurück zum Plan“ behält das Ergebnis', pg.get_attribute('.icons [data-ansicht="planen"]', 'aria-selected') == 'true' and pg.locator('.tourkarte').count() == 7)
    pg.locator('.tourkarte[data-lkw="L10"] [data-ladeplan]').click(); pg.wait_for_timeout(1500)
    pruefe('Ladeplan: gemischte Fahrt mit Umschalter Hin/Rück', pg.locator('#lp-richtung').is_visible() and 'MT 1440' in pg.inner_text('#lp-liste'))
    pg.click('#lp-richtung [data-richtung="rueck"]'); pg.wait_for_timeout(800)
    pruefe('Ladeplan: Rückweg zeigt die Abholung und passt', 'GDP3.5N' in pg.inner_text('#lp-liste') and 'Passt auf dem Rückweg' in pg.inner_text('#lp-werte'))
    pg.click('#lp-zurueck'); pg.wait_for_timeout(500)

    # Übernehmen: Sammeltouren in der Woche, Aufträge erledigt, bleibt nach Neuladen
    pg.click('#plan-uebernehmen'); pg.wait_for_timeout(600)
    pruefe('Übernehmen: Meldung und keine offenen Transporte mehr', '7 Touren für Mi 07.10. eingeplant, 2 an Spedition' in pg.inner_text('#plan-ergebnis')
           and pg.locator('#plan-auftraege [data-auftrag]').count() == 0)
    pg.reload(); pg.wait_for_timeout(1500)
    pruefe('Übernehmen: 7 Sammeltouren gespeichert, nach Neuladen noch da', pg.evaluate("stand.alleTouren.filter(t => t.art === 'Sammeltour').length") == 7
           and pg.evaluate("stand.alleAuftraege.filter(a => a.tag === '2026-10-07').length") == 0)
    ansicht(pg, 'plantafel', 600)
    pruefe('Woche (Tag): 7 Sammeltouren als Blöcke', pg.locator('.block[data-art="Sammeltour"]').count() == 7)
    pg.locator('.block[data-art="Sammeltour"]', has_text='Recklinghausen → Recklinghausen').click(); pg.wait_for_timeout(500)
    dlg = pg.inner_text('#dlg-tour')
    pruefe('Tourdialog: gemischte Fahrt mit Aufladen beim Kunden und Abladen am Hof', 'Aufladen beim Kunden (Recklinghausen)' in dlg
           and 'Abladen am Hof' in dlg and 'passt: Rampe, Zonen' in dlg)
    pg.screenshot(path=str(aus / 'tourdialog.png'))
    pg.locator('#dlg-tour button', has_text='Tour stornieren').click(); pg.wait_for_timeout(500)
    pruefe('Stornieren: die zwei Transporte sind wieder offen', pg.evaluate("stand.alleAuftraege.filter(a => a.tag === '2026-10-07').length") == 2
           and pg.locator('.block[data-art="Sammeltour"]').count() == 6)
    ansicht(pg, 'planen', 500)
    pruefe('Stornieren: Planen zeigt sie wieder, die Abholung inklusive', pg.locator('#plan-auftraege [data-auftrag]').count() == 2
           and pg.locator('#plan-auftraege [data-art="Abholung"]').count() == 1)

    # Kunden: links Liste mit Suche und Filter, rechts der gewählte Kunde, Bearbeiten, Abholung umschalten
    frisch(pg)
    ansicht(pg, 'kunden', 600)
    pruefe('Kunden: Liste mit allen 132 Kunden, der erste ist rechts gezeigt', pg.locator('.kunde-eintrag').count() == 132 and '132 von 132 Kunden' in pg.inner_text('#kunden-zahl')
           and pg.locator('.kunde-eintrag.aktiv').count() == 1 and pg.inner_text('#kunde-detail h2') == pg.inner_text('.kunde-eintrag.aktiv b'))
    pruefe('Kunden: zuerst die nächsten Abholungen', 'Abholung Mi 07.10.' in pg.locator('.kunde-eintrag').first.inner_text())
    pg.click('#kunden-filter [data-filter="abholung"]'); pg.wait_for_timeout(300)
    hinweise = pg.locator('.kunde-eintrag').all_inner_texts()
    pruefe(f'Kunden: Filter „Abholung bald“ ({len(hinweise)} Kunden)', len(hinweise) >= 3 and all('Abholung' in x for x in hinweise))
    ansicht(pg, 'plantafel')
    pruefe('Woche: nach einem Kundenfilter weiter Tag gewählt und sichtbar', pg.is_visible('#plan-tag')
           and pg.get_attribute('#v-plantafel [data-plan="tag"]', 'aria-selected') == 'true')
    ansicht(pg, 'kunden')
    pg.click('#kunden-filter [data-filter="alle"]'); pg.wait_for_timeout(200)
    pg.fill('#kunden-suche', 'Blitzkuhlen'); pg.wait_for_timeout(300)
    pruefe('Kunden: Suche nach Straße findet genau einen Kunden', pg.locator('.kunde-eintrag').count() == 1)
    pg.click('.kunde-eintrag[data-kunde="K06"]'); pg.wait_for_timeout(300)
    detail = pg.inner_text('#kunde-detail')
    pruefe('Kunden: rechts Adresse, Ansprechpartner und Mietgeräte', 'Blitzkuhlenstraße 101, 45659 Recklinghausen' in detail and 'Herr Peters' in detail
           and pg.locator('#kunde-detail tr[data-vertrag]').count() == 3)
    pg.fill('#kunden-suche', 'Messebau Westfalen'); pg.wait_for_timeout(300); pg.click('.kunde-eintrag[data-kunde="K05"]'); pg.wait_for_timeout(300)
    pruefe('Kunden: lange Miete mit Restlaufzeit und Jahr', 'noch 1 Jahr, 2 Monate' in pg.inner_text('#kunde-detail') and '28.02.2025 – 31.12.2027' in pg.inner_text('#kunde-detail'))
    pg.fill('#kunden-suche', 'Bergische Hallenbau'); pg.wait_for_timeout(300); pg.click('.kunde-eintrag[data-kunde="K08"]'); pg.wait_for_timeout(300)
    pruefe('Kunden: Mietende am Beispieltag als offene Abholung', 'offen: Mi 07.10.' in pg.inner_text('#kunde-detail'))
    pg.fill('#kunden-suche', 'Hafen Logistik Düsseldorf'); pg.wait_for_timeout(300); pg.click('.kunde-eintrag[data-kunde="K07"]'); pg.wait_for_timeout(300)
    pruefe('Kunden: „nicht abholen“ steht beim Vertrag', 'Kunde bringt es zurück' in pg.inner_text('#kunde-detail'))
    pg.click('[data-abholen="M22"]'); pg.wait_for_timeout(400)
    pruefe('Kunden: „doch abholen“ legt die Abholung zum Mietende an', pg.evaluate("stand.alleAuftraege.some(a => a.vertrag === 'M22' && a.art === 'Abholung' && a.tag === '2026-10-30')")
           and 'offen: Fr 30.10.' in pg.inner_text('#kunde-detail'))
    pg.click('[data-abholen="M22"]'); pg.wait_for_timeout(400)
    pruefe('Kunden: „nicht abholen“ nimmt sie wieder heraus', not pg.evaluate("stand.alleAuftraege.some(a => a.vertrag === 'M22')"))
    # Bearbeiten: Kontakt ändern, neue Adresse über die Suche (Antwort im Test fest vorgegeben)
    pg.route('**/photon.komoot.io/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"features":[{"geometry":{"coordinates":[7.0115,51.4556]},'
        '"properties":{"street":"Teststraße","housenumber":"5","postcode":"45127","city":"Essen"}}]}'))
    pg.click('#kunde-bearbeiten'); pg.wait_for_timeout(300)
    pg.fill('#kb-person', 'Frau Neu'); pg.fill('#kb-suche', 'Teststraße 5 Essen'); pg.wait_for_timeout(900)
    pg.locator('#kb-treffer .treffer').first.click(); pg.wait_for_timeout(300)
    pg.click('#kb-speichern'); pg.wait_for_timeout(400)
    pg.reload(); pg.wait_for_timeout(1500); ansicht(pg, 'kunden', 500)
    pg.fill('#kunden-suche', 'Hafen Logistik Düsseldorf'); pg.wait_for_timeout(300); pg.click('.kunde-eintrag[data-kunde="K07"]'); pg.wait_for_timeout(300)
    detail = pg.inner_text('#kunde-detail')
    pruefe('Bearbeiten: neue Adresse und Ansprechpartner gespeichert, Entfernung neu', 'Teststraße 5, 45127 Essen' in detail and 'Frau Neu' in detail
           and pg.evaluate("finde(ORTE, 'K07').kurz") == 'Essen' and pg.evaluate("finde(ORTE, 'K07').km") < 10)
    pg.click('#kunde-bearbeiten'); pg.fill('#kb-firma', ''); pg.click('#kb-speichern'); pg.wait_for_timeout(300)
    pruefe('Bearbeiten: ohne Firma nicht speicherbar', 'Firma' in pg.inner_text('#kb-fehler'))
    pg.click('#kb-abbrechen'); pg.fill('#kunden-suche', ''); pg.wait_for_timeout(200)

    # Neuer Transport: neuer Kunde mit Adresssuche (Antwort im Test fest vorgegeben), ausliefern, gleich einplanen
    pg.click('#kunden-neu'); pg.wait_for_timeout(400)
    pg.click('#nt-speichern'); pg.wait_for_timeout(300)
    pruefe('Neuer Transport: ohne Firma und Adresse nicht speicherbar', 'Firma' in pg.inner_text('#nt-fehler'))
    pg.fill('#nt-firma', 'Test Montage GmbH'); pg.fill('#nt-person', 'Frau Test'); pg.fill('#nt-telefon', '0201 555 0000')
    pg.fill('#nt-suche', 'Teststraße 5 Essen'); pg.wait_for_timeout(900)
    pg.locator('#nt-treffer .treffer').first.click(); pg.wait_for_timeout(300)
    pruefe('Neuer Transport: Adresse aus der Suche übernommen', 'Teststraße 5, 45127 Essen' in pg.inner_text('#nt-adresse'))
    pg.select_option('#nt-geraet', 'G12')
    pg.fill('#nt-von', '2026-10-08'); pg.dispatch_event('#nt-von', 'change')
    pg.fill('#nt-bis', '2026-10-21'); pg.dispatch_event('#nt-bis', 'change')
    pg.click('#nt-speichern'); pg.wait_for_timeout(800)
    pruefe('Neuer Transport: Kunde, Vertrag, Auslieferung und Abholung angelegt', pg.evaluate("stand.kunden.filter(k => k.firma === 'Test Montage GmbH' && k.plz === '45127').length") == 1
           and pg.evaluate("stand.vertraege.some(v => v.geraet === 'G12' && v.von === '2026-10-08' && v.bis === '2026-10-21' && v.abholen)")
           and pg.evaluate("stand.alleAuftraege.filter(a => a.geraet === 'G12').map(a => a.art + a.tag).sort().join()") == 'Abholung2026-10-21,Auslieferung2026-10-08')
    pruefe('Neuer Transport: Vorschläge zum gleich Einplanen', pg.locator('#nt-vorschlaege [data-vorschlag]').count() >= 1)
    pg.screenshot(path=str(aus / 'neuer_transport.png'))
    pg.locator('#nt-vorschlaege [data-vorschlag] button').first.click(); pg.wait_for_timeout(600)
    pruefe('Neuer Transport: gleich eingeplant, steht in der Woche', 'Eingeplant am Do 08.10.' in pg.inner_text('#nt-vorschlaege')
           and pg.evaluate("stand.alleTouren.some(t => t.tag === '2026-10-08' && (t.auftraege || []).some(a => a.geraet === 'G12'))")
           and not pg.evaluate("stand.alleAuftraege.some(a => a.geraet === 'G12' && a.art === 'Auslieferung')"))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(1500)
    ansicht(pg, 'kunden', 500)
    pg.fill('#kunden-suche', 'Test Montage'); pg.wait_for_timeout(300)
    pg.locator('.kunde-eintrag').first.click(); pg.wait_for_timeout(300)
    pruefe('Neuer Transport: neuer Kunde bleibt gespeichert und hat sein Mietgerät', pg.locator('.kunde-eintrag').count() == 1
           and 'Teststraße 5, 45127 Essen' in pg.inner_text('#kunde-detail') and 'Elektro-Hochhubwagen' in pg.inner_text('#kunde-detail'))
    pg.fill('#kunden-suche', ''); pg.wait_for_timeout(200)
    # Abholen: Mietgerät eines Kunden wählen, Abholtag festlegen
    pg.click('#kunde-detail [data-transport]'); pg.wait_for_timeout(300)
    pg.click('[data-nt-art="Abholung"]'); pg.select_option('#nt-kunde', 'K05'); pg.wait_for_timeout(300)
    pg.select_option('#nt-vertrag', 'M09'); pg.wait_for_timeout(200)
    pg.fill('#nt-abholtag', '2026-10-06'); pg.dispatch_event('#nt-abholtag', 'change')
    pg.click('#nt-speichern'); pg.wait_for_timeout(300)
    pruefe('Abholen: Abholtag vor dem Mietbeginn wird abgelehnt', 'frühestens zum Mietbeginn' in pg.inner_text('#nt-fehler'))
    pg.select_option('#nt-vertrag', 'M20'); pg.wait_for_timeout(200)
    pg.fill('#nt-abholtag', '2026-10-09'); pg.dispatch_event('#nt-abholtag', 'change')
    pg.click('#nt-speichern'); pg.wait_for_timeout(600)
    pruefe('Abholen: Abholung angelegt und Mietende angepasst', pg.evaluate("stand.alleAuftraege.some(a => a.vertrag === 'M20' && a.art === 'Abholung' && a.tag === '2026-10-09')")
           and pg.evaluate("finde(stand.vertraege, 'M20').bis") == '2026-10-09')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)

    # Höchstens 20 offene Transporte je Tag
    pg.evaluate("for (let i = 0; i < 6; i++) stand.alleAuftraege.push({ id: 'B9' + i, tag: '2026-10-07', art: 'Auslieferung', geraet: 'G12', ort: 'K02', bis: 900 }); 0")
    pg.click('#kunde-detail [data-transport]'); pg.wait_for_timeout(300)
    pg.fill('#nt-von', '2026-10-07'); pg.dispatch_event('#nt-von', 'change')
    pg.click('#nt-speichern'); pg.wait_for_timeout(300)
    pruefe('Neuer Transport: höchstens 20 offene Transporte je Tag', 'höchstens 20' in pg.inner_text('#nt-fehler'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)

    # Lkw fällt aus: Plan rechnet ohne ihn neu, Werkstatt sichtbar, zurückholen
    frisch(pg)
    pg.click('#beladung-berechnen'); pg.wait_for_timeout(800)
    pg.locator('[data-ausfall="L08"]').click(); pg.wait_for_timeout(1500)
    m = pg.inner_text('#plan-meldung')
    pruefe(f'Lkw-Ausfall: E-HR 108 fällt aus, Plan ohne ihn neu berechnet ({m[:60]})', 'E-HR 108 fällt am Mi 07.10. aus' in m and 'neu verteilt' in m
           and pg.locator('.tourkarte[data-lkw="L08"]').count() == 0 and '14 Transporte auf' in pg.inner_text('#plan-pruef') and pg.locator('[data-zurueckholen="L08"]').count() == 1)
    ansicht(pg, 'plantafel', 500)
    pruefe('Lkw-Ausfall: Woche markiert E-HR 108 als Werkstatt', 'Werkstatt' in pg.locator('.zeile .label', has_text='E-HR 108').inner_text())
    pg.click('.plan-reiter [data-plan="woche"]'); pg.wait_for_timeout(400)
    frei = pg.locator('.woche th.gewaehlt small').inner_text()
    pruefe(f'Lkw-Ausfall: Woche zählt E-HR 108 nicht als frei ({frei})', 'Werkstatt' in pg.locator('.woche tr', has_text='E-HR 108').inner_text()
           and pg.evaluate("LKW.filter(l => !inWerkstatt(l.id) && !toureAm(datum).some(t => t.lkw === l.id)).length") == int(frei.split('·')[1].split()[0]))
    pg.click('.plan-reiter [data-plan="tag"]'); pg.wait_for_timeout(300)
    ansicht(pg, 'fuhrpark', 600)
    pruefe('Lkw-Ausfall: Steckbrief zeigt Werkstatt', 'Werkstatt' in pg.inner_text('.steckbrief[data-lkw="L08"] h3') and 'zurück' in pg.inner_text('[data-werkstatt="L08"]'))
    pg.click('[data-werkstatt="L08"]'); pg.wait_for_timeout(1200)
    ansicht(pg, 'planen', 500)
    pruefe('Lkw-Ausfall: zurückgeholt, Plan wieder mit E-HR 108', pg.locator('[data-zurueckholen]').count() == 0 and pg.locator('.tourkarte[data-lkw="L08"]').count() == 1
           and 'wieder verfügbar' in pg.inner_text('#plan-meldung'))

    # Werkstatt nach dem Übernehmen: Touren des Lkw als Konflikt, Ladeliste gesperrt
    pg.click('#plan-uebernehmen'); pg.wait_for_timeout(500)
    ansicht(pg, 'fuhrpark', 600)
    pg.click('[data-werkstatt="L03"]'); pg.wait_for_timeout(600)
    ansicht(pg, 'plantafel', 500)
    pruefe('Werkstatt nach Übernehmen: Tour von E-HR 103 als Konflikt markiert', pg.locator('.block.konflikt').count() == 1)
    pg.locator('.block.konflikt').click(); pg.wait_for_timeout(400)
    pruefe('Werkstatt nach Übernehmen: Dialog warnt, Ladeliste gesperrt', pg.locator('#dlg-konflikt').count() == 1 and pg.locator('#dlg-ladeliste').is_disabled())
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    frisch(pg)
    pg.click('#beladung-berechnen'); pg.wait_for_timeout(800)

    # Ladeliste für den Fahrer: Druck mit Hin- und Rückweg, Stellplätzen, Adressen und Stopps
    pg.evaluate("window.gedruckt = 0; window.print = () => { window.gedruckt++; }; 0")  # ohne „; 0“ ruft Playwright die Funktion selbst auf
    # decode() künstlich verzögern: gedruckt werden darf erst, wenn die Bilder fertig sind
    pg.evaluate("""(() => { const d = HTMLImageElement.prototype.decode; window.decodeFertig = 0;
      HTMLImageElement.prototype.decode = function () { return new Promise((ok) => setTimeout(ok, 700)).then(() => d.call(this)).then(() => { window.decodeFertig++; }); }; })()""")
    pg.locator('.tourkarte[data-lkw="L10"] [data-ladeliste]').click(); pg.wait_for_timeout(200)
    vorher = pg.evaluate('window.gedruckt')
    pg.wait_for_function('window.gedruckt == 1', timeout=5000)
    pruefe(f'Ladeliste: Druck wartet, bis die Bilder geladen sind (nach 0,2 s gedruckt: {vorher})', vorher == 0 and pg.evaluate('window.decodeFertig') == 2)
    druck = pg.evaluate("document.querySelector('#druck').textContent")
    dbild = pg.evaluate("[...document.querySelectorAll('#druck img.druck-bild')].map(i => i.complete && i.naturalWidth > 0 && i.src.startsWith('data:image/png'))")
    pruefe(f'Ladeliste: 3D-Bild für Hinweg und Rückweg, beim Drucken geladen ({dbild})', dbild == [True, True])
    pruefe('Ladeliste: Druck ausgelöst, Hinweg und Rückweg, Adressen, ohne Kettenvorgabe', pg.evaluate('window.gedruckt') == 1 and 'Ladeliste E-HR 110' in druck
           and 'Am Hof aufladen' in druck and 'Unterwegs aufladen' in druck and 'Blitzkuhlenstraße 101' in druck and 'Herr Peters' in druck and 'Kette' not in druck
           and pg.locator('#druck table').count() == 2)
    pg.locator('.tourkarte[data-lkw="L08"] [data-ladeliste]').click(); pg.wait_for_function('window.gedruckt == 2', timeout=5000)
    reihe = pg.locator('#druck table').first.locator('tr td:nth-child(4)').all_inner_texts()
    pruefe(f'Ladeliste: zuerst aufgeladen wird der letzte Kunde ({reihe})', pg.evaluate('window.gedruckt') == 2 and [x[0] for x in reihe] == ['2', '1'])
    pg.emulate_media(media='print')
    pruefe('Ladeliste: beim Drucken nur die Liste sichtbar', pg.locator('#druck').is_visible() and not pg.locator('.app').is_visible())
    pg.emulate_media(media='screen')
    pruefe('Ladeliste: am Bildschirm unsichtbar', not pg.locator('#druck').is_visible())

    # Datum: anderer Tag ohne Aufträge, Sprung zum Beispieltag, Woche und Monat
    frisch(pg)
    pg.click('#tag-heute'); pg.wait_for_timeout(400)
    pruefe('Heute: keine offenen Aufträge, Knopf zum Beispieltag', pg.locator('#plan-auftraege [data-auftrag]').count() == 0 and pg.get_by_text('Zum Beispieltag').count() == 1)
    pg.get_by_text('Zum Beispieltag').click(); pg.wait_for_timeout(400)
    pruefe('Knopf „Zum Beispieltag“ springt auf den 07.10.', pg.input_value('#datum-eingabe') == '2026-10-07' and pg.locator('#plan-auftraege [data-auftrag]').count() == 14)
    ansicht(pg, 'plantafel', 400)
    pg.click('.plan-reiter [data-plan="woche"]'); pg.wait_for_timeout(400)
    pruefe('Woche: 6 Tagesspalten, Touren als Einträge', pg.locator('.woche th').count() == 7 and pg.locator('.woche .wchip').count() > 10)
    pg.locator('.woche .wchip').first.click(); pg.wait_for_timeout(500)
    pruefe('Klick in der Woche öffnet den Tourdialog', pg.locator('#dlg-tour[open]').count() == 1)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.click('.plan-reiter [data-plan="monat"]'); pg.wait_for_timeout(400)
    pruefe('Monat: Kalender mit Tagen', pg.locator('.monat .mtag').count() >= 28)
    pg.locator('.mtag[data-tag="2026-10-14"]').click(); pg.wait_for_timeout(400)
    pruefe('Klick im Monat öffnet den Tag', pg.input_value('#datum-eingabe') == '2026-10-14' and pg.get_attribute('.plan-reiter [data-plan="tag"]', 'aria-selected') == 'true')
    pruefe('Erzeugte Touren anderer Tage auf Viertelstunden', pg.evaluate("stand.alleTouren.filter(t => t.tag !== '2026-10-06').every(t => t.start % 15 === 0)"))
    pruefe('Erzeugte Speditionen: Schwertransport genau dann, wenn kein eigener Lkw das Gerät laden darf', pg.evaluate("""stand.alleSped.filter(s => s.grund !== 'noch offen').every(s =>
      /Schwertransport/.test(s.grund) === !LKW.some(l => ladepruefung(finde(GERAETE, s.geraet), l).ergebnis === 'ok'))"""))
    pruefe('Vergangene Tage gelten als erledigt', pg.evaluate("stand.alleTouren.filter(t => t.tag < '2026-10-06').every(t => status(t) === 'erledigt')"))

    # Fahrzeuge: Steckbrief je Lkw mit Zonen, Zurrpunkten und Rampe
    ansicht(pg, 'fuhrpark', 600)
    sb = pg.evaluate("""LKW.map(l => { const a = document.querySelector(`.steckbrief[data-lkw="${l.id}"]`), s = a.querySelector('svg');
      const vier = [...s.querySelectorAll('text')].find(t => t.textContent === '4,00 m');
      return a && s.querySelectorAll('circle[fill="#f2b705"]').length === l.zurr.length && vier && vier.getBBox().y >= 0; })""")
    pruefe(f'Fahrzeuge: 10 Steckbriefe, Zurrpunkte gezeichnet, 4-m-Linie im Bild {sb}', len(sb) == 10 and all(sb))
    pruefe('Fahrzeuge: 3D-Bild je Lkw', pg.evaluate("[...document.querySelectorAll('.steckbrief .lkw-bild')].filter(i => i.complete && i.naturalWidth === 640).length") == 10)
    pruefe('Fahrzeuge: Steckbrief nennt, was die Zurrpunkte halten', 'halten je 10,0 t' in pg.inner_text('.steckbrief[data-lkw="L08"]'))
    pruefe('Fahrzeuge: Geräte mit Steigfähigkeit und Bodenfreiheit', 'Steigfähigkeit' in pg.inner_text('#tab-geraete') and pg.locator('#tab-geraete tr').count() == 19)
    pg.screenshot(path=str(aus / 'fahrzeuge.png'), full_page=True)

    # Ladeplan frei ausprobieren: zu breit, zu schwer, Balken rot
    pg.locator('.steckbrief[data-lkw="L07"] button', has_text='Im Ladeplan ansehen').click(); pg.wait_for_timeout(800)
    pg.select_option('#lp-geraet', 'G09'); pg.click('#lp-dazu'); pg.wait_for_timeout(400)
    pruefe('Ladeplan frei: MRT 2550 auf E-HR 107 zu breit für die Rungen', 'zu breit' in pg.inner_text('#lp-werte') and pg.locator('#lp-zurueck').is_hidden())
    pg.select_option('#lp-lkw', 'L02'); pg.wait_for_timeout(400)
    rot = pg.evaluate("document.querySelector('#lp-werte [data-wert=\"gewicht\"] .balken i').style.background.includes('rot')")
    pruefe('Ladeplan frei: auf E-HR 102 zu schwer, Gewichtsbalken rot', 'zu schwer' in pg.inner_text('#lp-werte') and rot)
    pg.click('#lp-liste .x'); pg.wait_for_timeout(300)
    pruefe('Ladeplan frei: Gerät entfernen leert die Ladung', 'Noch nichts geladen' in pg.inner_text('#lp-liste'))
    pg.select_option('#lp-lkw', 'L05'); pg.select_option('#lp-geraet', 'G08'); pg.click('#lp-dazu'); pg.wait_for_timeout(400)
    pruefe('Ladeplan frei: DQ 50 auf E-HR 105, die Zurrpunkte halten zu wenig', 'Zurrpunkte halten je 4,0 t, nötig sind 4,1 t' in pg.inner_text('#lp-werte'))

    # Speicher: kaputte Stände führen zu Beispieldaten, gültiger Stand wird übernommen
    for name, roh in [
        ('kaputter Speicher', "{alleTouren:[null], alleSped:[], alleAuftraege:[], vertraege:[], kunden:[], werkstatt:[], nr:1, kosten:{}}"),
        ('Startzeit als Text', "{alleTouren:[{id:'T1',tag:'2026-10-06',lkw:'L01',fahrer:'F09',geraet:'G12',ort:'du',art:'Abholung',start:'600'}], alleSped:[], alleAuftraege:[], vertraege:[], kunden:[], werkstatt:[], nr:1, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1}}"),
        ('ID mit Exponent', "{alleTouren:[{id:'T1e309',tag:'2026-10-06',lkw:'L01',fahrer:'F09',geraet:'G12',ort:'du',art:'Abholung',start:600}], alleSped:[], alleAuftraege:[], vertraege:[], kunden:[], werkstatt:[], nr:1, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1}}"),
        ('Sammeltour mit falschem Ort', "{alleTouren:[{id:'T1',tag:'2026-10-07',lkw:'L03',fahrer:'F04',art:'Sammeltour',start:420,stopps:[{ort:'zz',art:'Auslieferung',geraete:['G13']}],auftraege:[]}], alleSped:[], alleAuftraege:[], vertraege:[], kunden:[], werkstatt:[], nr:1, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1}}"),
        ('Einzeltour mit kaputtem Stopps-Feld', "{alleTouren:[{id:'T1',tag:'2026-10-06',lkw:'L01',fahrer:'F09',geraet:'G12',ort:'du',art:'Abholung',start:600,stopps:'kaputt'}], alleSped:[], alleAuftraege:[], vertraege:[], kunden:[], werkstatt:[], nr:1, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1}}"),
        ('Sammeltour mit fehlendem Auftrag', "{alleTouren:[{id:'T1',tag:'2026-10-07',lkw:'L03',fahrer:'F04',art:'Sammeltour',start:420,stopps:[{ort:'du',art:'Auslieferung',geraete:['G13','G13']}],auftraege:[{id:'B01',tag:'2026-10-07',art:'Auslieferung',geraet:'G13',ort:'du',bis:540}]}], alleSped:[], alleAuftraege:[], vertraege:[], kunden:[], werkstatt:[], nr:1, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1}}"),
        ('Sammeltour, die zeitlich nicht aufgeht', "{alleTouren:[{id:'T1',tag:'2026-10-07',lkw:'L03',fahrer:'F04',art:'Sammeltour',start:1020,stopps:[{ort:'ms',art:'Auslieferung',geraete:['G13','G13']}],auftraege:[{id:'B01',tag:'2026-10-07',art:'Auslieferung',geraet:'G13',ort:'ms',bis:1140},{id:'B02',tag:'2026-10-07',art:'Auslieferung',geraet:'G13',ort:'ms',bis:1140}]}], alleSped:[], alleAuftraege:[], vertraege:[], kunden:[], werkstatt:[], nr:5, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1}}"),
        ('Auftrags-ID doppelt (offen und in einer Tour)', "{alleTouren:[{id:'T1',tag:'2026-10-07',lkw:'L03',fahrer:'F04',art:'Sammeltour',start:420,stopps:[{ort:'du',art:'Auslieferung',geraete:['G13']}],auftraege:[{id:'B01',tag:'2026-10-07',art:'Auslieferung',geraet:'G13',ort:'du',bis:540}]}], alleSped:[], alleAuftraege:[{id:'B01',tag:'2026-10-07',art:'Auslieferung',geraet:'G14',ort:'du',bis:540}], vertraege:[], kunden:[], werkstatt:[], nr:5, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1}}"),
        ('Auftrag am Sonntag', "{alleTouren:[], alleSped:[], alleAuftraege:[{id:'B1',tag:'2026-10-11',art:'Auslieferung',geraet:'G13',ort:'du',bis:540}], vertraege:[], kunden:[], werkstatt:[], nr:1, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1}}"),
    ]:
        pg.evaluate(f"localStorage.setItem('{SPEICHER}', JSON.stringify({roh}))")
        pg.reload(); pg.wait_for_timeout(1200)
        pruefe(f'Speicher {name}: Beispieldaten statt Absturz', pg.evaluate('stand.alleAuftraege.length') == 20 and pg.evaluate('stand.alleTouren.length') > 100)
    pg.evaluate(f"""localStorage.setItem('{SPEICHER}', JSON.stringify({{alleTouren:[{{id:'T101',tag:'2026-10-07',lkw:'L03',fahrer:'F04',art:'Sammeltour',start:420,
        stopps:[{{ort:'K01',art:'Auslieferung',geraete:['G13','G13']}}],auftraege:[{{id:'B01',tag:'2026-10-07',art:'Auslieferung',geraet:'G13',ort:'K01',bis:540}},{{id:'B02',tag:'2026-10-07',art:'Auslieferung',geraet:'G13',ort:'K01',bis:540}}]}}], alleSped:[], alleAuftraege:[], vertraege:[], kunden:[], werkstatt:[], nr:100,
        kosten:{{fahrerStunde:38,spedKm:2.4,spedGrund:140,schwerFaktor:2.5}}}}))""")
    pg.reload(); pg.wait_for_timeout(1500)
    pruefe('Speicher: gültige Sammeltour übernommen, ID-Zähler dahinter', pg.evaluate('stand.nr') == 101 and pg.evaluate('stand.alleTouren.length') == 1
           and 8 * 60 < pg.evaluate("ende(stand.alleTouren[0])") < 10 * 60)

    # Modelle liegen innerhalb ihrer Transportmaße
    passt = pg.evaluate("""GERAETE.every(g => { const m = geraetKoerper(g); m.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m);
        return b.max.y <= g.h + 0.001 && b.max.x - b.min.x <= g.l + 0.001 && b.max.z - b.min.z <= g.b + 0.001; })""")
    pruefe('Modelle liegen innerhalb ihrer Transportmaße', passt)

    # Beladungslogik: Daten stimmig, jede Regel mit einem Fall, der an ihr scheitert
    pg.evaluate("localStorage.clear()"); ohne_rundgang(pg); pg.reload(); pg.wait_for_timeout(2000)
    daten = pg.evaluate("""(() => { const f = [], r2 = (x) => Math.round(x * 100) / 100;
      for (const l of LKW) {
        if (r2(l.zonen.reduce((s, z) => s + z.laenge, 0)) !== l.laenge) f.push(l.id + ' Zonenlängen');
        if (Math.min(...l.zonen.map((z) => z.hoehe)) !== l.ladehoehe) f.push(l.id + ' Ladehöhe');
        if (l.nutzbreite > l.breite) f.push(l.id + ' Nutzbreite');
        if (!l.zurr.every((p, i) => p >= 0 && p <= l.laenge && (i === 0 || p > l.zurr[i - 1]))) f.push(l.id + ' Zurrpunkte');
        if (!(l.achsen.vorn.x < l.achsen.hinten.x && l.achsen.vorn.frei + l.achsen.hinten.frei >= l.nutzlast)) f.push(l.id + ' Achsen');
        if (!(l.zurrLast > 0 && l.zurrLast <= 10)) f.push(l.id + ' Zurrlast');
      }
      const positiv = (g) => ['gewicht', 'l', 'b', 'h', 'radstand', 'boden', 'steig', 'schwerpunkt'].every((k) => Number.isFinite(g[k]) && g[k] > 0);
      for (const g of GERAETE) if (!(positiv(g) && g.anschlag[0] >= 0 && g.anschlag[0] < g.anschlag[1] && g.anschlag[1] <= g.l && g.schwerpunkt > 0
        && g.schwerpunkt < g.l && g.radstand < g.l)) f.push(g.id);
      return f; })()""")
    pruefe(f'Beladung: Lkw- und Gerätedaten stimmig {daten or ""}', not daten)
    faelle = [  # (Lkw, Stopps, erwartet, Regel)
        ('L04', [['G18']], 'ok', None), ('L02', [['G04']], 'nein', 'gewicht'), ('L07', [['G09']], 'nein', 'breite'),
        ('L08', [['G13']], 'nein', 'steigung'), ('L07', [['G01']], 'nein', 'kante'), ('L01', [['G14']], 'nein', 'ladebordwand'),
        ('L09', [['G09']], 'nein', 'laenge'), ('L08', [['G11']], 'genehmigung', 'hoehe'), ('L05', [['G08']], 'nein', 'zurr'),
        ('L05', [['G05']], 'nein', 'zurr'), ('L09', [['G01', 'G04']], 'nein', 'zurr'), ('L10', [['G05']], 'ok', None),
        ('L03', [['G13', 'G13']], 'ok', None), ('L03', [['G13', 'G13', 'G14']], 'nein', 'gewicht'),
        ('L08', [['G05'], ['G16']], 'ok', None), ('L08', [['G16'], ['G05']], 'nein', 'reihenfolge'),
    ]
    for lkw, stopps, art, regel in faelle:
        erg = pg.evaluate(f"(() => {{ const b = beladung(finde(LKW, '{lkw}'), {stopps}.map((s) => s.map((id) => finde(GERAETE, id))));"
                        " return { art: b.art, regeln: b.gruende.map((x) => x.regel), txt: b.gruende.map((x) => x.txt).join('; ') }; })()")
        pruefe(f'Beladung {lkw} {stopps}: {art}{" wegen " + regel if regel else ""} ({erg["txt"] or "passt"})',
               erg['art'] == art and (regel in erg['regeln'] if regel else not erg['regeln']))
    pruefe('Beladung: Achslast verhindert ERP16VT hinten vor 140 SC auf E-HR 105',
           pg.evaluate("(() => { const l = finde(LKW, 'L05'), s = [[finde(GERAETE, 'G01')], [finde(GERAETE, 'G15')]]; return !anordnen(l, s) && !!anordnen(l, s, { achse: false }); })()"))
    pruefe('Beladung: nach dem ersten Abladen wäre auf E-HR 106 eine Achse überladen',
           pg.evaluate("(() => { const l = finde(LKW, 'L06'), s = [[finde(GERAETE, 'G01')], [finde(GERAETE, 'G15')]]; return !anordnen(l, s) && !!anordnen(l, s, { entladen: false }); })()"))

    # Tagesplanung: Beispieltag morgen mit Auslieferungen und Abholungen, jede Tour unabhängig nachgerechnet
    plan = pg.evaluate("""(() => { const tag = tagPlus(HEUTE, LADETAG_NR), auf = stand.alleAuftraege.filter((a) => a.tag === tag), t0 = performance.now();
      const r = beladungVerteilen(auf, tag), ms = performance.now() - t0, f = [];
      const ids = [...r.touren.flatMap((t) => t.auftraege), ...r.spedition.map((s) => s.auftrag)].map((a) => a.id).sort();
      if (ids.join() !== auf.map((a) => a.id).sort().join()) f.push('nicht jeder Auftrag genau einmal');
      if (new Set(r.touren.map((t) => t.lkw.id)).size !== r.touren.length) f.push('Lkw doppelt');
      if (new Set(r.touren.map((t) => t.fahrer.id)).size !== r.touren.length) f.push('Fahrer doppelt');
      for (const t of r.touren) {
        const l = t.lkw, n = t.lkw.kz;
        if (!darfFahren(t.fahrer, l)) f.push(n + ' Führerschein');
        if (!lkwFrei(l.id, t.start, t.ende, [], tag)) f.push(n + ' Lkw belegt');
        if (!fahrerFrei(t.fahrer.id, t.start, t.ende, [], tag, t.abschnitte)) f.push(n + ' Fahrer belegt oder Pause fehlt');
        if (t.ende > TAG_ENDE) f.push(n + ' zu spät zurück');
        const arten = t.halte.map((h) => h.art).join();
        if (/Abholung,Auslieferung/.test(arten)) f.push(n + ' Abholung vor Auslieferung');
        for (const h of t.halte) for (const a of h.auftraege) {
          if (a.art !== h.art || a.ort !== h.ort) f.push(n + ' Auftrag am falschen Halt');
          if (h.ankunft > a.bis) f.push(n + ' zu spät bei ' + a.ort);
          if (a.art === 'Abholung' && h.ankunft < a.ab) f.push(n + ' vor dem Abholfenster bei ' + a.ort);
        }
        let z0 = 0; const zonen = l.zonen.map((z) => { const v = z0; z0 += z.laenge; return { z, v, b: z0 }; });
        // Hinweg: späterer Kunde weiter vorn; Rückweg: zuerst aufgeladener Halt weiter vorn
        for (const [plaetze, rueck] of [[t.plaetze, false], [t.plaetzeRueck, true]]) {
          const p = [...plaetze].sort((a, b) => a.x - b.x);
          p.forEach((q, i) => {
            const zo = zonen.find((x) => x.z === q.zone);
            if (q.x < zo.v - 1e-9 || q.x + q.g.l > zo.b + 1e-9) f.push(n + ' ' + q.g.kurz + ' ragt aus der Zone');
            if (q.zone.hoehe + q.g.h > MAX_HOEHE) f.push(n + ' ' + q.g.kurz + ' zu hoch');
            if (zurrLuecke(q.g, l, q.x)) f.push(n + ' ' + q.g.kurz + ' ohne Zurrpunkt');
            if (q.g.gewicht * ZURR_ANTEIL > l.zurrLast) f.push(n + ' ' + q.g.kurz + ' Zurrpunkte zu schwach');
            if (i && q.x < p[i - 1].x + p[i - 1].g.l + LADE_ABSTAND - 1e-9) f.push(n + ' Geräte überlappen');
            if (i && (rueck ? q.stopp < p[i - 1].stopp : q.stopp > p[i - 1].stopp)) f.push(n + ' Ladereihenfolge ' + (rueck ? 'Rückweg' : 'Hinweg'));
            if (t.halte[q.stopp].art !== (rueck ? 'Abholung' : 'Auslieferung')) f.push(n + ' Gerät auf der falschen Fahrtrichtung');
          });
          const halte = [...new Set(p.map((q) => q.stopp))].sort((a, b) => a - b);
          for (const k of halte) { // Hinweg: nach jedem Abladen; Rückweg: nach jedem Aufladen
            const a = achslasten(l, p.filter((q) => (rueck ? q.stopp <= k : q.stopp >= k)));
            if (a.vorn > l.achsen.vorn.frei + 1e-9 || a.hinten > l.achsen.hinten.frei + 1e-9) f.push(n + ' Achslast bei Stopp ' + (k + 1));
          }
        }
      }
      return { f, ms, lkw: r.touren.length, sped: r.spedition.length, stopps: Math.max(...r.touren.map((t) => t.halte.length)), varianten: r.varianten,
        gemischt: r.touren.filter((t) => t.halte.some((h) => h.art === 'Abholung') && t.halte.some((h) => h.art === 'Auslieferung')).length }; })()""")
    pruefe(f'Tagesplanung: alle Regeln je Tour eingehalten {plan["f"] or ""}', not plan['f'])
    pruefe(f'Tagesplanung: 14 Transporte auf {plan["lkw"]} Lkw, {plan["sped"]} Spedition, bis {plan["stopps"]} Stopps, {plan["gemischt"]} gemischte Fahrten',
           plan['lkw'] == 7 and plan['sped'] == 2 and plan['stopps'] == 2 and plan['gemischt'] >= 2)
    pruefe(f'Tagesplanung: schnell genug ({plan["ms"]:.0f} ms, {plan["varianten"]} Ladevarianten)', plan['ms'] < 1500 and plan['varianten'] > 0)
    warum = pg.evaluate("""(() => { const tag = tagPlus(HEUTE, LADETAG_NR), auf = stand.alleAuftraege.filter((a) => a.tag === tag), r = beladungVerteilen(auf, tag);
      const t = r.touren.find((x) => x.lkw.id === 'L03'), mast = auf.find((a) => a.id === 'B03');
      return t ? warumNichtDazu(t, mast) : 'keine Tour auf E-HR 103'; })()""")
    pruefe(f'Tagesplanung: Begründung, warum der Mast nicht mit auf E-HR 103 fährt ({warum})', warum and 'zu schwer' in warum)
    warum = pg.evaluate("""(() => { const tag = tagPlus(HEUTE, LADETAG_NR), auf = stand.alleAuftraege.filter((a) => a.tag === tag), r = beladungVerteilen(auf, tag);
      const t = r.touren.find((x) => x.lkw.id === 'L05'), abholung = auf.find((a) => a.id === 'B14');
      return t ? warumNichtDazu(t, abholung) : 'keine Tour auf E-HR 105'; })()""")
    pruefe(f'Tagesplanung: Begründung, warum die Abholung nicht auf E-HR 105 mitfährt ({warum})', warum and 'auf dem Rückweg' in warum and 'Rampe' in warum)
    nachmittag = pg.evaluate("""(() => { const t = tourBauen(finde(LKW, 'L01'), [{ id: 'BX', tag: '2026-10-07', art: 'Abholung', geraet: 'G12', ort: 'K01', ab: 14 * 60, bis: 14 * 60 + 30 }], '2026-10-07', { n: 0 });
      return t ? [t.start, t.ende, t.phasen.filter((p) => p.typ === 'warten').length] : null; })()""")
    pruefe(f'Abholung am Nachmittag: Start passend zum Fenster, kein langes Warten ({nachmittag})', nachmittag and nachmittag[0] >= 12 * 60 and nachmittag[1] - nachmittag[0] < 3 * 60)
    fenster = pg.evaluate("""(() => { const h = [{ ort: 'K01', art: 'Abholung' }], a = [{ ort: 'K01', art: 'Abholung', geraet: 'G12', ab: 13 * 60, bis: 13 * 60 + 15 }];
      const f = fahrplan(h, a, 7 * 60 + 15, true); return f ? f.halte[0].beginn : null; })()""")
    pruefe(f'Abholfenster gilt für den Beginn des Aufladens, auch nach einer Pause ({fenster})', fenster is None or fenster <= 13 * 60 + 15)
    sechs = pg.evaluate("""(() => { const orte = ['K01', 'K02', 'K03', 'K04', 'K05', 'K06'], l = finde(LKW, 'L06');
      const auf = orte.map((o, i) => ({ id: 'BS' + i, tag: '2026-10-12', art: i < 3 ? 'Auslieferung' : 'Abholung', geraet: 'G13', ort: o, ...(i < 3 ? {} : { ab: 7 * 60 }), bis: 17 * 60 }));
      const route = haltFolge(orte.slice(0, 3), orte.slice(3)); // ohne Haltegrenze ließe sich diese Fahrt laden und fahren
      return { ladung: ladungGrund(l, route.map((h) => ({ ...h, auftraege: amHalt(auf, h) }))), plan: !!fahrplan(route, auf, 7 * 60, true, false),
        sechs: !!tourBauen(l, auf, '2026-10-12', { n: 0 }), fuenf: !!tourBauen(l, auf.slice(0, 5), '2026-10-12', { n: 0 }) }; })()""")
    pruefe(f'Höchstens 5 Halte je Fahrt, auch beim Einplanen außerhalb der Tagesplanung {sechs}', not sechs['ladung'] and sechs['plan'] and not sechs['sechs'] and sechs['fuenf'])
    vorschlag = pg.evaluate("""(() => { const a = { id: 'B999', tag: '2026-10-07', art: 'Abholung', geraet: 'G12', ort: 'K02', ab: 9 * 60, bis: 15 * 60 };
      return einzelVorschlaege(a).map((v) => v.art).join(); })()""")
    pruefe(f'Einzelner Transport: Vorschläge vorhanden ({vorschlag})', vorschlag and 'sped' not in vorschlag)

    # Pausen und Lenkzeiten (Arbeitszeitgesetz, EU 561/2006)
    pausen = pg.evaluate("""(() => { const A = (von, bis, lenk = true, eu = true) => ({ von, bis, lenk, eu });
      return [pausenVerstoss([A(420, 840, false)]), pausenVerstoss([A(420, 720)]), pausenVerstoss([A(420, 720, true, false)]),
        pausenVerstoss([A(420, 540), A(555, 600, false), A(630, 870)]), pausenVerstoss([A(420, 540), A(555, 600, false), A(615, 870)]),
        pausenVerstoss([A(420, 720, false), A(750, 1020, false)]), pausenVerstoss([A(420, 720, false), A(765, 1035, false)]),
        pausenVerstoss([A(360, 720, false), A(765, 1035, false)])]; })()""")
    erwartet = [True, True, False, False, True, True, False, True]
    pruefe(f'Pausen: 6 h am Stück, 4,5 h Lenkzeit, Teilpause 15 + 30, 9 h und 10 h richtig erkannt {pausen}', [bool(x) for x in pausen] == erwartet)
    pruefe('Pausen: lange Fahrt bekommt Pausen und hält alle Regeln ein', pg.evaluate("""(() => {
      const h = (ort) => ({ ort, art: 'Auslieferung' }), a = (ort) => ({ ort, art: 'Auslieferung', geraet: 'G12', bis: 1140 });
      const f = fahrplan([h('ms'), h('k'), h('mg')], [a('ms'), a('k'), a('mg')], 420, true);
      return !!f && f.pausen.length >= 1 && !pausenVerstoss(f.abschnitte); })()"""))
    pruefe('Pausen: kein Fahrer in den Beispieldaten über den Regeln', pg.evaluate("""(() => { const tage = {};
      for (const t of stand.alleTouren) (tage[t.tag + t.fahrer] = tage[t.tag + t.fahrer] || []).push(t);
      return Object.values(tage).every((ts) => !pausenVerstoss(ts.flatMap(abschnitteVon))); })()"""))
    # Murat Yilmaz fährt um 12:00 nach Münster; eine Abholung in Oberhausen ab 10:15 endet 11:51, danach wären es über 6 h ohne Pause
    pruefe('Pausen: Einplanen lehnt eine Tour ab, die nur an den Pausen scheitert', pg.evaluate("""(() => {
      const a = { art: 'Abholung', geraet: 'G01', ort: 'ob', start: 10 * 60 + 15, tag: HEUTE }, bis = a.start + dauerEinfach(a.art, a.ort);
      return fahrerFrei('F02', a.start, bis, [], HEUTE) && !fahrerFrei('F02', a.start, bis, [], HEUTE, abschnitteVon({ ...a, lkw: 'L02' }))
; })()"""))


    pg.close()  # spart Grafikspeicher: jede offene Seite hält eigene 3D- und Kartenkontexte

    # Tablet: jede Ansicht in drei iPad-Größen auf Überlappung, Überstand, Fingergröße und leere Texte prüfen
    LAYOUT_JS = """(() => {
      const kasten = (e) => { // nur der Teil, den rollende Vorfahren (Seite, Routenbereich) nicht abschneiden
        const r = e.getBoundingClientRect();
        let top = r.top, bottom = r.bottom;
        for (let v = e.parentElement; v; v = v.parentElement) {
          if (!/auto|scroll|hidden/.test(getComputedStyle(v).overflowY)) continue;
          const k = v.getBoundingClientRect(); top = Math.max(top, k.top); bottom = Math.min(bottom, k.bottom);
        }
        return { left: r.left, right: r.right, width: r.width, top, bottom, height: Math.max(0, bottom - top), voll: r }; };
      const sichtbar = (e) => { const r = kasten(e), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[hidden], dialog:not([open])'); };
      const oben = document.querySelector('.rundgang') || document.querySelector('dialog[open]');   // Rundgang oder Dialog: nur deren Inhalt zählt
      const elemente = [...(oben || document).querySelectorAll('button, select, input, textarea, summary')].filter(sichtbar)
        .filter((e) => !e.closest('.icons, .tafel-rahmen, .tab-rahmen, .maplibregl-ctrl, .kunden-liste')); // Scrollbereiche ausgenommen
      const boxen = elemente.map((e) => ({ e, r: kasten(e) }));
      const name = (e) => (e.id || e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30);
      const ueberlappt = [];
      for (let i = 0; i < boxen.length; i++) for (let j = i + 1; j < boxen.length; j++) {
        const a = boxen[i], b = boxen[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 2 && y > 2) ueberlappt.push(name(a.e) + ' / ' + name(b.e));
      }
      // Auswahlknöpfe zählen mit ihrer ganzen Beschriftung als Fläche
      const zuKlein = boxen.filter((b) => !(b.e.type === 'radio' && b.e.closest('label')?.getBoundingClientRect().height >= 40)).filter((b) => b.r.voll.height < 28 && b.r.voll.width < 28).map((b) => name(b.e));
      const raus = boxen.filter((b) => b.r.right > innerWidth + 1 || b.r.left < -1).map((b) => name(b.e));
      return { ueberlappt, zuKlein, raus, breite: document.documentElement.scrollWidth,
        leerText: /\\b(null|undefined|NaN)\\b|\\[object/.test((oben || document.body).innerText) };
    })()"""
    for (tw, th) in [(1180, 820), (820, 1180), (1366, 1024)]:
        t = b.new_page(viewport={'width': tw, 'height': th}, has_touch=True)
        t.on('pageerror', lambda e: fehler.append(f'Tablet: {e}'))
        t.goto(seite); t.wait_for_timeout(2500)
        z = t.evaluate(LAYOUT_JS)
        pruefe(f'Tablet {tw}x{th} Rundgang: nichts überlappt oder ragt heraus {z["ueberlappt"][:3]}{z["raus"][:3]}', not z['ueberlappt'] and not z['raus'] and not z['zuKlein'])
        t.keyboard.press('Escape'); t.wait_for_timeout(300)
        t.click('#beladung-berechnen'); t.wait_for_timeout(800)
        for v in ['planen', 'kunden', 'ladeplan', 'plantafel', 'fuhrpark']:
            t.click(f'.icons [data-ansicht="{v}"]'); t.wait_for_timeout(900)
            z = t.evaluate(LAYOUT_JS)
            pruefe(f'Tablet {tw}x{th} {v}: nichts überlappt oder ragt heraus {z["ueberlappt"][:3]}{z["raus"][:3]}', not z['ueberlappt'] and not z['raus'] and z['breite'] <= tw)
            pruefe(f'Tablet {tw}x{th} {v}: Knöpfe fingergroß {z["zuKlein"][:3]}', not z['zuKlein'])
            pruefe(f'Tablet {tw}x{th} {v}: kein null/undefined im Text', not z['leerText'])
            t.screenshot(path=str(aus / f'tablet_{tw}_{v}.png'))
        t.click('.icons [data-ansicht="kunden"]'); t.wait_for_timeout(600)
        t.click('#kunde-detail [data-transport]'); t.wait_for_timeout(400)
        z = t.evaluate(LAYOUT_JS)
        pruefe(f'Tablet {tw}x{th} Dialog Neuer Transport: nichts überlappt oder ragt heraus {z["ueberlappt"][:3]}{z["raus"][:3]}', not z['ueberlappt'] and not z['raus'] and not z['zuKlein'])
        t.keyboard.press('Escape'); t.wait_for_timeout(300)
        t.click('.icons [data-ansicht="plantafel"]'); t.wait_for_timeout(600)
        t.locator('.block').first.click(); t.wait_for_timeout(400)
        z = t.evaluate(LAYOUT_JS)
        pruefe(f'Tablet {tw}x{th} Tourdialog: nichts überlappt {z["ueberlappt"][:3]}{z["raus"][:3]}', not z['ueberlappt'] and not z['raus'] and not z['leerText'])
        t.close()

    # Handy
    m = b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
    m.on('pageerror', lambda e: fehler.append('Handy: ' + str(e)))
    m.goto(seite); m.wait_for_timeout(2500)
    lage = m.evaluate("""(() => { const k = document.querySelector('.rg-karte').getBoundingClientRect(); return k.left >= 0 && k.right <= innerWidth; })()""")
    pruefe('Handy: Rundgang-Karte passt in die Breite', lage)
    m.keyboard.press('Escape'); m.wait_for_timeout(300)
    m.click('#beladung-berechnen'); m.wait_for_timeout(800)
    for v in ['planen', 'kunden', 'ladeplan', 'plantafel', 'fuhrpark']:
        m.click(f'.icons [data-ansicht="{v}"]'); m.wait_for_timeout(1200)
        breite = m.evaluate('document.documentElement.scrollWidth')
        pruefe(f'Handy {v}: keine Seitenquerrollen ({breite}px)', breite <= 390)
        m.screenshot(path=str(aus / f'handy_{v}.png'), full_page=True)
    b.close()

for n, ok in ergebnisse:
    print(('OK   ' if ok else 'FEHL ') + n)
print(f"{sum(ok for _, ok in ergebnisse)}/{len(ergebnisse)} grün")
print('Konsolenfehler:', fehler or 'keine')
sys.exit(0 if all(ok for _, ok in ergebnisse) and not fehler else 1)
