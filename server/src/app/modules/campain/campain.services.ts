import {
  assertCampainExists,
  assertCampainReferences,
  campainPopulate,
  ensureCampainIndexes,
  findCampainByBanner,
  findCampains,
} from '@/app/modules/campain/campain.helpers';
import { Campain } from '@/app/modules/campain/campain.model';
import {
  TCampainPayload,
  TUpdateCampainPayload,
} from '@/app/modules/campain/campain.types';

/** Creates a campaign with title and products. */
const createCampain = async (traceId: string, payload: TCampainPayload) => {
  await ensureCampainIndexes();
  await assertCampainReferences(traceId, payload);

  const campain = await Campain.create({
    title: payload.title,
    titleArabic: payload.titleArabic ?? null,
    products: payload.products,
  });

  return Campain.findById(campain._id)
    .populate(campainPopulate)
    .select('-__v');
};

/** Returns paginated campaigns. */
const getAllCampain = async (query: Record<string, unknown>) =>
  findCampains(query);

/** Returns one campaign by banner id (via banner.reference). */
const getCampainByBanner = async (traceId: string, bannerId: string) => {
  const campain = await findCampainByBanner(traceId, bannerId);
  assertCampainExists(campain, traceId);
  return campain;
};

/** Updates one campaign by id. */
const updateACampain = async (
  traceId: string,
  campainId: string,
  payload: TUpdateCampainPayload
) => {
  await assertCampainReferences(traceId, payload);

  const campain = await Campain.findByIdAndUpdate(campainId, payload, {
    new: true,
  })
    .populate(campainPopulate)
    .select('-__v');

  assertCampainExists(campain, traceId);
  return campain;
};

/** Removes one campaign by id. */
const removeACampain = async (traceId: string, campainId: string) => {
  const campain = await Campain.findByIdAndDelete(campainId)
    .populate(campainPopulate)
    .select('-__v');

  assertCampainExists(campain, traceId);
  return campain;
};

export const CampainService = {
  createCampain,
  getAllCampain,
  getCampainByBanner,
  updateACampain,
  removeACampain,
};
