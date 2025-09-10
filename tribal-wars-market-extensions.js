/**
 * Tribal Wars Market Extensions
 * Advanced trading logic and market interactions for Tribal Wars Market Bot
 * Version: 1.0.0
 * 
 * This extension adds sophisticated market interaction capabilities to the base bot
 * with minimal traffic generation and advanced anti-detection features.
 */

// -------------------------------------------------------------------------
// MARKET NAVIGATION AND PAGE DETECTION
// -------------------------------------------------------------------------

/**
 * Navigates to a specific market tab without generating additional page requests
 * @param {string} tab - Tab name ('overview', 'own_offers', 'other_offers', 'send', 'other')
 * @returns {Promise<boolean>} - Success status
 */
async function navigateToMarketTab(tab) {
    try {
        // Check if we're already on the market screen
        if (!isMarketPage()) {
            // Find and click the market building if on village overview
            if (document.getElementById('buildings') && document.querySelector('.market')) {
                log(`Clicking market building`);
                await simulateClick(document.querySelector('.market a'));
                await randomWait(1500, 2500);
                return await navigateToMarketTab(tab); // Recursive call after navigation
            } else {
                // Use the menu to navigate to market
                const marketLink = document.querySelector('a[href*="screen=market"]');
                if (marketLink) {
                    log(`Navigating to market via menu`);
                    await simulateClick(marketLink);
                    await randomWait(1500, 2500);
                    return await navigateToMarketTab(tab); // Recursive call after navigation
                } else {
                    logError("Cannot find market navigation element", new Error("Navigation element not found"));
                    return false;
                }
            }
        }
        
        // Now we're on market screen, navigate to specific tab
        const currentTab = getCurrentMarketTab();
        if (currentTab === tab) {
            log(`Already on ${tab} tab`);
            return true;
        }
        
        // Find and click the appropriate tab
        const tabLink = document.querySelector(`a[href*="mode=${tab}"]`);
        if (tabLink) {
            log(`Navigating to ${tab} tab`);
            await simulateClick(tabLink);
            await randomWait(800, 1500);
            return true;
        }
        
        logError(`Cannot find tab: ${tab}`, new Error("Tab not found"));
        return false;
    } catch (error) {
        logError(`Error navigating to market tab ${tab}`, error);
        return false;
    }
}

/**
 * Determines the current market tab
 * @returns {string} - Current tab name
 */
function getCurrentMarketTab() {
    try {
        const url = window.location.href;
        if (url.includes('mode=own_offers')) return 'own_offers';
        if (url.includes('mode=other_offers')) return 'other_offers';
        if (url.includes('mode=send')) return 'send';
        if (url.includes('mode=other')) return 'other';
        return 'overview'; // Default tab
    } catch (error) {
        logError("Error determining current market tab", error);
        return 'unknown';
    }
}

/**
 * Checks if the current page is any market page
 * @returns {boolean} - True if on market page
 */
function isMarketPage() {
    return window.location.href.includes('screen=market');
}

/**
 * Checks if we're currently on the market overview page
 * @returns {boolean} - True if on market overview
 */
function isMarketOverview() {
    return isMarketPage() && getCurrentMarketTab() === 'overview';
}

/**
 * Checks if we're on the market offers page
 * @returns {boolean} - True if on market offers page
 */
function isMarketOffersPage() {
    return isMarketPage() && getCurrentMarketTab() === 'other_offers';
}

// -------------------------------------------------------------------------
// ADVANCED MARKET DATA EXTRACTION
// -------------------------------------------------------------------------

/**
 * Extracts detailed market offers with additional metadata
 * @returns {Array} - Enhanced market offers
 */
function extractDetailedMarketOffers() {
    try {
        if (!isMarketOffersPage()) {
            log("Not on market offers page, cannot extract offers");
            return [];
        }
        
        const offers = [];
        const offerRows = document.querySelectorAll('#market_offer_table tr:not(:first-child)');
        
        offerRows.forEach(row => {
            try {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 5) {
                    // Extract basic offer data
                    const offer = {
                        id: row.getAttribute('id')?.replace('offer_', '') || generateRandomId(),
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
                    
                    // Determine resources
                    if (cells[0].querySelector('.wood')) offer.sellResource = 'wood';
                    else if (cells[0].querySelector('.stone')) offer.sellResource = 'stone';
                    else if (cells[0].querySelector('.iron')) offer.sellResource = 'iron';
                    
                    if (cells[2].querySelector('.wood')) offer.buyResource = 'wood';
                    else if (cells[2].querySelector('.stone')) offer.buyResource = 'stone';
                    else if (cells[2].querySelector('.iron')) offer.buyResource = 'iron';
                    
                    // Extract amounts
                    offer.sellAmount = parseInt(cells[1].textContent.trim().replace(/\D/g, '')) || 0;
                    offer.buyAmount = parseInt(cells[3].textContent.trim().replace(/\D/g, '')) || 0;
                    
                    // Calculate ratio
                    if (offer.sellAmount > 0 && offer.buyAmount > 0) {
                        offer.ratio = offer.buyAmount / offer.sellAmount;
                    }
                    
                    // Extract village info and distance if available
                    if (cells[4]) {
                        const villageText = cells[4].textContent.trim();
                        offer.village = villageText.split('(')[0].trim();
                        
                        // Extract distance if available
                        const distanceMatch = villageText.match(/\(~(\d+\.\d+)\)/);
                        if (distanceMatch && distanceMatch[1]) {
                            offer.distance = parseFloat(distanceMatch[1]);
                        }
                    }
                    
                    // Extract travel time if available
                    if (cells[5]) {
                        offer.travelTime = cells[5].textContent.trim();
                        
                        // Estimate merchants required based on amount
                        offer.merchantsRequired = Math.ceil(offer.sellAmount / 1000);
                    }
                    
                    // Store reference to the action button
                    if (cells[6] && cells[6].querySelector('a')) {
                        offer.actionButton = cells[6].querySelector('a');
                    }
                    
                    offers.push(offer);
                }
            } catch (innerError) {
                logError("Error processing individual market offer", innerError);
                // Continue with next offer
            }
        });
        
        log(`Extracted ${offers.length} detailed market offers`);
        return offers;
    } catch (error) {
        logError("Error extracting detailed market offers", error);
        return [];
    }
}

/**
 * Extracts market trends and price history from current and stored data
 * @param {Array} currentOffers - Current market offers
 * @param {Object} priceHistory - Stored price history
 * @returns {Object} - Market trend analysis
 */
