const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannelForGuild, leaveVoiceChannel, voiceConnections } = require('../modules/earthquakeService');

const command = new SlashCommandBuilder()
  .setName('earthquake-vc-start')
  .setDescription('地震情報の音声読み上げを開始します（実行者がいるボイスチャンネルに自動参加）');

async function execute(interaction) {
  const guildId = interaction.guild.id;
  const member = interaction.member;

  // ユーザーがボイスチャンネルにいるかチェック
  if (!member.voice.channel) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ ボイスチャンネルに参加してください')
      .setDescription('まずボイスチャンネルに参加してからコマンドを実行してください。')
      .setColor(0xffa500);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const voiceChannel = member.voice.channel;

  try {
    // すでに接続中の場合は何もしない
    if (voiceConnections.has(guildId)) {
      const embed = new EmbedBuilder()
        .setTitle('⚠️ すでに読み上げ中')
        .setDescription('地震情報の音声読み上げはすでに開始されています。')
        .setColor(0xffa500);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ボイスチャンネルに参加
    joinVoiceChannelForGuild(interaction.client, guildId, voiceChannel.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ 音声読み上げ開始')
      .setDescription(`<#${voiceChannel.id}> で地震情報の音声読み上げを開始しました。`)
      .addFields(
        { name: 'ボイスチャンネル', value: `<#${voiceChannel.id}>`, inline: true },
        { name: '状態', value: '読み上げ中', inline: true }
      )
      .setColor(0x00ff00);

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in earthquake-vc-start command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ エラー')
      .setDescription('音声読み上げの開始に失敗しました。')
      .setColor(0xff0000);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { command, execute };
