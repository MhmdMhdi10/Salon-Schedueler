import type { PaymentGateway } from './payment-gateway.interface';

/**
 * Mock payment gateway for development. Always succeeds immediately.
 *
 * Instead of redirecting to a real payment page, this returns a redirect URL
 * that points back to the frontend owner subscription page. The subscription
 * activation is handled by setting up a GET callback route that auto-verifies.
 *
 * The mock also exposes `pendingAuthorities` so the callback handler can
 * auto-verify any mock authority.
 */
export class MockGateway implements PaymentGateway {
  /** Track issued authorities so verify always succeeds for them. */
  static pendingAuthorities = new Set<string>();

  constructor(_options?: { callbackBaseUrl?: string }) {}

  async request(
    amountRial: number,
    callbackUrl: string,
    _meta: { description?: string; email?: string; mobile?: string },
  ): Promise<{ authority: string; redirectUrl: string }> {
    const authority = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    MockGateway.pendingAuthorities.add(authority);

    // Build redirect URL that goes through the backend API (accessible via
    // the Vite proxy on the same host the browser uses). Extract the path.
    let callbackPath: string;
    try {
      callbackPath = new URL(callbackUrl).pathname;
    } catch {
      callbackPath = callbackUrl;
    }

    // The redirect goes to /api<callbackPath>?Authority=...&Status=OK
    // The browser will hit the Vite proxy which forwards to the backend.
    const redirectUrl = `/api${callbackPath}?Authority=${authority}&Status=OK`;

    console.log(
      `[mock-gateway] payment request: ${amountRial} Rial, authority=${authority}`,
    );
    console.log(`[mock-gateway] redirect → ${redirectUrl}`);

    return { authority, redirectUrl };
  }

  async verify(
    authority: string,
    _amountRial: number,
  ): Promise<{ ok: boolean; refId?: string }> {
    // Always succeed for mock authorities
    const ok = authority.startsWith('mock-') || MockGateway.pendingAuthorities.has(authority);
    if (ok) {
      MockGateway.pendingAuthorities.delete(authority);
    }
    console.log(`[mock-gateway] verify: authority=${authority} → ${ok ? 'OK' : 'FAIL'}`);
    return { ok, refId: ok ? `mock-ref-${Date.now()}` : undefined };
  }

  async refund(
    refId: string,
    _amountRial: number,
  ): Promise<{ ok: boolean }> {
    console.log(`[mock-gateway] refund: refId=${refId} → OK`);
    return { ok: true };
  }
}