function analyzeMarketTrends(currentOffers, priceHistory) {
    try {
        const result = {
            wood: { avgPrice: 0, trend: 'stable', volatility: 'low' },
            stone: { avgPrice: 0, trend: 'stable', volatility: 'low' },
            iron: { avgPrice: 0, trend: 'stable', volatility: 'low' }
        };
        
        // Calculate current average prices
        const currentPrices = {
            wood: { sell: [], buy: [] },
            stone: { sell: [], buy: [] },
            iron: { sell: [], buy: [] }
        };
        
        // Process current offers
        currentOffers.forEach(offer => {
            if (offer.sellResource && offer.buyResource && offer.ratio) {
                // Add to sell prices (what resource is being sold for)
                currentPrices[offer.sellResource].sell.push(offer.ratio);
                
                // Add to buy prices (what resource is being bought for)
                currentPrices[offer.buyResource].buy.push(1 / offer.ratio);
            }
        });
        
        // Calculate averages for current prices
        ['wood', 'stone', 'iron'].forEach(resource => {
            // Calculate sell average (what you get when selling this resource)
            if (currentPrices[resource].sell.length > 0) {
                const sum = currentPrices[resource].sell.reduce((a, b) => a + b, 0);
                result[resource].sellAvg = sum / currentPrices[resource].sell.length;
            }
            
            // Calculate buy average (what you pay when buying this resource)
            if (currentPrices[resource].buy.length > 0) {
                const sum = currentPrices[resource].buy.reduce((a, b) => a + b, 0);
                result[resource].buyAvg = sum / currentPrices[resource].buy.length;
            }
            
            // Overall average price
            if (result[resource].sellAvg && result[resource].buyAvg) {
                result[resource].avgPrice = (result[resource].sellAvg + result[resource].buyAvg) / 2;
            } else if (result[resource].sellAvg) {
                result[resource].avgPrice = result[resource].sellAvg;
            } else if (result[resource].buyAvg) {
                result[resource].avgPrice = result[resource].buyAvg;
            }
        });
        
        // Analyze trends using price history
        ['wood', 'stone', 'iron'].forEach(resource => {
            if (priceHistory[resource] && priceHistory[resource].length >= 2) {
                // Get recent history (last 10 entries)
                const recentHistory = priceHistory[resource].slice(-10);
                
                // Calculate trend
                const oldestPrice = recentHistory[0].price;
                const newestPrice = recentHistory[recentHistory.length - 1].price;
                const priceDiff = ((newestPrice - oldestPrice) / oldestPrice) * 100;
                
                // Determine trend direction
                if (priceDiff > 5) result[resource].trend = 'rising';
                else if (priceDiff < -5) result[resource].trend = 'falling';
                else result[resource].trend = 'stable';
                
                // Calculate volatility
                const prices = recentHistory.map(entry => entry.price);
                const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
                const squaredDiffs = prices.map(price => Math.pow(price - avgPrice, 2));
                const variance = squaredDiffs.reduce((a, b) => a + b, 0) / prices.length;
                const volatility = Math.sqrt(variance) / avgPrice;
                
                // Determine volatility level
                if (volatility > 0.15) result[resource].volatility = 'high';
                else if (volatility > 0.05) result[resource].volatility = 'medium';
                else result[resource].volatility = 'low';
            }
        });
        
        log("Market trend analysis completed");
        return result;
    } catch (error) {
        logError("Error analyzing market trends", error);
        return {
            wood: { avgPrice: 0, trend: 'unknown', volatility: 'unknown' },
            stone: { avgPrice: 0, trend: 'unknown', volatility: 'unknown' },
            iron: { avgPrice: 0, trend: 'unknown', volatility: 'unknown' }
        };
    }
}

/**
 * Finds the best market offers based on various criteria
 * @param {Array} offers - Available market offers
 * @param {Object} criteria - Selection criteria
 * @returns {Array} - Sorted best offers
 */
function findBestMarketOffers(offers, criteria) {
    try {
        if (!offers || offers.length === 0) {
            log("No offers to analyze");
            return [];
        }

        // -----------------------------------------------------------------
        // Default criteria & merge with caller-provided values
        // -----------------------------------------------------------------
        const defaultCriteria = {
            action: 'buy',              // 'buy' or 'sell'
            resource: 'wood',           // Target resource
            buyResource: null,          // (Optional) desired counter-resource
            minAmount: 0,
            maxAmount: 1_000_000,
            maxDistance: 50,
            minRatio: 0,                // For SELL actions → minimum acceptable ratio
            maxRatio: Infinity,         // For BUY actions → maximum acceptable ratio
            maxMerchants: 10,
            prioritizeBy: 'ratio'       // 'ratio', 'distance', 'amount'
        };

        const c = { ...defaultCriteria, ...criteria };

        // -----------------------------------------------------------------
        // Filtering
        // -----------------------------------------------------------------
        const filtered = offers.filter(o => {
            if (!o || !o.sellResource || !o.buyResource || !o.sellAmount || !o.buyAmount)
                return false;

            // Optional counter-resource constraint
            if (c.buyResource && o.buyResource !== c.buyResource && o.sellResource !== c.resource)
                return false;

            if (c.action === 'buy') {
                // We BUY c.resource → we need offers SELLING c.resource
                if (o.sellResource !== c.resource) return false;
                if (o.sellAmount < c.minAmount || o.sellAmount > c.maxAmount) return false;
                if (c.maxDistance !== 0 && o.distance > c.maxDistance) return false;
                if (o.merchantsRequired > c.maxMerchants) return false;
                // Cheap purchase: ratio must be <= maxRatio
                if (o.ratio > c.maxRatio) return false;
                if (c.minRatio && o.ratio < c.minRatio) return false; // optional lower bound
                return true;
            } else {
                // We SELL c.resource → need offers BUYING c.resource
                if (o.buyResource !== c.resource) return false;
                if (o.buyAmount < c.minAmount || o.buyAmount > c.maxAmount) return false;
                if (c.maxDistance !== 0 && o.distance > c.maxDistance) return false;
                if (o.merchantsRequired > c.maxMerchants) return false;
                // Profitable sale: ratio must be >= minRatio
                if (o.ratio < c.minRatio) return false;
                if (o.ratio > c.maxRatio) return false; // optional upper bound
                return true;
            }
        });

        // -----------------------------------------------------------------
        // Sorting
        // -----------------------------------------------------------------
        if (c.prioritizeBy === 'ratio') {
            filtered.sort((a, b) =>
                c.action === 'buy' ? a.ratio - b.ratio : b.ratio - a.ratio
            );
        } else if (c.prioritizeBy === 'distance') {
            filtered.sort((a, b) => a.distance - b.distance);
        } else if (c.prioritizeBy === 'amount') {
            filtered.sort((a, b) =>
                c.action === 'buy' ? b.sellAmount - a.sellAmount : b.buyAmount - a.buyAmount
            );
        }

        log(`Found ${filtered.length} offers matching criteria`);
        return filtered;
    } catch (error) {
        logError("Error finding best market offers", error);
        return [];
    }
}

