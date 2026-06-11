import dotenv from 'dotenv';
import pc from 'picocolors';
import { sendRestockNotification } from './notifier.js';

// Load environment variables
dotenv.config();

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

async function run() {
  console.log(pc.cyan('🔔 Discord Webhook Test Tool'));
  console.log(pc.gray(`Webhook URL: ${webhookUrl ? webhookUrl.substring(0, 45) + '...' : 'Not configured'}`));

  if (!webhookUrl || webhookUrl.includes('your-webhook-id')) {
    console.log(pc.red('\n❌ ERROR: Discord Webhook URL is not set in your .env file.'));
    console.log(pc.yellow('Please edit the ".env" file in the root of the project and set:'));
    console.log(pc.white('DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-actual-id/your-actual-token'));
    process.exit(1);
  }

  console.log(pc.yellow('\n⏳ Sending test restock alert to Discord...'));

  const testProduct = {
    name: 'TEST PRODUCT: Scarlet & Violet 151 Ultra-Premium Collection',
    url: 'https://www.pokemoncenter.com/product/290-85341/pokemon-tcg-scarlet-and-violet-151-ultra-premium-collection',
    price: '$119.99',
    imageUrl: 'https://www.pokemoncenter.com/images/products/290-85341/large/290-85341.jpg'
  };

  const success = await sendRestockNotification(webhookUrl, testProduct);

  if (success) {
    console.log(pc.green('\n🎉 SUCCESS! Please check your Discord channel for the notification.'));
  } else {
    console.log(pc.red('\n❌ FAILED! Double check your Webhook URL or network connection.'));
  }
}

run();
