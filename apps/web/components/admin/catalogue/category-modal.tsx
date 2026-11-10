'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  categoryFormSchema,
  type CategoryFormValues,
  type CategoryItem,
  type CategoryTreeNode,
  slugify,
} from '@/lib/catalogue-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Loader2, AlertCircle, Tags } from 'lucide-react';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  initialCategory: CategoryItem | null;
  tree: CategoryTreeNode[];
  preselectedParentId?: string | null;
}

interface FlattenedOption {
  id: string;
  name: string;
  depth: number;
  disabled: boolean;
}

export function CategoryModal({
  isOpen,
  onClose,
  onSuccess,
  initialCategory,
  tree,
  preselectedParentId,
}: CategoryModalProps) {
  const t = useTranslations('admin.catalogue.categoryForm');
  const tFeedback = useTranslations('admin.catalogue.feedback');
  const isEditMode = Boolean(initialCategory);

  const [serverError, setServerError] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      parentId: '',
      imageUrl: '',
      isActive: true,
      displayOrder: 0,
    },
  });

  // Collect descendant IDs to disable in edit mode
  const descendantIds = React.useMemo(() => {
    if (!initialCategory) return new Set<string>();
    const ids = new Set<string>([initialCategory.id]);

    function collect(nodes: CategoryTreeNode[]) {
      for (const node of nodes) {
        if (ids.has(node.id) || (node.parentId && ids.has(node.parentId))) {
          ids.add(node.id);
        }
        if (node.children?.length) {
          collect(node.children);
        }
      }
    }

    // Run multiple passes to capture deep descendants
    for (let i = 0; i < 5; i++) {
      collect(tree);
    }

    return ids;
  }, [initialCategory, tree]);

  // Flatten tree for dropdown
  const parentOptions = React.useMemo(() => {
    const list: FlattenedOption[] = [];

    function traverse(nodes: CategoryTreeNode[], depth = 0) {
      for (const node of nodes) {
        list.push({
          id: node.id,
          name: node.name,
          depth,
          disabled: descendantIds.has(node.id),
        });
        if (node.children?.length) {
          traverse(node.children, depth + 1);
        }
      }
    }

    traverse(tree);
    return list;
  }, [tree, descendantIds]);

  // Synchronize form on open
  useEffect(() => {
    if (!isOpen) return;

    if (initialCategory) {
      reset({
        name: initialCategory.name,
        slug: initialCategory.slug,
        description: initialCategory.description ?? '',
        parentId: initialCategory.parentId ?? '',
        imageUrl: initialCategory.imageUrl ?? '',
        isActive: initialCategory.isActive,
        displayOrder: initialCategory.displayOrder,
      });
    } else {
      reset({
        name: '',
        slug: '',
        description: '',
        parentId: preselectedParentId ?? '',
        imageUrl: '',
        isActive: true,
        displayOrder: 0,
      });
    }
  }, [isOpen, initialCategory, preselectedParentId, reset]);

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

  // Auto-slugify when user types name if not manually modified
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setValue('name', name, { shouldValidate: true });
    if (!slugManuallyEdited && !isEditMode) {
      setValue('slug', slugify(name), { shouldValidate: true });
    }
  };

  const onSubmit = async (values: CategoryFormValues) => {
    setServerError(null);
    try {
      const payload = {
        name: values.name.trim(),
        slug: values.slug?.trim() ? values.slug.trim() : slugify(values.name.trim()),
        description: values.description?.trim() ? values.description.trim() : null,
        parentId: values.parentId && values.parentId !== '' ? values.parentId : null,
        imageUrl: values.imageUrl?.trim() ? values.imageUrl.trim() : null,
        isActive: values.isActive,
        displayOrder: Number(values.displayOrder) || 0,
      };

      if (isEditMode && initialCategory) {
        await apiClient(`/api/admin/categories/${initialCategory.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await apiClient('/api/admin/categories', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      await onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'SLUG_ALREADY_EXISTS') {
          setServerError(err.message);
        } else if (err.code === 'CATEGORY_CYCLE_DETECTED') {
          setServerError(err.message);
        } else {
          setServerError(err.message || tFeedback('genericError'));
        }
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
      aria-labelledby="category-modal-title"
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
              <Tags className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="category-modal-title"
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
            {/* Category Name */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cat-name">{t('nameLabel')}</Label>
              <Input
                id="cat-name"
                placeholder={t('namePlaceholder')}
                disabled={isSubmitting}
                {...register('name')}
                onChange={handleNameChange}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* URL Slug */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cat-slug">{t('slugLabel')}</Label>
              <Input
                id="cat-slug"
                placeholder={t('slugPlaceholder')}
                disabled={isSubmitting}
                {...register('slug')}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setValue('slug', e.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">{t('slugHelp')}</p>
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            </div>

            {/* Parent Category */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cat-parent">{t('parentLabel')}</Label>
              <select
                id="cat-parent"
                disabled={isSubmitting}
                {...register('parentId')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">{t('noParent')}</option>
                {parentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id} disabled={opt.disabled}>
                    {'\u00A0'.repeat(opt.depth * 4)}
                    {opt.depth > 0 ? '└ ' : ''}
                    {opt.name}
                    {opt.disabled ? ' (Current/Descendant)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Display Order */}
            <div className="space-y-1.5">
              <Label htmlFor="cat-display-order">{t('displayOrderLabel')}</Label>
              <Input
                id="cat-display-order"
                type="number"
                min={0}
                placeholder={t('displayOrderPlaceholder')}
                disabled={isSubmitting}
                {...register('displayOrder', { valueAsNumber: true })}
              />
              {errors.displayOrder && (
                <p className="text-xs text-destructive">{errors.displayOrder.message}</p>
              )}
            </div>

            {/* Image URL */}
            <div className="space-y-1.5">
              <Label htmlFor="cat-image">{t('imageUrlLabel')}</Label>
              <Input
                id="cat-image"
                placeholder={t('imageUrlPlaceholder')}
                disabled={isSubmitting}
                {...register('imageUrl')}
              />
              {errors.imageUrl && (
                <p className="text-xs text-destructive">{errors.imageUrl.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cat-desc">{t('descriptionLabel')}</Label>
              <textarea
                id="cat-desc"
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
                id="cat-is-active"
                disabled={isSubmitting}
                {...register('isActive')}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              <Label htmlFor="cat-is-active" className="cursor-pointer font-normal text-sm">
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
