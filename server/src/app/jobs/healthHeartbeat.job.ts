/** Logs a periodic heartbeat so operators can confirm cron is alive. */
export const startHealthHeartbeatJob = (cron: any) =>
  cron.schedule('*/5 * * * *', () => {
    console.log(
      `⏰ [Cron] System Heartbeat: Server is healthy at ${new Date().toISOString()}`
    );
  });