// -------------------------------------------------------------------------
// MARKET INTERACTION AND TRADE EXECUTION
// -------------------------------------------------------------------------

/**
 * Executes a market trade by accepting an offer
 * @param {Object} offer - The offer to accept
 * @returns {Promise<boolean>} - Success status
 */
async function acceptMarketOffer(offer) {
    try {
        if (!offer || !offer.actionButton) {
            logError("Cannot accept offer: invalid offer or missing action button", new Error("Invalid offer"));
            return false;
        }
        
        log(`Accepting offer: ${offer.sellAmount} ${offer.sellResource} for ${offer.buyAmount} ${offer.buyResource}`);
        
        // Check if we have enough merchants
        if (villageCache.merchantsAvailable < offer.merchantsRequired) {
            log(`Not enough merchants available. Need ${offer.merchantsRequired}, have ${villageCache.merchantsAvailable}`);
            return false;
        }
        
        // Check if we have enough resources to buy
        if (offer.buyResource && villageCache.resources[offer.buyResource] < offer.buyAmount) {
            log(`Not enough ${offer.buyResource} to buy this offer`);
            return false;
        }
        
        // Click the accept button
        await simulateClick(offer.actionButton);
        
        // Wait for confirmation page to load
        await randomWait(1000, 2000);
        
        // Look for the confirmation button
        const confirmButton = document.querySelector('input[type="submit"][name="submit"]');
        if (confirmButton) {
            // Add human-like delay before confirming
            await randomWait(800, 1500);
            
            // Click the confirm button
            await simulateClick(confirmButton);
            
            // Wait for result
            await randomWait(1000, 2000);
            
            // Check for success message
            const successMessage = document.querySelector('.success');
            if (successMessage) {
                log("Offer accepted successfully");
                
                // Update merchant count
                villageCache.merchantsAvailable -= offer.merchantsRequired;
                
                // Update resource counts
                if (offer.buyResource) {
                    villageCache.resources[offer.buyResource] -= offer.buyAmount;
                }
                
                // Update stats
                stats.tradesCompleted++;
                stats.resourcesTraded[offer.sellResource] += offer.sellAmount;
                stats.lastAction = Date.now();
                stats.sessionActions++;
                
                return true;
            } else {
                const errorMessage = document.querySelector('.error');
                if (errorMessage) {
                    logError(`Error accepting offer: ${errorMessage.textContent}`, new Error("Acceptance failed"));
                } else {
                    logError("Unknown error accepting offer", new Error("Acceptance failed"));
                }
                return false;
            }
        } else {
            logError("Cannot find confirmation button", new Error("Confirmation not found"));
            return false;
        }
    } catch (error) {
        logError("Error accepting market offer", error);
        return false;
    }
}

/**
 * Creates a new market offer
 * @param {Object} offerDetails - Details of the offer to create
 * @returns {Promise<boolean>} - Success status
 */
async function createMarketOffer(offerDetails) {
    try {
        // Default offer details
        const defaultDetails = {
            sellResource: 'wood',
            sellAmount: 1000,
            buyResource: 'stone',
            buyAmount: 1000,
            maxTime: 0 // 0 = any distance
        };
        
        // Merge with provided details
        const details = { ...defaultDetails, ...offerDetails };
        
        // Navigate to the create offer page
        const success = await navigateToMarketTab('own_offers');
        if (!success) {
            logError("Failed to navigate to own offers tab", new Error("Navigation failed"));
            return false;
        }
        
        // Wait for page to load
        await randomWait(800, 1500);
        
        // Find the create offer form
        const createOfferButton = document.querySelector('a.btn[href*="mode=new_offer"]');
        if (!createOfferButton) {
            logError("Cannot find create offer button", new Error("Button not found"));
            return false;
        }
        
        // Click the create offer button
        await simulateClick(createOfferButton);
        await randomWait(1000, 2000);
        
        // Fill the form
        // Select sell resource
        const sellResourceSelect = document.querySelector('select[name="sell_resource"]');
        if (sellResourceSelect) {
            sellResourceSelect.value = details.sellResource;
            await simulateEvent(sellResourceSelect, 'change');
        } else {
            logError("Cannot find sell resource select", new Error("Form element not found"));
            return false;
        }
        
        // Enter sell amount
        const sellAmountInput = document.querySelector('input[name="sell_amount"]');
        if (sellAmountInput) {
            await simulateTyping(sellAmountInput, details.sellAmount.toString());
        } else {
            logError("Cannot find sell amount input", new Error("Form element not found"));
            return false;
        }
        
        // Select buy resource
        const buyResourceSelect = document.querySelector('select[name="buy_resource"]');
        if (buyResourceSelect) {
            buyResourceSelect.value = details.buyResource;
            await simulateEvent(buyResourceSelect, 'change');
        } else {
            logError("Cannot find buy resource select", new Error("Form element not found"));
            return false;
        }
        
        // Enter buy amount
        const buyAmountInput = document.querySelector('input[name="buy_amount"]');
        if (buyAmountInput) {
            await simulateTyping(buyAmountInput, details.buyAmount.toString());
        } else {
            logError("Cannot find buy amount input", new Error("Form element not found"));
            return false;
        }
        
        // Set max time if specified
        if (details.maxTime > 0) {
            const maxTimeInput = document.querySelector('input[name="max_time"]');
            if (maxTimeInput) {
                await simulateTyping(maxTimeInput, details.maxTime.toString());
            }
        }
        
        // Add human-like delay before submitting
        await randomWait(1200, 2500);
        
        // Submit the form
        const submitButton = document.querySelector('input[type="submit"]');
        if (submitButton) {
            await simulateClick(submitButton);
            
            // Wait for result
            await randomWait(1000, 2000);
            
            // Check for success message
            const successMessage = document.querySelector('.success');
            if (successMessage) {
                log("Offer created successfully");
                return true;
            } else {
                const errorMessage = document.querySelector('.error');
                if (errorMessage) {
                    logError(`Error creating offer: ${errorMessage.textContent}`, new Error("Creation failed"));
                } else {
                    logError("Unknown error creating offer", new Error("Creation failed"));
                }
                return false;
            }
        } else {
            logError("Cannot find submit button", new Error("Button not found"));
            return false;
        }
    } catch (error) {
        logError("Error creating market offer", error);
        return false;
    }
}

/**
 * Executes a batch of market trades to optimize efficiency
 * @param {Array} offers - Offers to process
 * @param {number} maxTrades - Maximum number of trades to execute
 * @returns {Promise<number>} - Number of successful trades
 */
