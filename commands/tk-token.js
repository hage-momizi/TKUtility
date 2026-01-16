const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getOrCreateApiKeys } = require('../modules/tokenService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-token')
    .setDescription('TKUC Web連携用のAPI Keyを発行します'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const { accessKey, secretKey, createdAt } = getOrCreateApiKeys(guildId, userId);
    const issuedAt = new Date(createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    // API Keysファイル作成
    const keyContent = `-----BEGIN TKUC API KEYS-----
Access Key: ${accessKey}
Secret Key: ${secretKey}
-----END TKUC API KEYS-----
# TKUC Web Trading API Keys
# User ID: ${userId}
# Guild ID: ${guildId}
# Issued at: ${issuedAt}
#
# Security Instructions:
# 1. Keep this file secure - never share it with anyone
# 2. Access Key is public, Secret Key is private
# 3. Use these keys to authenticate API requests
# 4. Regenerate keys if compromised
#
# WARNING: If these keys are compromised, regenerate immediately!
`;

    const buffer = Buffer.from(keyContent, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, {
      name: `tkuc-api-keys-${userId}.key`
    });

    await interaction.editReply({
      content: `🔑 **あなたのTKUC Web API Keys**\n\n添付の鍵ファイルをダウンロードして、安全に保管してください。\n\n**重要なセキュリティ警告:**\n• このファイルは第三者に絶対に共有しないでください\n• Secret Keyは漏洩すると資産が危険にさらされます\n• 定期的に新しい鍵を生成することを推奨します\n• 鍵が漏洩した場合はすぐに新しいものを取得してください\n\n発行日時: ${issuedAt}`,
      files: [attachment]
    });
  }
};
