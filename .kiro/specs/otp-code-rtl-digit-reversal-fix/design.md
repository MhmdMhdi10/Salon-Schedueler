# OTP Code RTL Digit Reversal Fix — Bugfix Design

## Overview

On the phone + OTP login screen (`/auth`), a user reads the six verification digits
left-to-right in the boxes (for example `133389`) but the value submitted to
`POST /auth/otp/verify` is the reverse of that reading order (for example `983331`).
Because the reversed string never matches the issued one-time code, every affected user
is blocked from logging in.

The submission path itself is faithful: `codeValue = code.join('')` concatenates the
`code` array in index order (`code[0]` → `code[5]`), `authApi.verifyOtp(normalizedPhone, codeValue)`
sends that string verbatim, and `normalizeDigits` is an index-preserving character map.
None of these reverse anything. The defect is an **ordering mismatch between the visual
left-to-right reading order of the boxes and the index order that `code.join('')` walks**:
in the `dir="rtl"` document, the six boxes do not lay out so that `code[0]` is the
leftmost box. The screenshot proves the divergence — the digit the user reads as first
(leftmost) ends up last in the joined string, so the submitted value is the visual reverse
of the displayed code.

The fix is small and targeted: make the box the user reads as leftmost always be `code[0]`
(and rightmost always `code[5]`) in a way the surrounding RTL direction cannot defeat, so
that `code.join('')` reads the digits in exactly the order the user sees them. The phone
field, paste behaviour, auto-advance, backspace, Persian-digit normalization, and the
RTL/timer/error chrome are all left unchanged. A regression test pins the invariant
"submitted code equals the displayed left-to-right order".

The affected files:

- `packages/web/src/pages/AuthPage.tsx` — the OTP step renders six single-digit boxes from
  the `code` string array and assembles the submitted value with `code.join('')`.
- `packages/web/src/api/client.ts` — `authApi.verifyOtp(phone, code)` POSTs `{ phone, code }`
  unchanged (no fix needed here; confirmed as a non-reversing pass-through).

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a complete 6-digit code is
  entered/displayed left-to-right as a non-palindrome string `D`, yet the value assembled
  for submission equals `reverse(D)` rather than `D`.
- **Property (P)**: The desired behaviour — for any complete code, the submitted string
  equals the digits in the same order the user reads them left-to-right (`D`), independent
  of the surrounding page direction.
- **Preservation**: Existing behaviour that must remain unchanged — phone normalization and
  submission, full-paste fill order, per-key auto-advance, backspace-to-previous, Persian
  (Eastern-Arabic) digit normalization, and the RTL layout / resend timer / inline error region.
- **`code`**: The `string[]` of length `OTP_LENGTH` (6) in `AuthPageContent` holding one
  digit per box; `code[i]` is the digit for the box at array index `i`.
- **`codeValue`**: `code.join('')` — the assembled string sent as the `code` field to
  `verifyOtp`. It always walks `code[0]` → `code[5]`.
- **Reading order**: The order a user reads the boxes visually, left-to-right, regardless of
  the page's `dir`. The fix's goal is reading-order == index order (`code[0]` leftmost).
- **`dir="rtl"` document**: The app renders inside `<html lang="fa" dir="rtl">` (see
  `packages/web/index.html`); every subtree inherits RTL flow unless explicitly overridden.

## Bug Details

### Bug Condition

The bug manifests when a user enters a complete 6-digit OTP into the verification boxes and
submits, in the `dir="rtl"` document, and the code is not a palindrome. The box the user
reads as the leftmost (first) digit is not `code[0]`; instead the six boxes lay out in the
RTL inline direction so that `code[0]` is the rightmost box and `code[5]` is the leftmost.
`codeValue = code.join('')` then walks `code[0]` → `code[5]` (right-to-left relative to what
the user sees), so the submitted string is the visual reverse of the displayed code. The
`dir="ltr"` attribute on the OTP row, intended to pin the boxes to left-to-right array
order, is being defeated by the inherited RTL direction (confirmed by the captured payload).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type OtpEntry { displayedDigits: string  // what the user reads L→R
                                   submittedCode:  string } // what verifyOtp receives
  OUTPUT: boolean

  RETURN length(input.displayedDigits) == OTP_LENGTH        // a complete 6-digit code
         AND allDigits(input.displayedDigits)               // every box filled with 0-9
         AND input.submittedCode == reverse(input.displayedDigits)
         AND input.displayedDigits != reverse(input.displayedDigits)  // non-palindrome: observable
