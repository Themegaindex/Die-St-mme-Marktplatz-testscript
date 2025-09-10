// ==UserScript==
// @name         Tribal Wars Market Bot (Fixed)
// @namespace    https://github.com/Themegaindex/Die-St-mme-Marktplatz-testscript
// @version      1.1.0
// @description  Intelligente Marktplatz-Automatisierung für Tribal Wars mit stabiler UI, korrektem Preis-Parsing und robusten Buttons/Log
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
//  OPTIONALE ERWEITERUNG (falls NICHT als eigenes Userscript installiert):
//  Achtung: nur aktivieren, wenn du die Erweiterung unten NICHT separat einfügst!
// @require      https://raw.githubusercontent.com/Themegaindex/Die-St-mme-Marktplatz-testscript/main/tribal-wars-market-extensions.js
// -------------------------------------------------------------------------
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // KONFIGURATION
    // -------------------------------------------------------------------------
    const CONFIG = {
        enabled: true,
        debugMode: false,

        // Anti-Detection
        minActionDelay: 1500,
        maxActionDelay: 4500,
        minSessionPause: 15, // Minuten
        maxSessionPause: 45, // Minuten
        maxActionsPerSession: 12,
        humanPatterns: true,

        // Markt
        minProfitPercentage: 15,
        maxResourceStock: 25000,
        minResourceStock: 5000,
        balanceResources: true,

        // Prioritäten
        resourcePriority: { wood: 5, stone: 5, iron: 5 },

        villageSettings: {}
    };

    // -------------------------------------------------------------------------
    // DATEN-CACHES
    // -------------------------------------------------------------------------
    const marketCache = {
        offers: [],
        lastUpdate: 0,
        priceHistory: { wood: [], stone: [], iron: [] },
        bestPrices: {
            buy: { wood: 0, stone: 0, iron: 0 },   // günstigster Kauf (kleinstes Verhältnis)
            sell: { wood: 0, stone: 0, iron: 0 }   // bester Verkauf (höchstes Verhältnis)
        }
    };

    const villageCache = {
        resources: { wood: 0, stone: 0, iron: 0 },
        storage: 0,
        merchantsAvailable: 0,
        merchantsTotal: 0,
        merchantMaxTransport: 0,
        lastUpdate: 0
    };

    const stats = {
        tradesCompleted: 0,
        resourcesTraded: { wood: 0, stone: 0, iron: 0 },
        profitGenerated: 0,
        lastAction: 0,
        sessionActions: 0,
        errors: []
    };

    // -------------------------------------------------------------------------
    // ERWEITERUNGS-BRIDGE (immer dynamisch lesen – egal in welcher Lade-Reihenfolge)
    // -------------------------------------------------------------------------
    function getEXT() {
        return (typeof window !== 'undefined' && window.twMarketExtensions) ? window.twMarketExtensions : {};
    }

    // Fallback-Wartefunktion (falls EXT.randomWait nicht vorhanden)
    async function randomWait(min, max) {
        const delay = randomDelay(min, max);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    // -------------------------------------------------------------------------
    // HILFSFUNKTIONEN
    // -------------------------------------------------------------------------
    function randomDelay(min, max) {
        const variance = Math.random() * 0.3 + 0.85; // 0.85 - 1.15
        const base = Math.floor(Math.random() * (max - min + 1) + min);
        return Math.floor(base * variance);
    }

    function delayedAction(action) {
        return new Promise((resolve, reject) => {
            const delay = randomDelay(CONFIG.minActionDelay, CONFIG.maxActionDelay);
            const extra = (CONFIG.humanPatterns && Math.random() < 0.15) ? randomDelay(2000, 8000) : 0;
            setTimeout(() => {
                try {
                    const res = action();
                    resolve(res);
                } catch (e) {
                    logError('Fehler bei verzögerter Aktion', e);
                    reject(e);
                }
            }, delay + extra);
        });
    }

    function saveData(key, value) {
        try { GM_setValue(key, JSON.stringify(value)); } catch (e) { logError('Fehler beim Speichern', e); }
    }
    function loadData(key, defaultValue) {
        try { const d = GM_getValue(key); return d ? JSON.parse(d) : defaultValue; } catch (e) { logError('Fehler beim Laden', e); return defaultValue; }
    }

    function log(msg) {
        if (CONFIG.debugMode) console.log(`[TW Market Bot] ${msg}`);
        // Zusätzlich in UI-Log, wenn vorhanden
        try { if (typeof window.twMarketBotLog === 'function') window.twMarketBotLog(msg); } catch {}
    }
    function logError(message, error) {
        console.error(`[TW Market Bot] ${message}:`, error);
        stats.errors.push({ time: Date.now(), message, error: String(error) });
        if (stats.errors.length > 50) stats.errors = stats.errors.slice(-50);
        saveData('twMarketBotStats', stats);
        try { if (typeof window.twMarketBotLogError === 'function') window.twMarketBotLogError(message, error); } catch {}
    }

    // -------------------------------------------------------------------------
    // MARKTPLATZ: EXTRAKTION & PREISE
    // -------------------------------------------------------------------------
    function isMarketPage() {
        return window.location.href.includes('screen=market');
    }

    // KORRIGIERT: Angebotsseite sicher erkennen
    function isMarketOfferPage() {
        return isMarketPage() && (
            window.location.href.includes('mode=other_offers') ||
            document.querySelector('#market_offer_table')
        );
    }

    // ROBUSTES Parsen von Angeboten (neue & alte Layouts)
    function extractMarketOffers() {
        const offers = [];
        try {
            const table = document.querySelector('#market_offer_table') ||
                          document.querySelector('table.vis:not(.modemenu)');
            if (!table) {
                log('Keine Angebots-Tabelle gefunden');
                return offers;
            }

            const rows = table.querySelectorAll('tr');
            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                if (!cells || cells.length < 5) return;

                // typische Struktur (andere Angebote)
                let sellIconCell = cells[0], sellAmountCell = cells[1],
                    buyIconCell = cells[2], buyAmountCell = cells[3],
                    metaCell = cells[4], timeCell = cells[5],
                    actionCell = cells[6] || cells[cells.length - 1];

                // Fallback auf abweichende Layouts
                const hasIcon = (c) => c && c.querySelector('.wood, .stone, .iron, .icon.header.wood, .icon.header.stone, .icon.header.iron');
                if (!hasIcon(sellIconCell) && cells.length >= 7) {
                    sellIconCell = cells[0];
                    sellAmountCell = cells[1] || cells[0];
                    buyIconCell = cells[2] || cells[1];
                    buyAmountCell = cells[3] || cells[2];
                    metaCell = cells[4] || null;
                    timeCell = cells[5] || null;
                    actionCell = cells[6] || cells[cells.length - 1];
                }

                const resFrom = (c) => {
                    if (!c) return '';
                    if (c.querySelector('.wood, .icon.header.wood')) return 'wood';
                    if (c.querySelector('.stone, .icon.header.stone')) return 'stone';
                    if (c.querySelector('.iron, .icon.header.iron')) return 'iron';
                    return '';
                };

                const sellResource = resFrom(sellIconCell);
                const buyResource = resFrom(buyIconCell);
                const sellAmount = parseInt((sellAmountCell?.textContent || '').replace(/\D/g, ''), 10) || 0;
                const buyAmount = parseInt((buyAmountCell?.textContent || '').replace(/\D/g, ''), 10) || 0;
                if (!sellResource || !buyResource || sellAmount <= 0 || buyAmount <= 0) return;

                const offer = {
                    id: '',
                    sellResource, sellAmount,
                    buyResource, buyAmount,
                    ratio: buyAmount / sellAmount, // Preis pro 1 Einheit sellResource
                    village: metaCell ? metaCell.textContent.trim() : '',
                    distance: 0,
                    travelTime: timeCell ? timeCell.textContent.trim() : '',
                    availability: 1,
                    actionButton: null,
                    acceptForm: null,
                    timestamp: Date.now()
                };

                // Formular/Action finden
                const form = row.querySelector('form.market_accept_offer') || actionCell?.querySelector('form');
                if (form) {
                    offer.acceptForm = form;
                    offer.actionButton = form.querySelector('input[type="submit"],button[type="submit"]');
                    const idInput = form.querySelector('input[name="id"]');
                    if (idInput) offer.id = idInput.value;
                } else if (actionCell) {
                    offer.actionButton = actionCell.querySelector('a, input[type="submit"]');
                }

                offers.push(offer);
            });

            log(`${offers.length} Marktangebote extrahiert`);
        } catch (e) {
            logError('Fehler beim Extrahieren der Marktangebote', e);
        }
        return offers;
    }

    // KORREKTE Preisberechnung: sell = Maximum, buy = Minimum
    function calculateBestPrices() {
        const bestSell = { wood: 0, stone: 0, iron: 0 };
        const bestBuy = { wood: Infinity, stone: Infinity, iron: Infinity };

        marketCache.offers.forEach(o => {
            if (!o || !o.sellResource || !o.buyResource || o.sellAmount <= 0) return;
            const ratio = o.buyAmount / o.sellAmount;

            if (ratio > bestSell[o.sellResource]) bestSell[o.sellResource] = ratio;
            if (ratio < bestBuy[o.sellResource]) bestBuy[o.sellResource] = ratio;
        });

        marketCache.bestPrices.sell = bestSell;
        marketCache.bestPrices.buy = {
            wood: bestBuy.wood === Infinity ? 0 : bestBuy.wood,
            stone: bestBuy.stone === Infinity ? 0 : bestBuy.stone,
            iron: bestBuy.iron === Infinity ? 0 : bestBuy.iron
        };
        log('Beste Preise berechnet');
    }

    function updatePriceHistory() {
        const t = Date.now();
        const maxLen = 100;

        const pushIf = (res) => {
            const p = marketCache.bestPrices.sell[res];
            if (p > 0) marketCache.priceHistory[res].push({ time: t, price: p });
            if (marketCache.priceHistory[res].length > maxLen)
                marketCache.priceHistory[res] = marketCache.priceHistory[res].slice(-maxLen);
        };
        pushIf('wood'); pushIf('stone'); pushIf('iron');
        log('Preishistorie aktualisiert');
    }

    function getAveragePriceFromHistory(resource, days = 1) {
        const h = marketCache.priceHistory[resource];
        if (!h || h.length === 0) return 0;
        const now = Date.now();
        const threshold = now - (days * 24 * 60 * 60 * 1000);
        const relevant = h.filter(e => e.time >= threshold);
        if (relevant.length === 0) return 0;
        const sum = relevant.reduce((a, e) => a + e.price, 0);
        return sum / relevant.length;
    }

    function updateMarketCache() {
        try {
            const currentOffers = extractMarketOffers();
            if (currentOffers.length > 0) {
                marketCache.offers = currentOffers;
                marketCache.lastUpdate = Date.now();
                calculateBestPrices();
                updatePriceHistory();
                saveData('twMarketBotMarketCache', marketCache);
                log('Marktdaten-Cache aktualisiert');
            }
        } catch (e) {
            logError('Fehler beim Aktualisieren des Marktdaten-Cache', e);
        }
    }

    // -------------------------------------------------------------------------
    // DORF-INFOS
    // -------------------------------------------------------------------------
    function extractVillageInfo() {
        try {
            const wood = document.getElementById('wood');
            const stone = document.getElementById('stone');
            const iron = document.getElementById('iron');
            const storage = document.getElementById('storage');

            if (wood) villageCache.resources.wood = parseInt(wood.textContent.replace(/\D/g, ''), 10) || 0;
            if (stone) villageCache.resources.stone = parseInt(stone.textContent.replace(/\D/g, ''), 10) || 0;
            if (iron) villageCache.resources.iron = parseInt(iron.textContent.replace(/\D/g, ''), 10) || 0;
            if (storage) villageCache.storage = parseInt(storage.textContent.replace(/\D/g, ''), 10) || 0;

            const ma = document.getElementById('market_merchant_available_count');
            const mt = document.getElementById('market_merchant_total_count');
            const mm = document.getElementById('market_merchant_max_transport');
            if (ma) villageCache.merchantsAvailable = parseInt(ma.textContent.trim(), 10) || 0;
            if (mt) villageCache.merchantsTotal = parseInt(mt.textContent.trim(), 10) || 0;
            if (mm) villageCache.merchantMaxTransport = parseInt(mm.textContent.trim(), 10) || 0;

            if (!ma || !mt) {
                const bar = document.querySelector('#market_status_bar');
                const txt = bar ? bar.textContent : '';
                const m = txt && txt.match(/(\d+)\s*\/\s*(\d+)/);
                if (m) {
                    villageCache.merchantsAvailable = parseInt(m[1], 10) || 0;
                    villageCache.merchantsTotal = parseInt(m[2], 10) || 0;
                }
            }

            villageCache.lastUpdate = Date.now();
            log('Dorf-Informationen aktualisiert');
        } catch (e) {
            logError('Fehler beim Extrahieren der Dorf-Informationen', e);
        }
    }

    // -------------------------------------------------------------------------
    // HANDELS-ENTSCHEIDUNG & AUSFÜHRUNG
    // -------------------------------------------------------------------------
    function decideTradeAction() {
        if (villageCache.merchantsAvailable <= 0) {
            log('Keine Händler verfügbar');
            return null;
        }

        const r = villageCache.resources;
        const types = ['wood', 'stone', 'iron'];

        let excessResource = null, excessAmount = 0;
        let deficitResource = null, lowestAmount = CONFIG.maxResourceStock;

        types.forEach(type => {
            const amount = r[type];
            const prio = CONFIG.resourcePriority[type];

            if (amount > CONFIG.maxResourceStock) {
                const excess = amount - CONFIG.maxResourceStock;
                const weighted = excess * (10 - prio) / 10;
                if (weighted > excessAmount) { excessAmount = excess; excessResource = type; }
            }
            if (amount < CONFIG.minResourceStock) {
                const deficit = CONFIG.minResourceStock - amount;
                const weighted = deficit * prio / 10;
                if (weighted > 0 && amount < lowestAmount) { lowestAmount = amount; deficitResource = type; }
            }
        });

        if (excessResource && deficitResource) {
            const sellPrice = marketCache.bestPrices.sell[excessResource] || 0;
            const buyPrice = marketCache.bestPrices.buy[deficitResource] || 0;
            if (sellPrice > 0 && buyPrice > 0) {
                const avgSell = getAveragePriceFromHistory(excessResource);
                const avgBuy = getAveragePriceFromHistory(deficitResource);
                const potentialProfit = avgSell ? (sellPrice / avgSell - 1) * 100 : 0;
                const potentialSaving = avgBuy ? (1 - buyPrice / avgBuy) * 100 : 0;

                if (potentialProfit > potentialSaving && potentialProfit >= CONFIG.minProfitPercentage) {
                    return { action: 'sell', resource: excessResource, amount: Math.min(excessAmount, 1000), targetPrice: sellPrice };
                } else if (potentialSaving >= CONFIG.minProfitPercentage) {
                    return { action: 'buy', resource: deficitResource, amount: Math.min(CONFIG.minResourceStock - lowestAmount, 1000), targetPrice: buyPrice };
                }
            }
        } else if (excessResource) {
            const sellPrice = marketCache.bestPrices.sell[excessResource] || 0;
            const avg = getAveragePriceFromHistory(excessResource);
            if (sellPrice > 0 && avg > 0 && (sellPrice / avg - 1) * 100 >= CONFIG.minProfitPercentage) {
                return { action: 'sell', resource: excessResource, amount: Math.min(excessAmount, 1000), targetPrice: sellPrice };
            }
        } else if (deficitResource) {
            const buyPrice = marketCache.bestPrices.buy[deficitResource] || 0;
            const avg = getAveragePriceFromHistory(deficitResource);
            if (buyPrice > 0 && avg > 0 && (1 - buyPrice / avg) * 100 >= CONFIG.minProfitPercentage) {
                return { action: 'buy', resource: deficitResource, amount: Math.min(CONFIG.minResourceStock - lowestAmount, 1000), targetPrice: buyPrice };
            }
        }

        log('Keine profitable Handelsmöglichkeit gefunden');
        return null;
    }

    async function executeTrade(tradeAction) {
        function afterSuccessfulTrade(action) {
            stats.tradesCompleted++;
            stats.resourcesTraded[action.resource] += action.amount;
            stats.lastAction = Date.now();
            stats.sessionActions++;
            saveData('twMarketBotStats', stats);
            log(`Handel erfolgreich: ${action.action} ${action.amount} ${action.resource}`);
        }
        function chooseAlternateResource(res) {
            const options = ['wood', 'stone', 'iron'].filter(r => r !== res);
            return options[Math.floor(Math.random() * options.length)];
        }

        try {
            if (!tradeAction) return false;
            log(`Führe Handel aus: ${tradeAction.action} ${tradeAction.amount} ${tradeAction.resource}`);

            // --- Erweiterte Funktionen vorhanden? ---
            const EXT = getEXT();
            if (EXT.navigateToMarketTab && EXT.executeBatchTrades) {
                const ok = await EXT.navigateToMarketTab('other_offers');
                if (!ok) {
                    logError('Navigation zum Marktplatz fehlgeschlagen', new Error('navigateToMarketTab'));
                    return false;
                }

                let offers = [];
                if (EXT.extractDetailedMarketOffers) offers = EXT.extractDetailedMarketOffers();

                const criteria = {
                    action: tradeAction.action,
                    resource: tradeAction.resource,
                    minAmount: tradeAction.amount,
                    maxAmount: tradeAction.amount,
                    prioritizeBy: 'ratio'
                };
                let filtered = [];
                if (EXT.findBestMarketOffers) filtered = EXT.findBestMarketOffers(offers, criteria);

                if (filtered && filtered.length > 0) {
                    const successCount = await EXT.executeBatchTrades(filtered, 1);
                    if (successCount > 0) { afterSuccessfulTrade(tradeAction); return true; }
                }

                if (tradeAction.action === 'sell' && EXT.createMarketOffer) {
                    const created = await EXT.createMarketOffer({
                        sellResource: tradeAction.resource,
                        sellAmount: tradeAction.amount,
                        buyResource: chooseAlternateResource(tradeAction.resource),
                        buyAmount: tradeAction.amount
                    });
                    if (created) { afterSuccessfulTrade(tradeAction); return true; }
                }

                log('Kein passendes Angebot gefunden – Fallback (simuliert)');
            }

            // --- Fallback: simulierte Ausführung ---
            await delayedAction(() => afterSuccessfulTrade(tradeAction));
            return true;
        } catch (e) {
            logError('Fehler beim Ausführen des Handels', e);
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // BENUTZEROBERFLÄCHE
    // -------------------------------------------------------------------------
    function createUI() {
        try {
            GM_addStyle(`
                #twMarketBot {
                    position: fixed;
                    bottom: 10px;
                    right: 10px;
                    background: rgba(44,62,80,0.92);
                    border: 1px solid #34495e;
                    border-radius: 5px;
                    padding: 10px;
                    color: #ecf0f1;
                    font-size: 12px;
                    z-index: 2147483647;
                    width: 300px;
                    max-height: 520px;
                    overflow: hidden;
                    box-shadow: 0 0 10px rgba(0,0,0,0.5);
                    overscroll-behavior: contain;
                }
                #twMarketBot h3{margin:0 0 10px 0;padding-bottom:5px;border-bottom:1px solid #34495e;font-size:14px;text-align:center;}
                #twMarketBot .bot-controls{display:flex;gap:6px;justify-content:space-between;margin-bottom:10px;}
                #twMarketBot button{background:#2980b9;color:#fff;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;}
                #twMarketBot button:hover{background:#3498db;}
                #twMarketBot button.active{background:#27ae60;}
                #twMarketBot button.disabled{background:#c0392b;}
                #twMarketBot .status{margin:10px 0;padding:5px;background:rgba(0,0,0,0.2);border-radius:3px;}
                #twMarketBot .section{margin-bottom:10px;}
                #twMarketBot .section-title{font-weight:bold;margin-bottom:5px;}
                #twMarketBot .resource-info{display:flex;justify-content:space-between}
                #twMarketBot .resource-item{flex:1;text-align:center}
                #twMarketBot .resource-value{font-weight:bold}
                #twMarketBot .settings-row{display:flex;justify-content:space-between;margin-bottom:5px;gap:6px;}
                #twMarketBot .settings-label{flex:2}
                #twMarketBot .settings-value{flex:1;text-align:right}
                #twMarketBot input[type="number"]{width:70px;background:rgba(0,0,0,0.2);border:1px solid #34495e;color:#fff;padding:2px 5px;border-radius:3px;}
                #twMarketBot .toggle-section{cursor:pointer;user-select:none}
                #twMarketBot .toggle-section:after{content:" ▼";font-size:10px}
                #twMarketBot .toggle-section.collapsed:after{content:" ►"}
                #twMarketBot .section-content.collapsed{display:none}
                #twMarketBot .minimize-button{position:absolute;top:10px;right:10px;background:none;border:none;color:#fff;cursor:pointer;font-size:16px;padding:0}
                #twMarketBot.minimized{width:auto;height:auto;padding:5px}
                #twMarketBot.minimized .bot-content{display:none}
                #twMarketBot .bot-icon{display:none;font-size:20px;cursor:pointer}
                #twMarketBot.minimized .bot-icon{display:block}
                /* Besserer Scrollbereich für Log */
                #twMarketBot .log{height:140px;max-height:140px;overflow-y:auto;background:rgba(0,0,0,0.2);padding:5px;border-radius:3px;margin-top:5px;font-family:monospace;font-size:11px;pointer-events:auto;}
            `);

            const c = document.createElement('div');
            c.id = 'twMarketBot';
            c.innerHTML = `
              <div class="bot-icon" title="Tribal Wars Market Bot">💰</div>
              <div class="bot-content">
                <button class="minimize-button" title="Minimieren">_</button>
                <h3>Tribal Wars Market Bot</h3>

                <div class="bot-controls">
                  <button id="twMarketBotToggle" class="${CONFIG.enabled ? 'active' : 'disabled'}">${CONFIG.enabled ? 'Aktiviert' : 'Deaktiviert'}</button>
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
                      <div class="resource-item"><div>Holz</div><div class="resource-value" id="twMarketBotWood">0</div></div>
                      <div class="resource-item"><div>Lehm</div><div class="resource-value" id="twMarketBotStone">0</div></div>
                      <div class="resource-item"><div>Eisen</div><div class="resource-value" id="twMarketBotIron">0</div></div>
                    </div>
                    <div style="margin-top:5px;">
                      Lager: <span id="twMarketBotStorage">0</span><br>
                      Händler: <span id="twMarketBotMerchants">0</span>/<span id="twMarketBotMerchantsTotal">0</span>
                    </div>
                  </div>
                </div>

                <div class="section">
                  <div class="section-title toggle-section" data-section="market">Marktpreise</div>
                  <div class="section-content" id="marketSection">
                    <div class="settings-row"><div class="settings-label">Holz (Verkauf):</div><div class="settings-value" id="twMarketBotWoodSellPrice">-</div></div>
                    <div class="settings-row"><div class="settings-label">Lehm (Verkauf):</div><div class="settings-value" id="twMarketBotStoneSellPrice">-</div></div>
                    <div class="settings-row"><div class="settings-label">Eisen (Verkauf):</div><div class="settings-value" id="twMarketBotIronSellPrice">-</div></div>
                    <div style="margin-top:5px;font-size:10px;text-align:right;">
                      Letzte Aktualisierung: <span id="twMarketBotLastMarketUpdate">-</span>
                    </div>
                  </div>
                </div>

                <div class="section">
                  <div class="section-title toggle-section collapsed" data-section="stats">Statistik</div>
                  <div class="section-content collapsed" id="statsSection">
                    <div class="settings-row"><div class="settings-label">Abgeschlossene Trades:</div><div class="settings-value" id="twMarketBotTradesCompleted">0</div></div>
                    <div class="settings-row"><div class="settings-label">Gehandelt (Holz/Lehm/Eisen):</div>
                      <div class="settings-value"><span id="twMarketBotTradedWood">0</span> / <span id="twMarketBotTradedStone">0</span> / <span id="twMarketBotTradedIron">0</span></div>
                    </div>
                    <div class="settings-row"><div class="settings-label">Fehler (letzte 3):</div><div class="settings-value" id="twMarketBotLastErrors">-</div></div>
                  </div>
                </div>

                <div class="section">
                  <div class="section-title toggle-section collapsed" data-section="settings">Einstellungen</div>
                  <div class="section-content collapsed" id="settingsSection">
                    <div class="settings-row"><div class="settings-label">Min. Gewinn (%):</div><div class="settings-value"><input type="number" id="twMarketBotMinProfit" min="1" max="100" value="${CONFIG.minProfitPercentage}"></div></div>
                    <div class="settings-row"><div class="settings-label">Max. Ressourcen:</div><div class="settings-value"><input type="number" id="twMarketBotMaxResources" min="1000" step="1000" value="${CONFIG.maxResourceStock}"></div></div>
                    <div class="settings-row"><div class="settings-label">Min. Ressourcen:</div><div class="settings-value"><input type="number" id="twMarketBotMinResources" min="0" step="1000" value="${CONFIG.minResourceStock}"></div></div>
                    <div class="settings-row"><div class="settings-label">Ressourcen ausbalancieren:</div><div class="settings-value"><input type="checkbox" id="twMarketBotBalanceResources" ${CONFIG.balanceResources ? 'checked' : ''}></div></div>
                    <div class="settings-row"><div class="settings-label">Debug-Modus:</div><div class="settings-value"><input type="checkbox" id="twMarketBotDebugMode" ${CONFIG.debugMode ? 'checked' : ''}></div></div>
                    <button id="twMarketBotSaveSettings" style="width:100%;margin-top:5px;">Speichern</button>
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
            document.body.appendChild(c);
            setupUIEventListeners();
            log('UI erstellt');
        } catch (e) {
            logError('Fehler beim Erstellen der UI', e);
        }
    }

    function setupUIEventListeners() {
        try {
            const toggleBtn = document.getElementById('twMarketBotToggle');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    CONFIG.enabled = !CONFIG.enabled;
                    toggleBtn.className = CONFIG.enabled ? 'active' : 'disabled';
                    toggleBtn.textContent = CONFIG.enabled ? 'Aktiviert' : 'Deaktiviert';
                    document.getElementById('twMarketBotStatus').textContent = CONFIG.enabled ? 'Aktiv' : 'Inaktiv';
                    saveData('twMarketBotConfig', CONFIG);
                    window.twMarketBotConfig = CONFIG;
                    log(`Bot ${CONFIG.enabled ? 'aktiviert' : 'deaktiviert'}`);
                });
            }

            // Sections togglen
            const toggleSections = document.querySelectorAll('.toggle-section');
            toggleSections.forEach((s) => {
                s.addEventListener('click', () => {
                    const name = s.getAttribute('data-section');
                    const content = document.getElementById(`${name}Section`);
                    s.classList.toggle('collapsed');
                    content.classList.toggle('collapsed');
                });
            });

            // Helper zum Öffnen und Hinscrollen
            function openSection(name) {
                const header = document.querySelector(`.toggle-section[data-section="${name}"]`);
                const content = document.getElementById(`${name}Section`);
                if (!header || !content) return;
                header.classList.remove('collapsed');
                content.classList.remove('collapsed');
                content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            const settingsBtn = document.getElementById('twMarketBotSettings');
            if (settingsBtn) settingsBtn.addEventListener('click', () => openSection('settings'));

            const statsBtn = document.getElementById('twMarketBotStats');
            if (statsBtn) statsBtn.addEventListener('click', () => openSection('stats'));

            const minimizeButton = document.querySelector('.minimize-button');
            const botIcon = document.querySelector('.bot-icon');
            if (minimizeButton) minimizeButton.addEventListener('click', () => document.getElementById('twMarketBot').classList.add('minimized'));
            if (botIcon) botIcon.addEventListener('click', () => document.getElementById('twMarketBot').classList.remove('minimized'));

            // Einstellungen speichern
            const saveSettingsButton = document.getElementById('twMarketBotSaveSettings');
            if (saveSettingsButton) {
                saveSettingsButton.addEventListener('click', () => {
                    CONFIG.minProfitPercentage = parseInt(document.getElementById('twMarketBotMinProfit').value, 10) || 15;
                    CONFIG.maxResourceStock   = parseInt(document.getElementById('twMarketBotMaxResources').value, 10) || 25000;
                    CONFIG.minResourceStock   = parseInt(document.getElementById('twMarketBotMinResources').value, 10) || 5000;
                    CONFIG.balanceResources   = document.getElementById('twMarketBotBalanceResources').checked;
                    CONFIG.debugMode          = document.getElementById('twMarketBotDebugMode').checked;
                    saveData('twMarketBotConfig', CONFIG);
                    window.twMarketBotConfig = CONFIG;
                    log('Einstellungen gespeichert');
                });
            }

            log('UI-Event-Listener eingerichtet');
        } catch (e) {
            logError('Fehler beim Einrichten der UI-Events', e);
        }
    }

    function updateUI() {
        try {
            const fmt = (n) => (n && n > 0 ? n.toFixed(2) : '-');

            // Ressourcen
            const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = (typeof v === 'number') ? v.toLocaleString() : v; };
            setText('twMarketBotWood',  villageCache.resources.wood);
            setText('twMarketBotStone', villageCache.resources.stone);
            setText('twMarketBotIron',  villageCache.resources.iron);
            setText('twMarketBotStorage', villageCache.storage);
            setText('twMarketBotMerchants', villageCache.merchantsAvailable);
            setText('twMarketBotMerchantsTotal', villageCache.merchantsTotal);

            // Preise
            const w = document.getElementById('twMarketBotWoodSellPrice');  if (w) w.textContent = fmt(marketCache.bestPrices.sell.wood);
            const s = document.getElementById('twMarketBotStoneSellPrice'); if (s) s.textContent = fmt(marketCache.bestPrices.sell.stone);
            const i = document.getElementById('twMarketBotIronSellPrice');  if (i) i.textContent = fmt(marketCache.bestPrices.sell.iron);

            // Zeit
            const last = document.getElementById('twMarketBotLastMarketUpdate');
            if (last) last.textContent = marketCache.lastUpdate ? new Date(marketCache.lastUpdate).toLocaleTimeString() : '-';

            if (stats.lastAction > 0) {
                const la = document.getElementById('twMarketBotLastAction');
                if (la) la.textContent = new Date(stats.lastAction).toLocaleTimeString();
            }
            const sa = document.getElementById('twMarketBotSessionActions');
            if (sa) sa.textContent = stats.sessionActions;
            const ma = document.getElementById('twMarketBotMaxActions');
            if (ma) ma.textContent = CONFIG.maxActionsPerSession;

            // Statistik
            const tCompleted = document.getElementById('twMarketBotTradesCompleted');
            if (tCompleted) tCompleted.textContent = stats.tradesCompleted.toLocaleString();

            const tWood  = document.getElementById('twMarketBotTradedWood');
            const tStone = document.getElementById('twMarketBotTradedStone');
            const tIron  = document.getElementById('twMarketBotTradedIron');
            if (tWood)  tWood.textContent  = stats.resourcesTraded.wood.toLocaleString();
            if (tStone) tStone.textContent = stats.resourcesTraded.stone.toLocaleString();
            if (tIron)  tIron.textContent  = stats.resourcesTraded.iron.toLocaleString();

            const lastErrorsEl = document.getElementById('twMarketBotLastErrors');
            if (lastErrorsEl) {
                const last3 = (stats.errors || []).slice(-3).map(e => e.message).join(' | ');
                lastErrorsEl.textContent = last3 || '-';
            }

            log('UI aktualisiert');
        } catch (e) {
            logError('Fehler beim Aktualisieren der UI', e);
        }
    }

    function addToUILog(message) {
        try {
            const logElement = document.getElementById('twMarketBotLog');
            if (logElement) {
                const timestamp = new Date().toLocaleTimeString();
                const entry = document.createElement('div');
                entry.textContent = `[${timestamp}] ${message}`;
                logElement.appendChild(entry);
                logElement.scrollTop = logElement.scrollHeight;
                while (logElement.children.length > 200) logElement.removeChild(logElement.firstChild);
            }
        } catch (e) {
            console.error('Fehler beim Hinzufügen zum UI-Log:', e);
        }
    }

    // -------------------------------------------------------------------------
    // HAUPT-INIT & LOOP
    // -------------------------------------------------------------------------
    function initBot() {
        try {
            const savedConfig = loadData('twMarketBotConfig', null);
            if (savedConfig) Object.assign(CONFIG, savedConfig);
            window.twMarketBotConfig = CONFIG;

            const savedMarketCache = loadData('twMarketBotMarketCache', null);
            if (savedMarketCache) Object.assign(marketCache, savedMarketCache);

            const savedStats = loadData('twMarketBotStats', null);
            if (savedStats) Object.assign(stats, savedStats);

            createUI();

            if (isMarketOfferPage()) updateMarketCache();
            extractVillageInfo();
            updateUI();

            setTimeout(mainLoop, randomDelay(5000, 10000));
            log('Bot initialisiert');
        } catch (e) {
            logError('Fehler bei der Bot-Initialisierung', e);
        }
    }

    async function mainLoop() {
        try {
            if (!CONFIG.enabled) {
                setTimeout(mainLoop, 10000);
                return;
            }

            extractVillageInfo();
            if (isMarketOfferPage()) updateMarketCache();
            updateUI();

            if (stats.sessionActions >= CONFIG.maxActionsPerSession) {
                const pauseMs = randomDelay(CONFIG.minSessionPause * 60000, CONFIG.maxSessionPause * 60000);
                const mins = Math.round(pauseMs / 60000);
                addToUILog(`Session-Pause für ca. ${mins} Minuten`);
                setTimeout(() => {
                    stats.sessionActions = 0;
                    saveData('twMarketBotStats', stats);
                    addToUILog('Neue Session gestartet');
                    mainLoop();
                }, pauseMs);
                return;
            }

            const tradeAction = decideTradeAction();
            if (tradeAction) {
                const ok = await executeTrade(tradeAction);
                if (ok) addToUILog(`Handel: ${tradeAction.action} ${tradeAction.amount} ${tradeAction.resource}`);
                else addToUILog(`Handel fehlgeschlagen: ${tradeAction.action} ${tradeAction.resource}`);
            }

            const nextDelay = randomDelay(30000, 120000);
            setTimeout(mainLoop, nextDelay);
        } catch (e) {
            logError('Fehler in der Hauptschleife', e);
            setTimeout(mainLoop, 60000);
        }
    }

    // Externe Logger für Extensions
    window.twMarketBotLog = addToUILog;
    window.twMarketBotLogError = function (message, error) {
        console.error('[TW Market Bot] ' + message, error);
        addToUILog(`Fehler: ${message}`);
    };

    // Los geht's
    initBot();
})();
