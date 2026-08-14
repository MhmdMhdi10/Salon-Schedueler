# Complete Security and Performance Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the verified web-session and mobile-dependency security gaps, preserve the existing booking behavior, and leave the repository clean, testable, and production-ready.

**Architecture:** Browser sessions keep the short-lived access token in memory and move the rotating refresh token into an HttpOnly, SameSite cookie. Native clients request token-body responses and persist refresh credentials only through Expo SecureStore. The mobile workspace now uses Expo SDK57/RN0.86.2, while the web workspace remains on React18 and Metro pins the mobile bundle to React19 to preserve existing web behavior.

**Tech Stack:** Express 4, TypeScript, JWT HS256, React/Vite, React Native/Expo, Prisma, npm workspaces, Jest, Vitest, Cucumber, c8, Docker Compose.

## Verification status — 2026-08-15

Implementation and regression gates are complete. Backend runtime tests: 55 suites, 596 passed, 32 skipped. Web: 111 files, 1,142 passed, 1 skipped. Mobile: 9 suites, 59 passed. Cucumber: 14 scenarios, 137 steps, controller/DTO route coverage 100%, c8 statements/branches/functions/lines 100%. Dev and production Compose configuration validate; Docker dev backend/frontend are healthy and Vite optimized-dependency smoke requests return 200.

Known environment/dependency constraints: Android Gradle compilation cannot run on this host because no complete Android SDK is installed; Expo Doctor reports the intentional web React18/mobile React19 workspace duplicate; npm audit reports 18 upstream Expo/RN build-tool advisories (0 critical, 11 high, 7 moderate). Backend runtime audit is clean. Repository-wide Prettier check still reports pre-existing formatting warnings in 202 files; ESLint has 0 errors.

## Global Constraints

- Never return a browser refresh token in JSON or store it in `localStorage`.
- Keep mobile token-body authentication working through an explicit client mode.
- Keep production JWT algorithms, token types, expiry, and database rehydration checks strict.
- Do not use `npm audit fix --force`; upgrade Expo incrementally/with Expo's compatibility tooling.
- Do not delete source, user-authored docs, node_modules, or mobile runtime state; remove only verified generated artifacts.
- Every behavior change gets a failing test before production code.
- Existing backend controller, DTO, Cucumber, frontend, mobile, build, and bundle-budget gates must remain green.

---

### Task 1: Move browser refresh sessions to an HttpOnly cookie

**Files:**
- Create: `backend/src/auth/auth-cookie.ts`
- Create: `backend/src/auth/auth-cookie.test.ts`
- Modify: `backend/src/auth/controllers/auth.controller.ts`
- Modify: `backend/src/http/app.ts`
- Modify: `backend/src/http/__tests__/routes.test.ts`
- Modify: `backend/src/http/__tests__/healthz.test.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/__tests__/auth-bootstrap.test.ts`
- Modify: `frontend/src/pages/AuthPage.tsx`
- Modify: `frontend/src/pages/business/RegisterSalonPage.tsx`
- Modify: `backend/features/bootstrap/custom.world.ts`

**Interfaces:**
- `auth-cookie.ts` produces `setRefreshCookie(res, token, maxAgeSeconds)`, `readRefreshCookie(req)`, and `clearRefreshCookie(res, maxAgeSeconds)`.
- Browser auth requests send `X-Auth-Client: web`; native/test token clients send `X-Auth-Client: mobile`.
- Browser auth responses are `{ accessToken }`; mobile responses remain `{ accessToken, refreshToken }`.
- `POST /api/auth/refresh` reads the cookie for web and the body for mobile, rotates the cookie/token pair, and returns only the access token to web.

- [ ] **Step 1: Write failing backend cookie contract tests**

  Add tests proving web OTP verification sets `HttpOnly; SameSite=Lax; Path=/api/auth`, omits `refreshToken` from JSON, refreshes from the cookie, and logout clears the cookie. Add a separate mobile request asserting the refresh token remains in JSON.

- [ ] **Step 2: Run the focused backend tests and verify the expected failure**

  Run `npm --workspace @salon/backend test -- --runInBand src/http/__tests__/routes.test.ts src/auth/auth-cookie.test.ts`.

