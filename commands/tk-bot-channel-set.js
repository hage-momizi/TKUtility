const { SlashCommandBuilder } = require('discord.js');
const { FILES } = require('../config/constants');
const { loadJSON, saveJSON } = require('../modules/fileStorage');
const { startBot, getBotStatus } = require('../modules/marketBotService');

const command = new SlashCommandBuilder()
  .setName('tk-bot-channel-set')
  .setDescription('MarketBotの発言チャンネルを設定します（管理者専用）')
  .addStringOption(option =>
    option
      .setName('channel_id')
      .setDescription('チャンネルID')
      .setRequired(true)
  );

async function execute(interaction, client) {
  // 管理者権限チェック
  if (!interaction.member.permissions.has('Administrator')) {
    await interaction.reply({ content: '❌ このコマンドは管理者のみ使用できます。', ephemeral: true });
    return;
  }

  const channelId = interaction.options.getString('channel_id');
  const guildId = interaction.guild.id;

  // チャンネルが存在するか確認
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: '❌ 指定されたチャンネルIDが見つかりません。', ephemeral: true });
      return;
    }
  } catch (error) {
    await interaction.reply({ content: '❌ 指定されたチャンネルIDが見つかりません。', ephemeral: true });
    return;
  }

  // 設定保存
  const config = loadJSON(FILES.BOT_CHANNEL_CONFIG);
  if (!config[guildId]) {
    config[guildId] = {};
  }
  config[guildId].botSpeakChannelId = channelId;
  saveJSON(FILES.BOT_CHANNEL_CONFIG, config);

  await interaction.reply({ content: `✅ MarketBot の発言チャンネルを <#${channelId}> に設定しました。`, ephemeral: true });
}

module.exports = { command, execute };
