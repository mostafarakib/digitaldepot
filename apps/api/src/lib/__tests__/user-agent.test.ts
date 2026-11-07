import { describe, it, expect } from 'vitest';
import { parseUserAgent, maskIp } from '../user-agent.js';

describe('User-Agent Parser & IP Masking Utility', () => {
  describe('parseUserAgent', () => {
    it('correctly classifies Edge with strict precedence over Chrome and Safari', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.2365.92';
      const parsed = parseUserAgent(ua);
      expect(parsed.browser).toBe('Edge');
      expect(parsed.os).toBe('Windows');
      expect(parsed.deviceType).toBe('desktop');
    });

    it('correctly classifies Opera with strict precedence over Chrome and Safari', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 OPR/107.0.0.0';
      const parsed = parseUserAgent(ua);
      expect(parsed.browser).toBe('Opera');
      expect(parsed.os).toBe('macOS');
      expect(parsed.deviceType).toBe('desktop');
    });

    it('correctly classifies standard Chrome browser', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
      const parsed = parseUserAgent(ua);
      expect(parsed.browser).toBe('Chrome');
      expect(parsed.os).toBe('Windows');
      expect(parsed.deviceType).toBe('desktop');
    });

    it('correctly classifies Firefox on Linux', () => {
      const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0';
      const parsed = parseUserAgent(ua);
      expect(parsed.browser).toBe('Firefox');
      expect(parsed.os).toBe('Linux');
      expect(parsed.deviceType).toBe('desktop');
    });

    it('correctly classifies Safari on macOS without Chrome tokens', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15';
      const parsed = parseUserAgent(ua);
      expect(parsed.browser).toBe('Safari');
      expect(parsed.os).toBe('macOS');
      expect(parsed.deviceType).toBe('desktop');
    });

    it('correctly classifies Mobile Safari on iPhone', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1';
      const parsed = parseUserAgent(ua);
      expect(parsed.browser).toBe('Safari');
      expect(parsed.os).toBe('iOS');
      expect(parsed.deviceType).toBe('mobile');
    });

    it('correctly classifies Chrome on Android Tablet', () => {
      const ua =
        'Mozilla/5.0 (Linux; Android 13; SM-X900; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const parsed = parseUserAgent(ua);
      expect(parsed.browser).toBe('Chrome');
      expect(parsed.os).toBe('Android');
      expect(parsed.deviceType).toBe('tablet');
    });

    it('handles empty or null inputs gracefully', () => {
      expect(parseUserAgent(null)).toEqual({
        browser: 'Other',
        os: 'Other',
        deviceType: 'unknown',
      });
      expect(parseUserAgent('')).toEqual({
        browser: 'Other',
        os: 'Other',
        deviceType: 'unknown',
      });
      expect(parseUserAgent('   ')).toEqual({
        browser: 'Other',
        os: 'Other',
        deviceType: 'unknown',
      });
    });
  });

  describe('maskIp', () => {
    it('masks standard IPv4 address host portion', () => {
      expect(maskIp('203.0.113.195')).toBe('203.0.113.xxx');
      expect(maskIp('192.168.1.1')).toBe('192.168.1.xxx');
      expect(maskIp('127.0.0.1')).toBe('127.0.0.xxx');
      expect(maskIp('  203.0.113.195  ')).toBe('203.0.113.xxx');
    });

    it('masks expanded IPv6 address retaining the routing prefix', () => {
      expect(maskIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:85a3:****');
    });

    it('masks compressed IPv6 addresses accurately expanding hextets', () => {
      expect(maskIp('2001:db8::1')).toBe('2001:db8:0:****');
      expect(maskIp('fe80::1')).toBe('fe80:0:0:****');
      expect(maskIp('  2001:db8::1  ')).toBe('2001:db8:0:****');
    });

    it('handles special IPv6 addresses (loopback and unspecified)', () => {
      expect(maskIp('::1')).toBe('::1');
      expect(maskIp('::')).toBe('::');
    });

    it('masks IPv4-mapped IPv6 addresses', () => {
      expect(maskIp('::ffff:192.0.2.1')).toBe('::ffff:192.0.2.xxx');
      expect(maskIp('0:0:0:0:0:ffff:192.0.2.1')).toBe('::ffff:192.0.2.xxx');
    });

    it('handles empty, null, or malformed inputs safely', () => {
      expect(maskIp(null)).toBe('Unknown');
      expect(maskIp(undefined)).toBe('Unknown');
      expect(maskIp('')).toBe('Unknown');
      expect(maskIp('   ')).toBe('Unknown');
      expect(maskIp('invalid-ip')).toBe('Unknown');
      expect(maskIp('192.168.1')).toBe('Unknown');
      expect(maskIp('192.168.1.999')).toBe('Unknown');
      expect(maskIp('::ffff:999.999.999.999')).toBe('Unknown');
      expect(maskIp('2001:xyz::1')).toBe('Unknown');
    });
  });
});
