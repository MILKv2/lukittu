import { z } from 'zod';

export type PurchaseBuiltByBitSchema = z.infer<
  ReturnType<typeof purchaseBuiltByBitSchema>
>;

export const purchaseBuiltByBitSchema = () =>
  z
    .object({
      apiSecret: z
        .string({
          required_error: 'BuiltByBit API Secret is required',
        })
        .regex(/^bbb_[A-Za-z0-9]{64}$/, {
          message: 'BuiltByBit API Secret is invalid',
        }),

      lukittuData: z
        .object({
          productId: z
            .string({
              required_error: 'Product UUID is required',
            })
            .uuid({
              message: 'Product UUID must be a valid UUID',
            }),
          ipLimit: z.number().positive().int().optional(),
          seats: z.number().min(1).positive().int().optional(),
          expirationStart: z.enum(['CREATION', 'ACTIVATION']).optional(),
          expirationDays: z.number().positive().min(1).int().optional(),
        })
        .strict({
          message: 'Lukittu data is invalid',
        }),

      builtByBitData: z
        .object({
          purchaser: z.object({
            username: z
              .string()
              .min(1, {
                message: 'Username is required',
              })
              .max(255, {
                message: 'Username must be less than 255 characters',
              }),
            userId: z.string().regex(/^\d+$/, 'User ID must be numeric'),
            userUrl: z.string().url('User URL must be a valid URL'),
          }),
          resource: z.object({
            resourceTitle: z.string(),
            resourceId: z
              .string()
              .regex(/^\d+$/, 'Resource ID must be numeric'),
            resourceUrl: z.string().url('Resource URL must be a valid URL'),
          }),
          addon: z.object({
            addonId: z.string().regex(/^\d+$/, 'Addon ID must be numeric'),
            addonTitle: z.string(),
          }),
          bundle: z.object({
            bundleId: z.string().regex(/^\d+$/, 'Bundle ID must be numeric'),
            bundleTitle: z.string(),
          }),
          purchaseDetails: z.object({
            renewal: z.string(),
            listPrice: z.string(),
            finalPrice: z.string(),
            purchaseDate: z.string(),
          }),
        })
        .strict({
          message: 'BuiltByBit data is invalid',
        }),
    })
    .strict();
