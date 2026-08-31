import { INotification } from '@/app/modules/notification/notification.interface';
import { User } from '@/app/modules/user/user.model';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';

// DRY: notification worker emits the same socket event after DB save
export const emitSocketNotification = (
  traceId: string,
  payload: Partial<INotification>
): void => {
  // @ts-ignore — socketio is attached to global in app bootstrap
  const io = global?.socketio;
  if (!io) return;

  try {
    const channel = `notification::${payload.receiver}`;
    io.emit(channel, payload);
  } catch (err) {
    console.error(`[${traceId}] Socket emit failed:`, err);
  }
};

/** Returns a cursor of active customer accounts for promotional pushes. */
export const getActiveUserCursorForPromotional = () =>
  User.find({
    role: USER_ROLE.user,
    status: USER_STATUS.active,
    isDeleted: false,
  })
    .select('_id')
    .lean()
    .cursor();


