Date/Session: 2026-06-29

Completed Tasks: Fixed application crash due to missing Firebase service account configuration by introducing a graceful fallback to a mock messaging client.

Key Changes:
- Refactored [server/src/app/configs/firebase.configs.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/configs/firebase.configs.ts) to detect missing configuration parameters and fall back to mock messaging implementations (`send` and `sendEachForMulticast`) instead of throwing fatal errors.

Pending/Next Steps:
- Re-run `docker compose down && docker compose up -d` to verify healthy server startup.

***

Date/Session: 2026-06-30

Completed Tasks: Fixed crashes/bugs caused by references to non-existent `req.user._id` across the `singlerepo-backend` and `ride-sharing-backend` repositories.

Key Changes:
- In `ride-sharing-backend`:
  - Updated [notification.controllers.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/modules/notification/notification.controllers.ts) (`getAllNotifications`, `markAsDoneNotification`, `deleteAllNotifications`) to use `req.user.userId` instead of `req.user._id`.
  - Updated [message.controller.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/modules/messages/message.controller.ts) (`seenMessage`) to use `req.user.userId` instead of `req.user._id`.
- In `singlerepo-backend`:
  - Updated [otp.controllers.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/modules/otp/otp.controllers.ts) (`sentOTPInMail`) to use `req.user.userId` instead of `req.user._id`.
  - Updated [notification.controllers.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/modules/notification/notification.controllers.ts) (`markAsDoneNotification`, `deleteAllNotifications`) to use `req.user.userId` instead of `req.user._id`.

***

Date/Session: 2026-06-30

Completed Tasks: Restricted `ride:driver-accepted` event emission for split rides to the accepted passenger's user room only.

Key Changes:
- Modified [driverAcceptRide.handler.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/socket/handlers/ride/driverAcceptRide.handler.ts) to emit the `ride:driver-accepted` socket event to `user:${passenger.userId.toString()}` instead of the entire `ride:${rideId}` room under the split ride branch, ensuring only the target passenger is notified when their portion of the split ride is accepted.

***

Date/Session: 2026-06-30

Completed Tasks: Fixed completed ride emit event not firing for split rides by correctly updating passenger statuses to `completed` in the database.

Key Changes:
- Modified [driverCompleteTrip.handler.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/socket/handlers/ride/driverCompleteTrip.handler.ts) to update `Passenger` status to `PASSENGER_STATUS.completed` in the loop, allowing the `remainingDroppedOff` count to successfully reach `0` and trigger the final ride completion flow and socket event emissions.

***

Date/Session: 2026-06-30

Completed Tasks: Scoped the `ride:passenger-picked-up` socket event to the individual passenger's room rather than broadcasting to the entire ride room.

Key Changes:
- Modified [pickUpRide.handler.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/socket/handlers/ride/pickUpRide.handler.ts) to remove `io.to(\`ride:\${rideId}\`).emit('ride:passenger-picked-up')`, ensuring only the picked up passenger receives this event.

***

Date/Session: 2026-06-30

Completed Tasks: Updated fare logic during ride creation, split ride join, passenger pickup, and trip completion to store and maintain `totalFare` in the database.

Key Changes:
- Modified [rideRequest.handler.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/socket/handlers/ride/rideRequest.handler.ts) to set `totalFare` equal to `estimatedFare` during passenger creation.
- Modified [splitRideRequest.handler.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/socket/handlers/ride/splitRideRequest.handler.ts) to set `totalFare` equal to `estimatedFare` during passenger creation for split rides.
- Modified [pickUpRide.handler.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/socket/handlers/ride/pickUpRide.handler.ts) to recalculate and update `totalFare = totalFare + waitingCharge` when picking up a passenger with a waiting charge.
- Modified [driverCompleteTrip.handler.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/socket/handlers/ride/driverCompleteTrip.handler.ts) to prioritize using the persisted `totalFare` from the passenger document.

***

Date/Session: 2026-06-30

Completed Tasks: Fixed multiple occurrences of direct `req.query` mutations across controllers in the `ride-sharing-backend` repository.

