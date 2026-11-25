import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { prisma, pool } from '../lib/prisma.js';
import { env } from '../config/env.js';
import {
  createCategorySchema,
  createBrandSchema,
  createProductSchema,
  createVariantSchema,
  createImageSchema,
} from '../modules/catalogue/catalogue.schemas.js';
import { cloudinaryService } from '../modules/catalogue/cloudinary.service.js';
import { productService } from '../modules/catalogue/product.service.js';
import {
  SEED_BRANDS,
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  type SeedProductSpec,
} from './seed-catalogue.data.js';

export const DEFAULT_SEED_ASSETS_DIR = path.resolve(
  import.meta.dirname,
  '../../seed-assets/products',
);

export interface SeedCatalogueOptions {
  assetsDir?: string;
  confirmProduction?: boolean;
  skipImageUpload?: boolean;
  dryRun?: boolean;
  onExit?: (code: number) => void;
}

export interface SeedCatalogueSummary {
  categoriesCreated: number;
  categoriesReused: number;
  brandsCreated: number;
  brandsReused: number;
  productsCreated: number;
  productsSkipped: number;
  variantsCreated: number;
  imagesUploaded: number;
}

export function getLocalImagePath(assetsDir: string, productSlug: string): string {
  return path.join(assetsDir, productSlug, '1.webp');
}

export function describeTargetDatabase(databaseUrl: string): {
  host: string;
  database: string;
  isLocal: boolean;
} {
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname.toLowerCase();
    const database = parsed.pathname.replace(/^\//, '') || '(default)';
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    return { host, database, isLocal };
  } catch {
    return { host: 'unknown', database: 'unknown', isLocal: false };
  }
}

export function requiresProductionConfirmation(nodeEnv: string, databaseUrl: string): boolean {
  if (nodeEnv === 'production') {
    return true;
  }
  const target = describeTargetDatabase(databaseUrl);
  return !target.isLocal;
}

/**
 * Verifies every local seed image file exists and is non-empty before touching external APIs or DB.
 */
