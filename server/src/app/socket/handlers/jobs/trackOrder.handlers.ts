import mongoose from 'mongoose';

import ApiError from '@/app/errors/ApiError';
import { JOB_STATUS } from '@/app/modules/job/job.constant';
import { Job } from '@/app/modules/job/job.model';
import { assertOrderAccess } from '@/app/modules/orders/orders.helpers';
import { Orders } from '@/app/modules/orders/orders.model';
import { USER_ROLE } from '@/app/modules/user/user.constant';
import { TTrackOrderSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  leaveOrderTrackRooms,
  orderTrackRoom,
  sendJobAck,
} from '@/app/socket/utils/jobSocket.helpers';
import { RiderAvailabilitySocketHelper } from '@/app/socket/utils/riderAvailability.helpers';
import { HttpStatusCode } from 'axios';

const findTrackableOrder = async (orderId: string) => {
  const filters: Record<string, unknown>[] = [{ id: orderId }];
  if (mongoose.isValidObjectId(orderId)) filters.push({ _id: orderId });
  return Orders.findOne({ $or: filters, isDeleted: false }).select(
    'id user author status'
  );
};

export const trackOrderHandler = eventHandler<TTrackOrderSocketPayload>(
  async (socket: TSocket, payload, callback) => {
    const orderId = payload?.orderId?.trim();
    if (!orderId) {
      throw new ApiError(HttpStatusCode.BadRequest, 'orderId is required');
    }

    const order = await findTrackableOrder(orderId);
    if (!order) {
      throw new ApiError(HttpStatusCode.NotFound, 'Order not found');
    }

    const job = await Job.findOne({
      order: order._id,
      status: { $nin: [JOB_STATUS.delivered, JOB_STATUS.cancelled] },
    }).select('rider');

    const requester = { userId: socket.auth._id, role: socket.auth.role! };
    const isAssignedRider = job?.rider?.toString() === socket.auth._id;
    if (!isAssignedRider && requester.role !== USER_ROLE.agent) {
      assertOrderAccess('socket', order, requester);
    }

    const room = orderTrackRoom(order._id.toString());
    leaveOrderTrackRooms(socket);
    socket.join(room);

    const riderId = job?.rider?.toString();
    const availability = riderId
      ? await RiderAvailabilitySocketHelper.getAvailability(riderId)
      : null;
    const location =
      availability && Number.isFinite(availability.latitude) && Number.isFinite(availability.longitude)
        ? {
            lat: availability.latitude,
            lng: availability.longitude,
            speed: 0,
            heading: availability.heading ?? 0,
            encodedRoute: '',
          }
        : null;

    sendJobAck(callback, {
      success: true,
      status: 200,
      message: 'Joined order tracking room',
      data: {
        orderId: order._id.toString(),
        room,
        listen: SOCKET_EMIT.orderLocation,
        location,
      },
    });
  }
);
