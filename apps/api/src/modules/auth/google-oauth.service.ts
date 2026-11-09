import * as jose from 'jose';
import { env } from '../../config/env.js';
import { BadRequestError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

export interface IGoogleOAuthService {
  getAuthorizationUrl(params: {
    state: string;
    nonce: string;
    codeChallenge: string;
    prompt?: string;
  }): string;
  exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<{ idToken: string; accessToken?: string }>;
  verifyIdToken(idToken: string, expectedNonce: string): Promise<GoogleTokenPayload>;
}

export class GoogleOAuthService implements IGoogleOAuthService {
  private customJwks: jose.JWTVerifyGetKey | null = null;
  private customCodeExchanger:
    | ((code: string, codeVerifier: string) => Promise<{ idToken: string; accessToken?: string }>)
    | null = null;

  /**
   * Sets custom JWKS resolver (used for offline integration testing with local RSA keys)
   */
  public setCustomJwks(keyResolver: jose.JWTVerifyGetKey | null): void {
    this.customJwks = keyResolver;
  }

  /**
   * Sets custom code exchanger (used for offline integration testing)
   */
  public setCustomCodeExchanger(
    exchanger:
      | ((code: string, codeVerifier: string) => Promise<{ idToken: string; accessToken?: string }>)
      | null,
  ): void {
    this.customCodeExchanger = exchanger;
  }

  public getAuthorizationUrl(params: {
    state: string;
    nonce: string;
    codeChallenge: string;
    prompt?: string;
  }): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.GOOGLE_CALLBACK_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', params.state);
    url.searchParams.set('nonce', params.nonce);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('access_type', 'online');
    if (params.prompt) {
      url.searchParams.set('prompt', params.prompt);
    }
    return url.toString();
  }

  public async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<{ idToken: string; accessToken?: string }> {
    if (this.customCodeExchanger) {
      return this.customCodeExchanger(code, codeVerifier);
    }

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const body = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: env.GOOGLE_CALLBACK_URL,
    });

    let res: Response;
    try {
      res = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
    } catch (err) {
      logger.error({ err }, 'Network error during Google code exchange');
      throw new BadRequestError(
        'OAUTH_NETWORK_ERROR',
        'Failed to communicate with Google OAuth server',
      );
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      logger.warn({ status: res.status, errBody }, 'Google OAuth token exchange failed');
      throw new BadRequestError(
        'OAUTH_CODE_EXCHANGE_FAILED',
        'Invalid or expired OAuth authorization code',
      );
    }

    const data = (await res.json()) as {
      id_token?: string;
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!data.id_token) {
      throw new BadRequestError(
        'OAUTH_MISSING_ID_TOKEN',
        'Google OAuth response did not contain an ID token',
      );
    }

    return {
      idToken: data.id_token,
      accessToken: data.access_token,
    };
  }

  public async verifyIdToken(idToken: string, expectedNonce: string): Promise<GoogleTokenPayload> {
    const keyResolver =
      this.customJwks ||
      jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

    let payload: jose.JWTPayload;
    try {
      const result = await jose.jwtVerify(idToken, keyResolver, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: env.GOOGLE_CLIENT_ID,
        algorithms: ['RS256'],
      });
      payload = result.payload;
    } catch (err) {
      logger.warn({ err }, 'Google ID token verification failed');
      throw new BadRequestError('INVALID_ID_TOKEN', 'Invalid Google ID token');
    }

    if (payload['nonce'] !== expectedNonce) {
      logger.warn(
        { expected: expectedNonce, actual: payload['nonce'] },
        'Nonce mismatch in Google ID token',
      );
      throw new BadRequestError('INVALID_ID_TOKEN', 'Invalid Google ID token: nonce mismatch');
    }

    // Explicit aud and azp validation per OIDC Core specification:
    // If aud is an array, azp must be present and equal to configured client ID.
    // If aud is a string, it must match client ID; if azp is present, it must match client ID.
    if (Array.isArray(payload.aud)) {
      if (typeof payload['azp'] !== 'string' || payload['azp'] !== env.GOOGLE_CLIENT_ID) {
        throw new BadRequestError(
          'INVALID_ID_TOKEN',
          'Invalid Google ID token: azp claim required and must match client ID when aud is multi-valued',
        );
      }
    } else if (typeof payload.aud === 'string') {
      if (payload.aud !== env.GOOGLE_CLIENT_ID) {
        throw new BadRequestError('INVALID_ID_TOKEN', 'Invalid Google ID token: audience mismatch');
      }
      if (payload['azp'] !== undefined && payload['azp'] !== env.GOOGLE_CLIENT_ID) {
        throw new BadRequestError(
          'INVALID_ID_TOKEN',
          'Invalid Google ID token: azp claim does not match client ID',
        );
      }
    } else {
      throw new BadRequestError(
        'INVALID_ID_TOKEN',
        'Invalid Google ID token: missing or invalid aud claim',
      );
    }

    // Explicit iat validation: must be a number and not more than 60s in the future (allowing for clock skew)
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof payload.iat !== 'number' || payload.iat > nowSeconds + 60) {
      throw new BadRequestError(
        'INVALID_ID_TOKEN',
        'Invalid Google ID token: iat claim is invalid or future-dated',
      );
    }

    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new BadRequestError(
        'INVALID_ID_TOKEN',
        'Invalid Google ID token: missing subject claim',
      );
    }

    if (!payload['email'] || typeof payload['email'] !== 'string') {
      throw new BadRequestError('INVALID_ID_TOKEN', 'Invalid Google ID token: missing email claim');
    }

    if (payload['email_verified'] !== true) {
      throw new BadRequestError(
        'GOOGLE_EMAIL_UNVERIFIED',
        'Google email must be verified to link or sign in',
      );
    }

    return {
      sub: payload.sub,
      email: payload['email'] as string,
      email_verified: true,
      name: typeof payload['name'] === 'string' ? payload['name'] : undefined,
      picture: typeof payload['picture'] === 'string' ? payload['picture'] : undefined,
    };
  }
}

export const googleOAuthService = new GoogleOAuthService();
