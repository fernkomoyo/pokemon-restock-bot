import { chromium } from 'playwright';
import pc from 'picocolors';
import * as cheerio from 'cheerio';

/**
 * Parses the Pokémon Center product page HTML to check for stock.
 * @param {string} html - Raw HTML content
 * @returns {object} Stock and product metadata
 */
function parseStockFromHtml(html) {
  const $ = cheerio.load(html);
  
  // Extract name
  let name = $('h1').text().trim();
  if (!name) {
    name = $('meta[property="og:title"]').attr('content')?.trim() || '';
  }
  
  // Extract image
  const imageUrl = $('meta[property="og:image"]').attr('content')?.trim() || '';
  
  // Extract price
  let price = $('span[class*="price"], div[class*="price"]').first().text().trim();
  if (!price) {
    const metaPrice = $('meta[property="product:price:amount"]').attr('content');
    price = metaPrice ? `$${metaPrice}` : 'Price N/A';
  }
  
  // Extract stock status
  // 1. Look for button elements
  let hasAddToCart = false;
  let hasOutOfStock = false;
  
  $('button').each((_, el) => {
    const btnText = $(el).text().toLowerCase();
    const isDisabled = $(el).attr('disabled') !== undefined || $(el).attr('disabled') === 'disabled';
    
    if (btnText.includes('add to cart') || btnText.includes('pre-order') || btnText.includes('preorder')) {
      if (!isDisabled) {
        hasAddToCart = true;
      }
    }
    if (btnText.includes('out of stock') || btnText.includes('unavailable') || btnText.includes('sold out')) {
      hasOutOfStock = true;
    }
  });
  
  // 2. Fallback search in page text if buttons aren't conclusive
  let inStock = false;
  if (hasAddToCart) {
    inStock = true;
  } else if (hasOutOfStock) {
    inStock = false;
  } else {
    const bodyText = $('body').text().toLowerCase();
    if (bodyText.includes('add to cart') && !bodyText.includes('out of stock')) {
      inStock = true;
    }
  }
  
  return {
    success: true,
    inStock,
    name: name || 'Unknown Product',
    price,
    imageUrl
  };
}

/**
 * Checks stock via a web scraping API proxy (ScraperAPI, ZenRows, Crawlbase).
 * @param {string} url - Target URL
 * @param {string} provider - Scraper API provider
 * @param {string} apiKey - API key or token
 * @returns {Promise<object|null>} Stock result or null to fall back to Playwright
 */
