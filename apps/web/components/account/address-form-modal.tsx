'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  addressFormSchema,
  type AddressFormInput,
  buildCreateAddressPayload,
  buildUpdateAddressPayload,
} from '@/lib/auth-schemas';
import type { AddressItem, DivisionItem } from '@/lib/auth-types';
import { getBangladeshDivisions } from '@/lib/bangladesh-geo-client';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Loader2, AlertCircle, MapPin, CheckCircle2 } from 'lucide-react';

interface AddressFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  initialAddress: AddressItem | null; // null => Create Mode, object => Edit Mode
  existingTotal: number;
}

export function AddressFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialAddress,
  existingTotal,
}: AddressFormModalProps) {
  const t = useTranslations('auth.addresses');
  const locale = useLocale();

  const isEditMode = Boolean(initialAddress);
  const isCurrentlyDefault = Boolean(initialAddress?.isDefault);
  const isFirstAddress = !isEditMode && existingTotal === 0;

  const [divisions, setDivisions] = useState<DivisionItem[]>([]);
  const [isLoadingDivisions, setIsLoadingDivisions] = useState(true);
  const [divisionsError, setDivisionsError] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [userSelectedDivisionId, setUserSelectedDivisionId] = useState<string | null>(null);

  const selectedDivisionId = userSelectedDivisionId ?? initialAddress?.divisionId ?? '';

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    setUserSelectedDivisionId(null);
    setServerError(null);
    onClose();
  }, [onClose]);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormInput>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: {
      recipientName: '',
      phone: '',
      divisionId: '',
      districtId: '',
      upazila: '',
      streetAddress: '',
      postalCode: '',
      label: '',
      isDefault: false,
    },
  });

  // Load Bangladesh divisions on mount/open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    getBangladeshDivisions()
      .then((data) => {
        if (isMounted) {
          setDivisions(data);
          setIsLoadingDivisions(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setDivisionsError(true);
          setIsLoadingDivisions(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Sync form values when initialAddress changes or modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialAddress) {
        reset({
          recipientName: initialAddress.recipientName,
          phone: initialAddress.phone,
          divisionId: initialAddress.divisionId,
          districtId: initialAddress.districtId,
          upazila: initialAddress.upazila,
          streetAddress: initialAddress.streetAddress,
          postalCode: initialAddress.postalCode ?? '',
          label: initialAddress.label ?? '',
          isDefault: initialAddress.isDefault,
        });
      } else {
        reset({
          recipientName: '',
          phone: '',
          divisionId: '',
          districtId: '',
          upazila: '',
          streetAddress: '',
          postalCode: '',
          label: '',
          isDefault: isFirstAddress,
        });
      }
    }
  }, [isOpen, initialAddress, reset, isFirstAddress]);

  // Focus management & accessible keyboard trap
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isSubmitting) {
          e.preventDefault();
          handleClose();
          return;
        }

        if (e.key === 'Tab' && modalRef.current) {
          const focusable = modalRef.current.querySelectorAll<HTMLElement>(
            'input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex="0"]',
          );
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        previousActiveElement.current?.focus();
      };
    }
  }, [isOpen, isSubmitting, handleClose]);

  // Selected division's districts
  const currentDivision = divisions.find((d) => d.id === selectedDivisionId);
  const availableDistricts = currentDivision ? currentDivision.districts : [];

  const handleDivisionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDivisionId = e.target.value;
    setUserSelectedDivisionId(newDivisionId);
    setValue('divisionId', newDivisionId, { shouldValidate: true });
    // Reset district selection when division changes to enforce cascading integrity
    setValue('districtId', '', { shouldValidate: true });
  };

  const onSubmit = async (data: AddressFormInput) => {
    setServerError(null);

    try {
      if (isEditMode && initialAddress) {
        // Edit mode: strictly omit isDefault if current address is default
        const payload = buildUpdateAddressPayload(data, initialAddress);
        await apiClient(`/api/account/addresses/${initialAddress.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Create mode: send full creation payload
        const payload = buildCreateAddressPayload(data);
        await apiClient('/api/account/addresses', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      await onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ADDRESS_LIMIT_REACHED') {
          setServerError(t('feedback.limitReachedError'));
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError(t('feedback.genericError'));
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="address-form-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-background border border-border rounded-xl shadow-2xl my-8 overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-6 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="address-form-modal-title"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                {isEditMode ? t('form.titleEdit') : t('form.titleAdd')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('form.description')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            disabled={isSubmitting}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            type="button"
            aria-label={t('cancel')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-6 space-y-4">
          {serverError && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {divisionsError && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{t('feedback.divisionsLoadError')}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  setIsLoadingDivisions(true);
                  setDivisionsError(false);
                  getBangladeshDivisions()
                    .then((d) => {
                      setDivisions(d);
                      setIsLoadingDivisions(false);
                    })
                    .catch(() => {
                      setDivisionsError(true);
                      setIsLoadingDivisions(false);
                    });
                }}
              >
                Retry
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Recipient Name */}
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="recipientName">{t('form.recipientNameLabel')} *</Label>
              <Input
                id="recipientName"
                placeholder={t('form.recipientNamePlaceholder')}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.recipientName)}
                {...register('recipientName')}
              />
              {errors.recipientName && (
                <p className="text-xs text-destructive">{errors.recipientName.message}</p>
              )}
            </div>

            {/* Mobile Number */}
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="phone">{t('form.phoneLabel')} *</Label>
              <Input
                id="phone"
                placeholder={t('form.phonePlaceholder')}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.phone)}
                {...register('phone')}
              />
              {errors.phone ? (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">{t('form.phoneHelpText')}</p>
              )}
            </div>

            {/* Division Selector */}
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="divisionId">{t('form.divisionLabel')} *</Label>
              <select
                id="divisionId"
                disabled={isSubmitting || isLoadingDivisions}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedDivisionId}
                onChange={handleDivisionChange}
                aria-invalid={Boolean(errors.divisionId)}
              >
                <option value="">
                  {isLoadingDivisions ? 'Loading...' : t('form.divisionPlaceholder')}
                </option>
                {divisions.map((div) => (
                  <option key={div.id} value={div.id}>
                    {locale === 'bn' ? div.nameBn : div.nameEn}
                  </option>
                ))}
              </select>
              {errors.divisionId && (
                <p className="text-xs text-destructive">{errors.divisionId.message}</p>
              )}
            </div>

            {/* District Selector (filtered by division) */}
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="districtId">{t('form.districtLabel')} *</Label>
              <select
                id="districtId"
                disabled={isSubmitting || !selectedDivisionId || availableDistricts.length === 0}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-invalid={Boolean(errors.districtId)}
                {...register('districtId')}
              >
                <option value="">
                  {!selectedDivisionId
                    ? t('form.districtDisabledPlaceholder')
                    : t('form.districtPlaceholder')}
                </option>
                {availableDistricts.map((dist) => (
                  <option key={dist.id} value={dist.id}>
                    {locale === 'bn' ? dist.nameBn : dist.nameEn}
                  </option>
                ))}
              </select>
              {errors.districtId && (
                <p className="text-xs text-destructive">{errors.districtId.message}</p>
              )}
            </div>

            {/* Upazila / Thana */}
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="upazila">{t('form.upazilaLabel')} *</Label>
              <Input
                id="upazila"
                placeholder={t('form.upazilaPlaceholder')}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.upazila)}
                {...register('upazila')}
              />
              {errors.upazila && (
                <p className="text-xs text-destructive">{errors.upazila.message}</p>
              )}
            </div>

            {/* Postal Code */}
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="postalCode">{t('form.postalCodeLabel')}</Label>
              <Input
                id="postalCode"
                placeholder={t('form.postalCodePlaceholder')}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.postalCode)}
                {...register('postalCode')}
              />
              {errors.postalCode && (
                <p className="text-xs text-destructive">{errors.postalCode.message}</p>
              )}
            </div>

            {/* Street Address */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="streetAddress">{t('form.streetAddressLabel')} *</Label>
              <Input
                id="streetAddress"
                placeholder={t('form.streetAddressPlaceholder')}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.streetAddress)}
                {...register('streetAddress')}
              />
              {errors.streetAddress && (
                <p className="text-xs text-destructive">{errors.streetAddress.message}</p>
              )}
            </div>

            {/* Label (Optional) */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="label">{t('form.labelLabel')}</Label>
              <Input
                id="label"
                placeholder={t('form.labelPlaceholder')}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.label)}
                {...register('label')}
              />
              {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
            </div>
          </div>

          {/* Default Address Option */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3 sm:p-4">
            {isCurrentlyDefault ? (
              <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{t('form.isDefaultCurrentNotice')}</span>
              </div>
            ) : isFirstAddress ? (
              <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{t('form.isDefaultFirstNotice')}</span>
              </div>
            ) : (
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary/20 accent-primary"
                  disabled={isSubmitting}
                  {...register('isDefault')}
                />
                <div className="space-y-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {t('form.isDefaultLabel')}
                  </span>
                </div>
              </label>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <Button variant="outline" onClick={handleClose} disabled={isSubmitting} type="button">
              {t('form.cancelButton')}
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('form.savingButton')}
                </>
              ) : (
                t('form.saveButton')
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
