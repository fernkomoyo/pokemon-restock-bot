# 🛍️ Pokémon Center Restock & New Drop Monitor

A lightweight, cost-free Node.js bot designed to monitor **pokemoncenter.com** for both **restocks of specific items** and **new product drops** on category pages, sending real-time alerts to a Discord channel.

It is optimized to run 24/7 on **GitHub Actions** completely for free.

---

## ✨ Features

- **🆕 New Drop Detection**: Monitors category pages (like `/category/new-releases`) and alerts you the moment a new product link is added to the page.
- **🚨 Restock Monitoring**: Tracks individual product pages and alerts you when they transition from *Out of Stock* to *In Stock*.
- **🛡️ Bot-Bypass Ready**: Integrates with free web scraping APIs (like **ScrapingAnt**, ScraperAPI, ZenRows, Crawlbase) to bypass Pokémon Center's strict DataDome/Akamai bot detection.
- **🔄 Ephemeral State Persistence**: Automatically commits and pushes its state cache (`status.json`) back to GitHub Actions to remember stock states between runs for free.
- **⚡ High Performance**: Skips downloading heavy browser binaries on GitHub Actions, running the entire monitor execution in under 10 seconds.
- **📋 Management CLI**: Easily add, list, or remove products to monitor from your local terminal.

---

## 🛠️ Local Setup & Running

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher)
- A Discord server and a channel Webhook URL ([How to get one](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks))

### 2. Installation
Navigate to your project folder and install the dependencies:
```bash
npm install
```

### 3. Environment Configuration
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Open `.env` and configure your settings:
- `DISCORD_WEBHOOK_URL`: Your Discord webhook URL.
- `SCRAPER_PROVIDER`: Set to `playwright` for local residential IP scraping (recommended for local testing).
- `SCRAPER_MODE`: Set to `live` (or `simulated` for mock stock tests).

### 4. CLI Commands (Add/List/Remove)
Manage your tracked products using the local CLI:

- **Add a Category Page (for New Drops)**:
  ```bash
  npm run cli add "https://www.pokemoncenter.com/category/new-releases" "New Releases"
  ```
- **Add a Product Page (for Restocks)**:
  ```bash
  npm run cli add "https://www.pokemoncenter.com/product/290-85341/pokemon-tcg-scarlet-and-violet-151-ultra-premium-collection"
  ```
- **List All Tracked Pages**:
  ```bash
  npm run cli list
  ```
- **Remove a Product/Category**:
  ```bash
  npm run cli remove 1  # Removes by index listed in 'npm run cli list'
  ```

### 5. Running the Bot Locally
To start the monitor in a continuous loop:
```bash
npm start
```
To run a single check cycle and exit immediately (useful for testing):
```bash
node src/index.js --once
```

---

## 🚀 24/7 Deployment on GitHub Actions (Free)

To deploy the bot so it checks for drops and restocks every 15 minutes automatically:

### 1. Push to a Private Repository
Push this folder to a new **private** repository on your GitHub account. Keep it private to protect your API keys and webhook URL.

### 2. Sign Up for a Free Scraping API
Because GitHub Actions uses datacenter IPs that are blocked by Pokémon Center, you need to route requests through a proxy. 
We recommend **ScrapingAnt** (10,000 free requests per month, which easily covers a 15-minute cron checking interval):
1. Sign up at [scrapingant.com](https://scrapingant.com/) to get your API key.

### 3. Add GitHub Secrets
In your GitHub repository, go to **Settings > Secrets and Variables > Actions** and add these **Repository Secrets**:
- `DISCORD_WEBHOOK_URL`: Your Discord webhook.
- `SCRAPER_PROVIDER`: `scrapingant`
- `SCRAPINGANT_API_KEY`: Your API key from ScrapingAnt.

### 4. Allow Auto-Commits
Since the workflow needs to save `status.json` back to your repo to remember stock state, give it write permissions:
1. Go to **Settings > Actions > General**.
2. Scroll to the bottom to **Workflow permissions**.
3. Select **Read and write permissions** and click **Save**.

The bot will now automatically run every 15 minutes, check your pages, send Discord pings for drops/restocks, and push the updated cache back to your repository!
