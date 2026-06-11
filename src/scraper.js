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
    console.log(pc.yellow(`[SCRAPER] API provider "${actualProvider}" was requested but no API key/token was found.`));
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
  const scraperApiKey = process.env.SCRAPER_API_KEY || process.env.SCRAPINGANT_API_KEY || process.env.ZENROWS_API_KEY || process.env.CRAWLBASE_TOKEN;

  if (['scraperapi', 'scrapingant', 'zenrows', 'crawlbase'].includes(provider) || (scraperApiKey && provider !== 'playwright')) {
    const apiResult = await checkProductViaApi(url, provider, scraperApiKey);
    if (apiResult !== null) {
      return apiResult;
    }
  }

  console.log(pc.yellow(`[SCRAPER] No Scraping API provider configured, and Playwright is disabled.`));
  return {
    success: false,
    inStock: false,
    name: 'Unknown Product',
    price: 'N/A',
    imageUrl: '',
    error: 'A Scraping API provider (e.g. ScrapingAnt) must be configured in your environment secrets.'
  };
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
  const scraperApiKey = process.env.SCRAPER_API_KEY || process.env.SCRAPINGANT_API_KEY || process.env.ZENROWS_API_KEY || process.env.CRAWLBASE_TOKEN;

  if (['scraperapi', 'scrapingant', 'zenrows', 'crawlbase'].includes(provider) || (scraperApiKey && provider !== 'playwright')) {
    const apiResult = await checkCategoryViaApi(url, provider, scraperApiKey);
    if (apiResult !== null) {
      return apiResult;
    }
  }

  console.log(pc.yellow(`[SCRAPER] No Scraping API provider configured, and Playwright is disabled.`));
  return {
    success: false,
    urls: [],
    error: 'A Scraping API provider (e.g. ScrapingAnt) must be configured in your environment secrets.'
  };
}

/**
 * Checks category links via a scraping API.
 */
async function checkCategoryViaApi(url, provider, apiKey) {
  const actualProvider = provider || (process.env.SCRAPER_API_KEY ? 'scraperapi' : process.env.SCRAPINGANT_API_KEY ? 'scrapingant' : process.env.ZENROWS_API_KEY ? 'zenrows' : 'crawlbase');
  const key = apiKey || process.env.SCRAPER_API_KEY || process.env.SCRAPINGANT_API_KEY || process.env.ZENROWS_API_KEY || process.env.CRAWLBASE_TOKEN;

  if (!key) {
    console.log(pc.yellow(`[SCRAPER] API provider "${actualProvider}" requested for category but no API key/token was found.`));
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
