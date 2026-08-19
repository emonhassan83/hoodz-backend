/** Flushes live Redis rider points into User.lastAvailable. */
export const startRiderLocationPersistJob = (cron: any) =>
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { JobService } = await import('@/app/modules/job/job.services');
      const result = await JobService.persistOnlineRiderLocations();
      console.log(
        `⏰ [Cron] Rider location persist: riders=${result?.persisted ?? 0}`
      );
    } catch (error) {
      console.error('⏰ [Cron] Rider location persist job failed:', error);
    }
  });
