'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  brandFormSchema,
  type BrandFormValues,
  type BrandItem,
  slugify,
} from '@/lib/catalogue-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Loader2, AlertCircle, Building2 } from 'lucide-react';

interface BrandModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  initialBrand: BrandItem | null;
}

export function BrandModal({ isOpen, onClose, onSuccess, initialBrand }: BrandModalProps) {
  const t = useTranslations('admin.catalogue.brandForm');
  const tFeedback = useTranslations('admin.catalogue.feedback');
  const isEditMode = Boolean(initialBrand);

  const [serverError, setServerError] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BrandFormValues>({
    resolver: zodResolver(brandFormSchema),
    defaultValues: {
      name: '',
      slug: '',
      logoUrl: '',
      websiteUrl: '',
      description: '',
      isActive: true,
    },
  });

  useEffect(() => {
    if (!isOpen) return;

    if (initialBrand) {
      reset({
        name: initialBrand.name,
        slug: initialBrand.slug,
        logoUrl: initialBrand.logoUrl ?? '',
        websiteUrl: initialBrand.websiteUrl ?? '',
        description: initialBrand.description ?? '',
        isActive: initialBrand.isActive,
      });
    } else {
      reset({
        name: '',
        slug: '',
        logoUrl: '',
        websiteUrl: '',
        description: '',
        isActive: true,
      });
    }
  }, [isOpen, initialBrand, reset]);

  const handleClose = useCallback(() => {
    setServerError(null);
    setSlugManuallyEdited(false);
    onClose();
  }, [onClose]);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, handleClose]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setValue('name', name, { shouldValidate: true });
    if (!slugManuallyEdited && !isEditMode) {
      setValue('slug', slugify(name), { shouldValidate: true });
    }
  };

  const onSubmit = async (values: BrandFormValues) => {
    setServerError(null);
    try {
      const payload = {
        name: values.name.trim(),
        slug: values.slug?.trim() ? values.slug.trim() : slugify(values.name.trim()),
        logoUrl: values.logoUrl?.trim() ? values.logoUrl.trim() : null,
        websiteUrl: values.websiteUrl?.trim() ? values.websiteUrl.trim() : null,
        description: values.description?.trim() ? values.description.trim() : null,
        isActive: values.isActive,
      };

      if (isEditMode && initialBrand) {
        await apiClient(`/api/admin/brands/${initialBrand.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await apiClient('/api/admin/brands', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      await onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message || tFeedback('genericError'));
      } else {
        setServerError(tFeedback('genericError'));
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-xl bg-background border border-border rounded-xl shadow-2xl my-8 overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="brand-modal-title"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                {isEditMode ? t('editTitle') : t('createTitle')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('description')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            disabled={isSubmitting}
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Server error alert */}
        {serverError && (
          <div className="mx-5 mt-4 p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-sm flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">{serverError}</div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Brand Name */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="brand-name">{t('nameLabel')}</Label>
              <Input
                id="brand-name"
                placeholder={t('namePlaceholder')}
                disabled={isSubmitting}
                {...register('name')}
                onChange={handleNameChange}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* URL Slug */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="brand-slug">{t('slugLabel')}</Label>
              <Input
                id="brand-slug"
                placeholder={t('slugPlaceholder')}
                disabled={isSubmitting}
                {...register('slug')}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setValue('slug', e.target.value);
                }}
              />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            </div>

            {/* Logo URL */}
            <div className="space-y-1.5">
              <Label htmlFor="brand-logo">{t('logoUrlLabel')}</Label>
              <Input
                id="brand-logo"
                placeholder={t('logoUrlPlaceholder')}
                disabled={isSubmitting}
                {...register('logoUrl')}
              />
              {errors.logoUrl && (
                <p className="text-xs text-destructive">{errors.logoUrl.message}</p>
              )}
            </div>

            {/* Website URL */}
            <div className="space-y-1.5">
              <Label htmlFor="brand-website">{t('websiteUrlLabel')}</Label>
              <Input
                id="brand-website"
                placeholder={t('websiteUrlPlaceholder')}
                disabled={isSubmitting}
                {...register('websiteUrl')}
              />
              {errors.websiteUrl && (
                <p className="text-xs text-destructive">{errors.websiteUrl.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="brand-desc">{t('descriptionLabel')}</Label>
              <textarea
                id="brand-desc"
                rows={2}
                placeholder={t('descriptionPlaceholder')}
                disabled={isSubmitting}
                {...register('description')}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            {/* Active Toggle */}
            <div className="sm:col-span-2 flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="brand-is-active"
                disabled={isSubmitting}
                {...register('isActive')}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              <Label htmlFor="brand-is-active" className="cursor-pointer font-normal text-sm">
                {t('isActiveLabel')}
              </Label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                t('save')
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
