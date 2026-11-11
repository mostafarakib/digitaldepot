'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SelectedAddressSummary } from '@/lib/checkout-types';
import { AddressFormModal } from '@/components/account/address-form-modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, CheckCircle2, Phone, User, AlertCircle } from 'lucide-react';

interface AddressSelectorProps {
  addresses: SelectedAddressSummary[];
  selectedAddressId: string | null;
  onSelectAddress: (id: string) => void;
  onRefreshAddresses: () => Promise<void>;
  disabled?: boolean;
}

export function AddressSelector({
  addresses,
  selectedAddressId,
  onSelectAddress,
  onRefreshAddresses,
  disabled = false,
}: AddressSelectorProps) {
  const t = useTranslations('checkout');
  const tAddr = useTranslations('auth.addresses');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleModalSuccess = async () => {
    await onRefreshAddresses();
    setIsModalOpen(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 md:p-6 shadow-xs">
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <MapPin className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">{t('deliveryAddressTitle')}</h2>
            <p className="text-xs text-muted-foreground">{t('deliveryAddressSubtitle')}</p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          disabled={disabled}
          className="gap-1.5 text-xs font-semibold"
        >
          <Plus className="size-3.5" />
          <span>{t('addNewAddress')}</span>
        </Button>
      </div>

      {addresses.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border rounded-lg text-center space-y-3 bg-muted/30">
          <AlertCircle className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold text-foreground">{t('noAddressesFound')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('noAddressesFoundDescription')}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="gap-1.5 text-xs font-semibold mt-2"
          >
            <Plus className="size-3.5" />
            <span>{t('addFirstAddress')}</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {addresses.map((address) => {
            const isSelected = selectedAddressId === address.id;
            return (
              <div
                key={address.id}
                onClick={() => !disabled && onSelectAddress(address.id)}
                className={`relative cursor-pointer rounded-lg p-4 border transition-all text-left flex flex-col justify-between ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5 shadow-xs'
                    : 'border-border hover:border-primary/50 bg-background'
                } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
                    e.preventDefault();
                    onSelectAddress(address.id);
                  }
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <User className="size-3.5 text-muted-foreground" />
                      <span className="text-xs font-bold text-foreground">
                        {address.recipientName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {address.isDefault && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] uppercase font-bold py-0 h-4"
                        >
                          {tAddr('defaultBadge')}
                        </Badge>
                      )}
                      {address.label && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
                          {address.label}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {address.streetAddress}, {address.upazila}, {address.districtId},{' '}
                    {address.divisionId} {address.postalCode ? `- ${address.postalCode}` : ''}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Phone className="size-3" />
                    <span>{address.phone}</span>
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <CheckCircle2 className="size-3.5 fill-primary text-primary-foreground" />
                        <span>{t('selectedAddress')}</span>
                      </>
                    ) : (
                      <span>{t('selectAddress')}</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Address Creation Modal */}
      <AddressFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
        initialAddress={null}
        existingTotal={addresses.length}
      />
    </div>
  );
}
