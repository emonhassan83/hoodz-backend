import { startCoinLifecycleJob } from '@/app/jobs/coinLifecycle.job';
import { startHealthHeartbeatJob } from '@/app/jobs/healthHeartbeat.job';
import { startRiderLocationPersistJob } from '@/app/jobs/riderLocationPersist.job';
import { startRiderMatchJob } from '@/app/jobs/riderMatch.job';
import { startSupportAssignmentJob } from '@/app/jobs/supportAssignment.job';

let jobs: any[] = [];
let supportBackfillDone = false;

/** Imports and starts every cron job from this root scheduler. */
export const startCronJobs = async () => {
  console.log('⏰ [Cron] Starting cron schedules...');
  try {
    const cronModule = await import('node-cron');
    const cron = cronModule.default || cronModule;

    jobs.push(startHealthHeartbeatJob(cron));
    jobs.push(startCoinLifecycleJob(cron));
    jobs.push(startRiderMatchJob(cron));
    jobs.push(startRiderLocationPersistJob(cron));
    jobs.push(startSupportAssignmentJob(cron));

    if (!supportBackfillDone) {
      const { backfillSupportAssignmentsFromChats } = await import(
        '@/app/modules/supportAssignment/supportAssignment.helpers'
      );
      const result = await backfillSupportAssignmentsFromChats();
      supportBackfillDone = true;
      console.log(
        `⏰ [Cron] Support assignment backfill processed=${result.processed}`
      );
    }

    console.log(`⏰ [Cron] ✓ ${jobs.length} cron schedules active`);
  } catch (error) {
    console.error('⏰ [Cron] Failed to load node-cron or start jobs:', error);
  }
};

/** Stops every scheduled cron job started by this scheduler. */
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