async function executeBatchTrades(offers, maxTrades = 3) {
    try {
        if (!offers || offers.length === 0) {
            log("No offers to process in batch");
            return 0;
        }
        
        // Limit to maximum trades
        const tradesToExecute = offers.slice(0, maxTrades);
        log(`Executing batch of ${tradesToExecute.length} trades`);
        
        let successfulTrades = 0;
        
        // Process each trade
        for (let i = 0; i < tradesToExecute.length; i++) {
            const offer = tradesToExecute[i];
            
            // Execute the trade
            const success = await acceptMarketOffer(offer);
            
            if (success) {
                successfulTrades++;
                log(`Batch trade ${i+1}/${tradesToExecute.length} successful`);
                
                // Add variable delay between trades for human-like behavior
                if (i < tradesToExecute.length - 1) {
                    await randomWait(1500, 3500);
                }
            } else {
                log(`Batch trade ${i+1}/${tradesToExecute.length} failed`);
                
                // Add longer delay after failure
                await randomWait(3000, 5000);
            }
            
            // Navigate back to market offers page if not the last trade
            if (i < tradesToExecute.length - 1) {
                await navigateToMarketTab('other_offers');
                await randomWait(1000, 2000);
            }
        }
        
        log(`Batch trading completed: ${successfulTrades}/${tradesToExecute.length} successful`);
        return successfulTrades;
    } catch (error) {
        logError("Error executing batch trades", error);
        return 0;
    }
}

// -------------------------------------------------------------------------
// ADVANCED ANTI-DETECTION AND HUMAN BEHAVIOR SIMULATION
// -------------------------------------------------------------------------

/**
 * Simulates human-like mouse movement and click
 * @param {Element} element - Element to click
 * @returns {Promise<boolean>} - Success status
 */
async function simulateClick(element) {
    try {
        if (!element) {
            logError("Cannot click null element", new Error("Invalid element"));
            return false;
        }
        
        // Get element position
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Add slight randomness to click position
        const offsetX = (Math.random() - 0.5) * (rect.width * 0.6);
        const offsetY = (Math.random() - 0.5) * (rect.height * 0.6);
        
        const clickX = centerX + offsetX;
        const clickY = centerY + offsetY;
        
        // Create and dispatch mouse events
        // MouseMove first (optional for more human-like behavior)
        const moveEvent = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clickX,
            clientY: clickY
        });
        element.dispatchEvent(moveEvent);
        
        // Short delay between move and click
        await randomWait(50, 150);
        
        // MouseDown
        const mouseDownEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clickX,
            clientY: clickY,
            button: 0
        });
        element.dispatchEvent(mouseDownEvent);
        
        // Short delay between down and up
        await randomWait(30, 100);
        
        // MouseUp
        const mouseUpEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clickX,
            clientY: clickY,
            button: 0
        });
        element.dispatchEvent(mouseUpEvent);
        
        // Click event
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: clickX,
            clientY: clickY,
            button: 0
        });
        element.dispatchEvent(clickEvent);
        
        return true;
    } catch (error) {
        logError("Error simulating click", error);
        return false;
    }
}

/**
 * Simulates human-like typing in an input field
 * @param {Element} element - Input element
 * @param {string} text - Text to type
 * @returns {Promise<boolean>} - Success status
 */
