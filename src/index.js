import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pc from 'picocolors';
import { checkProduct, checkCategory } from './scraper.js';
import { sendRestockNotification } from './notifier.js';

// Load environment variables
dotenv.config();

const productsPath = path.resolve('products.json');
const statusPath = path.resolve('status.json');

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
const checkIntervalMinutes = parseFloat(process.env.CHECK_INTERVAL_MINUTES || '10');
const scraperMode = process.env.SCRAPER_MODE || 'live';
const runOnce = process.argv.includes('--once') || process.env.RUN_ONCE === 'true';

// Read JSON files safely
function readJson(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error(pc.red(`Error reading ${path.basename(filePath)}: ${err.message}`));
  }
  return defaultValue;
}

// Write JSON files safely
function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(pc.red(`Error writing ${path.basename(filePath)}: ${err.message}`));
    return false;
  }
}

// Helper to delay execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runCheckLoop() {
  console.log(pc.cyan('\n🚀 Starting Pokémon Center Restock Monitor...'));
  console.log(pc.gray(`Mode: ${scraperMode.toUpperCase()}`));
  if (runOnce) {
    console.log(pc.gray('Run Mode: SINGLE RUN (--once)'));
  } else {
    console.log(pc.gray(`Run Mode: CONTINUOUS LOOP (Interval: ${checkIntervalMinutes} minutes)`));
  }
  console.log(pc.gray(`Webhook URL: ${webhookUrl ? webhookUrl.substring(0, 45) + '...' : 'Not configured'}`));

  if (!webhookUrl || webhookUrl.includes('your-webhook-id')) {
    console.log(pc.yellow('⚠️ WARNING: Discord Webhook URL is not set in .env. No Discord notifications will be sent.'));
  }

  do {
    const products = readJson(productsPath, []);
    const statuses = readJson(statusPath, {});

    if (products.length === 0) {
      console.log(pc.yellow(`[MONITOR] ${new Date().toLocaleTimeString()} - No products in products.json. Add products using the CLI.`));
    } else {
      console.log(pc.blue(`\n[MONITOR] ${new Date().toLocaleTimeString()} - Starting check cycle for ${products.length} product(s)...`));

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        
        // Random jitter delay between products (5 to 15 seconds) to avoid rate limits
        if (i > 0) {
          const jitter = Math.floor(Math.random() * 10000) + 5000;
          console.log(pc.gray(`[MONITOR] Waiting ${Math.round(jitter/1000)}s before checking next product...`));
          await sleep(jitter);
        }

        const isCategory = product.url.includes('/category/') || product.url.includes('/search') || (!product.url.includes('/product/'));

        if (isCategory) {
          console.log(pc.cyan(`[MONITOR] Product is a category/search list. Scanning products...`));
          const result = await checkCategory(product.url, scraperMode);

          if (result.success) {
            const isFirstCategoryRun = statuses[product.url] === undefined;
            console.log(pc.gray(`[MONITOR] Category scan completed. Found ${result.urls.length} product(s).`));

            if (isFirstCategoryRun) {
              console.log(pc.blue(`[MONITOR] Initializing category cache silently for "${product.name}" (${result.urls.length} items)...`));
              for (const itemUrl of result.urls) {
                if (statuses[itemUrl] === undefined) {
                  statuses[itemUrl] = 'known';
                }
              }
              statuses[product.url] = 'scanned';
            } else {
              // Not the first run, let's check for new drops
              let newDropsCount = 0;
              for (const itemUrl of result.urls) {
                if (statuses[itemUrl] === undefined) {
                  newDropsCount++;
                  console.log(pc.green(`[MONITOR] 🎉 New drop detected: ${itemUrl}`));

                  // Scrape product details (name, price, image)
                  const productDetail = await checkProduct(itemUrl, scraperMode);
                  
                  if (productDetail.success) {
                    await sendRestockNotification(webhookUrl, {
                      name: productDetail.name,
                      url: itemUrl,
                      price: productDetail.price,
                      imageUrl: productDetail.imageUrl,
                      isNewDrop: true
                    });
                    statuses[itemUrl] = productDetail.inStock ? 'inStock' : 'outOfStock';
                  } else {
                    // Alert with fallback details if scraping fails
                    console.log(pc.yellow(`[MONITOR] Failed to scrape new product details: ${productDetail.error || 'unknown error'}. Sending basic alert.`));
                    const fallbackName = itemUrl.split('/').pop()?.replace(/-/g, ' ') || 'New Drop';
                    await sendRestockNotification(webhookUrl, {
                      name: fallbackName.replace(/\b\w/g, c => c.toUpperCase()),
                      url: itemUrl,
                      price: 'N/A',
                      imageUrl: '',
                      isNewDrop: true
                    });
                    statuses[itemUrl] = 'known';
                  }
                  
                  // Wait between individual product scrapes to avoid rate limit
                  await sleep(5000);
                }
              }
              if (newDropsCount === 0) {
                console.log(pc.gray(`[MONITOR] No new product drops found in this category.`));
              }
              statuses[product.url] = 'scanned';
            }
          } else {
            console.log(pc.red(`[MONITOR] ⚠️ Failed to check category "${product.name}": ${result.error}`));
          }
        } else {
          // --- SINGLE PRODUCT RESTOCK MONITOR ---
          const result = await checkProduct(product.url, scraperMode);

          if (result.success) {
            const lastStatus = statuses[product.url];
            const currentStatus = result.inStock ? 'inStock' : 'outOfStock';

            console.log(
              `[MONITOR] Product: "${result.name}" - ` +
              (result.inStock ? pc.green('IN STOCK') : pc.red('OUT OF STOCK')) +
              ` (Price: ${result.price})`
            );

            if (lastStatus === undefined || lastStatus === 'scanned' || lastStatus === 'known') {
              // First time seeing this product or resetting. Save state silently to prevent startup spam.
              console.log(pc.gray(`[MONITOR] Initializing status cache for "${result.name}" as "${currentStatus}".`));
              statuses[product.url] = currentStatus;
            } 
            
            else if (lastStatus === 'outOfStock' && currentStatus === 'inStock') {
              // RESTOCKED ALERT!
              console.log(pc.green(`[MONITOR] 🎉 Restock detected for "${result.name}"!`));
              
              // Send Discord notification
              await sendRestockNotification(webhookUrl, {
                name: result.name,
                url: product.url,
                price: result.price,
                imageUrl: result.imageUrl,
                isNewDrop: false
              });

              statuses[product.url] = currentStatus;
            } 
            
            else if (lastStatus === 'inStock' && currentStatus === 'outOfStock') {
              // Went out of stock
              console.log(pc.yellow(`[MONITOR] Product "${result.name}" is now out of stock.`));
              statuses[product.url] = currentStatus;
            }
          } 
          
          else {
            // If the scrape failed (e.g., Cloudflare block), print warning but don't overwrite the stock status
            // to avoid sending a fake alert when it recovers.
            console.log(pc.red(`[MONITOR] ⚠️ Failed to check "${product.name}": ${result.error}`));
          }
        }
      }

      // Save updated statuses after the loop completes
      writeJson(statusPath, statuses);
      console.log(pc.blue(`[MONITOR] Check cycle finished. Saving status cache.`));
    }

    if (runOnce) {
      console.log(pc.green('\n✅ Single run complete. Exiting.'));
      break;
    }

    // Sleep for check interval + random jitter (+/- 30 seconds)
    const intervalMs = checkIntervalMinutes * 60 * 1000;
    const intervalJitter = (Math.random() * 60000) - 30000; // random value between -30s and +30s
    const sleepMs = Math.max(30000, intervalMs + intervalJitter); // Ensure at least 30s delay

    console.log(pc.gray(`[MONITOR] Sleeping for ${Math.round(sleepMs / 1000 / 60 * 10) / 10} minutes...\n`));
    await sleep(sleepMs);
  } while (true);
}

// Handle termination signals to exit cleanly
process.on('SIGINT', () => {
  console.log(pc.yellow('\nStopping Restock Monitor... Bye!'));
  process.exit(0);
});

runCheckLoop();
