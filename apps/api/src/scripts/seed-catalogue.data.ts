import type { CreateProductInput } from '../modules/catalogue/catalogue.schemas.js';

export interface SeedCategorySpec {
  name: string;
  slug: string;
  description: string;
  displayOrder: number;
}

export interface SeedBrandSpec {
  name: string;
  slug: string;
  description: string;
  websiteUrl: string;
}

export interface SeedVariantSpec {
  sku: string;
  name: string;
  price: number; // Integer poisha (1 BDT = 100 poisha)
  compareAtPrice?: number | null;
  costPrice?: number | null;
  attributes: Record<string, string>;
  isDefault: boolean;
  initialStock: number;
  lowStockThreshold: number;
}

export interface SeedProductSpec {
  name: string;
  slug: string;
  categorySlug: string;
  brandSlug: string;
  summary: string;
  description: string;
  warranty: string;
  featured: boolean;
  specifications: NonNullable<CreateProductInput['specifications']>;
  imageAltText: string;
  variants: SeedVariantSpec[];
}

export const bdt = (amount: number): number => Math.round(amount * 100);

export const SEED_CATEGORIES: SeedCategorySpec[] = [
  {
    name: 'Smartphones',
    slug: 'smartphones',
    description:
      'Latest 5G flagship and mid-range smartphones with official warranty options in Bangladesh.',
    displayOrder: 1,
  },
  {
    name: 'Laptops',
    slug: 'laptops',
    description:
      'Ultrabooks, creator laptops, and gaming machines for work, study, and performance.',
    displayOrder: 2,
  },
  {
    name: 'Headphones',
    slug: 'headphones',
    description: 'Over-ear wireless active noise-cancelling and studio headphones.',
    displayOrder: 3,
  },
  {
    name: 'Earbuds & Audio',
    slug: 'earbuds-audio',
    description: 'True wireless earbuds and portable Bluetooth speakers for everyday listening.',
    displayOrder: 4,
  },
  {
    name: 'Smartwatches',
    slug: 'smartwatches',
    description: 'Fitness trackers and smartwatches with AMOLED displays and health monitoring.',
    displayOrder: 5,
  },
  {
    name: 'Keyboards',
    slug: 'keyboards',
    description: 'Wireless mechanical and scissor-switch keyboards for coding, typing, and gaming.',
    displayOrder: 6,
  },
  {
    name: 'Mice',
    slug: 'mice',
    description: 'Ergonomic productivity mice and lightweight esports gaming mice.',
    displayOrder: 7,
  },
  {
    name: 'Monitors',
    slug: 'monitors',
    description:
      'IPS office displays, USB-C productivity monitors, and high-refresh gaming monitors.',
    displayOrder: 8,
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    description:
      'GaN fast chargers, high-wattage power banks, portable SSDs, hubs, and Wi-Fi 6 routers.',
    displayOrder: 9,
  },
];

export const SEED_BRANDS: SeedBrandSpec[] = [
  {
    name: 'Apple',
    slug: 'apple',
    description: 'Apple smartphones, MacBooks, wearables, and audio accessories.',
    websiteUrl: 'https://www.apple.com',
  },
  {
    name: 'Samsung',
    slug: 'samsung',
    description: 'Samsung Galaxy smartphones, earbuds, and portable SSD storage.',
    websiteUrl: 'https://www.samsung.com',
  },
  {
    name: 'Xiaomi',
    slug: 'xiaomi',
    description: 'Xiaomi Redmi smartphones, monitors, and smart consumer electronics.',
    websiteUrl: 'https://www.mi.com',
  },
  {
    name: 'ASUS',
    slug: 'asus',
    description: 'ASUS ROG gaming laptops and performance computing hardware.',
    websiteUrl: 'https://www.asus.com',
  },
  {
    name: 'Lenovo',
    slug: 'lenovo',
    description: 'Lenovo ThinkPad business ultrabooks and enterprise computing devices.',
    websiteUrl: 'https://www.lenovo.com',
  },
  {
    name: 'Sony',
    slug: 'sony',
    description: 'Sony flagship wireless noise-cancelling headphones and personal audio.',
    websiteUrl: 'https://www.sony.com',
  },
  {
    name: 'Anker',
    slug: 'anker',
    description: 'Anker power banks, USB-C hubs, and Soundcore wireless audio.',
    websiteUrl: 'https://www.anker.com',
  },
  {
    name: 'JBL',
    slug: 'jbl',
    description: 'JBL portable Bluetooth speakers and consumer audio gear.',
    websiteUrl: 'https://www.jbl.com',
  },
  {
    name: 'Amazfit',
    slug: 'amazfit',
    description: 'Amazfit AMOLED smartwatches and fitness wearables.',
    websiteUrl: 'https://www.amazfit.com',
  },
  {
    name: 'Keychron',
    slug: 'keychron',
    description: 'Keychron QMK/VIA custom wireless mechanical keyboards.',
    websiteUrl: 'https://www.keychron.com',
  },
  {
    name: 'Logitech',
    slug: 'logitech',
    description: 'Logitech MX productivity peripherals and G Series gaming gear.',
    websiteUrl: 'https://www.logitech.com',
  },
  {
    name: 'Razer',
    slug: 'razer',
    description: 'Razer esports gaming mice and precision PC peripherals.',
    websiteUrl: 'https://www.razer.com',
  },
  {
    name: 'LG',
    slug: 'lg',
    description: 'LG UltraGear gaming and Nano IPS computer monitors.',
    websiteUrl: 'https://www.lg.com',
  },
  {
    name: 'Dell',
    slug: 'dell',
    description: 'Dell QHD productivity displays and USB-C workspace monitors.',
    websiteUrl: 'https://www.dell.com',
  },
  {
    name: 'UGREEN',
    slug: 'ugreen',
    description: 'UGREEN Nexode GaN chargers, cables, and desktop charging accessories.',
    websiteUrl: 'https://www.ugreen.com',
  },
  {
    name: 'TP-Link',
    slug: 'tp-link',
    description: 'TP-Link Archer Wi-Fi 6 routers and home networking equipment.',
    websiteUrl: 'https://www.tp-link.com',
  },
];

