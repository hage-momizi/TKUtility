const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { saveGuildConfig, getGuildConfig } = require('../modules/earthquakeService');

const command = new SlashCommandBuilder()
  .setName('earthquake-watch')
  .setDescription('緊急地震速報のリアルタイム監視を有効/無効にします（管理者専用）')
  .addBooleanOption(option =>
    option.setName('enabled')
      .setDescription('監視を有効にするかどうか')
      .setRequired(true)
  );

async function execute(interaction) {
  // 管理者権限チェック
  if (!interaction.member.permissions.has('Administrator')) {
    await interaction.reply({
      content: 'このコマンドは管理者専用です。',
      ephemeral: true
    });
    return;
  }

  const enabled = interaction.options.getBoolean('enabled');
  const guildId = interaction.guild.id;

  try {
    const currentConfig = getGuildConfig(guildId);

    if (!currentConfig.eewChannelId) {
      const embed = new EmbedBuilder()
        .setTitle('⚠️ 設定が必要')
        .setDescription('まず `/earthquake-set-eew` で通知チャンネルを設定してください。')
        .setColor(0xffa500);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // 設定保存
    saveGuildConfig(guildId, {
      watchEnabled: enabled
    });

    const embed = new EmbedBuilder()
      .setTitle(enabled ? '✅ 監視有効' : '⏸️ 監視停止')
      .setDescription(`緊急地震速報のリアルタイム監視を${enabled ? '有効' : '無効'}にしました。`)
      .addFields(
        { name: '通知チャンネル', value: `<#${currentConfig.eewChannelId}>`, inline: true },
        { name: '監視状態', value: enabled ? '有効' : '無効', inline: true }
      )
      .setColor(enabled ? 0x00ff00 : 0xffa500);

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in earthquake-watch command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ エラー')
      .setDescription('設定の保存に失敗しました。')
      .setColor(0xff0000);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { command, execute };
