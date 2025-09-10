# Installation & Einrichtung – Tribal Wars Market Bot

Willkommen! Diese Anleitung führt dich Schritt für Schritt durch die Installation, Konfiguration und den sicheren Betrieb des **Tribal Wars Market Bots**.

---

## 1. Voraussetzungen

| Komponente        | Empfohlene Version                 | Hinweise                                                             |
|-------------------|------------------------------------|----------------------------------------------------------------------|
| Browser           | Chrome / Edge / Firefox (aktuell)  | Andere Chromium-basierte Browser funktionieren meist ebenfalls.      |
| Userscript-Manager| **Tampermonkey** (Chrome / Edge) • **Violentmonkey** (Firefox) | Lade die Erweiterung aus dem offiziellen Store deines Browsers.      |
| Spielkonto        | Tribal Wars-Testserver             | Der Bot verletzt die Regeln vieler Live-Welten. Nur in Testumgebungen verwenden. |

---

## 2. Installation des Hauptscripts

1. Öffne deinen Browser, in dem Tampermonkey installiert ist.  
2. Navigiere zu:  
   `https://raw.githubusercontent.com/…/tribal-wars-market-bot.user.js`  
   *(URL an dein Repository anpassen)*  
3. Tampermonkey zeigt eine Vorschau an. Klicke **Installieren**.  
4. Lade eine Tribal-Wars-Seite neu. Unten rechts sollte nun ein kleines 💰-Panel erscheinen.

---

## 3. Optionale Erweiterung – Market Extensions

Erweitert den Bot um:

* intelligente Navigations- & Handelsroutinen  
* menschliche Maus-/Scroll-Simulation  
* fortschrittliche Trend-Analysen

**Installation**

1. Lade `tribal-wars-market-extensions.js` herunter.  
2. Öffne dein Bot-Script in Tampermonkey → **Bearbeiten**.  
3. Füge oberhalb von `// ==/UserScript==` ein:  
   `// @require file://C:/Pfad/tribal-wars-market-extensions.js`  
   *(Pfad anpassen)*  
4. Speichern, Seite neu laden – Log zeigt „Extensions loaded“.

---

## 4. Weltspezifische Einstellungen

1. Bot-Panel öffnen → **Einstellungen**.  
2. Passe *Max. / Min. Ressourcen* an die Welt-Lagergrößen an.  
3. „Ressourcen ausbalancieren“ aktivieren, wenn gewünscht.  
4. Speichern – Werte werden lokal gesichert.

---

## 5. Anti-Detection-Tipps

* Standard-Limits für **max. 12 Aktionen / Session** einhalten.  
* Realistische Pausen (15-45 min) nie verkürzen.  
* Bot nur laufen lassen, wenn du parallel spielst (passives Crawling).  
* Keine festen Zeitpläne – Randomisierung beibehalten.  
* Welt nicht sekündlich wechseln, jeder Reload erzeugt zusätzliche Requests.

---

## 6. Erste Schritte

1. **Aktivieren**: Toggle im Panel einschalten.  
2. **Beobachten**: 5-10 Minuten laufen lassen, Log prüfen.  
3. **Feintuning**:  
   • *Min. Gewinn (%)* anpassen.  
   • Ressourcenvorrang im Quellcode (Priority) ändern, falls nötig.  
4. **Session-Grenze**: Bei 12/12 pausiert der Bot automatisch und setzt dann eine Pause.

---

## 7. Fehlerbehebung

| Symptom                                   | Ursache                          | Lösung                                   |
|-------------------------------------------|----------------------------------|------------------------------------------|
| Panel wird nicht angezeigt                | Userscript deaktiviert           | Tampermonkey-Icon prüfen, Script aktivieren |
| „Navigation zum Marktplatz fehlgeschlagen“| Markt-Icon nicht gefunden        | Einmal manuell Marktplatz öffnen         |
| Keine Trades trotz Ressourcen             | Gewinnschwelle zu hoch           | *Min. Gewinn (%)* reduzieren             |
| „Not enough merchants“                    | Händler unterwegs                | Rückkehr abwarten, Händlerzahl erhöhen   |
| JS-Fehler im Log                          | Welt-Layout abweichend           | HTML-Snippet & URL an Entwickler senden  |

---

## 8. Sicherheitshinweise

* **Nur Testserver!** Live-Accounts können gebannt werden.  
* Code nicht ungeprüft in Foren posten.  
* Skripte stets auf versteckte Änderungen prüfen.  
* Passwörter werden nicht gespeichert, aber Browser-Sitzungen bleiben offen.  
* Halte Browser & Tampermonkey aktuell.

---

Viel Erfolg beim ressourceneffizienten Handeln und frohes Testen!  
Feedback & Updates: GitHub-Projekt besuchen.  
