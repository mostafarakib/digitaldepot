'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { AddressItem, AddressListResponse } from '@/lib/auth-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { AddressCard } from './address-card';
import { AddressFormModal } from './address-form-modal';
import { AddressDeleteDialog } from './address-delete-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Inbox,
} from 'lucide-react';

export function AddressManager() {
  const t = useTranslations('auth.addresses');

  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [total, setTotal] = useState(0);
  const [maxQuota, setMaxQuota] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Success message banner
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressItem | null>(null);

  // Delete dialog state
  const [deletingAddress, setDeletingAddress] = useState<AddressItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // In-flight default setting ID
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetchAddresses = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let isMounted = true;
    apiClient<AddressListResponse>('/api/account/addresses')
      .then((res) => {
        if (isMounted) {
          setAddresses(res.addresses);
          setTotal(res.total);
          setMaxQuota(res.maxQuota || 10);
          setLoadError(null);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          if (err instanceof ApiError) {
            setLoadError(err.message);
          } else {
            setLoadError(t('feedback.genericError'));
          }
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [t, refreshKey]);

  const handleOpenAddModal = () => {
    setEditingAddress(null);
    setIsFormModalOpen(true);
    setActionError(null);
  };

  const handleOpenEditModal = (address: AddressItem) => {
    setEditingAddress(address);
    setIsFormModalOpen(true);
    setActionError(null);
  };

  const handleOpenDeleteDialog = (address: AddressItem) => {
    setDeletingAddress(address);
    setActionError(null);
  };

  const handleSetDefault = async (addressId: string) => {
    setSettingDefaultId(addressId);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await apiClient(`/api/account/addresses/${addressId}/default`, {
        method: 'PATCH',
      });
      refetchAddresses();
      setSuccessMessage(t('feedback.successDefaultChanged'));
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError(t('feedback.genericError'));
      }
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingAddress) return;

    setIsDeleting(true);
    setActionError(null);
    setSuccessMessage(null);

    try {
      await apiClient(`/api/account/addresses/${deletingAddress.id}`, {
        method: 'DELETE',
      });
      refetchAddresses();
      setSuccessMessage(t('feedback.successDeleted'));
      setDeletingAddress(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError(t('feedback.genericError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const isQuotaReached = total >= maxQuota;

  return (
    <div className="space-y-6">
      {/* Top Controls & Quota Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card border border-border rounded-xl p-4 sm:p-5 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {t('quotaBadge', { count: total, max: maxQuota })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{t('pageSubtitle')}</p>
        </div>

        <Button
          onClick={handleOpenAddModal}
          disabled={isQuotaReached || isLoading}
          className="gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" />
          {t('addNewAddress')}
        </Button>
      </div>

      {/* Quota reached notice */}
      {isQuotaReached && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <span>{t('quotaReachedNotice', { max: maxQuota })}</span>
        </div>
      )}

      {/* Success banner */}
      {successMessage && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3.5 text-xs text-green-800 dark:text-green-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-green-700 dark:text-green-400 hover:opacity-75 font-semibold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error banner */}
      {actionError && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3.5 text-xs text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-destructive hover:opacity-75 font-semibold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="border-border animate-pulse">
              <CardContent className="p-6 space-y-4">
                <div className="h-5 bg-muted rounded-md w-1/3" />
                <div className="h-4 bg-muted rounded-md w-1/2" />
                <div className="h-10 bg-muted rounded-md w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center p-8 border border-border rounded-xl bg-card text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-foreground font-medium">{loadError}</p>
          <Button variant="outline" size="sm" onClick={refetchAddresses}>
            Retry
          </Button>
        </div>
      ) : addresses.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-2xl bg-muted/10 text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Inbox className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-base font-semibold text-foreground">{t('emptyTitle')}</h3>
            <p className="text-xs text-muted-foreground leading-normal">{t('emptyDescription')}</p>
          </div>
          <Button onClick={handleOpenAddModal} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            {t('addFirstAddressCta')}
          </Button>
        </div>
      ) : (
        /* Address List */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={handleOpenEditModal}
              onDelete={handleOpenDeleteDialog}
              onSetDefault={handleSetDefault}
              isSettingDefault={settingDefaultId === address.id}
              isDeleting={isDeleting && deletingAddress?.id === address.id}
            />
          ))}
        </div>
      )}

      {/* Form Modal (Add / Edit) */}
      <AddressFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSuccess={async () => {
          refetchAddresses();
          setSuccessMessage(
            editingAddress ? t('feedback.successUpdated') : t('feedback.successCreated'),
          );
        }}
        initialAddress={editingAddress}
        existingTotal={total}
      />

      {/* Delete Confirmation Dialog */}
      <AddressDeleteDialog
        isOpen={Boolean(deletingAddress)}
        address={deletingAddress}
        onClose={() => setDeletingAddress(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        totalAddresses={total}
      />
    </div>
  );
}
