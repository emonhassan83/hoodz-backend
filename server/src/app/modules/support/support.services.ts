import { HttpStatusCode } from 'axios';

import { env } from '@/app/configs/env.configs';
import { ISupport } from '@/app/modules/support/support.interface';
import ApiError from '@/app/errors/ApiError';
import { Setting } from '@/app/modules/settings/settings.model';
import { User } from '@/app/modules/user/user.model';
import { getEmailQueueInstance } from '@/app/utils/queueHelper';
import { createSupportEmailTemplate } from '@/app/worker/templates/supportEmail.templete';

// ── helper: support email fetch ───────────────────────────────────────────────
const getSupportEmail = async (): Promise<string> => {
  const supportEmailContent = await Setting.findOne({
    key: 'supportEmail',
  }).lean();
  return supportEmailContent?.value || env.SMTP_USER;
};

// ── helper: author fetch ──────────────────────────────────────────────────────
const getAuthor = async (userId: string, traceId: string) => {
  const author = await User.findById(userId).select('name email isDeleted');
  if (!author || author?.isDeleted) {
    throw new ApiError(HttpStatusCode.Forbidden, 'User not found!', traceId);
  }
  return author;
};

export const sendSupportEmail = async (
  traceId: string,
  payload: Omit<ISupport, 'author'>,
  userId: string
) => {
  const { subject, messages } = payload;

  const [author] = await Promise.all([
    getAuthor(userId, traceId),
  ]);

  const supportEmail = env.SMTP_USER || (await getSupportEmail());

  const emailHtml = createSupportEmailTemplate(
    {
      name: author.name,
      email: author.email,
    },
    {
      subject,
      messages,
    }
  );

  try {
    const emailQueue = await getEmailQueueInstance();
    await emailQueue.add(
      'send-support-email',
      {
        to: supportEmail,
        subject: `Support Request: ${payload.subject}`,
        html: emailHtml,
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    );
    console.log(
      `[Support Service] Support email job added to queue for ${supportEmail}`
    );
  } catch (error: any) {
    console.error('Failed to queue support email job:', error);
    throw new ApiError(
      HttpStatusCode.InternalServerError,
      'Failed to send support request',
      traceId
    );
  }
};

export const SupportService = {
  sendSupportEmail,
};
