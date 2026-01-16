const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTKUCRate, getUserBalance, saveUserBalance, recordTransaction } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-sell')
    .setDescription('TKUCを現在のレートで売却し、TKUPに変換します')
    .addNumberOption(option =>
      option.setName('amount')
        .setDescription('売却するTKUCの数量')
        .setRequired(true)
        .setMinValue(0.01)),

  async execute(interaction, client) {
    try {
      const tkucAmount = interaction.options.getNumber('amount');

      // 小数点2桁に制限
      const roundedAmount = Math.round(tkucAmount * 100) / 100;

      if (roundedAmount <= 0) {
        return await interaction.reply({
          content: '売却数量は0より大きい値を指定してください。',
          ephemeral: true
        });
      }

      const balance = getUserBalance(interaction.user.id);
      const currentRate = getTKUCRate();

      // 残高チェック
      if (balance.tkuc < roundedAmount) {
        return await interaction.reply({
          content: `TKUC残高が不足しています。\n現在の残高: ${balance.tkuc.toFixed(2)} TKUC`,
          ephemeral: true
        });
      }

      // 売却金額計算（手数料2%）
      const grossAmount = roundedAmount * currentRate;
      const fee = Math.ceil(grossAmount * 0.02); // 手数料2%（切り上げ）
      const tkupReceived = Math.floor((grossAmount - fee) * 100) / 100;

      // 残高更新
      balance.tkuc -= roundedAmount;
      balance.tkup += tkupReceived;
      saveUserBalance(interaction.user.id, balance);

      // 取引履歴記録
      recordTransaction(interaction.user.id, 'sell', { tkucAmount: roundedAmount, tkupReceived, fee, rate: currentRate });

      // tickカウンタ更新
      const { addTickSell } = require('../modules/economyService');
      addTickSell(roundedAmount);

      const embed = new EmbedBuilder()
        .setTitle('✅ TKUC売却完了')
        .setDescription(`${roundedAmount} TKUCを現在のレートで売却しました。`)
        .addFields(
          { name: '現在のレート', value: `${currentRate} TKUP = 1 TKUC`, inline: true },
          { name: '売却数量', value: `${roundedAmount} TKUC`, inline: true },
          { name: '手数料', value: `${fee} TKUP（2%）`, inline: true },
          { name: '受取額', value: `${tkupReceived} TKUP`, inline: true },
          { name: '売却後残高', value: `TKUC: ${balance.tkuc.toFixed(2)} | TKUP: ${balance.tkup}`, inline: false }
        )
        .setColor(0xff6600)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Sell command error:', error);
      await interaction.reply({
        content: '売却処理中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};
