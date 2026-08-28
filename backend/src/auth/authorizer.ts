import type { StaffRole } from '@salon/shared';

export type AuthorizedRole = StaffRole | 'PlatformAdmin';

/**
 * Actions that can be authorized in the booking system.
 *
 * - configure_salon: Modify salon settings, staff, chairs, services (R2.2, R2.6)
 * - manage_appointments: Create, modify, cancel ANY appointment in the salon (R2.3)
 * - manage_own_appointments: Approve/reject/manage an appointment assigned to the
 *   acting staff member (Owner/Admin: any; Stylist: only their own)
 * - view_own_appointments: View assigned appointments (R2.5)
 * - view_customer_notes: View customer notes (R14.4)
 */
export type Action =
  | 'configure_salon'
  | 'manage_appointments'
  | 'manage_own_appointments'
  | 'view_own_appointments'
  | 'view_customer_notes';

/**
 * The authenticated principal making a request.
 * Each staff account has exactly one role (R2.1).
 */
export interface Principal {
  /** Unique account/user identifier */
  id: string;
  /** The staff member's role */
  role: AuthorizedRole;
  /** The staff member's ID (used for "own only" checks) */
  staffMemberId?: string;
  /** The staff member's tenant/salon scope. */
  salonId?: string;
}

/**
 * A reference to the resource being accessed.
 * Used for ownership checks (e.g., Stylist can only view own appointments).
 */
export interface ResourceRef {
  /** The salon the resource belongs to */
  salonId?: string;
  /** The staff member the resource is associated with (for "own only" checks) */
  staffMemberId?: string;
}

/**
 * RBAC Authorizer implementing the salon booking system authorization matrix.
 *
 * Authorization matrix (from Requirements R2.2–R2.6, R14.4):
 *
 * | Action                      | Owner        | Admin | Stylist          |
 * |-----------------------------|--------------|-------|------------------|
 * | configure_salon (R2.2,R2.6) | allow always | allow | deny (R2.4)      |
 * | manage_appointments (R2.3)  | allow        | allow | deny             |
 * | manage_own_appointments     | allow        | allow | allow (own only) |
 * | view_own_appointments(R2.5) | allow        | allow | allow (own only) |
 * | view_customer_notes (R14.4) | allow        | allow | allow            |
 * | PlatformAdmin (global)      | allow       | allow | allow            |
 *
 * PlatformAdmin is a verified global operator and bypasses tenant scope.
 * Owner config access is guaranteed regardless of system state (R2.6).
 * Stylist "own only" checks compare principal.staffMemberId with resource.staffMemberId.
 */
export class Authorizer {
  /**
   * Determine whether the given principal can perform the action on the resource.
   *
   * @param principal - The authenticated user/staff member
   * @param action - The action being attempted
   * @param resource - The resource being accessed (used for ownership checks)
   * @returns true if the action is permitted, false otherwise
   */
  can(principal: Principal, action: Action, resource: ResourceRef = {}): boolean {
    // A verified platform admin is global by design and may inspect/manage any
    // salon from the shared panel switcher.
    if (principal.role === 'PlatformAdmin') return true;

    // Staff tokens are tenant-scoped. Keep legacy/unit-test principals without
    // salonId permissive, but never allow a real scoped token to cross salons.
    if (principal.salonId && resource.salonId && principal.salonId !== resource.salonId) {
      return false;
    }
    switch (principal.role) {
      case 'Owner':
        return this.canOwner(action);
      case 'Admin':
        return this.canAdmin(action);
      case 'Stylist':
        return this.canStylist(principal, action, resource);
      default:
        return false;
    }
  }

  /**
   * Owner authorization: allow all actions.
   * R2.2: Permit configuration.
   * R2.3: Permit appointment management.
   * R2.5: Permit viewing appointments/notes.
   * R2.6: Configuration access regardless of system state.
   */
  private canOwner(_action: Action): boolean {
    // Owner always has access to everything (R2.2, R2.3, R2.5, R2.6)
    return true;
  }

  /**
   * Admin authorization: full salon-panel access, same as Owner.
   * Stylist remains the restricted role.
   */
  private canAdmin(_action: Action): boolean {
    return true;
  }

  /**
   * Stylist authorization:
   * - deny configure_salon (R2.4)
   * - deny manage_appointments
   * - allow view_own_appointments only for own resources (R2.5)
   * - allow view_customer_notes (R14.4)
   */
  private canStylist(principal: Principal, action: Action, resource: ResourceRef): boolean {
    switch (action) {
      case 'configure_salon':
        // R2.4: Stylist cannot modify salon configuration
        return false;

      case 'manage_appointments':
        // Stylists cannot create/modify/cancel arbitrary appointments
        return false;

      case 'manage_own_appointments':
        // R2.5-style ownership: a Stylist may approve/reject/manage a booking
        // only when it is assigned to them (resource.staffMemberId === own).
        return this.isOwnResource(principal, resource);

      case 'view_own_appointments':
        // R2.5: Stylist can only view their own assigned appointments
        return this.isOwnResource(principal, resource);

      case 'view_customer_notes':
        // R14.4: Owner, Admin, or Stylist can view customer notes
        return true;

      default:
        return false;
    }
  }

  /**
   * Check whether the principal owns the resource.
   * Compares principal.staffMemberId with resource.staffMemberId.
   * If either is undefined, the ownership check fails (deny by default).
   */
  private isOwnResource(principal: Principal, resource: ResourceRef): boolean {
    if (!principal.staffMemberId || !resource.staffMemberId) {
      return false;
    }
    return principal.staffMemberId === resource.staffMemberId;
  }
}
