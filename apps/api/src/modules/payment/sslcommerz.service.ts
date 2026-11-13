import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import type { OrderWithDetails } from '../order/order.types.js';
import type { Payment } from '../../generated/client/client.js';

export interface InitiateSessionParams {
  order: OrderWithDetails;
  payment: Payment;
  customerEmail: string;
}

export interface InitiateSessionResult {
  status: 'SUCCESS';
  gatewayUrl: string;
  sessionKey: string;
}

export interface ValidateOrderResult {
  status: string; // 'VALID', 'VALIDATED', 'FAILED', 'CANCELLED', etc.
  tran_id: string;
  val_id: string;
  amount: string;
  currency: string;
  store_id: string;
  bank_tran_id?: string;
  card_type?: string;
  card_brand?: string;
  tran_date?: string;
  raw: Record<string, unknown>;
}

export interface SslcommerzRefundParams {
  bankTranId: string;
  refundAmount: number; // in integer BDT poisha
  refundRemarks: string;
  refundRefId: string; // our internal refundNumber
}

export interface SslcommerzRefundResult {
  status: 'SUCCESS' | 'FAILED' | 'AMBIGUOUS';
  refundRefId?: string;
  transId?: string;
  errorReason?: string;
  raw: Record<string, unknown>;
}

export class SslcommerzService {
  private getBaseUrl(): string {
    return env.SSLCOMMERZ_IS_SANDBOX
      ? 'https://sandbox.sslcommerz.com'
      : 'https://securepay.sslcommerz.com';
  }

