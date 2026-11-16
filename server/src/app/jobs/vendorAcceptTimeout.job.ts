import { ORDER_STATUS } from '@/app/modules/orders/orders.constant';
import { Orders } from '@/app/modules/orders/orders.model';
import { emitOrderUpdated } from '@/app/modules/orders/orders.socket';
import { NOTIFICATION_MODEL_TYPE } from '@/app/modules/notification/notification.constant';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { sendBatchNotificationViaQueue } from '@/app/utils/notification-queue.service';

const VENDOR_ACCEPT_LIMIT_MS = 3 * 60 * 1000;

/** Escalates orders a vendor has not accepted within 3 minutes. */
export const escalateStaleVendorOrders = async () => {
  const cutoff = new Date(Date.now() - VENDOR_ACCEPT_LIMIT_MS);
  const stale = await Orders.find({
    status: ORDER_STATUS.pending,
    isDeleted: { $ne: true },
    createdAt: { $lte: cutoff },
    vendorEscalatedAt: null,
  })
    .select('_id id')
    .limit(50)
    .lean();

  if (!stale.length) return 0;

  const staff = await User.find({
    role: { $in: [USER_ROLE.agent, USER_ROLE.admin] },
    isDeleted: { $ne: true },
  })
    .select('_id')
    .lean();
  const staffIds = staff.map((user) => user._id.toString());

  for (const order of stale) {
    const updated = await Orders.findOneAndUpdate(
      { _id: order._id, status: ORDER_STATUS.pending, vendorEscalatedAt: null },
      { vendorEscalatedAt: new Date() },
      { new: true }
    ).select('_id');
    if (!updated) continue;

    await emitOrderUpdated(order._id, 'escalated', {
      previousStatus: ORDER_STATUS.pending,
    });

    if (staffIds.length) {
      await sendBatchNotificationViaQueue({
        userIds: staffIds,
        channel: 'both',
        title: 'Vendor has not accepted',
        message: `Order ${order.id} is still pending after 3 minutes.`,
        titleArabic: 'التاجر لم يقبل الطلب',
        messageArabic: `الطلب ${order.id} ما زال معلقاً بعد 3 دقائق.`,
        data: {
          modelType: NOTIFICATION_MODEL_TYPE.Order,
          reference: order._id.toString(),
          orderId: order._id.toString(),
          notice: 'escalated',
        },
      }).catch((error) => {
        console.warn('[Order] Failed to queue vendor-timeout notifications', error);
      });
    }
  }

  return stale.length;
};

/** Checks every minute for vendor orders that missed the accept window. */
export const startVendorAcceptTimeoutJob = (cron: any) =>
  cron.schedule('0 * * * * *', async () => {
    try {
      const escalated = await escalateStaleVendorOrders();
      if (escalated) {
        console.log(`⏰ [Cron] Vendor accept timeout escalated=${escalated}`);
      }
    } catch (error) {
      console.error('⏰ [Cron] Vendor accept timeout job failed:', error);
    }
  });