async function checkProductViaApi(url, provider, apiKey) {
  const actualProvider = provider || (process.env.SCRAPER_API_KEY ? 'scraperapi' : process.env.SCRAPINGANT_API_KEY ? 'scrapingant' : process.env.ZENROWS_API_KEY ? 'zenrows' : 'crawlbase');
  const key = apiKey || process.env.SCRAPER_API_KEY || process.env.SCRAPINGANT_API_KEY || process.env.ZENROWS_API_KEY || process.env.CRAWLBASE_TOKEN;

  if (!key) {
    console.log(pc.yellow(`[SCRAPER] API provider "${actualProvider}" was requested but no API key/token was found. Falling back to Playwright.`));
    return null;
  }

  console.log(pc.cyan(`[SCRAPER] [API] Checking stock via ${actualProvider.toUpperCase()} for: ${url}`));

  let apiUrl = '';
  if (actualProvider === 'scraperapi') {
    const render = process.env.SCRAPERAPI_RENDER === 'true' ? '&render=true' : '';
    apiUrl = `https://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(url)}${render}`;
  } else if (actualProvider === 'scrapingant') {
    const js = process.env.SCRAPINGANT_JS === 'true' ? '&browser=true' : '&browser=false';
    apiUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(url)}&x-api-key=${key}${js}`;
  } else if (actualProvider === 'zenrows') {
    const js = process.env.ZENROWS_JS_RENDER === 'true' ? '&js_render=true' : '';
    apiUrl = `https://api.zenrows.com/v1/?apikey=${key}&url=${encodeURIComponent(url)}${js}`;
  } else if (actualProvider === 'crawlbase') {
    const js = process.env.CRAWLBASE_JS === 'true' ? '&javascript=true' : '';
    apiUrl = `https://api.crawlbase.com/?token=${key}&url=${encodeURIComponent(url)}${js}`;
  }

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`API returned status ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    
    // Check for scraping API service block messages
    if (html.includes('Account suspended') || html.includes('Unauthorized') || html.includes('API key is invalid') || html.includes('out of credits')) {
      throw new Error(`Scraping API error response: ${html.substring(0, 100).trim()}`);
    }

    return parseStockFromHtml(html);
  } catch (err) {
    console.error(pc.red(`[SCRAPER] [API] Error checking product via ${actualProvider}: ${err.message}`));
    return {
      success: false,
      inStock: false,
      name: 'Unknown Product',
      price: 'N/A',
      imageUrl: '',
      error: `API error (${actualProvider}): ${err.message}`
    };
  }
}

/**
 * Checks stock status of a Pokémon Center product URL
 * @param {string} url - The product page URL
 * @param {string} mode - 'live' or 'simulated'
 * @returns {Promise<{ success: boolean, inStock: boolean, name: string, price: string, imageUrl: string, error?: string }>}
 */
export async function checkProduct(url, mode = 'live') {
  // --- SIMULATED MODE ---
  if (mode === 'simulated' || url.includes('sim_stock=')) {
    console.log(pc.yellow(`[SCRAPER] [SIMULATED] Checking stock for: ${url}`));
    
    // Simulate a brief delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    const urlObj = new URL(url);
    const simStock = urlObj.searchParams.get('sim_stock');
    const inStock = simStock === 'true';

    // Parse product name from URL if possible
    const nameMatch = url.match(/\/product\/[^/]+\/([^/?]+)/);
    let name = nameMatch 
      ? nameMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'Simulated Pokemon Product';
    
    return {
      success: true,
      inStock,
      name,
      price: '$119.99',
      imageUrl: 'https://www.pokemoncenter.com/images/products/290-85341/large/290-85341.jpg'
    };
  }

  // --- LIVE MODE ---
  const provider = (process.env.SCRAPER_PROVIDER || '').toLowerCase();
  const scraperApiKey = process.env.SCRAPER_API_KEY || process.env.ZENROWS_API_KEY || process.env.CRAWLBASE_TOKEN;

  if (['scraperapi', 'zenrows', 'crawlbase'].includes(provider) || (scraperApiKey && provider !== 'playwright')) {
    const apiResult = await checkProductViaApi(url, provider, scraperApiKey);
    if (apiResult !== null) {
      return apiResult;
    }
  }

  console.log(pc.cyan(`[SCRAPER] [LIVE] Checking stock for: ${url}`));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });

    // Bypass common bot detection properties
    await context.addInitScript(() => {
      // Remove webdriver property
      delete navigator.__proto__.webdriver;
      // Mock chrome object
      window.chrome = { runtime: {} };
    });

    const page = await context.newPage();
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
      'referer': 'https://www.google.com/'
    });

    // Navigate to URL
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    if (!response) {
      throw new Error('No response received from the server.');
    }

    const statusCode = response.status();
    if (statusCode >= 400) {
      if (statusCode === 403) {
        return {
          success: false,
          inStock: false,
          name: 'Unknown Product',
          price: 'N/A',
          imageUrl: '',
          error: 'Access Denied (403). Blocked by Cloudflare or queue.'
        };
      }
      throw new Error(`HTTP Status Code ${statusCode}`);
    }

    // Check page title for block indicators
    const title = await page.title();
    if (title.includes('Access Denied') || title.includes('Attention Required!') || title.includes('Just a moment...')) {
      return {
        success: false,
        inStock: false,
        name: 'Unknown Product',
        price: 'N/A',
        imageUrl: '',
        error: 'Blocked by Cloudflare security page.'
      };
    }

    // Wait for the body or content to load
    await page.waitForTimeout(2000);

    // Extract basic metadata
    const name = await page.$eval('h1', el => el.textContent?.trim()).catch(async () => {
      // Fallback to og:title
      return await page.$eval('meta[property="og:title"]', el => el.getAttribute('content')?.trim()).catch(() => 'Unknown Product');
    });

    const imageUrl = await page.$eval('meta[property="og:image"]', el => el.getAttribute('content')?.trim()).catch(() => '');
    
    // Attempt to extract price
    const price = await page.$eval('span[class*="price"], div[class*="price"]', el => el.textContent?.trim()).catch(async () => {
      return await page.$eval('meta[property="product:price:amount"]', el => `$${el.getAttribute('content')}`).catch(() => 'Price N/A');
    });

    // Stock detection strategy:
    // Look for button elements with specific text (Add to Cart, Pre-Order, Out of Stock, etc.)
    const buttons = await page.$$eval('button', elems => {
      return elems.map(el => ({
        text: el.textContent ? el.textContent.trim() : '',
        disabled: el.disabled || el.getAttribute('disabled') !== null
      }));
    });

    let hasAddToCart = false;
    let hasOutOfStock = false;

    for (const btn of buttons) {
      const txt = btn.text.toLowerCase();
      if (txt.includes('add to cart') || txt.includes('pre-order') || txt.includes('preorder')) {
        if (!btn.disabled) {
          hasAddToCart = true;
        }
      }
      if (txt.includes('out of stock') || txt.includes('unavailable') || txt.includes('sold out')) {
        hasOutOfStock = true;
      }
    }

    // Determine stock status
    let inStock = false;
    if (hasAddToCart) {
      inStock = true;
    } else if (hasOutOfStock) {
      inStock = false;
    } else {
      // Fallback check: Look at page HTML for "Out of Stock" or "Add to Cart" text
      const pageContent = await page.content();
      const contentLower = pageContent.toLowerCase();
      if (contentLower.includes('add to cart') && !contentLower.includes('out of stock')) {
        inStock = true;
      }
    }

    return {
      success: true,
      inStock,
      name,
      price,
      imageUrl
    };

  } catch (err) {
    console.error(pc.red(`[SCRAPER] Error checking product: ${err.message}`));
    return {
      success: false,
      inStock: false,
      name: 'Unknown Product',
      price: 'N/A',
      imageUrl: '',
      error: err.message
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Helper to clean and de-duplicate product URLs extracted from a page.
 */
function cleanAndDeDuplicateUrls(hrefs) {
  const uniqueUrls = [];
  for (const href of hrefs) {
    try {
      const absoluteUrl = href.startsWith('http') ? href : `https://www.pokemoncenter.com${href}`;
      const urlObj = new URL(absoluteUrl);
      const cleanUrl = `${urlObj.origin}${urlObj.pathname}`;
      if (!uniqueUrls.includes(cleanUrl)) {
        uniqueUrls.push(cleanUrl);
      }
    } catch (_) {
      // Ignore invalid URLs
    }
  }
  return uniqueUrls;
}

