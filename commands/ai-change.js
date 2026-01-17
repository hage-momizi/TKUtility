const { SlashCommandBuilder } = require('discord.js');
const path = require('path');
const { loadJSON, saveJSON } = require('../modules/fileStorage');

const aiChannelFile = path.join(__dirname, '..', 'aichannel.json');

const command = new SlashCommandBuilder()
  .setName('ai-change')
  .setDescription('AIプロバイダーを変更します')
  .addStringOption(option =>
    option
      .setName('provider')
      .setDescription('使用するAIプロバイダー')
      .setRequired(true)
      .addChoices(
        { name: 'Perplexity', value: 'perplexity' },
        { name: 'OpenRouter', value: 'openrouter' },
        { name: 'Ollama', value: 'ollama' }
      )
  );

async function execute(interaction, client) {
  const provider = interaction.options.getString('provider');
  const guildId = interaction.guild.id;

  // 設定保存
  const config = loadJSON(aiChannelFile);
  if (!config[guildId]) {
    config[guildId] = {};
  }
  config[guildId].provider = provider;
  saveJSON(aiChannelFile, config);

  const providerName = provider === 'perplexity' ? 'Perplexity' : provider === 'openrouter' ? 'OpenRouter' : 'Ollama';
  await interaction.reply({ content: `AIプロバイダーを${providerName}に変更しました。`, ephemeral: true });
}

module.exports = { command, execute };
