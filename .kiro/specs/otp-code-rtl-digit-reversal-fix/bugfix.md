# Bugfix Requirements Document

## Introduction

On the phone + OTP login screen (`/auth`), the 6-digit verification code is sent to the backend in the wrong order. In the Persian, right-to-left (RTL) UI, the digits the user reads left-to-right in the OTP boxes (for example `133389`) are submitted to the verify endpoint reversed (for example `983331`). Because the reversed string never matches the issued one-time code, verification always fails and the screen shows a generic failure ("Request failed" / invalid code), blocking every affected user from logging in.

The defect is isolated to the verification code. The phone number is sent correctly; only the assembled `code` value is reversed. The affected flow lives in the web auth area:

- `packages/web/src/pages/AuthPage.tsx` — the OTP step renders six single-digit boxes from the `code` string array and assembles the submitted value with `codeValue = code.join('')`, then calls `authApi.verifyOtp(normalizedPhone, codeValue)` on submit.
- `packages/web/src/api/client.ts` — `authApi.verifyOtp(phone, code)` POSTs `{ phone, code }` to `/auth/otp/verify`.

The root cause is a digit-ordering mismatch in the RTL layout: the order in which the entered digits are concatenated into the submitted string does not match the left-to-right visual order of the boxes, so the assembled code is the reverse of what the user sees and intends.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user enters a complete 6-digit OTP into the verification boxes and submits, THEN the system submits the digit string in the reverse of the order the boxes are displayed left-to-right (entered/displayed `133389` is sent as `983331`).

1.2 WHEN the reversed code is sent to `/auth/otp/verify`, THEN the system fails verification and shows a generic error because the reversed string does not match the issued one-time code, even though the user entered the correct digits.

1.3 WHEN a user enters the correct OTP in the RTL layout, THEN the system never allows login because the only string it ever submits is the reversed sequence.

### Expected Behavior (Correct)

2.1 WHEN a user enters a complete 6-digit OTP into the verification boxes and submits, THEN the system SHALL submit the digits in the same order they are displayed and read left-to-right (entered/displayed `133389` is sent as `133389`).

2.2 WHEN the user-entered digits match the issued one-time code, THEN the system SHALL pass verification, store the returned tokens, and proceed with login instead of showing a failure.

2.3 WHEN the assembled code is submitted regardless of the surrounding RTL page direction, THEN the system SHALL preserve the entered digit order so the submitted value is direction-independent.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user enters a valid phone number, THEN the system SHALL CONTINUE TO normalize and submit the phone correctly to the OTP request and verify endpoints.

3.2 WHEN a user pastes a full 6-digit code into the OTP boxes, THEN the system SHALL CONTINUE TO populate the boxes left-to-right and submit the digits in the displayed order.

3.3 WHEN a user types digit-by-digit, uses auto-advance, or presses backspace to move to the previous box, THEN the system SHALL CONTINUE TO behave as it does today for entry and focus movement.

3.4 WHEN Persian (Eastern-Arabic) digits are entered, THEN the system SHALL CONTINUE TO normalize them to Latin digits before submission.

3.5 WHEN the OTP screen is rendered, THEN the system SHALL CONTINUE TO display the Persian/RTL layout, the resend timer, and the inline error region unchanged.
