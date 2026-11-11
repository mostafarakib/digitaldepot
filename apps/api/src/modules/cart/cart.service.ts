import { prisma } from '../../lib/prisma.js';
import { generateOpaqueToken, hashToken } from '../../lib/crypto.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js';
import type { Cart, Prisma } from '../../generated/client/client.js';
import type { AddToCartInput, UpdateCartItemInput, EstimateShippingInput } from './cart.schemas.js';
import { couponService } from '../coupon/coupon.service.js';
import { shippingService, type ShippingEstimate } from './shipping.service.js';
import { isValidDistrict } from '../account/data/bangladesh-geo.js';

export interface CartIdentifier {
  userId?: string;
  guestToken?: string;
}

const CART_INCLUDE = {
  coupon: true,
  items: {
    include: {
      variant: {
        include: {
          product: {
            include: {
              brand: { select: { id: true, name: true, slug: true } },
              images: {
                where: { isPrimary: true },
                take: 1,
                select: { id: true, url: true, altText: true },
              },
            },
          },
          inventoryItem: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

type CartWithRelations = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;
type CartItemWithRelations = CartWithRelations['items'][number];

export interface AppliedCoupon {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number;
  discountAmount: number;
  description: string | null;
}

export interface HydratedCartItem {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  unitPriceAtAdd: number;
  hasPriceChanged: boolean;
  priceDifference: number;
  availableStock: number;
  isAvailable: boolean;
  isQuantityValid: boolean;
  lineTotal: number;
  product: {
    id: string;
    name: string;
    slug: string;
    status: string;
    brand: { id: string; name: string; slug: string } | null;
    primaryImage: { id: string; url: string; altText: string | null } | null;
  };
  variant: {
    id: string;
    sku: string;
    name: string;
    attributes: unknown;
    isActive: boolean;
  };
}

export interface HydratedCart {
  id: string | null;
  items: HydratedCartItem[];
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  discount: number;
  shipping: ShippingEstimate;
  total: number;
  hasUnavailableItems: boolean;
  hasPriceChanges: boolean;
  coupon: AppliedCoupon | null;
  couponNotice?: string | null;
}

export class CartService {
  /**
   * Helper to resolve cart query condition by user or hashed guest token
   */
  private getCartWhere(identifier: CartIdentifier) {
    if (identifier.userId) {
      return { userId: identifier.userId };
    }
    if (identifier.guestToken) {
      return { guestTokenHash: hashToken(identifier.guestToken) };
    }
    return null;
  }

  /**
   * Transforms raw Prisma cart model into a hydrated storefront cart payload
   */
  private async formatCart(
    cart: CartWithRelations | null,
    options?: { couponNotice?: string | null },
  ): Promise<HydratedCart> {
    if (!cart || !cart.items) {
      return {
        id: null,
        items: [],
        itemCount: 0,
        totalQuantity: 0,
        subtotal: 0,
        discount: 0,
        shipping: shippingService.calculateShipping(0, null),
        total: 0,
        hasUnavailableItems: false,
        hasPriceChanges: false,
        coupon: null,
      };
    }

    const items: HydratedCartItem[] = cart.items.map((item: CartItemWithRelations) => {
      const variant = item.variant;
      const product = variant.product;
      const inventory = variant.inventoryItem;

      const physicalStock = inventory?.quantity ?? 0;
      const reservedStock = inventory?.reservedQuantity ?? 0;
      const availableStock = Math.max(0, physicalStock - reservedStock);

      const livePrice = variant.price;
      const unitPriceAtAdd = item.unitPriceAtAdd;
      const hasPriceChanged = unitPriceAtAdd !== livePrice;
      const priceDifference = livePrice - unitPriceAtAdd;

      const isAvailable = variant.isActive && product.status === 'PUBLISHED' && availableStock > 0;
      const isQuantityValid = isAvailable && item.quantity <= availableStock;
      const lineTotal = item.quantity * livePrice;

      const primaryImage = product.images?.[0] ?? null;

      return {
        id: item.id,
        variantId: variant.id,
        quantity: item.quantity,
        unitPrice: livePrice,
        unitPriceAtAdd,
        hasPriceChanged,
        priceDifference,
        availableStock,
        isAvailable,
        isQuantityValid,
        lineTotal,
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          status: product.status,
          brand: product.brand,
          primaryImage: primaryImage
            ? {
                id: primaryImage.id,
                url: primaryImage.url,
                altText: primaryImage.altText,
              }
            : null,
        },
        variant: {
          id: variant.id,
          sku: variant.sku,
          name: variant.name,
          attributes: variant.attributes,
          isActive: variant.isActive,
        },
      };
    });

    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
    const hasUnavailableItems = items.some((i) => !i.isAvailable || !i.isQuantityValid);
    const hasPriceChanges = items.some((i) => i.hasPriceChanged);

    let discount = 0;
    let appliedCoupon: AppliedCoupon | null = null;
    let couponNotice: string | null = options?.couponNotice ?? null;

    if (cart.coupon) {
      const now = new Date();
      let isCouponValid = true;
      let invalidReason: string | null = null;

      if (!cart.coupon.isActive) {
        isCouponValid = false;
        invalidReason = 'This coupon is no longer active.';
      } else if (now < cart.coupon.startDate) {
        isCouponValid = false;
        invalidReason = 'This coupon is not valid yet.';
      } else if (now > cart.coupon.endDate) {
        isCouponValid = false;
        invalidReason = 'This coupon has expired.';
      } else if (
        cart.coupon.usageLimit !== null &&
        cart.coupon.usageCount >= cart.coupon.usageLimit
      ) {
        isCouponValid = false;
        invalidReason = 'This coupon has reached its maximum usage limit.';
      } else if (subtotal <= 0) {
        isCouponValid = false;
        invalidReason = 'Coupon cannot be applied to an empty cart.';
      } else if (cart.coupon.minOrderAmount !== null && subtotal < cart.coupon.minOrderAmount) {
        isCouponValid = false;
        const minTaka = (cart.coupon.minOrderAmount / 100).toLocaleString();
        invalidReason = `Order minimum of ৳${minTaka} required for coupon ${cart.coupon.code}.`;
      } else if (cart.userId && cart.coupon.perCustomerLimit !== null) {
        const userUsage = await prisma.couponUsage.count({
          where: { couponId: cart.coupon.id, userId: cart.userId },
        });
        if (userUsage >= cart.coupon.perCustomerLimit) {
          isCouponValid = false;
          invalidReason = `You have already used coupon ${cart.coupon.code} the maximum allowed number of times.`;
        }
      }

      if (isCouponValid) {
        if (cart.coupon.discountType === 'PERCENTAGE') {
          const raw = Math.round((subtotal * cart.coupon.discountValue) / 100);
          const capped =
            cart.coupon.maxDiscountAmount !== null && cart.coupon.maxDiscountAmount > 0
              ? Math.min(raw, cart.coupon.maxDiscountAmount)
              : raw;
          discount = Math.min(capped, subtotal);
        } else {
          // FIXED_AMOUNT
          discount = Math.min(cart.coupon.discountValue, subtotal);
        }

        appliedCoupon = {
          id: cart.coupon.id,
          code: cart.coupon.code,
          discountType: cart.coupon.discountType,
          discountValue: cart.coupon.discountValue,
          discountAmount: discount,
          description: cart.coupon.description,
        };
      } else {
        // Auto-detach invalid coupon from cart
        await prisma.cart.update({
          where: { id: cart.id },
          data: { couponId: null },
        });
        couponNotice = invalidReason;
      }
    }

    // Resolve estimated delivery district:
    // 1. Direct estimate on cart (persisted district ID)
    // 2. Fall back to authenticated customer's default saved address district ID
    let resolvedDistrict = cart.estimatedDistrict;
    if (!resolvedDistrict && cart.userId) {
      const defaultAddress = await prisma.address.findFirst({
        where: { userId: cart.userId, isDefault: true },
        select: { districtId: true },
      });
      if (defaultAddress) {
        resolvedDistrict = defaultAddress.districtId;
      }
    }

    const shipping = shippingService.calculateShipping(subtotal, resolvedDistrict);
    const merchandisePayable = Math.max(0, subtotal - discount);
    const total =
      items.length > 0 ? merchandisePayable + (shipping.isEstimated ? shipping.shippingFee : 0) : 0;

    return {
      id: cart.id,
      items,
      itemCount: items.length,
      totalQuantity,
      subtotal,
      discount,
      shipping,
      total,
      hasUnavailableItems,
      hasPriceChanges,
      coupon: appliedCoupon,
      ...(couponNotice ? { couponNotice } : {}),
    };
  }

  private cartInclude() {
    return CART_INCLUDE;
  }

  /**
   * Retrieves active cart for authenticated user or guest token
   */
  async getCart(identifier: CartIdentifier): Promise<HydratedCart> {
    const where = this.getCartWhere(identifier);
    if (!where) {
      return await this.formatCart(null);
    }

    const cart = await prisma.cart.findUnique({
      where,
      include: this.cartInclude(),
    });

    return await this.formatCart(cart);
  }

  /**
   * Adds an item to the resolved cart (creating cart and minting guest token if necessary)
   */
  async addItem(
    identifier: CartIdentifier,
    input: AddToCartInput,
    onNewGuestToken?: (rawToken: string) => void,
  ): Promise<HydratedCart> {
    // 1. Validate target variant and active publication state
    const variant = await prisma.productVariant.findUnique({
      where: { id: input.variantId },
      include: {
        product: true,
        inventoryItem: true,
      },
    });

    if (!variant || !variant.isActive || variant.product.status !== 'PUBLISHED') {
      throw new NotFoundError(
        'VARIANT_NOT_FOUND',
        'The selected product variant is currently unavailable',
      );
    }

    const availableStock = Math.max(
      0,
      (variant.inventoryItem?.quantity ?? 0) - (variant.inventoryItem?.reservedQuantity ?? 0),
    );

    if (availableStock <= 0) {
      throw new ConflictError('OUT_OF_STOCK', 'This item is currently out of stock');
    }

    // 2. Resolve or create cart
    let cart: Cart | null = null;
    const existingWhere = this.getCartWhere(identifier);

    if (existingWhere) {
      cart = await prisma.cart.findUnique({
        where: existingWhere,
      });
    }

    if (!cart) {
      if (identifier.userId) {
        cart = await prisma.cart.create({
          data: { userId: identifier.userId },
        });
      } else if (identifier.guestToken) {
        cart = await prisma.cart.create({
          data: { guestTokenHash: hashToken(identifier.guestToken) },
        });
      } else {
        // Mint a brand new guest token
        const rawToken = generateOpaqueToken();
        cart = await prisma.cart.create({
          data: { guestTokenHash: hashToken(rawToken) },
        });
        if (onNewGuestToken) {
          onNewGuestToken(rawToken);
        }
      }
    }

    // 3. Add or update CartItem
    const existingItem = await prisma.cartItem.findUnique({
      where: {
        cartId_variantId: {
          cartId: cart.id,
          variantId: variant.id,
        },
      },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + input.quantity;
      if (newQuantity > availableStock) {
        throw new BadRequestError(
          'INSUFFICIENT_STOCK',
          `Cannot add ${input.quantity} more. Only ${availableStock} item(s) available, and you already have ${existingItem.quantity} in your cart.`,
        );
      }

      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      if (input.quantity > availableStock) {
        throw new BadRequestError(
          'INSUFFICIENT_STOCK',
          `Requested quantity (${input.quantity}) exceeds available stock (${availableStock}).`,
        );
      }

      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: variant.id,
          quantity: input.quantity,
          unitPriceAtAdd: variant.price,
        },
      });
    }

    // 4. Return fresh hydrated cart
    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: this.cartInclude(),
    });

    return await this.formatCart(updatedCart);
  }

  /**
   * Updates quantity of a specific item in the cart
   */
  async updateItem(
    identifier: CartIdentifier,
    itemId: string,
    input: UpdateCartItemInput,
  ): Promise<HydratedCart> {
    const where = this.getCartWhere(identifier);
    if (!where) {
      throw new NotFoundError('CART_NOT_FOUND', 'Cart not found');
    }

    const cart = await prisma.cart.findUnique({
      where,
    });

    if (!cart) {
      throw new NotFoundError('CART_NOT_FOUND', 'Cart not found');
    }

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
      include: {
        variant: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundError('CART_ITEM_NOT_FOUND', 'Item not found in cart');
    }

    const availableStock = Math.max(
      0,
      (item.variant.inventoryItem?.quantity ?? 0) -
        (item.variant.inventoryItem?.reservedQuantity ?? 0),
    );

    if (input.quantity > availableStock) {
      throw new BadRequestError(
        'INSUFFICIENT_STOCK',
        `Requested quantity (${input.quantity}) exceeds available stock (${availableStock}).`,
      );
    }

    await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: input.quantity },
    });

    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: this.cartInclude(),
    });

    return await this.formatCart(updatedCart);
  }

  /**
   * Removes a single line item from the cart
   */
  async removeItem(identifier: CartIdentifier, itemId: string): Promise<HydratedCart> {
    const where = this.getCartWhere(identifier);
    if (!where) {
      return await this.formatCart(null);
    }

    const cart = await prisma.cart.findUnique({
      where,
    });

    if (cart) {
      await prisma.cartItem.deleteMany({
        where: { id: itemId, cartId: cart.id },
      });
    }

    const updatedCart = cart
      ? await prisma.cart.findUnique({
          where: { id: cart.id },
          include: this.cartInclude(),
        })
      : null;

    return await this.formatCart(updatedCart);
  }

  /**
   * Clears all items in the cart
   */
  async clearCart(identifier: CartIdentifier): Promise<HydratedCart> {
    const where = this.getCartWhere(identifier);
    if (!where) {
      return await this.formatCart(null);
    }

    const cart = await prisma.cart.findUnique({
      where,
    });

    if (cart) {
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
      if (cart.couponId) {
        await prisma.cart.update({
          where: { id: cart.id },
          data: { couponId: null },
        });
      }
    }

    let resolvedDistrict = cart?.estimatedDistrict ?? null;
    if (!resolvedDistrict && cart?.userId) {
      const defaultAddress = await prisma.address.findFirst({
        where: { userId: cart.userId, isDefault: true },
        select: { districtId: true },
      });
      if (defaultAddress) {
        resolvedDistrict = defaultAddress.districtId;
      }
    }

    const shipping = shippingService.calculateShipping(0, resolvedDistrict);

    return {
      id: cart?.id ?? null,
      items: [],
      itemCount: 0,
      totalQuantity: 0,
      subtotal: 0,
      discount: 0,
      shipping,
      total: 0,
      hasUnavailableItems: false,
      hasPriceChanges: false,
      coupon: null,
    };
  }

  /**
   * Applies a coupon to the resolved cart
   */
  async applyCoupon(identifier: CartIdentifier, code: string): Promise<HydratedCart> {
    const where = this.getCartWhere(identifier);
    if (!where) {
      throw new BadRequestError('CART_EMPTY', 'Cannot apply coupon to an empty cart');
    }

    const cart = await prisma.cart.findUnique({
      where,
      include: this.cartInclude(),
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestError('CART_EMPTY', 'Cannot apply coupon to an empty cart');
    }

    const subtotal = cart.items.reduce((sum, item) => sum + item.quantity * item.variant.price, 0);

    const { coupon } = await couponService.validateCouponEligibility(
      code,
      subtotal,
      identifier.userId,
    );

    const updatedCart = await prisma.cart.update({
      where: { id: cart.id },
      data: { couponId: coupon.id },
      include: this.cartInclude(),
    });

    return await this.formatCart(updatedCart);
  }

  /**
   * Removes applied coupon from the resolved cart
   */
  async removeCoupon(identifier: CartIdentifier): Promise<HydratedCart> {
    const where = this.getCartWhere(identifier);
    if (!where) {
      return await this.formatCart(null);
    }

    const cart = await prisma.cart.findUnique({
      where,
      include: this.cartInclude(),
    });

    if (!cart) {
      return await this.formatCart(null);
    }

    if (cart.couponId) {
      const updatedCart = await prisma.cart.update({
        where: { id: cart.id },
        data: { couponId: null },
        include: this.cartInclude(),
      });
      return await this.formatCart(updatedCart);
    }

    return await this.formatCart(cart);
  }

  /**
   * Sets or updates shipping estimate on the resolved cart.
   * If addressId is provided, resolves district from customer's saved address.
   * If district is provided, normalizes and validates against Bangladesh geography.
   */
  async estimateShipping(
    identifier: CartIdentifier,
    input: EstimateShippingInput,
  ): Promise<HydratedCart> {
    const where = this.getCartWhere(identifier);
    if (!where) {
      throw new BadRequestError('CART_EMPTY', 'Cannot estimate shipping for an empty cart');
    }

    const cart = await prisma.cart.findUnique({
      where,
      include: this.cartInclude(),
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestError('CART_EMPTY', 'Cannot estimate shipping for an empty cart');
    }

    let districtId: string;

    if (input.addressId) {
      if (!identifier.userId) {
        throw new BadRequestError(
          'AUTHENTICATION_REQUIRED',
          'Saved address selection is only available for authenticated customers',
        );
      }

      const address = await prisma.address.findFirst({
        where: { id: input.addressId, userId: identifier.userId },
        select: { districtId: true },
      });

      if (!address) {
        throw new NotFoundError(
          'ADDRESS_NOT_FOUND',
          `Address with ID "${input.addressId}" was not found`,
        );
      }

      districtId = address.districtId;
    } else if (input.district) {
      const normalized = shippingService.normalizeDistrict(input.district);
      if (!normalized || !isValidDistrict(normalized)) {
        throw new BadRequestError(
          'INVALID_DISTRICT',
          `"${input.district}" is not a valid Bangladesh district`,
        );
      }
      districtId = normalized;
    } else {
      throw new BadRequestError('INVALID_INPUT', 'Either district or addressId must be provided');
    }

    const updatedCart = await prisma.cart.update({
      where: { id: cart.id },
      data: { estimatedDistrict: districtId },
      include: this.cartInclude(),
    });

    return await this.formatCart(updatedCart);
  }

  /**
   * Clears estimated district from the resolved cart.
   */
  async clearShippingEstimate(identifier: CartIdentifier): Promise<HydratedCart> {
    const where = this.getCartWhere(identifier);
    if (!where) {
      return await this.formatCart(null);
    }

    const cart = await prisma.cart.findUnique({
      where,
      include: this.cartInclude(),
    });

    if (!cart) {
      return await this.formatCart(null);
    }

    if (cart.estimatedDistrict) {
      const updatedCart = await prisma.cart.update({
        where: { id: cart.id },
        data: { estimatedDistrict: null },
        include: this.cartInclude(),
      });
      return await this.formatCart(updatedCart);
    }

    return await this.formatCart(cart);
  }

  /**
   * Merges guest cart items into customer cart upon successful session establishment.
   * Ensures quantities combine without exceeding current available stock.
   * Transfers applied coupon if customer cart has no coupon.
   * Cleans up the guest cart record upon completion.
   */
  async mergeGuestCart(
    userId: string,
    rawGuestToken: string,
  ): Promise<{ merged: boolean; count: number }> {
    const guestTokenHash = hashToken(rawGuestToken);

    const guestCart = await prisma.cart.findUnique({
      where: { guestTokenHash },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true,
                inventoryItem: true,
              },
            },
          },
        },
      },
    });

    if (!guestCart || guestCart.items.length === 0) {
      if (guestCart) {
        await prisma.cart.delete({ where: { id: guestCart.id } });
      }
      return { merged: false, count: 0 };
    }

    let mergedCount = 0;

    await prisma.$transaction(async (tx) => {
      // Find or create customer cart
      let userCart = await tx.cart.findUnique({
        where: { userId },
        include: { items: true },
      });

      if (!userCart) {
        userCart = await tx.cart.create({
          data: { userId },
          include: { items: true },
        });
      }

      // Clarification 2: Cart merge district resolution
      // - Preserve customer's existing district estimate if present
      // - Otherwise transfer guest cart's district estimate
      // - If neither exists, fall back to customer's default saved address district when available
      let resolvedDistrict = userCart.estimatedDistrict;
      if (!resolvedDistrict && guestCart.estimatedDistrict) {
        resolvedDistrict = guestCart.estimatedDistrict;
      }
      if (!resolvedDistrict) {
        const defaultAddress = await tx.address.findFirst({
          where: { userId, isDefault: true },
          select: { districtId: true },
        });
        if (defaultAddress) {
          resolvedDistrict = defaultAddress.districtId;
        }
      }

      const updateData: { couponId?: string; estimatedDistrict?: string } = {};

      // If guest cart has an applied coupon and user cart has none, transfer it
      if (guestCart.couponId && !userCart.couponId) {
        updateData.couponId = guestCart.couponId;
      }

      if (resolvedDistrict && resolvedDistrict !== userCart.estimatedDistrict) {
        updateData.estimatedDistrict = resolvedDistrict;
      }

      if (Object.keys(updateData).length > 0) {
        await tx.cart.update({
          where: { id: userCart.id },
          data: updateData,
        });
      }

      for (const guestItem of guestCart.items) {
        const variant = guestItem.variant;
        const availableStock = Math.max(
          0,
          (variant.inventoryItem?.quantity ?? 0) - (variant.inventoryItem?.reservedQuantity ?? 0),
        );

        // If inactive or out of stock, drop from merge
        if (!variant.isActive || variant.product.status !== 'PUBLISHED' || availableStock <= 0) {
          continue;
        }

        const existingUserItem = userCart.items.find((ui) => ui.variantId === variant.id);

        if (existingUserItem) {
          const combinedQty = Math.min(
            availableStock,
            existingUserItem.quantity + guestItem.quantity,
          );
          await tx.cartItem.update({
            where: { id: existingUserItem.id },
            data: { quantity: combinedQty },
          });
        } else {
          const targetQty = Math.min(availableStock, guestItem.quantity);
          if (targetQty > 0) {
            await tx.cartItem.create({
              data: {
                cartId: userCart.id,
                variantId: variant.id,
                quantity: targetQty,
                unitPriceAtAdd: variant.price,
              },
            });
          }
        }
        mergedCount++;
      }

      // Delete the guest cart (cascades to CartItem)
      await tx.cart.delete({
        where: { id: guestCart.id },
      });
    });

    return { merged: true, count: mergedCount };
  }
}

export const cartService = new CartService();
