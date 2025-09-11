// ==UserScript==
// @name         Tribal Wars Market Extensions (DE tuned, native click + safe submit)
// @namespace    https://github.com/Themegaindex/Die-St-mme-Marktplatz-testscript
// @version      1.4.0
// @description  Angebotsparser, Filter (bezahlbar, Händler, Dauer, Min-Limit), Pagination. Navigation mit native click / href. Echtes form.submit().
// @author       Themegaindex
// @match        *://*.die-staemme.de/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---- Logging → Bot-UI ----
  function log(msg){ if (window.twMarketBotLog) window.twMarketBotLog(msg); else console.log('[TW Market Ext]', msg); }
  function logError(m,e){ if (window.twMarketBotLogError) window.twMarketBotLogError(m,e); else console.error('[TW Market Ext] '+m,e); }

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

  function waitFor(condFn, intervalMs=100, maxTries=50){
    return new Promise(resolve=>{
      let tries=0;
      const t = setInterval(()=>{
        tries++;
        try{
          if(condFn()){ clearInterval(t); resolve(true); return; }
        }catch{}
        if(tries>=maxTries){ clearInterval(t); resolve(false); }
      }, intervalMs);
    });
  }

  // ---------- Navigation ----------
  // Rückgabewert:
  //  - true  → wir sind (und bleiben) auf other_offer, Tabelle vorhanden
  //  - false → Fehler (Tablink fehlt etc.)
  //  - null  → Full-Reload angestoßen (location.href gesetzt) → aktuelle Aktion abbrechen
  async function navigateToMarketTab(tab){
    try{
      if(!isMarketPage()){
        const a = document.querySelector('a[href*="screen=market"]');
        if(!a){ logError('Market-Link nicht gefunden', new Error('nav')); return false; }
        a.click();
        const ok = await waitFor(()=> isMarketPage(), 100, 60);
        if(!ok) { location.href = a.href; return null; }
      }
      if(getCurrentMarketTab() === tab){
        // sicherstellen, dass Tabelle da ist
        const tblOk = await waitFor(()=> !!findOffersTable(), 100, 40);
        return tblOk ? true : true; // wir sind bereits auf dem Tab; Bot liest danach
      }

      const tabLink = document.querySelector(`#id_${tab} a, a[href*="mode=${tab}"]`);
      if(!tabLink){ logError('Tab-Link nicht gefunden: '+tab, new Error('nav')); return false; }

      // 1) nativer Click (AJAX/normal)
      tabLink.click();
      const ok = await waitFor(()=> getCurrentMarketTab() === tab, 100, 40);
      if(ok){
        await waitFor(()=> !!findOffersTable(), 100, 40);
        return true;
      }

      // 2) Fallback: Hard-Navigation
      location.href = tabLink.href;
      return null; // wir verlassen die Seite → laufenden Trade abbrechen

    }catch(e){ logError('Fehler bei navigateToMarketTab', e); return false; }
  }

  // ---------- Angebotstabelle ----------
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
      if(!isMarketOffersPage()) { log('Not on market offers page, cannot extract offers'); return []; }
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

  // ---------- Pagination ----------
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

  // ---------- Filter ----------
  function findBestMarketOffers(offers, criteria){
    try{
      if(!offers?.length) return [];
      const v = window.twMarketBotVillage || { resources:{wood:0,stone:0,iron:0}, merchantsAvailable:0 };
      const lim = window.twMarketBotLimits || { min:0, max:Infinity };
      const c = Object.assign({
        action:'buy',                  // 'buy' → wir wollen sellResource erhalten
        resource:'wood',
        minAmount:0,
        maxAmount:1e9,
        minRatio:0,
        maxRatio:Infinity,
        maxMerchants:10,
        maxTravelMinutes:24*60,
        requireAcceptable:true,
        prioritizeBy:'ratio',
        minAfterPay: Math.floor(lim.min * 0.9) // Zahleressource darf nach Annahme nicht unter 90% des Min fallen
      }, criteria || {});

      let filtered = offers.filter(o=>{
        if(!o) return false;
        if(c.requireAcceptable && !o.acceptForm) return false;
        if(o.travelMinutes > c.maxTravelMinutes) return false;
        if(o.merchantsRequired > Math.min(c.maxMerchants, v.merchantsAvailable)) return false;

        if(c.action === 'buy'){
          if(o.sellResource !== c.resource) return false;
          if(o.sellAmount < c.minAmount || o.sellAmount > c.maxAmount) return false;
          if(o.ratio < c.minRatio || o.ratio > c.maxRatio) return false;
          // bezahlbar + Min-Limit der Zahleressource
          const pay = o.buyResource;
          const after = (v.resources[pay] || 0) - o.buyAmount;
          if(after < c.minAfterPay) return false;
          return (v.resources[pay] || 0) >= o.buyAmount;
        }else{
          // verkaufen: Wir geben c.resource ab (als "Für")
          if(o.buyResource !== c.resource) return false;
          if(o.buyAmount < c.minAmount || o.buyAmount > c.maxAmount) return false;
          if(o.ratio < c.minRatio || o.ratio > c.maxRatio) return false;
          const pay = o.buyResource;
          const after = (v.resources[pay] || 0) - o.buyAmount;
          if(after < c.minAfterPay) return false;
          return (v.resources[pay] || 0) >= o.buyAmount;
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

  async function searchOffersWithPagination(criteria, pagesToScan = 2){
    try{
      if(pagesToScan <= 0) return [];
      let filtered = findBestMarketOffers(extractDetailedMarketOffers(), criteria);
      if(filtered.length) return filtered;

      for(let i=0;i<pagesToScan;i++){
        const next = findNextPageLink();
        if(!next) break;
        next.click();
        const ok = await waitFor(()=> !!findOffersTable(), 100, 50);
        if(!ok) break;
        const pageOffers = extractDetailedMarketOffers();
        filtered = findBestMarketOffers(pageOffers, criteria);
        if(filtered.length) return filtered;
      }
      return [];
    }catch(e){ logError('Error in pagination scan', e); return []; }
  }

  // ---------- Accept ----------
  async function acceptMarketOffer(offer, opts={}){
    try{
      if(!offer?.acceptForm){ logError('Cannot accept: no form', new Error('Invalid offer')); return false; }
      const v = window.twMarketBotVillage || { resources:{wood:0,stone:0,iron:0}, merchantsAvailable:0 };
      const lim = window.twMarketBotLimits || { min:0, max:Infinity };
      const carry = (window.twMarketBotConfig?.merchantMaxTransport) || 1000;

      const maxByRes = Math.floor((v.resources[offer.buyResource] || 0) / offer.buyAmount);
      const maxByMer = Math.floor((v.merchantsAvailable || 0) / Math.max(1, Math.ceil(offer.buyAmount / carry)));
      let count = Math.max(1, Math.min(offer.availability || 1, maxByRes, maxByMer));

      if(typeof opts.maxCount === 'number') count = Math.min(count, opts.maxCount);

      // Min-Limit Schutz (nach Zahlung ≥ 90% Min)
      const minAfterPay = Math.floor((opts.respectMinAfterPay ? lim.min : 0) * 0.9);
      if(((v.resources[offer.buyResource] || 0) - offer.buyAmount*count) < minAfterPay){
        // ggf. Count reduzieren
        count = Math.floor(((v.resources[offer.buyResource] || 0) - minAfterPay) / offer.buyAmount);
      }
      if(!count || count < 1){ log('Offer not affordable (min-limit)'); return false; }

      const countInput = offer.acceptForm.querySelector('input[name="count"]');
      if(countInput){ countInput.value = String(count); }

      // Echtes Submit (kein Klick simuliert)
      offer.acceptForm.submit();
      log(`Offer submitted (x${count})`);
      return true; // Erfolg ausgelöst (Server übernimmt)

    }catch(e){ logError('Error accepting offer', e); return false; }
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
    acceptMarketOffer
  };
})();
