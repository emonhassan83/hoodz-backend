import { HttpStatusCode } from 'axios';

import QueryBuilder from '@/app/builder/QueryBuilder';
import ApiError from '@/app/errors/ApiError';
import {
  GRIEVANCE_RESOLUTION_TYPE,
  GRIEVANCE_STATUS,
} from '@/app/modules/grievance/grievance.constant';
import {
  assertGrievanceAccess,
  assertGrievanceExists,
  assertGrievanceStatusTransition,
  assertResolutionPayload,
  getUserOrderForGrievanceOrThrow,
} from '@/app/modules/grievance/grievance.helpers';
import { Grievance } from '@/app/modules/grievance/grievance.model';
import {
  TCreateGrievancePayload,
  TGrievanceRequester,
  TResolveGrievancePayload,
} from '@/app/modules/grievance/grievance.types';
import { USER_ROLE } from '@/app/modules/user/user.constant';

const grievancePopulate = [
  { path: 'user', select: 'name email phone profileAvatar walletBalance balance' },
  { path: 'order', select: 'id amount deliveryCharge totalAmount status paymentStatus billingDetails author' },
];

/** Creates a grievance from a user's own order. */
const createGrievance = async (
  traceId: string,
  userId: string,
  payload: TCreateGrievancePayload
) => {
  await getUserOrderForGrievanceOrThrow(traceId, userId, payload.order);

  const existingOpenCase = await Grievance.findOne({
    user: userId,
    order: payload.order,
    issueType: payload.issueType,
    status: GRIEVANCE_STATUS.under_review,
  });
  if (existingOpenCase) {
    throw new ApiError(
      HttpStatusCode.Conflict,
      'You already have an open grievance for this issue',
      traceId
    );
  }

  const grievance = await Grievance.create({
    user: userId,
    order: payload.order,
    issueType: payload.issueType,
    description: payload.description,
    files: payload.files ?? [],
    status: GRIEVANCE_STATUS.under_review,
  });

  return Grievance.findById(grievance._id)
    .populate(grievancePopulate)
    .select('-__v');
};

/** Returns paginated grievances; users see own, support sees all. */
const getAllGrievances = async (
  query: Record<string, unknown>,
  requester: TGrievanceRequester
) => {
  const filter =
    requester.role === USER_ROLE.user ? { user: requester.userId } : {};

  const grievanceQuery = new QueryBuilder(
    Grievance.find(filter).populate(grievancePopulate).select('-__v').lean(),
    query
  )
    .filter()
    .sort()
    .paginate()
    .fields();

  const [data, meta] = await Promise.all([
    grievanceQuery.modelQuery,
    grievanceQuery.countTotal(),
  ]);

  return { meta, data };
};

/** Returns one grievance after access verification. */
const getAGrievance = async (
  traceId: string,
  grievanceId: string,
  requester: TGrievanceRequester
) => {
  const grievance = await Grievance.findById(grievanceId)
    .populate(grievancePopulate)
    .select('-__v');
  assertGrievanceExists(grievance, traceId);
  assertGrievanceAccess(traceId, grievance!, requester);

  return grievance;
};

/** Updates grievance review/resolution. */
const resolveGrievance = async (
  traceId: string,
  grievanceId: string,
  requester: TGrievanceRequester,
  payload: TResolveGrievancePayload
) => {
  const grievance = await Grievance.findById(grievanceId);
  assertGrievanceExists(grievance, traceId);
  assertGrievanceAccess(traceId, grievance!, requester, true);
  assertGrievanceStatusTransition(traceId, grievance!.status, payload.status);
  assertResolutionPayload(traceId, payload);

  grievance!.status = payload.status;
  grievance!.resolutionType =
    payload.status === GRIEVANCE_STATUS.resolved
      ? payload.resolutionType ?? GRIEVANCE_RESOLUTION_TYPE.none
      : GRIEVANCE_RESOLUTION_TYPE.none;
  grievance!.note = payload.note ?? null;

  if (payload.status === GRIEVANCE_STATUS.resolved) {
    grievance!.resolvedAt = new Date();
    grievance!.rejectAt = null;
  } else if (payload.status === GRIEVANCE_STATUS.rejected) {
    grievance!.rejectAt = new Date();
    grievance!.resolvedAt = null;
  }

  await grievance!.save();

  return Grievance.findById(grievanceId)
    .populate(grievancePopulate)
    .select('-__v');
};

/** Permanently deletes a grievance after access verification. */
const deleteGrievance = async (
  traceId: string,
  grievanceId: string,
  requester: TGrievanceRequester
) => {
  const grievance = await Grievance.findById(grievanceId);
  assertGrievanceExists(grievance, traceId);
  assertGrievanceAccess(traceId, grievance!, requester, true);

  return Grievance.findByIdAndDelete(grievanceId).select('-__v');
};

export const GrievanceService = {
  createGrievance,
  getAllGrievances,
  getAGrievance,
  resolveGrievance,
  deleteGrievance,
};
