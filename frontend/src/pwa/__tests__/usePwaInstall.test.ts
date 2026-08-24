import { describe, expect, it } from 'vitest';
import { getPwaInstallPlatform } from '../usePwaInstall';

describe('getPwaInstallPlatform', () => {
  it('detects iPhone and iPad user agents', () => {
    expect(getPwaInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(
      'ios',
    );
    expect(getPwaInstallPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios');
  });

  it('distinguishes Android browser instructions', () => {
    const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile';
    const samsung = `${android} SamsungBrowser/28.0`;
    const firefox = `${android} Firefox/143.0`;

    expect(getPwaInstallPlatform(android)).toBe('android');
    expect(getPwaInstallPlatform(samsung)).toBe('android-samsung');
    expect(getPwaInstallPlatform(firefox)).toBe('android-firefox');
  });

  it('detects desktop Chromium and Safari', () => {
    expect(getPwaInstallPlatform('Mozilla/5.0 Chrome/143.0.0.0 Safari/537.36')).toBe(
      'desktop-chromium',
    );
    expect(
      getPwaInstallPlatform('Mozilla/5.0 Macintosh; Intel Mac OS X) AppleWebKit Safari/605.1'),
    ).toBe('desktop-safari');
  });

  it('falls back to generic instructions for unknown browsers', () => {
    expect(getPwaInstallPlatform('ExampleBrowser/1.0')).toBe('other');
  });
});
