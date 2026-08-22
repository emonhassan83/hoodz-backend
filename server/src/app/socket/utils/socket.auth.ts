import { HttpStatusCode } from 'axios';
import { JwtPayload, verify } from 'jsonwebtoken';
import { Socket } from 'socket.io';

import { env } from '@/app/configs/env.configs';
import ApiError from '@/app/errors/ApiError';

const getSocketToken = (socket: Socket) => {
  const raw =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.token ||
    socket.handshake.headers?.authorization;

  if (!raw || typeof raw !== 'string') return null;

  const value = raw.trim();
  if (value.toLowerCase().startsWith('bearer ')) {
    return value.slice(7).trim() || null;
  }
  return value || null;
};

export const socketAuth = (socket: Socket, next: (err?: Error) => void) => {
  const token = getSocketToken(socket);
  if (!token) {
    next(new ApiError(HttpStatusCode.Unauthorized, 'you are not authorized!'));
    return;
  }

  try {
    const decoded = verify(
      token,
      env.JWT_ACCESS_TOKEN_SECRET_KEY as string
    ) as JwtPayload;
    const userId = String(decoded.userId ?? decoded.id ?? decoded._id ?? '');

    if (!userId) {
      next(new ApiError(HttpStatusCode.Unauthorized, 'you are not authorized!'));
      return;
    }

    (socket as any).auth = {
      _id: userId,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch {
    next(new ApiError(HttpStatusCode.Unauthorized, 'you are not authorized!'));
  }
};
