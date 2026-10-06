"""Prüfskript der Klick-Demo. Aufruf: python pruefung.py index.html <ausgabeordner>
Nutzt den installierten Edge (Playwright ohne eigenen Chromium). 3D-Karte, Hofansicht und Routen brauchen Internet.
Warnungen „Expected value to be of type number, but found null" stammen vom Kartenstil Positron selbst und zählen nicht."""
import sys, pathlib
from playwright.sync_api import sync_playwright

seite = pathlib.Path(sys.argv[1]).resolve().as_uri()
aus = pathlib.Path(sys.argv[2])
aus.mkdir(exist_ok=True)
SPEICHER = 'reiter-dispo-demo-v2'
fehler, ergebnisse = [], []

def pruefe(name, bed):
    ergebnisse.append((name, bool(bed)))

def zeit(pg, minuten):
    pg.evaluate(f"setzeZeit({minuten})")
    pg.wait_for_timeout(200)

def ansicht(pg, name, warten=400):
    pg.click(f'.icons [data-ansicht="{name}"]')
    pg.wait_for_timeout(warten)

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1600, 'height': 960})
    pg.on('console', lambda m: m.type == 'error' and fehler.append(m.text))
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.goto(seite); pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(8000)

    # Layout: Karte sitzt rechts neben der Tourenliste, unter der Kopfzeile, und ist groß genug
    lage = pg.evaluate("""(() => { const k = document.querySelector('#kartenpanel').getBoundingClientRect(), l = document.querySelector('.liste-panel').getBoundingClientRect(),
        h = document.querySelector('.kopf').getBoundingClientRect(), dsp = document.querySelector('.detailspalte').getBoundingClientRect(); return {rechts: k.left > l.right, unter: k.top >= h.bottom, breit: k.width > 700, hoch: k.height > 500, details_rechts: dsp.left > k.right, kopf_einzeilig: h.height < 90}; })()""")
    pruefe(f'Layout Rechner: Karte neben Liste, unter Kopfzeile ({lage})', all(lage.values()))

    # Dashboard 10:30
    kpis = pg.locator('#kpis .kpi .wert').all_inner_texts()
    pruefe('Liste: 13 Touren gezählt', pg.inner_text('#touren-zahl') == '13')
    pruefe('KPIs: 2 vermeidbare Speditionen', kpis[2].startswith('2'))
    pruefe('Liste: 13 Tourkarten', pg.locator('.tz[data-tour]').count() == 13)
    pruefe('Liste: unterwegs vorausgewählt (T05)', pg.locator('.tz.aktiv').get_attribute('data-tour') == 'T05')
    pruefe('Detail: Lkw-Seitenansicht', pg.locator('#tour-detail .bild svg').count() == 1)
    pruefe('Ablauf: 4 Abschnitte', pg.locator('#tour-ablauf .ablauf-liste li').count() == 4)
    pruefe('Ablauf: aktueller Schritt markiert', pg.locator('#tour-ablauf li.aktuell').count() == 1)
    pruefe('3D-Karte: Gebäude-Ebene da', pg.evaluate("m3Bereit && !!m3.getLayer('gebaeude-3d') && !!m3.getLayer('halle')"))
    pruefe('Einzeltour: nur ein Lkw-Marker (T05)', pg.locator('.lkw-marke').count() == 1)
    nur_t05 = pg.evaluate("m3.getSource('routen').serialize().data.features.every(f => f.properties.tour === 'T05')")
    pruefe('Einzeltour: nur Route der gewählten Tour', nur_t05)
    pg.click('#k-alle'); pg.wait_for_timeout(1500)
    pruefe('Alle Touren: mehrere Marker und Knopf aktiv', pg.locator('.lkw-marke').count() >= 2 and pg.get_attribute('#k-alle', 'aria-pressed') == 'true')
    pg.click('#k-alle'); pg.wait_for_timeout(1500)
    pruefe('Zurück zur Einzeltour', pg.locator('.lkw-marke').count() == 1)
    pruefe(f"3D-Karte: Straßenrouten geladen ({pg.evaluate('routen.size')})", pg.evaluate('routen.size') >= 10)
    pg.screenshot(path=str(aus / 'dashboard.png'))
    pg.locator('.tz[data-tour="T04"]').click(); pg.wait_for_timeout(2500)
    pruefe('Auswahl T04: Detail und Unterzeile aktualisiert', 'Düsseldorf' in pg.inner_text('#karte-unterzeile') and 'E-HR 105' in pg.inner_text('#tour-detail'))
    pg.screenshot(path=str(aus / 'dashboard_t04.png'))
    pg.fill('#suche', 'Krefeld'); pg.wait_for_timeout(200)
    pruefe('Suche „Krefeld“: 2 Touren', pg.locator('.tz[data-tour]').count() == 2)
    pg.fill('#suche', ''); pg.wait_for_timeout(200)
    pruefe('Gruppe Unterwegs: 2 Touren', pg.locator('#gruppe-unterwegs .tz').count() == 2)
    pruefe('Erledigt zugeklappt', not pg.locator('#gruppe-erledigt').evaluate('e => e.open'))
    pg.click('#k-hof'); pg.wait_for_timeout(4000)
    pg.screenshot(path=str(aus / 'hof_3d.png'))

    # Neuer Transport
    pg.click('#neu-knopf'); pg.wait_for_timeout(200)
    erster = pg.locator('#f-kandidaten .kandidat').first
    pruefe('bester Kandidat ist E-HR 107', 'E-HR 107' in erster.inner_text())
    pruefe('Spedition-Hinweis warnt', 'Achtung' in pg.inner_text('#f-sped-hinweis'))
    pg.click('#f-sped-knopf')
    pruefe('ohne Grund bleibt Dialog offen', pg.locator('#dlg-neu[open]').count() == 1)
    pg.click('[data-einplanen="L07"]'); pg.wait_for_timeout(300)
    pruefe('nach Einplanen 14 Touren, neue ausgewählt', pg.locator('.tz[data-tour]').count() == 14 and 'Hamm' in pg.inner_text('#karte-unterzeile'))

    pg.click('#neu-knopf')
    pg.select_option('#f-geraet', 'G11'); pg.wait_for_timeout(200)
    pruefe('GDP160: kein Einplanen (Genehmigung)', pg.locator('[data-einplanen]').count() == 0)
    pruefe('GDP160: Spedition begründet', 'begründet' in pg.inner_text('#f-sped-hinweis'))
    pg.select_option('#f-geraet', 'G02'); pg.select_option('#f-ort', 'ms')
    pg.fill('#f-start', '17:00'); pg.dispatch_event('#f-start', 'change'); pg.wait_for_timeout(200)
    pruefe('zu spät: kein Einplanen', pg.locator('[data-einplanen]').count() == 0)
    pruefe('zu spät: keine „vermeidbar“-Warnung', 'begründet' in pg.inner_text('#f-sped-hinweis'))
    pg.select_option('#f-geraet', 'G11'); pg.select_option('#f-ort', 'k')
    pg.fill('#f-start', '08:00'); pg.dispatch_event('#f-start', 'change'); pg.wait_for_timeout(200)
    pg.fill('#f-grund', 'Überbreite, Schwertransport')
    pg.click('#f-sped-knopf'); pg.wait_for_timeout(300)
    pruefe('Spedition: 4 Karten', pg.locator('#sped-liste .karte').count() == 4)
    pruefe('Spedition: 2 vermeidbar', pg.locator('#sped-liste .befund.vermeidbar').count() == 2)

    pg.reload(); pg.wait_for_timeout(3000)
    pruefe('Persistenz: 14 Touren nach Reload', pg.locator('.tz[data-tour]').count() == 14)

    # Plantafel
    ansicht(pg, 'plantafel')
    pruefe('Plantafel: 14 Blöcke', pg.locator('.block').count() == 14)
    pg.locator('.block').first.dispatch_event('click'); pg.wait_for_timeout(200)
    pruefe('Tourdialog zeigt Ablauf', pg.locator('#dlg-tour-inhalt table tr').count() == 5)
    pg.locator('#dlg-tour [data-schliessen]').click()

    # Hofansicht
    ansicht(pg, 'hof', 3000)
    pruefe('Hof: 3D-Szene mit 10 Lkw', pg.locator('#hof3d canvas').count() == 1 and pg.evaluate('Object.keys(hofSzene.lkw).length') == 10)
    weg = pg.evaluate("Object.values(hofSzene.lkw).filter(s => !s.gruppe.visible || s.gruppe.position.z < -40).length")
    pruefe(f'Hof 10:30: 2 Lkw unterwegs ({weg})', weg == 2)
    zeit(pg, 7 * 60 + 22); pg.wait_for_timeout(1600)
    pruefe('Hof 07:22: 3 Lkw an Rampen', pg.evaluate("Object.values(lkwZustaende()).filter(z => z.rampe != null).length") == 3)
    pruefe('Hof 07:22: 1 Lkw wartet', pg.evaluate("Object.values(lkwZustaende()).filter(z => z.warteplatz != null).length") == 1)
    pruefe('Hof 07:22: Rampentabelle zeigt Warteschlange', 'wartet' in pg.inner_text('#hof-docks'))
    an_rampe = pg.evaluate("(() => { const z = lkwZustaende(); return Object.entries(z).filter(([, x]) => x.rampe != null).every(([id, x]) => Math.abs(hofSzene.lkw[id].gruppe.position.x - RAMPEN[x.rampe].x) < 0.5); })()")
    pruefe('Hof 07:22: Lkw stehen sichtbar an ihrer Rampe', an_rampe)
    pruefe('Hof 07:22: Verspätung gemeldet', 'verspätet' in pg.inner_text('#hof-info'))
    rampen_js = "Object.fromEntries(Object.entries(lkwZustaende()).filter(([id, z]) => z.rampe != null).map(([id, z]) => [id, z.rampe]))"
    vorher = pg.evaluate(rampen_js)
    zeit(pg, 7 * 60 + 28)
    nachher = pg.evaluate(rampen_js)
    gemeinsam = [k for k in vorher if k in nachher]
    pruefe(f'Hof: Lkw behalten ihre Rampe ({len(gemeinsam)} verglichen)', gemeinsam and all(vorher[k] == nachher[k] for k in gemeinsam))
    zeit(pg, 7 * 60 + 22)
    pg.screenshot(path=str(aus / 'hof_0722.png'))
    drehung = pg.evaluate("""(() => { // dreht sich ein Lkw jemals, ohne zu fahren, oder springt die Ausrichtung?
        let schlecht = 0;
        for (const id of Object.keys(hofSzene.lkw)) {
          const fp = hofPlaene().fahrplaene[id]; let vor = lkwPose(fp, 360);
          for (let hz = 360.02; hz < 1140; hz += 0.02) {
            const p = lkwPose(fp, hz);
            if (p.sichtbar && vor.sichtbar) {
              const weg = Math.hypot(p.x - vor.x, p.z - vor.z), dreh = Math.abs(((p.rot - vor.rot) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
              if (dreh > 0.4 || (weg < 0.001 && dreh > 0.01)) schlecht++;
            }
            vor = p;
          }
        }
        return schlecht; })()""")
    pruefe(f'Hof: kein Drehen auf der Stelle, keine Sprünge ({drehung} Verstöße)', drehung == 0)
    a = pg.evaluate("(() => { const a = hofPlaene().auftraege.find(x => x.t.id === 'T01' && x.art === 'laden'); return {von: a.von, bis: a.bis}; })()")
    zeit(pg, int(a['von'] + 0.55 * (a['bis'] - a['von']))); pg.wait_for_timeout(400)
    auf_gabel = pg.evaluate("""(() => { const m = hofSzene.geraete.get('T01laden'), s = hofSzene.stapler.find(s => s.position.distanceTo(m.position) < 6);
        return m.parent === hofSzene.geraeteGruppe && !!s; })()""")
    pruefe('Hof: Stapler trägt das Gerät zum Lkw', auf_gabel)
    zeit(pg, int(a['bis']) - 1); pg.wait_for_timeout(400)
    pruefe('Hof: danach steht das Gerät auf der Ladefläche', pg.evaluate("hofSzene.geraete.get('T01laden').parent === hofSzene.lkw.L02.ladung"))
    zeit(pg, 7 * 60 + 22)
    zeit(pg, 10 * 60 + 30)

    # 3D-Ladeplan
    ansicht(pg, 'ladeplan', 800)
    pruefe('3D: Zeichenfläche da', pg.locator('#lp-szene canvas').count() == 1)
    pruefe('3D: MT 1840 auf E-HR 107 passt', 'passt ohne Genehmigung' in pg.inner_text('#lp-werte'))
    pg.select_option('#lp-geraet', 'G04'); pg.click('#lp-dazu'); pg.wait_for_timeout(300)
    pruefe('3D: + GDP35 ist zu schwer', 'zu schwer' in pg.inner_text('#lp-werte'))

    # Kosten und Kombi-Tour
    ansicht(pg, 'kosten', 500)
    karte = pg.locator('#kombi-liste .karte', has_text='Düsseldorf + Krefeld')
    pruefe('Kosten: Kombi Düsseldorf + Krefeld vorgeschlagen', karte.count() == 1)
    pg.screenshot(path=str(aus / 'kosten.png'), full_page=True)
    karte.locator('button').click(); pg.wait_for_timeout(300)
    pruefe('Kombi übernommen: 13 Touren', pg.locator('.tz[data-tour]').count() == 13)
    ansicht(pg, 'plantafel')
    pruefe('Kombi-Block in der Plantafel', pg.locator('.block[data-kombi="ja"]').count() == 1)
    ansicht(pg, 'kosten')
    pg.locator('#annahmen input[data-key="spedKm"]').fill('-5'); pg.dispatch_event('#annahmen input[data-key="spedKm"]', 'change')
    pruefe('Annahmen: negative Werte abgelehnt', pg.input_value('#annahmen input[data-key="spedKm"]') == '2.4')

    # Abspielen
    ansicht(pg, 'dashboard', 800); zeit(pg, 8 * 60)
    pg.click('#zeit-play'); pg.wait_for_timeout(1500); pg.click('#zeit-play')
    pruefe('Abspielen bewegt die Uhrzeit', pg.inner_text('#zeit-anzeige') != '08:00 Uhr')

    # Tempo: 1 Min./s läuft langsam
    zeit(pg, 8 * 60); pg.select_option('#zeit-tempo', '1')
    pg.click('#zeit-play'); pg.wait_for_timeout(3000); pg.click('#zeit-play')
    vorgerueckt = pg.evaluate('zeit') - 8 * 60
    pruefe(f'Tempo 1 Min./s: in 3 s etwa 3 Min. ({vorgerueckt})', 2 <= vorgerueckt <= 4)

    # Uhrzeit-Knöpfe: Klick springt zur vollen Stunde, laufende Stunde markiert
    pg.click('#uhrzeiten [data-stunde="14"]'); pg.wait_for_timeout(200)
    pruefe(f"Uhrzeit-Knopf springt auf 14:00 ({pg.inner_text('#zeit-anzeige')})", pg.inner_text('#zeit-anzeige') == '14:00 Uhr')
    zeit(pg, 9 * 60 + 40)
    pruefe('Laufende Stunde markiert (9:00)', pg.get_attribute('#uhrzeiten [data-stunde="9"]', 'aria-current') == 'true'
           and pg.locator('#uhrzeiten [aria-current="true"]').count() == 1)
    zeit(pg, 10 * 60 + 30)

    # Neuer Transport → 3D-Ladeplan → direkt einplanen
    vorher = pg.locator('.tz[data-tour]').count()
    pg.click('#neu-knopf'); pg.wait_for_timeout(200)
    pg.select_option('#f-geraet', 'G04'); pg.select_option('#f-ort', 'bo'); pg.fill('#f-start', '15:00'); pg.dispatch_event('#f-start', 'change'); pg.wait_for_timeout(200)
    pg.locator('#f-kandidaten .kandidat').first.locator('button[title^="Im 3D"]').click(); pg.wait_for_timeout(800)
    pruefe('3D-Planung: Ladeplan mit Auftrag geöffnet', not pg.locator('#v-ladeplan').is_hidden() and pg.input_value('#lp-ort') == 'bo' and pg.input_value('#lp-start') == '15:00')
    pruefe('3D-Planung: Einplanen möglich', pg.locator('#lp-einplanen').is_enabled())
    pg.select_option('#lp-geraet', 'G01'); pg.click('#lp-dazu'); pg.wait_for_timeout(200)
    pruefe('3D-Planung: zwei Geräte sperren das Einplanen', pg.locator('#lp-einplanen').is_disabled())
    pg.locator('#lp-liste li button').last.click(); pg.wait_for_timeout(200)
    pg.click('#lp-einplanen'); pg.wait_for_timeout(800)
    pruefe('3D-Planung: Tour angelegt und ausgewählt', pg.locator('.tz[data-tour]').count() == vorher + 1 and 'Bochum' in pg.inner_text('#karte-unterzeile'))

    pg.click('#reset-knopf'); pg.wait_for_timeout(300)
    pruefe('Reset: 13 Touren', pg.locator('.tz[data-tour]').count() == 13)

    for name, roh in [
        ('kaputter Speicher', "{touren:[null], sped:[], nr:1, kosten:{}}"),
        ('Startzeit als Text', "{touren:[{id:'X',lkw:'L01',fahrer:'F01',geraet:'G01',ort:'du',art:'Abholung',start:'420'}], sped:[], nr:1, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1,arbeitstage:1}}"),
        ('Kombi mit falschem Ort', "{touren:[{id:'X',lkw:'L05',fahrer:'F06',geraet:'G07',ort:'ds',art:'Auslieferung',start:600,kombi:{geraet:'G01',ort:'zz'}}], sped:[], nr:1, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1,arbeitstage:1}}"),
        ('ID mit Exponent', "{touren:[{id:'T1e309',lkw:'L01',fahrer:'F09',geraet:'G12',ort:'du',art:'Abholung',start:600}], sped:[], nr:1, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1,arbeitstage:1}}"),
        ('Spedition mit Kombi-Feld', "{touren:[], sped:[{id:'S9',geraet:'G01',ort:'du',art:'Auslieferung',start:600,grund:'x',kombi:{geraet:'G01',ort:'zz'}}], nr:1, kosten:{fahrerStunde:1,spedKm:1,spedGrund:1,schwerFaktor:1,arbeitstage:1}}"),
    ]:
        pg.evaluate(f"localStorage.setItem('{SPEICHER}', JSON.stringify({roh}))")
        pg.reload(); pg.wait_for_timeout(1500)
        pruefe(f'{name}: Beispieldaten statt Absturz', pg.locator('.tz[data-tour]').count() == 13)

    # Zähler hinter vorhandene IDs, Alternativen nicht doppelt vergeben
    pg.evaluate(f"""localStorage.setItem('{SPEICHER}', JSON.stringify({{touren:[{{id:'T101',lkw:'L01',fahrer:'F09',geraet:'G12',ort:'du',art:'Abholung',start:600}}], sped:[], nr:100,
        kosten:{{fahrerStunde:38,spedKm:2.4,spedGrund:140,schwerFaktor:2.5,arbeitstage:21}}}}))""")
    pg.reload(); pg.wait_for_timeout(1500)
    pruefe('ID-Zähler hinter T101', pg.evaluate('stand.nr') >= 101)
    doppelt = pg.evaluate("""(() => {
        stand.sped = [1,2,3].map(i => ({id:'SX'+i, geraet:'G09', ort:'du', art:'Auslieferung', start:600, spedition:'x', grund:'x'}));
        const einzeln = stand.sped.filter(interneAlternative).length;
        const zugeteilt = [...alternativenZuweisen().values()].filter(Boolean);
        return {einzeln, zugeteilt: zugeteilt.length, lkw: new Set(zugeteilt.map(a => a.lkw.id)).size, touren: stand.touren.length};
    })()""")
    pruefe(f"Alternativen konfliktfrei ({doppelt})", doppelt['einzeln'] == 3 and doppelt['zugeteilt'] == doppelt['lkw'] < 3 and doppelt['touren'] == 1)
    ce_frei = pg.evaluate("""(() => {
        stand.touren = [];
        stand.sped = [1,2,3].map(i => ({id:'S'+(90+i), geraet:'G01', ort:'du', art:'Auslieferung', start:600, spedition:'x', grund:'x'}))
          .concat([{id:'S99', geraet:'G09', ort:'du', art:'Auslieferung', start:600, spedition:'x', grund:'x'}]);
        return !!alternativenZuweisen().get('S99');
    })()""")
    pruefe('Kleine Lkw verbrauchen keine CE-Fahrer', ce_frei)

    # Tourenliste nur in der Ansicht „Touren“
    pg.goto(seite); pg.wait_for_timeout(1500)
    ansicht(pg, 'hof', 800)
    pruefe('Liste im Hof ausgeblendet, Hof nutzt volle Breite', pg.locator('.liste-panel').is_hidden()
           and pg.evaluate("document.querySelector('#v-hof').getBoundingClientRect().left < document.querySelector('.kopf').getBoundingClientRect().left + 5"))
    ansicht(pg, 'dashboard', 800)
    pruefe('Liste in „Touren“ sichtbar', pg.locator('.liste-panel').is_visible())

    # iPad hochkant: Seitenleiste bleibt, Liste neben der Karte, nichts ragt heraus
    ipad = b.new_page(viewport={'width': 820, 'height': 1180}, has_touch=True)
    ipad.goto(seite); ipad.wait_for_timeout(4000)
    lage = ipad.evaluate("""(() => { const n = document.querySelector('.icons').getBoundingClientRect(), l = document.querySelector('.liste-panel').getBoundingClientRect(),
        k = document.querySelector('#kartenpanel').getBoundingClientRect(), h = document.querySelector('.kopf').getBoundingClientRect();
        return {seitenleiste: n.height > 600 && n.width < 100, liste_links: l.right <= k.left + 1, kopf_oben: h.bottom <= l.top + 1, breite: document.documentElement.scrollWidth}; })()""")
    pruefe(f'iPad hochkant: Seitenleiste, Liste neben Karte ({lage})', lage['seitenleiste'] and lage['liste_links'] and lage['kopf_oben'] and lage['breite'] <= 820)
    ipad.screenshot(path=str(aus / 'ipad_hoch.png'))

    # Handy
    m = b.new_page(viewport={'width': 390, 'height': 844})
    m.on('pageerror', lambda e: fehler.append('Handy: ' + str(e)))
    m.goto(seite); m.wait_for_timeout(5000)
    for v in ['dashboard', 'plantafel', 'hof', 'ladeplan', 'kosten']:
        m.click(f'.icons [data-ansicht="{v}"]'); m.wait_for_timeout(1500)
        breite = m.evaluate('document.documentElement.scrollWidth')
        pruefe(f'Handy {v}: keine Seitenquerrollen ({breite}px)', breite <= 390)
        m.screenshot(path=str(aus / f'handy_{v}.png'), full_page=True)
    b.close()

for n, ok in ergebnisse:
    print(('OK   ' if ok else 'FEHL ') + n)
print(f"{sum(ok for _, ok in ergebnisse)}/{len(ergebnisse)} grün")
print('Konsolenfehler:', fehler or 'keine')
