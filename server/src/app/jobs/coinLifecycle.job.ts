/** Sends Day 30/50 coin reminders and expires Day 60 coins. */
export const startCoinLifecycleJob = (cron: any) =>
  cron.schedule('0 9 * * *', async () => {
    try {
      const { CoinService } = await import('@/app/modules/coin/coin.services');
      const reminders = await CoinService.sendInactiveCoinReminders();
      const warnings = await CoinService.sendExpiryWarnings();
      const expired = await CoinService.expireDueCoins();
      console.log(
        `⏰ [Cron] Coin lifecycle: reminders=${reminders.notifiedUsers}, warnings=${warnings.notifiedUsers}, expiredUsers=${expired.expiredUsers}`
      );
    } catch (error) {
      console.error('⏰ [Cron] Coin lifecycle job failed:', error);
    }
  });
