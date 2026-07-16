import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { KYC_STATUS } from '@/app/modules/kyc/kyc.constant';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { sendBothNotificationViaQueue } from '@/app/utils/notification-queue.service';
import { getEmailQueueInstance } from '@/app/utils/queueHelper';

export const assertRiderCanSubmitKyc = (
  rider: any,
  traceId: string
) => {
  if (!rider || rider.isDeleted) {
    throw new ApiError(HttpStatusCode.NotFound, 'Rider not found', traceId);
  }

  if (rider.role !== USER_ROLE.rider) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Only rider can submit KYC', traceId);
  }
};

export const assertKycBelongsToRequester = (
  kyc: any,
  requester: any,
  traceId: string
) => {
  if (
    requester.role === USER_ROLE.rider &&
    kyc.user._id.toString() !== requester.userId
  ) {
    throw new ApiError(HttpStatusCode.Forbidden, 'You can only access your own KYC', traceId);
  }
};

export const buildKycStatusNotification = (
  status: string,
  rejectedReason?: string
) => {
  if (status === KYC_STATUS.approved) {
    return {
      title: 'KYC Approved',
      message: 'Your KYC has been approved. Your rider account is now active.',
    };
  }

  if (status === KYC_STATUS.rejected) {
    return {
      title: 'KYC Rejected',
      message: `Your KYC has been rejected. Reason: ${rejectedReason}`,
    };
  }

  return {
    title: 'KYC Status Updated',
    message: 'Your KYC status has been updated.',
  };
};

export const sendKycStatusEmail = async (payload: {
  email: string;
  name: string;
  status: string;
  rejectedReason?: string | null;
}) => {
  const emailQueue = await getEmailQueueInstance();
  await emailQueue.add('send-kyc-status-email', payload, {
    priority: 1,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
};

export const sendKycStatusNotification = async (
  rider: any,
  title: string,
  message: string,
  kycId?: string
) => {
  if (!rider?._id) return;

  await sendBothNotificationViaQueue(
    rider._id.toString(),
    rider.fcmToken,
    title,
    message,
    {
      modelType: NOTIFICATION_MODEL_TYPE.Kyc,
      reference: kycId,
    }
  );
};
