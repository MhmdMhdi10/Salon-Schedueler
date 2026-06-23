/**
 * Jest runtime stand-in for `react-native`.
 *
 * `react-native` is not installed in this workspace, so tests map the module
 * to these lightweight stub components (see `jest.config.js` moduleNameMapper).
 * The stubs let the screen modules be imported in a Node test environment
 * without a device runtime. They are not rendered; the screens' behavior is
 * verified through their extracted logic modules.
 */
import type { FC } from 'react';

const Stub: FC<Record<string, unknown>> = () => null;

export const View = Stub;
export const Text = Stub;
export const TextInput = Stub;
export const Button = Stub;
export const ActivityIndicator = Stub;

export default { View, Text, TextInput, Button, ActivityIndicator };
