// ==UserScript==
// @name         Tribal Wars Market Extensions (Fixed)
// @namespace    https://github.com/Themegaindex/Die-St-mme-Marktplatz-testscript
// @version      1.1.0
// @description  Erweiterte Markt-Navigation, robustes Angebots-Parsing und Batch-Trading für den TW Market Bot
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

/* eslint-disable no-unused-vars */
(function () {
    'use strict';

    // ---- Logging kompatibel mit dem Hauptscript ----
    function log(message) {
        if (typeof window !== 'undefined' && typeof window.twMarketBotLog === 'function') {
            window.twMarketBotLog(message);
        } else {
            console.log('[TW Market Ext] ' + message);
        }
    }
    function logError(message, error) {
        if (typeof window !== 'undefined' && typeof window.twMarketBotLogError === 'function') {
            window.twMarketBotLogError(message, error);
        } else {
            console.error('[TW Market Ext] ' + message, error);
        }
    }

    // ---- Hilfsfunktionen ----
    function isMarketPage() { return window.location.href.includes('screen=market'); }
    function getCurrentMarketTab() {
        const url = window.location.href;
        if (url.includes('mode=own_offers')) return 'own_offers';
        if (url.includes('mode=other_offers')) return 'other_offers';
        if (url.includes('mode=send')) return 'send';
        if (url.includes('mode=other')) return 'other';
        return 'overview';
    }
    function isMarketOffersPage() { return isMarketPage() && getCurrentMarketTab() === 'other_offers'; }

    function randomWait(min, max) {
        const variance = Math.random() * 0.3 + 0.85;
        const base = Math.floor(Math.random() * (max - min + 1) + min);
        const delay = Math.floor(base * variance);
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    // ---- Human Behaviour ----
    async function simulateClick(element) {
        try {
            if (!element) { logError('Cannot click null element', new Error('Invalid element')); return false; }
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const offsetX = (Math.random() - 0.5) * (rect.width * 0.6);
            const offsetY = (Math.random() - 0.5) * (rect.height * 0.6);
            const x = centerX + offsetX, y = centerY + offsetY;

            element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
            await randomWait(50, 150);
            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
            await randomWait(30, 100);
            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
            return true;
        } catch (e) { logError('Error simulating click', e); return false; }
    }
    async function simulateTyping(element, text) {
        try {
            if (!element) { logError('Cannot type in null element', new Error('Invalid element')); return false; }
            element.focus(); await randomWait(100, 300);
            element.select(); await randomWait(50, 150);
            element.value = ''; await randomWait(50, 150);
            for (let i = 0; i < text.length; i++) {
                const ch = text.charAt(i);
                element.value += ch;
                element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ch }));
                element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: ch }));
                await randomWait(50, 150);
            }
            element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            element.blur();
            return true;
        } catch (e) { logError('Error simulating typing', e); return false; }
    }
    async function simulateEvent(element, eventType) {
        try {
            if (!element) { logError(`Cannot dispatch ${eventType} on null element`, new Error('Invalid element')); return false; }
            element.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
            return true;
        } catch (e) { logError(`Error simulating ${eventType} event`, e); return false; }
    }

    // ---- Navigation ----
    async function navigateToMarketTab(tab) {
        try {
            if (!isMarketPage()) {
                const marketBuilding = document.querySelector('#buildings .market a');
                if (marketBuilding) {
                    log('Clicking market building');
                    await simulateClick(marketBuilding);
                    await randomWait(1200, 2000);
                } else {
                    const link = document.querySelector('a[href*="screen=market"]');
                    if (!link) { logError('Cannot find market navigation element', new Error('Navigation element not found')); return false; }
                    log('Navigating to market via menu');
                    await simulateClick(link);
                    await randomWait(1200, 2000);
                }
            }
            if (getCurrentMarketTab() === tab) return true;

            const tabLink = document.querySelector(`a[href*="mode=${tab}"]`);
            if (tabLink) {
                log(`Navigating to ${tab} tab`);
                await simulateClick(tabLink);
                await randomWait(800, 1500);
                return true;
            }
            logError(`Cannot find tab: ${tab}`, new Error('Tab not found'));
            return false;
        } catch (e) { logError(`Error navigating to market tab ${tab}`, e); return false; }
    }

    // ---- Angebots-Extraktion (detailiert) ----
    function extractDetailedMarketOffers() {
        try {
            if (!isMarketOffersPage()) { log('Not on market offers page, cannot extract offers'); return []; }
            const offers = [];
            const rows = document.querySelectorAll('#market_offer_table tr:not(:first-child)');
            rows.forEach(row => {
                try {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 5) return;

                    const offer = {
                        id: row.getAttribute('id')?.replace('offer_', '') || Math.random().toString(36).substring(2, 15),
                        sellResource: '',
                        sellAmount: 0,
                        buyResource: '',
                        buyAmount: 0,
                        ratio: 0,
                        village: '',
                        distance: 0,
                        travelTime: '',
                        merchantsRequired: 1,
                        actionButton: null,
                        timestamp: Date.now()
                    };

                    const resFrom = (c) => {
                        if (c.querySelector('.wood')) return 'wood';
                        if (c.querySelector('.stone')) return 'stone';
                        if (c.querySelector('.iron')) return 'iron';
                        return '';
                    };

                    offer.sellResource = resFrom(cells[0]);
                    offer.sellAmount   = parseInt(cells[1].textContent.trim().replace(/\D/g, ''), 10) || 0;
                    offer.buyResource  = resFrom(cells[2]);
                    offer.buyAmount    = parseInt(cells[3].textContent.trim().replace(/\D/g, ''), 10) || 0;
                    offer.ratio        = (offer.sellAmount > 0 && offer.buyAmount > 0) ? (offer.buyAmount / offer.sellAmount) : 0;

                    if (cells[4]) {
                        const vtxt = cells[4].textContent.trim();
                        offer.village = vtxt.split('(')[0].trim();
                        const m = vtxt.match(/\(~(\d+\.\d+)\)/);
                        if (m && m[1]) offer.distance = parseFloat(m[1]);
                    }
                    if (cells[5]) {
                        offer.travelTime = cells[5].textContent.trim();
                        offer.merchantsRequired = Math.max(1, Math.ceil(offer.sellAmount / 1000));
                    }
                    if (cells[6]) offer.actionButton = cells[6].querySelector('a, input[type="submit"]');

                    if (offer.sellResource && offer.buyResource && offer.sellAmount > 0 && offer.buyAmount > 0) {
                        offers.push(offer);
                    }
                } catch (inner) { logError('Error processing individual market offer', inner); }
            });
            log(`Extracted ${offers.length} detailed market offers`);
            return offers;
        } catch (e) { logError('Error extracting detailed market offers', e); return []; }
    }

    // ---- Trend-/Filter-Logik ----
    function findBestMarketOffers(offers, criteria) {
        try {
            if (!offers || offers.length === 0) { log('No offers to analyze'); return []; }
            const defaults = {
                action: 'buy',
                resource: 'wood',
                buyResource: null,
                minAmount: 0,
                maxAmount: 1000000,
                maxDistance: 50,
                minRatio: 0,            // relevant vor allem für SELL
                maxRatio: Infinity,     // relevant vor allem für BUY
                maxMerchants: 10,
                prioritizeBy: 'ratio'
            };
            const c = { ...defaults, ...criteria };

            let filtered = offers.filter(o => {
                if (!o || !o.sellResource || !o.buyResource || !o.sellAmount || !o.buyAmount) return false;
                if (c.buyResource && o.buyResource !== c.buyResource && o.sellResource !== c.resource) return false;

                if (c.action === 'buy') {
                    if (o.sellResource !== c.resource) return false;                               // wir wollen diese Ressource kaufen
                    if (o.sellAmount < c.minAmount || o.sellAmount > c.maxAmount) return false;
                    if (c.maxDistance !== 0 && o.distance > c.maxDistance) return false;
                    if (o.merchantsRequired > c.maxMerchants) return false;
                    if (o.ratio > c.maxRatio) return false;                                        // günstig einkaufen
                    if (c.minRatio && o.ratio < c.minRatio) return false;                          // optionaler Untergrenz-Check
                    return true;
                } else {
                    if (o.buyResource !== c.resource) return false;                                // Käufer sucht unsere Ressource
                    if (o.buyAmount < c.minAmount || o.buyAmount > c.maxAmount) return false;
                    if (c.maxDistance !== 0 && o.distance > c.maxDistance) return false;
                    if (o.merchantsRequired > c.maxMerchants) return false;
                    if (o.ratio < c.minRatio) return false;                                        // profitabel verkaufen
                    if (o.ratio > c.maxRatio) return false;
                    return true;
                }
            });

            if (c.prioritizeBy === 'ratio') {
                filtered.sort((a, b) => (c.action === 'buy') ? (a.ratio - b.ratio) : (b.ratio - a.ratio));
            } else if (c.prioritizeBy === 'distance') {
                filtered.sort((a, b) => a.distance - b.distance);
            } else if (c.prioritizeBy === 'amount') {
                filtered.sort((a, b) => (c.action === 'buy') ? (b.sellAmount - a.sellAmount) : (b.buyAmount - a.buyAmount));
            }

            log(`Found ${filtered.length} offers matching criteria`);
            return filtered;
        } catch (e) { logError('Error finding best market offers', e); return []; }
    }

    // ---- Trade-Ausführung ----
    async function acceptMarketOffer(offer) {
        try {
            if (!offer || !offer.actionButton) {
                logError('Cannot accept offer: invalid offer or missing action button', new Error('Invalid offer'));
                return false;
            }
            log(`Accepting offer: ${offer.sellAmount} ${offer.sellResource} for ${offer.buyAmount} ${offer.buyResource}`);

            await simulateClick(offer.actionButton);
            await randomWait(1000, 2000);

            // Bestätigen
            const confirmButton = document.querySelector('input[type="submit"][name="submit"], input[type="submit"].btn, button[type="submit"]');
            if (!confirmButton) { logError('Cannot find confirmation button', new Error('Confirmation not found')); return false; }
            await randomWait(800, 1500);
            await simulateClick(confirmButton);
            await randomWait(1000, 2000);

            const successMessage = document.querySelector('.success, .popup_box .success');
            const errorMessage = document.querySelector('.error, .popup_box .error');
            if (successMessage && !errorMessage) {
                log('Offer accepted successfully');
                return true;
            }
            if (errorMessage) logError('Error accepting offer: ' + errorMessage.textContent.trim(), new Error('Acceptance failed'));
            return false;
        } catch (e) { logError('Error accepting market offer', e); return false; }
    }

    async function createMarketOffer(details) {
        try {
            const defaults = { sellResource: 'wood', sellAmount: 1000, buyResource: 'stone', buyAmount: 1000, maxTime: 0 };
            const d = { ...defaults, ...details };

            const ok = await navigateToMarketTab('own_offers');
            if (!ok) { logError('Failed to navigate to own offers tab', new Error('Navigation failed')); return false; }
            await randomWait(800, 1500);

            const createBtn = document.querySelector('a.btn[href*="mode=new_offer"], a[href*="mode=new_offer"]');
            if (!createBtn) { logError('Cannot find create offer button', new Error('Button not found')); return false; }
            await simulateClick(createBtn);
            await randomWait(1000, 1800);

            const sellSel = document.querySelector('select[name="sell_resource"]');
            const sellInp = document.querySelector('input[name="sell_amount"]');
            const buySel  = document.querySelector('select[name="buy_resource"]');
            const buyInp  = document.querySelector('input[name="buy_amount"]');

            if (!sellSel || !sellInp || !buySel || !buyInp) { logError('Create offer form elements missing', new Error('Form missing')); return false; }

            sellSel.value = d.sellResource; await simulateEvent(sellSel, 'change');
            await simulateTyping(sellInp, String(d.sellAmount));
            buySel.value = d.buyResource;   await simulateEvent(buySel, 'change');
            await simulateTyping(buyInp, String(d.buyAmount));

            if (d.maxTime > 0) {
                const maxTimeInput = document.querySelector('input[name="max_time"]');
                if (maxTimeInput) await simulateTyping(maxTimeInput, String(d.maxTime));
            }

            await randomWait(1200, 2500);
            const submit = document.querySelector('input[type="submit"], button[type="submit"]');
            if (!submit) { logError('Cannot find submit button', new Error('Button not found')); return false; }
            await simulateClick(submit);
            await randomWait(1000, 2000);

            const success = document.querySelector('.success');
            const error = document.querySelector('.error');
            if (success && !error) { log('Offer created successfully'); return true; }
            if (error) logError('Error creating offer: ' + error.textContent.trim(), new Error('Creation failed'));
            return false;
        } catch (e) { logError('Error creating market offer', e); return false; }
    }

    async function executeBatchTrades(offers, maxTrades = 3) {
        try {
            if (!offers || offers.length === 0) return 0;
            const list = offers.slice(0, maxTrades);
            log(`Executing batch of ${list.length} trades`);

            let ok = 0;
            for (let i = 0; i < list.length; i++) {
                const success = await acceptMarketOffer(list[i]);
                if (success) {
                    ok++;
                    log(`Batch trade ${i + 1}/${list.length} successful`);
                    if (i < list.length - 1) await randomWait(1500, 3500);
                } else {
                    log(`Batch trade ${i + 1}/${list.length} failed`);
                    await randomWait(3000, 5000);
                }
                if (i < list.length - 1) {
                    await navigateToMarketTab('other_offers');
                    await randomWait(900, 1500);
                }
            }
            log(`Batch trading completed: ${ok}/${list.length} successful`);
            return ok;
        } catch (e) { logError('Error executing batch trades', e); return 0; }
    }

    // ---- (Optional) Scroll-/Maus-Simulation für Anti-Detection ----
    async function simulateRandomMouseMovements(duration = 2000) {
        try {
            const end = Date.now() + duration;
            let x = Math.random() * window.innerWidth;
            let y = Math.random() * window.innerHeight;
            while (Date.now() < end) {
                const tx = Math.random() * window.innerWidth * 0.8 + window.innerWidth * 0.1;
                const ty = Math.random() * window.innerHeight * 0.7 + window.innerHeight * 0.15;
                const steps = Math.max(5, Math.min(20, Math.floor(Math.hypot(tx - x, ty - y) / 10)));
                for (let i = 0; i < steps && Date.now() < end; i++) {
                    x = x + (tx - x) / (steps - i) + (Math.random() - 0.5) * 5;
                    y = y + (ty - y) / (steps - i) + (Math.random() - 0.5) * 5;
                    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
                    await randomWait(10, 50);
                }
                await randomWait(300, 1200);
            }
            return true;
        } catch (e) { logError('Error simulating mouse movements', e); return false; }
    }
    async function simulateRandomScrolling(duration = 3000) {
        try {
            const end = Date.now() + duration;
            let pos = window.scrollY;
            const doc = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
            const max = Math.max(0, doc - window.innerHeight);
            while (Date.now() < end) {
                const target = Math.random() * max * 0.8;
                const steps = Math.max(5, Math.min(15, Math.floor(Math.abs(target - pos) / 100)));
                for (let i = 0; i < steps && Date.now() < end; i++) {
                    pos = pos + (target - pos) / (steps - i) + (Math.random() - 0.5) * 10;
                    window.scrollTo({ top: pos, behavior: 'auto' });
                    await randomWait(50, 150);
                }
                await randomWait(500, 2000);
            }
            return true;
        } catch (e) { logError('Error simulating scrolling', e); return false; }
    }

    // ---- Export ins globale Fenster ----
    if (typeof window !== 'undefined') {
        window.twMarketExtensions = {
            // Market navigation
            navigateToMarketTab,
            getCurrentMarketTab,
            isMarketPage,
            isMarketOffersPage,

            // Market data extraction
            extractDetailedMarketOffers,
            findBestMarketOffers,

            // Market interaction
            acceptMarketOffer,
            createMarketOffer,
            executeBatchTrades,

            // Human behavior simulation / Anti-detection
            simulateClick,
            simulateTyping,
            simulateEvent,
            randomWait,
            simulateRandomMouseMovements,
            simulateRandomScrolling
        };
    }
})();
