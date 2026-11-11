/**
 * Authoritative shipping configuration for DigitalDepot.
 * All monetary amounts in integer BDT poisha.
 */
export const SHIPPING_CONFIG = {
  INSIDE_DHAKA_FEE: 6000, // ৳60
  OUTSIDE_DHAKA_FEE: 12000, // ৳120
  FREE_SHIPPING_THRESHOLD: 500000, // ৳5,000
  DHAKA_DISTRICT_KEY: 'DHAKA',
} as const;
