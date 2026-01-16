const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const command = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('現在の曲をスキップして次の曲を再生します。');

async function execute(interaction, client) {
    // まず deferReply を実行して時間を稼ぐ（3秒制限を回避）
    await interaction.deferReply();

    const vc = interaction.member.voice.channel;

    if (!vc) {
        return interaction.editReply({ content: 'まずボイスチャンネルに参加してください。' });
    }

    // player確認
    let player = client.lavalink.getPlayer(interaction.guildId);
    if (!player) {
        return interaction.editReply({ content: '現在再生中の音楽がありません。' });
    }

    if (!player.playing && !player.paused) {
        return interaction.editReply({ content: '現在再生中の音楽がありません。' });
    }

    // キューに次の曲があるか確認
    if (player.queue.tracks.length <= 0) {
        return interaction.editReply({ content: '⏭️ キューに次の曲がありません。スキップできません。' });
    }

    // スキップ実行
    const skippedTrack = player.queue.current;
    await player.skip();

    const nextTrack = player.queue.current;
    const embed = new EmbedBuilder()
        .setTitle('⏭️ スキップ成功')
        .setDescription(`スキップしました。\n次の曲: **${nextTrack.info.title}**`)
        .setColor(0x5865f2)
        .setFooter({ text: `${interaction.user.displayName} がスキップ`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

    return interaction.editReply({ content: '', embeds: [embed] });
}

module.exports = { command, execute };
