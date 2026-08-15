let jobs: any[] = [];

/**
 * Define and schedule all cron jobs here
 */
export const startCronJobs = async () => {
  console.log('⏰ [Cron] Starting cron schedules...');
  try {
    const cronModule = await import('node-cron');
    const cron = cronModule.default || cronModule;

    // Job 1: System Health Heartbeat (Every hour or every minute in dev)
    const healthHeartbeat = cron.schedule('*/5 * * * *', () => {
      console.log(`⏰ [Cron] System Heartbeat: Server is healthy at ${new Date().toISOString()}`);
    });
    jobs.push(healthHeartbeat);

    const coinLifecycle = cron.schedule('0 9 * * *', async () => {
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
    jobs.push(coinLifecycle);

    console.log(`⏰ [Cron] ✓ ${jobs.length} cron schedules active`);
  } catch (error) {
    console.error('⏰ [Cron] Failed to load node-cron or start jobs:', error);
  }
};

/**
 * Stop and clean up all scheduled cron jobs
 */
export const stopCronJobs = () => {
  console.log('⏰ [Cron] Stopping all cron jobs...');
  jobs.forEach((job) => {
    if (job && typeof job.stop === 'function') {
      job.stop();
    }
  });
  jobs = [];
  console.log('⏰ [Cron] All cron jobs stopped successfully');
};


