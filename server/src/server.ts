import { createServer, type Server } from 'node:http';

import colors from 'colors';
import { config } from 'dotenv';

import app from '@/app';
import { connectDatabase } from '@/app/configs/db.configs';
import { connectRedis } from '@/app/configs/redis.config';
import { startCronJobs } from '@/app/jobs/jobScheduler';
import initializeSocketIO from '@/app/socket/socket.init';
import { shutdown } from '@/app/utils/shutdown.utils';
import { startWorkers } from '@/app/worker';

config();

const port: number = Number(process.env.PORT) || 5029;
const ip: string = process.env.IP || '127.0.0.1';
const server: Server = createServer(app);
export const io = initializeSocketIO(server);

async function main(): Promise<void> {
  await connectRedis();
  await connectDatabase();

  // Start background workers and cron schedules
  startWorkers();
  startCronJobs();

  server.listen(port, '0.0.0.0', () => {
    console.log(colors.italic.green.bold(`🚀 Server ready!`));
    console.log(colors.italic.blue(`🏠 Local:   http://127.0.0.1:${port}`));
    console.log(colors.italic.blue(`🌐 Network: http://${ip}:${port}`));
  });

  // @ts-ignore
  global.socketio = io;
}

main();

/**
 * Graceful signals
 */
process.on('SIGINT', () => shutdown({ reason: 'SIGINT', server }));
process.on('SIGTERM', () => shutdown({ reason: 'SIGTERM', server }));

/**
 * Fatal errors
 */
process.on('unhandledRejection', (error) =>
  shutdown({ reason: 'unhandledRejection', server, error })
);

process.on('uncaughtException', (error) =>
  shutdown({ reason: 'uncaughtException', server, error })
);

