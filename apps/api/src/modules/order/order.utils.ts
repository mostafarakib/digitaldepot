import crypto from 'crypto';
import {
  ORDER_NUMBER_PREFIX,
  ORDER_NUMBER_RANDOM_LENGTH,
  TRANSACTION_ID_PREFIX,
  TRANSACTION_ID_RANDOM_LENGTH,
  RETURN_NUMBER_PREFIX,
  RETURN_NUMBER_RANDOM_LENGTH,
  REFUND_NUMBER_PREFIX,
  REFUND_NUMBER_RANDOM_LENGTH,
} from './order.constants.js';

const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generates a cryptographically secure random uppercase alphanumeric string.
 */
export function generateRandomAlphanumeric(length = 8): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ALPHANUMERIC_CHARS[crypto.randomInt(ALPHANUMERIC_CHARS.length)];
  }
  return result;
}

/**
 * Formats a Date into YYYYMMDD string in UTC.
 */
export function formatDatePart(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Generates an authoritative unique order number.
 * Format: DD-YYYYMMDD-RANDOM8 (e.g. DD-20261111-9A7B3C2D)
 */
export function generateOrderNumber(
  date = new Date(),
  randomLength = ORDER_NUMBER_RANDOM_LENGTH,
): string {
  const datePart = formatDatePart(date);
  const randomPart = generateRandomAlphanumeric(randomLength);
  return `${ORDER_NUMBER_PREFIX}-${datePart}-${randomPart}`;
}

/**
 * Generates an internal transaction reference.
 * Format: TXN-YYYYMMDD-RANDOM8 (e.g. TXN-20261111-K38FN2P9)
 */
export function generateTransactionId(
  date = new Date(),
  randomLength = TRANSACTION_ID_RANDOM_LENGTH,
): string {
  const datePart = formatDatePart(date);
  const randomPart = generateRandomAlphanumeric(randomLength);
  return `${TRANSACTION_ID_PREFIX}-${datePart}-${randomPart}`;
}

/**
 * Generates an authoritative unique return number.
 * Format: RET-YYYYMMDD-RANDOM8 (e.g. RET-20261113-9A7B3C2D)
 */
export function generateReturnNumber(
  date = new Date(),
  randomLength = RETURN_NUMBER_RANDOM_LENGTH,
): string {
  const datePart = formatDatePart(date);
  const randomPart = generateRandomAlphanumeric(randomLength);
  return `${RETURN_NUMBER_PREFIX}-${datePart}-${randomPart}`;
}

/**
 * Generates an authoritative unique refund number.
 * Format: REF-YYYYMMDD-RANDOM8 (e.g. REF-20261114-9A7B3C2D)
 */
export function generateRefundNumber(
  date = new Date(),
  randomLength = REFUND_NUMBER_RANDOM_LENGTH,
): string {
  const datePart = formatDatePart(date);
  const randomPart = generateRandomAlphanumeric(randomLength);
  return `${REFUND_NUMBER_PREFIX}-${datePart}-${randomPart}`;
}
