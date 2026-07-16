import { Router } from 'express';

import { AuthRoutes } from '@/app/modules/auth/auth.routes';
import { CategoryRoutes } from '@/app/modules/category/category.routes';
import { KycRoutes } from '@/app/modules/kyc/kyc.routes';
import { NotificationRoutes } from '@/app/modules/notification/notification.routes';
import { OtpRoutes } from '@/app/modules/otp/otp.routes';
import { ProductRoutes } from '@/app/modules/product/product.routes';
import { SettingsRoutes } from '@/app/modules/settings/settings.routes';
import { UploadRoutes } from '@/app/modules/upload/upload.routes';
import { UserRoutes } from '@/app/modules/user/user.routes';

const router = Router();

const apiRoutes = [
  {
    path: '/auth',
    route: AuthRoutes,
  },
  {
    path: '/otp',
    route: OtpRoutes,
  },
  {
    path: '/users',
    route: UserRoutes,
  },
  {
    path: '/upload',
    route: UploadRoutes,
  },
  {
    path: '/notification',
    route: NotificationRoutes,
  },
  {
    path: '/settings',
    route: SettingsRoutes,
  },
  {
    path: '/kyc',
    route: KycRoutes,
  },
  {
    path: '/category',
    route: CategoryRoutes,
  },
  {
    path: '/products',
    route: ProductRoutes,
  },
];

apiRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
