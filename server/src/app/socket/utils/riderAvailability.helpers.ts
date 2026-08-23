import { HttpStatusCode } from 'axios';
import { PipelineStage } from 'mongoose';

import { getRedisClient } from '@/app/configs/redis.config';
import ApiError from '@/app/errors/ApiError';
import { KYC_STATUS } from '@/app/modules/kyc/kyc.constant';
import { Kyc } from '@/app/modules/kyc/kyc.model';
import { RIDER_LOCATION } from '@/app/constant';
import { USER_ROLE, USER_STATUS } from '@/app/modules/user/user.constant';
import { User } from '@/app/modules/user/user.model';
import { REDIS_KEYS } from '@/app/redis/keys';

export type TRiderAvailabilityPayload = {
  latitude: number;
  longitude: number;
  heading?: number;
};

export const normalizeRiderGeo = (payload?: {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  heading?: number;
} | null): TRiderAvailabilityPayload | null => {
  if (!payload) return null;
  const latitude = Number(payload.latitude ?? payload.lat);
  const longitude = Number(payload.longitude ?? payload.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    heading: payload.heading,
  };
};

type TRedisAvailability = {
  rider: string;
  isOnline: boolean;
  longitude: number;
  latitude: number;
  heading?: number | null;
  lastSeenAt: string;
  lastPersistedAt?: string | null;
  activeJob?: string | null;
};

const haversineMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
};

const ELIGIBLE_ONLINE_RIDER_FILTER = {
  role: USER_ROLE.rider,
  isOnline: true,
  status: USER_STATUS.active,
  isDeleted: false,
} as const;

/** Returns rider ids that are online, active, and KYC approved. */
const filterJobEligibleRiderIds = async (riderIds: string[]) => {
  if (!riderIds.length) return new Set<string>();

  const [users, kycs] = await Promise.all([
    User.find({
      _id: { $in: riderIds },
      ...ELIGIBLE_ONLINE_RIDER_FILTER,
    })
      .select('_id')
      .lean(),
    Kyc.find({
      user: { $in: riderIds },
      status: KYC_STATUS.approved,
    })
      .select('user')
      .lean(),
  ]);

  const approvedKycUserIds = new Set(kycs.map((kyc) => kyc.user.toString()));
  return new Set(
    users
      .map((user) => user._id.toString())
      .filter((id) => approvedKycUserIds.has(id))
  );
};

const persistUserLastAvailable = async (
  riderId: string,
  latitude: number,
  longitude: number
) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  if (latitude === 0 && longitude === 0) return;
  await User.findByIdAndUpdate(riderId, {
    lastAvailable: { type: 'Point', coordinates: [longitude, latitude] },
    lastAvailableAt: new Date(),
  });
};

let lastGeoHydrateAt = 0;

/** Rebuilds Redis GEO from persisted lastAvailable after a Redis flush. */
const hydrateOnlineRiderGeo = async () => {
  if (Date.now() - lastGeoHydrateAt < 30000) return;
  lastGeoHydrateAt = Date.now();

  const riders = await User.find({
    ...ELIGIBLE_ONLINE_RIDER_FILTER,
    'lastAvailable.coordinates.0': { $ne: 0 },
    'lastAvailable.coordinates.1': { $ne: 0 },
  })
    .select('_id lastAvailable')
    .lean();

  const redis = getRedisClient();
  await Promise.all(
    riders.map(async (rider) => {
      const longitude = Number(rider.lastAvailable?.coordinates?.[0]);
      const latitude = Number(rider.lastAvailable?.coordinates?.[1]);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
      const exists = await redis.zscore(REDIS_KEYS.RIDER_ONLINE_GEO, rider._id.toString());
      if (exists !== null) return;
      await redis.geoadd(
        REDIS_KEYS.RIDER_ONLINE_GEO,
        longitude,
        latitude,
        rider._id.toString()
      );
    })
  );
};
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
    lastPersistedAt: data.lastPersistedAt || null,
    activeJob: data.activeJob || null,
  };
};