async function simulateTyping(element, text) {
    try {
        if (!element) {
            logError("Cannot type in null element", new Error("Invalid element"));
            return false;
        }
        
        // Focus the element
        element.focus();
        await randomWait(100, 300);
        
        // Clear existing value with select all + delete
        element.select();
        await randomWait(50, 150);
        
        // Dispatch delete key event
        const deleteEvent = new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Delete'
        });
        element.dispatchEvent(deleteEvent);
        
        // Set empty value
        element.value = '';
        await randomWait(50, 150);
        
        // Type each character with random delays
        for (let i = 0; i < text.length; i++) {
            const char = text.charAt(i);
            
            // Add the character
            element.value += char;
            
            // Dispatch events
            const keyDownEvent = new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key: char
            });
            element.dispatchEvent(keyDownEvent);
            
            const inputEvent = new Event('input', {
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(inputEvent);
            
            const keyUpEvent = new KeyboardEvent('keyup', {
                bubbles: true,
                cancelable: true,
                key: char
            });
            element.dispatchEvent(keyUpEvent);
            
            // Random delay between keystrokes
            await randomWait(50, 150);
        }
        
        // Dispatch change event
        const changeEvent = new Event('change', {
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(changeEvent);
        
        // Blur the element
        element.blur();
        
        return true;
    } catch (error) {
        logError("Error simulating typing", error);
        return false;
    }
}

/**
 * Simulates a DOM event on an element
 * @param {Element} element - Target element
 * @param {string} eventType - Event type to simulate
 * @returns {Promise<boolean>} - Success status
 */
async function simulateEvent(element, eventType) {
    try {
        if (!element) {
            logError(`Cannot dispatch ${eventType} on null element`, new Error("Invalid element"));
            return false;
        }
        
        const event = new Event(eventType, {
            bubbles: true,
            cancelable: true
        });
        
        element.dispatchEvent(event);
        return true;
    } catch (error) {
        logError(`Error simulating ${eventType} event`, error);
        return false;
    }
}

/**
 * Waits for a random amount of time within a range
 * @param {number} min - Minimum wait time in ms
 * @param {number} max - Maximum wait time in ms
 * @returns {Promise} - Promise that resolves after the wait
 */
function randomWait(min, max) {
    // Add human-like variability
    const variance = Math.random() * 0.3 + 0.85; // 0.85 - 1.15
    const base = Math.floor(Math.random() * (max - min + 1) + min);
    const delay = Math.floor(base * variance);
    
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Generates a random ID for offers
 * @returns {string} - Random ID
 */
function generateRandomId() {
    return Math.random().toString(36).substring(2, 15);
}

/**
 * Adds random mouse movements to simulate human behavior
 * @param {number} duration - Duration in ms
 * @returns {Promise} - Promise that resolves after simulation
 */
async function simulateRandomMouseMovements(duration = 2000) {
    try {
        const startTime = Date.now();
        const endTime = startTime + duration;
        
        // Create a div to track mouse position if needed
        let mouseTracker = document.getElementById('tw-mouse-tracker');
        if (!mouseTracker) {
            mouseTracker = document.createElement('div');
            mouseTracker.id = 'tw-mouse-tracker';
            mouseTracker.style.position = 'fixed';
            mouseTracker.style.top = '0';
            mouseTracker.style.left = '0';
            mouseTracker.style.width = '1px';
            mouseTracker.style.height = '1px';
            mouseTracker.style.pointerEvents = 'none';
            mouseTracker.style.zIndex = '-1';
            document.body.appendChild(mouseTracker);
        }
        
        // Initial position
        let currentX = Math.random() * window.innerWidth;
        let currentY = Math.random() * window.innerHeight;
        
        // Simulate movements
        while (Date.now() < endTime) {
            // Generate target position with natural tendency toward page content
            const targetX = Math.random() * window.innerWidth * 0.8 + window.innerWidth * 0.1;
            const targetY = Math.random() * window.innerHeight * 0.7 + window.innerHeight * 0.15;
            
            // Calculate distance
            const distance = Math.sqrt(Math.pow(targetX - currentX, 2) + Math.pow(targetY - currentY, 2));
            
            // Number of steps based on distance
            const steps = Math.max(5, Math.min(20, Math.floor(distance / 10)));
            
            // Move in steps
            for (let i = 0; i < steps; i++) {
                // Break if overall duration exceeded
                if (Date.now() >= endTime) break;
                
                // Calculate next position with slight randomness
                currentX = currentX + (targetX - currentX) / (steps - i) + (Math.random() - 0.5) * 5;
                currentY = currentY + (targetY - currentY) / (steps - i) + (Math.random() - 0.5) * 5;
                
                // Create and dispatch mouse move event
                const moveEvent = new MouseEvent('mousemove', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: currentX,
                    clientY: currentY
                });
                
                mouseTracker.dispatchEvent(moveEvent);
                
                // Random delay between movements
                await randomWait(10, 50);
            }
            
            // Pause at destination
            await randomWait(300, 1200);
        }
        
        return true;
    } catch (error) {
        logError("Error simulating mouse movements", error);
        return false;
    }
}

/**
 * Simulates random scrolling behavior
 * @param {number} duration - Duration in ms
 * @returns {Promise} - Promise that resolves after simulation
 */
async function simulateRandomScrolling(duration = 3000) {
    try {
        const startTime = Date.now();
        const endTime = startTime + duration;
        
        // Initial scroll position
        let currentScroll = window.scrollY;
        
        // Document height
        const docHeight = Math.max(
            document.body.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.clientHeight,
            document.documentElement.scrollHeight,
            document.documentElement.offsetHeight
        );
        
        // Viewport height
        const viewportHeight = window.innerHeight;
        
        // Maximum scroll position
        const maxScroll = docHeight - viewportHeight;
        
        // Simulate scrolling
        while (Date.now() < endTime) {
            // Generate target scroll position with tendency to stay in content area
            const targetScroll = Math.random() * maxScroll * 0.8;
            
            // Calculate distance
            const distance = Math.abs(targetScroll - currentScroll);
            
            // Number of steps based on distance
            const steps = Math.max(5, Math.min(15, Math.floor(distance / 100)));
            
            // Scroll in steps
            for (let i = 0; i < steps; i++) {
                // Break if overall duration exceeded
                if (Date.now() >= endTime) break;
                
                // Calculate next position with slight randomness
                currentScroll = currentScroll + (targetScroll - currentScroll) / (steps - i) + (Math.random() - 0.5) * 10;
                
                // Perform scroll
                window.scrollTo({
                    top: currentScroll,
                    behavior: 'auto'
                });
                
                // Random delay between scrolls
                await randomWait(50, 150);
            }
            
            // Pause at destination
            await randomWait(500, 2000);
        }
        
        return true;
    } catch (error) {
        logError("Error simulating scrolling", error);
        return false;
    }
}

// -------------------------------------------------------------------------
// INTELLIGENT TRADING STRATEGIES
// -------------------------------------------------------------------------

/**
 * Executes a smart trading strategy based on market conditions
 * @param {Object} marketData - Current market data
 * @param {Object} villageData - Current village data
 * @param {Object} config - Bot configuration
 * @returns {Promise<Object>} - Trading results
 */
async function executeSmartTradingStrategy(marketData, villageData, config) {
    try {
        log("Executing smart trading strategy");
        
        // Initialize result
        const result = {
            success: false,
            tradesExecuted: 0,
            profitGenerated: 0,
            errors: []
        };
        
        // Check if we have enough data
        if (!marketData || !marketData.offers || marketData.offers.length === 0) {
            result.errors.push("Insufficient market data");
            return result;
        }
        
        // Analyze market trends
        const trends = analyzeMarketTrends(marketData.offers, marketData.priceHistory);
        
        // Determine trading strategy based on trends and resources
        let tradingStrategy = 'balanced';
        
        // Check for resource imbalance
        const resources = villageData.resources;
        const totalResources = resources.wood + resources.stone + resources.iron;
        const resourceRatios = {
            wood: resources.wood / totalResources,
            stone: resources.stone / totalResources,
            iron: resources.iron / totalResources
        };
        
        // Detect severe imbalance
        const idealRatio = 1/3; // Equal distribution
        const imbalanceThreshold = 0.15; // 15% deviation from ideal
        
        let mostExcess = null;
        let mostDeficit = null;
        let maxExcess = 0;
        let maxDeficit = 0;
        
        Object.keys(resourceRatios).forEach(resource => {
            const deviation = resourceRatios[resource] - idealRatio;
            
            if (deviation > imbalanceThreshold && deviation > maxExcess) {
                maxExcess = deviation;
                mostExcess = resource;
            } else if (deviation < -imbalanceThreshold && -deviation > maxDeficit) {
                maxDeficit = -deviation;
                mostDeficit = resource;
            }
        });
        
        // Determine strategy based on imbalance and market trends
        if (mostExcess && mostDeficit) {
            // We have both excess and deficit
            const excessTrend = trends[mostExcess].trend;
            const deficitTrend = trends[mostDeficit].trend;
            
            if (excessTrend === 'rising' || deficitTrend === 'falling') {
                // Good time to sell excess and buy deficit
                tradingStrategy = 'rebalance';
            } else if (excessTrend === 'falling' && deficitTrend === 'stable') {
                // Hold excess, only buy deficit if good deals
                tradingStrategy = 'cautious_buy';
            } else if (excessTrend === 'stable' && deficitTrend === 'rising') {
                // Sell excess, hold on deficit
                tradingStrategy = 'cautious_sell';
            } else {
                // Default balanced approach
                tradingStrategy = 'balanced';
            }
        } else if (mostExcess) {
            // Only excess, no deficit
            if (trends[mostExcess].trend === 'rising') {
                tradingStrategy = 'aggressive_sell';
            } else if (trends[mostExcess].trend === 'falling') {
                tradingStrategy = 'hold';
            } else {
                tradingStrategy = 'moderate_sell';
            }
        } else if (mostDeficit) {
            // Only deficit, no excess
            if (trends[mostDeficit].trend === 'falling') {
                tradingStrategy = 'aggressive_buy';
            } else if (trends[mostDeficit].trend === 'rising') {
                tradingStrategy = 'wait';
            } else {
                tradingStrategy = 'moderate_buy';
            }
        } else {
            // No significant imbalance
            tradingStrategy = 'opportunistic';
        }
        
        log(`Selected trading strategy: ${tradingStrategy}`);
        
        // Execute the selected strategy
        switch (tradingStrategy) {
            case 'rebalance':
                // Sell excess and buy deficit in one session
                await executeRebalanceStrategy(mostExcess, mostDeficit, marketData, villageData, config, result);
                break;
                
            case 'aggressive_sell':
                // Focus on selling excess resource
                await executeSellingStrategy(mostExcess, marketData, villageData, config, result, true);
                break;
                
            case 'moderate_sell':
                // Sell excess but only at good prices
                await executeSellingStrategy(mostExcess, marketData, villageData, config, result, false);
                break;
                
            case 'aggressive_buy':
                // Focus on buying deficit resource
                await executeBuyingStrategy(mostDeficit, marketData, villageData, config, result, true);
                break;
                
            case 'moderate_buy':
                // Buy deficit but only at good prices
                await executeBuyingStrategy(mostDeficit, marketData, villageData, config, result, false);
                break;
                
            case 'cautious_buy':
                // Only buy at very good prices
                await executeCautiousBuyingStrategy(mostDeficit, marketData, villageData, config, result);
                break;
                
            case 'cautious_sell':
                // Only sell at very good prices
                await executeCautiousSellingStrategy(mostExcess, marketData, villageData, config, result);
                break;
                
            case 'opportunistic':
                // Look for any good deals
                await executeOpportunisticStrategy(marketData, villageData, config, result);
                break;
                
            case 'hold':
            case 'wait':
                // Do nothing
                log("Strategy is to hold/wait - no trades executed");
                break;
                
            default:
                // Balanced approach
                await executeBalancedStrategy(marketData, villageData, config, result);
        }
        
        // Set success based on trades executed
        result.success = result.tradesExecuted > 0;
        
        log(`Trading strategy execution completed: ${result.tradesExecuted} trades`);
        return result;
    } catch (error) {
        logError("Error executing smart trading strategy", error);
        return {
            success: false,
            tradesExecuted: 0,
            profitGenerated: 0,
            errors: ["Exception during strategy execution: " + error.message]
        };
    }
}

/**
 * Executes a rebalance strategy (sell excess, buy deficit)
 * @param {string} excessResource - Resource in excess
 * @param {string} deficitResource - Resource in deficit
 * @param {Object} marketData - Market data
 * @param {Object} villageData - Village data
 * @param {Object} config - Bot configuration
 * @param {Object} result - Result object to update
 * @returns {Promise<void>}
 */
async function executeRebalanceStrategy(excessResource, deficitResource, marketData, villageData, config, result) {
    try {
        log(`Executing rebalance strategy: sell ${excessResource}, buy ${deficitResource}`);
        
        // First try to sell excess
        const excessAmount = villageData.resources[excessResource] - config.minResourceStock;
        if (excessAmount > 1000) {
            // Find best selling offers
            const sellCriteria = {
                action: 'sell',
                resource: excessResource,
                minAmount: 1000,
                maxAmount: Math.min(excessAmount, 10000),
                minRatio: 0.9, // Minimum acceptable ratio
                prioritizeBy: 'ratio'
            };
            
            const sellOffers = findBestMarketOffers(marketData.offers, sellCriteria);
            
            if (sellOffers.length > 0) {
                // Navigate to market offers page
                await navigateToMarketTab('other_offers');
                
                // Execute batch of sell trades
                const sellSuccess = await executeBatchTrades(sellOffers, 2);
                result.tradesExecuted += sellSuccess;
                
                if (sellSuccess > 0) {
                    log(`Successfully sold ${excessResource}`);
                }
            }
        }
        
        // Then try to buy deficit
        const deficitAmount = config.maxResourceStock - villageData.resources[deficitResource];
        if (deficitAmount > 1000) {
            // Find best buying offers
            const buyCriteria = {
                action: 'buy',
                resource: deficitResource,
                minAmount: 1000,
                maxAmount: Math.min(deficitAmount, 10000),
                maxRatio: 1.1, // Maximum acceptable ratio
                prioritizeBy: 'ratio'
            };
            
            const buyOffers = findBestMarketOffers(marketData.offers, buyCriteria);
            
            if (buyOffers.length > 0) {
                // Navigate to market offers page
                await navigateToMarketTab('other_offers');
                
                // Execute batch of buy trades
                const buySuccess = await executeBatchTrades(buyOffers, 2);
                result.tradesExecuted += buySuccess;
                
                if (buySuccess > 0) {
                    log(`Successfully bought ${deficitResource}`);
                }
            }
        }
    } catch (error) {
        logError("Error executing rebalance strategy", error);
        result.errors.push("Rebalance strategy error: " + error.message);
    }
}

/**
 * Executes a selling strategy
 * @param {string} resource - Resource to sell
 * @param {Object} marketData - Market data
 * @param {Object} villageData - Village data
 * @param {Object} config - Bot configuration
 * @param {Object} result - Result object to update
 * @param {boolean} aggressive - Whether to be aggressive in selling
 * @returns {Promise<void>}
 */
async function executeSellingStrategy(resource, marketData, villageData, config, result, aggressive) {
    try {
        log(`Executing ${aggressive ? 'aggressive' : 'moderate'} selling strategy for ${resource}`);
        
        const excessAmount = villageData.resources[resource] - config.minResourceStock;
        if (excessAmount <= 1000) {
            log(`Not enough ${resource} to sell`);
            return;
        }
        
        // Determine minimum ratio based on strategy
        const minRatio = aggressive ? 0.8 : 1.0;
        
        // Find best selling offers
        const sellCriteria = {
            action: 'sell',
            resource: resource,
            minAmount: 1000,
            maxAmount: Math.min(excessAmount, 10000),
            minRatio: minRatio,
            prioritizeBy: 'ratio'
        };
        
        const sellOffers = findBestMarketOffers(marketData.offers, sellCriteria);
        
        if (sellOffers.length > 0) {
            // Navigate to market offers page
            await navigateToMarketTab('other_offers');
            
            // Execute batch of sell trades
            const maxTrades = aggressive ? 3 : 2;
            const sellSuccess = await executeBatchTrades(sellOffers, maxTrades);
            result.tradesExecuted += sellSuccess;
            
            if (sellSuccess > 0) {
                log(`Successfully sold ${resource} (${sellSuccess} trades)`);
            }
        } else if (aggressive) {
            // If aggressive and no good offers, create our own
            log(`No good sell offers found for ${resource}, creating our own`);
            
            // Determine resources to buy in exchange
            const resourceOptions = ['wood', 'stone', 'iron'].filter(r => r !== resource);
            const buyResource = resourceOptions[Math.floor(Math.random() * resourceOptions.length)];
            
            // Create sell offer
            const offerDetails = {
                sellResource: resource,
                sellAmount: Math.min(excessAmount, 5000),
                buyResource: buyResource,
                buyAmount: Math.floor(Math.min(excessAmount, 5000) * 0.9) // Slightly favorable ratio
            };
            
            const createSuccess = await createMarketOffer(offerDetails);
            if (createSuccess) {
                log(`Successfully created sell offer for ${resource}`);
                result.tradesExecuted += 1;
            }
        }
    } catch (error) {
        logError(`Error executing ${resource} selling strategy`, error);
        result.errors.push(`Selling strategy error: ${error.message}`);
    }
}

/**
 * Executes a buying strategy
 * @param {string} resource - Resource to buy
 * @param {Object} marketData - Market data
 * @param {Object} villageData - Village data
 * @param {Object} config - Bot configuration
 * @param {Object} result - Result object to update
 * @param {boolean} aggressive - Whether to be aggressive in buying
 * @returns {Promise<void>}
 */
async function executeBuyingStrategy(resource, marketData, villageData, config, result, aggressive) {
    try {
        log(`Executing ${aggressive ? 'aggressive' : 'moderate'} buying strategy for ${resource}`);
        
        const deficitAmount = config.maxResourceStock - villageData.resources[resource];
        if (deficitAmount <= 1000) {
            log(`Not enough deficit of ${resource} to justify buying`);
            return;
        }
        
        // Determine maximum ratio based on strategy
        const maxRatio = aggressive ? 1.2 : 1.0;
        
        // Find best buying offers
        const buyCriteria = {
            action: 'buy',
            resource: resource,
            minAmount: 1000,
            maxAmount: Math.min(deficitAmount, 10000),
            maxRatio: maxRatio,
            prioritizeBy: 'ratio'
        };
        
        const buyOffers = findBestMarketOffers(marketData.offers, buyCriteria);
        
        if (buyOffers.length > 0) {
            // Navigate to market offers page
            await navigateToMarketTab('other_offers');
            
            // Execute batch of buy trades
            const maxTrades = aggressive ? 3 : 2;
            const buySuccess = await executeBatchTrades(buyOffers, maxTrades);
            result.tradesExecuted += buySuccess;
            
            if (buySuccess > 0) {
                log(`Successfully bought ${resource} (${buySuccess} trades)`);
            }
        } else if (aggressive) {
            // If aggressive and no good offers, create our own
            log(`No good buy offers found for ${resource}, creating our own`);
            
            // Determine resources to sell in exchange
            const resourceOptions = ['wood', 'stone', 'iron'].filter(r => r !== resource);
            let sellResource = null;
            
            // Find resource with highest amount
            let maxAmount = 0;
            resourceOptions.forEach(r => {
                const available = villageData.resources[r] - config.minResourceStock;
                if (available > maxAmount) {
                    maxAmount = available;
                    sellResource = r;
                }
            });
            
            if (sellResource && maxAmount > 1000) {
                // Create buy offer
                const offerDetails = {
                    sellResource: sellResource,
                    sellAmount: Math.min(maxAmount, 5000),
                    buyResource: resource,
                    buyAmount: Math.floor(Math.min(maxAmount, 5000) * 1.1) // Slightly favorable ratio
                };
                
                const createSuccess = await createMarketOffer(offerDetails);
                if (createSuccess) {
                    log(`Successfully created buy offer for ${resource}`);
                    result.tradesExecuted += 1;
                }
            }
        }
    } catch (error) {
        logError(`Error executing ${resource} buying strategy`, error);
        result.errors.push(`Buying strategy error: ${error.message}`);
    }
}

/**
 * Executes a cautious buying strategy (only very good deals)
 * @param {string} resource - Resource to buy
 * @param {Object} marketData - Market data
 * @param {Object} villageData - Village data
 * @param {Object} config - Bot configuration
 * @param {Object} result - Result object to update
 * @returns {Promise<void>}
 */
async function executeCautiousBuyingStrategy(resource, marketData, villageData, config, result) {
    try {
        log(`Executing cautious buying strategy for ${resource}`);
        
        // Only buy at very good prices
        const buyCriteria = {
            action: 'buy',
            resource: resource,
            minAmount: 1000,
            maxRatio: 0.9, // Only buy at below-market prices
            prioritizeBy: 'ratio'
        };
        
        const buyOffers = findBestMarketOffers(marketData.offers, buyCriteria);
        
        if (buyOffers.length > 0) {
            // Navigate to market offers page
            await navigateToMarketTab('other_offers');
            
            // Execute limited batch of buy trades
            const buySuccess = await executeBatchTrades(buyOffers, 1);
            result.tradesExecuted += buySuccess;
            
            if (buySuccess > 0) {
                log(`Successfully bought ${resource} at favorable price`);
            }
        } else {
            log(`No favorable buying opportunities for ${resource}`);
        }
    } catch (error) {
        logError(`Error executing cautious buying strategy for ${resource}`, error);
        result.errors.push(`Cautious buying strategy error: ${error.message}`);
    }
}

/**
 * Executes a cautious selling strategy (only very good deals)
 * @param {string} resource - Resource to sell
 * @param {Object} marketData - Market data
 * @param {Object} villageData - Village data
 * @param {Object} config - Bot configuration
 * @param {Object} result - Result object to update
 * @returns {Promise<void>}
 */
async function executeCautiousSellingStrategy(resource, marketData, villageData, config, result) {
    try {
        log(`Executing cautious selling strategy for ${resource}`);
        
        // Only sell at very good prices
        const sellCriteria = {
            action: 'sell',
            resource: resource,
            minAmount: 1000,
            minRatio: 1.1, // Only sell at above-market prices
            prioritizeBy: 'ratio'
        };
        
        const sellOffers = findBestMarketOffers(marketData.offers, sellCriteria);
        
        if (sellOffers.length > 0) {
            // Navigate to market offers page
            await navigateToMarketTab('other_offers');
            
            // Execute limited batch of sell trades
            const sellSuccess = await executeBatchTrades(sellOffers, 1);
            result.tradesExecuted += sellSuccess;
            
            if (sellSuccess > 0) {
                log(`Successfully sold ${resource} at favorable price`);
            }
        } else {
            log(`No favorable selling opportunities for ${resource}`);
        }
    } catch (error) {
        logError(`Error executing cautious selling strategy for ${resource}`, error);
        result.errors.push(`Cautious selling strategy error: ${error.message}`);
    }
}

/**
 * Executes an opportunistic strategy (look for any good deals)
 * @param {Object} marketData - Market data
 * @param {Object} villageData - Village data
 * @param {Object} config - Bot configuration
 * @param {Object} result - Result object to update
 * @returns {Promise<void>}
 */
async function executeOpportunisticStrategy(marketData, villageData, config, result) {
    try {
        log("Executing opportunistic trading strategy");
        
        // Look for any significantly favorable deals
        const resources = ['wood', 'stone', 'iron'];
        let bestOpportunity = null;
        let bestRatio = 0;
        
        // Check each resource for buying opportunities
        resources.forEach(resource => {
            const buyCriteria = {
                action: 'buy',
                resource: resource,
                minAmount: 1000,
                maxRatio: 0.85, // Very good buy price
                prioritizeBy: 'ratio'
            };
            
            const buyOffers = findBestMarketOffers(marketData.offers, buyCriteria);
            
            if (buyOffers.length > 0 && (1 / buyOffers[0].ratio) > bestRatio) {
                bestOpportunity = {
                    type: 'buy',
                    resource: resource,
                    offers: buyOffers,
                    ratio: 1 / buyOffers[0].ratio
                };
                bestRatio = 1 / buyOffers[0].ratio;
            }
        });
        
        // Check each resource for selling opportunities
        resources.forEach(resource => {
            // Only consider selling if we have enough
            const excessAmount = villageData.resources[resource] - config.minResourceStock;
            if (excessAmount < 1000) return;
            
            const sellCriteria = {
                action: 'sell',
                resource: resource,
                minAmount: 1000,
                maxAmount: excessAmount,
                minRatio: 1.15, // Very good sell price
                prioritizeBy: 'ratio'
            };
            
            const sellOffers = findBestMarketOffers(marketData.offers, sellCriteria);
            
            if (sellOffers.length > 0 && sellOffers[0].ratio > bestRatio) {
                bestOpportunity = {
                    type: 'sell',
                    resource: resource,
                    offers: sellOffers,
                    ratio: sellOffers[0].ratio
                };
                bestRatio = sellOffers[0].ratio;
            }
        });
        
        // Execute the best opportunity if found
        if (bestOpportunity) {
            log(`Found opportunistic ${bestOpportunity.type} opportunity for ${bestOpportunity.resource} (ratio: ${bestOpportunity.ratio.toFixed(2)})`);
            
            // Navigate to market offers page
            await navigateToMarketTab('other_offers');
            
            // Execute the trade
            const success = await executeBatchTrades(bestOpportunity.offers, 1);
            result.tradesExecuted += success;
            
            if (success > 0) {
                log(`Successfully executed opportunistic ${bestOpportunity.type} for ${bestOpportunity.resource}`);
            }
        } else {
            log("No significant trading opportunities found");
        }
    } catch (error) {
        logError("Error executing opportunistic strategy", error);
        result.errors.push(`Opportunistic strategy error: ${error.message}`);
    }
}

/**
 * Executes a balanced trading strategy
 * @param {Object} marketData - Market data
 * @param {Object} villageData - Village data
 * @param {Object} config - Bot configuration
 * @param {Object} result - Result object to update
 * @returns {Promise<void>}
 */
async function executeBalancedStrategy(marketData, villageData, config, result) {
    try {
        log("Executing balanced trading strategy");
        
        // Check each resource
        const resources = ['wood', 'stone', 'iron'];
        
        // Find resource with highest excess
        let excessResource = null;
        let maxExcess = 0;
        
        resources.forEach(resource => {
            const excess = villageData.resources[resource] - config.minResourceStock;
            if (excess > maxExcess && excess > 2000) {
                maxExcess = excess;
                excessResource = resource;
            }
        });
        
        // Find resource with highest deficit
        let deficitResource = null;
        let maxDeficit = 0;
        
        resources.forEach(resource => {
            const deficit = config.maxResourceStock - villageData.resources[resource];
            if (deficit > maxDeficit && deficit > 2000) {
                maxDeficit = deficit;
                deficitResource = resource;
            }
        });
        
        // Execute trades if we have both excess and deficit
        if (excessResource && deficitResource && excessResource !== deficitResource) {
            log(`Balanced strategy: sell ${excessResource}, buy ${deficitResource}`);
            
            // Try to find direct trade between these resources
            const directCriteria = {
                action: 'sell',
                resource: excessResource,
                minAmount: 1000,
                maxAmount: maxExcess,
                buyResource: deficitResource,
                prioritizeBy: 'ratio'
            };
            
            const directOffers = findBestMarketOffers(marketData.offers, directCriteria);
            
            if (directOffers.length > 0) {
                // Navigate to market offers page
                await navigateToMarketTab('other_offers');
                
                // Execute direct trade
                const success = await executeBatchTrades(directOffers, 1);
                result.tradesExecuted += success;
                
                if (success > 0) {
                    log(`Successfully executed balanced trade: ${excessResource} for ${deficitResource}`);
                }
            } else {
                // If no direct trade, try separate sell and buy
                await executeSellingStrategy(excessResource, marketData, villageData, config, result, false);
                await executeBuyingStrategy(deficitResource, marketData, villageData, config, result, false);
            }
        } else if (excessResource) {
            // Only excess, no significant deficit
            await executeSellingStrategy(excessResource, marketData, villageData, config, result, false);
        } else if (deficitResource) {
            // Only deficit, no significant excess
            await executeBuyingStrategy(deficitResource, marketData, villageData, config, result, false);
        } else {
            log("No significant resource imbalance found for balanced strategy");
        }
    } catch (error) {
        logError("Error executing balanced strategy", error);
        result.errors.push(`Balanced strategy error: ${error.message}`);
    }
}

// -------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -------------------------------------------------------------------------

/**
 * Logs a message to console if debug mode is enabled
 * @param {string} message - Message to log
 */
function log(message) {
    // This function should be defined in the main script
    if (typeof window.twMarketBotLog === 'function') {
        window.twMarketBotLog(message);
    } else {
        console.log(`[TW Market Bot] ${message}`);
    }
}

/**
 * Logs an error message
 * @param {string} message - Error message
 * @param {Error} error - Error object
 */
function logError(message, error) {
    // This function should be defined in the main script
    if (typeof window.twMarketBotLogError === 'function') {
        window.twMarketBotLogError(message, error);
    } else {
        console.error(`[TW Market Bot] ${message}:`, error);
    }
}

// Export functions for the main script
if (typeof window !== 'undefined') {
    window.twMarketExtensions = {
        // Market navigation
        navigateToMarketTab,
        getCurrentMarketTab,
        isMarketPage,
        isMarketOverview,
        isMarketOffersPage,
        
        // Market data extraction
        extractDetailedMarketOffers,
        analyzeMarketTrends,
        findBestMarketOffers,
        
        // Market interaction
        acceptMarketOffer,
        createMarketOffer,
        executeBatchTrades,
        
        // Human behavior simulation
        simulateClick,
        simulateTyping,
        simulateEvent,
        randomWait,
        simulateRandomMouseMovements,
        simulateRandomScrolling,
        
        // Trading strategies
        executeSmartTradingStrategy,
        executeRebalanceStrategy,
        executeSellingStrategy,
        executeBuyingStrategy,
        executeCautiousBuyingStrategy,
        executeCautiousSellingStrategy,
        executeOpportunisticStrategy,
        executeBalancedStrategy
    };
}
