import { z } from 'zod';

export const registerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address')
    .max(254, 'Email cannot exceed 254 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters'),
});

export const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password cannot exceed 128 characters'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterFormInput = z.infer<typeof registerFormSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordFormSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
});

export const resetPasswordFormSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password cannot exceed 128 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ForgotPasswordFormInput = z.infer<typeof forgotPasswordFormSchema>;
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;

export const changePasswordFormSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Current password is required')
      .max(128, 'Password cannot exceed 128 characters'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters long')
      .max(128, 'Password cannot exceed 128 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
    revokeAllSessions: z.boolean().optional(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export type ChangePasswordFormInput = z.infer<typeof changePasswordFormSchema>;

export const resendVerificationFormSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address').optional(),
});

export type ResendVerificationFormInput = z.infer<typeof resendVerificationFormSchema>;

export const BD_PHONE_REGEX = /^(?:01[3-9]\d{8}|\+8801[3-9]\d{8}|8801[3-9]\d{8})$/;

export const profileFormSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(50, 'First name cannot exceed 50 characters'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(50, 'Last name cannot exceed 50 characters'),
  phone: z
    .string()
    .trim()
    .refine((val) => val === '' || BD_PHONE_REGEX.test(val), {
      message:
        'Invalid Bangladesh phone number. Expected 01XXXXXXXXX, +8801XXXXXXXXX, or 8801XXXXXXXXX',
    })
    .optional(),
});

export type ProfileFormInput = z.infer<typeof profileFormSchema>;

/**
 * Builds the profile update request payload from the validated form input.
 * Ensures that empty or whitespace-only phone inputs are strictly converted to null
 * so that the backend explicitly clears the database field.
 */
export function buildProfileUpdatePayload(data: ProfileFormInput): {
  firstName: string;
  lastName: string;
  phone: string | null;
} {
  const trimmedPhone = typeof data.phone === 'string' ? data.phone.trim() : '';
  return {
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    phone: trimmedPhone.length > 0 ? trimmedPhone : null,
  };
}

export const addressFormSchema = z.object({
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
      'Invalid Bangladesh phone number. Expected 01XXXXXXXXX, +8801XXXXXXXXX, or 8801XXXXXXXXX',
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
    .string()
    .trim()
    .refine((val) => val === '' || /^\d{4}$/.test(val), {
      message: 'Postal code must be exactly 4 digits',
    })
    .optional(),
  label: z.string().trim().max(50, 'Label cannot exceed 50 characters').optional(),
  isDefault: z.boolean(),
});

export type AddressFormInput = z.infer<typeof addressFormSchema>;

export function buildCreateAddressPayload(data: AddressFormInput): {
  recipientName: string;
  phone: string;
  divisionId: string;
  districtId: string;
  upazila: string;
  streetAddress: string;
  postalCode: string | null;
  label: string | null;
  isDefault: boolean;
} {
  const trimmedPostalCode = typeof data.postalCode === 'string' ? data.postalCode.trim() : '';
  const trimmedLabel = typeof data.label === 'string' ? data.label.trim() : '';

  return {
    recipientName: data.recipientName.trim(),
    phone: data.phone.trim(),
    divisionId: data.divisionId.trim(),
    districtId: data.districtId.trim(),
    upazila: data.upazila.trim(),
    streetAddress: data.streetAddress.trim(),
    postalCode: trimmedPostalCode.length > 0 ? trimmedPostalCode : null,
    label: trimmedLabel.length > 0 ? trimmedLabel : null,
    isDefault: Boolean(data.isDefault),
  };
}

export function buildUpdateAddressPayload(
  data: AddressFormInput,
  initialAddress: { isDefault: boolean },
): {
  recipientName: string;
  phone: string;
  divisionId: string;
  districtId: string;
  upazila: string;
  streetAddress: string;
  postalCode: string | null;
  label: string | null;
  isDefault?: boolean;
} {
  const trimmedPostalCode = typeof data.postalCode === 'string' ? data.postalCode.trim() : '';
  const trimmedLabel = typeof data.label === 'string' ? data.label.trim() : '';

  const payload: {
    recipientName: string;
    phone: string;
    divisionId: string;
    districtId: string;
    upazila: string;
    streetAddress: string;
    postalCode: string | null;
    label: string | null;
    isDefault?: boolean;
  } = {
    recipientName: data.recipientName.trim(),
    phone: data.phone.trim(),
    divisionId: data.divisionId.trim(),
    districtId: data.districtId.trim(),
    upazila: data.upazila.trim(),
    streetAddress: data.streetAddress.trim(),
    postalCode: trimmedPostalCode.length > 0 ? trimmedPostalCode : null,
    label: trimmedLabel.length > 0 ? trimmedLabel : null,
  };

  // Crucial invariant: If initialAddress was already default, NEVER send isDefault in PATCH payload.
  // The backend forbids unsetting the default address (CANNOT_UNSET_DEFAULT).
  if (!initialAddress.isDefault && data.isDefault === true) {
    payload.isDefault = true;
  }

  return payload;
}

export const setPasswordFormSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password cannot exceed 128 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type SetPasswordFormInput = z.infer<typeof setPasswordFormSchema>;

export const confirmPasswordFormSchema = z.object({
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password cannot exceed 128 characters'),
});

export type ConfirmPasswordFormInput = z.infer<typeof confirmPasswordFormSchema>;

export const confirmLinkFormSchema = z.object({
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password cannot exceed 128 characters'),
});

export type ConfirmLinkFormInput = z.infer<typeof confirmLinkFormSchema>;
