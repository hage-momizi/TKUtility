const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  startBlackjack,
  playBlackjackAction,
  playSlot,
  playRoulette,
  startKakeGame,
  joinKakeGame,
  checkCasinoDailyBonus
} = require('../modules/casinoService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-kajino')
    .setDescription('カジノゲームをプレイします')
    .addStringOption(option =>
      option.setName('game')
        .setDescription('ゲームを選択')
        .setRequired(true)
        .addChoices(
          { name: 'ブラックジャック', value: 'blackjack' },
          { name: 'スロット', value: 'slot' },
          { name: 'ルーレット', value: 'roulette' },
          { name: '掛け金ゲーム開始', value: 'kake_start' },
          { name: '掛け金ゲーム参加', value: 'kake_join' }
        ))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('ベット額（掛け金ゲームの場合は1人あたりの金額）')
        .setRequired(true)
        .setMinValue(1))
    .addStringOption(option =>
      option.setName('currency')
        .setDescription('使用通貨')
        .setRequired(true)
        .addChoices(
          { name: 'TKUP', value: 'TKUP' },
          { name: 'TKUC', value: 'TKUC' }
        ))
    .addStringOption(option =>
      option.setName('bet_type')
        .setDescription('ルーレットのベットタイプ（ルーレットの場合のみ）')
        .setRequired(false)
        .addChoices(
          { name: '数字 (0-36)', value: 'number' },
          { name: '色 (赤/黒)', value: 'color' },
          { name: '偶奇', value: 'parity' },
          { name: '範囲 (1-18/19-36)', value: 'range' }
        ))
    .addStringOption(option =>
      option.setName('bet_value')
        .setDescription('ルーレットのベット値（例: 5, red, even, low）')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('players')
        .setDescription('掛け金ゲームの参加人数（2-10人）')
        .setRequired(false)
        .setMinValue(2)
        .setMaxValue(10))
    .addStringOption(option =>
      option.setName('game_id')
        .setDescription('参加する掛け金ゲームのID')
        .setRequired(false)),

  async execute(interaction, client) {
    try {
      const game = interaction.options.getString('game');
      const amount = interaction.options.getInteger('amount');
      const currency = interaction.options.getString('currency');

      // カジノデイリーボーナスチェック
      const bonusResult = checkCasinoDailyBonus(interaction.user.id);

      // 手数料表示
      const fee = Math.ceil(amount * 0.2);
      const embed = new EmbedBuilder()
        .setTitle('🎰 カジノゲーム')
        .setColor(0xFFD700)
        .setFooter({
          text: `手数料: ${fee} ${currency} (20%) | ハウスエッジ: 約10%`
        });

      // デイリーボーナス獲得時の通知
      if (bonusResult.claimed) {
        embed.addFields({
          name: '🎁 デイリーボーナス獲得！',
          value: `**+${bonusResult.amount} TKUP** をプレゼント！\n今日初めてのカジノプレイです！`,
          inline: false
        });
        embed.setColor(0xFFD700); // 金色でハイライト
      }

      let result;

      switch (game) {
        case 'blackjack':
          result = startBlackjack(interaction.user.id, amount, currency);
          embed.setDescription('🃏 ブラックジャック');

          // インタラクティブな場合はボタンを追加（自分のみ有効）
          if (result.interactive) {
            const row = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setLabel('ヒット（追加カード）')
                  .setStyle(ButtonStyle.Primary)
                  .setCustomId(`bj_hit_${result.sessionId}_${interaction.user.id}`)
                  .setDisabled(false), // 自分のボタンは有効
                new ButtonBuilder()
                  .setLabel('スタンド（止める）')
                  .setStyle(ButtonStyle.Secondary)
                  .setCustomId(`bj_stand_${result.sessionId}_${interaction.user.id}`)
                  .setDisabled(false) // 自分のボタンは有効
              );

            return await interaction.reply({
              embeds: [embed.addFields({ name: '結果', value: result.message, inline: false })],
              components: [row]
            });
          }
          break;

        case 'slot':
          result = playSlot(interaction.user.id, amount, currency);
          embed.setDescription('🎰 スロットマシン');
          break;

        case 'roulette':
          const betType = interaction.options.getString('bet_type');
          const betValue = interaction.options.getString('bet_value');

          if (!betType || !betValue) {
            return await interaction.reply({
              content: 'ルーレットの場合はベットタイプとベット値を指定してください。',
              ephemeral: true
            });
          }

          result = playRoulette(interaction.user.id, amount, currency, betType, betValue);
          embed.setDescription('🎡 ルーレット');
          break;

        case 'kake_start':
          const players = interaction.options.getInteger('players') || 2;
          result = startKakeGame(interaction.user.id, amount, currency, players);

          if (result.success) {
            embed.setDescription('🎲 掛け金ゲーム開始');
            embed.addFields(
              { name: 'ゲームID', value: result.gameId, inline: true },
              { name: '参加人数', value: `${players}人`, inline: true },
              { name: '制限時間', value: '1分', inline: true }
            );

            // 参加ボタン
            const row = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setLabel('参加する')
                  .setStyle(ButtonStyle.Success)
                  .setCustomId(`kake_join_${result.gameId}`)
              );

            const message = await interaction.reply({
              embeds: [embed],
              components: [row]
            });

            // 制限時間監視
            const gameId = result.gameId;
            const timeoutMs = 60 * 1000; // 1分

            setTimeout(async () => {
              try {
                const { gameSessions } = require('../modules/casinoService');
                const gameSession = gameSessions.get(gameId);

                if (gameSession && gameSession.status === 'waiting') {
                  // まだ開始されていない場合、時間切れ処理
                  const timeoutEmbed = new EmbedBuilder()
                    .setTitle('🎲 掛け金ゲーム - 時間切れ')
                    .setDescription('参加者が集まらなかったため、ゲームはキャンセルされました。')
                    .setColor(0xdc3545)
                    .addFields(
                      { name: 'ゲームID', value: gameId, inline: true },
                      { name: '返金額', value: `${amount} ${currency}`, inline: true },
                      { name: '理由', value: '参加者不足', inline: true }
                    );

                  // 掛け金を返金
                  const { getUserBalance, saveUserBalance } = require('../modules/economyService');
                  gameSession.participants.forEach(participantId => {
                    const balance = getUserBalance(participantId);
                    if (currency === 'TKUP') {
                      balance.tkup += amount;
                    } else {
                      balance.tkuc += amount;
                    }
                    saveUserBalance(participantId, balance);
                  });

                  // セッション削除
                  gameSessions.delete(gameId);

                  await message.edit({
                    embeds: [timeoutEmbed],
                    components: [] // ボタン削除
                  });
                }
              } catch (error) {
                console.error('Kake game timeout error:', error);
              }
            }, timeoutMs);

            return;
          }
          break;

        case 'kake_join':
          const gameId = interaction.options.getString('game_id');
          if (!gameId) {
            return await interaction.reply({
              content: '参加するゲームのIDを指定してください。',
              ephemeral: true
            });
          }

          result = joinKakeGame(interaction.user.id, gameId);
          embed.setDescription('🎲 掛け金ゲーム参加');
          break;

        default:
          return await interaction.reply({
            content: '無効なゲームタイプです。',
            ephemeral: true
          });
      }

      if (result && result.success) {
        embed.addFields(
          { name: '結果', value: result.message, inline: false }
        );

        // 勝敗に応じた色変更
        if (result.winnings > 0) {
          embed.setColor(0x28a745); // 緑（勝利）
        } else if (result.winnings === 0) {
          embed.setColor(0x6c757d); // 灰（引き分け/参加のみ）
        } else {
          embed.setColor(0xdc3545); // 赤（敗北）
        }
      } else if (result) {
        embed.addFields(
          { name: 'エラー', value: result.message, inline: false }
        );
        embed.setColor(0xdc3545);
      }

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Casino command error:', error);
      await interaction.reply({
        content: 'カジノゲームの実行中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};
