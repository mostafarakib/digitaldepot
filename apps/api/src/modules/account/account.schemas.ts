import { z } from 'zod';
import { isValidDivision, isValidDistrict, isDistrictInDivision } from './data/bangladesh-geo.js';

export const BD_PHONE_REGEX = /^(?:01[3-9]\d{8}|\+8801[3-9]\d{8}|8801[3-9]\d{8})$/;

/**
 * Normalizes an accepted Bangladesh mobile phone number into canonical E.164 format: +8801XXXXXXXXX.
 */
export function normalizeBdPhone(phone: string): string {
  const cleaned = phone.trim();
  if (cleaned.startsWith('+8801')) return cleaned;
  if (cleaned.startsWith('8801')) return `+${cleaned}`;
  if (cleaned.startsWith('01')) return `+88${cleaned}`;
  return cleaned;
}

export const updateProfileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name cannot be empty')
    .max(50, 'First name cannot exceed 50 characters')
    .optional(),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name cannot be empty')
    .max(50, 'Last name cannot exceed 50 characters')
    .optional(),
  phone: z
    .union([
      z
        .string()
        .trim()
        .regex(
          BD_PHONE_REGEX,
          'Invalid Bangladesh phone number format. Supported formats: 01XXXXXXXXX, +8801XXXXXXXXX, or 8801XXXXXXXXX',
        ),
      z.null(),
    ])
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface CustomerProfileOutput {
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
}

export interface ProfileDetailsOutput {
  profile: CustomerProfileOutput | null;
  email: string;
  emailVerified: boolean;
}

export const createAddressSchema = z
  .object({
    recipientName: z
      .string()
      .trim()
      .min(1, 'Recipient name is required')
      .max(100, 'Recipient name cannot exceed 100 characters'),
    phone: z
      .string()
      .trim()
      .regex(
        BD_PHONE_REGEX,
        'Invalid Bangladesh phone number format. Supported formats: 01XXXXXXXXX, +8801XXXXXXXXX, or 8801XXXXXXXXX',
      ),
    divisionId: z.string().trim().min(1, 'Division is required'),
    districtId: z.string().trim().min(1, 'District is required'),
    upazila: z
      .string()
      .trim()
      .min(1, 'Upazila/Thana is required')
      .max(100, 'Upazila/Thana cannot exceed 100 characters'),
    streetAddress: z
      .string()
      .trim()
      .min(3, 'Street address must be at least 3 characters')
      .max(255, 'Street address cannot exceed 255 characters'),
    postalCode: z
      .union([
        z
          .string()
          .trim()
          .regex(/^\d{4}$/, 'Postal code must be exactly 4 digits'),
        z.literal(''),
        z.null(),
      ])
      .transform((val) => (val === '' ? null : val))
      .optional()
      .default(null),
    label: z
      .union([
        z.string().trim().max(50, 'Label cannot exceed 50 characters'),
        z.literal(''),
        z.null(),
      ])
      .transform((val) => (val === '' ? null : val))
      .optional()
      .default(null),
    isDefault: z.boolean().optional().default(false),
  })
  .refine((data) => isValidDivision(data.divisionId), {
    message: 'Invalid division ID',
    path: ['divisionId'],
  })
  .refine((data) => isValidDistrict(data.districtId), {
    message: 'Invalid district ID',
    path: ['districtId'],
  })
  .refine((data) => isDistrictInDivision(data.divisionId, data.districtId), {
    message: 'District does not belong to the selected division',
    path: ['districtId'],
  });

export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = z.object({
  recipientName: z
    .string()
    .trim()
    .min(1, 'Recipient name cannot be empty')
    .max(100, 'Recipient name cannot exceed 100 characters')
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(
      BD_PHONE_REGEX,
      'Invalid Bangladesh phone number format. Supported formats: 01XXXXXXXXX, +8801XXXXXXXXX, or 8801XXXXXXXXX',
    )
    .optional(),
  divisionId: z.string().trim().min(1, 'Division cannot be empty').optional(),
  districtId: z.string().trim().min(1, 'District cannot be empty').optional(),
  upazila: z
    .string()
    .trim()
    .min(1, 'Upazila/Thana cannot be empty')
    .max(100, 'Upazila/Thana cannot exceed 100 characters')
    .optional(),
  streetAddress: z
    .string()
    .trim()
    .min(3, 'Street address must be at least 3 characters')
    .max(255, 'Street address cannot exceed 255 characters')
    .optional(),
  postalCode: z
    .union([
      z
        .string()
        .trim()
        .regex(/^\d{4}$/, 'Postal code must be exactly 4 digits'),
      z.literal(''),
      z.null(),
    ])
    .transform((val) => (val === '' ? null : val))
    .optional(),
  label: z
    .union([
      z.string().trim().max(50, 'Label cannot exceed 50 characters'),
      z.literal(''),
      z.null(),
    ])
    .transform((val) => (val === '' ? null : val))
    .optional(),
  isDefault: z.boolean().optional(),
});

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export interface AddressOutput {
  id: string;
  recipientName: string;
  phone: string;
  divisionId: string;
  divisionNameEn: string;
  divisionNameBn: string;
  districtId: string;
  districtNameEn: string;
  districtNameBn: string;
  upazila: string;
  streetAddress: string;
  postalCode: string | null;
  label: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressListOutput {
  addresses: AddressOutput[];
  total: number;
  maxQuota: number;
}
