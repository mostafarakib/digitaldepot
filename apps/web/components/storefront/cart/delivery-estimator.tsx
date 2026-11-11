'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Truck, CheckCircle2, MapPin, Loader2, X } from 'lucide-react';
import { useCart } from './cart-provider';
import { useAuth } from '@/components/auth/auth-provider';
import { getBangladeshDivisions } from '@/lib/bangladesh-geo-client';
import { apiClient } from '@/lib/api-client';
import { formatPoishaToBDT } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { DivisionItem, AddressItem, AddressListResponse } from '@/lib/auth-types';

export function DeliveryEstimator() {
  const t = useTranslations('cart.shipping');
  const { cart, estimateShipping, clearShippingEstimate } = useCart();
  const { user } = useAuth();

  const [divisions, setDivisions] = useState<DivisionItem[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<AddressItem[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentDistrict = cart?.shipping?.district ?? '';
  const effectiveAddresses = user ? savedAddresses : [];

  // Load Bangladesh divisions and districts
  useEffect(() => {
    let ignore = false;
    getBangladeshDivisions()
      .then((data) => {
        if (!ignore) {
          setDivisions(data);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, []);

  // Load saved addresses for authenticated customers
  useEffect(() => {
    if (!user) return;

    let ignore = false;
    apiClient<AddressListResponse>('/api/account/addresses')
      .then((res) => {
        if (!ignore && res.addresses) {
          setSavedAddresses(res.addresses);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [user]);

  const handleSelectDistrict = async (district: string) => {
    if (!district) return;
    setIsUpdating(true);
    setErrorMessage(null);
    try {
      await estimateShipping({ district });
      setSelectedAddressId('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update estimate');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSelectAddress = async (addressId: string) => {
    if (!addressId) return;
    setIsUpdating(true);
    setErrorMessage(null);
    try {
      await estimateShipping({ addressId });
      setSelectedAddressId(addressId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update estimate');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClear = async () => {
    setIsUpdating(true);
    setErrorMessage(null);
    try {
      await clearShippingEstimate();
      setSelectedAddressId('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to clear estimate');
    } finally {
      setIsUpdating(false);
    }
  };

  const shipping = cart?.shipping;
  const isDhaka = shipping?.isInsideDhaka === true;
  const isOutside = shipping?.isInsideDhaka === false;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium text-foreground text-sm">
          <Truck className="h-4 w-4 text-primary" />
          <span>{t('title')}</span>
        </div>
        {shipping?.district && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={isUpdating}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            {t('clearEstimate')}
          </Button>
        )}
      </div>

      {/* Free Shipping Progress Banner */}
      {shipping && (
        <div className="space-y-1.5">
          {shipping.isFreeShipping ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{t('freeShippingUnlocked')}</span>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>
                  {t('freeShippingProgress', {
                    amount: formatPoishaToBDT(shipping.amountNeededForFreeShipping),
                  })}
                </span>
                <span className="font-semibold text-foreground">
                  {shipping.freeShippingProgressPercent}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${shipping.freeShippingProgressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Pills for Inside / Outside Dhaka */}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={isDhaka ? 'default' : 'outline'}
          onClick={() => void handleSelectDistrict('DHAKA')}
          disabled={isUpdating}
          className="flex-1 text-xs"
        >
          {t('insideDhaka')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={isOutside ? 'default' : 'outline'}
          onClick={() => void handleSelectDistrict('CHATTOGRAM')}
          disabled={isUpdating}
          className="flex-1 text-xs"
        >
          {t('outsideDhaka')}
        </Button>
      </div>

      {/* Saved Addresses (if available) */}
      {effectiveAddresses.length > 0 && (
        <div className="space-y-1">
          <label
            htmlFor="shipping-saved-address"
            className="text-xs font-medium text-muted-foreground"
          >
            {t('savedAddress')}
          </label>
          <select
            id="shipping-saved-address"
            value={selectedAddressId}
            onChange={(e) => void handleSelectAddress(e.target.value)}
            disabled={isUpdating}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">{t('chooseSavedAddress')}</option>
            {effectiveAddresses.map((addr) => (
              <option key={addr.id} value={addr.id}>
                {addr.recipientName} ({addr.districtNameEn || addr.districtId})
                {addr.isDefault ? ' ★' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Full District Dropdown */}
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span>{t('selectDistrict')}</span>
        </div>
        <select
          id="shipping-district-select"
          value={currentDistrict}
          onChange={(e) => void handleSelectDistrict(e.target.value)}
          disabled={isUpdating}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">{t('chooseDistrict')}</option>
          {divisions.map((div) => (
            <optgroup key={div.id} label={div.nameEn}>
              {div.districts.map((dist) => (
                <option key={dist.id} value={dist.id}>
                  {dist.nameEn}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Error Message */}
      {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}

      {/* Loading state indicator */}
      {isUpdating && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{t('estimating')}</span>
        </div>
      )}

      {/* Informational notice */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">{t('deliveryNotice')}</p>
    </div>
  );
}
