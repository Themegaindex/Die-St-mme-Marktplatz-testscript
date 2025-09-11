// ==UserScript==
// @name         Tribal Wars Market Bot (DE tuned, persistent logs + flows + own offers)
// @namespace    https://github.com/Themegaindex/Die-St-mme-Marktplatz-testscript
// @version      1.6.0
// @description  Markt-Bot: Rebalancing, Gewinn-Trades, Pagination, eigene Angebote (1:1), robuste Navigation, verifizierte Stats, persistentes UI-Log, Transport-Flows im UI, flexibles Panel (drag+resize).
// @author       Themegaindex
// @match        *://*.die-staemme.de/*
// @require      https://raw.githubusercontent.com/Themegaindex/Die-St-mme-Marktplatz-testscript/main/extension.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  const VERSION = '1.6.0';

  // --------------------------- STORAGE KEYS ---------------------------
  const STORE = {
    config:   'twMarketBotConfig',
    market:   'twMarketBotMarketCache',
    stats:    'twMarketBotStats',
    pending:  'twMarketPending',
    uiLog:    'twMarketUILog',
    pause:    'twMarketPauseUntil'
  };

  // --------------------------- KONFIG ---------------------------
  const CONFIG = {
    enabled: true,
    debugMode: false,

    // Anti-Detection
    minActionDelay: 1500,
    maxActionDelay: 4500,
    minSessionPause: 15,   // Minuten
    maxSessionPause: 45,
    maxActionsPerSession: 12,
    humanPatterns: true,

    // Strategie
    minProfitPercentage: 6,     // 5–7 % sinnvoll
    maxTravelHours: 5,          // max. Laufzeit
    balanceResources: true,

    // Eigene Angebote (1:1 Pflicht auf deiner Welt)
    allowOwnOffers: true,
    ownOfferMaxHours: 5,
    ownOfferPreferChunk: true,          // pro Angebot i.d.R. 1 Händlerladung
    urgentDeficitThresholdPct: 0.10,    // < Min −10%*Lager => dringender Bedarf

    // Auto-Limits (skaliert mit Lager)
    autoLimits: true,
    minPctOfStorage: 0.20,
    maxPctOfStorage: 0.80,

    // Fallback, falls Auto-Limits aus
    maxResourceStock: 25000,
    minResourceStock: 5000,

    // Prioritäten (Holz/Lehm bevorzugt)
    resourcePriority: { wood: 8, stone: 8, iron: 4 },

    // Wie viele Zusatzseiten pro Scan
    pagesPerScan: 2
  };

  // --------------------------- STATE ---------------------------
  const marketCache = {
    offers: [],
    lastUpdate: 0,
    priceHistory: { wood: [], stone: [], iron: [] },
    bestPrices: {
      buy:  { wood: 0, stone: 0, iron: 0 },
      sell: { wood: 0, stone: 0, iron: 0 }
    }
  };

  const villageCache = {
    resources: { wood: 0, stone: 0, iron: 0 },
    storage: 0,
    merchantsAvailable: 0,
    merchantsTotal: 0,
    merchantMaxTransport: 1000,
    tradeFlows: {
      incoming: { wood: 0, stone: 0, iron: 0 },
      outgoing: { wood: 0, stone: 0, iron: 0 },
      merchantsBusy: 0
    },
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

  // Pending Aktionen für saubere Verifikation
  let pending = []; // {type:'accept'|'own_offer', merchantsBefore, merchantsExpectedDelta, receiveRes, receiveAmount, ts}

  // Laufzeit
  let lastReason = '-';
  let pauseUntil = 0;

  // --------------------------- EXT (Bridge) ---------------------------
  const EXT = () =>
    (typeof window !== 'undefined' && window.twMarketExtensions)
      ? window.twMarketExtensions
      : {};

  // --------------------------- UTILS ---------------------------
  function randomDelay(min, max) {
    const variance = Math.random() * 0.3 + 0.85;
    return Math.floor((Math.random() * (max - min + 1) + min) * variance);
  }
  function randomWait(min, max) {
    return new Promise(res => setTimeout(res, randomDelay(min, max)));
  }
  function saveData(k, v) { try { GM_setValue(k, JSON.stringify(v)); } catch {} }
  function loadData(k, d) { try { const v = GM_getValue(k); return v ? JSON.parse(v) : d; } catch { return d; } }

  // Persistentes UI-Log
  function readUILog() { return loadData(STORE.uiLog, []); }
  function pushUILogLine(msg) {
    const list = readUILog();
    list.push({ ts: Date.now(), msg: String(msg) });
    const trimmed = list.slice(-400);
    saveData(STORE.uiLog, trimmed);
  }

  function getEffectiveMin() {
    return CONFIG.autoLimits ? Math.round(villageCache.storage * CONFIG.minPctOfStorage) : CONFIG.minResourceStock;
  }
  function getEffectiveMax() {
    return CONFIG.autoLimits ? Math.round(villageCache.storage * CONFIG.maxPctOfStorage) : CONFIG.maxResourceStock;
  }

  // --------------------------- PAGE HELPERS ---------------------------
  function isMarketPage() { return location.href.includes('screen=market'); }
  function findOffersTable() {
    const tables = Array.from(document.querySelectorAll('table.vis'));
    for (const tbl of tables) {
      const firstRow = tbl.querySelector('tr');
      if (!firstRow) continue;
      const headerText = firstRow.innerText.toLowerCase();
      if (headerText.includes('erhalte') && headerText.includes('für') &&
          headerText.includes('verhältnis') && headerText.includes('annehmen')) {
        return tbl;
      }
    }
    return null;
  }
  function isMarketOfferPage() {
    if (!isMarketPage()) return false;
    if (location.href.includes('mode=other_offer')) return true;
    return !!findOffersTable();
  }
  function parseTimeToMinutes(txt) {
    if (!txt) return 0;
    const p = txt.trim().split(':').map(n => parseInt(n, 10) || 0);
    if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
    if (p.length === 2) return p[0] * 60 + p[1];
    return 0;
  }

  // --------------------------- MARKET PARSER ---------------------------
  function extractMarketOffers() {
    const offers = [];
    try {
      const table = findOffersTable();
      if (!table) { log('Keine Angebots-Tabelle gefunden'); return offers; }
      const rows = Array.from(table.querySelectorAll('tr')).slice(1);

      for (const row of rows) {
        const tds = row.querySelectorAll('td');
        if (tds.length < 6) continue;

        const sellCell  = tds[0];
        const buyCell   = tds[1];
        const timeCell  = tds[3];
        const ratioCell = tds[4];
        const availCell = tds[5];
        const actionCell = tds[6] || tds[tds.length - 1];

        const resFrom = (cell) => {
          if (!cell) return '';
          if (cell.querySelector('.wood'))  return 'wood';
          if (cell.querySelector('.stone')) return 'stone';
          if (cell.querySelector('.iron'))  return 'iron';
          return '';
        };
        const numFrom = (cell) => parseInt((cell?.textContent || '').replace(/\D/g, ''), 10) || 0;

        const sellResource = resFrom(sellCell);
        const buyResource  = resFrom(buyCell);
        const sellAmount   = numFrom(sellCell);
        const buyAmount    = numFrom(buyCell);
        if (!sellResource || !buyResource || sellAmount <= 0 || buyAmount <= 0) continue;

        let ratio = buyAmount / sellAmount;
        const rTxt = (ratioCell?.textContent || '').replace(',', '.');
        const rMatch = rTxt.match(/(\d+(?:\.\d+)?)/);
        if (rMatch) ratio = parseFloat(rMatch[1]);

        const availability = (() => {
          const m = (availCell?.textContent || '').match(/(\d+)/);
          return m ? parseInt(m[1], 10) : 1;
        })();

        const form = actionCell ? actionCell.querySelector('form.market_accept_offer') : null;
        const idInput = form ? form.querySelector('input[name="id"]') : null;

        const offer = {
          id: idInput ? idInput.value : '',
          sellResource, sellAmount,
          buyResource,  buyAmount,
          ratio,
          travelTime: timeCell ? timeCell.textContent.trim() : '',
          travelMinutes: parseTimeToMinutes(timeCell ? timeCell.textContent : ''),
          availability,
          canAccept: !!form,
          acceptForm: form,
          merchantsRequired: Math.max(1, Math.ceil(buyAmount / (villageCache.merchantMaxTransport || 1000))),
          timestamp: Date.now()
        };

        offers.push(offer);
      }
      log(`${offers.length} Marktangebote extrahiert`);
    } catch (e) { logError('Fehler beim Extrahieren der Marktangebote', e); }
    return offers;
  }

  function calculateBestPrices() {
    const bestSell = { wood: 0, stone: 0, iron: 0 };
    const bestBuy  = { wood: Infinity, stone: Infinity, iron: Infinity };

    for (const o of marketCache.offers) {
      const r = o.ratio;
      if (r > bestSell[o.sellResource]) bestSell[o.sellResource] = r;
      if (r < bestBuy[o.sellResource])  bestBuy[o.sellResource]  = r;
    }
    marketCache.bestPrices.sell = bestSell;
    marketCache.bestPrices.buy = {
      wood: bestBuy.wood === Infinity ? 0 : bestBuy.wood,
      stone: bestBuy.stone === Infinity ? 0 : bestBuy.stone,
      iron: bestBuy.iron === Infinity ? 0 : bestBuy.iron
    };
    log('Beste Preise berechnet');
  }

  function updatePriceHistory() {
    const t = Date.now(), L = 100;
    ['wood','stone','iron'].forEach(res => {
      const p = marketCache.bestPrices.sell[res];
      if (p > 0) marketCache.priceHistory[res].push({ time: t, price: p });
      if (marketCache.priceHistory[res].length > L)
        marketCache.priceHistory[res] = marketCache.priceHistory[res].slice(-L);
    });
    log('Preishistorie aktualisiert');
  }

  function updateMarketCache() {
    try {
      const cur = extractMarketOffers();
      if (cur.length) {
        marketCache.offers = cur;
        marketCache.lastUpdate = Date.now();
        calculateBestPrices();
        updatePriceHistory();
        saveData(STORE.market, marketCache);
        log('Marktdaten-Cache aktualisiert');
      }
    } catch (e) { logError('Fehler beim Aktualisieren des Marktdaten-Cache', e); }
  }

  // --------------------------- FLOWS / DORF-INFO ---------------------------
  function extractFlowsFromStatusBar() {
    const flows = {
      incoming: { wood:0, stone:0, iron:0 },
      outgoing: { wood:0, stone:0, iron:0 }
    };
    try {
      const bar = document.getElementById('market_status_bar');
      if (!bar) return flows;
      const ths = Array.from(bar.querySelectorAll('th'));
      const parseTh = (th, target) => {
        const wraps = th.querySelectorAll('span.nowrap');
        wraps.forEach(w => {
          const txt = (w.textContent || '').replace(/\s+/g,'');
          const amt = parseInt(txt.replace(/\D/g,''),10) || 0;
          let res = '';
          if (w.querySelector('.wood'))  res = 'wood';
          if (w.querySelector('.stone')) res = 'stone';
          if (w.querySelector('.iron'))  res = 'iron';
          if (res) target[res] += amt;
        });
      };
      ths.forEach(th => {
        const head = (th.textContent || '').trim().toLowerCase();
        if (head.startsWith('eintreffend')) parseTh(th, flows.incoming);
        if (head.startsWith('ausgehend'))  parseTh(th, flows.outgoing);
      });
      return flows;
    } catch { return flows; }
  }

  function extractMerchantsBusy() {
    try {
      // Suche nach Tabelle mit Überschrift "Händlerstatus"
      const tables = Array.from(document.querySelectorAll('table.vis'));
      for (const tbl of tables) {
        const hdr = tbl.querySelector('th');
        if (!hdr) continue;
        if (hdr.textContent && hdr.textContent.includes('Händlerstatus')) {
          const rows = Array.from(tbl.querySelectorAll('tr'));
          for (const r of rows) {
            const tds = r.querySelectorAll('td');
            if (tds.length === 2 && (tds[0].textContent || '').includes('Händler beschäftigt')) {
              const n = parseInt(tds[1].textContent.replace(/\D/g,''), 10) || 0;
              return n;
            }
          }
        }
      }
      return 0;
    } catch { return 0; }
  }

  function extractVillageInfo() {
    try {
      const w = document.getElementById('wood');
      const s = document.getElementById('stone');
      const i = document.getElementById('iron');
      const st = document.getElementById('storage');
      if (w) villageCache.resources.wood = parseInt(w.textContent.replace(/\D/g, ''), 10) || 0;
      if (s) villageCache.resources.stone = parseInt(s.textContent.replace(/\D/g, ''), 10) || 0;
      if (i) villageCache.resources.iron  = parseInt(i.textContent.replace(/\D/g, ''), 10) || 0;
      if (st) villageCache.storage = parseInt(st.textContent.replace(/\D/g, ''), 10) || 0;

      const ma = document.getElementById('market_merchant_available_count');
      const mt = document.getElementById('market_merchant_total_count');
      const mc = document.getElementById('market_merchant_max_transport');
      if (ma) villageCache.merchantsAvailable = parseInt(ma.textContent.trim(), 10) || 0;
      if (mt) villageCache.merchantsTotal     = parseInt(mt.textContent.trim(), 10) || 0;
      if (mc) {
        const cap = parseInt(mc.textContent.trim(), 10);
        // Fallback: niemals auf 0 überschreiben
        if (!isNaN(cap) && cap > 0) {
          villageCache.merchantMaxTransport = cap;
        }
      }

      // Flows + Händler beschäftigt
      const flows = extractFlowsFromStatusBar();
      villageCache.tradeFlows.incoming = flows.incoming;
      villageCache.tradeFlows.outgoing = flows.outgoing;
      villageCache.tradeFlows.merchantsBusy = extractMerchantsBusy();

      villageCache.lastUpdate = Date.now();

      // Exponieren für Extensions (inkl. effektiver Min/Max)
      window.twMarketBotConfig  = Object.assign({}, CONFIG, { merchantMaxTransport: villageCache.merchantMaxTransport, __version: VERSION });
      window.twMarketBotVillage = JSON.parse(JSON.stringify(villageCache));
      window.twMarketBotLimits  = { min: getEffectiveMin(), max: getEffectiveMax() };

      log('Dorf-Informationen aktualisiert');
    } catch (e) { logError('Fehler beim Extrahieren der Dorf-Informationen', e); }
  }

  // --------------------------- ENTSCHEIDUNG ---------------------------
  function decideTradeAction() {
    lastReason = '-';
    if (villageCache.merchantsAvailable <= 0) {
      lastReason = 'Keine Händler frei';
      return null;
    }
    if (!marketCache.offers.length) {
      lastReason = 'Keine Marktangebote erkannt';
      return null;
    }

    const MIN = getEffectiveMin();
    const MAX = getEffectiveMax();
    const minAfterPay = Math.floor(MIN * 0.9);
    const res = villageCache.resources;
    const types = ['wood','stone','iron'];
    const travelLimit = CONFIG.maxTravelHours * 60;

    let excessResource = null, excessAmount = 0;
    let deficitResource = null, deficitGap = 0;

    // Überschuss/Defizit (gewichtete Prioritäten)
    types.forEach(t => {
      const amount = res[t];
      if (amount > MAX) {
        const over = amount - MAX;
        const weighted = over * (10 - CONFIG.resourcePriority[t]) / 10;
        if (weighted > excessAmount) { excessAmount = over; excessResource = t; }
      }
      if (amount < MIN) {
        const gap = MIN - amount;
        const weighted = gap * CONFIG.resourcePriority[t] / 10;
        if (weighted > deficitGap) { deficitGap = gap; deficitResource = t; }
      }
    });

    // Rebalancing-Kauf (nur wenn Zahleressource ≥ Min-Schutz)
    if (CONFIG.balanceResources && deficitResource) {
      const affordable = marketCache.offers.some(o =>
        o.canAccept &&
        o.sellResource === deficitResource &&
        o.travelMinutes <= travelLimit &&
        villageCache.resources[o.buyResource] >= o.buyAmount &&
        villageCache.resources[o.buyResource] - o.buyAmount >= minAfterPay &&
        villageCache.merchantsAvailable >= o.merchantsRequired
      );
      if (affordable) {
        lastReason = `Rebalancing: kaufe ${deficitResource} (≤ ${CONFIG.maxTravelHours}h, bezahlbar, Min‑Schutz)`;
        log(lastReason);
        return { kind:'accept', action:'buy', resource:deficitResource, rebalancing:true };
      }
    }

    // Profit-getriebene Trades (dezent, da Welt 1:1)
    if (excessResource && deficitResource) {
      const sellP = marketCache.bestPrices.sell[excessResource] || 0;
      const buyP  = marketCache.bestPrices.buy[deficitResource]  || 0;
      const avgS  = getAveragePriceFromHistory(excessResource) || 1;
      const avgB  = getAveragePriceFromHistory(deficitResource) || 1;
      const profit  = (sellP / avgS - 1) * 100;
      const saving  = (1 - buyP / avgB) * 100;

      if (saving >= CONFIG.minProfitPercentage) {
        lastReason = `Spare ~${saving.toFixed(1)}% ggü. Ø bei Kauf von ${deficitResource}`;
        return { kind:'accept', action:'buy', resource:deficitResource };
      } else if (profit >= CONFIG.minProfitPercentage) {
        lastReason = `Verkaufschance ~${profit.toFixed(1)}% über Ø für ${excessResource}`;
        return { kind:'accept', action:'sell', resource:excessResource };
      }
    }

    // Eigene Angebote (1:1) – wenn Defizit besteht, aber nichts Kaufbares gefunden
    if (CONFIG.allowOwnOffers && deficitResource) {
      const order = types.slice().sort((a,b)=>{
        const aw = res[a] - MIN + (CONFIG.resourcePriority[a]||0)*10;
        const bw = res[b] - MIN + (CONFIG.resourcePriority[b]||0)*10;
        return bw - aw;
      });
      const sellRes = order.find(r => res[r] > MIN + Math.min(villageCache.merchantMaxTransport, deficitGap));
      if (sellRes) {
        lastReason = `Eigenangebot: tausche ${sellRes} → ${deficitResource} (1:1)`;
        return { kind:'own_offer', sellRes, buyRes: deficitResource };
      }
    }

    if (!excessResource && !deficitResource)
      lastReason = `Alle Ressourcen innerhalb Min/Max (${MIN}/${MAX})`;
    else
      lastReason = `Kein Angebot (Gewinn ≥ ${CONFIG.minProfitPercentage}%, Dauer ≤ ${CONFIG.maxTravelHours}h, Min‑Schutz)`;

    log('Keine profitable Handelsmöglichkeit gefunden');
    return null;
  }

  function getAveragePriceFromHistory(res, days = 1) {
    const h = marketCache.priceHistory[res] || [];
    if (!h.length) return 0;
    const thr = Date.now() - days * 86400000;
    const r = h.filter(x => x.time >= thr);
    if (!r.length) return 0;
    return r.reduce((a, x) => a + x.price, 0) / r.length;
  }

  // --------------------------- TRADE ---------------------------
  async function executeTrade(trade) {
    try {
      const ext = EXT();
      if (!ext || !ext.navigateToMarketTab) {
        lastReason = 'Extension fehlt/alt → bitte neu einfügen';
        log(lastReason);
        return false;
      }

      if (trade.kind === 'accept') {
        // 1) Sicher zum „Handel“-Tab
        log('Navigating to other_offer tab');
        const nav = await ext.navigateToMarketTab('other_offer');
        if (nav !== true) { lastReason = nav === null ? 'Navigation angestoßen (Reload)' : 'Navigation fehlgeschlagen'; return false; }

        // 2) Angebote sammeln & filtern
        let offers = ext.extractDetailedMarketOffers();
        const MIN = getEffectiveMin();
        const minAfterPay = Math.floor(MIN * 0.9);
        const criteria = {
          action: trade.action,               // 'buy' oder 'sell'
          resource: trade.resource,           // gewünschte Ressource bei buy
          minAmount: 1,
          maxTravelMinutes: CONFIG.maxTravelHours * 60,
          prioritizeBy: 'ratio',
          minAfterPay
        };
        let filtered = ext.findBestMarketOffers(offers, criteria);

        // 3) Pagination
        if ((!filtered || !filtered.length) && typeof ext.searchOffersWithPagination === 'function') {
          filtered = await ext.searchOffersWithPagination(criteria, CONFIG.pagesPerScan);
        }
        if (!filtered || !filtered.length) {
          lastReason = 'Kein akzeptierbares Angebot (Zeit/Händler/Ressourcen/Min‑Limit)';
          log(lastReason);
          return false;
        }

        // 4) Annehmen (echtes Submit)
        const offer = filtered[0];
        const result = await ext.acceptMarketOffer(offer, { maxCount: 1, respectMinAfterPay: true });
        if (result && result.submitted) {
          pending.push({
            type: 'accept',
            merchantsBefore: villageCache.merchantsAvailable,
            merchantsExpectedDelta: offer.merchantsRequired * (result.count || 1),
            receiveRes: offer.sellResource,
            receiveAmount: offer.sellAmount * (result.count || 1),
            ts: Date.now()
          });
          saveData(STORE.pending, pending);
          lastReason = `Handel abgesendet: ${trade.action} ${offer.sellAmount} ${offer.sellResource} (x${result.count||1})`;
          log(lastReason);
          return true;
        }
        lastReason = 'Annahme fehlgeschlagen';
        return false;
      }

      if (trade.kind === 'own_offer') {
        // 1) Eigene Angebote Seite
        log('Navigating to own_offer tab');
        const nav = await ext.navigateToMarketTab('own_offer');
        if (nav !== true) { lastReason = nav === null ? 'Navigation angestoßen (Reload)' : 'Navigation fehlgeschlagen'; return false; }

        // 2) Angebot berechnen (1 Händlerladung, falls möglich)
        const carry = villageCache.merchantMaxTransport || 1000;
        const MIN = getEffectiveMin();
        const freeFrom = Math.max(0, villageCache.resources[trade.sellRes] - MIN);
        if (freeFrom < 1) { lastReason = 'Kein Überschuss für Eigenangebot'; return false; }

        let perOffer = CONFIG.ownOfferPreferChunk ? Math.min(carry, freeFrom) : Math.max(100, Math.min(freeFrom, carry));
        perOffer = Math.max(1, Math.floor(perOffer)); // ganze Einheiten
        const needPerOffer = Math.max(1, Math.ceil(perOffer / carry));
        const maxOffersByMerchants = Math.floor((villageCache.merchantsAvailable || 0) / needPerOffer);
        if (maxOffersByMerchants < 1) { lastReason = 'Keine Händler frei für Eigenangebot'; return false; }

        const count = 1; // konservativ
        const result = await ext.createOwnOffer({
          sellRes: trade.sellRes,
          buyRes: trade.buyRes,
          amountPerOffer: perOffer, // 1:1 – gleiche Zahl in buy & sell
          count,
          maxHours: CONFIG.ownOfferMaxHours
        });

        if (result && result.submitted) {
          pending.push({
            type: 'own_offer',
            merchantsBefore: villageCache.merchantsAvailable,
            merchantsExpectedDelta: needPerOffer * (result.count || count),
            receiveRes: trade.buyRes,
            receiveAmount: 0,
            ts: Date.now()
          });
          saveData(STORE.pending, pending);
          lastReason = `Eigenes Angebot erstellt: ${perOffer} ${trade.sellRes} → ${trade.buyRes} (x${result.count||count})`;
          log(lastReason);
          return true;
        }
        lastReason = 'Eigenes Angebot fehlgeschlagen';
        return false;
      }

      return false;
    } catch (e) {
      logError('Fehler beim Ausführen des Handels', e);
      lastReason = 'Fehler beim Ausführen des Handels';
      return false;
    }
  }

  // Verifizierung: wurden Händler wirklich belegt? Erst dann „abgeschlossen“.
  function confirmPendingIfAny() {
    try {
      const saved = loadData(STORE.pending, []);
      if (saved?.length) pending = saved;
      if (!pending.length) return;

      const now = Date.now();
      const kept = [];

      for (const p of pending) {
        const expired = (now - p.ts) > 5 * 60 * 1000;
        const merchantsOk = (villageCache.merchantsAvailable <= (p.merchantsBefore - p.merchantsExpectedDelta));
        if (merchantsOk) {
          // Abschluss
          stats.tradesCompleted++;
          if (p.receiveRes && p.receiveAmount) {
            stats.resourcesTraded[p.receiveRes] = (stats.resourcesTraded[p.receiveRes] || 0) + p.receiveAmount;
          }
          stats.sessionActions++;
          stats.lastAction = now;
          saveData(STORE.stats, stats);
        } else if (!expired) {
          kept.push(p);
        }
      }
      pending = kept;
      saveData(STORE.pending, pending);
    } catch (e) {
      logError('Fehler bei Pending-Verifikation', e);
    }
  }

  // --------------------------- UI ---------------------------
  function createUI() {
    try {
      const old = document.getElementById('twMarketBot');
      if (old) old.remove();

      GM_addStyle(`
        #twMarketBot{position:fixed;top:72px;left:10px;right:auto;bottom:auto;background:rgba(35,47,62,.96);border:1px solid #2b3b52;border-radius:6px;padding:10px;color:#ecf0f1;font-size:12px;z-index:2147483647;width:380px;max-height:72vh;overflow:auto;box-shadow:0 8px 20px rgba(0,0,0,.35);backdrop-filter:saturate(120%) blur(2px);resize:both}
        #twMarketBot h3{margin:0 0 8px;padding:6px 8px;border:1px solid #2b3b52;border-radius:4px;background:rgba(0,0,0,.15);font-size:14px;cursor:move;user-select:none;display:flex;align-items:center;justify-content:space-between}
        #twMarketBot .badge{font-size:11px;color:#cfd8dc}
        #twMarketBot .bot-controls{display:flex;gap:8px;justify-content:space-between;margin:8px 0}
        #twMarketBot button{background:#3178c6;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer}
        #twMarketBot button:hover{background:#3f8de0}
        #twMarketBot button.active{background:#2e7d32}
        #twMarketBot button.disabled{background:#c0392b}
        #twMarketBot .status{margin:8px 0;padding:6px;background:rgba(0,0,0,.20);border-radius:4px;line-height:1.5}
        #twMarketBot .section{margin-bottom:10px}
        #twMarketBot .section-title{font-weight:bold;margin:6px 0;cursor:pointer;user-select:none}
        #twMarketBot .section-title:after{content:" ▼";font-size:10px}
        #twMarketBot .section-title.collapsed:after{content:" ►"}
        #twMarketBot .section-content.collapsed{display:none}
        #twMarketBot .resource-info{display:flex;gap:6px}
        #twMarketBot .resource-item{flex:1;text-align:center;background:rgba(255,255,255,.06);padding:6px;border-radius:4px}
        #twMarketBot .resource-value{font-weight:bold}
        #twMarketBot .settings-row{display:flex;justify-content:space-between;margin-bottom:6px;gap:8px}
        #twMarketBot .settings-label{flex:2}
        #twMarketBot .settings-value{flex:1;text-align:right}
        #twMarketBot input[type="number"]{width:84px;background:rgba(0,0,0,.2);border:1px solid #34495e;color:#fff;padding:3px 6px;border-radius:4px}
        #twMarketBot .log{height:190px;max-height:190px;overflow-y:auto;background:rgba(0,0,0,.2);padding:6px;border-radius:4px;margin-top:6px;font-family:monospace;font-size:11px}
        #twMarketBot .bar{display:flex;gap:6px}
        #twMarketBot .half{flex:1}
        #twMarketBot .flows{display:grid;grid-template-columns:1fr 1fr;gap:6px}
        #twMarketBot .flow-box{background:rgba(255,255,255,.06);border-radius:4px;padding:6px}
      `);

      const c = document.createElement('div');
      c.id = 'twMarketBot';
      c.innerHTML = `
        <h3 id="twMBDrag">
          Tribal Wars Market Bot
          <span class="badge">Bot v${VERSION} · Ext <span id="twExtVersion">–</span></span>
        </h3>

        <div class="bot-controls">
          <button id="twMarketBotToggle" class="${CONFIG.enabled ? 'active' : 'disabled'}">${CONFIG.enabled ? 'Aktiviert' : 'Deaktiviert'}</button>
          <button id="twMarketBotSettings">Einstellungen</button>
          <button id="twMarketBotStats">Statistik</button>
          <button id="twResetStats" title="Zähler zurücksetzen">Reset</button>
        </div>

        <div class="status">
          Status: <span id="twMarketBotStatus">${CONFIG.enabled ? 'Aktiv' : 'Inaktiv'}</span><br>
          Letzte Aktion: <span id="twMarketBotLastAction">-</span><br>
          Aktionen diese Session: <span id="twMarketBotSessionActions">0</span>/<span id="twMarketBotMaxActions">${CONFIG.maxActionsPerSession}</span><br>
          <span style="font-size:11px;color:#bdc3c7;">Letzter Grund: <span id="twMarketBotNoTrade">-</span></span>
        </div>

        <div class="section">
          <div class="section-title" data-section="resources">Ressourcen & Händler</div>
          <div class="section-content" id="resourcesSection">
            <div class="resource-info">
              <div class="resource-item"><div>Holz</div><div class="resource-value" id="twMarketBotWood">0</div></div>
              <div class="resource-item"><div>Lehm</div><div class="resource-value" id="twMarketBotStone">0</div></div>
              <div class="resource-item"><div>Eisen</div><div class="resource-value" id="twMarketBotIron">0</div></div>
            </div>
            <div class="bar" style="margin-top:6px;">
              <div class="half">Lager: <span id="twMarketBotStorage">0</span></div>
              <div class="half" style="text-align:right;">Händler: <span id="twMarketBotMerchants">0</span>/<span id="twMarketBotMerchantsTotal">0</span></div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title" data-section="flows">Transporte</div>
          <div class="section-content" id="flowsSection">
            <div class="flows">
              <div class="flow-box">
                <div class="settings-row"><div class="settings-label">Eintreffend Holz/Lehm/Eisen:</div><div class="settings-value"><span id="twInWood">0</span> / <span id="twInStone">0</span> / <span id="twInIron">0</span></div></div>
              </div>
              <div class="flow-box">
                <div class="settings-row"><div class="settings-label">Ausgehend Holz/Lehm/Eisen:</div><div class="settings-value"><span id="twOutWood">0</span> / <span id="twOutStone">0</span> / <span id="twOutIron">0</span></div></div>
              </div>
            </div>
            <div class="bar" style="margin-top:6px;">
              <div class="half">Händler unterwegs: <span id="twMerchantsBusy">0</span></div>
              <div class="half" style="text-align:right;">Tragekapazität/Händler: <span id="twCarry">0</span></div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title" data-section="market">Marktpreise (beste Ratio)</div>
          <div class="section-content" id="marketSection">
            <div class="settings-row"><div class="settings-label">Holz (Verkauf):</div><div class="settings-value" id="twMarketBotWoodSellPrice">–</div></div>
            <div class="settings-row"><div class="settings-label">Lehm (Verkauf):</div><div class="settings-value" id="twMarketBotStoneSellPrice">–</div></div>
            <div class="settings-row"><div class="settings-label">Eisen (Verkauf):</div><div class="settings-value" id="twMarketBotIronSellPrice">–</div></div>
            <div style="margin-top:5px;font-size:10px;text-align:right;">Letzte Aktualisierung: <span id="twMarketBotLastMarketUpdate">–</span></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title collapsed" data-section="stats">Statistik</div>
          <div class="section-content collapsed" id="statsSection">
            <div class="settings-row"><div class="settings-label">Abgeschlossene Trades:</div><div class="settings-value" id="twMarketBotTradesCompleted">0</div></div>
            <div class="settings-row"><div class="settings-label">Gehandelt (Holz / Lehm / Eisen):</div><div class="settings-value"><span id="twMarketBotTradedWood">0</span> / <span id="twMarketBotTradedStone">0</span> / <span id="twMarketBotTradedIron">0</span></div></div>
            <div class="settings-row"><div class="settings-label">Fehler (letzte 3):</div><div class="settings-value" id="twMarketBotLastErrors">–</div></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title collapsed" data-section="settings">Einstellungen</div>
          <div class="section-content collapsed" id="settingsSection">
            <div class="settings-row"><div class="settings-label">Min. Gewinn (%):</div><div class="settings-value"><input type="number" id="twMarketBotMinProfit" min="1" max="100" value="${CONFIG.minProfitPercentage}"></div></div>
            <div class="settings-row"><div class="settings-label">Max. Reisezeit (h):</div><div class="settings-value"><input type="number" id="twMarketBotMaxTravel" min="1" max="96" value="${CONFIG.maxTravelHours}"></div></div>
            <div class="settings-row"><div class="settings-label">Auto-Limits (% Lager):</div><div class="settings-value"><input type="checkbox" id="twMarketBotAutoLimits" ${CONFIG.autoLimits ? 'checked' : ''}></div></div>
            <div class="settings-row"><div class="settings-label">Min‑% vom Lager:</div><div class="settings-value"><input type="number" id="twMarketBotMinPct" min="0" max="1" step="0.05" value="${CONFIG.minPctOfStorage}"></div></div>
            <div class="settings-row"><div class="settings-label">Max‑% vom Lager:</div><div class="settings-value"><input type="number" id="twMarketBotMaxPct" min="0" max="1" step="0.05" value="${CONFIG.maxPctOfStorage}"></div></div>
            <div class="settings-row"><div class="settings-label">Effektive Limits:</div><div class="settings-value"><span id="twEffLimits">–</span></div></div>
            <div class="settings-row"><div class="settings-label">Pagination (Seiten):</div><div class="settings-value"><input type="number" id="twPagesPerScan" min="0" max="5" value="${CONFIG.pagesPerScan}"></div></div>
            <div class="settings-row"><div class="settings-label">Rebalancing:</div><div class="settings-value"><input type="checkbox" id="twMarketBotBalanceResources" ${CONFIG.balanceResources ? 'checked' : ''}></div></div>
            <div class="settings-row"><div class="settings-label">Eigene Angebote:</div><div class="settings-value"><input type="checkbox" id="twAllowOwnOffers" ${CONFIG.allowOwnOffers ? 'checked' : ''}></div></div>
            <div class="settings-row"><div class="settings-label">Debug-Modus:</div><div class="settings-value"><input type="checkbox" id="twMarketBotDebugMode" ${CONFIG.debugMode ? 'checked' : ''}></div></div>
            <button id="twMarketBotSaveSettings" style="width:100%;margin-top:6px;">Speichern</button>
          </div>
        </div>

        <div class="section">
          <div class="section-title collapsed" data-section="log">Log (persistent)</div>
          <div class="section-content collapsed log" id="logSection">
            <div id="twMarketBotLog"></div>
          </div>
        </div>
      `;
      document.body.appendChild(c);
      setupUIEventListeners();
      makeDraggable(document.getElementById('twMarketBot'), document.getElementById('twMBDrag'));
      rebuildUILog();
      log('UI erstellt');
    } catch (e) { logError('Fehler beim Erstellen der UI', e); }
  }

  function makeDraggable(box, handle){
    if(!box || !handle) return;
    let sx=0, sy=0, bx=0, by=0, dragging=false;
    handle.addEventListener('mousedown', (e)=>{
      dragging=true; sx=e.clientX; sy=e.clientY;
      const r = box.getBoundingClientRect(); bx=r.left; by=r.top;
      document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
      e.preventDefault();
    });
    function mm(e){ if(!dragging) return; box.style.left = (bx + e.clientX - sx) + 'px'; box.style.top = (by + e.clientY - sy) + 'px'; box.style.right='auto'; box.style.bottom='auto'; }
    function mu(){ dragging=false; document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }
  }

  function setupUIEventListeners() {
    try {
      const toggleBtn = document.getElementById('twMarketBotToggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          CONFIG.enabled = !CONFIG.enabled;
          toggleBtn.className = CONFIG.enabled ? 'active' : 'disabled';
          toggleBtn.textContent = CONFIG.enabled ? 'Aktiviert' : 'Deaktiviert';
          saveData(STORE.config, CONFIG);
          updateUI();
          log(`Bot ${CONFIG.enabled ? 'aktiviert' : 'deaktiviert'}`);
        });
      }
      const open = (name) => {
        const h = document.querySelector(`.section-title[data-section="${name}"]`);
        const ct = document.getElementById(`${name}Section`);
        if (!h || !ct) return;
        h.classList.remove('collapsed'); ct.classList.remove('collapsed');
        ct.scrollIntoView({ behavior:'smooth', block:'nearest' });
      };
      document.getElementById('twMarketBotSettings')?.addEventListener('click', () => open('settings'));
      document.getElementById('twMarketBotStats')?.addEventListener('click', () => open('stats'));
      document.getElementById('twResetStats')?.addEventListener('click', () => {
        stats.tradesCompleted = 0;
        stats.resourcesTraded = { wood:0, stone:0, iron:0 };
        stats.sessionActions = 0;
        stats.errors = [];
        saveData(STORE.stats, stats);
        updateUI();
        log('Statistiken zurückgesetzt');
      });

      document.querySelectorAll('.section-title').forEach(s => s.addEventListener('click', () => {
        const n = s.getAttribute('data-section');
        const c = document.getElementById(`${n}Section`);
        s.classList.toggle('collapsed'); c.classList.toggle('collapsed');
      }));

      document.getElementById('twMarketBotSaveSettings')?.addEventListener('click', () => {
        CONFIG.minProfitPercentage = parseInt(document.getElementById('twMarketBotMinProfit').value, 10) || 6;
        CONFIG.maxTravelHours      = parseInt(document.getElementById('twMarketBotMaxTravel').value, 10) || 5;
        CONFIG.autoLimits          = document.getElementById('twMarketBotAutoLimits').checked;
        CONFIG.minPctOfStorage     = Math.max(0, Math.min(1, parseFloat(document.getElementById('twMarketBotMinPct').value))) || 0.20;
        CONFIG.maxPctOfStorage     = Math.max(0, Math.min(1, parseFloat(document.getElementById('twMarketBotMaxPct').value))) || 0.80;
        CONFIG.pagesPerScan        = Math.max(0, Math.min(5, parseInt(document.getElementById('twPagesPerScan').value, 10) || 0));
        CONFIG.balanceResources    = document.getElementById('twMarketBotBalanceResources').checked;
        CONFIG.allowOwnOffers      = document.getElementById('twAllowOwnOffers').checked;
        CONFIG.debugMode           = document.getElementById('twMarketBotDebugMode').checked;
        saveData(STORE.config, CONFIG);
        log('Einstellungen gespeichert');
        updateUI();
      });

      log('UI-Event-Listener eingerichtet');
    } catch (e) { logError('Fehler beim Einrichten der UI-Events', e); }
  }

  function rebuildUILog(){
    try{
      const host = document.getElementById('twMarketBotLog');
      if(!host) return;
      host.innerHTML = '';
      const list = readUILog();
      list.slice(-300).forEach(item=>{
        const div = document.createElement('div');
        const ts = new Date(item.ts).toLocaleTimeString();
        div.textContent = `[${ts}] ${item.msg}`;
        host.appendChild(div);
      });
      host.scrollTop = host.scrollHeight;
    } catch(e){ console.error('rebuildUILog error', e); }
  }

  function updateUI() {
    try {
      const txt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = (typeof v === 'number') ? v.toLocaleString() : v; };
      const fmt = (n) => (n && n > 0 ? n.toFixed(2) : '–');

      txt('twExtVersion', (window.twMarketExtensions && window.twMarketExtensions.__version) ? window.twMarketExtensions.__version : '–');

      const now = Date.now();
      const statusLabel = !CONFIG.enabled ? 'Inaktiv' : (pauseUntil && pauseUntil > now ? `Pausiert` : 'Aktiv');
      txt('twMarketBotStatus', statusLabel);

      txt('twMarketBotWood',  villageCache.resources.wood);
      txt('twMarketBotStone', villageCache.resources.stone);
      txt('twMarketBotIron',  villageCache.resources.iron);
      txt('twMarketBotStorage', villageCache.storage);
      txt('twMarketBotMerchants', villageCache.merchantsAvailable);
      txt('twMarketBotMerchantsTotal', villageCache.merchantsTotal);

      // Flows
      txt('twInWood', villageCache.tradeFlows.incoming.wood);
      txt('twInStone', villageCache.tradeFlows.incoming.stone);
      txt('twInIron', villageCache.tradeFlows.incoming.iron);
      txt('twOutWood', villageCache.tradeFlows.outgoing.wood);
      txt('twOutStone', villageCache.tradeFlows.outgoing.stone);
      txt('twOutIron', villageCache.tradeFlows.outgoing.iron);
      txt('twMerchantsBusy', villageCache.tradeFlows.merchantsBusy);
      txt('twCarry', villageCache.merchantMaxTransport);

      txt('twMarketBotWoodSellPrice',  fmt(marketCache.bestPrices.sell.wood));
      txt('twMarketBotStoneSellPrice', fmt(marketCache.bestPrices.sell.stone));
      txt('twMarketBotIronSellPrice',  fmt(marketCache.bestPrices.sell.iron));
      txt('twMarketBotLastMarketUpdate', marketCache.lastUpdate ? new Date(marketCache.lastUpdate).toLocaleTimeString() : '–');

      if (stats.lastAction > 0) txt('twMarketBotLastAction', new Date(stats.lastAction).toLocaleTimeString());
      txt('twMarketBotSessionActions', stats.sessionActions);
      txt('twMarketBotMaxActions', CONFIG.maxActionsPerSession);

      txt('twMarketBotTradesCompleted', stats.tradesCompleted);
      txt('twMarketBotTradedWood', stats.resourcesTraded.wood);
      txt('twMarketBotTradedStone', stats.resourcesTraded.stone);
      txt('twMarketBotTradedIron', stats.resourcesTraded.iron);

      const lastErr = (stats.errors || []).slice(-3).map(e => e.message).join(' | ') || '–';
      txt('twMarketBotLastErrors', lastErr);
      txt('twMarketBotNoTrade', lastReason || '-');

      const minEff = getEffectiveMin(), maxEff = getEffectiveMax();
      const eff = document.getElementById('twEffLimits');
      if (eff) eff.textContent = `${minEff.toLocaleString()} / ${maxEff.toLocaleString()}`;

      log('UI aktualisiert');
    } catch (e) { logError('Fehler beim Aktualisieren der UI', e); }
  }

  function addToUILog(message) {
    try {
      pushUILogLine(message);
      const el = document.getElementById('twMarketBotLog');
      if (!el) return;
      const ts = new Date().toLocaleTimeString();
      const div = document.createElement('div');
      div.textContent = `[${ts}] ${message}`;
      el.appendChild(div);
      el.scrollTop = el.scrollHeight;
      while (el.children.length > 300) el.removeChild(el.firstChild);
    } catch (e) { console.error('Fehler beim Hinzufügen zum UI-Log:', e); }
  }

  // --------------------------- INIT & LOOP ---------------------------
  function initBot() {
    try {
      Object.assign(CONFIG, loadData(STORE.config, {}));
      // Sicherheit: enabled default true
      if (typeof CONFIG.enabled !== 'boolean') CONFIG.enabled = true;
      window.twMarketBotConfig = CONFIG;

      const savedMarket = loadData(STORE.market, null);
      if (savedMarket) Object.assign(marketCache, savedMarket);

      const savedStats = loadData(STORE.stats, null);
      if (savedStats) Object.assign(stats, savedStats);

      pending = loadData(STORE.pending, []);
      pauseUntil = loadData(STORE.pause, 0) || 0;

      createUI();

      if (isMarketOfferPage()) updateMarketCache();
      extractVillageInfo();
      updateUI();

      setTimeout(mainLoop, randomDelay(5000, 10000));
      log('Bot initialisiert');
      addToUILog('Bot v' + VERSION + ' gestartet');
    } catch (e) { logError('Fehler bei der Bot-Initialisierung', e); }
  }

  async function mainLoop() {
    try {
      const now = Date.now();
      if (!CONFIG.enabled) { setTimeout(mainLoop, 12000); return; }

      if (pauseUntil && now < pauseUntil) {
        updateUI();
        setTimeout(mainLoop, Math.min(60000, pauseUntil - now));
        return;
      }

      extractVillageInfo();
      confirmPendingIfAny();

      if (isMarketOfferPage()) updateMarketCache();
      updateUI();

      if (stats.sessionActions >= CONFIG.maxActionsPerSession) {
        const pause = randomDelay(CONFIG.minSessionPause * 60000, CONFIG.maxSessionPause * 60000);
        pauseUntil = now + pause;
        saveData(STORE.pause, pauseUntil);
        const mins = Math.round(pause / 60000);
        addToUILog(`Session‑Pause für ca. ${mins} Minuten`);
        setTimeout(mainLoop, Math.min(60000, pause));
        return;
      }

      const decision = decideTradeAction();
      if (decision) {
        const ok = await executeTrade(decision);
        addToUILog(ok
          ? (decision.kind === 'own_offer'
              ? `Eigenangebot abgesendet (${decision.sellRes}→${decision.buyRes})`
              : `Handel abgesendet (${decision.action} ${decision.resource})`)
          : `Kein Handel – Grund: ${lastReason}`);
      } else {
        addToUILog(`Kein Handel – Grund: ${lastReason}`);
      }

      setTimeout(mainLoop, randomDelay(30000, 120000));
    } catch (e) {
      logError('Fehler in der Hauptschleife', e);
      setTimeout(mainLoop, 60000);
    }
  }

  // Log‑Anbindung für Extension
  function log(msg){ if (CONFIG.debugMode) console.log('[TW Market Bot]', msg); try{ if (typeof window.twMarketBotLog === 'function') window.twMarketBotLog(msg); }catch{} }
  function logError(message, error) {
    console.error('[TW Market Bot] ' + message, error);
    stats.errors.push({ time: Date.now(), message, error: String(error) });
    if (stats.errors.length > 50) stats.errors = stats.errors.slice(-50);
    saveData(STORE.stats, stats);
    try { if (typeof window.twMarketBotLogError === 'function') window.twMarketBotLogError(message, error); } catch {}
  }

  window.twMarketBotLog = addToUILog;
  window.twMarketBotLogError = (m, e) => { console.error('[TW Market Bot] ' + m, e); addToUILog('Fehler: ' + m); };

  initBot();
})();
