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
    it('configures compileSdkVersion and minSdkVersion', () => {
      expect(rootBuildGradle).toContain('compileSdkVersion');
      expect(rootBuildGradle).toContain('minSdkVersion');
    });

    it('includes Google and Maven Central repositories', () => {
      expect(rootBuildGradle).toContain('google()');
      expect(rootBuildGradle).toContain('mavenCentral()');
    });
  });

  describe('App build.gradle', () => {
    it('defines the application namespace', () => {
      expect(appBuildGradle).toContain('namespace "app.salon.booking"');
    });

    it('configures product flavors dimension "store"', () => {
      expect(appBuildGradle).toContain('flavorDimensions "store"');
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

    it('enables minification for release builds', () => {
      expect(appBuildGradle).toContain('minifyEnabled true');
    });

    it('applies required plugins', () => {
      expect(appBuildGradle).toContain('com.android.application');
      expect(appBuildGradle).toContain('com.facebook.react');
    });
  });
});
