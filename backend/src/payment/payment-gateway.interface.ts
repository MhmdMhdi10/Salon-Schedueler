/**
 * PaymentGateway port — abstracts the request → redirect → verify → refund flow
 * for Iranian payment gateways (Zarinpal, IDPay, Zibal).
 *
 * All amounts are in integer Iranian Rial (R10.5).
 *
 * Requirements: R10.2, R10.3, R10.5
 */
export interface PaymentGateway {
  /**
   * Request a payment from the gateway.
   * Returns an authority token and a redirect URL for the customer.
   */
  request(
    amountRial: number,
    callbackUrl: string,
    meta: { description?: string; email?: string; mobile?: string; orderId?: string },
  ): Promise<{ authority: string; redirectUrl: string }>;

  /**
   * Verify a payment after the customer returns from the gateway.
   * Returns ok=true and a refId on success.
   */
  verify(authority: string, amountRial: number): Promise<{ ok: boolean; refId?: string }>;

  /**
   * Refund a previously verified payment.
   * Returns ok=true on success.
   */
  refund(refId: string, amountRial: number): Promise<{ ok: boolean }>;
}
