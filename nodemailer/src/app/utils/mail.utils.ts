import { TMailOption } from '@/app/@types/system.types';
import { env } from '@/app/configs/env.configs';

export function mailOption(
  to: string,
  subject: string,
  html: string,
  text = ''
): TMailOption {
  return {
    from: env.MAIL_FROM,
    to,
    subject,
    text,
    html,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}
