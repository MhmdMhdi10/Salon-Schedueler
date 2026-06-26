/**
 * Jest runtime stand-in for `react-native`.
 *
 * `react-native` is not installed in this workspace, so tests map the module
 * to these lightweight stub components (see `jest.config.js` moduleNameMapper).
 * The stubs let the screen modules be imported in a Node test environment
 * without a device runtime. They are not rendered; the screens' behavior is
 * verified through their extracted logic modules.
 */
import { forwardRef, type FC } from 'react';

const Stub: FC<Record<string, unknown>> = () => null;

export const View = Stub;
export const Text = Stub;
// TextInput forwards a ref in the real RN API (focus management); mirror that
// here so screens can attach refs without the stub dropping them.
export const TextInput = forwardRef<unknown, Record<string, unknown>>(() => null);
export const Button = Stub;
export const Pressable = Stub;
export const ActivityIndicator = Stub;

/** Minimal StyleSheet shim: `create` returns the styles object unchanged. */
export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: (style: unknown): unknown => style,
};

export default { View, Text, TextInput, Button, Pressable, ActivityIndicator, StyleSheet };
