const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const command = new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('現在の再生プレイリストを表示します。');

async function execute(interaction, client) {
    const vc = interaction.member.voice.channel;

    if (!vc) {
        return interaction.reply({ content: 'まずボイスチャンネルに参加してください。', flags: 64 });
    }

    // player確認
    let player = client.lavalink.getPlayer(interaction.guildId);
    if (!player) {
        return interaction.reply({ content: '現在再生中の音楽がありません。', flags: 64 });
    }

    if (!player.playing && !player.paused) {
        return interaction.reply({ content: '現在再生中の音楽がありません。', flags: 64 });
    }

    const currentTrack = player.queue.current;
    const queueTracks = player.queue.tracks.slice(0, 10); // 最大10曲表示

    const embed = new EmbedBuilder()
        .setTitle('🎵 現在の再生プレイリスト')
        .setColor(0x5865f2)
        .setTimestamp();

    if (currentTrack) {
        embed.addFields({
            name: '▶️ 現在再生中',
            value: `**${currentTrack.info.title}** - ${currentTrack.info.author}`,
            inline: false
        });
    }

    if (queueTracks.length > 0) {
        const queueList = queueTracks.map((track, index) => `${index + 1}. **${track.info.title}** - ${track.info.author}`).join('\n');
        embed.addFields({
            name: `📋 次に再生 (${player.queue.size}曲)`,
            value: queueList,
            inline: false
        });
    } else {
        embed.addFields({
            name: '📋 次に再生',
            value: 'プレイリストに曲がありません。',
            inline: false
        });
    }

    return interaction.reply({ embeds: [embed] });
}

module.exports = { command, execute };
