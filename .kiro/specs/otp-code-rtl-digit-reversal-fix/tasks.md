# Implementation Plan

- [x] 1. Write bug condition exploration test (reading-order reversal)
  - **Property 1: Bug Condition** - Submitted Code Matches Displayed Reading Order
  - **CRITICAL**: This test MUST FAIL (or at minimum document the divergence) on the unfixed code — it encodes the expected behavior and will validate the fix once it passes after implementation
  - **DO NOT attempt to fix the test or the component while writing this task** — only surface and document counterexamples
  - **GOAL**: Demonstrate that a complete, non-palindrome 6-digit code entered left-to-right (reading order) is submitted to `verifyOtp` in reverse, and confirm/refute the RTL-layout root cause
  - Add the test in `packages/web/src/pages/__tests__/AuthPage.test.tsx` (or a focused `AuthPage.otp-order.test.tsx` sibling) reusing the existing harness: mocked `authApi` (`requestOtp`/`verifyOtp`), `MemoryRouter` + `HelmetProvider`, the `advanceToOtp()` helper, and the Persian `aria-label`s (`رقم ۱ کد تایید` … `رقم ۶ کد تایید`)
  - **Scoped PBT Approach**: scope this exploration to concrete non-palindrome failing cases so reproduction is deterministic in jsdom
  - Add a helper that enters digits **by reading-order position** (leftmost box `رقم ۱` first → rightmost box `رقم ۶`), firing `change` per box, then clicks «تایید و ورود»
  - Test case 1 (reported screenshot case): enter `1,3,3,3,8,9` leftmost→rightmost; assert `verifyOtp` is called with `(VALID_PHONE, '133389')`
  - Test case 2 (distinct digits): enter `1,2,3,4,5,6`; assert expected `verifyOtp(VALID_PHONE, '123456')`
  - Test case 3 (asymmetric edge): enter `1,0,0,0,0,0`; assert expected `verifyOtp(VALID_PHONE, '100000')`
  - Test case 4 (row-direction guard): assert the OTP boxes' flex container resolves to a left-to-right direction (its `dir`/inline `direction` pins index order to reading order) — document that the unfixed row does not cascade-proof this
  - Run on UNFIXED code and document the observed counterexamples (e.g. "enter `133389` in reading order → `verifyOtp` expected `133389`"); note that jsdom does not compute direction-based flex layout, so capture the invariant via entered-by-position assertions and the row-direction assertion rather than `getBoundingClientRect`
  - **EXPECTED OUTCOME**: the fix-check assertions fail (or the direction guard fails) on unfixed code, confirming the reversal/ordering defect exists
  - Mark complete when the test is written, run, and the failure/counterexample is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation tests for non-reversal behaviors (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Reversal Behaviors Unchanged
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on the UNFIXED code, then assert it so the fix cannot regress it
  - Keep all existing `AuthPage.test.tsx` assertions green; add explicit preservation coverage where the design calls for it
  - Observe + assert: a valid/normalized phone (`09123456789`, `+989123456789`, Persian-digit and punctuated variants) still calls `requestOtp`/`verifyOtp` with `09123456789` (phone normalization unchanged — Req 3.1)
  - Observe + assert: pasting `123456` into the first box fills boxes left-to-right and submits `123456` (the existing paste test must remain green — Req 3.2)
  - Observe + assert: typing a digit auto-advances focus to the next box; backspace in an empty box moves focus to the previous box (Req 3.3)
  - Observe + assert: entering Persian digits `۱۳۳۳۸۹` in reading order submits the Latin `133389` (digit normalization unchanged — Req 3.4)
  - Observe + assert: the page stays RTL overall, the resend timer renders Persian digits («ارسال مجدد تا …»), and the `role="alert"` error region behaves as before on verify failure (Req 3.5)
  - Run all preservation tests on UNFIXED code
  - **EXPECTED OUTCOME**: all preservation tests PASS (this confirms the baseline behavior to preserve)
  - Mark complete when the tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix the RTL digit-reversal in the OTP boxes row

  - [x] 3.1 Pin the OTP boxes row to a cascade-proof left-to-right direction
    - In `packages/web/src/pages/AuthPage.tsx`, on the OTP boxes container (`<div className="flex flex-row justify-center gap-2" dir="ltr">` inside `AuthPageContent`'s OTP-step `<form>`), add an inline `style={{ direction: 'ltr' }}` alongside the existing `dir="ltr"` so the inherited document RTL (`<html dir="rtl">`) cannot flip the main-axis order; this guarantees array index 0 is the leftmost box and index 5 the rightmost (reading order == index order)
    - Keep `codeValue = code.join('')` unchanged — once leftmost == `code[0]`, the join already reads digits in the user's left-to-right order; do NOT reverse the string
    - Do NOT change `packages/web/src/api/client.ts` (`authApi.verifyOtp`) or `@salon/shared` `normalizeDigits` — confirmed non-reversing pass-throughs
    - Do NOT change focus/auto-advance/backspace handlers — they already operate on array indices and are correct once index order == reading order
    - Update the misleading comment above the row: state that the explicit LTR direction (not the `dir` attribute alone) is what guarantees reading order == index order, so a future edit does not silently reintroduce the reversal
    - _Bug_Condition: isBugCondition(input) — complete 6-digit non-palindrome `D` entered/displayed L→R, yet submittedCode == reverse(D)_
    - _Expected_Behavior: expectedBehavior(result) — for any complete code, submitted string equals the L→R reading-order digits `D`, direction-independent_
    - _Preservation: phone normalize+submit, paste fill order, auto-advance, backspace, Persian-digit normalization, RTL/timer/error chrome_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Verify the bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Submitted Code Matches Displayed Reading Order
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - Run the reading-order entry cases (`133389`, `123456`, `100000`) and the row-direction guard
    - **EXPECTED OUTCOME**: tests PASS — `verifyOtp` receives the displayed reading-order string and the row enforces LTR (confirms the bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Reversal Behaviors Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Confirm phone submission, paste fill order, auto-advance/backspace, Persian-digit normalization, and RTL/timer/error chrome all still pass (no regressions)
    - **EXPECTED OUTCOME**: all preservation tests PASS
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Add property-based tests with fast-check
  - Use `fast-check` (already in the repo, v3.x) in `packages/web/src/pages/__tests__/`, following the existing Vitest + `@testing-library/react` + jsdom patterns and remembering to `cleanup()` / reset mocks between generated runs
  - **Property 1 (fix check)**: for any generated complete 6-digit code, entering it in reading order (leftmost box first) submits exactly that string to `verifyOtp` — minimum 100 iterations; validates Requirements 2.1, 2.2, 2.3
  - **Property 2 (preservation — paste order)**: for any generated 6-digit paste string, the boxes fill left-to-right and the submitted value equals the pasted string; validates Requirement 3.2
  - **Property 2 (preservation — phone handling)**: for any generated valid phone (including `+98` / `0098` / Persian-digit variants), the normalized `09xxxxxxxxx` is submitted unchanged to `requestOtp`/`verifyOtp`; validates Requirement 3.1
  - Run all property-based tests after the fix and confirm they pass
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run the web package test suite (Vitest, single run e.g. `vitest --run`) and confirm the full `AuthPage` suite plus the new exploration, preservation, and property-based tests are green
  - Confirm no regressions in the existing `AuthPage.test.tsx` assertions and the accessibility checks
  - Ensure all tests pass; ask the user if questions arise