- [ ] **Step 3: Implement the cookie helper and controller response policy**

  Use Express response cookie headers without adding a parser dependency. Use `httpOnly: true`, `sameSite: 'lax'`, `secure: NODE_ENV === 'production'`, `path: '/api/auth'`, and the configured refresh lifetime. Reject missing/invalid web cookies through the existing auth error mapping. Add `POST /auth/logout` to clear the cookie.

- [ ] **Step 4: Update the web client and auth flows**

  Remove `REFRESH_TOKEN_KEY`, `getRefreshToken`, and `setRefreshToken` persistence from browser code. Send `credentials: 'include'` and `X-Auth-Client: web`; make bootstrap call `authApi.refresh()` without a token; retry one expired access-token request through the shared refresh promise; call logout best-effort while immediately clearing the in-memory token.

- [ ] **Step 5: Update test fixtures and verify backend + frontend auth tests**

  Keep Cucumber/mobile fixtures on `X-Auth-Client: mobile`. Run `npm --workspace @salon/backend test -- --runInBand src/auth src/http/__tests__/routes.test.ts` and `npm --workspace @salon/web run test -- src/api/__tests__/auth-bootstrap.test.ts`.

- [ ] **Step 6: Refactor only after green**

  Remove stale comments/types that describe localStorage refresh persistence and keep the cookie contract documented in the route comments and privacy copy.

---

### Task 2: Give the native app secure refresh-token persistence

**Files:**
- Create: `packages/mobile/src/auth/secure-storage.ts`
- Create: `packages/mobile/src/auth/secure-storage.test.ts`
- Modify: `packages/mobile/package.json`
- Modify: `packages/mobile/src/api/client.ts`
- Modify: `packages/mobile/src/screens/AuthScreen.logic.ts`
- Modify: `packages/mobile/src/screens/AuthScreen.tsx`
- Modify: `packages/mobile/src/ExpoApp.tsx`
- Modify: `packages/mobile/src/screens/AuthScreen.test.tsx`

**Interfaces:**
- `secure-storage.ts` exports async `loadRefreshToken`, `saveRefreshToken`, and `clearRefreshToken` backed by `expo-secure-store` with a stable app key.
- Native `authApi.refresh(refreshToken)` sends `X-Auth-Client: mobile` and remains independent from browser cookies.
- `AuthScreen` uses the secure persistence callback by default in the Expo runtime while retaining an injectable callback for tests.

- [ ] **Step 1: Write failing SecureStore adapter tests**

  Mock only the native module boundary and assert save/load/clear use the same key, never AsyncStorage or plain storage, and convert native failures into a safe anonymous-session result.

- [ ] **Step 2: Run the focused mobile test and verify RED**

  Run `npm --workspace @salon/mobile test -- --runInBand src/auth/secure-storage.test.ts src/screens/AuthScreen.test.tsx`.

- [ ] **Step 3: Add the Expo SecureStore dependency and minimal adapter**

  Add the SDK-compatible `expo-secure-store` package using Expo's installer, implement the adapter, and wire it into the runtime auth screen. Do not expose refresh tokens through logs or UI state.

- [ ] **Step 4: Add native refresh/bootstrap behavior**

  Load the secure refresh token when the Expo shell starts, refresh the access token once, clear secure storage on invalid refresh, and persist rotated refresh tokens after successful refresh.

- [ ] **Step 5: Verify mobile tests and TypeScript**

  Run `npm --workspace @salon/mobile test -- --runInBand` and `npm --workspace @salon/mobile run build`.

---

### Task 3: Upgrade the Expo workspace and eliminate audited dependency paths

**Files:**
- Modify: `packages/mobile/package.json`
- Modify: `package-lock.json`
- Modify: `packages/mobile/src/config.ts` only if Expo runtime API changes require it
- Modify: `packages/mobile/src/test-utils/*` only if SDK 57 test shims require it
- Modify: `packages/mobile/src/__tests__/release-build.test.ts` if release invariants change

