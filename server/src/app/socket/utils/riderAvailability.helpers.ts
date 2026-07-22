import { HttpStatusCode } from 'axios';

import { getRedisClient } from '@/app/configs/redis.config';
import ApiError from '@/app/errors/ApiError';
import { KYC_STATUS } from '@/app/modules/kyc/kyc.constant';
import { Kyc } from '@/app/modules/kyc/kyc.model';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { REDIS_KEYS } from '@/app/redis/keys';

export type TRiderAvailabilityPayload = {
  latitude: number;
  longitude: number;
  heading?: number;
};

type TRedisAvailability = {
  rider: string;
  isOnline: boolean;
  longitude: number;
  latitude: number;
  heading?: number | null;
  lastSeenAt: string;
  activeJob?: string | null;
};

/** Throws unless rider is active and KYC approved. */
const assertRiderReadyForJobs = async (traceId: string, riderId: string) => {
  const [rider, kyc] = await Promise.all([
    User.findById(riderId).select('role status isDeleted').lean(),
    Kyc.findOne({ user: riderId }).select('status').lean(),
  ]);

  if (!rider || rider.isDeleted || rider.role !== USER_ROLE.rider) {
    throw new ApiError(HttpStatusCode.NotFound, 'Rider not found', traceId);
  }
  if (rider.status !== USER_STATUS.active) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Rider is not active', traceId);
  }
  if (!kyc || kyc.status !== KYC_STATUS.approved) {
    throw new ApiError(HttpStatusCode.Forbidden, 'Rider KYC is not approved', traceId);
  }
};

/** Converts Redis hash strings into a typed availability object. */
const parseAvailability = (
  riderId: string,
  data: Record<string, string>
): TRedisAvailability | null => {
  if (!data || Object.keys(data).length === 0) return null;

  return {
    rider: riderId,
    isOnline: data.isOnline === 'true',
    longitude: Number(data.longitude || 0),
    latitude: Number(data.latitude || 0),
    heading: data.heading ? Number(data.heading) : null,
    lastSeenAt: data.lastSeenAt,
    activeJob: data.activeJob || null,
  };
};

/** Stores rider live availability in Redis hash and geo index. */
const setAvailability = async (
  riderId: string,
  payload: TRiderAvailabilityPayload & {
    isOnline: boolean;
    activeJob?: string | null;
  }
) => {
  const redis = getRedisClient();
  const key = REDIS_KEYS.RIDER_AVAILABILITY(riderId);
  const data = {
    rider: riderId,
    isOnline: String(payload.isOnline),
    longitude: String(payload.longitude),
    latitude: String(payload.latitude),
    heading: payload.heading === undefined ? '' : String(payload.heading),
    activeJob: payload.activeJob ?? '',
    lastSeenAt: new Date().toISOString(),
  };

  await redis.hset(key, data);
  if (payload.isOnline) {
    await redis.geoadd(
      REDIS_KEYS.RIDER_ONLINE_GEO,
      payload.longitude,
      payload.latitude,
      riderId
    );
  } else {
    await redis.zrem(REDIS_KEYS.RIDER_ONLINE_GEO, riderId);
  }

  return parseAvailability(riderId, data as Record<string, string>);
};

/** Marks a rider online with their latest live location in Redis. */
const goOnline = async (
  traceId: string,
  riderId: string,
  payload: TRiderAvailabilityPayload
) => {
  await assertRiderReadyForJobs(traceId, riderId);

  const availability = await setAvailability(riderId, {
    ...payload,
    isOnline: true,
  });
  const rider = await User.findById(riderId)
    .select('name email phone profileAvatar avgRating ratingCount')
    .lean();

  return { ...availability, rider };
};

/** Marks a rider offline and removes them from Redis geo index. */
const goOffline = async (riderId: string) => {
  const redis = getRedisClient();
  const current = parseAvailability(
    riderId,
    await redis.hgetall(REDIS_KEYS.RIDER_AVAILABILITY(riderId))
  );

  const availability = await setAvailability(riderId, {
    latitude: current?.latitude ?? 0,
    longitude: current?.longitude ?? 0,
    heading: current?.heading ?? undefined,
    isOnline: false,
    activeJob: null,
  });
  const rider = await User.findById(riderId)
    .select('name email phone profileAvatar avgRating ratingCount')
    .lean();

  return { ...availability, rider };
};

/** Finds nearby online riders from Redis GEO and hydrates user details from MongoDB. */
const findOnlineRiders = async (
  latitude: number,
  longitude: number,
  radiusKm = 10
) => {
  if (radiusKm <= 0) {
    throw new ApiError(HttpStatusCode.BadRequest, 'radiusKm must be positive');
  }

  const redis = getRedisClient();
  const rawResults = (await redis.geosearch(
    REDIS_KEYS.RIDER_ONLINE_GEO,
    'FROMLONLAT',
    longitude,
    latitude,
    'BYRADIUS',
    radiusKm,
    'km',
    'WITHDIST',
    'ASC',
    'COUNT',
    50
  )) as unknown as [string, string][];

  const riderIds = rawResults.map(([riderId]) => riderId);
  const availabilityList = await Promise.all(
    riderIds.map(async (riderId) =>
      parseAvailability(
        riderId,
        await redis.hgetall(REDIS_KEYS.RIDER_AVAILABILITY(riderId))
      )
    )
  );
  const availableRiderIds = availabilityList
    .filter((item) => item?.isOnline && !item.activeJob)
    .map((item) => item!.rider);
  const users = await User.find({ _id: { $in: availableRiderIds } })
    .select('name email phone profileAvatar avgRating ratingCount')
    .lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));

  return rawResults
    .filter(([riderId]) => availableRiderIds.includes(riderId))
    .map(([riderId, distance]) => ({
      availability: availabilityList.find((item) => item?.rider === riderId),
      rider: userById.get(riderId),
      distanceKm: Number(Number(distance).toFixed(2)),
    }))
    .filter((item) => item.rider);
};

/** Updates rider location in Redis while online or during a job. */
const updateLocation = async (
  riderId: string,
  payload: TRiderAvailabilityPayload & { activeJob?: string | null }
) => {
  const redis = getRedisClient();
  const current = parseAvailability(
    riderId,
    await redis.hgetall(REDIS_KEYS.RIDER_AVAILABILITY(riderId))
  );

  return setAvailability(riderId, {
    ...payload,
    isOnline: current?.isOnline ?? true,
    activeJob: payload.activeJob ?? current?.activeJob ?? null,
  });
};

/** Stores current active job marker for rider availability matching. */
const setActiveJob = async (riderId: string, activeJob: string | null) => {
  const redis = getRedisClient();
  const key = REDIS_KEYS.RIDER_AVAILABILITY(riderId);
  if (activeJob) await redis.hset(key, 'activeJob', activeJob);
  else await redis.hdel(key, 'activeJob');
};

export const RiderAvailabilitySocketHelper = {
  goOnline,
  goOffline,
  findOnlineRiders,
  updateLocation,
  setActiveJob,
};

