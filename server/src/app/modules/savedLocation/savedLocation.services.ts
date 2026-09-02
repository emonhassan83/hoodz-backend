import {
  assertSavedLocationExists,
  findSavedLocationForUser,
  normalizeSavedLocationPayload,
} from '@/app/modules/savedLocation/savedLocation.helpers';
import { SavedLocation } from '@/app/modules/savedLocation/savedLocation.model';
import { TSaveLocationPayload } from '@/app/modules/savedLocation/savedLocation.types';

/** Saves a new location for the authenticated user. */
const saveALocation = async (userId: string, payload: TSaveLocationPayload) => {
  const location = await SavedLocation.create({
    user: userId,
    ...normalizeSavedLocationPayload(payload),
  });

  return SavedLocation.findById(location._id).select('-__v').lean();
};

/** Returns all saved locations for the authenticated user. */
const getMyLocation = async (userId: string) =>
  SavedLocation.find({ user: userId })
    .select('-__v')
    .sort({ createdAt: -1 })
    .lean();

/** Deletes one saved location owned by the authenticated user. */
const deleteALocation = async (
  traceId: string,
  userId: string,
  locationId: string
) => {
  const location = await findSavedLocationForUser(userId, locationId);
  assertSavedLocationExists(location, traceId);

  await SavedLocation.findByIdAndDelete(locationId);

  return {
    _id: location!._id,
    deleted: true,
  };
};

export const SavedLocationService = {
  saveALocation,
  getMyLocation,
  deleteALocation,
};
