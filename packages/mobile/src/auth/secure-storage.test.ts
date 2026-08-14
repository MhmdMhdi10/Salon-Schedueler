jest.mock(
  'expo-secure-store',
  () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  }),
  { virtual: true },
);

import * as SecureStore from 'expo-secure-store';
import {
  clearRefreshToken,
  loadRefreshToken,
  saveRefreshToken,
} from './secure-storage';

const store = SecureStore as jest.Mocked<typeof SecureStore>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('native refresh-token storage', () => {
  it('saves refresh credentials through SecureStore under one app key', async () => {
    await saveRefreshToken('refresh-1');

    expect(store.setItemAsync).toHaveBeenCalledWith(
      'salon.refresh-token',
      'refresh-1',
    );
  });

  it('loads the stored refresh credential', async () => {
    store.getItemAsync.mockResolvedValueOnce('refresh-2');

    await expect(loadRefreshToken()).resolves.toBe('refresh-2');
    expect(store.getItemAsync).toHaveBeenCalledWith('salon.refresh-token');
  });

  it('clears the credential from SecureStore', async () => {
    await clearRefreshToken();

    expect(store.deleteItemAsync).toHaveBeenCalledWith('salon.refresh-token');
  });

  it('fails closed when SecureStore is unavailable', async () => {
    store.getItemAsync.mockRejectedValueOnce(new Error('keychain unavailable'));
    store.setItemAsync.mockRejectedValueOnce(new Error('keychain unavailable'));
    store.deleteItemAsync.mockRejectedValueOnce(new Error('keychain unavailable'));

    await expect(loadRefreshToken()).resolves.toBeNull();
    await expect(saveRefreshToken('refresh')).resolves.toBe(false);
    await expect(clearRefreshToken()).resolves.toBe(false);
  });
});
