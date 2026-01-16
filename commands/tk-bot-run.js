const { SlashCommandBuilder } = require('discord.js');
const { startBot, getBotStatus } = require('../modules/marketBotService');

const command = new SlashCommandBuilder()
  .setName('tk-bot-run')
  .setDescription('MarketBotを手動で起動します（次のユーザー購入まで）（管理者専用）');

async function execute(interaction, client) {
  // 管理者権限チェック
  if (!interaction.member.permissions.has('Administrator')) {
    await interaction.reply({ content: '❌ このコマンドは管理者のみ使用できます。', ephemeral: true });
    return;
  }

  const guildId = interaction.guild.id;
  const status = getBotStatus(guildId);

  if (status.isRunning) {
    await interaction.reply({ content: '🤖 MarketBot は既に起動中です。', ephemeral: true });
    return;
  }

  // BOT起動
  startBot(guildId, client);

  await interaction.reply({ content: '✅ MarketBot を起動しました。次のユーザー購入まで活動します。', ephemeral: true });
}

module.exports = { command, execute };