END FUNCTION
```

Equivalently, in terms of the component's internal state: the bug holds whenever the
leftmost rendered box (reading order position 1) is bound to `code[OTP_LENGTH - 1]` instead
of `code[0]`, so that `code.join('')` produces the reverse of the reading order.

### Examples

- User reads/types `133389` left-to-right → `verifyOtp` is called with `983331` → verification
  fails with a generic error although the digits are correct. (The reported screenshot case.)
- User reads/types `123456` left-to-right → submitted as `654321` → fails.
- User reads/types `100000` left-to-right → submitted as `000001` → fails.
- Palindrome edge case: user reads/types `123321` → submitted as `123321` → happens to pass;
  the defect is present but not observable because reverse equals the original. (This is why
  the bug condition excludes palindromes — they cannot demonstrate the reversal.)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The phone step SHALL continue to normalize (`normalizePhone`/`normalizeDigits`) and submit
  the phone correctly to `requestOtp` and `verifyOtp` (Requirements 3.1).
- Pasting a full 6-digit code into the boxes SHALL continue to populate the boxes
  left-to-right and submit the digits in the displayed order (Requirements 3.2).
- Typing digit-by-digit, auto-advance to the next box, and backspace-to-previous SHALL
  continue to behave exactly as today for entry and focus movement (Requirements 3.3).
- Persian (Eastern-Arabic) digits entered into the boxes SHALL continue to be normalized to
  Latin digits before submission (Requirements 3.4).
- The OTP screen SHALL continue to render the Persian/RTL layout, the resend timer in
  Persian digits, and the inline `role="alert"` error region unchanged (Requirements 3.5).

**Scope:**
All inputs that do NOT involve assembling and submitting a complete OTP in reading order
should be completely unaffected by this fix. This includes:
- The phone-number entry, validation, and submission flow.
- Focus management (auto-advance, backspace), which already operates in array-index order.
- Digit normalization for both phone and OTP inputs.
- The visual chrome: card layout, legend/labels, resend timer, change-phone control, and the
  error region. The boxes must still read left-to-right and the page must stay RTL overall.

**Note:** The expected correct behaviour for buggy inputs is defined in the Correctness
Properties section (Property 1). This section enumerates what must NOT change.

## Hypothesized Root Cause

The submission code (`code.join('')`), the API client, and `normalizeDigits` are all
index-preserving and do not reverse anything — verified by reading
`packages/web/src/pages/AuthPage.tsx`, `packages/web/src/api/client.ts`, and
`packages/shared/src/digits/index.ts`. Tailwind is configured with `plugins: []`
(`packages/web/tailwind.config.js`), so there is no RTL plugin rewriting `flex-row` to
`flex-row-reverse`, and `packages/web/src/styles/tokens.css` declares no `direction`
override. The reversal is therefore a **layout/ordering** mismatch, not a string transform.
The most likely causes, in order:

1. **RTL inline direction defeats the `dir="ltr"` attribute on the OTP row.** The boxes live
   inside `<html dir="rtl">`. The row is `<div className="flex flex-row justify-center gap-2" dir="ltr">`.
   For `flex-direction: row`, the main-axis start follows the effective `direction`. The
   screenshot mapping (read L→R `133389`, submitted `983331`) proves that in the running app
   `code[0]` renders at the **right** and `code[5]` at the **left** — i.e. the row is laying
   out right-to-left, so the `dir="ltr"` attribute is not taking effect as intended (an
   inherited/cascaded RTL `direction` is winning, or the attribute is otherwise ineffective
   in the deployed context). `code.join('')` then walks right-to-left relative to the user's
   reading order and submits the reverse.

2. **Reading-order vs index-order coupling is implicit and fragile.** Correctness currently
   depends entirely on the single `dir="ltr"` attribute keeping "leftmost box == `code[0]`".
   There is no defensive guarantee; any direction inheritance flips the mapping silently
   while focus/auto-advance (which use array index `index + 1`) keep working, so the bug
   hides behind otherwise-correct entry behaviour.

3. **jsdom masks the defect in tests.** The existing `AuthPage.test.tsx` paste test asserts
   `verifyOtp` is called with `123456`, and passes — because jsdom does not perform
   direction-based flex layout, DOM source order and "visual" order coincide there. So the
   reversal only appears in a real RTL browser, which is exactly the production symptom.

The exploratory tests below are written to **confirm or refute** hypothesis (1)/(2): if a
reproduction that fills boxes in reading order still submits the correct string on the
unfixed code, the hypothesis is refuted and we re-analyze (e.g. a different entry path such
as SMS one-time-code autofill).

## Correctness Properties

Property 1: Bug Condition - Submitted Code Matches Displayed Reading Order

_For any_ input where the bug condition holds (isBugCondition returns true) — a complete
6-digit code entered and displayed left-to-right as `D` — the fixed code SHALL submit
exactly `D` to `verifyOtp` (the digits in the same order the user reads them left-to-right),
independent of the surrounding page direction, so that a correct code passes verification and
proceeds with login.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-Reversal Behaviors Unchanged

_For any_ input where the bug condition does NOT hold (isBugCondition returns false) — phone
entry/validation/submission, full-paste fill order, per-key auto-advance, backspace-to-previous,
Persian-digit normalization, and the RTL/timer/error chrome — the fixed code SHALL produce the
same result as the original code, preserving all existing behaviour for those interactions.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is correct (the OTP row is laying out right-to-left so
`code[0]` is not the leftmost box):

**File**: `packages/web/src/pages/AuthPage.tsx`

**Function / region**: the OTP boxes row inside `AuthPageContent`'s OTP-step `<form>` (the
`<div className="flex flex-row justify-center gap-2" dir="ltr"> … {code.map(...)} … </div>`).

**Specific Changes**:

1. **Pin the OTP row to left-to-right in a cascade-proof way.** Replace sole reliance on the
   `dir="ltr"` attribute with an explicit, high-precedence left-to-right direction on the row
   so the inherited document RTL cannot flip it. Concretely, keep `dir="ltr"` and add an
   inline `style={{ direction: 'ltr' }}` on the boxes' flex container (inline styles win over
   inherited/author cascade short of `!important`). This guarantees `flex-row` lays the boxes
   out so array index 0 is the leftmost box and index 5 the rightmost — i.e. reading order
   equals index order.

2. **Keep the submission assembly as index order.** `codeValue = code.join('')` is left
   unchanged; once change (1) guarantees leftmost == `code[0]`, the join already reads the
   digits in the user's left-to-right reading order. (Do NOT "fix" this by reversing the
   string — that would only correct the symptom for the reversed layout and break once the
   layout is pinned.)

3. **Update the misleading comment.** The existing comment claims the boxes "lay out in array
   order (index 0 leftmost)" as if guaranteed by the attribute alone; revise it to state that
   the explicit LTR direction is what guarantees reading order == index order, so a future
   edit does not silently reintroduce the reversal.

4. **No change to focus/auto-advance/backspace.** These already operate on array indices
   (`otpRefs.current[index + 1]`, `index - 1`) and are correct once index order == reading
   order; they are intentionally untouched.

5. **No change to `packages/web/src/api/client.ts` or `@salon/shared` digits.** Confirmed as
   non-reversing; touching them would widen the blast radius without addressing the cause.

The change is intentionally minimal and direction-independent: it makes the submitted value
correct regardless of whether the page is RTL or LTR, rather than compensating for one
specific layout direction.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that
demonstrate the reversal on the unfixed code, then verify the fix submits the digits in
reading order and preserves the unrelated behaviours. Tests use the existing web stack —
Vitest + `@testing-library/react` + jsdom (`packages/web/package.json`) — and follow the
patterns already in `packages/web/src/pages/__tests__/AuthPage.test.tsx` (mocked
`authApi`, `MemoryRouter` + `HelmetProvider`, Persian `aria-label`s for the boxes).
Property-based tests use **fast-check** (already in the repo at `node_modules/fast-check`,
v3.x).

Because jsdom does not compute direction-based flex layout, "visual left-to-right order"
cannot be read from `getBoundingClientRect`. The tests therefore pin the invariant in two
layout-independent ways: (a) assert the submitted string equals the reading-order string the
test enters by box position, and (b) assert the OTP row enforces a left-to-right direction
(the `dir`/inline `direction` that guarantees DOM/index order equals reading order), so the
mapping cannot silently flip.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the reversal BEFORE implementing the fix,
and confirm or refute the root-cause analysis (RTL layout defeating `dir="ltr"`). If refuted
(the unfixed code already submits the reading-order string), re-hypothesize (e.g. a different
entry path such as one-time-code autofill).

**Test Plan**: Render `AuthPage` inside an RTL context, advance to the OTP step, enter a known
non-palindrome code into the boxes **by reading-order position** (leftmost box first), submit,
and assert the value passed to the mocked `verifyOtp`. Run on the UNFIXED code to observe the
reversal and pin down where reading order and index order diverge. Add an assertion on the OTP
row's effective direction to document that the unfixed row does not pin LTR.

**Test Cases**:
1. **Reading-order entry, battle of orders**: Fill the leftmost→rightmost boxes with
   `1,3,3,3,8,9`; expect `verifyOtp(phone, '133389')`; on unfixed code it is called with
   `983331` (will fail on unfixed code).
2. **Distinct-digit code**: Fill leftmost→rightmost with `1,2,3,4,5,6`; expect `123456`;
   unfixed submits `654321` (will fail on unfixed code).
3. **Asymmetric edge code**: Fill leftmost→rightmost with `1,0,0,0,0,0`; expect `100000`;
   unfixed submits `000001` (will fail on unfixed code).
4. **Row-direction assertion**: Assert the OTP boxes' container resolves to a left-to-right
   direction so leftmost box maps to `code[0]` (may fail / be ambiguous on unfixed code).

**Expected Counterexamples**:
- `verifyOtp` receives the reverse of the reading-order code for every non-palindrome input.
- Confirms the divergence is layout/order based (leftmost box bound to `code[5]`), not a
  string transform in the submit path, the API client, or `normalizeDigits`.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed code submits the
displayed reading-order string (Property 1).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  enterDigitsInReadingOrder(input.displayedDigits)   // leftmost box first
  submitOtp()
  ASSERT verifyOtp_called_with(normalizedPhone, input.displayedDigits)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code
produces the same result as the original code (Property 2).

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT behavior_original(input) == behavior_fixed(input)
  // phone normalize+submit, paste fill order, auto-advance, backspace,
  // Persian-digit normalization, RTL/timer/error chrome
END FOR
```

