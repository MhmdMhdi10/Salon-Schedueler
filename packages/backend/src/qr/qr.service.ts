import type { PrismaClient } from '@prisma/client';
import { encodeSalonQr } from '@salon/shared';

/**
 * QR_Service — owns stable per-salon QR generation, the campaign destination
 * URL, and scan counting (Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7).
 *
 * Principle: REUSE, not rewrite. The QR payload is produced by the shared
 * `@salon/shared` codec (`encodeSalonQr`) from the salon's existing, stable
 * `qrToken` field — this service never re-implements the encoding (Requirement
 * 4.2). Because `qrToken` is stable per salon, `buildSalonQrPayload` is
 * deterministic and reproducible as long as the token is unchanged (Requirement
 * 4.7, Property 7).
 */

/** Default campaign source param value attached to the QR destination URL. */
export const DEFAULT_QR_SOURCE = 'qr';

/**
 * Default public base URL for salon profile links. Mirrors the base used by the
 * shared QR codec (`https://book.salon.app/s/`). Configurable via constructor
 * options so deployments can point at their own public origin.
 */
export const DEFAULT_PUBLIC_BASE_URL = 'https://book.salon.app';

export interface QrServiceOptions {
  /**
   * Public origin (scheme + host, no trailing slash) used to build the public
   * salon profile URL `/s/:slug`. Defaults to {@link DEFAULT_PUBLIC_BASE_URL}.
   */
  publicBaseUrl?: string;
}

/**
 * Narrow view of the `qrScanEvent` Prisma delegate. Declared locally because
 * the checked-in generated Prisma client can be stale and may not yet expose
 * the `QrScanEvent` model types; the Composition_Root passes the real
 * `PrismaClient` and we reach the delegate through this narrow shape (matching
 * the cast pattern used by the subscription service).
 */
interface QrScanEventDelegate {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

export class QrService {
  private readonly prisma: PrismaClient;
  private readonly publicBaseUrl: string;
  /** Deep-link base (`<publicBaseUrl>/s/`) used to encode QR payloads. */
  private readonly qrDeepLinkBase: string;

  constructor(prisma: PrismaClient, options: QrServiceOptions = {}) {
    this.prisma = prisma;
    // Strip any trailing slash so URL concatenation stays well-formed.
    this.publicBaseUrl = (options.publicBaseUrl ?? DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
    this.qrDeepLinkBase = `${this.publicBaseUrl}/s/`;
  }

  /** Access the `qrScanEvent` delegate through the narrow local shape. */
  private get qrScanEvents(): QrScanEventDelegate {
    // The generated client may lag the schema; cast through unknown so this
    // compiles against a stale client while still hitting the real delegate.
    return (this.prisma as unknown as { qrScanEvent: QrScanEventDelegate }).qrScanEvent;
  }

  /**
   * Build the stable QR payload for a salon (Requirements 4.1, 4.2, 4.7).
   *
   * Looks up the salon's existing `qrToken` and encodes it via the shared
   * codec. The result round-trips through `parseSalonQr` and stays stable for
   * as long as `qrToken` is unchanged (Property 7).
   *
   * @throws if the salon does not exist.
   */
  async buildSalonQrPayload(salonId: string): Promise<string> {
    const salon = await this.prisma.salon.findUnique({ where: { id: salonId } });
    if (!salon) {
      throw new Error(`Salon not found: ${salonId}`);
    }
    return encodeSalonQr(salon.qrToken, this.qrDeepLinkBase);
  }

  /**
   * Build the public salon profile URL with a campaign source param
   * (Requirements 4.3, 4.4).
   *
   * Produces `<publicBaseUrl>/s/:slug?utm_source=<source>` so scans arriving
   * via the QR can be attributed and counted. Defaults the source to `qr`.
   */
  buildSalonQrUrl(slug: string, source: string = DEFAULT_QR_SOURCE): string {
    const query = new URLSearchParams({ utm_source: source }).toString();
    return `${this.publicBaseUrl}/s/${encodeURIComponent(slug)}?${query}`;
  }

  /**
   * Build the full QR surface for the owner panel standee (Requirements 4.1–4.4):
   * the stable QR payload, the campaign destination URL, and the salon name.
   *
   * The salon's `qrToken` doubles as its stable public profile slug (`/s/:slug`),
   * so the payload (encoded token) and the campaign URL stay consistent and
   * reproducible for as long as the token is unchanged (Property 7).
   *
   * @throws if the salon does not exist.
   */
  async buildSalonQrResponse(
    salonId: string,
    source: string = DEFAULT_QR_SOURCE,
  ): Promise<{ payload: string; url: string; salonName: string }> {
    const salon = await this.prisma.salon.findUnique({ where: { id: salonId } });
    if (!salon) {
      throw new Error(`Salon not found: ${salonId}`);
    }
    return {
      payload: encodeSalonQr(salon.qrToken, this.qrDeepLinkBase),
      url: this.buildSalonQrUrl(salon.qrToken, source),
      salonName: salon.name,
    };
  }

  /**
   * Record a QR scan / campaign arrival for counting (Requirements 4.4, 4.5).
   *
   * Inserts a `QrScanEvent` tagged with the salon and campaign source.
   */
  async recordScan(salonId: string, source: string): Promise<void> {
    await this.qrScanEvents.create({
      data: {
        salonId,
        source,
      },
    });
  }
}
