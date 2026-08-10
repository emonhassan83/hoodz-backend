import { Schema, model } from 'mongoose';
import { REVIEW_MODEL_TYPE } from '@/app/modules/review/review.constant';
import { IReview, IReviewModel } from './review.interface';
import { Product } from '@/app/modules/product/product.model';
import { User } from '@/app/modules/user/user.model';

const reviewSchema = new Schema<IReview, IReviewModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    modelType: {
      type: String,
      enum: Object.values(REVIEW_MODEL_TYPE),
      required: true,
      index: true,
    },
    reference: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'modelType',
      index: true,
    },
    review: {
      type: String,
      required: true,
      trim: true,
    },
    files: {
      type: [String],
      default: [],
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

reviewSchema.index({ user: 1, modelType: 1, reference: 1 }, { unique: true });
reviewSchema.index({ author: 1, createdAt: -1 });
reviewSchema.index({ modelType: 1, reference: 1, createdAt: -1 });

reviewSchema.post('save', async function syncRatingStats(doc) {
  const [authorStats] = await Review.aggregate([
    { $match: { author: doc.author } },
    {
      $group: {
        _id: '$author',
        avgRating: { $avg: '$rating' },
        ratingCount: { $sum: 1 },
      },
    },
  ]);

  await User.findByIdAndUpdate(doc.author, {
    avgRating: Number((authorStats?.avgRating ?? 0).toFixed(2)),
    ratingCount: authorStats?.ratingCount ?? 0,
  });

  if (doc.modelType === REVIEW_MODEL_TYPE.Product) {
    const [productStats] = await Review.aggregate([
      { $match: { modelType: REVIEW_MODEL_TYPE.Product, reference: doc.reference } },
      {
        $group: {
          _id: '$reference',
          avgRating: { $avg: '$rating' },
          ratingCount: { $sum: 1 },
        },
      },
    ]);

    await Product.findByIdAndUpdate(doc.reference, {
      avgRating: Number((productStats?.avgRating ?? 0).toFixed(2)),
      ratingCount: productStats?.ratingCount ?? 0,
      'seo.ratingValue': Number((productStats?.avgRating ?? 0).toFixed(2)),
    });
  }
});

export const Review = model<IReview, IReviewModel>('Review', reviewSchema);