export const SEED_PRODUCTS: SeedProductSpec[] = [
  // 1. Smartphones
  {
    name: 'Apple iPhone 16 Pro',
    slug: 'apple-iphone-16-pro',
    categorySlug: 'smartphones',
    brandSlug: 'apple',
    summary:
      'Grade 5 titanium flagship smartphone powered by the A18 Pro chip and 4K120 Dolby Vision camera system.',
    description:
      'Built around a lightweight Grade 5 titanium frame, the iPhone 16 Pro pairs a 6.3-inch Super Retina XDR ProMotion display with Apple A18 Pro silicon. Features Camera Control, a 48MP Fusion main sensor, 5x telephoto zoom, and USB-C fast data transfer.',
    warranty: '1 Year International Apple Warranty',
    featured: true,
    imageAltText: 'Apple iPhone 16 Pro series smartphones',
    specifications: [
      { group: 'Display', name: 'Panel', value: '6.3-inch Super Retina XDR OLED, 120Hz ProMotion' },
      { group: 'Performance', name: 'Chipset', value: 'Apple A18 Pro (3nm)' },
      {
        group: 'Camera',
        name: 'Rear Array',
        value: '48MP Fusion + 48MP Ultra Wide + 12MP 5x Telephoto',
      },
      { group: 'Build', name: 'Chassis', value: 'Grade 5 Titanium, Ceramic Shield front, IP68' },
    ],
    variants: [
      {
        sku: 'APL-IP16P-128-NAT',
        name: 'Natural Titanium / 128GB',
        price: bdt(134990),
        compareAtPrice: bdt(142000),
        attributes: { Color: 'Natural Titanium', Storage: '128GB' },
        isDefault: true,
        initialStock: 8,
        lowStockThreshold: 3,
      },
      {
        sku: 'APL-IP16P-256-BLK',
        name: 'Black Titanium / 256GB',
        price: bdt(148990),
        attributes: { Color: 'Black Titanium', Storage: '256GB' },
        isDefault: false,
        initialStock: 5,
        lowStockThreshold: 2,
      },
    ],
  },
  {
    name: 'Samsung Galaxy S24 Ultra',
    slug: 'samsung-galaxy-s24-ultra',
    categorySlug: 'smartphones',
    brandSlug: 'samsung',
    summary:
      'Titanium AI flagship with 6.8-inch QHD+ AMOLED 2X anti-reflective display, S Pen, and 200MP quad camera.',
    description:
      'Engineered with a flat 6.8-inch Dynamic AMOLED 2X panel protected by Gorilla Armor, Galaxy S24 Ultra delivers Snapdragon 8 Gen 3 performance, integrated S Pen precision, and versatile 200MP quad-telephoto imaging.',
    warranty: '1 Year Seller Service Warranty',
    featured: true,
    imageAltText: 'Samsung Galaxy S24 Ultra smartphone',
    specifications: [
      { group: 'Display', name: 'Panel', value: '6.8-inch QHD+ Dynamic AMOLED 2X, 1-120Hz' },
      { group: 'Performance', name: 'Processor', value: 'Snapdragon 8 Gen 3 for Galaxy' },
      {
        group: 'Camera',
        name: 'Rear Array',
        value: '200MP Main + 50MP 5x + 10MP 3x + 12MP Ultra Wide',
      },
      { group: 'Battery', name: 'Capacity', value: '5000mAh with 45W wired charging' },
    ],
    variants: [
      {
        sku: 'SAM-S24U-256-GRY',
        name: 'Titanium Gray / 256GB',
        price: bdt(114990),
        compareAtPrice: bdt(124000),
        attributes: { Color: 'Titanium Gray', Storage: '256GB' },
        isDefault: true,
        initialStock: 10,
        lowStockThreshold: 3,
      },
      {
        sku: 'SAM-S24U-512-BLK',
        name: 'Titanium Black / 512GB',
        price: bdt(129990),
        attributes: { Color: 'Titanium Black', Storage: '512GB' },
        isDefault: false,
        initialStock: 4,
        lowStockThreshold: 2,
      },
    ],
  },
  {
    name: 'Samsung Galaxy A55 5G',
    slug: 'samsung-galaxy-a55-5g',
    categorySlug: 'smartphones',
    brandSlug: 'samsung',
    summary:
      'Mid-range 5G smartphone featuring a metal frame, 120Hz Super AMOLED display, and IP67 water resistance.',
    description:
      'Combining an aluminum frame with Gorilla Glass Victus+ protection, the Galaxy A55 5G runs on Exynos 1480 with a 50MP OIS main camera, stereo speakers, and a reliable 5000mAh battery for all-day use in Bangladesh.',
    warranty: '1 Year Seller Service Warranty',
    featured: false,
    imageAltText: 'Samsung Galaxy A55 5G smartphone',
    specifications: [
      { group: 'Display', name: 'Panel', value: '6.6-inch FHD+ Super AMOLED, 120Hz' },
      { group: 'Performance', name: 'Chipset', value: 'Samsung Exynos 1480 (4nm)' },
      { group: 'Camera', name: 'Main Sensor', value: '50MP OIS + 12MP Ultra Wide + 5MP Macro' },
      { group: 'Durability', name: 'Ingress Rating', value: 'IP67 dust and water resistant' },
    ],
    variants: [
      {
        sku: 'SAM-A55-128-NVY',
        name: 'Awesome Navy / 8GB+128GB',
        price: bdt(39500),
        compareAtPrice: bdt(42500),
        attributes: { Color: 'Awesome Navy', Configuration: '8GB / 128GB' },
        isDefault: true,
        initialStock: 15,
        lowStockThreshold: 5,
      },
      {
        sku: 'SAM-A55-256-ICE',
        name: 'Awesome Iceblue / 8GB+256GB',
        price: bdt(43500),
        attributes: { Color: 'Awesome Iceblue', Configuration: '8GB / 256GB' },
        isDefault: false,
        initialStock: 12,
        lowStockThreshold: 4,
      },
    ],
  },
  {
    name: 'Xiaomi Redmi Note 13 Pro 5G',
    slug: 'xiaomi-redmi-note-13-pro-5g',
    categorySlug: 'smartphones',
    brandSlug: 'xiaomi',
    summary:
      '1.5K 120Hz CrystalRes AMOLED smartphone with 200MP OIS camera and 67W turbo charging.',
    description:
      'Equipped with Snapdragon 7s Gen 2 and a crisp 6.67-inch 1.5K AMOLED panel, the Redmi Note 13 Pro 5G offers 200MP optical image stabilization, Dolby Atmos dual speakers, and a 5100mAh battery that charges rapidly at 67W.',
    warranty: '1 Year Official / Seller Warranty',
    featured: false,
    imageAltText: 'Xiaomi Redmi Note 13 Pro 5G placeholder',
    specifications: [
      { group: 'Display', name: 'Panel', value: '6.67-inch 1.5K AMOLED, 120Hz, 1800 nits peak' },
      { group: 'Performance', name: 'Chipset', value: 'Snapdragon 7s Gen 2 (4nm)' },
      { group: 'Camera', name: 'Main', value: '200MP OIS + 8MP Ultra Wide + 2MP Macro' },
      { group: 'Battery', name: 'Charging', value: '5100mAh with 67W Turbo Charge' },
    ],
    variants: [
      {
        sku: 'XIA-RN13P-256-BLK',
        name: 'Midnight Black / 8GB+256GB',
        price: bdt(29990),
        compareAtPrice: bdt(32990),
        attributes: { Color: 'Midnight Black', Configuration: '8GB / 256GB' },
        isDefault: true,
        initialStock: 18,
        lowStockThreshold: 5,
      },
    ],
  },

  // 2. Laptops
  {
    name: 'Apple MacBook Air 13" M3',
    slug: 'apple-macbook-air-13-m3',
    categorySlug: 'laptops',
    brandSlug: 'apple',
    summary:
      'Ultra-thin fanless laptop with Apple M3 8-core CPU, Liquid Retina display, MagSafe 3, and up to 18-hour battery.',
    description:
      'Designed for silent portability at 1.24 kg, the 13.6-inch MacBook Air with M3 delivers fast single- and multi-core performance, dual external display support with lid closed, Wi-Fi 6E, and a bright 500-nit Liquid Retina screen.',
    warranty: '1 Year International Apple Warranty',
    featured: true,
    imageAltText: 'Apple MacBook Air 13-inch M3 placeholder',
    specifications: [
      {
        group: 'Processor',
        name: 'SoC',
        value: 'Apple M3 (8-core CPU, 8/10-core GPU, 16-core Neural Engine)',
      },
      {
        group: 'Display',
        name: 'Screen',
        value: '13.6-inch Liquid Retina IPS, 2560x1664, 500 nits',
      },
      {
        group: 'Connectivity',
        name: 'Ports',
        value: 'MagSafe 3, 2x Thunderbolt / USB 4, 3.5mm jack',
      },
      { group: 'Battery', name: 'Endurance', value: 'Up to 18 hours Apple TV app movie playback' },
    ],
    variants: [
      {
        sku: 'APL-MBA13M3-8-256-MDN',
        name: 'Midnight / 8GB RAM / 256GB SSD',
        price: bdt(118500),
        compareAtPrice: bdt(125000),
        attributes: { Color: 'Midnight', Memory: '8GB', Storage: '256GB SSD' },
        isDefault: true,
        initialStock: 7,
        lowStockThreshold: 2,
      },
      {
        sku: 'APL-MBA13M3-16-512-STL',
        name: 'Starlight / 16GB RAM / 512GB SSD',
        price: bdt(149500),
        attributes: { Color: 'Starlight', Memory: '16GB', Storage: '512GB SSD' },
        isDefault: false,
        initialStock: 4,
        lowStockThreshold: 2,
      },
    ],
  },
  {
    name: 'ASUS ROG Zephyrus G14 OLED',
    slug: 'asus-rog-zephyrus-g14-oled',
    categorySlug: 'laptops',
    brandSlug: 'asus',
    summary:
      'Compact 14-inch CNC-aluminum creator & gaming laptop with 3K 120Hz ROG Nebula OLED and RTX 4060.',
    description:
      'Machined from solid aluminum and weighing just 1.5 kg, the ROG Zephyrus G14 combines a Pantone-validated 3K 120Hz OLED screen with Ryzen 9 processing and NVIDIA GeForce RTX 4060 graphics for AAA gaming and creative workflows.',
    warranty: '2 Years Official ASUS Bangladesh Warranty',
    featured: false,
    imageAltText: 'ASUS ROG Zephyrus G14 laptop',
    specifications: [
      { group: 'Processor', name: 'CPU', value: 'AMD Ryzen 9 8945HS' },
      { group: 'Graphics', name: 'GPU', value: 'NVIDIA GeForce RTX 4060 8GB GDDR6' },
      { group: 'Display', name: 'Panel', value: '14-inch 3K (2880x1800) OLED 120Hz G-SYNC' },
      { group: 'Memory & Storage', name: 'Config', value: '16GB LPDDR5X / 1TB PCIe 4.0 NVMe SSD' },
    ],
    variants: [
      {
        sku: 'ASU-G14OLED-16-1TB',
        name: 'Eclipse Gray / 16GB / 1TB / RTX 4060',
        price: bdt(189000),
        attributes: { Color: 'Eclipse Gray', Configuration: '16GB / 1TB / RTX 4060' },
        isDefault: true,
        initialStock: 3,
        lowStockThreshold: 5,
      },
    ],
  },
  {
    name: 'Lenovo ThinkPad X1 Carbon Gen 12',
    slug: 'lenovo-thinkpad-x1-carbon-gen-12',
    categorySlug: 'laptops',
    brandSlug: 'lenovo',
    summary:
      'Flagship 1.09 kg carbon-fiber business ultrabook with Intel Core Ultra 7 and legendary ThinkPad keyboard.',
    description:
      'Built to MIL-STD-810H durability standards in carbon-fiber weave, the ThinkPad X1 Carbon Gen 12 packs Intel Core Ultra 7 efficiency, Thunderbolt 4 connectivity, enterprise TPM 2.0 security, and crisp anti-glare WUXGA visuals.',
    warranty: '3 Years Official Lenovo Warranty',
    featured: false,
    imageAltText: 'Lenovo ThinkPad X1 Carbon Gen 12 placeholder',
    specifications: [
      { group: 'Processor', name: 'CPU', value: 'Intel Core Ultra 7 155U' },
      {
        group: 'Display',
        name: 'Panel',
        value: '14-inch WUXGA (1920x1200) Anti-Glare IPS 400 nits',
      },
      { group: 'Memory & Storage', name: 'Config', value: '16GB LPDDR5x / 512GB PCIe Gen 4 SSD' },
      { group: 'Weight', name: 'Chassis', value: 'Starting at 1.09 kg carbon-fiber reinforced' },
    ],
    variants: [
      {
        sku: 'LEN-X1CG12-16-512',
        name: 'Deep Black / 16GB / 512GB SSD',
        price: bdt(195000),
        attributes: { Color: 'Deep Black', Configuration: '16GB / 512GB SSD' },
        isDefault: true,
        initialStock: 5,
        lowStockThreshold: 2,
      },
    ],
  },

  // 3. Headphones
  {
    name: 'Sony WH-1000XM5 Wireless ANC',
    slug: 'sony-wh-1000xm5',
    categorySlug: 'headphones',
    brandSlug: 'sony',
    summary:
      'Industry-leading wireless noise-cancelling headphones with 8 microphones, LDAC Hi-Res audio, and 30-hour battery.',
    description:
      'Powered by dual processors controlling eight microphones, the Sony WH-1000XM5 suppresses city traffic and office chatter effortlessly while delivering rich 30mm driver sound, multipoint Bluetooth, and crystal-clear call quality.',
    warranty: '1 Year Service Warranty',
    featured: true,
    imageAltText: 'Sony WH-1000XM5 Wireless ANC placeholder',
    specifications: [
      { group: 'Audio', name: 'Drivers & Codecs', value: '30mm dynamic drivers, SBC, AAC, LDAC' },
      {
        group: 'Noise Control',
        name: 'ANC Tech',
        value: 'Integrated Processor V1 + HD QN1, 8 mics',
      },
      {
        group: 'Battery',
        name: 'Playback',
        value: 'Up to 30 hours ANC On, 3-min quick charge = 3 hrs',
      },
      { group: 'Connectivity', name: 'Wireless', value: 'Bluetooth 5.2 with Multipoint pairing' },
    ],
    variants: [
      {
        sku: 'SNY-XM5-BLK',
        name: 'Black',
        price: bdt(29500),
        compareAtPrice: bdt(32500),
        attributes: { Color: 'Black' },
        isDefault: true,
        initialStock: 12,
        lowStockThreshold: 4,
      },
      {
        sku: 'SNY-XM5-SLV',
        name: 'Platinum Silver',
        price: bdt(29500),
        compareAtPrice: bdt(32500),
        attributes: { Color: 'Platinum Silver' },
        isDefault: false,
        initialStock: 8,
        lowStockThreshold: 4,
      },
    ],
  },
  {
    name: 'Anker Soundcore Space One ANC',
    slug: 'anker-soundcore-space-one',
    categorySlug: 'headphones',
    brandSlug: 'anker',
    summary:
      'Value-packed wireless ANC headphones with adaptive noise cancelling, LDAC support, and 40-hour ANC battery.',
    description:
      'Engineered to isolate vocal frequencies and commute noise, the Soundcore Space One features custom 40mm dynamic drivers, HearID personalized EQ, plush rotating earcups, and 40 hours of playback with ANC enabled.',
    warranty: '18 Months Official Anker Warranty',
    featured: false,
    imageAltText: 'Anker Soundcore Space One wireless headphones',
    specifications: [
      { group: 'Audio', name: 'Drivers', value: '40mm dynamic drivers with Hi-Res LDAC' },
      { group: 'Battery', name: 'Life', value: '40 hours (ANC On) / 55 hours (ANC Off)' },
      {
        group: 'Connectivity',
        name: 'Bluetooth',
        value: 'Bluetooth 5.3 + 3.5mm AUX cable included',
      },
    ],
    variants: [
      {
        sku: 'ANK-SP1-BLK',
        name: 'Midnight Black',
        price: bdt(9990),
        compareAtPrice: bdt(11500),
        attributes: { Color: 'Midnight Black' },
        isDefault: true,
        initialStock: 20,
        lowStockThreshold: 5,
      },
    ],
  },

  // 4. Earbuds & Audio
  {
    name: 'Apple AirPods Pro (2nd Gen, USB-C)',
    slug: 'apple-airpods-pro-2',
    categorySlug: 'earbuds-audio',
    brandSlug: 'apple',
    summary:
      'H2-powered active noise-cancelling earbuds with Adaptive Audio, MagSafe USB-C case, and IP54 durability.',
    description:
      'Featuring the Apple H2 chip, AirPods Pro (2nd Gen, USB-C) combine Pro-level Active Noise Cancellation with Transparency and Conversation Awareness. The MagSafe charging case supports Precision Finding and USB-C charging.',
    warranty: '1 Year International Apple Warranty',
    featured: true,
    imageAltText: 'Apple AirPods Pro 2nd generation earbuds and case',
    specifications: [
      {
        group: 'Chipset',
        name: 'Audio Silicon',
        value: 'Apple H2 headphone chip, U1 in MagSafe Case',
      },
      {
        group: 'Durability',
        name: 'Rating',
        value: 'IP54 dust, sweat, and water resistant (buds & case)',
      },
      { group: 'Battery', name: 'Playback', value: 'Up to 6 hrs listening (30 hrs with case)' },
    ],
    variants: [
      {
        sku: 'APL-APP2-USBC',
        name: 'White / USB-C Case',
        price: bdt(23500),
        compareAtPrice: bdt(25990),
        attributes: { Color: 'White', Case: 'MagSafe USB-C' },
        isDefault: true,
        initialStock: 16,
        lowStockThreshold: 5,
      },
    ],
  },
  {
    name: 'Samsung Galaxy Buds3 Pro',
    slug: 'samsung-galaxy-buds3-pro',
    categorySlug: 'earbuds-audio',
    brandSlug: 'samsung',
    summary:
      'Dual-amp planar/dynamic 2-way earbuds with Blade Lights, Adaptive ANC, and 24-bit Hi-Fi Samsung Seamless Codec.',
    description:
      'Redesigned with an ergonomic blade stem, Galaxy Buds3 Pro pack dual amplifiers driving a woofer and planar tweeter for balanced studio detail, AI-assisted Adaptive Noise Control, and IP57 water resistance.',
    warranty: '1 Year Seller Service Warranty',
    featured: false,
    imageAltText: 'Samsung Galaxy Buds3 Pro placeholder',
    specifications: [
      {
        group: 'Audio',
        name: 'Drivers',
        value: '2-Way Enhanced Speaker (10.5mm Dynamic + 6.1mm Planar)',
      },
      { group: 'Durability', name: 'Rating', value: 'IP57 water and dust resistant (earbuds)' },
      { group: 'Connectivity', name: 'Bluetooth', value: 'Bluetooth 5.4, 24-bit/96kHz SSC UHQ' },
    ],
    variants: [
      {
        sku: 'SAM-BUDS3P-SLV',
        name: 'Silver',
        price: bdt(15500),
        compareAtPrice: bdt(17500),
        attributes: { Color: 'Silver' },
        isDefault: true,
        initialStock: 14,
        lowStockThreshold: 4,
      },
      {
        sku: 'SAM-BUDS3P-WHT',
        name: 'White',
        price: bdt(15500),
        attributes: { Color: 'White' },
        isDefault: false,
        initialStock: 9,
        lowStockThreshold: 4,
      },
    ],
  },
  {
    name: 'Anker Soundcore R50i NC',
    slug: 'anker-soundcore-r50i-nc',
    categorySlug: 'earbuds-audio',
    brandSlug: 'anker',
    summary:
      'Budget-friendly 42dB ANC true wireless earbuds with 10mm drivers, phone-stand case, and 45-hour total playback.',
    description:
      'Anker Soundcore R50i NC delivers punchy bass through 10mm drivers, adaptive noise cancellation up to 42dB, 4-mic AI call clarity, and a clever charging case with an integrated smartphone stand.',
    warranty: '18 Months Official Anker Warranty',
    featured: false,
    imageAltText: 'Anker Soundcore R50i NC placeholder',
    specifications: [
      { group: 'Noise Control', name: 'ANC', value: 'Adaptive ANC up to 42dB' },
      { group: 'Battery', name: 'Playback', value: '10 hrs single charge / 45 hrs with case' },
      { group: 'Durability', name: 'Water Resistance', value: 'IP54' },
    ],
    variants: [
      {
        sku: 'ANK-R50INC-BLK',
        name: 'Black',
        price: bdt(2290),
        compareAtPrice: bdt(2690),
        attributes: { Color: 'Black' },
        isDefault: true,
        initialStock: 35,
        lowStockThreshold: 8,
      },
    ],
  },
  {
    name: 'JBL Flip 6 Portable Speaker',
    slug: 'jbl-flip-6',
    categorySlug: 'earbuds-audio',
    brandSlug: 'jbl',
    summary:
      'Rugged IP67 waterproof & dustproof portable Bluetooth speaker with 2-way acoustics and 12-hour battery.',
    description:
      'Built for travel, rooftop gatherings, and outdoor trips, the JBL Flip 6 pairs a racetrack woofer with a separate tweeter and dual passive radiators for crisp highs and deep bass in a compact IP67 enclosure.',
    warranty: '1 Year Brand Warranty',
    featured: false,
    imageAltText: 'JBL Flip 6 Portable Speaker placeholder',
    specifications: [
      { group: 'Audio', name: 'Output Power', value: '20W RMS woofer + 10W RMS tweeter' },
      { group: 'Durability', name: 'Ingress Rating', value: 'IP67 waterproof & dustproof' },
      {
        group: 'Battery',
        name: 'Playtime',
        value: 'Up to 12 hours via USB-C rechargeable battery',
      },
    ],
    variants: [
      {
        sku: 'JBL-FLIP6-BLK',
        name: 'Black',
        price: bdt(11200),
        compareAtPrice: bdt(12500),
        attributes: { Color: 'Black' },
        isDefault: true,
        initialStock: 11,
        lowStockThreshold: 4,
      },
      {
        sku: 'JBL-FLIP6-SQD',
        name: 'Squad Camo',
        price: bdt(11200),
        attributes: { Color: 'Squad Camo' },
        isDefault: false,
        initialStock: 6,
        lowStockThreshold: 3,
      },
    ],
  },

  // 5. Smartwatches
  {
    name: 'Apple Watch Series 10 GPS 46mm',
    slug: 'apple-watch-series-10',
    categorySlug: 'smartwatches',
    brandSlug: 'apple',
    summary:
      'Thinnest Apple Watch with wide-angle OLED display, S10 SiP, ECG, depth sensor, and fast 30-min charging.',
    description:
      'Apple Watch Series 10 46mm features an expansive wide-angle OLED Retina display in a sleek aluminum chassis, powered by the S10 SiP with sleep apnea notifications, ECG, water temperature tracking, and fast charging.',
    warranty: '1 Year International Apple Warranty',
    featured: true,
    imageAltText: 'Apple Watch Series 10 smartwatch',
    specifications: [
      { group: 'Display', name: 'Screen', value: '46mm Wide-angle LTPO3 OLED, up to 2000 nits' },
      {
        group: 'Sensors',
        name: 'Health',
        value: 'Optical & Electrical Heart, Blood Oxygen, Skin Temp',
      },
      {
        group: 'Durability',
        name: 'Water Resistance',
        value: '50m swimproof + IP6X dust resistance',
      },
    ],
    variants: [
      {
        sku: 'APL-AWS10-46-JB',
        name: 'Jet Black Aluminum / 46mm GPS',
        price: bdt(46500),
        compareAtPrice: bdt(49500),
        attributes: { Color: 'Jet Black', Size: '46mm', Connectivity: 'GPS' },
        isDefault: true,
        initialStock: 6,
        lowStockThreshold: 2,
      },
    ],
  },
  {
    name: 'Amazfit GTS 4 Smartwatch',
    slug: 'amazfit-gts-4',
    categorySlug: 'smartwatches',
    brandSlug: 'amazfit',
    summary:
      'Ultra-slim 1.75-inch HD AMOLED smartwatch with dual-band GPS, Bluetooth calling, and 8-day battery life.',
    description:
      'Combining a 9.9mm aluminum middle frame with dual-band circularly polarized GPS antenna tracking, Amazfit GTS 4 monitors 150+ sports modes, continuous heart rate, SpO2, and Bluetooth phone calls on one bright AMOLED screen.',
    warranty: '1 Year Official Amazfit Warranty',
    featured: false,
    imageAltText: 'Amazfit GTS 4 Smartwatch placeholder',
    specifications: [
      { group: 'Display', name: 'Panel', value: '1.75-inch AMOLED, 390x450 resolution (341 PPI)' },
      { group: 'Navigation', name: 'GPS', value: 'Dual-band & 6 satellite positioning systems' },
      { group: 'Battery', name: 'Endurance', value: 'Up to 8 days typical usage (300mAh)' },
    ],
    variants: [
      {
        sku: 'AMZ-GTS4-BLK',
        name: 'Infinite Black',
        price: bdt(17900),
        compareAtPrice: bdt(19500),
        attributes: { Color: 'Infinite Black' },
        isDefault: true,
        initialStock: 10,
        lowStockThreshold: 3,
      },
    ],
  },

  // 6. Keyboards
  {
    name: 'Keychron K2 Pro QMK/VIA Wireless',
    slug: 'keychron-k2-pro',
    categorySlug: 'keyboards',
    brandSlug: 'keychron',
    summary:
      '75% compact hot-swappable Bluetooth & wired mechanical keyboard with PBT keycaps and QMK/VIA programmability.',
    description:
      'Built for Mac, Windows, and Linux power users, the Keychron K2 Pro offers full QMK/VIA key remapping, sound-absorbing foam, double-shot OSA PBT keycaps, hot-swappable PCB sockets, and up to 3-device Bluetooth 5.1 switching.',
    warranty: '1 Year Keychron Official Warranty',
    featured: true,
    imageAltText: 'Keychron K2 Pro Wireless Mechanical Keyboard placeholder',
    specifications: [
      { group: 'Layout', name: 'Form Factor', value: '75% Compact (84 Keys)' },
      {
        group: 'Customization',
        name: 'Firmware & PCB',
        value: 'QMK / VIA programmable, 5-pin Hot-swappable',
      },
      { group: 'Connectivity', name: 'Modes', value: 'Bluetooth 5.1 (3 devices) & USB-C Wired' },
      { group: 'Battery', name: 'Capacity', value: '4000mAh rechargeable Li-po' },
    ],
    variants: [
      {
        sku: 'KEY-K2PRO-RED',
        name: 'Keychron K Pro Red (Linear)',
        price: bdt(13200),
        compareAtPrice: bdt(14200),
        attributes: { Switch: 'K Pro Red', Frame: 'Aluminum' },
        isDefault: true,
        initialStock: 12,
        lowStockThreshold: 4,
      },
      {
        sku: 'KEY-K2PRO-BRN',
        name: 'Keychron K Pro Brown (Tactile)',
        price: bdt(13200),
        attributes: { Switch: 'K Pro Brown', Frame: 'Aluminum' },
        isDefault: false,
        initialStock: 10,
        lowStockThreshold: 4,
      },
    ],
  },
  {
    name: 'Logitech MX Keys S Wireless',
    slug: 'logitech-mx-keys-s',
    categorySlug: 'keyboards',
    brandSlug: 'logitech',
    summary:
      'Low-profile illuminated scissor-switch wireless keyboard with Smart Actions and 3-device Easy-Switch.',
    description:
      'Crafted with spherically dished Perfect Stroke keys for quiet, precise typing, Logitech MX Keys S pairs with up to three laptops or tablets via Bluetooth Low Energy or Logi Bolt and features proximity-sensing smart backlighting.',
    warranty: '1 Year Logitech Official Warranty',
    featured: false,
    imageAltText: 'Logitech MX Keys S Wireless Keyboard placeholder',
    specifications: [
      {
        group: 'Switches',
        name: 'Key Type',
        value: 'Perfect Stroke Scissor Keys, smart backlighting',
      },
      {
        group: 'Connectivity',
        name: 'Wireless',
        value: 'Bluetooth Low Energy & Logi Bolt USB Receiver',
      },
      { group: 'Battery', name: 'Charging', value: 'USB-C rechargeable (up to 10 days backlit)' },
    ],
    variants: [
      {
        sku: 'LOG-MXKEYSS-GRP',
        name: 'Graphite',
        price: bdt(12800),
        attributes: { Color: 'Graphite' },
        isDefault: true,
        initialStock: 9,
        lowStockThreshold: 3,
      },
    ],
  },

  // 7. Mice
  {
    name: 'Logitech MX Master 3S',
    slug: 'logitech-mx-master-3s',
    categorySlug: 'mice',
    brandSlug: 'logitech',
    summary:
      'Ergonomic flagship productivity mouse with 8000 DPI Darkfield glass tracking, MagSpeed wheel, and quiet clicks.',
    description:
      'Designed for developers, designers, and analysts, Logitech MX Master 3S tracks even on clear glass at 8000 DPI, reduces click noise by 90%, and features an electromagnetic MagSpeed wheel capable of scrolling 1,000 lines per second.',
    warranty: '1 Year Logitech Official Warranty',
    featured: true,
    imageAltText: 'Logitech MX Master 3S wireless mouse',
    specifications: [
      {
        group: 'Sensor',
        name: 'Tracking',
        value: '8000 DPI Darkfield optical sensor (tracks on glass)',
      },
      {
        group: 'Scrolling',
        name: 'Wheel',
        value: 'MagSpeed electromagnetic ratchet/free-spin + thumb wheel',
      },
      {
        group: 'Connectivity',
        name: 'Wireless',
        value: 'Logi Bolt USB Receiver + Bluetooth (3 hosts)',
      },
    ],
    variants: [
      {
        sku: 'LOG-MXM3S-GRP',
        name: 'Graphite',
        price: bdt(11900),
        compareAtPrice: bdt(12900),
        attributes: { Color: 'Graphite' },
        isDefault: true,
        initialStock: 15,
        lowStockThreshold: 5,
      },
    ],
  },
  {
    name: 'Logitech G Pro X Superlight 2',
    slug: 'logitech-g-pro-x-superlight-2',
    categorySlug: 'mice',
    brandSlug: 'logitech',
    summary:
      '60g tournament wireless esports mouse with Lightforce hybrid switches and HERO 2 32K sensor.',
    description:
      'Co-engineered with pro esports players, the 60-gram G Pro X Superlight 2 delivers crisp optical-mechanical Lightforce clicks, HERO 2 zero-smoothing precision, LIGHTSPEED wireless with up to 4K/8K polling, and 95-hour battery life.',
    warranty: '2 Years Logitech Gaming Warranty',
    featured: false,
    imageAltText: 'Logitech G Pro X Superlight 2 gaming mouse',
    specifications: [
      { group: 'Sensor', name: 'Optical', value: 'HERO 2 Sensor (100 - 32,000 DPI, >500 IPS)' },
      { group: 'Weight', name: 'Mass', value: '60g ultralight wireless chassis' },
      { group: 'Switches', name: 'Buttons', value: 'LIGHTFORCE Hybrid Optical-Mechanical' },
    ],
    variants: [
      {
        sku: 'LOG-GPXS2-BLK',
        name: 'Black',
        price: bdt(16900),
        attributes: { Color: 'Black' },
        isDefault: true,
        initialStock: 8,
        lowStockThreshold: 3,
      },
      {
        sku: 'LOG-GPXS2-WHT',
        name: 'White',
        price: bdt(16900),
        attributes: { Color: 'White' },
        isDefault: false,
        initialStock: 4,
        lowStockThreshold: 2,
      },
    ],
  },
  {
    name: 'Razer DeathAdder V3 Wired',
    slug: 'razer-deathadder-v3',
    categorySlug: 'mice',
    brandSlug: 'razer',
    summary:
      '59g ultra-lightweight ergonomic wired gaming mouse with Focus Pro 30K optical sensor and 8000Hz HyperPolling.',
    description:
      'Refined for competitive FPS precision, the wired Razer DeathAdder V3 weighs just 59 grams while offering native 8000Hz HyperPolling responsiveness, Gen-3 optical switches rated for 90 million clicks, and a flexible Speedflex cable.',
    warranty: '2 Years Razer Official Warranty',
    featured: false,
    imageAltText: 'Razer DeathAdder V3 Wired placeholder',
    specifications: [
      { group: 'Sensor', name: 'Optical', value: 'Razer Focus Pro 30K Optical Sensor' },
      {
        group: 'Polling Rate',
        name: 'Speed',
        value: 'Up to 8000 Hz HyperPolling via Speedflex cable',
      },
      { group: 'Weight', name: 'Mass', value: '59g (excluding cable)' },
    ],
    variants: [
      {
        sku: 'RZR-DAV3-BLK',
        name: 'Black',
        price: bdt(8400),
        compareAtPrice: bdt(9200),
        attributes: { Color: 'Black' },
        isDefault: true,
        initialStock: 14,
        lowStockThreshold: 4,
      },
    ],
  },

  // 8. Monitors
  {
    name: 'LG UltraGear 27GP850-B 27" QHD',
    slug: 'lg-ultragear-27gp850-b',
    categorySlug: 'monitors',
    brandSlug: 'lg',
    summary:
      '27-inch 2560x1440 Nano IPS 165Hz (OC 180Hz) gaming monitor with 1ms GtG response and G-SYNC compatibility.',
    description:
      'Combining 98% DCI-P3 color gamut coverage with blistering 1ms gray-to-gray Nano IPS speed, the LG UltraGear 27GP850-B delivers sharp QHD clarity, DisplayHDR 400 support, and an ergonomic pivot/height stand.',
    warranty: '3 Years Official LG Monitor Warranty',
    featured: false,
    imageAltText: 'LG UltraGear 27GP850-B QHD Monitor placeholder',
    specifications: [
      { group: 'Display', name: 'Size & Resolution', value: '27-inch QHD (2560x1440) Nano IPS' },
      { group: 'Motion', name: 'Refresh & Response', value: '165Hz (OC 180Hz), 1ms GtG' },
      {
        group: 'Sync & Color',
        name: 'Features',
        value: 'G-SYNC Compatible, FreeSync Premium, 98% DCI-P3',
      },
    ],
    variants: [
      {
        sku: 'LG-27GP850B-STD',
        name: '27" QHD 165Hz Nano IPS',
        price: bdt(66000),
        attributes: { Size: '27-inch', Panel: 'Nano IPS QHD' },
        isDefault: true,
        initialStock: 4,
        lowStockThreshold: 5,
      },
    ],
  },
  {
    name: 'Dell S2722DC 27" QHD USB-C',
    slug: 'dell-s2722dc',
    categorySlug: 'monitors',
    brandSlug: 'dell',
    summary:
      '27-inch QHD IPS productivity display with single-cable 65W USB-C power delivery, USB hub, and built-in speakers.',
    description:
      'Declutter your desk with single-cable USB-C video, data, and 65W laptop charging. The Dell S2722DC pairs crisp 2560x1440 IPS visuals and 99% sRGB color with ComfortView Plus hardware low-blue-light protection.',
    warranty: '3 Years Official Dell Warranty',
    featured: false,
    imageAltText: 'Dell S2722DC QHD USB-C Monitor placeholder',
    specifications: [
      { group: 'Display', name: 'Panel', value: '27-inch QHD (2560x1440) IPS, 75Hz, 99% sRGB' },
      {
        group: 'Connectivity',
        name: 'Ports',
        value: 'USB-C (65W PD), 2x HDMI 1.4, 2x USB 3.2 Gen 1',
      },
      { group: 'Ergonomics', name: 'Stand', value: 'Height, Tilt, Swivel, Pivot adjustable' },
    ],
    variants: [
      {
        sku: 'DEL-S2722DC-QHD',
        name: '27" QHD USB-C',
        price: bdt(33500),
        compareAtPrice: bdt(36000),
        attributes: { Size: '27-inch', Connectivity: 'USB-C 65W PD' },
        isDefault: true,
        initialStock: 6,
        lowStockThreshold: 3,
      },
    ],
  },
  {
    name: 'Xiaomi Monitor A24i 23.8" 100Hz',
    slug: 'xiaomi-monitor-a24i',
    categorySlug: 'monitors',
    brandSlug: 'xiaomi',
    summary:
      'Ultra-slim 23.8-inch Full HD IPS monitor with smooth 100Hz refresh rate and ΔE<2 factory color calibration.',
    description:
      'Measuring just 7.5mm at its slimmest edge, the Xiaomi Monitor A24i brings smooth 100Hz scrolling, three-side narrow bezels, and factory-calibrated 99% sRGB accuracy to everyday home and office desks at an accessible price.',
    warranty: '1 Year Xiaomi Warranty',
    featured: false,
    imageAltText: 'Xiaomi Monitor A24i 23.8-inch IPS Monitor placeholder',
    specifications: [
      { group: 'Display', name: 'Panel', value: '23.8-inch FHD (1920x1080) IPS, 100Hz' },
      { group: 'Color', name: 'Calibration', value: '99% sRGB, ΔE < 2, 8-bit color depth' },
      { group: 'Connectivity', name: 'Inputs', value: 'DisplayPort 1.4, HDMI 2.0' },
    ],
    variants: [
      {
        sku: 'XIA-MON-A24I',
        name: '23.8" FHD 100Hz IPS',
        price: bdt(12900),
        compareAtPrice: bdt(13900),
        attributes: { Size: '23.8-inch', RefreshRate: '100Hz' },
        isDefault: true,
        initialStock: 12,
        lowStockThreshold: 4,
      },
    ],
  },

  // 9. Accessories
  {
    name: 'Samsung T7 Shield 1TB Portable SSD',
    slug: 'samsung-t7-shield-1tb',
    categorySlug: 'accessories',
    brandSlug: 'samsung',
    summary:
      'Rugged IP65 water- and dust-resistant NVMe external SSD delivering up to 1,050 MB/s read speeds.',
    description:
      'Built for field creators and professionals, Samsung T7 Shield wraps NVMe USB 3.2 Gen 2 performance inside a shock-absorbing rubberized exterior rated for 3-meter drops and IP65 water/dust resistance.',
    warranty: '3 Years Samsung SSD Warranty',
    featured: false,
    imageAltText: 'Samsung T7 Shield rugged portable SSD',
    specifications: [
      { group: 'Storage', name: 'Capacity & Interface', value: '1TB, USB 3.2 Gen 2 (10Gbps)' },
      { group: 'Speed', name: 'Throughput', value: 'Up to 1,050 MB/s Read, 1,000 MB/s Write' },
      {
        group: 'Durability',
        name: 'Protection',
        value: 'IP65 water/dust + 3-meter drop resistance',
      },
    ],
    variants: [
      {
        sku: 'SAM-T7SHD-1TB-BLK',
        name: 'Black / 1TB',
        price: bdt(14400),
        compareAtPrice: bdt(15500),
        attributes: { Color: 'Black', Capacity: '1TB' },
        isDefault: true,
        initialStock: 16,
        lowStockThreshold: 5,
      },
    ],
  },
  {
    name: 'Anker 737 Power Bank (24K, 140W)',
    slug: 'anker-737-power-bank',
    categorySlug: 'accessories',
    brandSlug: 'anker',
    summary:
      '24,000mAh 140W PD 3.1 bi-directional fast-charging power bank with real-time smart digital display.',
    description:
      'Capable of fast-charging laptops, tablets, and phones simultaneously via two USB-C and one USB-A port, the Anker 737 PowerCore 24K delivers 140W USB-C Power Delivery 3.1 and displays real-time wattage on a crisp OLED readout.',
    warranty: '18 Months Official Anker Warranty',
    featured: false,
    imageAltText: 'Anker 737 Power Bank 24000mAh 140W placeholder',
    specifications: [
      { group: 'Power', name: 'Capacity', value: '24,000mAh (86.4Wh, airline carry-on compliant)' },
      { group: 'Output', name: 'Ports', value: '2x USB-C (up to 140W PD 3.1) + 1x USB-A (18W)' },
      {
        group: 'Monitoring',
        name: 'Display',
        value: 'Smart digital screen for wattage, battery %, ETA',
      },
    ],
    variants: [
      {
        sku: 'ANK-737-24K-140W',
        name: 'Black / 24,000mAh 140W',
        price: bdt(15900),
        attributes: { Color: 'Black', Capacity: '24,000mAh' },
        isDefault: true,
        initialStock: 0, // Realistic out-of-stock case for testing storefront stock state
        lowStockThreshold: 4,
      },
    ],
  },
  {
    name: 'UGREEN Nexode 65W 3-Port GaN Charger',
    slug: 'ugreen-nexode-65w-gan-charger',
    categorySlug: 'accessories',
    brandSlug: 'ugreen',
    summary:
      'Compact 3-port GaN II fast wall charger (2x USB-C, 1x USB-A) supporting 65W laptop and 45W Samsung PPS charging.',
    description:
      'Powered by GaN II technology, the UGREEN Nexode 65W replaces bulky laptop bricks with a pocket-sized 3-port charger capable of powering a MacBook Air, iPhone, and earbuds concurrently with intelligent Thermal Guard protection.',
    warranty: '1 Year Official UGREEN Warranty',
    featured: false,
    imageAltText: 'UGREEN Nexode 65W 3-Port GaN Charger placeholder',
    specifications: [
      { group: 'Output', name: 'Max Power', value: '65W Max (C1/C2 up to 65W, USB-A up to 22.5W)' },
      { group: 'Protocols', name: 'Fast Charge', value: 'PD 3.0, PPS 45W, QC 4+, SCP, AFC' },
      {
        group: 'Technology',
        name: 'Architecture',
        value: 'GaN II Thermal Guard smart power distribution',
      },
    ],
    variants: [
      {
        sku: 'UGR-NEX65W-3P-GRY',
        name: 'Space Gray / UK 3-Pin or US Plug',
        price: bdt(2850),
        compareAtPrice: bdt(3250),
        attributes: { Color: 'Space Gray', Output: '65W 3-Port' },
        isDefault: true,
        initialStock: 25,
        lowStockThreshold: 6,
      },
    ],
  },
  {
    name: 'Anker 7-in-1 USB-C Hub (4K HDMI)',
    slug: 'anker-7-in-1-usb-c-hub',
    categorySlug: 'accessories',
    brandSlug: 'anker',
    summary:
      'Slim aluminum USB-C hub adding 4K HDMI, 100W pass-through charging, microSD/SD slots, and 5Gbps USB-A/C.',
    description:
      'Expand a single USB-C laptop port into seven essential workstation connections: 4K@30Hz HDMI output, 100W USB-C Power Delivery pass-through, dual USB-A 3.0 ports, USB-C data port, and SD/microSD card readers.',
    warranty: '18 Months Official Anker Warranty',
    featured: false,
    imageAltText: 'Anker 7-in-1 USB-C Hub placeholder',
    specifications: [
      { group: 'Video', name: 'Display Output', value: '1x HDMI up to 4K @ 30Hz' },
      { group: 'Power', name: 'Pass-Through', value: 'Up to 85W host charging (100W PD input)' },
      { group: 'Data', name: 'Ports', value: '2x USB-A 5Gbps, 1x USB-C 5Gbps, SD & microSD' },
    ],
    variants: [
      {
        sku: 'ANK-HUB7IN1-GRY',
        name: 'Aluminum Gray',
        price: bdt(4490),
        compareAtPrice: bdt(4990),
        attributes: { Color: 'Gray', Ports: '7-in-1' },
        isDefault: true,
        initialStock: 22,
        lowStockThreshold: 5,
      },
    ],
  },
  {
    name: 'TP-Link Archer AX55 AX3000 Router',
    slug: 'tp-link-archer-ax55',
    categorySlug: 'accessories',
    brandSlug: 'tp-link',
    summary:
      'AX3000 Dual-Band Gigabit Wi-Fi 6 router with 160MHz channel bandwidth, USB 3.0 port, and OneMesh support.',
    description:
      'Engineered for high-speed broadband apartments and multi-device homes in Bangladesh, the TP-Link Archer AX55 delivers up to 3 Gbps dual-band Wi-Fi 6 speeds, four high-gain beamforming antennas, WPA3 security, and HomeShield protection.',
    warranty: '1 Year Official TP-Link Bangladesh Warranty',
    featured: false,
    imageAltText: 'TP-Link Archer AX55 AX3000 Wi-Fi 6 Router placeholder',
    specifications: [
      {
        group: 'Wireless',
        name: 'Standard & Speed',
        value: 'Wi-Fi 6 (802.11ax), AX3000 (2402 + 574 Mbps)',
      },
      { group: 'Hardware', name: 'Ports', value: '1x Gigabit WAN, 4x Gigabit LAN, 1x USB 3.0' },
      {
        group: 'Features',
        name: 'Security & Mesh',
        value: 'WPA3, OFDMA, 160MHz bandwidth, EasyMesh/OneMesh',
      },
    ],
    variants: [
      {
        sku: 'TPL-AX55-BLK',
        name: 'Black / AX3000 Dual-Band',
        price: bdt(12400),
        compareAtPrice: bdt(13200),
        attributes: { Color: 'Black', Standard: 'AX3000 Wi-Fi 6' },
        isDefault: true,
        initialStock: 10,
        lowStockThreshold: 4,
      },
    ],
  },
];
