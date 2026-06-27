// Dynamic Expo config so the API base URL can be injected per-environment.
//
// `EXPO_PUBLIC_API_BASE_URL` is read at start time (set by the Docker dev
// service to the host LAN IP, e.g. http://192.168.1.199:3000, so a physical
// phone running Expo Go reaches the backend). Falls back to a local default for
// running Expo directly on the host.
module.exports = ({ config }) => ({
  ...config,
  name: 'رزرو سالن',
  slug: 'salon-booking',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  scheme: 'salonbooking',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.salon.booking',
    infoPlist: {
      NSCameraUsageDescription:
        'برای اسکن کد QR سالن به دوربین دسترسی لازم است.',
    },
  },
  android: {
    package: 'app.salon.booking',
    permissions: ['android.permission.CAMERA'],
  },
  plugins: [
    [
      'expo-camera',
      {
        cameraPermission: 'برای اسکن کد QR سالن به دوربین دسترسی لازم است.',
        recordAudioAndroid: false,
      },
    ],
  ],
  extra: {
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000',
  },
});
