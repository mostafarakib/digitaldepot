import { prisma } from '../../lib/prisma.js';
import { NotFoundError } from '../../lib/errors.js';
import {
  type UpdateProfileInput,
  type CustomerProfileOutput,
  type ProfileDetailsOutput,
  normalizeBdPhone,
} from './account.schemas.js';

export class AccountService {
  /**
   * Retrieves profile details and account verification status for a customer.
   */
  async getProfile(userId: string): Promise<ProfileDetailsOutput> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', 'User account not found');
    }

    return {
      profile: user.profile
        ? {
            firstName: user.profile.firstName,
            lastName: user.profile.lastName,
            phone: user.profile.phone,
            avatarUrl: user.profile.avatarUrl,
          }
        : null,
      email: user.email,
      emailVerified: user.emailVerified,
    };
  }

  /**
   * Updates customer profile fields.
   * - firstName / lastName: trimmed and updated if provided.
   * - phone:
   *   - undefined (omitted): preserves existing phone number.
   *   - null: explicitly clears existing phone number.
   *   - string: normalized to +8801XXXXXXXXX and stored.
   */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<CustomerProfileOutput> {
    const updateData: { firstName?: string; lastName?: string; phone?: string | null } = {};

    if (input.firstName !== undefined) {
      updateData.firstName = input.firstName;
    }
    if (input.lastName !== undefined) {
      updateData.lastName = input.lastName;
    }
    if (input.phone !== undefined) {
      updateData.phone = input.phone === null ? null : normalizeBdPhone(input.phone);
    }

    const profile = await prisma.customerProfile.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        firstName: input.firstName ?? '',
        lastName: input.lastName ?? '',
        phone:
          input.phone === null || input.phone === undefined ? null : normalizeBdPhone(input.phone),
      },
    });

    return {
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      avatarUrl: profile.avatarUrl,
    };
  }
}

export const accountService = new AccountService();