/**
 * Checks a category page for product links.
 * @param {string} url - Category page URL
 * @param {string} mode - 'live' or 'simulated'
 * @returns {Promise<{ success: boolean, urls: string[], error?: string }>}
 */
export async function checkCategory(url, mode = 'live') {
  // --- SIMULATED MODE ---
  if (mode === 'simulated' || url.includes('sim_category=') || url.includes('sim_new_drop=')) {
    console.log(pc.yellow(`[SCRAPER] [SIMULATED] Checking category for: ${url}`));
    await new Promise(resolve => setTimeout(resolve, 1500));

    const urlObj = new URL(url);
    const hasNewDrop = urlObj.searchParams.get('sim_new_drop') === 'true' || url.includes('sim_new_drop=true');

    const baseUrls = [
      'https://www.pokemoncenter.com/product/111-11111/simulated-item-one',
      'https://www.pokemoncenter.com/product/222-22222/simulated-item-two'
    ];

    if (hasNewDrop) {
      baseUrls.push('https://www.pokemoncenter.com/product/333-33333/simulated-new-drop-item');
    }

    return {
      success: true,
      urls: baseUrls
    };
  }

  // --- LIVE MODE ---
  const provider = (process.env.SCRAPER_PROVIDER || '').toLowerCase();
  const scraperApiKey = process.env.SCRAPER_API_KEY || process.env.ZENROWS_API_KEY || process.env.CRAWLBASE_TOKEN;

  if (['scraperapi', 'zenrows', 'crawlbase'].includes(provider) || (scraperApiKey && provider !== 'playwright')) {
    const apiResult = await checkCategoryViaApi(url, provider, scraperApiKey);
    if (apiResult !== null) {
      return apiResult;
    }
  }

  return await checkCategoryViaPlaywright(url);
}

