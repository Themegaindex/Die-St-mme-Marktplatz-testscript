// ==UserScript==
// @name         Tribal Wars Market Bot
// @namespace    https://github.com/Themegaindex/Die-St-mme-Marktplatz-testscript
// @version      1.0.0
// @description  Intelligente Marktplatz-Automatisierung für Tribal Wars mit minimalen Anfragen
// @author       Themegaindex
// @match        *://*.die-staemme.de/*
// @match        *://*.tribalwars.net/*
// @match        *://*.tribalwars.com.pt/*
// @match        *://*.tribalwars.com.br/*
// @match        *://*.triburile.ro/*
// @match        *://*.voyna-plemyon.ru/*
// @match        *://*.fyletikesmaxes.gr/*
// @match        *://*.tribalwars.nl/*
// @match        *://*.tribalwars.no.com/*
// @match        *://*.divoke-kmeny.cz/*
// @match        *://*.tribalwars.dk/*
// @match        *://*.klanhaboru.hu/*
// @match        *://*.tribals.it/*
// @match        *://*.tribalwars.se/*
// @match        *://*.triburi.ro/*
// @match        *://*.plemena.net/*
// @match        *://*.tribalwars.ae/*
// @match        *://*.tribalwars.works/*
// -------------------------------------------------------------------------
//  OPTIONAL ADVANCED FEATURES
// -------------------------------------------------------------------------
//  Um die erweiterten Handels- und Anti-Detection-Funktionen zu aktivieren,
//  entferne einfach die Kommentarzeichen in der folgenden Zeile. Tampermonkey
//  lädt dann automatisch das Erweiterungs-Script von GitHub.
//
//  Hinweis:  Bei lokalen Tests kannst du stattdessen eine lokale Datei
//            verwenden, z. B.  // @require file://C:/Pfad/zu/tribal-wars-market-extensions.js
//
// @require     https://raw.githubusercontent.com/Themegaindex/Die-St-mme-Marktplatz-testscript/main/tribal-wars-market-extensions.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // KONFIGURATION
    // -------------------------------------------------------------------------
    const CONFIG = {
        // Allgemeine Einstellungen
        enabled: true,                 // Bot aktiviert
        debugMode: false,              // Debug-Modus (mehr Logs)
        
        // Anti-Detection Einstellungen
        minActionDelay: 1500,          // Minimale Verzögerung zwischen Aktionen (ms)
        maxActionDelay: 4500,          // Maximale Verzögerung zwischen Aktionen (ms)
        minSessionPause: 15,           // Minimale Pause zwischen Sessions (Minuten)
        maxSessionPause: 45,           // Maximale Pause zwischen Sessions (Minuten)
        maxActionsPerSession: 12,      // Maximale Aktionen pro Session
        humanPatterns: true,           // Menschliche Verhaltensmuster simulieren
        
        // Marktplatz Einstellungen
        minProfitPercentage: 15,       // Minimaler Gewinn in Prozent für Handel
        maxResourceStock: 25000,       // Maximaler Ressourcenbestand pro Typ
        minResourceStock: 5000,        // Minimaler Ressourcenbestand pro Typ
        balanceResources: true,        // Ressourcen ausbalancieren
        
        // Ressourcen Prioritäten (1-10, höher = wichtiger)
        resourcePriority: {
            wood: 5,
            stone: 5,
            iron: 5
        },
        
        // Dorf-spezifische Einstellungen
        villageSettings: {}            // Wird dynamisch gefüllt
    };

    // -------------------------------------------------------------------------
    // DATENSTRUKTUREN
    // -------------------------------------------------------------------------
    
    // Marktdaten Cache
    const marketCache = {
        offers: [],                    // Aktuelle Marktangebote
        lastUpdate: 0,                 // Zeitpunkt der letzten Aktualisierung
        priceHistory: {                // Historische Preisdaten
            wood: [],
            stone: [],
            iron: []
        },
        bestPrices: {                  // Beste aktuelle Preise
            buy: {
                wood: 0,
                stone: 0,
                iron: 0
            },
            sell: {
                wood: 0,
                stone: 0,
                iron: 0
            }
        }
    };
    
    // Dorf-Daten Cache
    const villageCache = {
        resources: {                   // Aktuelle Ressourcen
            wood: 0,
            stone: 0,
            iron: 0
        },
        storage: 0,                    // Lagerkapazität
        merchantsAvailable: 0,         // Verfügbare Händler
        merchantsTotal: 0,             // Gesamtzahl Händler
        lastUpdate: 0                  // Zeitpunkt der letzten Aktualisierung
    };
    
    // Statistik und Protokollierung
    const stats = {
        tradesCompleted: 0,            // Abgeschlossene Handelsaktionen
        resourcesTraded: {             // Gehandelte Ressourcen
            wood: 0,
            stone: 0,
            iron: 0
        },
        profitGenerated: 0,            // Generierter Gewinn
        lastAction: 0,                 // Zeitpunkt der letzten Aktion
        sessionActions: 0,             // Aktionen in der aktuellen Session
        errors: []                     // Aufgetretene Fehler
    };
    
    // UI-Status
    const uiState = {
        activeSection: null,           // Aktuell aktive Sektion (settings, stats, etc.)
        isMinimized: false             // Ist das UI minimiert?
    };
    
    // -------------------------------------------------------------------------
    // ERWEITERUNGS-BRIDGE (optional)
    // -------------------------------------------------------------------------
    /*  Wenn das separate Extension-Script in die Seite geladen wurde (z. B. durch
        Verkettung beider Dateien in einem Userscript oder manuelles Einfügen),
        liegen sämtliche erweiterten Funktionen unter window.twMarketExtensions.
        Diese Bridge stellt sie bequem unter EXT bereit und prüft auf Existenz,
        sodass das Haupt-Script auch allein funktionsfähig bleibt.              */

    const EXT = (typeof window !== 'undefined' && window.twMarketExtensions) ? window.twMarketExtensions : {};

    // Fallback-Implementierung von randomWait, falls EXT kein randomWait hat
    async function randomWait(min, max) {
        const delay = randomDelay(min, max);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    // -------------------------------------------------------------------------
    // HILFSFUNKTIONEN
    // -------------------------------------------------------------------------
    
    /**
     * Generiert eine zufällige Verzögerung zwischen min und max
     * @param {number} min - Minimale Verzögerung in ms
     * @param {number} max - Maximale Verzögerung in ms
     * @returns {number} - Zufällige Verzögerung in ms
     */
    function randomDelay(min, max) {
        // Fügt Varianz für natürlicheres Verhalten hinzu
        const variance = Math.random() * 0.3 + 0.85; // 0.85 - 1.15
        const base = Math.floor(Math.random() * (max - min + 1) + min);
        return Math.floor(base * variance);
    }
    
    /**
     * Führt eine Aktion mit zufälliger Verzögerung aus
     * @param {Function} action - Auszuführende Funktion
     * @returns {Promise} - Promise, das nach der Ausführung aufgelöst wird
     */
    function delayedAction(action) {
        return new Promise((resolve, reject) => {
            const delay = randomDelay(CONFIG.minActionDelay, CONFIG.maxActionDelay);
            
            // Human-like Verhalten: Manchmal längere Pausen
            if (CONFIG.humanPatterns && Math.random() < 0.15) {
                const extraDelay = randomDelay(2000, 8000);
                log(`Zusätzliche Verzögerung: ${extraDelay}ms (menschliches Verhalten)`);
                setTimeout(() => {
                    try {
                        const result = action();
                        resolve(result);
                    } catch (error) {
                        logError("Fehler bei verzögerter Aktion", error);
                        reject(error);
                    }
                }, delay + extraDelay);
            } else {
                setTimeout(() => {
                    try {
                        const result = action();
                        resolve(result);
                    } catch (error) {
                        logError("Fehler bei verzögerter Aktion", error);
                        reject(error);
                    }
                }, delay);
            }
        });
    }
    
    /**
     * Speichert Daten persistent
     * @param {string} key - Schlüssel
     * @param {any} value - Zu speichernder Wert
     */
    function saveData(key, value) {
        try {
            GM_setValue(key, JSON.stringify(value));
        } catch (error) {
            logError("Fehler beim Speichern von Daten", error);
        }
    }
    
    /**
     * Lädt gespeicherte Daten
     * @param {string} key - Schlüssel
     * @param {any} defaultValue - Standardwert, falls keine Daten vorhanden
     * @returns {any} - Geladene Daten oder Standardwert
     */
    function loadData(key, defaultValue) {
        try {
            const data = GM_getValue(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (error) {
            logError("Fehler beim Laden von Daten", error);
            return defaultValue;
        }
    }
    
    /**
     * Protokolliert eine Nachricht, wenn Debug-Modus aktiviert ist
     * @param {string} message - Zu protokollierende Nachricht
     */
    function log(message) {
        if (CONFIG.debugMode) {
            console.log(`[TW Market Bot] ${message}`);
        }
        // Immer zum UI-Log hinzufügen, wenn es wichtig ist
        if (message.includes("Fehler") || message.includes("erfolgreich") || CONFIG.debugMode) {
            addToUILog(message);
        }
    }
    
    /**
     * Protokolliert einen Fehler
     * @param {string} message - Fehlermeldung
     * @param {Error} error - Fehler-Objekt
     */
    function logError(message, error) {
        console.error(`[TW Market Bot] ${message}:`, error);
        stats.errors.push({
            time: Date.now(),
            message: message,
            error: error.toString()
        });
        
        // Begrenze die Anzahl der gespeicherten Fehler
        if (stats.errors.length > 50) {
            stats.errors = stats.errors.slice(-50);
        }
        
        saveData('twMarketBotStats', stats);
        
        // Immer zum UI-Log hinzufügen
        addToUILog(`Fehler: ${message}`);
    }
    
    // -------------------------------------------------------------------------
    // MARKTPLATZ-FUNKTIONEN
    // -------------------------------------------------------------------------
    
    /**
     * Extrahiert Marktangebote von der aktuellen Seite
     * @returns {Array} - Extrahierte Marktangebote
     */
    function extractMarketOffers() {
        const offers = [];
        try {
            // Basierend auf der echten HTML-Struktur
            const offerTable = document.querySelector('table.vis:not(.modemenu)');
            if (!offerTable) {
                log("Keine Angebots-Tabelle gefunden");
                return offers;
            }
            
            const offerRows = offerTable.querySelectorAll('tr:not(:first-child)');
            
            offerRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 7) { // Mindestens 7 Spalten: Erhalte, Für, Spieler, Dauer, Verhältnis, Verfügbarkeit, Annehmen
                    // Extrahiere Angebotsdaten
                    const offer = {
                        id: '',
                        sellResource: '',
                        sellAmount: 0,
                        buyResource: '',
                        buyAmount: 0,
                        ratio: 0,
                        village: '',
                        distance: 0,
                        travelTime: '',
                        actionButton: null,
                        timestamp: Date.now()
                    };
                    
                    // ID aus dem Annehmen-Button extrahieren
                    const acceptForm = cells[6].querySelector('form.market_accept_offer');
                    if (acceptForm) {
                        const idInput = acceptForm.querySelector('input[name="id"]');
                        if (idInput) {
                            offer.id = idInput.value;
                        }
                    }
                    
                    // Verkaufsressource und -menge bestimmen (Erhalte)
                    if (cells[0].querySelector('.icon.header.wood')) {
                        offer.sellResource = 'wood';
                    } else if (cells[0].querySelector('.icon.header.stone')) {
                        offer.sellResource = 'stone';
                    } else if (cells[0].querySelector('.icon.header.iron')) {
                        offer.sellResource = 'iron';
                    }
                    
                    // Verkaufsmenge extrahieren
                    const sellText = cells[0].textContent.trim();
                    offer.sellAmount = parseInt(sellText.replace(/\D/g, '')) || 0;
                    
                    // Kaufressource und -menge bestimmen (Für)
                    if (cells[1].querySelector('.icon.header.wood')) {
                        offer.buyResource = 'wood';
                    } else if (cells[1].querySelector('.icon.header.stone')) {
                        offer.buyResource = 'stone';
                    } else if (cells[1].querySelector('.icon.header.iron')) {
                        offer.buyResource = 'iron';
                    }
                    
                    // Kaufmenge extrahieren
                    const buyText = cells[1].textContent.trim();
                    offer.buyAmount = parseInt(buyText.replace(/\D/g, '')) || 0;
                    
                    // Spieler-Information (optional)
                    if (cells[2]) {
                        offer.village = cells[2].textContent.trim();
                    }
                    
                    // Dauer extrahieren
                    if (cells[3]) {
                        offer.travelTime = cells[3].textContent.trim();
                        
                        // Dauer in Minuten umrechnen für Sortierung
                        const timeParts = offer.travelTime.split(':');
                        if (timeParts.length === 2) {
                            const hours = parseInt(timeParts[0]) || 0;
                            const minutes = parseInt(timeParts[1]) || 0;
                            offer.distance = hours * 60 + minutes;
                        }
                    }
                    
                    // Verhältnis extrahieren
                    if (cells[4]) {
                        // Das Verhältnis ist normalerweise 1, aber wir berechnen es selbst
                        if (offer.sellAmount > 0 && offer.buyAmount > 0) {
                            offer.ratio = offer.buyAmount / offer.sellAmount;
                        }
                    }
                    
                    // Verfügbarkeit extrahieren (optional)
                    if (cells[5]) {
                        const availabilityText = cells[5].textContent.trim();
                        const availabilityMatch = availabilityText.match(/(\d+)/);
                        if (availabilityMatch) {
                            offer.availability = parseInt(availabilityMatch[1]) || 1;
                        } else {
                            offer.availability = 1;
                        }
                    }
                    
                    // Annehmen-Button speichern
                    if (cells[6]) {
                        const acceptButton = cells[6].querySelector('input[type="submit"]');
                        if (acceptButton) {
                            offer.actionButton = acceptButton;
                        }
                        
                        // Formular speichern für spätere Interaktion
                        const form = cells[6].querySelector('form.market_accept_offer');
                        if (form) {
                            offer.acceptForm = form;
                        }
                    }
                    
                    // Nur gültige Angebote hinzufügen
                    if (offer.sellResource && offer.buyResource && offer.sellAmount > 0 && offer.buyAmount > 0) {
                        offers.push(offer);
                    }
                }
            });
            
            log(`${offers.length} Marktangebote extrahiert`);
        } catch (error) {
            logError("Fehler beim Extrahieren der Marktangebote", error);
        }
        return offers;
    }
    
    /**
     * Extrahiert Ressourcen und Händlerinformationen aus der aktuellen Seite
     */
    function extractVillageInfo() {
        try {
            // Ressourcen extrahieren
            const woodElement = document.getElementById('wood');
            const stoneElement = document.getElementById('stone');
            const ironElement = document.getElementById('iron');
            const storageElement = document.getElementById('storage');
            
            if (woodElement) villageCache.resources.wood = parseInt(woodElement.textContent.trim().replace(/\D/g, '')) || 0;
            if (stoneElement) villageCache.resources.stone = parseInt(stoneElement.textContent.trim().replace(/\D/g, '')) || 0;
            if (ironElement) villageCache.resources.iron = parseInt(ironElement.textContent.trim().replace(/\D/g, '')) || 0;
            if (storageElement) villageCache.storage = parseInt(storageElement.textContent.trim().replace(/\D/g, '')) || 0;
            
            // Händler extrahieren aus den span-Elementen
            const merchantAvailable = document.getElementById('market_merchant_available_count');
            const merchantTotal = document.getElementById('market_merchant_total_count');
            const merchantMaxTransport = document.getElementById('market_merchant_max_transport');
            
            if (merchantAvailable) {
                villageCache.merchantsAvailable = parseInt(merchantAvailable.textContent.trim()) || 0;
            }
            
            if (merchantTotal) {
                villageCache.merchantsTotal = parseInt(merchantTotal.textContent.trim()) || 0;
            }
            
            if (merchantMaxTransport) {
                villageCache.merchantMaxTransport = parseInt(merchantMaxTransport.textContent.trim()) || 0;
            }
            
            // Fallback für ältere Versionen
            if (!merchantAvailable || !merchantTotal) {
                const merchantInfo = document.querySelector('#market_status_bar');
                if (merchantInfo) {
                    const merchantText = merchantInfo.textContent;
                    const matches = merchantText.match(/(\d+)\/(\d+)/);
                    if (matches && matches.length >= 3) {
                        villageCache.merchantsAvailable = parseInt(matches[1]) || 0;
                        villageCache.merchantsTotal = parseInt(matches[2]) || 0;
                    }
                }
            }
            
            villageCache.lastUpdate = Date.now();
            log("Dorf-Informationen aktualisiert");
        } catch (error) {
            logError("Fehler beim Extrahieren der Dorf-Informationen", error);
        }
    }
    
    /**
     * Aktualisiert den Marktdaten-Cache
     */
    function updateMarketCache() {
        try {
            const currentOffers = extractMarketOffers();
            if (currentOffers.length > 0) {
                marketCache.offers = currentOffers;
                marketCache.lastUpdate = Date.now();
                
                // Beste Preise berechnen
                calculateBestPrices();
                
                // Preishistorie aktualisieren
                updatePriceHistory();
                
                // Daten speichern
                saveData('twMarketBotMarketCache', marketCache);
                log("Marktdaten-Cache aktualisiert");
            }
        } catch (error) {
            logError("Fehler beim Aktualisieren des Marktdaten-Cache", error);
        }
    }
    
    /**
     * Berechnet die besten aktuellen Kauf- und Verkaufspreise
     */
    function calculateBestPrices() {
        // Zurücksetzen der besten Preise
        marketCache.bestPrices = {
            buy: { wood: 0, stone: 0, iron: 0 },
            sell: { wood: 0, stone: 0, iron: 0 }
        };
        
        // Durchlaufe alle Angebote
        marketCache.offers.forEach(offer => {
            // Kaufpreis (was andere verkaufen)
            const buyRatio = offer.sellAmount / offer.buyAmount;
            if (buyRatio > 0) {
                if (offer.sellResource === 'wood' && (marketCache.bestPrices.buy.wood === 0 || buyRatio > marketCache.bestPrices.buy.wood)) {
                    marketCache.bestPrices.buy.wood = buyRatio;
                } else if (offer.sellResource === 'stone' && (marketCache.bestPrices.buy.stone === 0 || buyRatio > marketCache.bestPrices.buy.stone)) {
                    marketCache.bestPrices.buy.stone = buyRatio;
                } else if (offer.sellResource === 'iron' && (marketCache.bestPrices.buy.iron === 0 || buyRatio > marketCache.bestPrices.buy.iron)) {
                    marketCache.bestPrices.buy.iron = buyRatio;
                }
            }
            
            // Verkaufspreis (was andere kaufen)
            const sellRatio = offer.buyAmount / offer.sellAmount;
            if (sellRatio > 0) {
                if (offer.buyResource === 'wood' && (marketCache.bestPrices.sell.wood === 0 || sellRatio > marketCache.bestPrices.sell.wood)) {
                    marketCache.bestPrices.sell.wood = sellRatio;
                } else if (offer.buyResource === 'stone' && (marketCache.bestPrices.sell.stone === 0 || sellRatio > marketCache.bestPrices.sell.stone)) {
                    marketCache.bestPrices.sell.stone = sellRatio;
                } else if (offer.buyResource === 'iron' && (marketCache.bestPrices.sell.iron === 0 || sellRatio > marketCache.bestPrices.sell.iron)) {
                    marketCache.bestPrices.sell.iron = sellRatio;
                }
            }
        });
        
        log("Beste Preise berechnet");
    }
    
    /**
     * Aktualisiert die Preishistorie
     */
    function updatePriceHistory() {
        const timestamp = Date.now();
        const maxHistoryLength = 100; // Maximale Anzahl an Datenpunkten
        
        // Füge aktuelle beste Preise zur Historie hinzu
        if (marketCache.bestPrices.sell.wood > 0) {
            marketCache.priceHistory.wood.push({
                time: timestamp,
                price: marketCache.bestPrices.sell.wood
            });
        }
        
        if (marketCache.bestPrices.sell.stone > 0) {
            marketCache.priceHistory.stone.push({
                time: timestamp,
                price: marketCache.bestPrices.sell.stone
            });
        }
        
        if (marketCache.bestPrices.sell.iron > 0) {
            marketCache.priceHistory.iron.push({
                time: timestamp,
                price: marketCache.bestPrices.sell.iron
            });
        }
        
        // Begrenze die Größe der Historie
        if (marketCache.priceHistory.wood.length > maxHistoryLength) {
            marketCache.priceHistory.wood = marketCache.priceHistory.wood.slice(-maxHistoryLength);
        }
        
        if (marketCache.priceHistory.stone.length > maxHistoryLength) {
            marketCache.priceHistory.stone = marketCache.priceHistory.stone.slice(-maxHistoryLength);
        }
        
        if (marketCache.priceHistory.iron.length > maxHistoryLength) {
            marketCache.priceHistory.iron = marketCache.priceHistory.iron.slice(-maxHistoryLength);
        }
        
        log("Preishistorie aktualisiert");
    }
    
    /**
     * Berechnet den Durchschnittspreis einer Ressource aus der Historie
     * @param {string} resource - Ressourcentyp (wood, stone, iron)
     * @param {number} days - Anzahl der Tage für die Berechnung
     * @returns {number} - Durchschnittspreis
     */
    function getAveragePriceFromHistory(resource, days = 1) {
        const history = marketCache.priceHistory[resource];
        if (!history || history.length === 0) return 0;
        
        const now = Date.now();
        const timeThreshold = now - (days * 24 * 60 * 60 * 1000);
        
        const relevantPrices = history.filter(entry => entry.time >= timeThreshold);
        if (relevantPrices.length === 0) return 0;
        
        const sum = relevantPrices.reduce((total, entry) => total + entry.price, 0);
        return sum / relevantPrices.length;
    }
    
    /**
     * Entscheidet, welche Ressourcen gehandelt werden sollen
     * @returns {Object|null} - Handelsentscheidung oder null, wenn kein Handel möglich
     */
    function decideTradeAction() {
        if (villageCache.merchantsAvailable <= 0) {
            log("Keine Händler verfügbar");
            return null;
        }
        
        // Ressourcen analysieren
        const resources = villageCache.resources;
        const resourceTypes = ['wood', 'stone', 'iron'];
        
        // Ressource mit dem größten Überschuss finden
        let excessResource = null;
        let excessAmount = 0;
        
        // Ressource mit dem größten Mangel finden
        let deficitResource = null;
        let deficitAmount = CONFIG.maxResourceStock;
        
        resourceTypes.forEach(type => {
            const amount = resources[type];
            const priority = CONFIG.resourcePriority[type];
            
            // Überschuss berechnen (gewichtet nach Priorität)
            if (amount > CONFIG.maxResourceStock) {
                const excess = amount - CONFIG.maxResourceStock;
                const weightedExcess = excess * (10 - priority) / 10; // Niedrigere Priorität = höherer gewichteter Überschuss
                
                if (weightedExcess > excessAmount) {
                    excessResource = type;
                    excessAmount = excess; // Wir speichern den tatsächlichen Überschuss
                }
            }
            
            // Mangel berechnen (gewichtet nach Priorität)
            if (amount < CONFIG.minResourceStock) {
                const deficit = CONFIG.minResourceStock - amount;
                const weightedDeficit = deficit * priority / 10; // Höhere Priorität = höherer gewichteter Mangel
                
                if (weightedDeficit > 0 && amount < deficitAmount) {
                    deficitResource = type;
                    deficitAmount = amount; // Wir speichern den tatsächlichen Bestand
                }
            }
        });
        
        // Entscheiden, ob verkauft oder gekauft werden soll
        if (excessResource && deficitResource) {
            // Wenn sowohl Überschuss als auch Mangel vorhanden, entscheide basierend auf Marktpreisen
            const sellPrice = marketCache.bestPrices.sell[excessResource] || 0;
            const buyPrice = marketCache.bestPrices.buy[deficitResource] || 0;
            
            if (sellPrice > 0 && buyPrice > 0) {
                // Berechne potentiellen Gewinn
                const avgSellPrice = getAveragePriceFromHistory(excessResource);
                const avgBuyPrice = getAveragePriceFromHistory(deficitResource);
                
                const potentialProfit = (sellPrice / avgSellPrice - 1) * 100;
                const potentialSaving = (1 - buyPrice / avgBuyPrice) * 100;
                
                if (potentialProfit > potentialSaving && potentialProfit >= CONFIG.minProfitPercentage) {
                    // Verkaufen ist profitabler
                    return {
                        action: 'sell',
                        resource: excessResource,
                        amount: Math.min(excessAmount, 1000), // Maximal 1000 pro Handel
                        targetPrice: sellPrice
                    };
                } else if (potentialSaving >= CONFIG.minProfitPercentage) {
                    // Kaufen ist günstiger
                    return {
                        action: 'buy',
                        resource: deficitResource,
                        amount: Math.min(CONFIG.minResourceStock - deficitAmount, 1000), // Maximal 1000 pro Handel
                        targetPrice: buyPrice
                    };
                }
            }
        } else if (excessResource) {
            // Nur Überschuss vorhanden, versuche zu verkaufen
            const sellPrice = marketCache.bestPrices.sell[excessResource] || 0;
            const avgPrice = getAveragePriceFromHistory(excessResource);
            
            if (sellPrice > 0 && avgPrice > 0 && (sellPrice / avgPrice - 1) * 100 >= CONFIG.minProfitPercentage) {
                return {
                    action: 'sell',
                    resource: excessResource,
                    amount: Math.min(excessAmount, 1000), // Maximal 1000 pro Handel
                    targetPrice: sellPrice
                };
            }
        } else if (deficitResource) {
            // Nur Mangel vorhanden, versuche zu kaufen
            const buyPrice = marketCache.bestPrices.buy[deficitResource] || 0;
            const avgPrice = getAveragePriceFromHistory(deficitResource);
            
            if (buyPrice > 0 && avgPrice > 0 && (1 - buyPrice / avgPrice) * 100 >= CONFIG.minProfitPercentage) {
                return {
                    action: 'buy',
                    resource: deficitResource,
                    amount: Math.min(CONFIG.minResourceStock - deficitAmount, 1000), // Maximal 1000 pro Handel
                    targetPrice: buyPrice
                };
            }
        }
        
        log("Keine profitable Handelsmöglichkeit gefunden");
        return null;
    }
    
    /**
     * Führt einen Handel durch
     * @param {Object} tradeAction - Handelsaktion
     * @returns {Promise<boolean>} - Erfolg des Handels
     */
    async function executeTrade(tradeAction) {
        try {
            if (!tradeAction) return false;
            
            log(`Führe Handel aus: ${tradeAction.action} ${tradeAction.amount} ${tradeAction.resource}`);

            /*------------------------------------------------------------------
              Pfad A: Erweiterte Handelsfunktionen vorhanden
            ------------------------------------------------------------------*/
            if (EXT.acceptMarketOffer && EXT.navigateToMarketTab && EXT.executeBatchTrades) {
                // 1. Markt-Tab vorbereiten – minimaler Traffic, nur wenn nötig
                const navSuccess = await EXT.navigateToMarketTab('other_offers');
                if (!navSuccess) {
                    logError('Navigation zum Marktplatz fehlgeschlagen', new Error('navigateToMarketTab'));
                    return false;
                }

                // 2. Aktuelle Angebote einsammeln (nur, wenn EXT das unterstützt)
                let offers = [];
                if (EXT.extractDetailedMarketOffers) {
                    offers = EXT.extractDetailedMarketOffers();
                }

                // 3. Bestes Angebot nach Aktion filtern
                const criteria = {
                    action: tradeAction.action,
                    resource: tradeAction.resource,
                    minAmount: tradeAction.amount,
                    maxAmount: tradeAction.amount,
                    prioritizeBy: 'ratio'
                };
                let filtered = [];
                if (EXT.findBestMarketOffers) {
                    filtered = EXT.findBestMarketOffers(offers, criteria);
                }

                // 4. Falls passendes Angebot vorhanden -> akzeptieren
                if (filtered && filtered.length > 0) {
                    const successCount = await EXT.executeBatchTrades(filtered, 1);
                    if (successCount > 0) {
                        afterSuccessfulTrade(tradeAction);
                        return true;
                    }
                }

                // 5. Ansonsten ggf. eigenes Angebot erstellen (nur wenn EXT vorhanden)
                if (tradeAction.action === 'sell' && EXT.createMarketOffer) {
                    const createOk = await EXT.createMarketOffer({
                        sellResource: tradeAction.resource,
                        sellAmount: tradeAction.amount,
                        buyResource: chooseAlternateResource(tradeAction.resource),
                        buyAmount: tradeAction.amount
                    });
                    if (createOk) {
                        afterSuccessfulTrade(tradeAction);
                        return true;
                    }
                }

                // Wenn alles fehlschlägt – zurückfallen auf simulierten Erfolg
                log('Kein passendes Angebot gefunden – fallback (simuliert)');
            }

            /*------------------------------------------------------------------
              Pfad B: Fallback-Simulation (bisheriges Verhalten)
            ------------------------------------------------------------------*/

            await delayedAction(() => afterSuccessfulTrade(tradeAction));
            return true;
        } catch (error) {
            logError("Fehler beim Ausführen des Handels", error);
            return false;
        }

        // Hilfsfunktion, um Stats nach erfolgreichem Handel zu aktualisieren
        function afterSuccessfulTrade(action) {
            stats.tradesCompleted++;
            stats.resourcesTraded[action.resource] += action.amount;
            stats.lastAction = Date.now();
            stats.sessionActions++;
            saveData('twMarketBotStats', stats);
            log(`Handel erfolgreich: ${action.action} ${action.amount} ${action.resource}`);
        }

        // Wählt eine alternative Ressource für Tauschgeschäfte
        function chooseAlternateResource(res) {
            const options = ['wood', 'stone', 'iron'].filter(r => r !== res);
            return options[Math.floor(Math.random() * options.length)];
        }
    }
    
    // -------------------------------------------------------------------------
    // BENUTZEROBERFLÄCHE
    // -------------------------------------------------------------------------
    
    /**
     * Erstellt die Benutzeroberfläche
     */
    function createUI() {
        try {
            // Styles für die UI
            GM_addStyle(`
                #twMarketBot {
                    position: fixed;
                    bottom: 10px;
                    right: 10px;
                    background: rgba(44, 62, 80, 0.9);
                    border: 1px solid #34495e;
                    border-radius: 5px;
                    padding: 10px;
                    color: #ecf0f1;
                    font-size: 12px;
                    z-index: 9999;
                    width: 300px;
                    max-height: 500px;
                    overflow-y: auto;
                    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
                }
                
                #twMarketBot h3 {
                    margin: 0 0 10px 0;
                    padding-bottom: 5px;
                    border-bottom: 1px solid #34495e;
                    font-size: 14px;
                    text-align: center;
                }
                
                #twMarketBot .bot-controls {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 10px;
                }
                
                #twMarketBot button {
                    background: #2980b9;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                    transition: background-color 0.2s ease;
                }
                
                #twMarketBot button:hover {
                    background: #3498db;
                }
                
                #twMarketBot button:active {
                    background: #1c6ea4;
                    transform: translateY(1px);
                }
                
                #twMarketBot button.active {
                    background: #27ae60;
                }
                
                #twMarketBot button.disabled {
                    background: #c0392b;
                }
                
                #twMarketBot .status {
                    margin: 10px 0;
                    padding: 5px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 3px;
                }
                
                #twMarketBot .section {
                    margin-bottom: 10px;
                }
                
                #twMarketBot .section-title {
                    font-weight: bold;
                    margin-bottom: 5px;
                    cursor: pointer;
                    user-select: none;
                    transition: color 0.2s ease;
                }
                
                #twMarketBot .section-title:hover {
                    color: #3498db;
                }
                
                #twMarketBot .resource-info {
                    display: flex;
                    justify-content: space-between;
                }
                
                #twMarketBot .resource-item {
                    flex: 1;
                    text-align: center;
                }
                
                #twMarketBot .resource-value {
                    font-weight: bold;
                }
                
                #twMarketBot .settings-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 5px;
                }
                
                #twMarketBot .settings-label {
                    flex: 2;
                }
                
                #twMarketBot .settings-value {
                    flex: 1;
                    text-align: right;
                }
                
                #twMarketBot input[type="number"] {
                    width: 60px;
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid #34495e;
                    color: white;
                    padding: 2px 5px;
                    border-radius: 3px;
                }
                
                #twMarketBot .log {
                    max-height: 150px;
                    overflow-y: auto !important;
                    background: rgba(0, 0, 0, 0.2);
                    padding: 5px;
                    border-radius: 3px;
                    margin-top: 10px;
                    font-family: monospace;
                    font-size: 10px;
                    scrollbar-width: thin;
                    scrollbar-color: #34495e rgba(0, 0, 0, 0.2);
                }
                
                #twMarketBot .log::-webkit-scrollbar {
                    width: 8px;
                }
                
                #twMarketBot .log::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 3px;
                }
                
                #twMarketBot .log::-webkit-scrollbar-thumb {
                    background-color: #34495e;
                    border-radius: 3px;
                }
                
                #twMarketBot .toggle-section {
                    cursor: pointer;
                    user-select: none;
                }
                
                #twMarketBot .toggle-section:after {
                    content: " ▼";
                    font-size: 10px;
                }
                
                #twMarketBot .toggle-section.collapsed:after {
                    content: " ►";
                }
                
                #twMarketBot .section-content.collapsed {
                    display: none;
                }
                
                #twMarketBot .minimize-button {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 16px;
                    padding: 0;
                }
                
                #twMarketBot.minimized {
                    width: auto;
                    height: auto;
                    padding: 5px;
                }
                
                #twMarketBot.minimized .bot-content {
                    display: none;
                }
                
                #twMarketBot .bot-icon {
                    display: none;
                    font-size: 20px;
                    cursor: pointer;
                }
                
                #twMarketBot.minimized .bot-icon {
                    display: block;
                }
                
                #twMarketBot .stats-container {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 8px;
                    border-radius: 3px;
                    margin-top: 5px;
                }
                
                #twMarketBot .stats-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 3px;
                }
                
                #twMarketBot .stats-label {
                    flex: 2;
                }
                
                #twMarketBot .stats-value {
                    flex: 1;
                    text-align: right;
                    font-weight: bold;
                }
                
                #twMarketBot .highlight {
                    color: #2ecc71;
                    font-weight: bold;
                }
                
                #twMarketBot .error-text {
                    color: #e74c3c;
                }
                
                #twMarketBot #logSection {
                    display: block;
                    max-height: 150px;
                    overflow-y: auto !important;
                }
                
                #twMarketBot #logSection.collapsed {
                    display: none;
                }
                
                #twMarketBot #settingsSection {
                    display: block;
                }
                
                #twMarketBot #settingsSection.collapsed {
                    display: none;
                }
                
                #twMarketBot #statsSection {
                    display: block;
                }
                
                #twMarketBot #statsSection.collapsed {
                    display: none;
                }
            `);
            
            // UI-Container erstellen
            const container = document.createElement('div');
            container.id = 'twMarketBot';
            
            // UI-Inhalt
            container.innerHTML = `
                <div class="bot-icon" title="Tribal Wars Market Bot">💰</div>
                <div class="bot-content">
                    <button class="minimize-button" title="Minimieren">_</button>
                    <h3>Tribal Wars Market Bot</h3>
                    
                    <div class="bot-controls">
                        <button id="twMarketBotToggle" class="${CONFIG.enabled ? 'active' : 'disabled'}">
                            ${CONFIG.enabled ? 'Aktiviert' : 'Deaktiviert'}
                        </button>
                        <button id="twMarketBotSettings">Einstellungen</button>
                        <button id="twMarketBotStats">Statistik</button>
                    </div>
                    
                    <div class="status">
                        Status: <span id="twMarketBotStatus">${CONFIG.enabled ? 'Aktiv' : 'Inaktiv'}</span><br>
                        Letzte Aktion: <span id="twMarketBotLastAction">-</span><br>
                        Aktionen diese Session: <span id="twMarketBotSessionActions">0</span>/<span id="twMarketBotMaxActions">${CONFIG.maxActionsPerSession}</span>
                    </div>
                    
                    <div class="section">
                        <div class="section-title toggle-section" data-section="resources">Ressourcen</div>
                        <div class="section-content" id="resourcesSection">
                            <div class="resource-info">
                                <div class="resource-item">
                                    <div>Holz</div>
                                    <div class="resource-value" id="twMarketBotWood">0</div>
                                </div>
                                <div class="resource-item">
                                    <div>Lehm</div>
                                    <div class="resource-value" id="twMarketBotStone">0</div>
                                </div>
                                <div class="resource-item">
                                    <div>Eisen</div>
                                    <div class="resource-value" id="twMarketBotIron">0</div>
                                </div>
                            </div>
                            <div style="margin-top: 5px;">
                                Lager: <span id="twMarketBotStorage">0</span><br>
                                Händler: <span id="twMarketBotMerchants">0</span>/<span id="twMarketBotMerchantsTotal">0</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title toggle-section" data-section="market">Marktpreise</div>
                        <div class="section-content" id="marketSection">
                            <div class="settings-row">
                                <div class="settings-label">Holz (Verkauf):</div>
                                <div class="settings-value" id="twMarketBotWoodSellPrice">-</div>
                            </div>
                            <div class="settings-row">
                                <div class="settings-label">Lehm (Verkauf):</div>
                                <div class="settings-value" id="twMarketBotStoneSellPrice">-</div>
                            </div>
                            <div class="settings-row">
                                <div class="settings-label">Eisen (Verkauf):</div>
                                <div class="settings-value" id="twMarketBotIronSellPrice">-</div>
                            </div>
                            <div style="margin-top: 5px; font-size: 10px; text-align: right;">
                                Letzte Aktualisierung: <span id="twMarketBotLastMarketUpdate">-</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title toggle-section collapsed" data-section="settings">Einstellungen</div>
                        <div class="section-content collapsed" id="settingsSection">
                            <div class="settings-row">
                                <div class="settings-label">Min. Gewinn (%):</div>
                                <div class="settings-value">
                                    <input type="number" id="twMarketBotMinProfit" min="1" max="100" value="${CONFIG.minProfitPercentage}">
                                </div>
                            </div>
                            <div class="settings-row">
                                <div class="settings-label">Max. Ressourcen:</div>
                                <div class="settings-value">
                                    <input type="number" id="twMarketBotMaxResources" min="1000" step="1000" value="${CONFIG.maxResourceStock}">
                                </div>
                            </div>
                            <div class="settings-row">
                                <div class="settings-label">Min. Ressourcen:</div>
                                <div class="settings-value">
                                    <input type="number" id="twMarketBotMinResources" min="0" step="1000" value="${CONFIG.minResourceStock}">
                                </div>
                            </div>
                            <div class="settings-row">
                                <div class="settings-label">Ressourcen ausbalancieren:</div>
                                <div class="settings-value">
                                    <input type="checkbox" id="twMarketBotBalanceResources" ${CONFIG.balanceResources ? 'checked' : ''}>
                                </div>
                            </div>
                            <div class="settings-row">
                                <div class="settings-label">Debug-Modus:</div>
                                <div class="settings-value">
                                    <input type="checkbox" id="twMarketBotDebugMode" ${CONFIG.debugMode ? 'checked' : ''}>
                                </div>
                            </div>
                            <button id="twMarketBotSaveSettings" style="width: 100%; margin-top: 5px;">Speichern</button>
                        </div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title toggle-section collapsed" data-section="stats">Statistik</div>
                        <div class="section-content collapsed" id="statsSection">
                            <div class="stats-container">
                                <div class="stats-row">
                                    <div class="stats-label">Abgeschlossene Trades:</div>
                                    <div class="stats-value" id="twMarketBotTradesCompleted">0</div>
                                </div>
                                <div class="stats-row">
                                    <div class="stats-label">Holz gehandelt:</div>
                                    <div class="stats-value" id="twMarketBotWoodTraded">0</div>
                                </div>
                                <div class="stats-row">
                                    <div class="stats-label">Lehm gehandelt:</div>
                                    <div class="stats-value" id="twMarketBotStoneTraded">0</div>
                                </div>
                                <div class="stats-row">
                                    <div class="stats-label">Eisen gehandelt:</div>
                                    <div class="stats-value" id="twMarketBotIronTraded">0</div>
                                </div>
                                <div class="stats-row">
                                    <div class="stats-label">Generierter Gewinn:</div>
                                    <div class="stats-value" id="twMarketBotProfit">0</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <div class="section-title toggle-section collapsed" data-section="log">Log</div>
                        <div class="section-content collapsed log" id="logSection">
                            <div id="twMarketBotLog"></div>
                        </div>
                    </div>
                </div>
            `;
            
            // UI zum DOM hinzufügen
            document.body.appendChild(container);
            
            // Event-Listener für UI-Elemente
            setupUIEventListeners();
            
            // Füge initiale Log-Nachricht hinzu
            addToUILog("Bot gestartet. Bereit für Handel.");
            
            log("UI erstellt");
        } catch (error) {
            logError("Fehler beim Erstellen der UI", error);
        }
    }
    
    /**
     * Zeigt die Einstellungen an
     */
    function showSettings() {
        try {
            // Setze den aktiven Bereich
            uiState.activeSection = 'settings';
            
            // Alle Bereiche ausblenden
            hideAllSections();
            
            // Einstellungen anzeigen
            const settingsSection = document.getElementById('settingsSection');
            const settingsTitle = document.querySelector('.toggle-section[data-section="settings"]');
            
            if (settingsSection && settingsTitle) {
                settingsSection.classList.remove('collapsed');
                settingsTitle.classList.remove('collapsed');
                
                // Scroll zum Einstellungsbereich
                settingsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                
                log("Einstellungen angezeigt");
            } else {
                logError("Einstellungsbereich nicht gefunden", new Error("DOM Element nicht gefunden"));
            }
        } catch (error) {
            logError("Fehler beim Anzeigen der Einstellungen", error);
        }
    }
    
    /**
     * Zeigt die Statistik an
     */
    function showStats() {
        try {
            // Setze den aktiven Bereich
            uiState.activeSection = 'stats';
            
            // Alle Bereiche ausblenden
            hideAllSections();
            
            // Statistik anzeigen
            const statsSection = document.getElementById('statsSection');
            const statsTitle = document.querySelector('.toggle-section[data-section="stats"]');
            
            if (statsSection && statsTitle) {
                statsSection.classList.remove('collapsed');
                statsTitle.classList.remove('collapsed');
                
                // Aktualisiere die Statistik-Werte
                document.getElementById('twMarketBotTradesCompleted').textContent = stats.tradesCompleted.toLocaleString();
                document.getElementById('twMarketBotWoodTraded').textContent = stats.resourcesTraded.wood.toLocaleString();
                document.getElementById('twMarketBotStoneTraded').textContent = stats.resourcesTraded.stone.toLocaleString();
                document.getElementById('twMarketBotIronTraded').textContent = stats.resourcesTraded.iron.toLocaleString();
                document.getElementById('twMarketBotProfit').textContent = stats.profitGenerated.toLocaleString();
                
                // Scroll zum Statistikbereich
                statsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                
                log("Statistik angezeigt");
            } else {
                logError("Statistikbereich nicht gefunden", new Error("DOM Element nicht gefunden"));
            }
        } catch (error) {
            logError("Fehler beim Anzeigen der Statistik", error);
        }
    }
    
    /**
     * Blendet alle Sektionen aus
     */
    function hideAllSections() {
        try {
            // Alle Sections ausblenden, außer Ressourcen und Marktpreise
            const sections = ['settings', 'stats', 'log'];
            
            sections.forEach(section => {
                const sectionElement = document.getElementById(`${section}Section`);
                const titleElement = document.querySelector(`.toggle-section[data-section="${section}"]`);
                
                if (sectionElement) {
                    sectionElement.classList.add('collapsed');
                }
                
                if (titleElement) {
                    titleElement.classList.add('collapsed');
                }
            });
            
            log("Alle Sektionen ausgeblendet");
        } catch (error) {
            logError("Fehler beim Ausblenden aller Sektionen", error);
        }
    }
    
    /**
     * Richtet Event-Listener für UI-Elemente ein
     */
    function setupUIEventListeners() {
        try {
            console.log("[TW Market Bot] Richte UI-Event-Listener ein...");
            
            // Toggle-Button
            const toggleButton = document.getElementById('twMarketBotToggle');
            if (toggleButton) {
                toggleButton.addEventListener('click', () => {
                    console.log("[TW Market Bot] Toggle-Button geklickt");
                    CONFIG.enabled = !CONFIG.enabled;
                    toggleButton.className = CONFIG.enabled ? 'active' : 'disabled';
                    toggleButton.textContent = CONFIG.enabled ? 'Aktiviert' : 'Deaktiviert';
                    document.getElementById('twMarketBotStatus').textContent = CONFIG.enabled ? 'Aktiv' : 'Inaktiv';
                    saveData('twMarketBotConfig', CONFIG);
                    log(`Bot ${CONFIG.enabled ? 'aktiviert' : 'deaktiviert'}`);
                });
            } else {
                console.error("[TW Market Bot] Toggle-Button nicht gefunden");
            }
            
            // Einstellungen-Button
            const settingsButton = document.getElementById('twMarketBotSettings');
            if (settingsButton) {
                settingsButton.addEventListener('click', () => {
                    console.log("[TW Market Bot] Einstellungen-Button geklickt");
                    showSettings();
                });
            } else {
                console.error("[TW Market Bot] Einstellungen-Button nicht gefunden");
            }
            
            // Statistik-Button
            const statsButton = document.getElementById('twMarketBotStats');
            if (statsButton) {
                statsButton.addEventListener('click', () => {
                    console.log("[TW Market Bot] Statistik-Button geklickt");
                    showStats();
                });
            } else {
                console.error("[TW Market Bot] Statistik-Button nicht gefunden");
            }
            
            // Einstellungen speichern
            const saveSettingsButton = document.getElementById('twMarketBotSaveSettings');
            if (saveSettingsButton) {
                saveSettingsButton.addEventListener('click', () => {
                    console.log("[TW Market Bot] Speichern-Button geklickt");
                    // Einstellungen aus UI-Elementen auslesen
                    CONFIG.minProfitPercentage = parseInt(document.getElementById('twMarketBotMinProfit').value) || 15;
                    CONFIG.maxResourceStock = parseInt(document.getElementById('twMarketBotMaxResources').value) || 25000;
                    CONFIG.minResourceStock = parseInt(document.getElementById('twMarketBotMinResources').value) || 5000;
                    CONFIG.balanceResources = document.getElementById('twMarketBotBalanceResources').checked;
                    CONFIG.debugMode = document.getElementById('twMarketBotDebugMode').checked;
                    
                    // Einstellungen speichern
                    saveData('twMarketBotConfig', CONFIG);
                    log("Einstellungen gespeichert");
                    
                    // Visuelles Feedback
                    saveSettingsButton.textContent = "Gespeichert!";
                    saveSettingsButton.style.background = "#27ae60";
                    
                    // Nach kurzer Zeit zurücksetzen
                    setTimeout(() => {
                        saveSettingsButton.textContent = "Speichern";
                        saveSettingsButton.style.background = "";
                    }, 1500);
                });
            } else {
                console.error("[TW Market Bot] Speichern-Button nicht gefunden");
            }
            
            // Toggle-Sections
            const toggleSections = document.querySelectorAll('.toggle-section');
            toggleSections.forEach(section => {
                section.addEventListener('click', (event) => {
                    const sectionName = section.getAttribute('data-section');
                    console.log(`[TW Market Bot] Section ${sectionName} geklickt`);
                    
                    const content = document.getElementById(`${sectionName}Section`);
                    
                    if (content) {
                        // Toggle-Klasse umschalten
                        section.classList.toggle('collapsed');
                        content.classList.toggle('collapsed');
                        
                        // Wenn der Bereich geöffnet wird, scrolle dorthin
                        if (!content.classList.contains('collapsed')) {
                            content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            
                            // Wenn es der Log-Bereich ist, scrolle zum Ende
                            if (sectionName === 'log') {
                                content.scrollTop = content.scrollHeight;
                            }
                        }
                    } else {
                        console.error(`[TW Market Bot] Section ${sectionName} nicht gefunden`);
                    }
                    
                    // Verhindern, dass das Ereignis weitergeleitet wird
                    event.stopPropagation();
                });
            });
            
            // Minimieren/Maximieren
            const minimizeButton = document.querySelector('.minimize-button');
            const botIcon = document.querySelector('.bot-icon');
            
            if (minimizeButton) {
                minimizeButton.addEventListener('click', () => {
                    console.log("[TW Market Bot] Minimieren-Button geklickt");
                    document.getElementById('twMarketBot').classList.add('minimized');
                    uiState.isMinimized = true;
                });
            } else {
                console.error("[TW Market Bot] Minimieren-Button nicht gefunden");
            }
            
            if (botIcon) {
                botIcon.addEventListener('click', () => {
                    console.log("[TW Market Bot] Bot-Icon geklickt");
                    document.getElementById('twMarketBot').classList.remove('minimized');
                    uiState.isMinimized = false;
                });
            } else {
                console.error("[TW Market Bot] Bot-Icon nicht gefunden");
            }
            
            log("UI-Event-Listener eingerichtet");
        } catch (error) {
            console.error("[TW Market Bot] Kritischer Fehler bei Event-Listener Setup:", error);
            logError("Fehler beim Einrichten der UI-Event-Listener", error);
        }
    }
    
    /**
     * Aktualisiert die UI mit aktuellen Daten
     */
    function updateUI() {
        try {
            // Ressourcen aktualisieren
            document.getElementById('twMarketBotWood').textContent = villageCache.resources.wood.toLocaleString();
            document.getElementById('twMarketBotStone').textContent = villageCache.resources.stone.toLocaleString();
            document.getElementById('twMarketBotIron').textContent = villageCache.resources.iron.toLocaleString();
            document.getElementById('twMarketBotStorage').textContent = villageCache.storage.toLocaleString();
            document.getElementById('twMarketBotMerchants').textContent = villageCache.merchantsAvailable;
            document.getElementById('twMarketBotMerchantsTotal').textContent = villageCache.merchantsTotal;
            
            // Marktpreise aktualisieren
            document.getElementById('twMarketBotWoodSellPrice').textContent = marketCache.bestPrices.sell.wood.toFixed(2);
            document.getElementById('twMarketBotStoneSellPrice').textContent = marketCache.bestPrices.sell.stone.toFixed(2);
            document.getElementById('twMarketBotIronSellPrice').textContent = marketCache.bestPrices.sell.iron.toFixed(2);
            
            // Letzte Aktualisierung
            const lastUpdateTime = new Date(marketCache.lastUpdate).toLocaleTimeString();
            document.getElementById('twMarketBotLastMarketUpdate').textContent = lastUpdateTime;
            
            // Status aktualisieren
            if (stats.lastAction > 0) {
                const lastActionTime = new Date(stats.lastAction).toLocaleTimeString();
                document.getElementById('twMarketBotLastAction').textContent = lastActionTime;
            }
            
            document.getElementById('twMarketBotSessionActions').textContent = stats.sessionActions;
            document.getElementById('twMarketBotMaxActions').textContent = CONFIG.maxActionsPerSession;
            
            // Wenn Statistik sichtbar ist, aktualisiere auch diese
            if (!document.getElementById('statsSection').classList.contains('collapsed')) {
                document.getElementById('twMarketBotTradesCompleted').textContent = stats.tradesCompleted.toLocaleString();
                document.getElementById('twMarketBotWoodTraded').textContent = stats.resourcesTraded.wood.toLocaleString();
                document.getElementById('twMarketBotStoneTraded').textContent = stats.resourcesTraded.stone.toLocaleString();
                document.getElementById('twMarketBotIronTraded').textContent = stats.resourcesTraded.iron.toLocaleString();
                document.getElementById('twMarketBotProfit').textContent = stats.profitGenerated.toLocaleString();
            }
            
            log("UI aktualisiert");
        } catch (error) {
            logError("Fehler beim Aktualisieren der UI", error);
        }
    }
    
    /**
     * Fügt eine Nachricht zum Log hinzu
     * @param {string} message - Nachricht
     */
    function addToUILog(message) {
        try {
            const logElement = document.getElementById('twMarketBotLog');
            if (logElement) {
                const timestamp = new Date().toLocaleTimeString();
                const logEntry = document.createElement('div');
                logEntry.textContent = `[${timestamp}] ${message}`;
                
                // Fehler-Nachrichten hervorheben
                if (message.includes("Fehler")) {
                    logEntry.classList.add('error-text');
                }
                
                // Erfolgs-Nachrichten hervorheben
                if (message.includes("erfolgreich")) {
                    logEntry.classList.add('highlight');
                }
                
                logElement.appendChild(logEntry);
                
                // Scroll zum Ende
                logElement.scrollTop = logElement.scrollHeight;
                
                // Begrenze die Anzahl der Log-Einträge
                while (logElement.children.length > 50) {
                    logElement.removeChild(logElement.firstChild);
                }
                
                // Wenn der Log-Bereich nicht sichtbar ist, füge einen visuellen Hinweis hinzu
                const logSection = document.getElementById('logSection');
                const logTitle = document.querySelector('.toggle-section[data-section="log"]');
                
                if (logSection && logSection.classList.contains('collapsed') && logTitle) {
                    // Kurzes Blinken des Log-Titels
                    logTitle.style.color = '#3498db';
                    setTimeout(() => {
                        logTitle.style.color = '';
                    }, 500);
                }
            } else {
                console.error("[TW Market Bot] Log-Element nicht gefunden");
            }
        } catch (error) {
            console.error("[TW Market Bot] Fehler beim Hinzufügen zum UI-Log:", error);
        }
    }
    
    // -------------------------------------------------------------------------
    // HAUPTLOGIK
    // -------------------------------------------------------------------------
    
    /**
     * Initialisiert den Bot
     */
    function initBot() {
        try {
            // Gespeicherte Konfiguration laden
            const savedConfig = loadData('twMarketBotConfig', null);
            if (savedConfig) {
                Object.assign(CONFIG, savedConfig);
                log("Gespeicherte Konfiguration geladen");
            }
            
            // Gespeicherte Marktdaten laden
            const savedMarketCache = loadData('twMarketBotMarketCache', null);
            if (savedMarketCache) {
                Object.assign(marketCache, savedMarketCache);
                log("Gespeicherte Marktdaten geladen");
            }
            
            // Gespeicherte Statistik laden
            const savedStats = loadData('twMarketBotStats', null);
            if (savedStats) {
                Object.assign(stats, savedStats);
                log("Gespeicherte Statistik geladen");
            }
            
            // UI erstellen
            createUI();
            
            // Initialen Scan durchführen
            if (isMarketPage()) {
                updateMarketCache();
            }
            
            extractVillageInfo();
            updateUI();
            
            // Hauptschleife starten
            setTimeout(mainLoop, randomDelay(5000, 10000));
            
            log("Bot initialisiert");
        } catch (error) {
            logError("Fehler bei der Bot-Initialisierung", error);
        }
    }
    
    /**
     * Prüft, ob die aktuelle Seite der Marktplatz ist
     * @returns {boolean} - true, wenn die aktuelle Seite der Marktplatz ist
     */
    function isMarketPage() {
        return window.location.href.includes('screen=market');
    }
    
    /**
     * Prüft, ob die aktuelle Seite die Marktplatz-Angebotsseite ist
     * @returns {boolean} - true, wenn die aktuelle Seite die Marktplatz-Angebotsseite ist
     */
    function isMarketOfferPage() {
        return window.location.href.includes('screen=market') && 
               (window.location.href.includes('mode=other_offer') || 
                !window.location.href.includes('mode='));
    }
    
    /**
     * Hauptschleife des Bots
     */
    async function mainLoop() {
        try {
            if (!CONFIG.enabled) {
                log("Bot ist deaktiviert, überspringe Hauptschleife");
                setTimeout(mainLoop, 10000);
                return;
            }
            
            log("Hauptschleife gestartet");
            
            // Aktualisiere Dorf-Informationen
            extractVillageInfo();
            
            // Wenn auf Marktplatz-Seite, aktualisiere Marktdaten
            if (isMarketOfferPage()) {
                updateMarketCache();
            }
            
            // UI aktualisieren
            updateUI();
            
            // Prüfe, ob Session-Limit erreicht ist
            if (stats.sessionActions >= CONFIG.maxActionsPerSession) {
                log(`Session-Limit erreicht (${stats.sessionActions}/${CONFIG.maxActionsPerSession}), starte neue Session nach Pause`);
                
                // Berechne Pausenzeit
                const pauseMinutes = randomDelay(CONFIG.minSessionPause * 60000, CONFIG.maxSessionPause * 60000);
                const pauseMinutesFormatted = Math.round(pauseMinutes / 60000);
                
                addToUILog(`Session-Pause für ca. ${pauseMinutesFormatted} Minuten`);
                
                // Setze Session-Aktionen zurück nach der Pause
                setTimeout(() => {
                    stats.sessionActions = 0;
                    saveData('twMarketBotStats', stats);
                    log("Neue Session gestartet");
                    addToUILog("Neue Session gestartet");
                    mainLoop();
                }, pauseMinutes);
                
                return;
            }
            
            // Entscheide, ob eine Handelsaktion durchgeführt werden soll
            const tradeAction = decideTradeAction();
            
            if (tradeAction) {
                // Führe Handel durch
                const success = await executeTrade(tradeAction);
                
                if (success) {
                    addToUILog(`Handel: ${tradeAction.action} ${tradeAction.amount} ${tradeAction.resource}`);
                } else {
                    addToUILog(`Handel fehlgeschlagen: ${tradeAction.action} ${tradeAction.resource}`);
                }
            } else {
                log("Kein Handel möglich im Moment");
            }
            
            // Human-like Verhalten: Zufällige Pause vor nächster Iteration
            const nextLoopDelay = randomDelay(30000, 120000); // 30s - 2min
            log(`Nächste Iteration in ${Math.round(nextLoopDelay / 1000)}s`);
            
            setTimeout(mainLoop, nextLoopDelay);
        } catch (error) {
            logError("Fehler in der Hauptschleife", error);
            
            // Bei Fehler trotzdem weitermachen nach einer Pause
            setTimeout(mainLoop, 60000);
        }
    }
    
    // Globale Funktionen für externe Nutzung
    window.twMarketBotLog = addToUILog;
    window.twMarketBotLogError = function(message, error) {
        logError(message, error);
        addToUILog(`Fehler: ${message}`);
    };
    
    // Bot starten
    initBot();
    
})();
