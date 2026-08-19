/** Rematches unmatched delivery jobs on a short interval. */
export const startRiderMatchJob = (cron: any) =>
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const { JobService } = await import('@/app/modules/job/job.services');
      const result = await JobService.rematchDueJobs('cron');
      if (result.scanned) {
        console.log(
          `⏰ [Cron] Rider match: scanned=${result.scanned}, rematched=${result.rematched}, exhausted=${result.exhausted}`
        );
      }
    } catch (error) {
      console.error('⏰ [Cron] Rider match job failed:', error);
    }
  });
