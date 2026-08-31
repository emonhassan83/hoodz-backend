/** Assigns pending support customers when agents enter their schedule. */
export const startSupportAssignmentJob = (cron: any) =>
  cron.schedule('*/60 * * * * *', async () => {
    try {
      const { assignPendingSupportCustomers } = await import(
        '@/app/modules/supportAssignment/supportAssignment.helpers'
      );
      const result = await assignPendingSupportCustomers();
      if (result.assigned) {
        console.log(
          `⏰ [Cron] Support assignment: assigned=${result.assigned}, scanned=${result.scanned}`
        );
      }
    } catch (error) {
      console.error('⏰ [Cron] Support assignment job failed:', error);
    }
  });
