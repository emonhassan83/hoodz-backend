import { z } from 'zod';

import {
  MOBILE_WALLET_PROVIDER,
  WALLET_ACCOUNT_TYPE,
} from '@/app/modules/wallet/wallet.constant';

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const walletAccountTypeSchema = z.enum([
  WALLET_ACCOUNT_TYPE.mobile_wallet,
  WALLET_ACCOUNT_TYPE.instapay,
  WALLET_ACCOUNT_TYPE.bank_account,
]);
const mobileWalletProviderSchema = z.enum([
  MOBILE_WALLET_PROVIDER.vodafone_cash,
  MOBILE_WALLET_PROVIDER.orange_cash,
  MOBILE_WALLET_PROVIDER.etisalat_cash,
  MOBILE_WALLET_PROVIDER.we_pay,
]);
const walletAccountDetailsSchema = z.object({
  walletProvider: mobileWalletProviderSchema.optional(),
  walletPhoneNumber: z.string().trim().min(1).optional(),
  walletHolderName: z.string().trim().min(1).optional(),
  instaPayAddress: z.string().trim().min(1).optional(),
  accountHolderName: z.string().trim().min(1).optional(),
  registeredPhoneNumber: z.string().trim().min(1).optional(),
  bankName: z.string().trim().min(1).optional(),
  accountNumber: z.string().trim().min(1).optional(),
  iban: z.string().trim().min(1).optional(),
  bankBranch: z.string().trim().min(1).nullable().optional(),
});

const validateWalletDetailsByType = (
  data: { type?: string; details?: Record<string, unknown> },
  context: z.RefinementCtx
) => {
  if (!data.type || !data.details) return;

  const requiredFieldsByType = {
    [WALLET_ACCOUNT_TYPE.mobile_wallet]: [
      'walletProvider',
      'walletPhoneNumber',
      'walletHolderName',
    ],
    [WALLET_ACCOUNT_TYPE.instapay]: [
      'instaPayAddress',
      'accountHolderName',
      'registeredPhoneNumber',
    ],
    [WALLET_ACCOUNT_TYPE.bank_account]: [
      'bankName',
      'accountNumber',
      'iban',
      'accountHolderName',
    ],
  } as const;

  requiredFieldsByType[data.type as keyof typeof requiredFieldsByType]?.forEach(
    (field) => {
      if (!data.details?.[field]) {
        context.addIssue({
          code: 'custom',
          path: ['body', 'details', field],
          message: `${field} is required for ${data.type}`,
        });
      }
    }
  );
};

const walletAccountValidationSchema = z
  .object({
    body: z.object({
      type: walletAccountTypeSchema,
      details: walletAccountDetailsSchema,
    }),
  })
  .superRefine(({ body }, context) => validateWalletDetailsByType(body, context));

const updateWalletAccountValidationSchema = z
  .object({
    params: z.object({
      walletId: objectIdSchema,
    }),
    body: z
      .object({
        type: walletAccountTypeSchema.optional(),
        details: walletAccountDetailsSchema.optional()
      })
      .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field is required',
      }),
  })
  .superRefine(({ body }, context) => validateWalletDetailsByType(body, context));

const walletIdParamValidationSchema = z.object({
  params: z.object({
    walletId: objectIdSchema,
  }),
});

const toggleWalletActivityValidationSchema = z.object({
  params: z.object({
    walletId: objectIdSchema,
  }),
});

export const WalletValidation = {
  walletAccountValidationSchema,
  updateWalletAccountValidationSchema,
  walletIdParamValidationSchema,
  toggleWalletActivityValidationSchema,
};