export async function verifySeedAssets(
  assetsDir: string,
  products: SeedProductSpec[] = SEED_PRODUCTS,
): Promise<void> {
  const missing: string[] = [];

  for (const prod of products) {
    const imgPath = getLocalImagePath(assetsDir, prod.slug);
    try {
      const stat = await fs.stat(imgPath);
      if (!stat.isFile() || stat.size === 0) {
        missing.push(`${prod.slug} (${imgPath} is empty or not a file)`);
      }
    } catch {
      missing.push(`${prod.slug} (missing ${imgPath})`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or unreadable seed product image files:\n  - ${missing.join('\n  - ')}`,
    );
  }
}

export async function seedCatalogue(
  options: SeedCatalogueOptions = {},
): Promise<SeedCatalogueSummary> {
  const assetsDir = options.assetsDir ?? DEFAULT_SEED_ASSETS_DIR;
  const dryRun = options.dryRun ?? false;
  const skipImageUpload = options.skipImageUpload ?? false;
  const activeDbUrl = env.NODE_ENV === 'test' ? (env.TEST_DATABASE_URL ?? '') : env.DATABASE_URL;
  const targetDb = describeTargetDatabase(activeDbUrl);

  const cliConfirm =
    process.argv.includes('--confirm-production') ||
    process.env['SEED_CONFIRM_PRODUCTION'] === 'true';
  const isConfirmed = Boolean(options.confirmProduction || cliConfirm);

  if (!dryRun && env.NODE_ENV !== 'test') {
    if (requiresProductionConfirmation(env.NODE_ENV, activeDbUrl) && !isConfirmed) {
      console.error(
        `❌ Refusing to write to remote/production database "${targetDb.database}" on host "${targetDb.host}" without explicit confirmation.`,
      );
      console.error('Re-run with --confirm-production to execute against this target database.');
      if (options.onExit) {
        options.onExit(1);
        throw new Error('PRODUCTION_CONFIRMATION_REQUIRED');
      }
      process.exit(1);
    }
  }

  // 1. Validate local seed assets first regardless of working directory
  await verifySeedAssets(assetsDir, SEED_PRODUCTS);

  const summary: SeedCatalogueSummary = {
    categoriesCreated: 0,
    categoriesReused: 0,
    brandsCreated: 0,
    brandsReused: 0,
    productsCreated: 0,
    productsSkipped: 0,
    variantsCreated: 0,
    imagesUploaded: 0,
  };

  if (dryRun) {
    console.log(
      `[DRY RUN] Verified ${SEED_CATEGORIES.length} categories, ${SEED_BRANDS.length} brands, ${SEED_PRODUCTS.length} products and local image assets in ${assetsDir}. Target DB: ${targetDb.host}/${targetDb.database}`,
    );
    return summary;
  }

  // 2. Ensure Categories exist (create missing; never overwrite admin-customized existing records)
  const categoryIdBySlug = new Map<string, string>();
  for (const catSpec of SEED_CATEGORIES) {
    const validated = createCategorySchema.parse(catSpec);
    const existing = await prisma.category.findUnique({
      where: { slug: validated.slug! },
      select: { id: true },
    });

    if (existing) {
      categoryIdBySlug.set(validated.slug!, existing.id);
      summary.categoriesReused += 1;
    } else {
      const created = await prisma.category.create({
        data: {
          name: validated.name,
          slug: validated.slug!,
          description: validated.description ?? null,
          isActive: validated.isActive,
          displayOrder: validated.displayOrder,
        },
        select: { id: true },
      });
      categoryIdBySlug.set(validated.slug!, created.id);
      summary.categoriesCreated += 1;
    }
  }

  // 3. Ensure Brands exist (create missing; never overwrite admin-customized existing records)
  const brandIdBySlug = new Map<string, string>();
  for (const brandSpec of SEED_BRANDS) {
    const validated = createBrandSchema.parse(brandSpec);
    const existing = await prisma.brand.findUnique({
      where: { slug: validated.slug! },
      select: { id: true },
    });

    if (existing) {
      brandIdBySlug.set(validated.slug!, existing.id);
      summary.brandsReused += 1;
    } else {
      const created = await prisma.brand.create({
        data: {
          name: validated.name,
          slug: validated.slug!,
          description: validated.description ?? null,
          websiteUrl: validated.websiteUrl || null,
          isActive: validated.isActive,
        },
        select: { id: true },
      });
      brandIdBySlug.set(validated.slug!, created.id);
      summary.brandsCreated += 1;
    }
  }

  // 4. Create missing Products idempotently (preserve any existing product, price, stock, or image)
  for (const prodSpec of SEED_PRODUCTS) {
    const existingProduct = await prisma.product.findUnique({
      where: { slug: prodSpec.slug },
      select: { id: true },
    });

    if (existingProduct) {
      summary.productsSkipped += 1;
      continue;
    }

    const categoryId = categoryIdBySlug.get(prodSpec.categorySlug);
    const brandId = brandIdBySlug.get(prodSpec.brandSlug);
    if (!categoryId || !brandId) {
      throw new Error(`Missing category or brand mapping for seed product "${prodSpec.slug}"`);
    }

    // Validate product & variants against catalogue Zod schemas before any I/O
    const validatedProduct = createProductSchema.parse({
      name: prodSpec.name,
      slug: prodSpec.slug,
      summary: prodSpec.summary,
      description: prodSpec.description,
      categoryId,
      brandId,
      featured: prodSpec.featured,
      warranty: prodSpec.warranty,
      specifications: prodSpec.specifications,
    });

    const validatedVariants = prodSpec.variants.map((v) => createVariantSchema.parse(v));

    // Check SKU uniqueness before uploading/creating
    const skus = validatedVariants.map((v) => v.sku);
    const conflictingSku = await prisma.productVariant.findFirst({
      where: { sku: { in: skus } },
      select: { sku: true },
    });
    if (conflictingSku) {
      throw new Error(
        `Cannot seed product "${prodSpec.slug}": SKU "${conflictingSku.sku}" already exists in database`,
      );
    }

    // Upload image OUTSIDE database transaction to avoid holding locks across network I/O
    const deterministicPublicId = `digitaldepot/products/${prodSpec.slug}-1`;
    let imageUrl: string;
    let imagePublicId: string;

    if (skipImageUpload) {
      // Used only in offline unit/integration test environments without Cloudinary credentials
      imageUrl = `https://res.cloudinary.com/demo/image/upload/${deterministicPublicId}.webp`;
      imagePublicId = deterministicPublicId;
    } else {
      const localImagePath = getLocalImagePath(assetsDir, prodSpec.slug);
      const uploaded = await cloudinaryService.uploadFile(localImagePath, {
        publicId: deterministicPublicId,
        overwrite: true,
      });
      imageUrl = uploaded.secureUrl;
      imagePublicId = uploaded.publicId;
      summary.imagesUploaded += 1;
    }

    const validatedImage = createImageSchema.parse({
      url: imageUrl,
      publicId: imagePublicId,
      altText: prodSpec.imageAltText,
      displayOrder: 0,
      isPrimary: true,
    });

    // Atomically create Product + Image + Variants + PriceHistory + Inventory + InventoryAdjustment
    const createdProduct = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: validatedProduct.name,
          slug: validatedProduct.slug!,
          summary: validatedProduct.summary ?? null,
          description: validatedProduct.description ?? null,
          categoryId: validatedProduct.categoryId,
          brandId: validatedProduct.brandId ?? null,
          featured: validatedProduct.featured,
          warranty: validatedProduct.warranty ?? null,
          specifications: validatedProduct.specifications ?? [],
          status: 'DRAFT',
        },
        select: { id: true },
      });

      await tx.productImage.create({
        data: {
          productId: product.id,
          url: validatedImage.url,
          publicId: validatedImage.publicId ?? null,
          altText: validatedImage.altText ?? null,
          displayOrder: validatedImage.displayOrder,
          isPrimary: validatedImage.isPrimary,
        },
      });

      for (const variantInput of validatedVariants) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: variantInput.sku,
            name: variantInput.name,
            price: variantInput.price,
            compareAtPrice: variantInput.compareAtPrice ?? null,
            costPrice: variantInput.costPrice ?? null,
            barcode: variantInput.barcode ?? null,
            attributes: variantInput.attributes,
            isDefault: variantInput.isDefault,
            isActive: variantInput.isActive,
          },
          select: { id: true },
        });

        await tx.priceHistory.create({
          data: {
            variantId: variant.id,
            oldPrice: 0,
            newPrice: variantInput.price,
            oldCompareAt: null,
            newCompareAt: variantInput.compareAtPrice ?? null,
            oldCostPrice: null,
            newCostPrice: variantInput.costPrice ?? null,
            reason: 'Initial catalogue seed',
          },
        });

        const inventoryItem = await tx.inventoryItem.create({
          data: {
            variantId: variant.id,
            quantity: variantInput.initialStock,
            reservedQuantity: 0,
            lowStockThreshold: variantInput.lowStockThreshold,
          },
          select: { id: true },
        });

        if (variantInput.initialStock > 0) {
          await tx.inventoryAdjustment.create({
            data: {
              inventoryItemId: inventoryItem.id,
              type: 'RECEIVE',
              quantityDelta: variantInput.initialStock,
              oldQuantity: 0,
              newQuantity: variantInput.initialStock,
              reason: 'Initial catalogue seed stock',
            },
          });
        }
      }

      return product;
    });

    // Enforce the authoritative 7-rule publication gate before transitioning to PUBLISHED
    await productService.publish(createdProduct.id);
    summary.productsCreated += 1;
    summary.variantsCreated += validatedVariants.length;
  }

  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dryRun = process.argv.includes('--dry-run');
  seedCatalogue({ dryRun })
    .then(async (summary) => {
      console.log('\n========================================');
      console.log('✅ Catalogue Seed Completed');
      console.log('========================================');
      console.log(
        `  Categories created: ${summary.categoriesCreated} (reused: ${summary.categoriesReused})`,
      );
      console.log(
        `  Brands created:     ${summary.brandsCreated} (reused: ${summary.brandsReused})`,
      );
      console.log(
        `  Products created:   ${summary.productsCreated} (skipped: ${summary.productsSkipped})`,
      );
      console.log(`  Variants created:   ${summary.variantsCreated}`);
      console.log(`  Images uploaded:    ${summary.imagesUploaded}`);
      console.log('========================================\n');
      await prisma.$disconnect();
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Catalogue seed failed:', err instanceof Error ? err.message : err);
      await prisma.$disconnect().catch(() => {});
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