  /**
   * Initiates an online checkout session with SSLCommerz gateway.
   * Runs outside database transactions.
   */
  async initiateSession(params: InitiateSessionParams): Promise<InitiateSessionResult> {
    const { order, payment, customerEmail } = params;
    const baseUrl = this.getBaseUrl();
    const endpoint = `${baseUrl}/gwprocess/v4/api.php`;

    const totalAmount = (order.totalPayable / 100).toFixed(2);
    const productNames = order.items
      .map((item: { productName: string }) => item.productName)
      .join(', ')
      .slice(0, 250);

    const formData = new URLSearchParams();
    formData.append('store_id', env.SSLCOMMERZ_STORE_ID);
    formData.append('store_passwd', env.SSLCOMMERZ_STORE_PASSWORD);
    formData.append('total_amount', totalAmount);
    formData.append('currency', 'BDT');
    formData.append('tran_id', payment.transactionId);
    formData.append('success_url', `${env.API_BASE_URL}/api/v1/payments/sslcommerz/success`);
    formData.append('fail_url', `${env.API_BASE_URL}/api/v1/payments/sslcommerz/fail`);
    formData.append('cancel_url', `${env.API_BASE_URL}/api/v1/payments/sslcommerz/cancel`);
    formData.append('ipn_url', `${env.API_BASE_URL}/api/v1/payments/sslcommerz/ipn`);

    // Customer Information
    formData.append('cus_name', order.shippingRecipientName);
    formData.append('cus_email', customerEmail);
    formData.append('cus_add1', order.shippingStreetAddress);
    formData.append('cus_city', order.shippingDistrictId);
    formData.append('cus_country', 'Bangladesh');
    formData.append('cus_phone', order.shippingPhone);

    // Shipping Information
    formData.append('shipping_method', 'YES');
    formData.append('num_of_item', String(order.items.length));
    formData.append('ship_name', order.shippingRecipientName);
    formData.append('ship_add1', order.shippingStreetAddress);
    formData.append('ship_city', order.shippingDistrictId);
    formData.append('ship_country', 'Bangladesh');

    // Product Information
    formData.append('product_name', productNames || 'Order Items');
    formData.append('product_category', 'General');
    formData.append('product_profile', 'general');

    logger.info(
      {
        orderId: order.id,
        transactionId: payment.transactionId,
        amount: totalAmount,
        endpoint,
      },
      'Initiating SSLCommerz payment session',
    );

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });
    } catch (networkError) {
      logger.error(
        { err: networkError, transactionId: payment.transactionId },
        'SSLCommerz network connection error during session initiation',
      );
      throw new Error(
        `SSLCommerz network connection failed: ${networkError instanceof Error ? networkError.message : 'Unknown network error'}`,
      );
    }

    if (!res.ok) {
      const errorText = await res.text();
      logger.error(
        { status: res.status, errorText, transactionId: payment.transactionId },
        'SSLCommerz gateway returned non-200 status',
      );
      throw new Error(`SSLCommerz gateway returned HTTP ${res.status}: ${errorText}`);
    }

    let data: Record<string, unknown>;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      const errorText = await res.text();
      throw new Error(`SSLCommerz returned non-JSON response: ${errorText}`);
    }

    if (data.status !== 'SUCCESS' || typeof data.GatewayPageURL !== 'string') {
      const reason = String(data.failedreason || data.status || 'Session initiation failed');
      logger.warn(
        { response: data, transactionId: payment.transactionId },
        'SSLCommerz session initiation rejected by gateway',
      );
      throw new Error(`SSLCommerz session initiation rejected: ${reason}`);
    }

    return {
      status: 'SUCCESS',
      gatewayUrl: data.GatewayPageURL,
      sessionKey: String(data.sessionkey || ''),
    };
  }

  /**
   * Authoritatively queries the SSLCommerz Order Validation API for a given val_id.
   * Runs outside database transactions.
   */
  async validateOrder(valId: string): Promise<ValidateOrderResult> {
    const baseUrl = this.getBaseUrl();
    const query = new URLSearchParams({
      val_id: valId,
      store_id: env.SSLCOMMERZ_STORE_ID,
      store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
      v: '1',
      format: 'json',
    });

    const endpoint = `${baseUrl}/validator/api/validationserverAPI.php?${query.toString()}`;

    logger.info({ valId }, 'Calling SSLCommerz order validation API');

    let res: Response;
    try {
      res = await fetch(endpoint, { method: 'GET' });
    } catch (networkError) {
      logger.error({ err: networkError, valId }, 'SSLCommerz validation API network error');
      throw new Error(
        `SSLCommerz validation API request failed: ${networkError instanceof Error ? networkError.message : 'Network error'}`,
      );
    }

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, text, valId }, 'SSLCommerz validation API non-200');
      throw new Error(`SSLCommerz validation API HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as Record<string, unknown>;

    return {
      status: String(data.status || ''),
      tran_id: String(data.tran_id || ''),
      val_id: String(data.val_id || valId),
      amount: String(data.amount || ''),
      currency: String(data.currency || ''),
      store_id: String(data.store_id || ''),
      bank_tran_id: data.bank_tran_id ? String(data.bank_tran_id) : undefined,
      card_type: data.card_type ? String(data.card_type) : undefined,
      card_brand: data.card_brand ? String(data.card_brand) : undefined,
      tran_date: data.tran_date ? String(data.tran_date) : undefined,
      raw: data,
    };
  }

  /**
   * Initiates a refund request with SSLCommerz gateway for an online payment.
   * Runs strictly outside database transactions.
   */
  async initiateRefund(params: SslcommerzRefundParams): Promise<SslcommerzRefundResult> {
    const { bankTranId, refundAmount, refundRemarks, refundRefId } = params;
    const baseUrl = this.getBaseUrl();
    const endpoint = `${baseUrl}/validator/api/merchantTransIDvalidationAPI.php`;

    const decimalAmount = (refundAmount / 100).toFixed(2);
    const query = new URLSearchParams({
      refund_amount: decimalAmount,
      refund_remarks: refundRemarks || `Refund ${refundRefId}`,
      bank_tran_id: bankTranId,
      refe_id: refundRefId,
      store_id: env.SSLCOMMERZ_STORE_ID,
      store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
      v: '1',
      format: 'json',
    });

    logger.info(
      { bankTranId, refundRefId, decimalAmount },
      'Calling SSLCommerz merchantTransIDvalidationAPI for refund initiation',
    );

    let res: Response;
    try {
      res = await fetch(`${endpoint}?${query.toString()}`, { method: 'GET' });
    } catch (networkError) {
      logger.error(
        { err: networkError, refundRefId, bankTranId },
        'SSLCommerz refund initiation network error (ambiguous outcome)',
      );
      return {
        status: 'AMBIGUOUS',
        errorReason: networkError instanceof Error ? networkError.message : 'Network timeout/error',
        raw: {},
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error(
        { status: res.status, text, refundRefId, bankTranId },
        'SSLCommerz refund initiation returned non-200 (ambiguous outcome)',
      );
      return {
        status: 'AMBIGUOUS',
        errorReason: `SSLCommerz HTTP ${res.status}: ${text}`,
        raw: { httpStatus: res.status, text },
      };
    }

    let data: Record<string, unknown>;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      const text = await res.text().catch(() => '');
      return {
        status: 'AMBIGUOUS',
        errorReason: `SSLCommerz returned non-JSON response: ${text}`,
        raw: { text },
      };
    }

    const gatewayStatus = String(data.status || '').toLowerCase();
    if (gatewayStatus === 'success') {
      return {
        status: 'SUCCESS',
        refundRefId: data.refund_ref_id ? String(data.refund_ref_id) : refundRefId,
        transId: data.trans_id ? String(data.trans_id) : undefined,
        raw: data,
      };
    }

    if (gatewayStatus === 'failed' || gatewayStatus === 'cancelled') {
      const reason = String(data.errorReason || data.failedreason || 'Gateway rejected refund');
      return {
        status: 'FAILED',
        errorReason: reason,
        raw: data,
      };
    }

    // Any other or pending status from gateway is ambiguous
    return {
      status: 'AMBIGUOUS',
      errorReason: String(data.errorReason || data.status || 'Ambiguous gateway refund status'),
      refundRefId: data.refund_ref_id ? String(data.refund_ref_id) : undefined,
      raw: data,
    };
  }

  /**
   * Queries the definitive status of an in-flight refund attempt with SSLCommerz.
   * Runs strictly outside database transactions.
   */
  async queryRefundStatus(refundRefId: string): Promise<SslcommerzRefundResult> {
    const baseUrl = this.getBaseUrl();
    const endpoint = `${baseUrl}/validator/api/merchantTransIDvalidationAPI.php`;

    const query = new URLSearchParams({
      refund_ref_id: refundRefId,
      store_id: env.SSLCOMMERZ_STORE_ID,
      store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
      v: '1',
      format: 'json',
    });

    logger.info({ refundRefId }, 'Querying SSLCommerz refund status');

    let res: Response;
    try {
      res = await fetch(`${endpoint}?${query.toString()}`, { method: 'GET' });
    } catch (networkError) {
      logger.error(
        { err: networkError, refundRefId },
        'SSLCommerz refund status query network error (ambiguous)',
      );
      return {
        status: 'AMBIGUOUS',
        errorReason: networkError instanceof Error ? networkError.message : 'Network error',
        raw: {},
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        status: 'AMBIGUOUS',
        errorReason: `SSLCommerz HTTP ${res.status}: ${text}`,
        raw: { httpStatus: res.status, text },
      };
    }

    let data: Record<string, unknown>;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      return {
        status: 'AMBIGUOUS',
        errorReason: 'SSLCommerz query returned non-JSON response',
        raw: {},
      };
    }

    const gatewayStatus = String(data.status || '').toLowerCase();
    if (gatewayStatus === 'success') {
      return {
        status: 'SUCCESS',
        refundRefId: data.refund_ref_id ? String(data.refund_ref_id) : refundRefId,
        transId: data.trans_id ? String(data.trans_id) : undefined,
        raw: data,
      };
    }

    if (gatewayStatus === 'failed' || gatewayStatus === 'cancelled') {
      return {
        status: 'FAILED',
        errorReason: String(
          data.errorReason || data.failedreason || 'Gateway confirmed refund failed',
        ),
        raw: data,
      };
    }

    return {
      status: 'AMBIGUOUS',
      errorReason: String(
        data.errorReason || data.status || 'Status remains processing or ambiguous',
      ),
      raw: data,
    };
  }
}

export const sslcommerzService = new SslcommerzService();
