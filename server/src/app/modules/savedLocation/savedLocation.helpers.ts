import { HttpStatusCode } from 'axios';

import ApiError from '@/app/errors/ApiError';
import { SavedLocation } from '@/app/modules/savedLocation/savedLocation.model';
import { TSaveLocationPayload } from '@/app/modules/savedLocation/savedLocation.types';
import { buildGeoLocation } from '@/app/modules/user/user.helpers';

/** Throws when a saved location was not found for the user. */
export const assertSavedLocationExists = (
  location: unknown,
  traceId: string
) => {
  if (!location) {
    throw new ApiError(HttpStatusCode.NotFound, 'Saved location not found', traceId);
  }
};

/** Normalizes saved location payload into a persisted document shape. */
export const normalizeSavedLocationPayload = (payload: TSaveLocationPayload) => {
  const [longitude, latitude] = payload.location.coordinates;

  return {
    name: payload.name.trim(),
    location: buildGeoLocation(longitude, latitude),
    buildingNo: payload.buildingNo ?? null,
    floorNo: payload.floorNo ?? null,
    apartment: payload.apartment ?? null,
    city: payload.city.trim(),
    country: payload.country.trim(),
  };
};

/** Loads one saved location owned by the user. */
export const findSavedLocationForUser = (userId: string, locationId: string) =>
  SavedLocation.findOne({ _id: locationId, user: userId }).select('-__v').lean();
