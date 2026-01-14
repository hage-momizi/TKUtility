const { SlashCommandBuilder } = require('discord.js');
const crypto = require('crypto');
const { getOrCreateToken } = require('../modules/tokenService');

function generateToken() {
  const random = crypto.randomBytes(24).toString('base64url').toUpperCase();
  return `TKU-${random}`;
}

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-token')
    .setDescription('TKUC Web連携用のプライベートトークンを発行します (自分のみ表示)'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const { token, createdAt } = getOrCreateToken(guildId, userId, generateToken);
    const issuedAt = new Date(createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    await interaction.editReply({
      embeds: [
        {
          title: '🔐 あなたのTKUC Webトークン',
          description: 'このトークンは Web パネルから TKUC 取引を行うために使用します。第三者に共有しないでください。',
          color: 0x3B82F6,
          fields: [
            { name: 'トークン', value: `\`${token}\`` },
            { name: '発行日時', value: issuedAt }
          ],
          footer: {
            text: 'Web パネルにアクセスし、ログイン画面でこのトークンを貼り付けてください。'
          }
        }
      ]
    });
  }
};
