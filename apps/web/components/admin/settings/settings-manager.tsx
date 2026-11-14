'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Settings,
  Truck,
  Clock,
  Building,
  Save,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { AdminStoreSettings, UpdateStoreSettingsInput } from '@/lib/settings-types';
import { getAdminStoreSettingsApi, updateAdminStoreSettingsApi } from '@/lib/api-client';

interface SettingsFormState {
  insideDhakaShippingFeeBDT: string;
  outsideDhakaShippingFeeBDT: string;
  freeShippingThresholdBDT: string;
  estimatedDaysInsideDhakaMin: string;
  estimatedDaysInsideDhakaMax: string;
  estimatedDaysOutsideDhakaMin: string;
  estimatedDaysOutsideDhakaMax: string;
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  supportHours: string;
  storeAddress: string;
}

export function SettingsManager() {
  const t = useTranslations('admin.settings');
  const tCommon = useTranslations('common');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentSettings, setCurrentSettings] = useState<AdminStoreSettings | null>(null);

  const [formData, setFormData] = useState<SettingsFormState>({
    insideDhakaShippingFeeBDT: '60',
    outsideDhakaShippingFeeBDT: '120',
    freeShippingThresholdBDT: '5000',
    estimatedDaysInsideDhakaMin: '2',
    estimatedDaysInsideDhakaMax: '3',
    estimatedDaysOutsideDhakaMin: '3',
    estimatedDaysOutsideDhakaMax: '5',
    storeName: 'DigitalDepot',
    supportEmail: 'support@digitaldepot.local',
    supportPhone: '+880 1700-000000',
    supportHours: 'Sat – Thu: 10:00 AM – 8:00 PM',
    storeAddress: 'Dhaka, Bangladesh',
  });

  const [initialData, setInitialData] = useState<SettingsFormState | null>(null);

  const populateForm = useCallback((data: AdminStoreSettings) => {
    const state: SettingsFormState = {
      insideDhakaShippingFeeBDT: (data.insideDhakaShippingFee / 100).toString(),
      outsideDhakaShippingFeeBDT: (data.outsideDhakaShippingFee / 100).toString(),
      freeShippingThresholdBDT: (data.freeShippingThreshold / 100).toString(),
      estimatedDaysInsideDhakaMin: data.estimatedDaysInsideDhakaMin.toString(),
      estimatedDaysInsideDhakaMax: data.estimatedDaysInsideDhakaMax.toString(),
      estimatedDaysOutsideDhakaMin: data.estimatedDaysOutsideDhakaMin.toString(),
      estimatedDaysOutsideDhakaMax: data.estimatedDaysOutsideDhakaMax.toString(),
      storeName: data.storeName,
      supportEmail: data.supportEmail,
      supportPhone: data.supportPhone ?? '',
      supportHours: data.supportHours ?? '',
      storeAddress: data.storeAddress ?? '',
    };
    setFormData(state);
    setInitialData(state);
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await getAdminStoreSettingsApi();
      setCurrentSettings(data);
      populateForm(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
    } finally {
      setIsLoading(false);
    }
  }, [populateForm, t]);

  useEffect(() => {
    let ignore = false;
    getAdminStoreSettingsApi()
      .then((data) => {
        if (!ignore) {
          setCurrentSettings(data);
          populateForm(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setErrorMessage(err instanceof Error ? err.message : t('errorLoading'));
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [populateForm, t]);

  const handleChange = (field: keyof SettingsFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSuccessMessage(null);
  };

  const isDirty = initialData ? JSON.stringify(formData) !== JSON.stringify(initialData) : false;

  const handleReset = () => {
    if (initialData) {
      setFormData(initialData);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validation
    const insideFeeBDT = parseFloat(formData.insideDhakaShippingFeeBDT);
    const outsideFeeBDT = parseFloat(formData.outsideDhakaShippingFeeBDT);
    const thresholdBDT = parseFloat(formData.freeShippingThresholdBDT);

    if (isNaN(insideFeeBDT) || insideFeeBDT < 0) {
      setErrorMessage('Inside Dhaka shipping fee must be a valid non-negative number.');
      return;
    }
    if (isNaN(outsideFeeBDT) || outsideFeeBDT < 0) {
      setErrorMessage('Outside Dhaka shipping fee must be a valid non-negative number.');
      return;
    }
    if (isNaN(thresholdBDT) || thresholdBDT < 0) {
      setErrorMessage('Free shipping threshold must be a valid non-negative number.');
      return;
    }

    const insideMin = parseInt(formData.estimatedDaysInsideDhakaMin, 10);
    const insideMax = parseInt(formData.estimatedDaysInsideDhakaMax, 10);
    const outsideMin = parseInt(formData.estimatedDaysOutsideDhakaMin, 10);
    const outsideMax = parseInt(formData.estimatedDaysOutsideDhakaMax, 10);

    if (isNaN(insideMin) || insideMin < 1 || isNaN(insideMax) || insideMax < insideMin) {
      setErrorMessage(
        'Inside Dhaka delivery days must be at least 1, and max days must be greater than or equal to min days.',
      );
      return;
    }

    if (isNaN(outsideMin) || outsideMin < 1 || isNaN(outsideMax) || outsideMax < outsideMin) {
      setErrorMessage(
        'Outside Dhaka delivery days must be at least 1, and max days must be greater than or equal to min days.',
      );
      return;
    }

    if (!formData.storeName.trim()) {
      setErrorMessage('Store name is required.');
      return;
    }

    if (!formData.supportEmail.trim() || !formData.supportEmail.includes('@')) {
      setErrorMessage('A valid customer support email address is required.');
      return;
    }

    const payload: UpdateStoreSettingsInput = {
      insideDhakaShippingFee: Math.round(insideFeeBDT * 100),
      outsideDhakaShippingFee: Math.round(outsideFeeBDT * 100),
      freeShippingThreshold: Math.round(thresholdBDT * 100),
      estimatedDaysInsideDhakaMin: insideMin,
      estimatedDaysInsideDhakaMax: insideMax,
      estimatedDaysOutsideDhakaMin: outsideMin,
      estimatedDaysOutsideDhakaMax: outsideMax,
      storeName: formData.storeName.trim(),
      supportEmail: formData.supportEmail.trim(),
      supportPhone: formData.supportPhone.trim() || null,
      supportHours: formData.supportHours.trim() || null,
      storeAddress: formData.storeAddress.trim() || null,
    };

    setIsSaving(true);
    try {
      const updated = await updateAdminStoreSettingsApi(payload);
      setCurrentSettings(updated);
      populateForm(updated);
      setSuccessMessage(t('saveSuccess'));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errorSaving'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-5xl">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            {t('title')}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!isDirty || isSaving}
            className="text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            {t('resetButton')}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!isDirty || isSaving}
            className="text-xs font-medium"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                {t('savingButton')}
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {t('saveButton')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Shipping Configuration Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              {t('shippingSection')}
            </CardTitle>
            <CardDescription className="text-xs">{t('shippingSectionDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="insideDhakaShippingFee" className="text-xs">
                {t('insideDhakaFeeLabel')}
              </Label>
              <Input
                id="insideDhakaShippingFee"
                type="number"
                min="0"
                step="1"
                value={formData.insideDhakaShippingFeeBDT}
                onChange={(e) => handleChange('insideDhakaShippingFeeBDT', e.target.value)}
                className="h-8 text-xs"
                required
              />
              <p className="text-[11px] text-muted-foreground">{t('insideDhakaFeeHint')}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="outsideDhakaShippingFee" className="text-xs">
                {t('outsideDhakaFeeLabel')}
              </Label>
              <Input
                id="outsideDhakaShippingFee"
                type="number"
                min="0"
                step="1"
                value={formData.outsideDhakaShippingFeeBDT}
                onChange={(e) => handleChange('outsideDhakaShippingFeeBDT', e.target.value)}
                className="h-8 text-xs"
                required
              />
              <p className="text-[11px] text-muted-foreground">{t('outsideDhakaFeeHint')}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="freeShippingThreshold" className="text-xs">
                {t('freeShippingThresholdLabel')}
              </Label>
              <Input
                id="freeShippingThreshold"
                type="number"
                min="0"
                step="1"
                value={formData.freeShippingThresholdBDT}
                onChange={(e) => handleChange('freeShippingThresholdBDT', e.target.value)}
                className="h-8 text-xs"
                required
              />
              <p className="text-[11px] text-muted-foreground">{t('freeShippingThresholdHint')}</p>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Estimates Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              {t('deliveryEstimatesSection')}
            </CardTitle>
            <CardDescription className="text-xs">
              {t('deliveryEstimatesSectionDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs font-semibold block mb-2">Inside Dhaka Window</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label
                    htmlFor="estimatedDaysInsideDhakaMin"
                    className="text-[11px] text-muted-foreground"
                  >
                    {t('insideDhakaMinLabel')}
                  </Label>
                  <Input
                    id="estimatedDaysInsideDhakaMin"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.estimatedDaysInsideDhakaMin}
                    onChange={(e) => handleChange('estimatedDaysInsideDhakaMin', e.target.value)}
                    className="h-8 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="estimatedDaysInsideDhakaMax"
                    className="text-[11px] text-muted-foreground"
                  >
                    {t('insideDhakaMaxLabel')}
                  </Label>
                  <Input
                    id="estimatedDaysInsideDhakaMax"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.estimatedDaysInsideDhakaMax}
                    onChange={(e) => handleChange('estimatedDaysInsideDhakaMax', e.target.value)}
                    className="h-8 text-xs"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <Label className="text-xs font-semibold block mb-2">Outside Dhaka Window</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label
                    htmlFor="estimatedDaysOutsideDhakaMin"
                    className="text-[11px] text-muted-foreground"
                  >
                    {t('outsideDhakaMinLabel')}
                  </Label>
                  <Input
                    id="estimatedDaysOutsideDhakaMin"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.estimatedDaysOutsideDhakaMin}
                    onChange={(e) => handleChange('estimatedDaysOutsideDhakaMin', e.target.value)}
                    className="h-8 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="estimatedDaysOutsideDhakaMax"
                    className="text-[11px] text-muted-foreground"
                  >
                    {t('outsideDhakaMaxLabel')}
                  </Label>
                  <Input
                    id="estimatedDaysOutsideDhakaMax"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.estimatedDaysOutsideDhakaMax}
                    onChange={(e) => handleChange('estimatedDaysOutsideDhakaMax', e.target.value)}
                    className="h-8 text-xs"
                    required
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Store & Customer Support Card */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4 text-primary" />
              {t('storeIdentitySection')}
            </CardTitle>
            <CardDescription className="text-xs">{t('storeIdentitySectionDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="storeName" className="text-xs">
                {t('storeNameLabel')}
              </Label>
              <Input
                id="storeName"
                type="text"
                value={formData.storeName}
                onChange={(e) => handleChange('storeName', e.target.value)}
                placeholder={t('storeNamePlaceholder')}
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supportEmail" className="text-xs">
                {t('supportEmailLabel')}
              </Label>
              <Input
                id="supportEmail"
                type="email"
                value={formData.supportEmail}
                onChange={(e) => handleChange('supportEmail', e.target.value)}
                placeholder={t('supportEmailPlaceholder')}
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supportPhone" className="text-xs">
                {t('supportPhoneLabel')}
              </Label>
              <Input
                id="supportPhone"
                type="text"
                value={formData.supportPhone}
                onChange={(e) => handleChange('supportPhone', e.target.value)}
                placeholder={t('supportPhonePlaceholder')}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supportHours" className="text-xs">
                {t('supportHoursLabel')}
              </Label>
              <Input
                id="supportHours"
                type="text"
                value={formData.supportHours}
                onChange={(e) => handleChange('supportHours', e.target.value)}
                placeholder={t('supportHoursPlaceholder')}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="storeAddress" className="text-xs">
                {t('storeAddressLabel')}
              </Label>
              <Input
                id="storeAddress"
                type="text"
                value={formData.storeAddress}
                onChange={(e) => handleChange('storeAddress', e.target.value)}
                placeholder={t('storeAddressPlaceholder')}
                className="h-8 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Audit & Metadata Card */}
        {currentSettings && (
          <Card className="md:col-span-2 bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider font-semibold">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                {t('auditSection')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground mr-1.5">{t('lastUpdatedLabel')}:</span>
                {new Date(currentSettings.updatedAt).toLocaleString()}
              </div>
              <div>
                <span className="font-medium text-foreground mr-1.5">{t('updatedByLabel')}:</span>
                {currentSettings.updatedByUser?.name ||
                  currentSettings.updatedByUser?.email ||
                  t('neverUpdated')}
              </div>
              <div className="ml-auto">
                <Badge variant="outline" className="text-[10px]">
                  Row ID: {currentSettings.id}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </form>
  );
}
