const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');

// 緯度経度からタイル座標を計算
function latLngToTile(lat, lng, zoom) {
  const x = Math.floor((lng + 180) / 360 * (1 << zoom));
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * (1 << zoom));
  return { x, y };
}

// 地図画像生成
async function generateMapImage(lat, lng) {
  const zoom = 10;
  const { x: tileX, y: tileY } = latLngToTile(lat, lng, zoom);
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');

  try {
    // タイル画像をダウンロードして描画
    const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;
    const tileImage = await loadImage(tileUrl);
    ctx.drawImage(tileImage, 0, 0, 256, 256);

    // マーカーを描画 (赤い円)
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(128, 128, 5, 0, 2 * Math.PI);
    ctx.fill();

    // PNG bufferに変換
    return canvas.toBuffer();
  } catch (error) {
    console.error('地図画像生成エラー:', error);
    return null;
  }
}

const command = new SlashCommandBuilder()
  .setName('iplookup')
  .setDescription('IPに対して登録情報などを表示します')
  .addStringOption(option =>
    option.setName('ip')
      .setDescription('IPアドレス')
      .setRequired(true));

async function execute(interaction, client) {
  const ip = interaction.options.getString('ip');

  // IPアドレスバリデーション
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipRegex.test(ip)) {
    const embed = new EmbedBuilder()
      .setTitle('IP lookup result!!')
      .addFields({
        name: '<:ip:1459561891167731898> IP:',
        value: `\`\`\`\n無効なIPアドレス形式です。\n\`\`\``,
        inline: false
      });
    await interaction.reply({ embeds: [embed] });
    return;
  }

  await interaction.deferReply();

  try {
    // IP情報取得
    const ipInfoToken = process.env.IPINFO_TOKEN || '';
    const ipInfoUrl = `https://ipinfo.io/${ip}/json${ipInfoToken ? `?token=${ipInfoToken}` : ''}`;
    const ipInfoResponse = await axios.get(ipInfoUrl);
    const ipInfoData = ipInfoResponse.data;

    if (ipInfoData.error) {
      const embed = new EmbedBuilder()
        .setTitle('IP lookup result!!')
        .addFields({
          name: '<:ip:1459561891167731898> IP:',
          value: `\`\`\`\nエラー: ${ipInfoData.error}\n\`\`\``,
          inline: false
        });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // AbuseIPDB情報取得
    const abuseApiKey = process.env.ABUSEIPDB_API_KEY;
    const abuseUrl = `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&key=${abuseApiKey}`;
    const abuseResponse = await axios.get(abuseUrl, {
      headers: {
        'Accept': 'application/json',
        'Key': abuseApiKey
      }
    });
    const abuseData = abuseResponse.data;

    // 地図画像生成
    let mapImageUrl = null;
    if (ipInfoData.loc) {
      const [lat, lng] = ipInfoData.loc.split(',').map(parseFloat);
      if (!isNaN(lat) && !isNaN(lng)) {
        mapImageUrl = await generateMapImage(lat, lng);
      }
    }

    // IP情報テキスト構築
    const ipInfoText = `IP: ${ipInfoData.ip || ip}
  Postal: ${ipInfoData.postal || 'N/A'}
  Country: ${ipInfoData.country || 'N/A'}
  Region: ${ipInfoData.region || 'N/A'}
  City: ${ipInfoData.city || 'N/A'}

ISP: ${ipInfoData.org || 'N/A'}
Anycast: ${ipInfoData.anycast ? 'True' : 'False'}`;

    // AbuseIPDB情報テキスト構築
    const abuseInfo = abuseData.data;
    const abuseInfoText = `IPVersion: v${abuseInfo.ipVersion || 'N/A'}
AbuseConfidenceScore: ${abuseInfo.abuseConfidenceScore || 0}
hostnames: ${abuseInfo.hostnames && abuseInfo.hostnames.length > 0 ? abuseInfo.hostnames.join(', ') : 'N/A'}
Tor: ${abuseInfo.isTor ? 'True' : 'False'}
TotalReports: ${abuseInfo.totalReports || 0}
UsageType: ${abuseInfo.usageType || 'N/A'}
domain: ${abuseInfo.domain || 'N/A'}`;

    // 全体出力
    const embed = new EmbedBuilder()
      .setTitle('IP lookup result!!')
      .addFields(
        {
          name: '<:ip:1459561891167731898> IP:',
          value: `\`\`\`\n${ipInfoText}\n\`\`\``,
          inline: false
        },
        {
          name: '<:abuse:1459558433161478154> AbuseIPDB result!!',
          value: `\`\`\`\n${abuseInfoText}\n\`\`\``,
          inline: false
        }
      );

    const files = [];
    if (mapImageUrl) {
      const attachment = new AttachmentBuilder(mapImageUrl, { name: 'map.png' });
      embed.setImage('attachment://map.png');
      files.push(attachment);
    }

    await interaction.editReply({ embeds: [embed], files });
  } catch (error) {
    console.error('APIリクエストエラー:', error);
    const embed = new EmbedBuilder()
      .setTitle('IP lookup result!!')
      .addFields({
        name: '<:ip:1459561891167731898> IP:',
        value: `\`\`\`\nAPIリクエストに失敗しました: ${error.message}\n\`\`\``,
        inline: false
      });
    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { command, execute };
