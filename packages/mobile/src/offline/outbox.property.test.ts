import * as fc from 'fast-check';
import { SubmissionOutbox, BookingPayload } from './outbox';

/**
 * Feature: salon-booking-system, Property 19: Offline submission preservation
 *
 * For any booking submission that fails because of a network error,
 * the submission is preserved unchanged in the mobile app's local outbox
 * and the failure is reported to the customer, so the preserved submission
 * is recoverable.
 *
 * **Validates: Requirements 18.5**
 */
describe('Property 19: Offline submission preservation', () => {
  const bookingPayloadArb: fc.Arbitrary<BookingPayload> = fc.record({
    salonId: fc.uuid(),
    serviceId: fc.uuid(),
    startAt: fc.integer({ min: 1704067200000, max: 1798761600000 })
      .map((ts) => new Date(ts).toISOString()),
    preferredStaffId: fc.option(fc.uuid(), { nil: undefined }),
  });

  const networkErrorArb = fc.oneof(
    fc.constant('NetworkError: Failed to fetch'),
    fc.constant('TypeError: Network request failed'),
    fc.constant('timeout'),
    fc.string({ minLength: 1, maxLength: 100 }),
  );

  it('preserves the submission payload unchanged in the outbox after a network failure', () => {
    fc.assert(
      fc.property(
        bookingPayloadArb,
        networkErrorArb,
        (payload, errorMsg) => {
          const outbox = new SubmissionOutbox();

          // Simulate network failure: enqueue in outbox
          const entryId = outbox.enqueue(payload, errorMsg);

          // The entry must exist
          const entry = outbox.get(entryId);
          expect(entry).toBeDefined();

          // The payload must be preserved unchanged
          expect(entry!.payload).toEqual(payload);
          expect(entry!.payload.salonId).toBe(payload.salonId);
          expect(entry!.payload.serviceId).toBe(payload.serviceId);
          expect(entry!.payload.startAt).toBe(payload.startAt);
          expect(entry!.payload.preferredStaffId).toBe(payload.preferredStaffId);

          // The failure is reported (error field is set)
          expect(entry!.error).toBe(errorMsg);
          expect(entry!.status).toBe('pending');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('preserves multiple submissions in FIFO order and all are recoverable', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(bookingPayloadArb, networkErrorArb), { minLength: 1, maxLength: 20 }),
        (submissions) => {
          const outbox = new SubmissionOutbox();
          const ids: string[] = [];

          // Enqueue all failed submissions
          for (const [payload, error] of submissions) {
            ids.push(outbox.enqueue(payload, error));
          }

          // All entries must be recoverable
          expect(outbox.size).toBe(submissions.length);

          const pending = outbox.getPending();
          expect(pending.length).toBe(submissions.length);

          // Each submission is preserved with its original payload
          for (let i = 0; i < submissions.length; i++) {
            const entry = outbox.get(ids[i]);
            expect(entry).toBeDefined();
            expect(entry!.payload).toEqual(submissions[i][0]);
            expect(entry!.error).toBe(submissions[i][1]);
          }

          // FIFO ordering preserved
          for (let i = 1; i < pending.length; i++) {
            expect(pending[i].createdAt).toBeGreaterThanOrEqual(pending[i - 1].createdAt);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('a preserved submission remains recoverable after retry failures', () => {
    fc.assert(
      fc.property(
        bookingPayloadArb,
        networkErrorArb,
        fc.nat({ max: 5 }),
        (payload, initialError, retryCount) => {
          const outbox = new SubmissionOutbox();
          const id = outbox.enqueue(payload, initialError);

          // Simulate multiple retry failures
          for (let i = 0; i < retryCount; i++) {
            outbox.markFailed(id, `retry_error_${i}`);
            outbox.resetToPending(id);
          }

          // The original payload must still be preserved unchanged
          const entry = outbox.get(id);
          expect(entry).toBeDefined();
          expect(entry!.payload).toEqual(payload);
          expect(entry!.status).toBe('pending');
        }
      ),
      { numRuns: 100 }
    );
  });
});
