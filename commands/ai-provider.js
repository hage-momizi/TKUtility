あconst { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadJSON, saveJSON } = require('../modules/fileStorage');
const { FILES } = require('../config/constants');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('ai-provider')
    .setDescription('AIプロバイダーを切り替えます（管理者専用）')
    .addStringOption(option =>
      option.setName('provider')
        .setDescription('使用するAIプロバイダー')
        .setRequired(true)
        .addChoices(
          { name: 'OpenRouter', value: 'openrouter' },
          { name: 'Perplexity', value: 'perplexity' }
        ))
    .addStringOption(option =>
      option.setName('model')
        .setDescription('使用するモデル（オプション）')
        .setRequired(false)),

  async execute(interaction, client) {
    try {
      // 管理者権限チェック
      if (!interaction.member.permissions.has('Administrator')) {
        return await interaction.reply({
          content: 'このコマンドは管理者専用です。',
          ephemeral: true
        });
      }

      const provider = interaction.options.getString('provider');
      const model = interaction.options.getString('model');

      // 現在の設定を取得
      const aiConfig = loadJSON(FILES.AI_CONFIG) || {};

      // 新しい設定を保存
      aiConfig.provider = provider;
      if (model) {
        aiConfig.model = model;
      }

      // デフォルトモデル設定
      if (!aiConfig.model) {
        aiConfig.model = provider === 'openrouter' ? 'openai/gpt-oss-120b:free' : 'sonar';
      }

      saveJSON(FILES.AI_CONFIG, aiConfig);

      const embed = new EmbedBuilder()
        .setTitle('✅ AIプロバイダー切り替え完了')
        .setColor(0x00ff00)
        .addFields(
          { name: 'プロバイダー', value: provider === 'openrouter' ? 'OpenRouter' : 'Perplexity', inline: true },
          { name: 'モデル', value: aiConfig.model, inline: true },
          { name: 'ステータス', value: '有効', inline: true }
        )
        .setFooter({ text: '変更は次回のレート更新から適用されます' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      console.log(`🔄 AIプロバイダー変更: ${provider} (${aiConfig.model})`);

    } catch (error) {
      console.error('AI provider command error:', error);
      await interaction.reply({
        content: 'AIプロバイダーの切り替え中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};
