import net from 'node:net';

export interface ParsedUserAgent {
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

/**
 * Extracts browser name, OS, and device category from User-Agent without fingerprinting.
 * Strict browser precedence: Edge -> Opera -> Chrome -> Firefox -> Safari -> Other.
 */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua || ua.trim().length === 0) {
    return {
      browser: 'Other',
      os: 'Other',
      deviceType: 'unknown',
    };
  }

  // 1. Browser Detection (Order is critical for Chromium-based variants)
  let browser = 'Other';
  if (/Edg(?:e|A|iOS)?\//i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/Chrome\/|CriOS\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Firefox\/|FxiOS\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari\//i.test(ua) && !/Chrome|CriOS/i.test(ua)) {
    browser = 'Safari';
  }

  // 2. Operating System Detection (check iOS before macOS because iOS UA contains "like Mac OS X")
  let os = 'Other';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    os = 'iOS';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  // 3. Device Type Detection
  let deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'unknown';
  if (/iPad|tablet/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/Mobi|iPhone|iPod/i.test(ua) || (/Android/i.test(ua) && !/tablet/i.test(ua))) {
    deviceType = 'mobile';
  } else if (/Windows|Macintosh|Linux/i.test(ua)) {
    deviceType = 'desktop';
  }

  return { browser, os, deviceType };
}

/**
 * Expands compressed or standard IPv6 representation into its full 8 hextets.
 */
function expandIPv6(ip: string): string[] | null {
  if (!net.isIPv6(ip)) {
    return null;
  }

  const parts = ip.split('::');
  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 0) {
      return null;
    }
    const zeros = new Array(missing).fill('0');
    return [...left, ...zeros, ...right];
  }

  if (parts.length === 1) {
    const hextets = ip.split(':');
    return hextets.length === 8 ? hextets : null;
  }

  return null;
}

/**
 * Masks IPv4 and IPv6 addresses for safe customer-facing display.
 * - IPv4: 203.0.113.195 -> 203.0.113.xxx
 * - IPv6 full: 2001:0db8:85a3:0000:0000:8a2e:0370:7334 -> 2001:0db8:85a3:****
 * - IPv6 compressed: 2001:db8::1 -> 2001:db8:0:****
 * - IPv6 loopback: ::1 -> ::1
 * - IPv6 unspecified: :: -> ::
 * - IPv4-mapped IPv6: ::ffff:192.0.2.1 -> ::ffff:192.0.2.xxx
 */
export function maskIp(ip: string | null | undefined): string {
  if (!ip || typeof ip !== 'string') {
    return 'Unknown';
  }

  const cleanIp = ip.trim();
  if (cleanIp.length === 0) {
    return 'Unknown';
  }

  // Handle IPv4-mapped IPv6 (e.g. ::ffff:192.0.2.1 or 0:0:0:0:0:ffff:192.0.2.1)
  const ipv4MappedMatch = cleanIp.match(
    /^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i,
  );
  if (ipv4MappedMatch) {
    const ipv4 = ipv4MappedMatch[1];
    if (net.isIPv4(ipv4)) {
      const parts = ipv4.split('.');
      return `::ffff:${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
    return 'Unknown';
  }

  const ipType = net.isIP(cleanIp);

  // Standard IPv4
  if (ipType === 4) {
    const parts = cleanIp.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }

  // Standard or compressed IPv6
  if (ipType === 6) {
    if (cleanIp === '::1') {
      return '::1';
    }
    if (cleanIp === '::') {
      return '::';
    }

    const expanded = expandIPv6(cleanIp);
    if (!expanded || expanded.length !== 8) {
      return 'Unknown';
    }

    return `${expanded[0]}:${expanded[1]}:${expanded[2]}:****`;
  }

  return 'Unknown';
}
