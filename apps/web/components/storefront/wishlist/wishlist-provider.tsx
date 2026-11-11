'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { useRouter, usePathname } from '@/i18n/routing';
import { getWishlistApi, addToWishlistApi, removeFromWishlistApi } from '@/lib/api-client';
import type { WishlistItemData, WishlistResponseData } from '@/lib/wishlist-types';

interface WishlistContextType {
  wishlistItems: WishlistItemData[];
  wishlistProductIds: Set<string>;
  itemCount: number;
  isLoading: boolean;
  isInWishlist: (productId: string) => boolean;
  toggleWishlist: (productId: string) => Promise<boolean>;
  addToWishlist: (productId: string) => Promise<void>;
  removeFromWishlist: (productId: string) => Promise<void>;
  refreshWishlist: () => Promise<void>;
}

const WishlistContext = createContext<WishlistContextType | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [wishlistData, setWishlistData] = useState<WishlistResponseData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Fetch customer wishlist if authenticated
  const fetchWishlist = useCallback(async () => {
    if (!user) {
      return;
    }
    setIsLoading(true);
    try {
      const data = await getWishlistApi();
      setWishlistData(data);
    } catch {
      // Silently catch fetch errors (e.g. unverified session)
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let ignore = false;
    getWishlistApi()
      .then((data) => {
        if (!ignore) {
          setWishlistData(data);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [user]);

  const effectiveItems = useMemo(() => {
    return user && wishlistData ? wishlistData.items : [];
  }, [user, wishlistData]);
  const wishlistProductIds = useMemo(() => {
    if (!user || !wishlistData) return new Set<string>();
    return new Set<string>(wishlistData.productIds);
  }, [user, wishlistData]);

  const isInWishlist = useCallback(
    (productId: string): boolean => {
      return wishlistProductIds.has(productId);
    },
    [wishlistProductIds],
  );

  const addToWishlist = useCallback(
    async (productId: string): Promise<void> => {
      if (!user) {
        router.push(`/login?returnUrl=${encodeURIComponent(pathname)}`);
        return;
      }

      await addToWishlistApi(productId);
      await fetchWishlist();
    },
    [user, router, pathname, fetchWishlist],
  );

  const removeFromWishlist = useCallback(
    async (productId: string): Promise<void> => {
      if (!user) return;

      await removeFromWishlistApi(productId);
      await fetchWishlist();
    },
    [user, fetchWishlist],
  );

  const toggleWishlist = useCallback(
    async (productId: string): Promise<boolean> => {
      if (!user) {
        router.push(`/login?returnUrl=${encodeURIComponent(pathname)}`);
        return false;
      }

      if (wishlistProductIds.has(productId)) {
        await removeFromWishlist(productId);
        return false;
      } else {
        await addToWishlist(productId);
        return true;
      }
    },
    [user, router, pathname, wishlistProductIds, removeFromWishlist, addToWishlist],
  );

  const value: WishlistContextType = useMemo(
    () => ({
      wishlistItems: effectiveItems,
      wishlistProductIds,
      itemCount: effectiveItems.length,
      isLoading,
      isInWishlist,
      toggleWishlist,
      addToWishlist,
      removeFromWishlist,
      refreshWishlist: fetchWishlist,
    }),
    [
      effectiveItems,
      wishlistProductIds,
      isLoading,
      isInWishlist,
      toggleWishlist,
      addToWishlist,
      removeFromWishlist,
      fetchWishlist,
    ],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
}
