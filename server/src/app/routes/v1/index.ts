import { Router } from 'express';

import { AiAssistantRoutes } from '@/app/modules/aiAssistant/aiAssistant.routes';
import { AuthRoutes } from '@/app/modules/auth/auth.routes';
import { BannerRoutes } from '@/app/modules/banner/banner.routes';
import { CartRoutes } from '@/app/modules/cart/cart.routes';
import { CategoryRoutes } from '@/app/modules/category/category.routes';
import { ChatRoutes } from '@/app/modules/chat/chat.routes';
import { CoinRoutes } from '@/app/modules/coin/coin.routes';
import { DepositRoutes } from '@/app/modules/deposit/deposit.routes';
import { FollowRoutes } from '@/app/modules/follow/follow.routes';
import { GrievanceRoutes } from '@/app/modules/grievance/grievance.routes';
import { JobRoutes } from '@/app/modules/job/job.routes';
import { KycRoutes } from '@/app/modules/kyc/kyc.routes';
import { MessagesRoutes } from '@/app/modules/messages/messages.routes';
import { NotificationRoutes } from '@/app/modules/notification/notification.routes';
import { OrdersRoutes } from '@/app/modules/orders/orders.routes';
import { OtpRoutes } from '@/app/modules/otp/otp.routes';
import { PaymentRoutes } from '@/app/modules/payment/payment.routes';
import { PosOrderRoutes } from '@/app/modules/posOrder/posOrder.routes';
import { ProductRoutes } from '@/app/modules/product/product.routes';
import { ReviewRoutes } from '@/app/modules/review/review.routes';
import { SavedCardRoutes } from '@/app/modules/savedCard/savedCard.routes';
import { SearchRoutes } from '@/app/modules/search/search.routes';
import { SettingsRoutes } from '@/app/modules/settings/settings.routes';
import { TopUpRoutes } from '@/app/modules/topUp/topUp.routes';
import { UploadRoutes } from '@/app/modules/upload/upload.routes';
import { UserRoutes } from '@/app/modules/user/user.routes';
import { VoucherRoutes } from '@/app/modules/voucher/voucher.routes';
import { WalletRoutes } from '@/app/modules/wallet/wallet.routes';
import { WalletTransactionRoutes } from '@/app/modules/walletTransaction/walletTransaction.routes';
import { WishlistRoutes } from '@/app/modules/wishlist/wishlist.routes';
import { WithdrawRoutes } from '@/app/modules/withdraw/withdraw.routes';

const router = Router();

const apiRoutes = [
  // ===============================
  //  Authentication routes
  // ===============================
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
    path: '/kyc',
    route: KycRoutes,
  },
  {
    path: '/upload',
    route: UploadRoutes,
  },

  // ===============================
  //  User services routes
  // ===============================
  {
    path: '/notification',
    route: NotificationRoutes,
  },
  {
    path: '/settings',
    route: SettingsRoutes,
  },

  // ===============================
  //  E-commerce routes
  // ===============================
  {
    path: '/banner',
    route: BannerRoutes,
  },
  {
    path: '/category',
    route: CategoryRoutes,
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
    path: '/reviews',
    route: ReviewRoutes,
  },
  {
    path: '/search',
    route: SearchRoutes,
  },

  // ==============================
  //  Cart, wishlist and voucher routes
  // ===============================
  {
    path: '/cart',
    route: CartRoutes,
  },
  {
    path: '/wishlist',
    route: WishlistRoutes,
  },
  {
    path: '/voucher',
    route: VoucherRoutes,
  },
  {
    path: '/coin',
    route: CoinRoutes,
  },

  // ===============================
  //  Card management and wallet routes
  // ===============================
  {
    path: '/wallet',
    route: WalletRoutes,
  },
  {
    path: '/wallet-transactions',
    route: WalletTransactionRoutes,
  },
  {
    path: '/withdraws',
    route: WithdrawRoutes,
  },
  {
    path: '/saved-cards',
    route: SavedCardRoutes,
  },
  {
    path: '/top-up',
    route: TopUpRoutes,
  },

  // ===============================
  //  Payment and order routes
  // ===============================
  {
    path: '/orders',
    route: OrdersRoutes,
  },
  {
    path: '/pos-orders',
    route: PosOrderRoutes,
  },
  {
    path: '/payments',
    route: PaymentRoutes,
  },

  // ===============================
  //  Rider job and deposit routes
  // ===============================
  {
    path: '/jobs',
    route: JobRoutes,
  },
  {
    path: '/deposits',
    route: DepositRoutes,
  },

  // ===============================
  //  Support and AI assistant routes
  // ===============================
  {
    path: '/chat',
    route: ChatRoutes,
  },
  {
    path: '/messages',
    route: MessagesRoutes,
  },
  {
    path: '/ai-assistant',
    route: AiAssistantRoutes,
  },
  {
    path: '/grievance',
    route: GrievanceRoutes,
  },
];

apiRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
