import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  App as AntdApp,
  Avatar,
  Button,
  ConfigProvider,
  Drawer,
  Dropdown,
  Grid,
  Input,
  Layout,
  List,
  Menu,
  Modal,
  Tooltip,
  type MenuProps,
} from 'antd';
import faIR from 'antd/locale/fa_IR';
import {
  AppstoreOutlined,
  CalendarOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DownOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  MoonOutlined,
  QrcodeOutlined,
  QuestionCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  ShopOutlined,
  SunOutlined,
  TeamOutlined,
  UserOutlined,
  UserSwitchOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../auth/AuthContext';
import { RouteLoader } from '../../components/layout/RouteLoader';
import { BrandLogo } from '../../components/brand';
import { ThemeScope, useTheme, OwnerThemeToggle } from '../../components/theme';
import {
  PanelOnboardingGuide,
  useFirstVisitPanelGuide,
  type PanelGuideStep,
} from '../../components/layout/PanelOnboardingGuide';
import { SeoHead } from '../../components/seo';
import { getPlatformAdminTheme } from './PlatformAdminTheme';
import { PanelAccessNav } from '../../components/layout/PanelAccessNav';
import './platform-admin.css';
import 'antd/dist/reset.css';

export const PLATFORM_ADMIN_CONTENT_ID = 'platform-admin-content';

type NavEntry = { key: string; label: string; icon: ReactNode };
type NavGroup = { key: string; label: string; icon: ReactNode; children: NavEntry[] };

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'business',
    label: 'عملیات کسب‌وکار',
    icon: <AppstoreOutlined />,
    children: [
      { key: '/platform-admin/salons', label: 'سالن‌ها', icon: <ShopOutlined /> },
      { key: '/platform-admin/appointments', label: 'نوبت‌ها', icon: <CalendarOutlined /> },
      { key: '/platform-admin/waitlist', label: 'صف انتظار', icon: <QuestionCircleOutlined /> },
      { key: '/platform-admin/qr-scans', label: 'اسکن‌های QR', icon: <QrcodeOutlined /> },
    ],
  },
  {
    key: 'audience',
    label: 'کاربران',
    icon: <TeamOutlined />,
    children: [
      { key: '/platform-admin/customers', label: 'مشتری‌ها', icon: <UserOutlined /> },
      { key: '/platform-admin/staff', label: 'تیم سالن‌ها', icon: <UserSwitchOutlined /> },
    ],
  },
  {
    key: 'commerce',
    label: 'درآمد و اشتراک',
    icon: <WalletOutlined />,
    children: [
      { key: '/platform-admin/subscriptions', label: 'اشتراک‌ها', icon: <CreditCardOutlined /> },
      { key: '/platform-admin/payments', label: 'پرداخت‌ها', icon: <FileTextOutlined /> },
    ],
  },
  {
    key: 'platform',
    label: 'پلتفرم',
    icon: <SettingOutlined />,
    children: [{ key: '/platform-admin/audit-logs', label: 'گزارش تغییرات', icon: <SafetyCertificateOutlined /> }],
  },
];

const ALL_ENTRIES: NavEntry[] = [
  { key: '/platform-admin', label: 'داشبورد', icon: <DashboardOutlined /> },
  ...NAV_GROUPS.flatMap((group) => group.children),
];

const PLATFORM_ADMIN_GUIDE_STEPS: readonly PanelGuideStep[] = [
  {
    id: 'platform-admin-dashboard',
    title: 'داشبورد ادمین',
    body: 'نمای کلی پلتفرم، وضعیت سالن‌ها و شاخص‌های مهم را از اینجا بررسی کنید.',
    to: '/platform-admin',
  },
  {
    id: 'platform-admin-salons',
    title: 'سالن‌ها',
    body: 'سالن‌ها را جستجو کنید، جزئیاتشان را ببینید و وضعیت هر سالن را مدیریت کنید.',
    to: '/platform-admin/salons',
  },
  {
    id: 'platform-admin-appointments',
    title: 'نوبت‌ها',
    body: 'نوبت‌های ثبت‌شده در پلتفرم را برای پیگیری و بررسی جزئیات ببینید.',
    to: '/platform-admin/appointments',
  },
  {
    id: 'platform-admin-waitlist',
    title: 'صف انتظار',
    body: 'درخواست‌های صف انتظار را بررسی و وضعیت آن‌ها را مدیریت کنید.',
    to: '/platform-admin/waitlist',
  },
  {
    id: 'platform-admin-qr-scans',
    title: 'اسکن‌های QR',
    body: 'عملکرد کدهای QR و مسیر ورود مشتری‌ها به رزرو را بررسی کنید.',
    to: '/platform-admin/qr-scans',
  },
  {
    id: 'platform-admin-customers',
    title: 'مشتری‌ها',
    body: 'حساب‌های مشتری، سابقهٔ استفاده و جزئیات موردنیاز پشتیبانی را ببینید.',
    to: '/platform-admin/customers',
  },
  {
    id: 'platform-admin-staff',
    title: 'تیم سالن‌ها',
    body: 'اعضای تیم سالن‌ها و ارتباط آن‌ها با سالن‌های ثبت‌شده را مدیریت کنید.',
    to: '/platform-admin/staff',
  },
  {
    id: 'platform-admin-subscriptions',
    title: 'اشتراک‌ها',
    body: 'پلن‌ها، وضعیت اشتراک و تمدید سالن‌ها را از این بخش پیگیری کنید.',
    to: '/platform-admin/subscriptions',
  },
  {
    id: 'platform-admin-payments',
    title: 'پرداخت‌ها',
    body: 'پرداخت‌ها و وضعیت مالی ثبت‌شده در پلتفرم را بررسی کنید.',
    to: '/platform-admin/payments',
  },
  {
    id: 'platform-admin-audit-logs',
    title: 'گزارش تغییرات',
    body: 'تغییرات حساس و رویدادهای مدیریتی را برای کنترل و پاسخ‌گویی دنبال کنید.',
    to: '/platform-admin/audit-logs',
  },
] as const;

