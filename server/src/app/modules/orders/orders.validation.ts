import { z } from 'zod';

import {
  DELIVERY_TYPE,
  ORDER_STATUS,
  PAYMENT_STATUS,
} from '@/app/modules/orders/orders.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const billingDetailsSchema = z.object({
  name: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  phoneNumber: z.string().trim().nullable().optional(),
  email: z.string().trim().email('Valid billing email is required'),
  buildingNo: z.number().nullable().optional(),
  floorNo: z.number().nullable().optional(),
  apartment: z.number().nullable().optional(),
  city: z.string().trim().nullable().optional(),
  country: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
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

export const OrdersValidation = {
  createOrderValidationSchema,
  changeOrderStatusValidationSchema,
  orderIdParamValidationSchema,
};


