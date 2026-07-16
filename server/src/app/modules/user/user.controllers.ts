import { Request, Response } from 'express';

import { getTraceId } from '@/app/configs/requestContext.configs';
import { UserService } from '@/app/modules/user/user.services';
import { asyncHandler, sendResponse } from '@/app/utils/system.utils';

// ─── Read ──────────────────────────────────────────────────────────────────

const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.getAllUsersFromDB(traceId, req.query);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Users fetched successfully',
    data,
    traceId,
  });
});

const getAUser = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.getSingleUser(traceId, req.params.userId as string);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'User fetched successfully',
    data,
    traceId,
  });
});

const inviteVendor = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.inviteVendor(traceId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Vendor invited successfully',
    data,
    traceId,
  });
});

const getNearbyShops = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.getNearbyShops(traceId, req.query as any);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Nearby shops fetched successfully',
    data,
    traceId,
  });
});

const inviteAgent = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.inviteAgent(traceId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: 'Agent invited successfully',
    data,
    traceId,
  });
});

// ─── Update ────────────────────────────────────────────────────────────────

const changedEmail = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.changeEmail(traceId, req.user.userId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Email changed successfully',
    data,
    traceId,
  });
});

const updateUserProfile = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.updateUserProfile(traceId, req.params.userId as string, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Profile updated successfully',
    data,
    traceId,
  });
});

const updateUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.updateUserStatus(traceId, req.params.userId as string, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'User status updated successfully',
    data,
    traceId,
  });
});

const updateMyLocation = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.updateLocationFromDB(traceId, req.user.userId, req.body);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Location updated successfully',
    data,
    traceId,
  });
});

const updateMyDeliveryLocation = asyncHandler(
  async (req: Request, res: Response) => {
    const traceId = getTraceId();
    const data = await UserService.updateDeliveryLocationFromDB(
      traceId,
      req.user.userId,
      req.body
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Delivery location updated successfully',
      data,
      traceId,
    });
  }
);

const setOrUpdateSecurityCode = asyncHandler(
  async (req: Request, res: Response) => {
    const traceId = getTraceId();
    const data = await UserService.setOrUpdateSecurityCode(
      traceId,
      req.user.userId,
      req.body
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: 'Security code saved successfully',
      data,
      traceId,
    });
  }
);

const verifySecurityCode = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.verifySecurityCode(
    traceId,
    req.user.userId,
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Security code verified successfully',
    data,
    traceId,
  });
});

// ─── Delete ────────────────────────────────────────────────────────────────

const deleteUserProfile = asyncHandler(async (req: Request, res: Response) => {
  const traceId = getTraceId();
  const data = await UserService.deleteUserProfile(traceId, req.params.userId as string);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Account deleted successfully',
    data,
    traceId,
  });
});

export const UserControllers = {
  getAllUsers,
  getAUser,
  getNearbyShops,
  inviteVendor,
  inviteAgent,
  changedEmail,
  updateUserProfile,
  updateUserStatus,
  updateMyLocation,
  updateMyDeliveryLocation,
  setOrUpdateSecurityCode,
  verifySecurityCode,
  deleteUserProfile,
};