function platformAdminGuideId(pathname: string): string | undefined {
  return PLATFORM_ADMIN_GUIDE_STEPS.find((step) => step.to === pathname)?.id;
}

const routeLabel = (pathname: string) =>
  ALL_ENTRIES.find((entry) => entry.key === pathname)?.label ??
  (pathname.includes('/details') ? 'جزئیات رکورد' : 'مرکز مدیریت');

function AppCommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fa');
    return ALL_ENTRIES.filter((entry) => !normalized || entry.label.toLocaleLowerCase('fa').includes(normalized));
  }, [query]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <Modal open={open} onCancel={onClose} footer={null} title="جستجوی بخش‌ها" destroyOnHidden>
      <Input autoFocus prefix={<SearchOutlined />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="نام بخش را جستجو کنید…" />
      <List
        className="platform-admin-command-list"
        dataSource={results}
        locale={{ emptyText: 'بخشی پیدا نشد.' }}
        renderItem={(entry) => (
          <List.Item
            onClick={() => {
              navigate(entry.key);
              onClose();
            }}
            style={{ cursor: 'pointer' }}
          >
            <List.Item.Meta avatar={entry.icon} title={entry.label} description={entry.key} />
          </List.Item>
        )}
      />
    </Modal>
  );
}

function PlatformSider({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: (key: string) => void }) {
  const location = useLocation();
  const items: MenuProps['items'] = [
    { key: '/platform-admin', icon: <DashboardOutlined />, label: 'داشبورد' },
    ...NAV_GROUPS.map((group) => ({
      key: group.key,
      icon: group.icon,
      label: group.label,
      children: group.children.map((entry) => ({ key: entry.key, icon: entry.icon, label: entry.label })),
    })),
  ];

  const selectedKey = location.pathname.includes('/details')
    ? undefined
    : (ALL_ENTRIES.find((entry) => entry.key === location.pathname)?.key ?? '/platform-admin');
  const openKeys = NAV_GROUPS.filter((group) => group.children.some((entry) => entry.key === location.pathname)).map((group) => group.key);

  return (
    <>
      <div className="platform-admin-brand">
        <BrandLogo className="platform-admin-brand__mark" />
        {!collapsed && (
          <span className="platform-admin-brand__copy">
            <strong>آرا</strong>
            <small>مرکز مدیریت پلتفرم</small>
          </span>
        )}
      </div>
      {!collapsed && (
        <div className="platform-admin-sider-search">
          <Input prefix={<SearchOutlined />} placeholder="جستجوی بخش‌ها" aria-label="جستجوی بخش‌ها" onClick={() => window.dispatchEvent(new CustomEvent('platform-admin:command'))} />
          <span className="platform-admin-sider-search__hint"><span>جستجوی سریع</span><kbd>Ctrl / ⌘ + K</kbd></span>
        </div>
      )}
      <Menu mode="inline" items={items} selectedKeys={selectedKey ? [selectedKey] : []} defaultOpenKeys={openKeys} onClick={({ key }) => onNavigate(String(key))} />
      {!collapsed && <div className="platform-admin-sider-footer">داده‌ها از API واقعی آرا خوانده می‌شوند</div>}
    </>
  );
}

