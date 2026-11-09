import { prisma } from '../../lib/prisma.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from '../../lib/errors.js';
import {
  type UpdateProfileInput,
  type CustomerProfileOutput,
  type ProfileDetailsOutput,
  type OAuthProviderListOutput,
  normalizeBdPhone,
} from './account.schemas.js';
import {
  OAUTH_PROVIDER_GOOGLE,
  isAuthenticationFresh,
  DEFAULT_OAUTH_RETURN_URL,
} from '../auth/auth.constants.js';
import { validateSafeReturnUrl } from '../auth/auth.schemas.js';
import {
  generateOAuthState,
  generatePkce,
  encryptGcm,
  generateOpaqueToken,
} from '../../lib/crypto.js';
import { googleOAuthService } from '../auth/google-oauth.service.js';
import { env } from '../../config/env.js';

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

  /**
   * Retrieves linked OAuth providers for the authenticated customer.
   */
  async getOAuthProviders(userId: string): Promise<OAuthProviderListOutput> {
    const accounts = await prisma.oAuthAccount.findMany({
      where: { userId },
      select: { provider: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      providers: accounts.map((a) => ({
        provider: a.provider,
        linkedAt: a.createdAt,
      })),
    };
  }

  /**
   * Initiates Google OAuth account linking for an authenticated user session.
   * Bound to the specific caller sessionId.
   */
  async initiateGoogleOAuthLink(
    userId: string,
    sessionId: string,
    returnUrl?: string,
  ): Promise<{
    authUrl: string;
    statePrefix: string;
    hmac: string;
  }> {
    const existing = await prisma.oAuthAccount.findFirst({
      where: { userId, provider: OAUTH_PROVIDER_GOOGLE },
    });
    if (existing) {
      throw new ConflictError(
        'OAUTH_ALREADY_LINKED',
        'Google account is already linked to this profile',
      );
    }

    const safeReturnUrl = validateSafeReturnUrl(returnUrl, DEFAULT_OAUTH_RETURN_URL);
    const { rawState, statePrefix, stateHash, hmac } = generateOAuthState();
    const nonce = generateOpaqueToken();
    const { codeVerifier, codeChallenge } = generatePkce();

    const encrypted = encryptGcm(codeVerifier, env.OAUTH_ENCRYPTION_SECRET);

    await prisma.oAuthTransaction.create({
      data: {
        stateHash,
        statePrefix,
        nonce,
        encryptedCodeVerifier: encrypted.ciphertext,
        codeVerifierIv: encrypted.iv,
        codeVerifierTag: encrypted.tag,
        action: 'LINK',
        userId,
        sessionId,
        returnUrl: safeReturnUrl,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    const authUrl = googleOAuthService.getAuthorizationUrl({
      state: rawState,
      nonce,
      codeChallenge,
    });

    return {
      authUrl,
      statePrefix,
      hmac,
    };
  }

  /**
   * Unlinks Google OAuth provider from account.
   * Serialized with User -> Session locks, verifying password presence and recent auth.
   */
  async unlinkGoogleOAuth(userId: string, sessionId: string): Promise<{ message: string }> {
    await prisma.$transaction(async (tx) => {
      const txNow = new Date();

      // Step 1: Lock User row
      const users: Array<{ id: string; passwordHash: string | null; status: string }> =
        await tx.$queryRaw`
        SELECT id, "passwordHash", status FROM "User" WHERE id = ${userId} FOR UPDATE
      `;
      const user = users[0];
      if (!user || user.status !== 'ACTIVE') {
        throw new NotFoundError('USER_NOT_FOUND', 'User account not found');
      }

      // Zero Lockout Guarantee
      if (!user.passwordHash) {
        throw new BadRequestError(
          'CANNOT_UNLINK_LAST_AUTH_METHOD',
          'Cannot unlink your only sign-in method. Please set a password first.',
        );
      }

      // Step 2: Lock Session row
      const sessions: Array<{
        id: string;
        revokedAt: Date | null;
        expiresAt: Date;
        reauthenticatedAt: Date | null;
      }> = await tx.$queryRaw`
        SELECT id, "revokedAt", "expiresAt", "reauthenticatedAt" FROM "Session"
        WHERE id = ${sessionId} AND "userId" = ${userId}
        FOR UPDATE
      `;
      const session = sessions[0];
      if (!session || session.revokedAt !== null || session.expiresAt <= txNow) {
        throw new UnauthorizedError(
          'SESSION_REVOKED_OR_EXPIRED',
          'Session has been revoked or expired',
        );
      }

      if (!isAuthenticationFresh(session.reauthenticatedAt, txNow.getTime())) {
        throw new ForbiddenError(
          'REAUTHENTICATION_REQUIRED',
          'Recent authentication is required to perform this action. Please re-authenticate.',
        );
      }

      // Step 3: Locate and delete OAuthAccount
      const account = await tx.oAuthAccount.findFirst({
        where: { userId: user.id, provider: OAUTH_PROVIDER_GOOGLE },
      });
      if (!account) {
        throw new NotFoundError(
          'OAUTH_ACCOUNT_NOT_LINKED',
          'No linked Google account found for this user',
        );
      }

      await tx.oAuthAccount.delete({
        where: { id: account.id },
      });
    });

    return { message: 'Google account unlinked successfully' };
  }
}

export const accountService = new AccountService();
