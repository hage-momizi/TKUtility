const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { saveGuildConfig, getGuildConfig } = require('../modules/earthquakeService');

const command = new SlashCommandBuilder()
  .setName('earthquake-set-eew')
  .setDescription('緊急地震速報を送信するチャンネルを設定します（管理者専用）')
  .addChannelOption(option =>
    option.setName('channel')
      .setDescription('EEW通知を送信するチャンネル')
      .setRequired(true)
      .addChannelTypes(0) // GUILD_TEXT
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

  try {
    // 設定保存
    saveGuildConfig(interaction.guild.id, {
      eewChannelId: channel.id,
      watchEnabled: true // デフォルトで有効
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ 設定完了')
      .setDescription(`緊急地震速報の通知チャンネルを <#${channel.id}> に設定しました。`)
      .addFields(
        { name: 'チャンネル', value: `<#${channel.id}>`, inline: true },
        { name: '監視状態', value: '有効', inline: true }
      )
      .setColor(0x00ff00);

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in earthquake-set-eew command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ エラー')
      .setDescription('設定の保存に失敗しました。')
      .setColor(0xff0000);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { command, execute };
