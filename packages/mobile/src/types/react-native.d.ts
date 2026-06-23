/**
 * Minimal ambient type declarations for `react-native`.
 *
 * The mobile package targets React Native at runtime, but the dependency is a
 * peer/dev dependency that is not installed in this workspace. This shim lets
 * the screen components type-check (`tsc --noEmit`) against the small surface
 * of primitives they use. It is intentionally narrow, not a full RN type set.
 */
declare module 'react-native' {
  import type { ComponentType, ReactNode } from 'react';

  export interface ViewProps {
    children?: ReactNode;
    testID?: string;
    style?: unknown;
    [key: string]: unknown;
  }
  export const View: ComponentType<ViewProps>;
  export const Text: ComponentType<ViewProps>;

  export interface TextInputProps {
    value?: string;
    onChangeText?: (text: string) => void;
    placeholder?: string;
    keyboardType?: string;
    maxLength?: number;
    secureTextEntry?: boolean;
    editable?: boolean;
    autoFocus?: boolean;
    testID?: string;
    style?: unknown;
    [key: string]: unknown;
  }
  export const TextInput: ComponentType<TextInputProps>;

  export interface ButtonProps {
    title: string;
    onPress?: () => void;
    disabled?: boolean;
    color?: string;
    testID?: string;
  }
  export const Button: ComponentType<ButtonProps>;

  export interface ActivityIndicatorProps {
    size?: 'small' | 'large' | number;
    color?: string;
    testID?: string;
  }
  export const ActivityIndicator: ComponentType<ActivityIndicatorProps>;
}
