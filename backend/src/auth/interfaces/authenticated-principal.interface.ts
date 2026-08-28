export interface AuthenticatedPrincipal {
  readonly id: string;
  readonly role?: 'Owner' | 'Admin' | 'Stylist' | 'PlatformAdmin';
  readonly salonId?: string;
}
