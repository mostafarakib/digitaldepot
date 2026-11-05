import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino(
  isDevelopment
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
    : {
        level: 'info',
      },
);
