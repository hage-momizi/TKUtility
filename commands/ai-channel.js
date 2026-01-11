const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const { loadJSON, saveJSON } = require('../modules/fileStorage');

const aiChannelFile = path.join(__dirname, '..', 'aichannel.json');

const command = new SlashCommandBuilder()
  .setName('ai-channel')
  .setDescription('AIトークチャンネルを設定します')
  .addStringOption(option =>
    option
      .setName('id')
      .setDescription('チャンネルID')
      .setRequired(true)
  );

async function execute(interaction, client) {
  const channelId = interaction.options.getString('id');
  const guildId = interaction.guild.id;

  // チャンネルが存在するか確認
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: '無効なチャンネルIDです。', ephemeral: true });
      return;
    }
  } catch (error) {
    await interaction.reply({ content: 'チャンネルが見つかりません。', ephemeral: true });
    return;
  }

  // 設定保存
  const config = loadJSON(aiChannelFile);
  if (!config[guildId]) {
    config[guildId] = {};
  }
  config[guildId].channelId = channelId;
  config[guildId].enabled = true; // デフォルトで有効
  saveJSON(aiChannelFile, config);

  await interaction.reply({ content: `AIトークチャンネルを <#${channelId}> に設定しました。`, ephemeral: true });
}

module.exports = { command, execute };