Key Changes:
- Modified [review.controller.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/modules/review/review.controller.ts) to clone query parameters instead of directly modifying `req.query['user']`.
- Modified [notification.controllers.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/modules/notification/notification.controllers.ts) to clone query parameters instead of modifying `req.query['receiver']`.
- Modified [refund.controller.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/modules/refund/refund.controller.ts) to clone query parameters instead of modifying `req.query.user`.
- Modified [payment.controllers.ts](file:///c:/bdcalling/explore/ride-sharing-backend/server/src/app/modules/payment/payment.controllers.ts) to clone query parameters instead of modifying `req.query.booking`.

***

Date/Session: 2026-06-30

Completed Tasks: Replaced direct mutation of `req.query` with a cloned object in the notification controller.

Key Changes:
- Modified [notification.controllers.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/modules/notification/notification.controllers.ts) in `getAllNotifications` to construct a new `query` object copying `req.query` and appending `receiver: req.user._id`, instead of directly mutating `req.query['receiver']`.

***

Date/Session: 2026-06-29

Completed Tasks: Configured explicit public DNS servers for the server container to resolve Atlas MongoDB SRV lookup failures.

Key Changes:
- Added Google (`8.8.8.8`) and Cloudflare (`1.1.1.1`) DNS resolvers to `server` container configuration inside [docker-compose.yaml](file:///c:/bdcalling/explore/singlerepo-backend/docker-compose.yaml).

Pending/Next Steps:
- Restart stack and verify connection success to external MongoDB database.

***

Date/Session: 2026-06-29

Completed Tasks: Fixed `Missing Environment Variable: MONGODB_URI` crash by removing the host variable override from `docker-compose.yaml`.

Key Changes:
- Modified [docker-compose.yaml](file:///c:/bdcalling/explore/singlerepo-backend/docker-compose.yaml) to remove the explicit `MONGODB_URI: ${MONGODB_URI}` assignment under `server.environment`, enabling Docker to fall back to the value defined in `server/.env`.

Pending/Next Steps:
- Re-run `docker compose up -d` to verify successful connection to the cloud MongoDB database.

***

Date/Session: 2026-06-29

Completed Tasks: Created `.dockerignore` files to exclude `node_modules` and other local development artifacts from the Docker build context, fixing build context transmission errors.

Key Changes:
- Created root [.dockerignore](file:///c:/bdcalling/explore/singlerepo-backend/.dockerignore) to exclude node_modules, dist, environments, and logs.
- Created server-specific [server/.dockerignore](file:///c:/bdcalling/explore/singlerepo-backend/server/.dockerignore) as a secondary defense.

Pending/Next Steps:
- Re-run `docker compose build` to verify successful container builds.

***

Date/Session: 2026-06-29

Completed Tasks: Consolidated all BullMQ background workers into a single `workers/` directory under `app/worker` and verified compilation success.

Key Changes:
- Moved workers to a single folder: [email.worker.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/workers/email.worker.ts), [notification.worker.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/workers/notification.worker.ts), [system.worker.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/workers/system.worker.ts).
- Deleted separate subfolders `email/`, `notification/`, and `system/`.
- Updated [server/src/app/worker/index.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/index.ts) to import all workers from the consolidated `./workers/` directory.

Pending/Next Steps:
- Verify background jobs trigger in integration environment.

***

Date/Session: 2026-06-29

Completed Tasks: Restructured background workers into folders, created templates directory with an OTP email template, and resolved Node16 module resolution import issues by adopting dynamic imports for ESM packages.

Key Changes:
- Created [server/src/app/worker/templates/otp-email.template.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/templates/otp-email.template.ts) for email layouts.
- Moved workers to folder-based modules: [email.worker.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/email/email.worker.ts), [notification.worker.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/notification/notification.worker.ts), [system.worker.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/system/system.worker.ts).
- Deleted obsolete root-level worker files.
- Refactored [server/src/app/jobs/index.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/jobs/index.ts) and [server/src/app/middlewares/trace.middlewares.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/middlewares/trace.middlewares.ts) to load ESM libraries dynamically.

Pending/Next Steps:
- Validate workers and cron runtimes in local Docker setup.

***

Date/Session: 2026-06-29

Completed Tasks: Set up a single-repo backend system by simplifying docker compose to run only Redis and Server, implementing background queue workers inside server/src/app/worker using BullMQ, scheduling cron jobs in server/src/app/jobs using node-cron, integrating worker and job initialization into server startup, and updating all workspace documentation to reflect the single-repo structure.

Key Changes:
- Modified [docker-compose.yaml](file:///c:/bdcalling/explore/singlerepo-backend/docker-compose.yaml) to remove MongoDB and other redundant service containers.
- Created [server/src/app/worker/email.worker.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/email.worker.ts) to process transactional email queue jobs.
- Created [server/src/app/worker/notification.worker.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/notification.worker.ts) to process socket and push notification queue jobs.
- Created [server/src/app/worker/system.worker.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/system.worker.ts) to handle generic system queue jobs.
- Created [server/src/app/worker/index.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/worker/index.ts) as the background worker lifecycle manager.
- Updated [server/src/app/jobs/index.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/jobs/index.ts) to schedule periodic tasks using node-cron.
- Integrated start/stop hooks for workers and jobs in [server/src/server.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/server.ts) and [server/src/app/utils/shutdown.utils.ts](file:///c:/bdcalling/explore/singlerepo-backend/server/src/app/utils/shutdown.utils.ts).
- Overwrote root [README.md](file:///c:/bdcalling/explore/singlerepo-backend/README.md) and docs in `docs/` ([ARCHITECTURE.md](file:///c:/bdcalling/explore/singlerepo-backend/docs/ARCHITECTURE.md), [development.md](file:///c:/bdcalling/explore/singlerepo-backend/docs/development.md), [FOLDER_STRUCTURE.md](file:///c:/bdcalling/explore/singlerepo-backend/docs/FOLDER_STRUCTURE.md), [DEPLOYMENT.md](file:///c:/bdcalling/explore/singlerepo-backend/docs/DEPLOYMENT.md)) to reflect the new single-repo architecture.

Pending/Next Steps:
- Deploy updated Docker container stack to validation env and test cloud MongoDB connectivity.
- Verify BullMQ queue processing of verification emails on user sign-up/login.

***

Date/Session: 2026-06-29

Completed Tasks: Generated a robust documentation system including architectural, coding style, database, authentication, deployment, and testing workflows, alongside an AI system prompt file.

Key Changes:
- Created [ARCHITECTURE.md](file:///c:/bdcalling/explore/monorepo-backend/docs/ARCHITECTURE.md)
- Created [API_GUIDELINES.md](file:///c:/bdcalling/explore/monorepo-backend/docs/API_GUIDELINES.md)
- Created [AUTHENTICATION.md](file:///c:/bdcalling/explore/monorepo-backend/docs/AUTHENTICATION.md)
- Created [CODING_RULES.md](file:///c:/bdcalling/explore/monorepo-backend/docs/CODING_RULES.md)
- Created [DATABASE_SEEDING.md](file:///c:/bdcalling/explore/monorepo-backend/docs/DATABASE_SEEDING.md)
- Created [DEPLOYMENT.md](file:///c:/bdcalling/explore/monorepo-backend/docs/DEPLOYMENT.md)
- Created [FOLDER_STRUCTURE.md](file:///c:/bdcalling/explore/monorepo-backend/docs/FOLDER_STRUCTURE.md)
- Created [TESTING_WORKFLOW.md](file:///c:/bdcalling/explore/monorepo-backend/docs/TESTING_WORKFLOW.md)
- Created [AI_SYSTEM_PROMPT.md](file:///c:/bdcalling/explore/monorepo-backend/docs/AI_SYSTEM_PROMPT.md)
- Updated [README.md](file:///c:/bdcalling/explore/monorepo-backend/docs/README.md) index maps.

Pending/Next Steps: Maintain this memory across upcoming chat sessions; integrate automated test suites or create schema entities.
