'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import type { CartData, EstimateShippingInput } from '@/lib/cart-types';
import {
  getCartApi,
  addToCartApi,
  updateCartItemApi,
  removeCartItemApi,
  clearCartApi,
  applyCouponApi,
  removeCouponApi,
  estimateShippingApi,
  clearShippingEstimateApi,
} from '@/lib/api-client';

interface CartContextValue {
  cart: CartData | null;
  isLoading: boolean;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  addToCart: (variantId: string, quantity?: number) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => Promise<void>;
  estimateShipping: (input: EstimateShippingInput) => Promise<void>;
  clearShippingEstimate: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const refreshCart = useCallback(async () => {
    try {
      const data = await getCartApi();
      setCart(data);
    } catch {
      // Cart fetch failure defaults to null without crashing UI
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialCart() {
      try {
        const data = await getCartApi();
        if (isMounted) {
          setCart(data);
        }
      } catch {
        // Fallback on initial load
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialCart();

    return () => {
      isMounted = false;
    };
  }, []);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);

  const addToCart = useCallback(async (variantId: string, quantity = 1) => {
    const updated = await addToCartApi({ variantId, quantity });
    setCart(updated);
    setIsDrawerOpen(true);
  }, []);

  const updateQuantity = useCallback(async (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      const updated = await removeCartItemApi(itemId);
      setCart(updated);
      return;
    }
    const updated = await updateCartItemApi(itemId, { quantity });
    setCart(updated);
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    const updated = await removeCartItemApi(itemId);
    setCart(updated);
  }, []);

  const clearCart = useCallback(async () => {
    const updated = await clearCartApi();
    setCart(updated);
  }, []);

  const applyCoupon = useCallback(async (code: string) => {
    const updated = await applyCouponApi(code);
    setCart(updated);
  }, []);

  const removeCoupon = useCallback(async () => {
    const updated = await removeCouponApi();
    setCart(updated);
  }, []);

  const estimateShipping = useCallback(async (input: EstimateShippingInput) => {
    const updated = await estimateShippingApi(input);
    setCart(updated);
  }, []);

  const clearShippingEstimate = useCallback(async () => {
    const updated = await clearShippingEstimateApi();
    setCart(updated);
  }, []);

  const value = useMemo(
    () => ({
      cart,
      isLoading,
      isDrawerOpen,
      setIsDrawerOpen,
      openDrawer,
      closeDrawer,
      addToCart,
      updateQuantity,
      removeItem,
      clearCart,
      applyCoupon,
      removeCoupon,
      estimateShipping,
      clearShippingEstimate,
      refreshCart,
    }),
    [
      cart,
      isLoading,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      addToCart,
      updateQuantity,
      removeItem,
      clearCart,
      applyCoupon,
      removeCoupon,
      estimateShipping,
      clearShippingEstimate,
      refreshCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
