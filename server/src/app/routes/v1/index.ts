import { Router } from 'express';

import { AiAssistantRoutes } from '@/app/modules/aiAssistant/aiAssistant.routes';
import { AuthRoutes } from '@/app/modules/auth/auth.routes';
import { BannerRoutes } from '@/app/modules/banner/banner.routes';
import { CartRoutes } from '@/app/modules/cart/cart.routes';
import { CategoryRoutes } from '@/app/modules/category/category.routes';
import { ChatRoutes } from '@/app/modules/chat/chat.routes';
import { CompanyDepositRoutes } from '@/app/modules/companyDeposit/companyDeposit.routes';
import { FollowRoutes } from '@/app/modules/follow/follow.routes';
import { JobRoutes } from '@/app/modules/job/job.routes';
import { KycRoutes } from '@/app/modules/kyc/kyc.routes';
import { MessagesRoutes } from '@/app/modules/messages/messages.routes';
import { NotificationRoutes } from '@/app/modules/notification/notification.routes';
import { OrdersRoutes } from '@/app/modules/orders/orders.routes';
import { OtpRoutes } from '@/app/modules/otp/otp.routes';
import { ProductRoutes } from '@/app/modules/product/product.routes';
import { RiderWalletRoutes } from '@/app/modules/riderWallet/riderWallet.routes';
import { SearchRoutes } from '@/app/modules/search/search.routes';
import { SettingsRoutes } from '@/app/modules/settings/settings.routes';
import { UploadRoutes } from '@/app/modules/upload/upload.routes';
import { UserRoutes } from '@/app/modules/user/user.routes';
import { WishlistRoutes } from '@/app/modules/wishlist/wishlist.routes';

const router = Router();

const apiRoutes = [
  {
    path: '/auth',
    route: AuthRoutes,
  },
  {
    path: '/banner',
    route: BannerRoutes,
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
    path: '/chat',
    route: ChatRoutes,
  },
  {
    path: '/messages',
    route: MessagesRoutes,
  },
  {
    path: '/connections',
    route: FollowRoutes,
  },
  {
    path: '/products',
    route: ProductRoutes,
  },
  {
    path: '/cart',
    route: CartRoutes,
  },
  {
    path: '/wishlist',
    route: WishlistRoutes,
  },
  {
    path: '/search',
    route: SearchRoutes,
  },
  {
    path: '/orders',
    route: OrdersRoutes,
  },
  {
    path: '/jobs',
    route: JobRoutes,
  },
  {
    path: '/rider-wallet',
    route: RiderWalletRoutes,
  },
  {
    path: '/company-deposits',
    route: CompanyDepositRoutes,
  },
  {
    path: '/ai-assistant',
    route: AiAssistantRoutes,
  },
];

apiRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
