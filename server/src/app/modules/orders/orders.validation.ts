import { z } from 'zod';

import {
  DELIVERY_TYPE,
  ORDER_STATUS,
  PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const optionalNumber = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.number().nullable().optional()
);

const deliveryLocationSchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    coordinates: z
      .tuple([z.coerce.number(), z.coerce.number()])
      .optional(),
  })
  .transform((value, ctx) => {
    const latitude = value.latitude ?? value.lat ?? value.coordinates?.[1];
    const longitude = value.longitude ?? value.lng ?? value.coordinates?.[0];
    if (latitude === undefined || longitude === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'deliveryLocation.latitude and longitude are required',
      });
      return z.NEVER;
    }
    return { latitude, longitude };
  });

const billingDetailsSchema = z
  .object({
    name: z.string().trim().nullable().optional(),
    address: z.string().trim().nullable().optional(),
    phoneNumber: z.string().trim().nullable().optional(),
    email: z.string().trim().email('Valid billing email is required'),
    buildingNo: optionalNumber,
    floorNo: optionalNumber,
    apartment: optionalNumber,
    city: z.string().trim().nullable().optional(),
    country: z.string().trim().nullable().optional(),
    note: z.string().trim().nullable().optional(),
    deliveryLocation: deliveryLocationSchema.optional(),
    location: deliveryLocationSchema.optional(),
  })
  .transform((value, ctx) => {
    const deliveryLocation = value.deliveryLocation ?? value.location;
    if (!deliveryLocation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryLocation'],
        message: 'deliveryLocation is required',
      });
      return z.NEVER;
    }
    const { location: _location, ...billingDetails } = value;
    return { ...billingDetails, deliveryLocation };
  });

const colorSchema = z.object({
  code: z.string().trim().min(1, 'Color code is required'),
  name: z.string().trim().min(1, 'Color name is required'),
});

const createOrderValidationSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          product: objectIdSchema,
          quantity: z.number().int().positive(),
          size: z.string().trim().nullable().optional(),
          color: colorSchema.nullable().optional(),
        })
      )
      .min(1, 'At least one item is required'),
    orderData: z.object({
      billingDetails: billingDetailsSchema,
      deliveryType: z.enum(Object.values(DELIVERY_TYPE) as [string, ...string[]]),
      deliveryCharge: z.number().nonnegative().default(0),
      transactionId: z.string().trim().nullable().optional(),
      redeemCoins: z.number().int().nonnegative().optional(),
      voucherCode: z.string().trim().min(1).nullable().optional(),
    }),
  }),
});

const changeOrderStatusValidationSchema = z.object({
  params: z.object({
    orderId: objectIdSchema,
  }),
  body: z
    .object({
      status: z.enum(Object.values(ORDER_STATUS) as [string, ...string[]]).optional(),
      paymentStatus: z
        .enum(Object.values(PAYMENT_STATUS) as [string, ...string[]])
        .optional(),
      transactionId: z.string().trim().nullable().optional(),
      isOtpVerified: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required',
    }),
});

const orderIdParamValidationSchema = z.object({
  params: z.object({
    orderId: objectIdSchema,
  }),
});

const getMyOrdersQueryValidationSchema = z.object({
  query: z
    .object({
      filter: z.enum(['active', 'completed', 'cancelled']).optional(),
    })
    .passthrough(),
});

export const OrdersValidation = {
  createOrderValidationSchema,
  changeOrderStatusValidationSchema,
  orderIdParamValidationSchema,
  getMyOrdersQueryValidationSchema,
};


