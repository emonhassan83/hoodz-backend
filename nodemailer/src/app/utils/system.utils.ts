import { TSendMailBody } from '../@types/system.types';

export const isValidEmailPayload = (
  payload: TSendMailBody
): payload is Required<TSendMailBody> => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return Boolean(
    payload.to &&
      emailRegex.test(payload.to) &&
      payload.subject &&
      payload.html
  );
};