/** Stores rider live availability in Redis hash and geo index. */
const setAvailability = async (
  riderId: string,
  payload: TRiderAvailabilityPayload & {
    isOnline: boolean;
    activeJob?: string | null;
    lastPersistedAt?: string | null;
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
    lastPersistedAt: payload.lastPersistedAt ?? '',
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

  const riderDoc = await User.findById(riderId).select('hasRiderActivateMode').lean();
  if (!riderDoc?.hasRiderActivateMode) {
    throw new ApiError(
      HttpStatusCode.Forbidden,
      'Verify security code to activate rider mode',
      traceId
    );
  }

  const availability = await setAvailability(riderId, {
    ...payload,
    isOnline: true,
  });
  await persistUserLastAvailable(riderId, payload.latitude, payload.longitude);
  const redis = getRedisClient();
  await redis.hset(
    REDIS_KEYS.RIDER_AVAILABILITY(riderId),
    'lastPersistedAt',
    new Date().toISOString()
  );
  const rider = await User.findByIdAndUpdate(
    riderId,
    {
      isOnline: true,
      lastAvailable: {
        type: 'Point',
        coordinates: [payload.longitude, payload.latitude],
      },
      lastAvailableAt: new Date(),
    },
    { returnDocument: 'after' }
  )
    .select(
      'name email phone profileAvatar avgRating ratingCount isOnline hasRiderActivateMode lastAvailable lastAvailableAt'
    )
    .lean();

  return { ...availability, rider };
};

/** Marks a rider offline after an explicit location ping. */
const goOffline = async (
  traceId: string,
  riderId: string,
  payload: TRiderAvailabilityPayload
) => {
  await assertRiderReadyForJobs(traceId, riderId);

  const availability = await setAvailability(riderId, {
    ...payload,
    isOnline: false,
    activeJob: null,
  });
  const rider = await User.findByIdAndUpdate(
    riderId,
    {
      isOnline: false,
      hasRiderActivateMode: false,
      lastAvailable: {
        type: 'Point',
        coordinates: [payload.longitude, payload.latitude],
      },
      lastAvailableAt: new Date(),
    },
    { returnDocument: 'after' }
  )
    .select(
      'name email phone profileAvatar avgRating ratingCount isOnline hasRiderActivateMode lastAvailable lastAvailableAt'
    )
    .lean();

  return { ...availability, rider };
};

/** Clears rider mode on socket disconnect without requiring a location payload. */
const deactivateOnDisconnect = async (riderId: string) => {
  const redis = getRedisClient();
  const current = parseAvailability(
    riderId,
    await redis.hgetall(REDIS_KEYS.RIDER_AVAILABILITY(riderId))
  );

  if (current) {
    await setAvailability(riderId, {
      latitude: current.latitude,
      longitude: current.longitude,
      heading: current.heading ?? undefined,
      isOnline: false,
      activeJob: null,
    });
    await persistUserLastAvailable(riderId, current.latitude, current.longitude);
  } else {
    await redis.zrem(REDIS_KEYS.RIDER_ONLINE_GEO, riderId);
    await redis.del(REDIS_KEYS.RIDER_AVAILABILITY(riderId));
  }

  const rider = await User.findByIdAndUpdate(
    riderId,
    { isOnline: false, hasRiderActivateMode: false },
    { returnDocument: 'after' }
  )
    .select(
      'name email phone profileAvatar avgRating ratingCount isOnline hasRiderActivateMode lastAvailable lastAvailableAt'
    )
    .lean();

  return { rider, isOnline: false, hasRiderActivateMode: false };
};

/** Finds nearby online riders from Redis GEO and hydrates user details from MongoDB. */
const findOnlineRiders = async (
  latitude: number,
  longitude: number,
  radiusKm = 10,
  count = 50
) => {
  if (radiusKm <= 0) {
    throw new ApiError(HttpStatusCode.BadRequest, 'radiusKm must be positive');
  }

  await hydrateOnlineRiderGeo();

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
    count
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
  const eligibleRiderIds = await filterJobEligibleRiderIds(availableRiderIds);
  const users = await User.find({
    _id: { $in: [...eligibleRiderIds] },
  })
    .select('name email phone profileAvatar avgRating ratingCount')
    .lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));

  return rawResults
    .filter(([riderId]) => eligibleRiderIds.has(riderId))
    .map(([riderId, distance]) => ({
      availability: availabilityList.find((item) => item?.rider === riderId),
      rider: userById.get(riderId),
      distanceKm: Number(Number(distance).toFixed(2)),
    }))
    .filter((item) => item.rider);
};

