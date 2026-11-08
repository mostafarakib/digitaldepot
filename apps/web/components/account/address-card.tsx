'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { AddressItem } from '@/lib/auth-types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Phone, User, CheckCircle2, Star, Pencil, Trash2, Loader2 } from 'lucide-react';

interface AddressCardProps {
  address: AddressItem;
  onEdit: (address: AddressItem) => void;
  onDelete: (address: AddressItem) => void;
  onSetDefault: (addressId: string) => Promise<void>;
  isSettingDefault: boolean;
  isDeleting: boolean;
}

export function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  isSettingDefault,
  isDeleting,
}: AddressCardProps) {
  const t = useTranslations('auth.addresses');
  const locale = useLocale();

  const divisionName = locale === 'bn' ? address.divisionNameBn : address.divisionNameEn;
  const districtName = locale === 'bn' ? address.districtNameBn : address.districtNameEn;

  return (
    <Card
      className={`relative border transition-colors ${
        address.isDefault
          ? 'border-primary/60 bg-primary/[0.02] shadow-xs'
          : 'border-border hover:border-border/80'
      }`}
    >
      <CardContent className="p-5 sm:p-6 space-y-4">
        {/* Top Badges & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            {address.isDefault ? (
              <Badge className="gap-1 bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5">
                <CheckCircle2 className="h-3 w-3" />
                {t('defaultBadge')}
              </Badge>
            ) : null}

            {address.label ? (
              <Badge variant="outline" className="text-xs font-normal border-border/80">
                {address.label}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            {!address.isDefault && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSetDefault(address.id)}
                disabled={isSettingDefault || isDeleting}
                className="h-7 text-xs px-2.5 gap-1 text-muted-foreground hover:text-foreground"
              >
                {isSettingDefault ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t('settingDefault')}
                  </>
                ) : (
                  <>
                    <Star className="h-3 w-3" />
                    {t('setDefaultCta')}
                  </>
                )}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(address)}
              disabled={isSettingDefault || isDeleting}
              className="h-7 text-xs px-2.5 gap-1"
            >
              <Pencil className="h-3 w-3" />
              {t('editCta')}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(address)}
              disabled={isSettingDefault || isDeleting}
              className="h-7 text-xs px-2.5 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              {t('deleteCta')}
            </Button>
          </div>
        </div>

        {/* Address Body */}
        <div className="space-y-2">
          {/* Recipient */}
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold text-base tracking-tight text-foreground">
              {address.recipientName}
            </span>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{address.phone}</span>
          </div>

          {/* Location */}
          <div className="flex items-start gap-2 pt-1 text-sm text-foreground/90">
            <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <p className="font-medium">{address.streetAddress}</p>
              <p className="text-muted-foreground text-xs sm:text-sm">
                {address.upazila}, {districtName}, {divisionName}
                {address.postalCode ? ` - ${address.postalCode}` : ''}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
