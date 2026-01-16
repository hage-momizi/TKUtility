const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { lofiModeGuilds, lofiTrackEndListeners } = require('./play-lofi');

const command = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('音楽再生を停止し、ボイスチャンネルから切断します。');

async function execute(interaction, client) {
    // デフォルトメッセージを表示するため、まずreplyを呼ぶ
    await interaction.reply({ content: '⏹️ 停止処理中...' });

    const vc = interaction.member.voice.channel;

    if (!vc) {
        return interaction.editReply({ content: 'まずボイスチャンネルに参加してください。' });
    }

    // player確認
    let player = client.lavalink.getPlayer(interaction.guildId);
    if (!player) {
        return interaction.editReply({ content: '現在再生中の音楽がありません。' });
    }

    // Lofiモードを無効化
    lofiModeGuilds.delete(interaction.guildId);

    // Lofiのイベントリスナーをクリーンアップ
    lofiTrackEndListeners.delete(interaction.guildId);

    // Lofi自動再生インターバルをクリア
    try {
      const playLofiModule = require('./play-lofi');
      if (playLofiModule.lofiAutoPlayIntervals && playLofiModule.lofiAutoPlayIntervals.has(interaction.guildId)) {
        const interval = playLofiModule.lofiAutoPlayIntervals.get(interaction.guildId);
        clearInterval(interval.intervalId);
        playLofiModule.lofiAutoPlayIntervals.delete(interaction.guildId);
        console.log('[Stop] Cleared Lofi AutoPlay interval for guild:', interaction.guildId);
      }
      if (playLofiModule.lofiInteractionData) {
        delete playLofiModule.lofiInteractionData[interaction.guildId];
      }
    } catch (err) {
      // 無視
    }

    // 停止と切断
    await player.destroy();

    const embed = new EmbedBuilder()
        .setTitle('⏹️ 音楽停止')
        .setDescription('音楽再生を停止し、ボイスチャンネルから切断しました。')
        .setColor(0x5865f2)
        .setFooter({ text: `${interaction.user.displayName} が停止`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

    return interaction.editReply({ content: '', embeds: [embed] });
}

module.exports = { command, execute };