**Interfaces:**
- The mobile workspace must use one internally compatible Expo SDK, React, React Native, Expo modules, Metro config, and Babel preset version family.
- Root backend/frontend workspace dependency resolution must remain unchanged except for lockfile entries required by the mobile upgrade.

- [ ] **Step 1: Record the current mobile dependency graph and audit paths**

  Run `npm --workspace @salon/mobile ls expo react react-native @expo/metro-config expo-camera expo-constants --depth=0` and `npm audit --omit=dev --json`; save only command output evidence, not generated reports in the repo.

- [ ] **Step 2: Upgrade Expo one SDK family at a time**

  Follow Expo's upgrade workflow through SDK57 with `npx expo install --fix` and `npx expo-doctor`. The Android project is now prebuilt and checked in because the app has custom CafeBazaar/Myket flavors, release-signing enforcement, and R8 settings; it must be kept synchronized with the Expo SDK57 package family.

- [ ] **Step 3: Verify the audited paths are gone**

  Run `npm audit --omit=dev --json` and trace remaining advisories. Backend runtime dependencies are clean; Expo/RN build-tool advisories remain upstream in the current SDK57 dependency graph and must not be “fixed” with `npm audit fix --force`.

- [ ] **Step 4: Run mobile release checks after each green SDK step**

  Run `npm --workspace @salon/mobile run build`, `npm --workspace @salon/mobile test -- --runInBand`, and `npx expo-doctor` for the final SDK family.

---

### Task 4: Re-audit performance, production configuration, and generated-file hygiene

**Files:**
- Modify: `.gitignore` only for verified generated outputs
- Modify: `README.md` and `backend/.env.example` only where the new auth cookie/client mode or Expo setup needs operator documentation
- Review: `docker/backend-production.Dockerfile`, `docker/web-entrypoint.sh`, `docker-compose.server.yml`, `docker/nginx.server.conf`, `ops/production-readiness.sh`

- [ ] **Step 1: Run static hygiene checks**

  Run `git diff --check`, ESLint with `--quiet`, TypeScript builds, and a search for committed secrets, wildcard production CORS, unsafe token storage, unbounded JSON bodies, and debug-only OTP exposure.

- [ ] **Step 2: Verify public performance budgets**

  Run `npm run build:frontend`; require the existing public-route gzip budget and heavy-chunk leak check to pass. Keep generated `dist`, sitemap, coverage, and artifact outputs out of the source tree after verification.

- [ ] **Step 3: Verify production Docker behavior**

  Validate production compose with non-secret dummy values, build the backend image, assert runtime requires work without dev dependencies, and confirm secrets/OTP production guards fail closed.

- [ ] **Step 4: Move only verified generated files to recoverable Trash**

  Preserve source assets, user docs, node_modules, mobile runtime state, and staged files. Remove only exact generated paths such as coverage, reports, build outputs, tsbuildinfo, and temporary logs.

---

### Task 5: Full verification and independent review

- [ ] **Step 1: Run backend unit/property tests**

  Run `npm run test:backend -- --runInBand` and record suite/test counts and failures.

- [ ] **Step 2: Run frontend and mobile tests**

  Run `npm run test:frontend` and `npm --workspace @salon/mobile test -- --runInBand`.

- [ ] **Step 3: Run Cucumber controller coverage**

  Run `npm run e2e:cucumber:coverage`; require 100% statements, branches, functions, lines, controller routes, controller endpoints, DTO endpoints, and feature structure.

- [ ] **Step 4: Run build/lint/Docker/runtime checks**

  Run backend/frontend/mobile builds, ESLint, compose config, Docker production smoke, and the original Vite optimized-dependency URL check.

- [ ] **Step 5: Dispatch code review against the current diff**

  Provide the reviewer the exact security/performance requirements, current `HEAD`, and changed-file summary. Fix every critical/important finding, then rerun the relevant verification command.

- [ ] **Step 6: Complete the requirement-by-requirement audit**

  Do not claim completion until cookie storage, mobile storage, audit output, tests, coverage, builds, runtime checks, and generated-file cleanup each have fresh evidence.
