import { TMailOption } from '../@types/system.types';
import { env } from '../configs/env.configs';

export function mailOption(
  to: string,
  subject: string,
  html: string,
  text = ''
): TMailOption {
  return {
    from: env.SMTP_USER,
    to,
    subject,
    text,
    html,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}
