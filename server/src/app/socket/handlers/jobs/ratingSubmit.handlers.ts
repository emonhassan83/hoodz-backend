import { ReviewService } from '@/app/modules/review/review.services';
import { TRideRatingSubmitSocketPayload } from '@/app/socket/interface/jobSocket.interface';
import { TSocket } from '@/app/socket/interface/socket.interface';
import { SOCKET_EMIT } from '@/app/socket/socket.constant';
import eventHandler from '@/app/socket/utils/eventHandler';
import {
  emitToUserIds,
  sendJobAck,
} from '@/app/socket/utils/jobSocket.helpers';

export const ratingSubmitHandler = eventHandler<TRideRatingSubmitSocketPayload>(
  async (socket: TSocket, payload, callback) => {
    if (!payload?.jobId || payload.rating == null || !payload.review?.trim()) {
      sendJobAck(callback, {
        success: false,
        status: 400,
        message: 'jobId, rating, and review are required',
      });
      return;
    }

    const data = await ReviewService.createFromJob('socket', socket.auth._id, {
      jobId: payload.jobId,
      rating: Number(payload.rating),
      review: payload.review.trim(),
      files: payload.files ?? [],
    });

    const riderId = String(
      (data as any)?.author?._id ?? (data as any)?.author ?? ''
    );
    if (riderId && riderId !== 'undefined') {
      emitToUserIds([riderId], SOCKET_EMIT.rideRatingSubmitted, data);
    }

    sendJobAck(callback, {
      success: true,
      status: 201,
      message: 'Ride rating submitted',
      data,
    });
  }
);
