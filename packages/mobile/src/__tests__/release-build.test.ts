import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Smoke test for release build configuration.
 * Verifies that Cafe Bazaar and Myket product flavors are correctly configured.
 * Requirement: 18.2
 */
describe('Release Build Configuration', () => {
  const appBuildGradlePath = resolve(__dirname, '../../android/app/build.gradle');
  const rootBuildGradlePath = resolve(__dirname, '../../android/build.gradle');

  let appBuildGradle: string;
  let rootBuildGradle: string;

  beforeAll(() => {
    appBuildGradle = readFileSync(appBuildGradlePath, 'utf-8');
    rootBuildGradle = readFileSync(rootBuildGradlePath, 'utf-8');
  });

  describe('Root build.gradle', () => {
    it('uses Expo and React Native managed Android version catalogs', () => {
      expect(rootBuildGradle).toContain('expo-root-project');
      expect(rootBuildGradle).toContain('com.facebook.react.rootproject');
      expect(appBuildGradle).toMatch(/compileSdk(?:Version)?\s/);
      expect(appBuildGradle).toContain('minSdkVersion');
    });

    it('includes Google and Maven Central repositories', () => {
      expect(rootBuildGradle).toContain('google()');
      expect(rootBuildGradle).toContain('mavenCentral()');
    });
  });

  describe('App build.gradle', () => {
    it('defines the application namespace', () => {
      expect(appBuildGradle).toMatch(/namespace ['"]app\.salon\.booking['"]/);
    });

    it('configures product flavors dimension "store"', () => {
      expect(appBuildGradle).toMatch(/flavorDimensions ['"]store['"]/);
    });

    it('has a cafebazaar product flavor', () => {
      expect(appBuildGradle).toContain('cafebazaar');
      expect(appBuildGradle).toContain('.cafebazaar');
      expect(appBuildGradle).toContain('com.farsitel.bazaar');
    });

    it('has a myket product flavor', () => {
      expect(appBuildGradle).toContain('myket');
      expect(appBuildGradle).toContain('.myket');
      expect(appBuildGradle).toContain('ir.mservices.market');
    });

    it('configures release signing', () => {
      expect(appBuildGradle).toContain('signingConfigs');
      expect(appBuildGradle).toContain('release');
      expect(appBuildGradle).toContain('storeFile');
      expect(appBuildGradle).toContain('keyAlias');
    });

    it('does not depend on a local ignored debug keystore', () => {
      expect(appBuildGradle).not.toContain("storeFile file('debug.keystore')");
      expect(appBuildGradle).toContain('debug signing is supplied by the Android Gradle plugin');
    });

    it('enables minification for release builds', () => {
      expect(appBuildGradle).toContain('minifyEnabled enableMinifyInReleaseBuilds');
      expect(appBuildGradle).toMatch(/enableMinifyInReleaseBuilds\s*=.*\?: true/);
    });

    it('applies required plugins', () => {
      expect(appBuildGradle).toContain('com.android.application');
      expect(appBuildGradle).toContain('com.facebook.react');
    });
  });
});
