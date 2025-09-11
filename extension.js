// ==UserScript==
// @name         Tribal Wars Market Extensions (DE tuned, pagination + affordability)
// @namespace    https://github.com/Themegaindex/Die-St-mme-Marktplatz-testscript
// @version      1.3.0
// @description  Robuster Angebotsparser (Erhalte/Für), Filter (bezahlbar, Händler, Dauer), Pagination-Scan und Multi-Akzept pro Angebot. Minimale Klicks.
// @author       Themegaindex
// @match        *://*.die-staemme.de/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---- Logging an Bot-UI anbinden ----
  function log(msg){ if (window.twMarketBotLog) window.twMarketBotLog(msg); else console.log('[TW Market Ext]', msg); }
  function logError(m,e){ if (window.twMarketBotLogError) window.twMarketBotLogError(m,e); else console.error('[TW Market Ext] '+m,e); }

  // ---- Helpers ----
  const isMarketPage = () => location.href.includes('screen=market');
  function getCurrentMarketTab() {
    const u = location.href;
    if (u.includes('mode=own_offer'))     return 'own_offer';
    if (u.includes('mode=all_own_offer')) return 'all_own_offer';
    if (u.includes('mode=other_offer'))   return 'other_offer';
    if (u.includes('mode=send'))          return 'send';
    if (u.includes('mode=transports'))    return 'transports';
    if (u.includes('mode=traders'))       return 'traders';
    return 'overview';
  }
  const isMarketOffersPage = () => isMarketPage() && getCurrentMarketTab() === 'other_offer';

  function randomWait(min, max) {
    const variance = Math.random() * 0.3 + 0.85;
    const base = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(r => setTimeout(r, Math.floor(base * variance)));
  }
  async function simulateClick(el){
    try{
      if(!el){ logError('Cannot click null element', new Error('Invalid element')); return false; }
      const r = el.getBoundingClientRect();
      const x = r.left + r.width/2 + (Math.random()-.5)*(r.width*.6);
      const y = r.top  + r.height/2 + (Math.random()-.5)*(r.height*.6);
      el.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y}));
      await randomWait(50,150);
      el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:x,clientY:y,button:0}));
      await randomWait(30,100);
      el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:x,clientY:y,button:0}));
      el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y,button:0}));
      return true;
    }catch(e){ logError('Error simulating click',e); return false; }
  }
  async function simulateTyping(el, text){
    try{
      if(!el){ logError('Cannot type in null element', new Error('Invalid element')); return false; }
      el.focus(); await randomWait(80,200); el.value = '';
      for(const ch of String(text)){ el.value += ch; el.dispatchEvent(new Event('input',{bubbles:true})); await randomWait(30,120); }
      el.dispatchEvent(new Event('change',{bubbles:true})); el.blur(); return true;
    }catch(e){ logError('Error simulating typing',e); return false; }
  }
  const simulateEvent = (el,type)=>{ try{ el?.dispatchEvent(new Event(type,{bubbles:true})); return true; }catch(e){ logError('simulateEvent '+type,e); return false; } };

  // ---- Navigation ----
  async function navigateToMarketTab(tab){
    try{
      if(!isMarketPage()){
        const a = document.querySelector('#buildings .market a') || document.querySelector('a[href*="screen=market"]');
        if(!a){ logError('Cannot find market navigation element', new Error('Navigation element not found')); return false; }
        await simulateClick(a); await randomWait(900,1500);
      }
      if(getCurrentMarketTab() === tab) return true;
      const tabLink = document.querySelector(`a[href*="mode=${tab}"]`);
      if(tabLink){ await simulateClick(tabLink); await randomWait(700,1200); return true; }
      logError('Cannot find tab: '+tab, new Error('Tab not found'));
      return false;
    }catch(e){ logError('Error navigating to tab '+tab, e); return false; }
  }

  // ---- Angebotstabelle finden & parsen ----
  function findOffersTable(){
    const tables = Array.from(document.querySelectorAll('table.vis'));
    for(const tbl of tables){
      const firstRow = tbl.querySelector('tr');
      if(!firstRow) continue;
      const headerText = firstRow.innerText.toLowerCase();
      if(headerText.includes('erhalte') && headerText.includes('für') &&
         headerText.includes('verhältnis') && headerText.includes('annehmen')) return tbl;
    }
    return null;
  }
  function parseTimeToMinutes(txt){
    if(!txt) return 0;
    const p = txt.trim().split(':').map(n=>parseInt(n,10)||0);
    if(p.length===3) return p[0]*60 + p[1] + p[2]/60;
    if(p.length===2) return p[0]*60 + p[1];
    return 0;
  }
  function extractDetailedMarketOffers(){
    try{
      if(!isMarketOffersPage()) return [];
      const table = findOffersTable();
      if(!table) return [];
      const offers = [];
      const rows = Array.from(table.querySelectorAll('tr')).slice(1);

      const resFrom = (c)=> c?.querySelector('.wood') ? 'wood' : c?.querySelector('.stone') ? 'stone' : c?.querySelector('.iron') ? 'iron' : '';
      const numFrom = (c)=> parseInt((c?.textContent || '').replace(/\D/g,''),10) || 0;

      rows.forEach(row=>{
        const cells = row.querySelectorAll('td');
        if(cells.length < 6) return;

        const sellCell=cells[0], buyCell=cells[1], timeCell=cells[3], ratioCell=cells[4], availCell=cells[5];
        const actionCell = cells[6] || cells[cells.length-1];

        const sellResource = resFrom(sellCell);
        const buyResource  = resFrom(buyCell);
        const sellAmount   = numFrom(sellCell);
        const buyAmount    = numFrom(buyCell);
        if(!sellResource || !buyResource || sellAmount<=0 || buyAmount<=0) return;

        let ratio = buyAmount/sellAmount;
        const rTxt = (ratioCell?.textContent || '').replace(',', '.');
        const rMatch = rTxt.match(/(\d+(?:\.\d+)?)/);
        if(rMatch) ratio = parseFloat(rMatch[1]);

        const avail = (()=>{ const m=(availCell?.textContent||'').match(/(\d+)/); return m?parseInt(m[1],10):1; })();
        const form = actionCell ? actionCell.querySelector('form.market_accept_offer') : null;
        const idInput = form ? form.querySelector('input[name="id"]') : null;

        const carry = (window.twMarketBotConfig?.merchantMaxTransport) || 1000;
        const merchantsRequired = Math.max(1, Math.ceil(buyAmount / carry));

        offers.push({
          id: idInput ? idInput.value : '',
          sellResource, sellAmount,
          buyResource,  buyAmount,
          ratio,
          travelTime: timeCell ? timeCell.textContent.trim() : '',
          travelMinutes: parseTimeToMinutes(timeCell ? timeCell.textContent : ''),
          availability: avail,
          merchantsRequired,
          canAccept: !!form,
          acceptForm: form,
          timestamp: Date.now()
        });
      });

      log(`Extracted ${offers.length} detailed market offers`);
      return offers;
    }catch(e){ logError('Error extracting detailed market offers', e); return []; }
  }

  // ---- Pagination-Helpers ----
  function getPaginationContainer(){
    const tds = Array.from(document.querySelectorAll('td[align="center"]'));
    return tds.find(td => td.querySelector('a.paged-nav-item') || td.querySelector('strong')) || null;
  }
  function getCurrentPageNumber(){
    const cont = getPaginationContainer();
    if(!cont) return 1;
    const strong = cont.querySelector('strong');
    if(!strong) return 1;
    const m = strong.textContent.match(/(\d+)/);
    return m ? parseInt(m[1],10) : 1;
  }
  function findNextPageLink(){
    const cont = getPaginationContainer();
    if(!cont) return null;
    const cur = getCurrentPageNumber();
    const links = Array.from(cont.querySelectorAll('a.paged-nav-item'));
    let next = null;
    for(const a of links){
      const m = a.textContent.match(/(\d+)/);
      if(!m) continue;
      const n = parseInt(m[1],10);
      if(n === cur+1){ next = a; break; }
    }
    return next || null;
  }

  // ---- Angebotsauswahl (mit Bezahlbarkeit/Händler/Dauer) ----
  function findBestMarketOffers(offers, criteria){
    try{
      if(!offers?.length) return [];
      const v = window.twMarketBotVillage || { resources:{wood:0,stone:0,iron:0}, merchantsAvailable:0 };
      const c = Object.assign({
        action:'buy',
        resource:'wood',
        minAmount:0,
        maxAmount:1e9,
        minRatio:0,
        maxRatio:Infinity,
        maxMerchants:10,
        maxTravelMinutes:24*60,
        requireAcceptable:true,
        prioritizeBy:'ratio'
      }, criteria || {});

      let filtered = offers.filter(o=>{
        if(!o) return false;
        if(c.requireAcceptable && !o.acceptForm) return false;
        if(o.travelMinutes > c.maxTravelMinutes) return false;
        if(o.merchantsRequired > Math.min(c.maxMerchants, v.merchantsAvailable)) return false;

        if(c.action === 'buy'){
          // wir wollen c.resource erhalten → Verkäufer verkauft diese Ressource
          if(o.sellResource !== c.resource) return false;
          if(o.sellAmount < c.minAmount || o.sellAmount > c.maxAmount) return false;
          if(o.ratio < c.minRatio || o.ratio > c.maxRatio) return false;
          // bezahlbar?
          if(v.resources[o.buyResource] < o.buyAmount) return false;
          return true;
        }else{
          // wir wollen c.resource abgeben → Käufer verlangt diese Ressource als "Für"
          if(o.buyResource !== c.resource) return false;
          if(o.buyAmount < c.minAmount || o.buyAmount > c.maxAmount) return false;
          if(o.ratio < c.minRatio || o.ratio > c.maxRatio) return false;
          if(v.resources[o.buyResource] < o.buyAmount) return false;
          return true;
        }
      });

      if(c.prioritizeBy === 'ratio'){
        filtered.sort((a,b)=> c.action==='buy' ? (a.ratio - b.ratio) : (b.ratio - a.ratio));
      }else if(c.prioritizeBy === 'time'){
        filtered.sort((a,b)=> a.travelMinutes - b.travelMinutes);
      }else if(c.prioritizeBy === 'amount'){
        filtered.sort((a,b)=> c.action==='buy' ? (b.sellAmount - a.sellAmount) : (b.buyAmount - a.buyAmount));
      }

      log(`Found ${filtered.length} offers matching criteria`);
      return filtered;
    }catch(e){ logError('Error finding best offers',e); return []; }
  }

  // ---- Pagination-Scan (sucht nächste Seiten) ----
  async function searchOffersWithPagination(criteria, pagesToScan = 2){
    try{
      if(pagesToScan <= 0) return [];
      let filtered = findBestMarketOffers(extractDetailedMarketOffers(), criteria);
      if(filtered.length) return filtered;

      for(let i=0;i<pagesToScan;i++){
        const next = findNextPageLink();
        if(!next) break;
        await simulateClick(next);
        await randomWait(800,1400);
        const pageOffers = extractDetailedMarketOffers();
        filtered = findBestMarketOffers(pageOffers, criteria);
        if(filtered.length) return filtered;
      }
      return [];
    }catch(e){ logError('Error in pagination scan', e); return []; }
  }

  // ---- Akzeptieren (Multi-Count) ----
  async function acceptMarketOffer(offer, opts={}){
    try{
      if(!offer?.acceptForm){ logError('Cannot accept: no form', new Error('Invalid offer')); return false; }
      const v = window.twMarketBotVillage || { resources:{wood:0,stone:0,iron:0}, merchantsAvailable:0 };

      // Maximal wie viele identische Offerten können wir akzeptieren?
      const payRes = offer.buyResource;
      const maxByRes = Math.floor((v.resources[payRes] || 0) / offer.buyAmount);
      const maxByMer = Math.floor((v.merchantsAvailable || 0) / offer.merchantsRequired);
      let count = Math.max(1, Math.min(offer.availability || 1, maxByRes, maxByMer));
      if(typeof opts.maxCount === 'number') count = Math.max(1, Math.min(count, opts.maxCount));

      // Wenn gar nicht bezahlbar → abbrechen
      if(count <= 0){ log('Offer not affordable'); return false; }

      // Count setzen
      const countInput = offer.acceptForm.querySelector('input[name="count"]');
      if(countInput) await simulateTyping(countInput, String(count));

      // Submit
      const submit = offer.acceptForm.querySelector('input[type="submit"],button[type="submit"]');
      if(!submit){ logError('Submit-Button nicht gefunden', new Error('No submit')); return false; }
      await randomWait(200,400);
      await simulateClick(submit);
      await randomWait(900,1600);

      // Lokalen State vorsichtig updaten (optimistisch)
      v.merchantsAvailable = Math.max(0, (v.merchantsAvailable||0) - count*offer.merchantsRequired);
      v.resources[payRes]  = Math.max(0, (v.resources[payRes]||0) - count*offer.buyAmount);
      window.twMarketBotVillage = v;

      log(`Offer accepted (x${count})`);
      return true;
    }catch(e){ logError('Error accepting offer', e); return false; }
  }

  async function createMarketOffer(details){
    try{
      const d = Object.assign({ sellResource:'wood', sellAmount:1000, buyResource:'stone', buyAmount:1000, maxTime:5 }, details || {});
      const ok = await navigateToMarketTab('own_offer');
      if(!ok) return false;
      await randomWait(700,1200);

      const sellRadio = document.querySelector(`#res_sell_${d.sellResource}`);
      const sellInput = document.querySelector('#res_sell_amount');
      const buyRadio  = document.querySelector(`#res_buy_${d.buyResource}`);
      const buyInput  = document.querySelector('#res_buy_amount');
      if(!sellRadio || !sellInput || !buyRadio || !buyInput){ logError('Create-offer form elements missing', new Error('Form missing')); return false; }

      sellRadio.checked=true; simulateEvent(sellRadio,'change'); await simulateTyping(sellInput,String(d.sellAmount));
      buyRadio.checked=true;  simulateEvent(buyRadio,'change');  await simulateTyping(buyInput,String(d.buyAmount));
      const maxTime = document.querySelector('input[name="max_time"]');
      if(maxTime) await simulateTyping(maxTime, String(d.maxTime));

      const submit = document.querySelector('#submit_offer');
      if(!submit){ logError('Create submit not found', new Error('No submit')); return false; }
      await randomWait(900,1600);
      await simulateClick(submit);
      await randomWait(900,1600);
      log('Offer created successfully');
      return true;
    }catch(e){ logError('Error creating market offer', e); return false; }
  }

  async function executeBatchTrades(offers, maxTrades = 1){
    try{
      if(!offers?.length) return 0;
      const list = offers.slice(0, maxTrades);
      log(`Executing batch of ${list.length} trades`);
      let ok = 0;
      for(let i=0;i<list.length;i++){
        const success = await acceptMarketOffer(list[i], { maxCount: 2 }); // max 2 identische Offerten pro Klick
        if(success){ ok++; log(`Batch trade ${i+1}/${list.length} successful`); await randomWait(1000,2200); }
        else{ log(`Batch trade ${i+1}/${list.length} failed`); await randomWait(2200,4000); }
        if(i < list.length-1){ await navigateToMarketTab('other_offer'); await randomWait(600,1100); }
      }
      log(`Batch trading completed: ${ok}/${list.length} successful`);
      return ok;
    }catch(e){ logError('Error batch trading', e); return 0; }
  }

  // Export
  window.twMarketExtensions = {
    navigateToMarketTab,
    getCurrentMarketTab,
    isMarketPage,
    isMarketOffersPage,
    extractDetailedMarketOffers,
    findBestMarketOffers,
    searchOffersWithPagination,
    acceptMarketOffer,
    createMarketOffer,
    executeBatchTrades,
    simulateClick,
    simulateTyping,
    simulateEvent,
    randomWait
  };
})();
