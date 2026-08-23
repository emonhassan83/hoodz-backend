import { Types } from 'mongoose';

import { COIN_REFERENCE_TYPE } from '@/app/modules/coin/coin.constant';

export type TCoinReferenceType =
  (typeof COIN_REFERENCE_TYPE)[keyof typeof COIN_REFERENCE_TYPE];

export type TReferenceId = string | Types.ObjectId;
