export interface AuthenticatedPrincipal {
  readonly id: string;
  readonly role?: 'Owner' | 'Admin' | 'Stylist';
  readonly salonId?: string;
}
