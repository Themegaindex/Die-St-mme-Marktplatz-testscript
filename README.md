# 💰 Tribal Wars Market Bot

Ein smarter, traffic-optimierter **Marktplatz-Assistent** für *Die Stämme / Tribal Wars*.  
Der Bot automatisiert Einkäufe und Verkäufe, balanciert deine Ressourcen aus und schützt dich gleichzeitig mit ausgefeilten Anti-Detection-Mechanismen vor Auffälligkeiten.

---

## 🏆 Features – Kurz & knapp
| | Feature |
|---|---|
|⚡|Passives Crawling – nutzt vorhandene Seiten-Loads, **keine Extra-Requests**|
|🧠|Intelligente Handelsalgorithmen mit Trend-Analyse & 9 Strategien|
|📊|GUI-Dashboard in-game: Live-Ressourcen, Marktpreise, Log|
|🤖|Human-Behaviour-Simulation (Maus, Scroll, Tipp-Delay)|
|⏱️|Randomisierte Pausen & Session-Limits (Standard 12 Aktionen)|
|💾|Lokale Preis- & Statistik-Historie (bis 100 Datenpunkte)|
|🛡️|Umfangreiche Anti-Detection-Schutzschicht|
|🔧|Einfach anpassbare Konfiguration über UI oder Code|
|🌍|Multi-Welt-Support (alle *.die-staemme.* & internationale Domains)|

---

## 🚀 Installation

Die komplette Schritt-für-Schritt-Anleitung findest du in  
[`installation-anleitung.md`](installation-anleitung.md).

Kurzfassung:

1. Tampermonkey installieren  
2. `tribal-wars-market-bot.user.js` öffnen → **Installieren**  
3. (Optional) Erweiterungs-Script `tribal-wars-market-extensions.js` via `@require` einbinden  
4. Seite neu laden – 💰 erscheint unten rechts

---

## 🖼️ Screenshots / Demo

> *Platzhalter*  
> Hier folgen GIFs oder PNGs deines Dashboards und eines automatischen Handels.

```
/assets/screenshot-dashboard.png
/assets/demo-trade.gif
```

---

## ⚙️ Konfiguration

Alle wichtigen Einstellungen findest du im Bot-Panel unter **Einstellungen**:

| Einstellung | Zweck | Standard |
|-------------|-------|----------|
|Min. Gewinn %|Mindestmarge für Handelsausführung|15 %|
|Max. Ressourcen|Oberes Lager-Limit pro Rohstoff|25 000|
|Min. Ressourcen|Unteres Lager-Limit|5 000|
|Ressourcen ausbalancieren|Überschüsse ↔ Defizite tauschen|Aktiv|
|Debug-Modus|Verbose-Logging|Aus|

Änderungen werden lokal via *GM_setValue* gespeichert.

---

## 🕵️ Anti-Detection Features

1. **Passives Daten-Parsing** – Bot liest nur, wenn du ohnehin surfst  
2. **Random Delays** – jede Aktion in zufälligen Intervallen  
3. **Session-Throttle** – max. 12 Aktionen, danach 15-45 min Pause  
4. **Menschliche Eingaben** – Mauswege, Click-Jitter, Tipp-Verzögerungen  
5. **Batch-Trading** – mehrere Trades in einer Navigation, spart Requests

---

## 🔒 Sicherheitshinweise

* Verwende den Bot **nur auf Testservern / privaten Welten** – Live-Server bannen Bots.  
* Teile die Skripte nicht öffentlich ohne Code-Review.  
* Halte Browser & Tampermonkey aktuell.  
* Der Bot speichert **keine Passwörter**, aber offener Browser = offene Session.  

---

## 🐞 Bekannte Probleme

| Status | Beschreibung | Workaround |
|--------|--------------|-----------|
|⚠️|Seltene Fehlermeldung „Navigation zum Marktplatz fehlgeschlagen“|Marktplatz einmal manuell öffnen|
|⚠️|GUI wird von Ad-Blockern versteckt|Bot-Domain auf Whitelist setzen|
|⏳|Welt-Layouts mit Custom-Skins|Bitte HTML-Snippet melden|

---

## 🤝 Beitragen

Pull-Requests & Issues sind willkommen!  
1. Fork & Branch (`feature/…`)  
2. Saubere Commits + aussagekräftige Messages  
3. PR gegen **main** stellen

Bitte halte dich an den [Conventional Commits](https://www.conventionalcommits.org/)-Standard.

---

## 📜 Lizenz

Released under the **MIT License** – siehe [`LICENSE`](LICENSE) für Details.
