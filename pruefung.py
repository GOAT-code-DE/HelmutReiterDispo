"""Prüfskript der Klick-Demo. Aufruf: python pruefung.py index.html <ausgabeordner>
Nutzt den installierten Edge (Playwright ohne eigenen Chromium). 3D-Karte, Hofansicht und Routen brauchen Internet.
Warnungen „Expected value to be of type number, but found null" stammen vom Kartenstil Positron selbst und zählen nicht."""
import sys, pathlib
from playwright.sync_api import sync_playwright

seite = pathlib.Path(sys.argv[1]).resolve().as_uri()
aus = pathlib.Path(sys.argv[2])
aus.mkdir(exist_ok=True)
SPEICHER = 'reiter-dispo-demo-v3'
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
    pg.goto(seite); pg.wait_for_function('m3Bereit', timeout=20000)  # Kartenstil fertig laden, sonst bricht der Reload ihn ab
    pg.evaluate("localStorage.clear()"); pg.reload(); pg.wait_for_timeout(8000)

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
    karte = pg.locator('#kombi-liste .sparzeile', has_text='Düsseldorf + Krefeld')
    pruefe('Kosten: Kombi Düsseldorf + Krefeld vorgeschlagen', karte.count() == 1)
    satz = pg.inner_text('#kosten-satz')
    pruefe(f'Kosten: Tag in einem Satz ({satz[:60]}…)', 'eigene Touren rund' in satz and 'Speditionsaufträge' in satz and 'im Monat' in satz)
    vor = pg.evaluate('stand.sped.length')
    vor_t = pg.evaluate('stand.touren.length')
    pg.locator('#sped-vorschlaege [data-selbst]').first.click(); pg.wait_for_timeout(400)
    pruefe('Kosten: „Selbst fahren“ macht aus der Spedition eine eigene Tour', pg.evaluate('stand.sped.length') == vor - 1 and pg.evaluate('stand.touren.length') == vor_t + 1
           and pg.get_attribute('.icons [data-ansicht="kosten"]', 'aria-selected') == 'true')
    pg.screenshot(path=str(aus / 'kosten.png'), full_page=True)
    karte.locator('button').click(); pg.wait_for_timeout(300)
    pruefe('Kombi übernommen: eine Tour weniger', pg.evaluate('stand.touren.length') == vor_t)
    ansicht(pg, 'plantafel')
    pruefe('Kombi-Block in der Plantafel', pg.locator('.block[data-kombi="ja"]').count() == 1)
    ansicht(pg, 'kosten')
    pg.click('#v-kosten details summary')
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
    pg.evaluate(f"""localStorage.setItem('{SPEICHER}', JSON.stringify({{alleTouren:[{{id:'T101',tag:'2026-10-06',lkw:'L01',fahrer:'F09',geraet:'G12',ort:'du',art:'Abholung',start:600}}], alleSped:[], nr:100,
        kosten:{{fahrerStunde:38,spedKm:2.4,spedGrund:140,schwerFaktor:2.5,arbeitstage:21}}}}))""")
    pg.reload(); pg.wait_for_timeout(1500)
    pruefe('ID-Zähler hinter T101 (gültiger Speicher übernommen)', pg.evaluate('stand.nr') == 101 and pg.evaluate('stand.touren.length') == 1)
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

    # Tablet: jede Ansicht in drei iPad-Größen auf Überlappung, Überstand, Fingergröße und passende Kopfzeile prüfen
    MIT_ZEIT, MIT_NEU = {'dashboard', 'plantafel', 'hof'}, {'dashboard', 'plantafel'}
    LAYOUT_JS = """(() => {
      const sichtbar = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[hidden], dialog:not([open])'); };
      const dialog = document.querySelector('dialog[open]');               // offener Dialog: nur dessen Inhalt zählt
      const elemente = [...(dialog || document).querySelectorAll('button, select, input, textarea, summary')].filter(sichtbar)
        .filter((e) => !e.closest('.uhrzeiten, .touren, .icons, .tafel-rahmen, .tab-rahmen, .maplibregl-ctrl')); // Scrollbereiche und Kartenbibliothek ausgenommen
      const boxen = elemente.map((e) => ({ e, r: e.getBoundingClientRect() }));
      const name = (e) => (e.id || e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 30);
      const ueberlappt = [];
      for (let i = 0; i < boxen.length; i++) for (let j = i + 1; j < boxen.length; j++) {
        const a = boxen[i], b = boxen[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 2 && y > 2) ueberlappt.push(name(a.e) + ' / ' + name(b.e));
      }
      const zuKlein = boxen.filter((b) => !(b.e.tagName === 'INPUT' && b.e.type === 'range')).filter((b) => b.r.height < 28 && b.r.width < 28).map((b) => name(b.e));
      const raus = boxen.filter((b) => b.r.right > innerWidth + 1 || b.r.left < -1).map((b) => name(b.e));
      return { ueberlappt, zuKlein, raus, breite: document.documentElement.scrollWidth,
        zeit: !!document.querySelector('.zeitleiste').offsetParent, neu: !!document.querySelector('#neu-knopf').offsetParent,
        leerText: /\\b(null|undefined|NaN)\\b|\\[object/.test((dialog || document.body).innerText) };
    })()"""
    for (tw, th) in [(1180, 820), (820, 1180), (1366, 1024)]:
        t = b.new_page(viewport={'width': tw, 'height': th}, has_touch=True)
        t.on('pageerror', lambda e: fehler.append(f'Tablet: {e}'))
        t.goto(seite); t.wait_for_timeout(3500)
        for v in ['dashboard', 'plantafel', 'hof', 'ladeplan', 'spedition', 'kosten', 'fuhrpark']:
            t.click(f'.icons [data-ansicht="{v}"]'); t.wait_for_timeout(900)
            z = t.evaluate(LAYOUT_JS)
            pruefe(f'Tablet {tw}x{th} {v}: nichts überlappt oder ragt heraus {z["ueberlappt"][:3]}{z["raus"][:3]}', not z['ueberlappt'] and not z['raus'] and z['breite'] <= tw)
            pruefe(f'Tablet {tw}x{th} {v}: Knöpfe fingergroß {z["zuKlein"][:3]}', not z['zuKlein'])
            pruefe(f'Tablet {tw}x{th} {v}: kein null/undefined im Text', not z['leerText'])
            pruefe(f'Tablet {tw}x{th} {v}: Kopfzeile passend (Zeit {z["zeit"]}, Neu {z["neu"]})', z['zeit'] == (v in MIT_ZEIT) and z['neu'] == (v in MIT_NEU))
        t.click('.icons [data-ansicht="dashboard"]'); t.wait_for_timeout(500)
        for dialog in ['neu', 'tour']:
            if dialog == 'tour':
                t.click('.tz[data-tour="T04"]'); t.wait_for_timeout(600); t.click('#tour-detail .knopf.zweit'); t.wait_for_timeout(400)
            else:
                t.click('#neu-knopf'); t.wait_for_timeout(400)
            z = t.evaluate(LAYOUT_JS)
            pruefe(f'Tablet {tw}x{th} Dialog {dialog}: nichts überlappt {z["ueberlappt"][:3]}{z["raus"][:3]}', not z['ueberlappt'] and not z['raus'])
            pruefe(f'Tablet {tw}x{th} Dialog {dialog}: kein null/undefined im Text', not z['leerText'])
            t.screenshot(path=str(aus / f'tablet_{tw}_dialog_{dialog}.png'))
            t.keyboard.press('Escape'); t.wait_for_timeout(300)
        t.close()

    # Planung über Tage: Datum wechseln, in drei Wochen einplanen, Woche und Monat
    pg.evaluate('localStorage.clear()'); pg.goto(seite); pg.wait_for_timeout(2500)
    pg.click('#tag-vor'); pg.wait_for_timeout(500)
    pruefe('Datum vor: Liste zeigt den nächsten Tag', 'Mi 07.10.' in pg.inner_text('#touren-titel') and pg.locator('.tz[data-tour]').count() > 0
           and pg.locator('#gruppe-unterwegs .tz').count() == 0)
    pg.click('#tag-heute'); pg.wait_for_timeout(500)
    pruefe('Heute: wieder 13 Touren', pg.locator('.tz[data-tour]').count() == 13)
    pg.click('#neu-knopf'); pg.wait_for_timeout(300)
    pg.fill('#f-tag', '2026-10-27'); pg.dispatch_event('#f-tag', 'change'); pg.wait_for_timeout(300)
    frei_spaeter = pg.locator('#f-kandidaten .kandidat').count()
    pruefe(f'In drei Wochen: Prüfung für diesen Tag ({frei_spaeter} Lkw frei)', frei_spaeter >= 2 and 'Dienstag, 27. Oktober' in pg.inner_text('#f-info'))
    pg.locator('#f-kandidaten .kandidat').first.locator('[data-einplanen]').click(); pg.wait_for_timeout(800)
    pruefe('Nach dem Einplanen: Ansicht springt auf den 27.10.', pg.input_value('#datum-eingabe') == '2026-10-27' and 'Hamm' in pg.inner_text('#tour-liste'))
    pg.reload(); pg.wait_for_timeout(2000)
    pruefe('Künftige Tour bleibt nach Neuladen erhalten', pg.evaluate("stand.alleTouren.some(t => t.tag === '2026-10-27' && t.ort === 'ha')"))
    pg.click('.icons [data-ansicht="plantafel"]'); pg.wait_for_timeout(400)
    pg.click('.plan-reiter [data-plan="woche"]'); pg.wait_for_timeout(400)
    pruefe('Woche: 6 Tagesspalten, Touren als Einträge', pg.locator('.woche th').count() == 7 and pg.locator('.woche .wchip').count() > 10)
    pruefe('Woche: Uhrzeit-Leiste ausgeblendet', not pg.locator('.zeitleiste').is_visible())
    pg.locator('.woche .wchip').first.click(); pg.wait_for_timeout(800)
    pruefe('Klick in der Woche öffnet die Tour in „Touren“', pg.get_attribute('.icons [data-ansicht="dashboard"]', 'aria-selected') == 'true' and pg.locator('.tz.aktiv').count() == 1)
    pg.click('.icons [data-ansicht="plantafel"]'); pg.click('.plan-reiter [data-plan="monat"]'); pg.wait_for_timeout(400)
    pruefe('Monat: Kalender mit Tagen', pg.locator('.monat .mtag').count() >= 28)
    pg.locator('.mtag[data-tag="2026-10-14"]').click(); pg.wait_for_timeout(400)
    pruefe('Klick im Monat öffnet den Tag', pg.input_value('#datum-eingabe') == '2026-10-14' and pg.get_attribute('.plan-reiter [data-plan="tag"]', 'aria-selected') == 'true')
    pruefe('Erzeugte Touren anderer Tage auf Viertelstunden', pg.evaluate("stand.alleTouren.filter(t => t.tag !== '2026-10-06').every(t => t.start % 15 === 0)"))
    pruefe('Vergangene Tage gelten als erledigt', pg.evaluate("stand.alleTouren.filter(t => t.tag < '2026-10-06').every(t => status(t) === 'erledigt')"))
    pruefe('Belegung je Tag getrennt: anderer Tag stört heute nicht', pg.evaluate("(() => { const t = stand.alleTouren.find(x => x.tag === '2026-10-27' && x.ort === 'ha'); return lkwFrei(t.lkw, t.start, t.start + 10, [], '2026-10-06') || stand.alleTouren.some(x => x.tag === '2026-10-06' && x.lkw === t.lkw && x.start < t.start + 10 && t.start < ende(x)); })()"))
    pg.click('#tag-heute'); pg.wait_for_timeout(300)

    # Nachweise zu den Codex-Funden
    passt = pg.evaluate("""GERAETE.every(g => { const m = geraetKoerper(g); m.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m);
        return b.max.y <= g.h + 0.001 && b.max.x - b.min.x <= g.l + 0.001 && b.max.z - b.min.z <= g.b + 0.001; })""")
    pruefe('Modelle liegen innerhalb ihrer Transportmaße', passt)
    ansicht(pg, 'hof', 1500)
    stapler_ok = pg.evaluate("""(() => { const a = hofPlaene().auftraege; return [0, 1].every(k => { const x = a.filter(y => y.stapler === k).sort((p, q) => p.von - q.von);
        return x.every((y, i) => i === 0 || y.von >= x[i - 1].bis); }); })()""")
    pruefe('Stapler nie doppelt belegt', stapler_ok)
    rampen_ok = pg.evaluate("""(() => { const e = [...rampenPlan().values()]; return RAMPEN.every((_, r) => {
        const x = e.filter(y => y.rampe === r).sort((p, q) => p.beginn - q.beginn); return x.every((y, i) => i === 0 || y.beginn >= x[i - 1].ende); }); })()""")
    pruefe('Rampe erst frei, wenn der Stapler fertig ist', rampen_ok)
    warte_ok = pg.evaluate("""(() => { const z0 = zeit, plan = rampenPlan(); let ok = true;
        for (const a of hofPlaene().auftraege) { const r = plan.get(`${a.t.id}|${a.phase.von}`);
          for (let m = a.phase.bis; m < a.bis; m += 1) { zeit = m; const zst = lkwZustaende()[a.l.id];
            if (m < r.beginn ? zst.rampe !== undefined || zst.warteplatz === undefined : zst.rampe !== r.rampe) ok = false; } }
        zeit = z0; return ok; })()""")
    pruefe('Verspäteter Lkw: wartend in der Schlange, sonst an seiner Rampe', warte_ok)
    verz = pg.evaluate("""(() => { const t = stand.touren.find(x => x.id === 'T05'), a = hofPlaene().auftraege.find(x => x.t.id === 'T05' && x.art === 'laden');
        const fp = hofPlaene().fahrplaene.L08, pose = lkwPose(fp, a.bis - 1), z0 = zeit;
        zeit = a.bis - 1; const zst = lkwZustaende().L08; zeit = z0;
        return { verspaetet: a.bis > t.start + 30, amDock: Math.abs(pose.x - RAMPEN[a.rampe].x) < 0.5, tabelle: zst.rampe === a.rampe }; })()""")
    pruefe(f'Verspätung durch Rampen-Engpass überall gleich ({verz})', all(verz.values()))
    ansicht(pg, 'dashboard', 600)
    pg.click('#tag-vor'); pg.wait_for_timeout(300)
    pruefe('Anderer Tag: Uhrzeit ausgeblendet, keine laufenden Abschnitte', not pg.locator('.zeitleiste').is_visible() and pg.evaluate('stand.touren.every(t => !phaseUm(t))'))
    pg.click('#tag-heute'); pg.wait_for_timeout(300)
    pruefe('Heute: Uhrzeit wieder sichtbar', pg.locator('.zeitleiste').is_visible())

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
