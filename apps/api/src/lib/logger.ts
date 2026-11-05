import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

const redactOptions = {
  paths: [
    'req.headers.cookie',
    'req.headers.authorization',
    'headers.cookie',
    'headers.authorization',
    '*.password',
    '*.currentPassword',
    '*.newPassword',
    '*.token',
    '*.refreshToken',
    '*.accessToken',
    '*.csrfToken',
    '*.rawToken',
    'password',
    'token',
    'refreshToken',
  ],
  censor: '[REDACTED]',
};

export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: redactOptions,
  ...(isDevelopment && process.env.NODE_ENV !== 'test'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
