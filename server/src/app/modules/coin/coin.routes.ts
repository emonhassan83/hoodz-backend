import { Router } from 'express';

import auth from '@/app/middlewares/auth';
import { CoinController } from '@/app/modules/coin/coin.controllers';
import { AUTHENTICATED_ROLES } from '@/app/modules/user/user.constant';

const router = Router();

router
  .route('/summary')
  .get(auth(...AUTHENTICATED_ROLES), CoinController.getSummary);

export const CoinRoutes = router;