/** Lists online riders by lastAvailable distance from the shop, nearest first. */
const findOnlineRidersNearShop = async (
  latitude: number,
  longitude: number,
  radiusKm?: number
) => {
  const geoNear: PipelineStage.GeoNear['$geoNear'] = {
    near: { type: 'Point', coordinates: [longitude, latitude] },
    key: 'lastAvailable',
    distanceField: 'distanceMeters',
    spherical: true,
    query: {
      ...ELIGIBLE_ONLINE_RIDER_FILTER,
      'lastAvailable.coordinates.0': { $ne: 0 },
      'lastAvailable.coordinates.1': { $ne: 0 },
    },
  };
  if (radiusKm && radiusKm > 0) {
    geoNear.maxDistance = radiusKm * 1000;
  }

  const riders = await User.aggregate([
    { $geoNear: geoNear },
    {
      $lookup: {
        from: Kyc.collection.name,
        localField: '_id',
        foreignField: 'user',
        as: 'kyc',
      },
    },
    {
      $match: {
        'kyc.status': KYC_STATUS.approved,
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
        phone: 1,
        profileAvatar: 1,
        avgRating: 1,
        ratingCount: 1,
        distance: {
          $round: [{ $divide: ['$distanceMeters', 1000] }, 2],
        },
      },
    },
  ]);

  return riders;
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
  const minMoveMeters = RIDER_LOCATION.minMoveMeters;
  const persistIntervalSeconds = RIDER_LOCATION.persistIntervalSeconds;
  const movedMeters =
    current && Number.isFinite(current.latitude) && Number.isFinite(current.longitude)
      ? haversineMeters(
          current.latitude,
          current.longitude,
          payload.latitude,
          payload.longitude
        )
      : minMoveMeters;

  const shouldWriteGeo = !current || movedMeters >= minMoveMeters;
  const lastPersistedAt = current?.lastPersistedAt
    ? new Date(current.lastPersistedAt).getTime()
    : 0;
  const shouldPersist =
    !lastPersistedAt || Date.now() - lastPersistedAt >= persistIntervalSeconds * 1000;

  if (!shouldWriteGeo) {
    await redis.hset(REDIS_KEYS.RIDER_AVAILABILITY(riderId), {
      lastSeenAt: new Date().toISOString(),
      heading: payload.heading === undefined ? '' : String(payload.heading),
    });
    if (shouldPersist) {
      await persistUserLastAvailable(riderId, current!.latitude, current!.longitude);
      await redis.hset(
        REDIS_KEYS.RIDER_AVAILABILITY(riderId),
        'lastPersistedAt',
        new Date().toISOString()
      );
    }
    return parseAvailability(
      riderId,
      await redis.hgetall(REDIS_KEYS.RIDER_AVAILABILITY(riderId))
    );
  }

  const availability = await setAvailability(riderId, {
    ...payload,
    isOnline: current?.isOnline ?? true,
    activeJob: payload.activeJob ?? current?.activeJob ?? null,
    lastPersistedAt: current?.lastPersistedAt,
  });

  if (shouldPersist) {
    await persistUserLastAvailable(riderId, payload.latitude, payload.longitude);
    await redis.hset(
      REDIS_KEYS.RIDER_AVAILABILITY(riderId),
      'lastPersistedAt',
      new Date().toISOString()
    );
  }

  return availability;
};

/** Persists every online Redis rider point into User.lastAvailable. */
const persistOnlineRiderLocations = async () => {
  const redis = getRedisClient();
  const riderIds = (await redis.zrange(REDIS_KEYS.RIDER_ONLINE_GEO, 0, -1)) as string[];
  await Promise.all(
    riderIds.map(async (riderId) => {
      const current = parseAvailability(
        riderId,
        await redis.hgetall(REDIS_KEYS.RIDER_AVAILABILITY(riderId))
      );
      if (!current?.isOnline) return;
      await persistUserLastAvailable(riderId, current.latitude, current.longitude);
      await redis.hset(
        REDIS_KEYS.RIDER_AVAILABILITY(riderId),
        'lastPersistedAt',
        new Date().toISOString()
      );
    })
  );
  return { persisted: riderIds.length };
};

/** Stores current active job marker for rider availability matching. */
const setActiveJob = async (riderId: string, activeJob: string | null) => {
  const redis = getRedisClient();
  const key = REDIS_KEYS.RIDER_AVAILABILITY(riderId);
  if (activeJob) await redis.hset(key, 'activeJob', activeJob);
  else await redis.hdel(key, 'activeJob');
};

/** Reads the rider's last Redis availability snapshot. */
const getAvailability = async (riderId: string) => {
  const redis = getRedisClient();
  return parseAvailability(
    riderId,
    await redis.hgetall(REDIS_KEYS.RIDER_AVAILABILITY(riderId))
  );
};

export const RiderAvailabilitySocketHelper = {
  goOnline,
  goOffline,
  deactivateOnDisconnect,
  findOnlineRiders,
  findOnlineRidersNearShop,
  updateLocation,
  getAvailability,
  setActiveJob,
  persistOnlineRiderLocations,
  hydrateOnlineRiderGeo,
};



