const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { saveGuildConfig, getGuildConfig } = require('../modules/earthquakeService');

const command = new SlashCommandBuilder()
  .setName('earthquake-vc')
  .setDescription('地震情報の音声読み上げを有効/無効にします（管理者専用）')
  .addChannelOption(option =>
    option.setName('channel')
      .setDescription('読み上げを行うボイスチャンネル')
      .setRequired(true)
      .addChannelTypes(2) // GUILD_VOICE
  )
  .addBooleanOption(option =>
    option.setName('enabled')
      .setDescription('読み上げを有効にするかどうか')
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

  const channel = interaction.options.getChannel('channel');
  const enabled = interaction.options.getBoolean('enabled');
  const guildId = interaction.guild.id;

  try {
    const currentConfig = getGuildConfig(guildId);

    // 設定保存
    saveGuildConfig(guildId, {
      vcChannelId: channel.id,
      vcEnabled: enabled
    });

    const embed = new EmbedBuilder()
      .setTitle(enabled ? '✅ 音声読み上げ有効' : '⏸️ 音声読み上げ停止')
      .setDescription(`地震情報の音声読み上げを${enabled ? '有効' : '無効'}にしました。`)
      .addFields(
        { name: 'ボイスチャンネル', value: `<#${channel.id}>`, inline: true },
        { name: '読み上げ状態', value: enabled ? '有効' : '無効', inline: true }
      )
      .setColor(enabled ? 0x00ff00 : 0xffa500);

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in earthquake-vc command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ エラー')
      .setDescription('設定の保存に失敗しました。')
      .setColor(0xff0000);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { command, execute };
