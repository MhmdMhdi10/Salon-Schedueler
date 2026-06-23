/** Staff roles within a salon */
export type StaffRole = 'Owner' | 'Admin' | 'Stylist';

/** Appointment lifecycle states */
export type AppointmentStatus =
  | 'held'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'expired';

/** Origin of an appointment */
export type AppointmentSource = 'web' | 'mobile' | 'walkin';

/** Payment lifecycle states */
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'retained' | 'failed';

/** Waitlist entry states */
export type WaitlistStatus = 'waiting' | 'notified' | 'fulfilled' | 'cancelled';
