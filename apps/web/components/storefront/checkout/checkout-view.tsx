'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useAuth } from '@/components/auth/auth-provider';
import { useCart } from '@/components/storefront/cart/cart-provider';
import {
  validateCheckoutApi,
  getAddressesApi,
  submitCodCheckoutApi,
  submitOnlineCheckoutApi,
  apiClient,
  ApiError,
} from '@/lib/api-client';
import type { PaymentMethod } from '@/lib/order-types';
import type { CheckoutValidationResult, SelectedAddressSummary } from '@/lib/checkout-types';
import { AddressSelector } from './address-selector';
import { CheckoutItemsReview } from './checkout-items-review';
import { PaymentMethodSelector } from './payment-method-selector';
import { OrderSummaryCard } from './order-summary-card';
import { Button } from '@/components/ui/button';
import {
  MailCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ShoppingCart,
  ArrowLeft,
} from 'lucide-react';

export function CheckoutView() {
  const t = useTranslations('checkout');
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { cart, applyCoupon, removeCoupon, refreshCart } = useCart();

  // Addresses State
  const [addresses, setAddresses] = useState<SelectedAddressSummary[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [hasLoadedAddresses, setHasLoadedAddresses] = useState(false);
  const isLoadingAddresses = !hasLoadedAddresses && Boolean(user?.emailVerified);

  // Validation State
  const [validationResult, setValidationResult] = useState<CheckoutValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Price Change Acknowledgement (Clarification #1)
  const [isPriceAcknowledged, setIsPriceAcknowledged] = useState(false);

  // Email Resend State (Final Clarification)
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [resendFeedback, setResendFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Order Submission State
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [alternativePhone, setAlternativePhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Fetch Saved Addresses on mount/user change
  useEffect(() => {
    let ignore = false;
    if (!user?.emailVerified) {
      return;
    }

    getAddressesApi()
      .then((res) => {
        if (!ignore) {
          setAddresses(res.addresses);
          setSelectedAddressId((prev) => {
            if (prev && res.addresses.some((a) => a.id === prev)) {
              return prev;
            }
            const defaultAddr = res.addresses.find((a) => a.isDefault);
            return defaultAddr ? defaultAddr.id : (res.addresses[0]?.id ?? null);
          });
          setHasLoadedAddresses(true);
        }
      })
      .catch(() => {
        if (!ignore) {
          setHasLoadedAddresses(true);
        }
      });

    return () => {
      ignore = true;
    };
  }, [user?.emailVerified]);

  // 2. Perform Checkout Pre-Validation on address or cart change
  useEffect(() => {
    let ignore = false;
    if (!user?.emailVerified || isLoadingAddresses) {
      return;
    }

    validateCheckoutApi(selectedAddressId ? { addressId: selectedAddressId } : {})
      .then((result) => {
        if (!ignore) {
          setValidationResult(result);
          setValidationError(null);
          setIsValidating(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setValidationError(err instanceof ApiError ? err.message : t('validationGenericError'));
          setIsValidating(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [user, selectedAddressId, isLoadingAddresses, cart?.coupon?.id, t]);

  // Handle Address Switch
  const handleSelectAddress = async (id: string) => {
    setSelectedAddressId(id);
    setIsValidating(true);
    setValidationError(null);
    try {
      const result = await validateCheckoutApi({ addressId: id });
      setValidationResult(result);
    } catch (err) {
      setValidationError(err instanceof ApiError ? err.message : t('validationGenericError'));
    } finally {
      setIsValidating(false);
    }
  };

  // Handle Refreshing addresses after modal creation
  const handleRefreshAddresses = useCallback(async () => {
    try {
      const res = await getAddressesApi();
      setAddresses(res.addresses);
      setHasLoadedAddresses(true);
      const defaultAddr = res.addresses.find((a) => a.isDefault);
      const targetId = defaultAddr ? defaultAddr.id : (res.addresses[0]?.id ?? null);
      if (targetId) {
        setSelectedAddressId(targetId);
        setIsValidating(true);
        const result = await validateCheckoutApi({ addressId: targetId });
        setValidationResult(result);
        setIsValidating(false);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  // Handle Coupon operations
  const handleApplyCoupon = async (code: string) => {
    await applyCoupon(code);
    setIsValidating(true);
    try {
      const result = await validateCheckoutApi(
        selectedAddressId ? { addressId: selectedAddressId } : {},
      );
      setValidationResult(result);
    } catch {
      // Handled
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemoveCoupon = async () => {
    await removeCoupon();
    setIsValidating(true);
    try {
      const result = await validateCheckoutApi(
        selectedAddressId ? { addressId: selectedAddressId } : {},
      );
      setValidationResult(result);
    } catch {
      // Handled
    } finally {
      setIsValidating(false);
    }
  };

  // Handle Email Verification Resend (Final Clarification)
  const handleResendVerification = async () => {
    setIsResendingEmail(true);
    setResendFeedback(null);
    try {
      await apiClient('/api/auth/resend-verification', { method: 'POST' });
      setResendFeedback({
        type: 'success',
        message: t('resendSuccessNotice'),
      });
    } catch (err) {
      setResendFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : t('resendErrorNotice'),
      });
    } finally {
      setIsResendingEmail(false);
    }
  };

  // Handle Place Order (COD or Online)
  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      setValidationError(t('blockerAddressRequired'));
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      if (paymentMethod === 'SSLCOMMERZ') {
        const res = await submitOnlineCheckoutApi({
          addressId: selectedAddressId,
          deliveryNotes: deliveryNotes.trim() || undefined,
          alternativePhone: alternativePhone.trim() || undefined,
          acknowledgedLivePrices: isPriceAcknowledged,
        });

        // Update client-side cart state
        await refreshCart();

        // Redirect to SSLCommerz gateway
        if (res.gatewayUrl) {
          window.location.href = res.gatewayUrl;
        } else {
          throw new Error('No gateway URL received from server');
        }
      } else {
        const res = await submitCodCheckoutApi({
          addressId: selectedAddressId,
          deliveryNotes: deliveryNotes.trim() || undefined,
          alternativePhone: alternativePhone.trim() || undefined,
          acknowledgedLivePrices: isPriceAcknowledged,
        });

        // Update client-side cart state
        await refreshCart();

        // Navigate to order confirmation
        router.push(`/checkout/confirmation/${encodeURIComponent(res.order.orderNumber)}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRICE_CHANGE_ACKNOWLEDGEMENT_REQUIRED') {
        setIsPriceAcknowledged(false);
        setIsValidating(true);
        try {
          const freshValidation = await validateCheckoutApi({ addressId: selectedAddressId });
          setValidationResult(freshValidation);
        } catch {
          // ignore
        } finally {
          setIsValidating(false);
        }
        setValidationError(err.message);
      } else {
        setValidationError(err instanceof ApiError ? err.message : t('validationGenericError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // Final Clarification: Blocking State for Unverified Customer
  // -------------------------------------------------------------
  if (!isAuthLoading && user && !user.emailVerified) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-card border-2 border-amber-500/30 rounded-2xl p-6 md:p-8 text-center space-y-5 shadow-sm">
          <div className="size-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
            <MailCheck className="size-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl md:text-2xl font-black text-foreground">
              {t('emailVerificationRequiredTitle')}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
              {t('emailVerificationRequiredMessage', { email: user.email })}
            </p>
          </div>

          {resendFeedback && (
            <div
              className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 ${
                resendFeedback.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}
            >
              {resendFeedback.type === 'success' ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <AlertCircle className="size-4 shrink-0" />
              )}
              <span>{resendFeedback.message}</span>
            </div>
          )}

          <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              type="button"
              onClick={handleResendVerification}
              disabled={isResendingEmail}
              className="w-full sm:w-auto h-10 px-5 text-xs font-bold gap-2"
            >
              {isResendingEmail ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{t('resendingEmail')}</span>
                </>
              ) : (
                <>
                  <MailCheck className="size-4" />
                  <span>{t('resendVerificationEmail')}</span>
                </>
              )}
            </Button>

            <Link href="/cart">
              <Button
                variant="outline"
                className="w-full sm:w-auto h-10 px-5 text-xs font-semibold gap-1.5"
              >
                <ArrowLeft className="size-3.5" />
                <span>{t('returnToCart')}</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Initial Loading Skeleton
  if (isAuthLoading || (isLoadingAddresses && !validationResult)) {
    return (
      <div className="max-w-6xl mx-auto py-12 px-4 flex flex-col items-center justify-center min-h-[400px] text-center space-y-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm font-semibold text-muted-foreground">{t('preparingCheckout')}</p>
      </div>
    );
  }

  // Cart Empty State
  const isCartEmpty = !validationResult || validationResult.items.length === 0;

  if (!isValidating && isCartEmpty) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="size-16 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
          <ShoppingCart className="size-8 opacity-40" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">{t('emptyCartTitle')}</h1>
          <p className="text-xs text-muted-foreground">{t('emptyCartDescription')}</p>
        </div>
        <Link href="/">
          <Button className="mt-2 text-xs font-bold px-6">{t('continueShopping')}</Button>
        </Link>
      </div>
    );
  }

  const selectedAddress =
    addresses.find((a) => a.id === selectedAddressId) || validationResult?.address || null;

  return (
    <div className="max-w-6xl mx-auto py-6 md:py-10 px-4 space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-foreground">
            {t('checkoutPageTitle')}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('checkoutPageSubtitle')}</p>
        </div>

        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors self-start sm:self-center"
        >
          <ArrowLeft className="size-3.5" />
          <span>{t('backToCart')}</span>
        </Link>
      </div>

      {validationError && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Main Checkout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Delivery Address, Payment Method & Cart Items Review */}
        <div className="lg:col-span-8 space-y-6">
          {/* Delivery Address Selector */}
          <AddressSelector
            addresses={addresses}
            selectedAddressId={selectedAddressId}
            onSelectAddress={handleSelectAddress}
            onRefreshAddresses={handleRefreshAddresses}
            disabled={isValidating || isSubmitting}
          />

          {/* Payment Method Selector */}
          <PaymentMethodSelector
            selectedMethod={paymentMethod}
            onSelectMethod={setPaymentMethod}
            deliveryNotes={deliveryNotes}
            onDeliveryNotesChange={setDeliveryNotes}
            alternativePhone={alternativePhone}
            onAlternativePhoneChange={setAlternativePhone}
            disabled={isValidating || isSubmitting}
          />

          {/* Cart Items Review with Price-Change Acknowledgement */}
          {validationResult && (
            <CheckoutItemsReview
              items={validationResult.items}
              hasPriceChanges={validationResult.hasPriceChanges}
              isPriceAcknowledged={isPriceAcknowledged}
              onTogglePriceAcknowledgement={setIsPriceAcknowledged}
              disabled={isValidating || isSubmitting}
            />
          )}
        </div>

        {/* Right Column: Order Summary & Place Order CTA */}
        <div className="lg:col-span-4">
          {validationResult && (
            <OrderSummaryCard
              summary={validationResult.summary}
              coupon={validationResult.coupon}
              couponNotice={validationResult.couponNotice}
              selectedAddress={selectedAddress}
              paymentMethod={paymentMethod}
              canProceed={validationResult.canProceed}
              hasPriceChanges={validationResult.hasPriceChanges}
              isPriceAcknowledged={isPriceAcknowledged}
              isEmailVerified={user?.emailVerified ?? false}
              isValidating={isValidating}
              isSubmitting={isSubmitting}
              onPlaceOrderClick={handlePlaceOrder}
              onApplyCoupon={handleApplyCoupon}
              onRemoveCoupon={handleRemoveCoupon}
            />
          )}
        </div>
      </div>
    </div>
  );
}