/**
 * Checks category links via a scraping API.
 */
async function checkCategoryViaApi(url, provider, apiKey) {
  const actualProvider = provider || (process.env.SCRAPER_API_KEY ? 'scraperapi' : process.env.SCRAPINGANT_API_KEY ? 'scrapingant' : process.env.ZENROWS_API_KEY ? 'zenrows' : 'crawlbase');
  const key = apiKey || process.env.SCRAPER_API_KEY || process.env.SCRAPINGANT_API_KEY || process.env.ZENROWS_API_KEY || process.env.CRAWLBASE_TOKEN;

  if (!key) {
    console.log(pc.yellow(`[SCRAPER] API provider "${actualProvider}" requested for category but no API key/token was found. Falling back to Playwright.`));
    return null;
  }

  console.log(pc.cyan(`[SCRAPER] [API] Checking category via ${actualProvider.toUpperCase()} for: ${url}`));

  let apiUrl = '';
  if (actualProvider === 'scraperapi') {
    const render = process.env.SCRAPERAPI_RENDER === 'true' ? '&render=true' : '';
    apiUrl = `https://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(url)}${render}`;
  } else if (actualProvider === 'scrapingant') {
    const js = process.env.SCRAPINGANT_JS === 'true' ? '&browser=true' : '&browser=false';
    apiUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(url)}&x-api-key=${key}${js}`;
  } else if (actualProvider === 'zenrows') {
    const js = process.env.ZENROWS_JS_RENDER === 'true' ? '&js_render=true' : '';
    apiUrl = `https://api.zenrows.com/v1/?apikey=${key}&url=${encodeURIComponent(url)}${js}`;
  } else if (actualProvider === 'crawlbase') {
    const js = process.env.CRAWLBASE_JS === 'true' ? '&javascript=true' : '';
    apiUrl = `https://api.crawlbase.com/?token=${key}&url=${encodeURIComponent(url)}${js}`;
  }

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`API returned status ${response.status} ${response.statusText}`);
    }
    const html = await response.text();

    if (html.includes('Account suspended') || html.includes('Unauthorized') || html.includes('API key is invalid') || html.includes('out of credits')) {
      throw new Error(`Scraping API error response: ${html.substring(0, 100).trim()}`);
    }

    const $ = cheerio.load(html);
    const hrefs = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/product/')) {
        hrefs.push(href);
      }
    });

    const uniqueUrls = cleanAndDeDuplicateUrls(hrefs);

    return {
      success: true,
      urls: uniqueUrls
    };
  } catch (err) {
    console.error(pc.red(`[SCRAPER] [API] Error checking category via ${actualProvider}: ${err.message}`));
    return {
      success: false,
      urls: [],
      error: `API error (${actualProvider}): ${err.message}`
    };
  }
}

/**
 * Checks category links via Playwright.
 */
async function checkCategoryViaPlaywright(url) {
  console.log(pc.cyan(`[SCRAPER] [LIVE] Checking category via Playwright for: ${url}`));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });

    await context.addInitScript(() => {
      delete navigator.__proto__.webdriver;
      window.chrome = { runtime: {} };
    });

    const page = await context.newPage();
    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
      'referer': 'https://www.google.com/'
    });

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    if (!response) {
      throw new Error('No response received from the server.');
    }

    const statusCode = response.status();
    if (statusCode >= 400) {
      throw new Error(`HTTP Status Code ${statusCode}`);
    }

    // Wait a bit for products to render
    await page.waitForTimeout(2000);

    // Extract all product links
    const hrefs = await page.$$eval('a', links => {
      return links
        .map(el => el.getAttribute('href'))
        .filter(href => href && href.includes('/product/'));
    });

    const uniqueUrls = cleanAndDeDuplicateUrls(hrefs);

    return {
      success: true,
      urls: uniqueUrls
    };
  } catch (err) {
    console.error(pc.red(`[SCRAPER] Error checking category: ${err.message}`));
    return {
      success: false,
      urls: [],
      error: err.message
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

