import pc from 'picocolors';

/**
 * Sends a notification to Discord via a webhook URL
 * @param {string} webhookUrl - The Discord Webhook URL
 * @param {object} productInfo - Info about the product
 * @param {string} productInfo.name - Product Name
 * @param {string} productInfo.url - Product URL
 * @param {string} productInfo.price - Product Price
 * @param {string} productInfo.imageUrl - Product Image URL
 * @returns {Promise<boolean>} - Whether the notification succeeded
 */
export async function sendRestockNotification(webhookUrl, { name, url, price, imageUrl, isNewDrop = false }) {
  if (!webhookUrl || webhookUrl.includes('your-webhook-id')) {
    console.log(pc.red('[NOTIFIER] Error: Discord Webhook URL is not configured in .env. Skipping notification.'));
    return false;
  }

  // Create a beautiful Discord Embed
  // Hex color #FFD700 (Pokémon gold/yellow) is 16766720 in decimal
  // Hex color #10B981 (Vibrant Green for new drops) is 1096065 in decimal
  const embed = {
    title: isNewDrop ? '🆕 Pokémon Center New Drop Alert!' : '🚨 Pokémon Center Restock Alert!',
    description: isNewDrop 
      ? `### [**${name}**](${url})\nis a **NEW PRODUCT** released at Pokémon Center! 🆕✨`
      : `### [**${name}**](${url})\nis now **IN STOCK** at Pokémon Center! 🟢`,
    color: isNewDrop ? 1096065 : 16766720,
    fields: [
      {
        name: '💵 Price',
        value: price || 'N/A',
        inline: true
      },
      {
        name: '🔗 Link',
        value: `[Buy Now](${url})`,
        inline: true
      }
    ],
    footer: {
      text: isNewDrop ? 'Pokémon Center Drop Monitor' : 'Pokémon Center Restock Bot'
    },
    timestamp: new Date().toISOString()
  };

  // Add image if available
  if (imageUrl) {
    embed.image = { url: imageUrl };
  }

  const payload = {
    embeds: [embed]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(pc.green(`[NOTIFIER] Restock notification sent successfully for: ${name}`));
      return true;
    } else {
      const errorText = await response.text();
      console.error(pc.red(`[NOTIFIER] Failed to send Discord notification. Status: ${response.status}. Response: ${errorText}`));
      return false;
    }
  } catch (err) {
    console.error(pc.red(`[NOTIFIER] Network error sending Discord notification: ${err.message}`));
    return false;
  }
}
