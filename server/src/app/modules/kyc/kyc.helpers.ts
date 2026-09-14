import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { KYC_STATUS } from '@/app/modules/kyc/kyc.constant';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { buildNotificationCopy } from '@/app/modules/notification/notification.i18n';
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
    return buildNotificationCopy('kyc.approved');
  }

  if (status === KYC_STATUS.rejected) {
    return buildNotificationCopy('kyc.rejected', {
      reason: rejectedReason,
    });
  }

  return buildNotificationCopy('kyc.updated');
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
  titleArabic?: string,
  messageArabic?: string,
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
    },
    titleArabic,
    messageArabic
  );
};

/** Formats rider user info for KYC detail responses. */
export const formatKycUser = (user: Record<string, any>) => ({
  _id: user._id,
  name: user.name ?? '',
  email: user.email ?? null,
  profileAvatar: user.profileAvatar ?? null,
  countryCode: user.countryCode ?? null,
  phone: user.phone ?? null,
  status: user.status,
});

/** Formats one rider payout wallet for KYC detail responses. */
export const formatKycWallet = (wallet: Record<string, any>) => ({
  _id: wallet._id,
  type: wallet.type,
  details: wallet.details ?? {},
  createdAt: wallet.createdAt,
  updatedAt: wallet.updatedAt,
});

/** Formats one KYC detail response with rider wallets. */
export const formatKycDetails = (
  kyc: Record<string, any>,
  wallets: Record<string, any>[] = []
) => {
  const user =
    kyc.user && typeof kyc.user === 'object' && kyc.user._id
      ? formatKycUser(kyc.user)
      : kyc.user
        ? {
            _id: kyc.user,
            name: '',
            email: null,
            profileAvatar: null,
            countryCode: null,
            phone: null,
            status: null,
          }
        : null;

  return {
    _id: kyc._id,
    user,
    createdAt: kyc.createdAt,
    license: kyc.license ?? [],
    nationalId: kyc.nationalId ?? [],
    rejectedReason: kyc.rejectedReason ?? null,
    status: kyc.status,
    updatedAt: kyc.updatedAt,
    vehicle: kyc.vehicle,
    wallets: wallets.map(formatKycWallet),
  };
};
