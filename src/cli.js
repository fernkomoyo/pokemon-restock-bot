import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { checkProduct } from './scraper.js';

const productsPath = path.resolve('products.json');
const statusPath = path.resolve('status.json');

// Helper to read JSON files safely
function readJson(filePath, defaultValue = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error(pc.red(`Error reading ${path.basename(filePath)}: ${err.message}`));
  }
  return defaultValue;
}

// Helper to write JSON files safely
function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(pc.red(`Error writing ${path.basename(filePath)}: ${err.message}`));
    return false;
  }
}

// Parse arguments
const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();

function printUsage() {
  console.log(pc.cyan('\n🛍️ Pokémon Center Restock Bot CLI'));
  console.log(pc.gray('Usage:'));
  console.log(`  ${pc.yellow('npm run cli add <url> [\"custom name\"]')}   - Add a product to tracking`);
  console.log(`  ${pc.yellow('npm run cli list')}                       - List tracked products`);
  console.log(`  ${pc.yellow('npm run cli remove <index_or_url>')}       - Remove a product`);
  console.log(`  ${pc.yellow('npm run cli help')}                       - Show this help screen\n`);
}

async function run() {
  if (!command || command === 'help') {
    printUsage();
    return;
  }

  const products = readJson(productsPath, []);
  const statuses = readJson(statusPath, {});

  if (command === 'list') {
    console.log(pc.cyan('\n📋 Tracked Products:'));
    if (products.length === 0) {
      console.log(pc.gray('  (No products tracked yet. Use "npm run cli add <url>" to add one)'));
      return;
    }

    products.forEach((p, idx) => {
      const lastStatus = statuses[p.url];
      let statusStr = pc.gray('Unknown ⚪');
      
      if (lastStatus === 'inStock') {
        statusStr = pc.green('In Stock 🟢');
      } else if (lastStatus === 'outOfStock') {
        statusStr = pc.red('Out of Stock 🔴');
      } else if (lastStatus === 'error') {
        statusStr = pc.yellow('Error ⚠️');
      }

      console.log(`  ${pc.yellow(idx + 1)}. ${pc.white(p.name)}`);
      console.log(`     URL: ${pc.gray(p.url)}`);
      console.log(`     Last Status: ${statusStr}\n`);
    });
  } 
  
  else if (command === 'add') {
    const url = args[1];
    let name = args[2];

    if (!url) {
      console.log(pc.red('❌ Error: Missing product URL.'));
      console.log('Usage: npm run cli add <url> ["custom name"]');
      return;
    }

    try {
      new URL(url); // basic validation
    } catch (_) {
      console.log(pc.red('❌ Error: Invalid URL format.'));
      return;
    }

    // Check if already tracked
    if (products.some(p => p.url === url)) {
      console.log(pc.yellow('⚠️ This product is already in your tracking list.'));
      return;
    }

    // Fetch name if not provided
    if (!name) {
      console.log(pc.yellow('⏳ Custom name not provided. Attempting to fetch product name from page...'));
      const result = await checkProduct(url, url.includes('sim_stock=') ? 'simulated' : 'live');
      if (result.success) {
        name = result.name;
        console.log(pc.green(`Fetched product name: "${name}"`));
      } else {
        // Fallback to URL parsing
        const nameMatch = url.match(/\/product\/[^/]+\/([^/?]+)/);
        name = nameMatch 
          ? nameMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          : 'Unnamed Product';
        console.log(pc.yellow(`Failed to fetch live name (${result.error || 'unknown error'}). Using URL fallback: "${name}"`));
      }
    }

    products.push({ url, name });
    if (writeJson(productsPath, products)) {
      console.log(pc.green(`\n✅ Added: "${name}"`));
      console.log(pc.gray(`URL: ${url}`));
    }
  } 
  
  else if (command === 'remove') {
    const target = args[1];

    if (!target) {
      console.log(pc.red('❌ Error: Please specify the index or URL of the product to remove.'));
      console.log('Usage: npm run cli remove <index_or_url>');
      return;
    }

    let indexToRemove = -1;
    // Check if index was given
    const idxVal = parseInt(target, 10);
    if (!isNaN(idxVal) && idxVal > 0 && idxVal <= products.length) {
      indexToRemove = idxVal - 1;
    } else {
      // Find matching URL
      indexToRemove = products.findIndex(p => p.url === target || p.url.includes(target));
    }

    if (indexToRemove === -1) {
      console.log(pc.red(`❌ Error: Product not found matching "${target}".`));
      return;
    }

    const removedProduct = products.splice(indexToRemove, 1)[0];
    
    // Clean up status
    delete statuses[removedProduct.url];
    writeJson(statusPath, statuses);

    if (writeJson(productsPath, products)) {
      console.log(pc.green(`\n✅ Removed: "${removedProduct.name}"`));
    }
  } 
  
  else {
    console.log(pc.red(`❌ Unknown command: "${command}"`));
    printUsage();
  }
}

run();
