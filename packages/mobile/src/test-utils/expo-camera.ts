/**
 * Jest runtime stand-in for `expo-camera`.
 *
 * The real module pulls in native camera bindings that cannot load in the Node
 * test environment, so tests map it to these lightweight stubs (see
 * `jest.config.js` moduleNameMapper). The screen modules import `CameraView` /
 * `useCameraPermissions` at module load; the screens are never rendered in the
 * Node suites (their behavior is verified through the extracted logic modules),
 * so the stubs only need to make the import resolve without a device runtime.
 */
import type { FC } from 'react';

const Stub: FC<Record<string, unknown>> = () => null;

export const CameraView = Stub;

export type PermissionResponse = {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
  expires: string;
};

const GRANTED: PermissionResponse = {
  granted: true,
  canAskAgain: true,
  status: 'granted',
  expires: 'never',
};

export function useCameraPermissions(): [
  PermissionResponse | null,
  () => Promise<PermissionResponse>,
] {
  return [GRANTED, async () => GRANTED];
}

export default { CameraView, useCameraPermissions };
