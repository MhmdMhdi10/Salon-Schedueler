import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'salon.refresh-token';

/** Persist only the native refresh credential in the platform keychain. */
export async function saveRefreshToken(token: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** Read the native refresh credential, failing closed when keychain access fails. */
export async function loadRefreshToken(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) ?? null;
  } catch {
    return null;
  }
}

/** Remove the native refresh credential. */
export async function clearRefreshToken(): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}
