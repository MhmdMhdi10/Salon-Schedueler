import type {
  StaffRole,
  AppointmentStatus,
  AppointmentSource,
  PaymentStatus,
  WaitlistStatus,
} from './enums.js';

/** A salon business entity */
export interface Salon {
  id: string;
  name: string;
  qrToken: string;
  timezone: string;
  createdAt: Date;
}

/** A staff member belonging to a salon */
export interface StaffMember {
  id: string;
  salonId: string;
  fullName: string;
  role: StaffRole;
  active: boolean;
}

/** A physical workstation at a salon */
export interface Chair {
  id: string;
  salonId: string;
  name: string;
  active: boolean;
}

/** Equipment that a chair may provide */
export interface Equipment {
  id: string;
  salonId: string;
  name: string;
}

/** A service offering by a salon */
export interface Service {
  id: string;
  salonId: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceRial: bigint;
  requiresDeposit: boolean;
  depositRial?: bigint;
}

/** Weekly recurring working hours for a staff member or chair */
export interface WorkingHours {
  id: string;
  ownerKind: 'staff' | 'chair';
  ownerId: string;
  weekday: number; // 0 = Saturday, ..., 6 = Friday
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/** A day off for a staff member */
export interface DayOff {
  id: string;
  staffMemberId: string;
  onDate: string; // ISO date
}

/** A period when a chair is unavailable */
export interface ChairUnavailable {
  id: string;
  chairId: string;
  periodStart: Date;
  periodEnd: Date;
}

/** A salon-wide holiday */
export interface Holiday {
  id: string;
  salonId: string;
  onDate: string; // ISO date
}

/** A customer of the salon */
export interface Customer {
  id: string;
  phone: string;
  fullName?: string;
  preferredStaffId?: string;
  noShowCount: number;
}

/** A free-text note on a customer profile */
export interface CustomerNote {
  id: string;
  customerId: string;
  authorId?: string;
  body: string;
  createdAt: Date;
}

/** An appointment (booking) */
export interface Appointment {
  id: string;
  salonId: string;
  customerId: string;
  staffMemberId: string;
  chairId: string;
  serviceId: string;
  startAt: Date;
  endAt: Date; // start + duration + buffer
  status: AppointmentStatus;
  source: AppointmentSource;
  holdExpiresAt?: Date;
  createdAt: Date;
}

/** A payment record for a deposit */
export interface Payment {
  id: string;
  appointmentId: string;
  amountRial: bigint;
  status: PaymentStatus;
  gateway: string;
  authority?: string;
  refId?: string;
  createdAt: Date;
}

/** A waitlist entry */
export interface WaitlistEntry {
  id: string;
  salonId: string;
  customerId: string;
  serviceId: string;
  windowStart: Date;
  windowEnd: Date;
  status: WaitlistStatus;
  createdAt: Date;
}

/** An OTP record */
export interface Otp {
  id: string;
  phone: string;
  codeHash: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
  invalidated: boolean;
}

/** A device token for push notifications */
export interface DeviceToken {
  id: string;
  customerId: string;
  token: string;
  platform: string;
  pushEnabled: boolean;
}

/** A notification log entry */
export interface NotificationLog {
  id: string;
  appointmentId?: string;
  channel: string;
  status: string;
  error?: string;
  createdAt: Date;
}

/** A time slot returned by the availability query */
export interface TimeSlot {
  startAt: string;
  endAt: string;
}

/** Result of a booking attempt */
export type BookingResult =
  | { status: 'confirmed'; appointment: Appointment }
  | { status: 'held'; appointment: Appointment; paymentRedirectUrl: string }
  | { status: 'rejected'; reason: 'no_availability' | 'slot_unavailable' };

/**
 * Result of parsing a QR payload. A well-formed payload always carries the
 * `salonToken`; a stylist QR additionally carries the `staffId` it was minted
 * for (absent for a plain salon QR).
 */
export type QrParseResult =
  | { kind: 'ok'; salonToken: string; staffId?: string }
  | { kind: 'malformed' };

/** Gregorian date components */
export interface GregorianDate {
  year: number;
  month: number;
  day: number;
}

/** Jalali date components */
export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}
