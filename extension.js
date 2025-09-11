// ==UserScript==
// @name         Tribal Wars Market Extensions (DE244 tuned)
// @namespace    https://github.com/Themegaindex/Die-St-mme-Marktplatz-testscript
// @version      1.2.0
// @description  Navigation other_offer, robuster Angebotsparser (Erhalte/Für), Reisezeit-Filter, direktes Annehmen (ohne Confirm) und Batch-Trading
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
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ----- Logging an Bot-UI anbinden -----
  function log(message) {
    if (typeof window !== 'undefined' && typeof window.twMarketBotLog === 'function') {
      window.twMarketBotLog(message);
    } else { console.log('[TW Market Ext]', message); }
  }
  function logError(message, error) {
    if (typeof window !== 'undefined' && typeof window.twMarketBotLogError === 'function') {
      window.twMarketBotLogError(message, error);
    } else { console.error('[TW Market Ext] ' + message, error); }
  }

  // ----- Helpers -----
  const isMarketPage = () => location.href.includes('screen=market');
  function getCurrentMarketTab() {
    const url = location.href;
    if (url.includes('mode=own_offer'))     return 'own_offer';
    if (url.includes('mode=all_own_offer')) return 'all_own_offer';
    if (url.includes('mode=other_offer'))   return 'other_offer';     // <— DE
    if (url.includes('mode=send'))          return 'send';
    if (url.includes('mode=transports'))    return 'transports';
    if (url.includes('mode=traders'))       return 'traders';
    return 'overview';
  }
  const isMarketOffersPage = () => isMarketPage() && getCurrentMarketTab() === 'other_offer';

  function randomWait(min, max) {
    const variance = Math.random() * 0.3 + 0.85;
    const base = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(r => setTimeout(r, Math.floor(base * variance)));
  }

  async function simulateClick(el) {
    try {
      if (!el) { logError('Cannot click null element', new Error('Invalid element')); return false; }
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2 + (Math.random() - .5) * (rect.width * .6);
      const y = rect.top  + rect.height/ 2 + (Math.random() - .5) * (rect.height* .6);
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles:true, clientX:x, clientY:y }));
      await randomWait(50,150);
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, clientX:x, clientY:y, button:0 }));
      await randomWait(30,100);
      el.dispatchEvent(new MouseEvent('mouseup',   { bubbles:true, clientX:x, clientY:y, button:0 }));
      el.dispatchEvent(new MouseEvent('click',     { bubbles:true, clientX:x, clientY:y, button:0 }));
      return true;
    } catch (e) { logError('Error simulating click', e); return false; }
  }
  async function simulateTyping(el, text) {
    try {
      if (!el) { logError('Cannot type in null element', new Error('Invalid element')); return false; }
      el.focus(); await randomWait(80,200); el.value = '';
      for (const ch of String(text)) {
        el.value += ch;
        el.dispatchEvent(new Event('input', { bubbles:true }));
        await randomWait(30,120);
      }
      el.dispatchEvent(new Event('change', { bubbles:true }));
      el.blur(); return true;
    } catch (e) { logError('Error simulating typing', e); return false; }
  }
  const simulateEvent = (el, type) => { try { el?.dispatchEvent(new Event(type, { bubbles:true })); return true; } catch(e){ logError('simulateEvent '+type, e); return false; } };

  // ----- Navigation -----
  async function navigateToMarketTab(tab) {
    try {
      if (!isMarketPage()) {
        const marketBuilding = document.querySelector('#buildings .market a');
        const menuLink = document.querySelector('a[href*="screen=market"]');
        const link = marketBuilding || menuLink;
        if (!link) { logError('Cannot find market navigation element', new Error('Navigation element not found')); return false; }
        await simulateClick(link); await randomWait(900, 1500);
      }
      if (getCurrentMarketTab() === tab) return true;

      // robust: entweder modemenu oder direkte Links
      const tabLink = document.querySelector(`a[href*="mode=${tab}"]`) ||
                      document.querySelector(`#id_${tab.replace('_','-')} a`);
      if (tabLink) { await simulateClick(tabLink); await randomWait(700, 1200); return true; }

      logError('Cannot find tab: '+tab, new Error('Tab not found'));
      return false;
    } catch (e) { logError('Error navigating to tab '+tab, e); return false; }
  }

  // ----- Angebotstabelle finden & parsen -----
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
  function parseTimeToMinutes(txt) {
    if (!txt) return 0;
    const p = txt.trim().split(':').map(n => parseInt(n,10) || 0);
    if (p.length === 3) return p[0]*60 + p[1] + p[2]/60;
    if (p.length === 2) return p[0]*60 + p[1];
    return 0;
  }

  function extractDetailedMarketOffers() {
    try {
      if (!isMarketOffersPage()) { log('Not on market offers page'); return []; }
      const table = findOffersTable();
      if (!table) return [];

      const offers = [];
      const rows = Array.from(table.querySelectorAll('tr')).slice(1); // skip header

      const resFrom = (c) => {
        if (!c) return '';
        if (c.querySelector('.wood'))  return 'wood';
        if (c.querySelector('.stone')) return 'stone';
        if (c.querySelector('.iron'))  return 'iron';
        return '';
      };
      const numFrom = (c) => parseInt((c?.textContent || '').replace(/\D/g,''), 10) || 0;

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 6) return;

        const sellCell = cells[0];  // Erhalte
        const buyCell  = cells[1];  // Für
        const timeCell = cells[3];
        const ratioCell = cells[4];
        const availCell = cells[5];
        const actionCell = cells[6] || cells[cells.length - 1];

        const sellResource = resFrom(sellCell);
        const buyResource  = resFrom(buyCell);
        const sellAmount   = numFrom(sellCell);
        const buyAmount    = numFrom(buyCell);
        if (!sellResource || !buyResource || sellAmount <= 0 || buyAmount <= 0) return;

        let ratio = buyAmount / sellAmount;
        const rTxt = (ratioCell?.textContent || '').replace(',', '.');
        const rMatch = rTxt.match(/(\d+(?:\.\d+)?)/);
        if (rMatch) ratio = parseFloat(rMatch[1]);

        const availability = (() => {
          const m = (availCell?.textContent || '').match(/(\d+)/);
          return m ? parseInt(m[1], 10) : 1;
        })();

        const form = actionCell ? actionCell.querySelector('form.market_accept_offer') : null;
        const submitBtn = form ? form.querySelector('input[type="submit"],button[type="submit"]') : null;
        const idInput = form ? form.querySelector('input[name="id"]') : null;

        const carry = (window?.twMarketBotConfig?.merchantMaxTransport) || 1000;
        const merchantsRequired = Math.max(1, Math.ceil(buyAmount / carry));

        offers.push({
          id: idInput ? idInput.value : '',
          sellResource, sellAmount,
          buyResource,  buyAmount,
          ratio,
          travelTime: timeCell ? timeCell.textContent.trim() : '',
          travelMinutes: parseTimeToMinutes(timeCell ? timeCell.textContent : ''),
          availability,
          merchantsRequired,
          canAccept: !!form,
          actionButton: submitBtn,
          acceptForm: form,
          timestamp: Date.now()
        });
      });

      log(`Extracted ${offers.length} detailed market offers`);
      return offers;
    } catch (e) { logError('Error extracting detailed market offers', e); return []; }
  }

  // ----- Angebotsauswahl -----
  function findBestMarketOffers(offers, criteria) {
    try {
      if (!offers || !offers.length) return [];

      const def = {
        action: 'buy',                 // 'buy' oder 'sell'
        resource: 'wood',
        buyResource: null,             // optionaler Gegentyp
        minAmount: 0,
        maxAmount: 1e9,
        minRatio: 0,
        maxRatio: Infinity,
        maxMerchants: 10,
        maxTravelMinutes: 24*60,
        requireAcceptable: true,       // nur wenn form vorhanden
        prioritizeBy: 'ratio'
      };
      const c = { ...def, ...criteria };

      let filtered = offers.filter(o => {
        if (!o) return false;
        if (c.requireAcceptable && !o.canAccept) return false;
        if (o.travelMinutes > c.maxTravelMinutes) return false;

        if (c.action === 'buy') {
          // Wir wollen c.resource bekommen -> Verkäufer verkauft diese Ressource (sellResource)
          if (o.sellResource !== c.resource) return false;
          if (o.sellAmount < c.minAmount || o.sellAmount > c.maxAmount) return false;
          if (o.merchantsRequired > c.maxMerchants) return false;
          if (o.ratio > c.maxRatio) return false;                  // günstig einkaufen
          if (o.ratio < c.minRatio) return false;
          return true;
        } else {
          // Wir wollen c.resource verkaufen -> Käufer bietet „Für“ diese Ressource (buyResource)
          if (o.buyResource !== c.resource) return false;
          if (o.buyAmount < c.minAmount || o.buyAmount > c.maxAmount) return false;
          if (o.merchantsRequired > c.maxMerchants) return false;
          if (o.ratio < c.minRatio) return false;                  // profitabel verkaufen
          if (o.ratio > c.maxRatio) return false;
          return true;
        }
      });

      if (c.prioritizeBy === 'ratio') filtered.sort((a,b) => c.action === 'buy' ? (a.ratio - b.ratio) : (b.ratio - a.ratio));
      else if (c.prioritizeBy === 'time') filtered.sort((a,b) => a.travelMinutes - b.travelMinutes);
      else if (c.prioritizeBy === 'amount') filtered.sort((a,b) => c.action === 'buy' ? (b.sellAmount - a.sellAmount) : (b.buyAmount - a.buyAmount));

      log(`Found ${filtered.length} offers matching criteria`);
      return filtered;
    } catch (e) { logError('Error finding best offers', e); return []; }
  }

  // ----- Akzeptieren (direkt, ohne separate Confirm-Seite) -----
  async function acceptMarketOffer(offer) {
    try {
      if (!offer || !offer.acceptForm) {
        logError('Cannot accept: invalid offer / no form', new Error('Invalid offer'));
        return false;
      }

      // Count (wie viele identische Offers) – hier konservativ 1
      const countInput = offer.acceptForm.querySelector('input[name="count"]');
      if (countInput) { await simulateTyping(countInput, '1'); }

      // Absenden
      const submit = offer.acceptForm.querySelector('input[type="submit"],button[type="submit"]');
      if (!submit) { logError('Submit-Button nicht gefunden', new Error('No submit')); return false; }
      await simulateClick(submit);

      // Seite lädt / Ajax-Reload
      await randomWait(900, 1600);
      log('Offer submitted');
      return true;
    } catch (e) { logError('Error accepting offer', e); return false; }
  }

  async function createMarketOffer(details) {
    try {
      const d = { sellResource:'wood', sellAmount:1000, buyResource:'stone', buyAmount:1000, maxTime:5, ...details };
      const ok = await navigateToMarketTab('own_offer');
      if (!ok) return false;
      await randomWait(700, 1200);

      // Formular laut deinem Snippet: Radio + Input
      const sellRadio = document.querySelector(`#res_sell_${d.sellResource}`);
      const sellInput = document.querySelector('#res_sell_amount');
      const buyRadio  = document.querySelector(`#res_buy_${d.buyResource}`);
      const buyInput  = document.querySelector('#res_buy_amount');

      if (!sellRadio || !sellInput || !buyRadio || !buyInput) {
        logError('Create-offer form elements missing', new Error('Form missing'));
        return false;
      }

      sellRadio.checked = true; await simulateEvent(sellRadio, 'change');
      await simulateTyping(sellInput, String(d.sellAmount));
      buyRadio.checked = true;  await simulateEvent(buyRadio, 'change');
      await simulateTyping(buyInput,  String(d.buyAmount));

      const maxTime = document.querySelector('input[name="max_time"]');
      if (maxTime) await simulateTyping(maxTime, String(d.maxTime));

      const submit = document.querySelector('#submit_offer');
      if (!submit) { logError('Create submit not found', new Error('No submit')); return false; }
      await randomWait(900, 1600);
      await simulateClick(submit);
      await randomWait(900, 1600);

      log('Offer created successfully');
      return true;
    } catch (e) { logError('Error creating offer', e); return false; }
  }

  async function executeBatchTrades(offers, maxTrades = 3) {
    try {
      if (!offers || !offers.length) return 0;
      const list = offers.slice(0, maxTrades);
      log(`Executing batch of ${list.length} trades`);

      let ok = 0;
      for (let i = 0; i < list.length; i++) {
        const success = await acceptMarketOffer(list[i]);
        if (success) {
          ok++; log(`Batch trade ${i+1}/${list.length} successful`);
          if (i < list.length - 1) await randomWait(1200, 2500);
        } else {
          log(`Batch trade ${i+1}/${list.length} failed`);
          await randomWait(2500, 4000);
        }
        if (i < list.length - 1) { await navigateToMarketTab('other_offer'); await randomWait(700, 1200); }
      }
      log(`Batch trading completed: ${ok}/${list.length} successful`);
      return ok;
    } catch (e) { logError('Error batch trading', e); return 0; }
  }

  // ---- (optional) kleine Anti-Detection‑Bewegungen ----
  async function simulateRandomMouseMovements(duration = 2000) {
    try {
      const end = Date.now() + duration;
      let x = Math.random()*innerWidth, y = Math.random()*innerHeight;
      while (Date.now() < end) {
        const tx = innerWidth * (0.1 + Math.random()*0.8);
        const ty = innerHeight* (0.15+ Math.random()*0.7);
        const steps = Math.max(5, Math.min(20, Math.floor(Math.hypot(tx-x, ty-y)/10)));
        for (let i=0;i<steps && Date.now()<end;i++) {
          x = x + (tx-x)/(steps-i) + (Math.random()-0.5)*5;
          y = y + (ty-y)/(steps-i) + (Math.random()-0.5)*5;
          window.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y}));
          await randomWait(10,50);
        }
        await randomWait(300,900);
      }
      return true;
    } catch (e) { logError('Mouse movements error', e); return false; }
  }
  async function simulateRandomScrolling(duration = 3000) {
    try {
      const end = Date.now() + duration;
      let pos = scrollY;
      const max = Math.max(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)-innerHeight);
      while (Date.now() < end) {
        const target = Math.random()*max*0.8;
        const steps = Math.max(5, Math.min(15, Math.floor(Math.abs(target-pos)/120)));
        for (let i=0;i<steps && Date.now()<end;i++) {
          pos = pos + (target-pos)/(steps-i) + (Math.random()-0.5)*10;
          scrollTo({ top: pos });
          await randomWait(50,150);
        }
        await randomWait(400,1200);
      }
      return true;
    } catch (e) { logError('Scrolling error', e); return false; }
  }

  // ----- Export -----
  window.twMarketExtensions = {
    // Navigation
    navigateToMarketTab,
    getCurrentMarketTab,
    isMarketPage,
    isMarketOffersPage,

    // Daten
    extractDetailedMarketOffers,
    findBestMarketOffers,

    // Trades
    acceptMarketOffer,
    createMarketOffer,
    executeBatchTrades,

    // Anti-Detection
    simulateClick,
    simulateTyping,
    simulateEvent,
    randomWait,
    simulateRandomMouseMovements,
    simulateRandomScrolling
  };
})();