function PlatformHeader({ collapsed, mobile, onToggleCollapsed, onSignOut, onHelp }: { collapsed: boolean; mobile: boolean; onToggleCollapsed: () => void; onSignOut: () => void; onHelp: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const label = routeLabel(pathname);

  useEffect(() => {
    const open = () => setCommandOpen(true);
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('platform-admin:command', open);
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('platform-admin:command', open);
      window.removeEventListener('keydown', keydown);
    };
  }, []);

  return (
    <>
      <div className="platform-admin-header">
        <div className="platform-admin-header__context">
          <Tooltip title={mobile ? 'باز کردن منو' : collapsed ? 'باز کردن منو' : 'جمع کردن منو'}>
            <Button type="text" aria-label={mobile ? 'باز کردن منو' : collapsed ? 'باز کردن منو' : 'جمع کردن منو'} icon={mobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={onToggleCollapsed} />
          </Tooltip>
          <span className="platform-admin-header__context-icon"><SafetyCertificateOutlined /></span>
          <span className="platform-admin-header__context-copy">
            <strong>{label}</strong>
            <small>مدیریت سراسری آرا</small>
          </span>
        </div>
        <div className="platform-admin-header__tools">
          <PanelAccessNav tone="platform" />
          <Tooltip title="راهنمای پنل">
            <Button
              type="text"
              aria-label="راهنمای پنل"
              data-testid="panel-guide-trigger"
              icon={<QuestionCircleOutlined />}
              onClick={onHelp}
            />
          </Tooltip>
          <Button type="text" className="platform-admin-header__search" icon={<SearchOutlined />} onClick={() => setCommandOpen(true)}>
            <span>جستجو</span><kbd>⌘ K</kbd>
          </Button>
          <OwnerThemeToggle theme={theme} onToggle={toggleTheme} />
          <Dropdown
            menu={{ items: [{ key: 'logout', icon: <MessageOutlined />, label: 'خروج از پنل', onClick: onSignOut }] }}
            placement="bottomLeft"
          >
            <button type="button" className="platform-admin-header__profile" aria-label="منوی مدیر">
              <Avatar className="platform-admin-header__avatar" icon={<UserOutlined />} />
              <span className="platform-admin-header__profile-copy"><strong>مدیر پلتفرم</strong><small>super_admin</small></span>
              <DownOutlined aria-hidden />
            </button>
          </Dropdown>
        </div>
      </div>
      <AppCommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </>
  );
}

function PlatformBreadcrumb() {
  const { pathname, search } = useLocation();
  const detail = pathname.includes('/details');
  const current = routeLabel(pathname);
  return (
    <nav className="platform-admin-breadcrumb" aria-label="مسیر صفحه">
      <Link to="/platform-admin">داشبورد</Link>
      {pathname !== '/platform-admin' && <><span> / </span><Link to={detail ? `/platform-admin${search ? '' : ''}` : pathname}>{current}</Link></>}
      {detail && <><span> / </span><span>جزئیات</span></>}
    </nav>
  );
}

export function PlatformAdminShell({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const mobile = screens.lg === false;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const platformGuide = useFirstVisitPanelGuide('ara:platform-admin-guide:v1');

  return (
    <ThemeScope theme={theme} data-shell="platform-admin" className="platform-admin-root">
      <SeoHead title="پنل مدیریت سراسری آرا" />
      <ConfigProvider direction="rtl" locale={faIR} theme={getPlatformAdminTheme(theme)}>
        <AntdApp>
          <Layout hasSider={!mobile}>
            {mobile ? (
              <Drawer className="platform-admin-mobile-drawer" placement="right" open={mobileOpen} onClose={() => setMobileOpen(false)} closable={false} width={280} title={null}>
                <PlatformSider collapsed={false} onNavigate={(key) => { setMobileOpen(false); navigate(key); }} />
              </Drawer>
            ) : (
              <Layout.Sider width={280} collapsible collapsed={collapsed} collapsedWidth={72} trigger={null} onCollapse={setCollapsed} theme="light">
                <PlatformSider collapsed={collapsed} onNavigate={(key) => navigate(key)} />
              </Layout.Sider>
            )}
            <Layout>
              <Layout.Header>
                <PlatformHeader mobile={mobile} collapsed={collapsed} onToggleCollapsed={() => mobile ? setMobileOpen(true) : setCollapsed((value) => !value)} onSignOut={onSignOut} onHelp={platformGuide.replay} />
              </Layout.Header>
              <Layout.Content id={PLATFORM_ADMIN_CONTENT_ID} tabIndex={-1} data-panel-guide={platformAdminGuideId(location.pathname)}>
                <PlatformBreadcrumb />
                <a href={`#${PLATFORM_ADMIN_CONTENT_ID}`} className="sr-only">رفتن به محتوای اصلی</a>
                {children}
              </Layout.Content>
            </Layout>
          </Layout>
        </AntdApp>
      </ConfigProvider>
      <PanelOnboardingGuide
        open={platformGuide.open}
        onClose={platformGuide.close}
        steps={PLATFORM_ADMIN_GUIDE_STEPS}
      />
    </ThemeScope>
  );
}

export function PlatformAdminLayout() {
  const navigate = useNavigate();
  const { status, role, signOut } = useAuth();

  if (status === 'loading') return <RouteLoader />;
  if (status === 'anonymous') return <Navigate to="/auth" replace />;
  if (role !== 'PlatformAdmin') return <Navigate to={role ? '/owner' : '/account'} replace />;

  return <PlatformAdminShell onSignOut={() => { signOut(); navigate('/auth'); }}><Outlet /></PlatformAdminShell>;
}

export default PlatformAdminLayout;
