import { REVIEW_MODEL_TYPE } from '@/app/modules/review/review.constant';

export type TReviewModelType =
  (typeof REVIEW_MODEL_TYPE)[keyof typeof REVIEW_MODEL_TYPE];

export type TCreateReviewPayload = {
  modelType: TReviewModelType;
  reference: string;
  review: string;
  files?: string[];
  rating: number;
};
