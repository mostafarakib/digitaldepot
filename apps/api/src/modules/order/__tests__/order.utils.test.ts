import { describe, it, expect } from 'vitest';
import {
  generateOrderNumber,
  generateTransactionId,
  generateRandomAlphanumeric,
  formatDatePart,
} from '../order.utils.js';

describe('Order Utils', () => {
  it('generateRandomAlphanumeric produces uppercase alphanumeric strings of expected length', () => {
    const random8 = generateRandomAlphanumeric(8);
    expect(random8).toHaveLength(8);
    expect(random8).toMatch(/^[0-9A-Z]{8}$/);

    const random12 = generateRandomAlphanumeric(12);
    expect(random12).toHaveLength(12);
    expect(random12).toMatch(/^[0-9A-Z]{12}$/);
  });

  it('formatDatePart formats date accurately into UTC YYYYMMDD', () => {
    const fixedDate = new Date('2026-11-15T10:30:00Z');
    expect(formatDatePart(fixedDate)).toBe('20261115');
  });

  it('generateOrderNumber generates valid DD-YYYYMMDD-RANDOM8 format', () => {
    const fixedDate = new Date('2026-11-15T10:30:00Z');
    const orderNumber = generateOrderNumber(fixedDate);

    expect(orderNumber).toMatch(/^DD-20261115-[0-9A-Z]{8}$/);
  });

  it('generateTransactionId generates valid TXN-YYYYMMDD-RANDOM8 format', () => {
    const fixedDate = new Date('2026-11-15T10:30:00Z');
    const transactionId = generateTransactionId(fixedDate);

    expect(transactionId).toMatch(/^TXN-20261115-[0-9A-Z]{8}$/);
  });

  it('generates distinct values across multiple invocations', () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 100; i++) {
      numbers.add(generateOrderNumber());
    }
    expect(numbers.size).toBe(100);
  });
});
