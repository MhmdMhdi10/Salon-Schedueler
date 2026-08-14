import { theme as antdTheme, type ThemeConfig } from 'antd';
import type { Theme } from '../../components/theme';

const LIGHT = {
  canvas: '#F7F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F2F0',
  border: '#E2E4E1',
  text: '#202721',
  textSecondary: '#4B554D',
  textMuted: '#727C74',
  primary: '#B9470F',
  primaryBrand: '#D85C1A',
  primaryContainer: '#FFF2E9',
  secondary: '#4168C5',
  success: '#257052',
  warning: '#946000',
  danger: '#B53A4D',
};

const DARK = {
  canvas: '#12151A',
  surface: '#191D23',
  surfaceAlt: '#252B34',
  border: '#303741',
  text: '#F4F6F8',
  textSecondary: '#D3D8DE',
  textMuted: '#9AA4AF',
  primary: '#FF955C',
  primaryBrand: '#FF7A33',
  primaryContainer: '#38251C',
  secondary: '#8EAFFC',
  success: '#6BC29E',
  warning: '#E0B15D',
  danger: '#EB7C8D',
};

export function getPlatformAdminTheme(mode: Theme): ThemeConfig {
  const dark = mode === 'dark';
  const colors = dark ? DARK : LIGHT;
  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    hashed: true,
    token: {
      fontFamily: "'Vazirmatn', 'Vazirmatn Fallback', Tahoma, sans-serif",
      colorPrimary: colors.primary,
      colorInfo: colors.secondary,
      colorSuccess: colors.success,
      colorWarning: colors.warning,
      colorError: colors.danger,
      colorBgBase: colors.canvas,
      colorBgLayout: colors.canvas,
      colorBgContainer: colors.surface,
      colorBgElevated: colors.surface,
      colorFillAlter: colors.surfaceAlt,
      colorText: colors.text,
      colorTextSecondary: colors.textSecondary,
      colorTextTertiary: colors.textMuted,
      colorBorder: colors.border,
      colorBorderSecondary: colors.border,
      borderRadius: 10,
      borderRadiusLG: 16,
      borderRadiusSM: 8,
      controlHeight: 40,
      controlHeightLG: 44,
      controlHeightSM: 32,
      fontSize: 14,
      lineHeight: 1.65,
      boxShadow: dark
        ? '0 0 0 1px rgba(255,255,255,0.08)'
        : '0 0 0 1px rgba(32,39,33,0.04), 0 1px 2px rgba(32,39,33,0.04), 0 6px 18px rgba(32,39,33,0.05)',
    },
    components: {
      Layout: {
        bodyBg: colors.canvas,
        headerBg: colors.surface,
        siderBg: colors.surface,
        triggerBg: colors.surface,
        triggerColor: colors.primary,
      },
      Menu: {
        itemBg: 'transparent',
        itemColor: colors.textSecondary,
        itemHoverBg: colors.surfaceAlt,
        itemHoverColor: colors.text,
        itemSelectedBg: colors.primaryContainer,
        itemSelectedColor: colors.primary,
        itemBorderRadius: 10,
        subMenuItemBg: 'transparent',
        activeBarBorderWidth: 0,
      },
      Button: {
        borderRadius: 10,
        fontWeight: 600,
        primaryShadow: dark ? 'none' : '0 4px 12px rgba(185,71,15,0.16)',
        defaultShadow: 'none',
        dangerShadow: 'none',
      },
      Card: { borderRadiusLG: 16, headerBg: 'transparent' },
      Table: {
        headerBg: colors.surfaceAlt,
        headerColor: colors.textSecondary,
        rowHoverBg: colors.primaryContainer,
        borderColor: colors.border,
        cellPaddingBlock: 14,
        cellPaddingInline: 16,
        headerBorderRadius: 14,
      },
      Pagination: { itemActiveBg: colors.primaryContainer },
      Tag: { defaultBg: colors.surfaceAlt, defaultColor: colors.textSecondary },
      Drawer: { colorBgElevated: colors.surface },
      Modal: { contentBg: colors.surface, headerBg: colors.surface, borderRadiusLG: 16 },
      Tabs: {
        itemActiveColor: colors.primary,
        itemHoverColor: colors.primaryBrand,
        itemSelectedColor: colors.primary,
        inkBarColor: colors.primary,
      },
    },
  };
}

export const PLATFORM_ADMIN_COLORS = { light: LIGHT, dark: DARK } as const;