**Testing Approach**: Property-based testing (fast-check) is recommended for preservation
checking because it generates many codes/phones across the input domain automatically,
catches edge cases manual tests miss, and gives a strong guarantee the behaviour is unchanged
for all non-reversal inputs. The reading-order fix is also expressed as a property: for any
generated 6-digit code, entering it in reading order submits that same string.

**Test Plan**: Observe behaviour on UNFIXED code first for the preserved interactions (phone
submit, paste, auto-advance, backspace, Persian normalization), then assert the same
behaviour holds after the fix. Most preservation assertions already exist in
`AuthPage.test.tsx` and must stay green unchanged.

**Test Cases**:
1. **Phone submission preserved**: A valid (and a `+98`/Persian-digit) phone still calls
   `requestOtp`/`verifyOtp` with `09xxxxxxxxx` — unchanged from today.
2. **Paste fill order preserved**: Pasting `123456` still fills boxes left-to-right and
   submits `123456` (the existing paste test must remain green).
3. **Auto-advance / backspace preserved**: Entry advances to the next box; backspace in an
   empty box moves to the previous box — unchanged.
4. **Persian-digit normalization preserved**: Entering `۱۳۳۳۸۹` in reading order submits the
   Latin `133389`.
5. **RTL chrome preserved**: The page stays RTL overall; the resend timer renders Persian
   digits and the `role="alert"` error region behaves as before.

### Unit Tests

- Reading-order entry of a non-palindrome code submits the displayed string (fix check).
- The OTP boxes' container enforces a left-to-right direction (regression guard against the
  layout flip reappearing).
- Paste of a full 6-digit code submits the digits in displayed order (preservation).
- Auto-advance, backspace-to-previous, and Persian-digit normalization behave as today.
- Phone normalization/submission unchanged (existing `normalizePhone` tests stay green).

### Property-Based Tests

- For any generated complete 6-digit code, entering it in reading order submits exactly that
  string to `verifyOtp` (Property 1) — minimum 100 iterations.
- For any generated 6-digit paste, the boxes fill left-to-right and the submitted value equals
  the pasted string (preservation of paste order).
- For any generated valid phone (including `+98`/Persian-digit variants), the normalized
  `09xxxxxxxxx` is submitted unchanged (preservation of phone handling).

### Integration Tests

- Full OTP flow: request code → enter a non-palindrome code in reading order → verify →
  tokens stored → navigate home, asserting the submitted code equals the displayed order.
- Paste-then-verify flow end to end, asserting displayed order equals submitted order.
- Switching back to the phone step and re-requesting a code does not reintroduce reversal,
  and the resend-timer / error chrome render unchanged.
