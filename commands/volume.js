const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const command = new SlashCommandBuilder()
    .setName('volume')
    .setDescription('ボットの音量を変更します。')
    .addIntegerOption(option =>
        option.setName('amount')
            .setDescription('音量（0-100）')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(100)
    );

async function execute(interaction, client, loadMusicSettings, saveMusicSettings) {
    const volume = interaction.options.getInteger('amount');
    const guildId = interaction.guildId;

    // player確認
    let player = client.lavalink.getPlayer(guildId);
    if (!player) {
        return interaction.reply({ content: '現在再生中の音楽がありません。', ephemeral: true });
    }

    // プレイヤーの音量を変更
    if (player.setVolume) {
        try {
            await player.setVolume(volume);
            console.log(`[Volume] Changed to ${volume}% for guild ${guildId}`);

            // musicsettings.jsonに保存
            const musicSettings = loadMusicSettings();
            musicSettings[guildId] = volume;
            saveMusicSettings(musicSettings);
            console.log(`[Volume] Saved ${volume}% for guild ${guildId}`);

            const embed = new EmbedBuilder()
                .setTitle('🔊 音量変更')
                .setDescription(`音量を **${volume}%** に変更しました。`)
                .setColor(0x5865f2)
                .setFooter({ text: `${interaction.user.displayName} が変更`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('[Volume] Error:', error);
            return interaction.reply({ content: '❌ 音量の変更に失敗しました。', ephemeral: true });
        }
    } else {
        return interaction.reply({ content: '❌ プレイヤーが利用できません。', ephemeral: true });
    }
}

module.exports = { command, execute };

module.exports = { command, execute };
