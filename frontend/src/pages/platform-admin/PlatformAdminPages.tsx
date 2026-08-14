import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  CreditCardOutlined,
  DatabaseOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShopOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  platformAdminApi,
  type PlatformAppointmentRow,
  type PlatformAuditRow,
  type PlatformCustomerRow,
  type PlatformListOptions,
  type PlatformPage,
  type PlatformPaymentRow,
  type PlatformQrScanRow,
  type PlatformSalonRow,
  type PlatformStaffRow,
  type PlatformSubscriptionRow,
  type PlatformWaitlistRow,
} from '../../api/client';
import { formatRial } from '../../components/ui/Money';
import { ErrorState } from '../../components/ui';
import './platform-admin.css';

export const platformDetailSnapshotKey = (resource: string, id: string) => `ara.platform-admin.detail:${resource}:${id}`;

const faNumber = new Intl.NumberFormat('fa-IR');
const dateFormatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });

const STATUS_LABEL: Record<string, string> = {
  active: 'فعال', trial: 'آزمایشی', grace: 'مهلت تمدید', expired: 'منقضی', suspended: 'تعلیق‌شده', inactive: 'غیرفعال',
  pending: 'در انتظار', held: 'موقت', confirmed: 'تأییدشده', completed: 'انجام‌شده', cancelled: 'لغوشده', no_show: 'عدم مراجعه',
  paid: 'پرداخت‌شده', refunded: 'مستردشده', retained: 'نگه‌داشته‌شده', failed: 'ناموفق', waiting: 'در صف', notified: 'اطلاع داده‌شده', fulfilled: 'تکمیل‌شده',
  web: 'وب', mobile: 'موبایل', walkin: 'حضوری', bot: 'ربات', monthly: 'ماهانه', quarterly: 'سه‌ماهه', annual: 'سالانه', Owner: 'مالک', Admin: 'ادمین', Stylist: 'آرایشگر',
};

function label(value: string | null | undefined): string {
  if (!value) return '—';
  return STATUS_LABEL[value] ?? value.replaceAll('_', ' ');
}

function tagColor(value: string | null | undefined): string {
  if (['active', 'paid', 'confirmed', 'completed', 'fulfilled'].includes(value ?? '')) return 'green';
  if (['pending', 'trial', 'grace', 'held', 'waiting', 'notified'].includes(value ?? '')) return 'gold';
  if (['expired', 'suspended', 'inactive', 'cancelled', 'no_show', 'failed'].includes(value ?? '')) return 'red';
  if (['mobile', 'web', 'bot', 'annual', 'Owner'].includes(value ?? '')) return 'blue';
  return 'default';
}

function StatusTag({ value, children }: { value?: string | null; children?: ReactNode }) {
  return <Tag color={tagColor(value)}>{children ?? label(value)}</Tag>;
}

function dateLabel(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : (withTime ? dateTimeFormatter.format(date) : dateFormatter.format(date));
}

function personName(fullName: string | null | undefined, phone?: string | null): string {
  return fullName?.trim() || phone || 'بدون نام';
}

function idLabel(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}…${id.slice(-4)}` : '—';
}

function PageHeader({ title, subtitle, onRefresh, loading }: { title: string; subtitle: string; onRefresh?: () => void; loading?: boolean }) {
  return (
    <header className="platform-admin-page-header">
      <div className="platform-admin-page-header__copy">
        <span className="platform-admin-page-header__eyebrow">مرکز مدیریت سراسری آرا</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {onRefresh && <Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>بازخوانی</Button>}
    </header>
  );
}

function RecordDetailAction<T extends { id: string }>({ resource, record }: { resource: string; record: T }) {
  const navigate = useNavigate();
  const location = useLocation();
  const open = () => {
    sessionStorage.setItem(platformDetailSnapshotKey(resource, record.id), JSON.stringify(record));
    sessionStorage.setItem(`${platformDetailSnapshotKey(resource, record.id)}:back`, `${location.pathname}${location.search}`);
    navigate(`/platform-admin/details?resource=${encodeURIComponent(resource)}&id=${encodeURIComponent(record.id)}`);
  };
  return <Button size="small" icon={<EyeOutlined />} onClick={open}>جزئیات</Button>;
}

type Column<T> = { key: string; title: string; width?: number; render: (row: T) => ReactNode };
type ResourceAction<T> = (row: T, run: (key: string, callback: () => Promise<void>) => void, busyKey: string | null) => ReactNode;

function TableSkeleton() {
  return <Card><Skeleton active paragraph={{ rows: 7 }} /></Card>;
}

function usePlatformList<T>(loader: (options: PlatformListOptions) => Promise<PlatformPage<T>>, options: PlatformListOptions) {
  const [result, setResult] = useState<PlatformPage<T> | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState('');
  const optionsKey = JSON.stringify(options);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setError('');
    loader(options).then((next) => {
      if (!alive) return;
      setResult(next);
      setStatus('success');
    }).catch(() => {
      if (!alive) return;
      setStatus('error');
      setError('دریافت اطلاعات انجام نشد. اتصال را بررسی و دوباره تلاش کنید.');
    });
    return () => { alive = false; };
  }, [loader, optionsKey, reloadKey]);

  return { result, status, error, reload: () => setReloadKey((value) => value + 1) };
}

function ResourceListPage<T extends { id: string }>({
  resource,
  title,
  subtitle,
  loader,
  columns,
  statusOptions,
  action,
}: {
  resource: string;
  title: string;
  subtitle: string;
  loader: (options: PlatformListOptions) => Promise<PlatformPage<T>>;
  columns: Column<T>[];
  statusOptions?: Array<{ value: string; label: string }>;
  action?: ResourceAction<T>;
}) {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [page, setPage] = useState(1);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const options = useMemo(() => ({ page, limit: 12, search: search.trim() || undefined, status: statusFilter || undefined }), [page, search, statusFilter]);
  const { result, status, error, reload } = usePlatformList(loader, options);

  const run = async (key: string, callback: () => Promise<void>) => {
    setBusyKey(key);
    setActionError('');
    try { await callback(); reload(); } catch { setActionError('تغییر وضعیت انجام نشد. دوباره تلاش کنید.'); } finally { setBusyKey(null); }
  };

  const tableColumns: ColumnsType<T> = [
    ...columns.map((column) => ({ title: column.title, key: column.key, width: column.width, render: (_: unknown, row: T) => column.render(row) })),
    {
      title: 'عملیات',
      key: 'actions',
      width: action ? 220 : 108,
      fixed: 'right',
      render: (_: unknown, row: T) => (
        <Space size={6} wrap>
          <RecordDetailAction resource={resource} record={row} />
          {action?.(row, (key, callback) => { void run(key, callback); }, busyKey)}
        </Space>
      ),
    },
  ];

  const rowProps: TableProps<T>['onRow'] = (row) => ({
    className: 'platform-admin-detail-row',
    tabIndex: 0,
    'aria-label': `جزئیات ${row.id}`,
    onClick: (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('button,a,input,textarea,select,[role="button"]')) return;
      sessionStorage.setItem(platformDetailSnapshotKey(resource, row.id), JSON.stringify(row));
      sessionStorage.setItem(`${platformDetailSnapshotKey(resource, row.id)}:back`, `${window.location.pathname}${window.location.search}`);
      window.location.assign(`/platform-admin/details?resource=${encodeURIComponent(resource)}&id=${encodeURIComponent(row.id)}`);
    },
    onKeyDown: (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      sessionStorage.setItem(platformDetailSnapshotKey(resource, row.id), JSON.stringify(row));
      window.location.assign(`/platform-admin/details?resource=${encodeURIComponent(resource)}&id=${encodeURIComponent(row.id)}`);
    },
  });

  return (
    <div className="platform-admin-page">
      <PageHeader title={title} subtitle={subtitle} onRefresh={reload} loading={status === 'loading'} />
      <Card className="platform-admin-filter-card">
        <div className="platform-admin-filter-row">
          <Input allowClear prefix={<SearchOutlined />} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="جستجو در رکوردها…" aria-label="جستجو در رکوردها" />
          {statusOptions && <Select aria-label="فیلتر وضعیت" allowClear value={statusFilter || undefined} onChange={(value) => { setStatusFilter(value ?? ''); setPage(1); }} placeholder="همه وضعیت‌ها" options={statusOptions} style={{ minWidth: 180 }} />}
          {(search || statusFilter) && <Button icon={<CloseOutlined />} onClick={() => { setSearch(''); setStatusFilter(''); setPage(1); }}>پاک‌کردن فیلتر</Button>}
        </div>
      </Card>
      {actionError && <Alert className="mb-4" type="error" showIcon message={actionError} />}
      {status === 'error' ? <ErrorState title="بارگذاری ناموفق بود" description={error} onRetry={reload} /> : status === 'loading' && !result ? <TableSkeleton /> : result ? (
        <Table<T>
          rowKey="id"
          columns={tableColumns}
          dataSource={result.data}
          onRow={rowProps}
          scroll={{ x: 980 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="رکوردی برای نمایش وجود ندارد." /> }}
          pagination={{ current: result.meta.page, pageSize: result.meta.limit, total: result.meta.total, showSizeChanger: false, showTotal: (total) => `${faNumber.format(total)} رکورد` , onChange: (next) => setPage(next) }}
        />
      ) : null}
    </div>
  );
}

function StatCard({ title, value, detail, icon, color }: { title: string; value: ReactNode; detail: string; icon: ReactNode; color?: string }) {
  return (
    <Card className="platform-admin-stat-card">
      <div className="platform-admin-stat-card__top"><span className="platform-admin-stat-card__icon" style={color ? { color } : undefined}>{icon}</span><span className="platform-admin-stat-card__label">{title}</span></div>
      <strong className="platform-admin-stat-card__value">{value}</strong>
      <span className="platform-admin-stat-card__detail">{detail}</span>
    </Card>
  );
}

export function PlatformDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof platformAdminApi.getDashboard>> | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const load = useCallback(() => { setStatus('loading'); platformAdminApi.getDashboard().then((next) => { setData(next); setStatus('success'); }).catch(() => setStatus('error')); }, []);
  useEffect(() => { load(); }, [load]);

  if (status === 'error') return <div className="platform-admin-page"><ErrorState title="داشبورد در دسترس نیست" description="اتصال به داده‌های پلتفرم برقرار نشد." onRetry={load} /></div>;
  if (status === 'loading' && !data) return <div className="platform-admin-page platform-admin-skeleton"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  if (!data) return null;
  const { metrics } = data;
  const maxTrend = Math.max(1, ...data.trend.map((point) => Math.max(point.appointments, point.qrScans)));

  return (
    <div className="platform-admin-page">
      <PageHeader title="مرکز عملیات" subtitle="وضعیت لحظه‌ای سالن‌ها، رزروها، درآمد و نقاط نیازمند پیگیری در کل آرا." onRefresh={load} loading={status === 'loading'} />
      <div className="platform-admin-dashboard-grid">
        <StatCard title="سالن‌های فعال" value={faNumber.format(metrics.activeSalons)} detail={`${faNumber.format(metrics.suspendedSalons)} تعلیق‌شده`} icon={<ShopOutlined />} />
        <StatCard title="مشتری‌ها" value={faNumber.format(metrics.totalCustomers)} detail={`${faNumber.format(metrics.totalStaff)} پرسنل فعال`} icon={<TeamOutlined />} color="#4168c5" />
        <StatCard title="نوبت‌های امروز" value={faNumber.format(metrics.todayAppointments)} detail={`${faNumber.format(metrics.pendingAppointments)} در انتظار تأیید`} icon={<CalendarOutlined />} color="#257052" />
        <StatCard title="درآمد ۳۰ روز اخیر" value={formatRial(metrics.revenue30dRial)} detail={`${faNumber.format(metrics.pendingPayments)} پرداخت در انتظار`} icon={<WalletOutlined />} color="#946000" />
      </div>
      <div className="platform-admin-dashboard-columns">
        <Card title={<span><strong>روند فعالیت</strong><Typography.Text type="secondary" className="block text-xs">۱۴ روز اخیر — نوبت و اسکن QR</Typography.Text></span>} extra={<FireOutlined />}>
          <div className="platform-admin-chart" role="img" aria-label="روند نوبت و اسکن QR">
            {data.trend.map((point) => <div key={point.date} className="platform-admin-chart__day" title={`${dateLabel(point.date)}: ${point.appointments} نوبت، ${point.qrScans} اسکن`}><span className="platform-admin-chart__bar" style={{ height: `${Math.max(point.appointments ? 4 : 0, point.appointments / maxTrend * 100)}%` }} /><span className="platform-admin-chart__bar platform-admin-chart__bar--secondary" style={{ height: `${Math.max(point.qrScans ? 4 : 0, point.qrScans / maxTrend * 100)}%` }} /></div>)}
          </div>
          <div className="platform-admin-legend"><span><i />نوبت‌ها</span><span><i className="secondary" />اسکن QR</span></div>
        </Card>
        <Card title={<span><strong>صندوق عملیات</strong><Typography.Text type="secondary" className="block text-xs">مواردی که نیاز به بررسی دارند</Typography.Text></span>} extra={<ExclamationCircleOutlined />}>
          <div className="platform-admin-inbox">
            <Link to="/platform-admin/appointments?status=pending"><ClockCircleOutlined /><span>رزروهای در انتظار تأیید</span><strong>{faNumber.format(metrics.pendingAppointments)}</strong><ArrowLeftOutlined /></Link>
            <Link to="/platform-admin/waitlist?status=waiting"><DatabaseOutlined /><span>مشتری‌های صف انتظار</span><strong>{faNumber.format(metrics.waitingList)}</strong><ArrowLeftOutlined /></Link>
            <Link to="/platform-admin/payments?status=pending"><CreditCardOutlined /><span>پرداخت‌های در انتظار</span><strong>{faNumber.format(metrics.pendingPayments)}</strong><ArrowLeftOutlined /></Link>
          </div>
        </Card>
      </div>
      <Card className="platform-admin-dashboard-table" title={<span><strong>آخرین سالن‌های ثبت‌شده</strong><Typography.Text type="secondary" className="block text-xs">ورودی‌های جدید برای پیگیری onboarding</Typography.Text></span>} extra={<Link to="/platform-admin/salons">مشاهده همه</Link>}>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={data.recentSalons}
          columns={[
            { title: 'سالن', dataIndex: 'name', render: (value: string) => <strong>{value}</strong> },
            { title: 'اشتراک', render: (row: typeof data.recentSalons[number]) => row.subscription ? label(row.subscription.planKind) : 'بدون اشتراک' },
            { title: 'وضعیت', render: (row: typeof data.recentSalons[number]) => <StatusTag value={row.active ? 'active' : 'suspended'} /> },
            { title: 'ثبت‌شده', dataIndex: 'createdAt', render: (value: string) => dateLabel(value, true) },
            { title: 'جزئیات', render: (row: typeof data.recentSalons[number]) => <Button size="small" icon={<EyeOutlined />} onClick={() => { sessionStorage.setItem(platformDetailSnapshotKey('salons', row.id), JSON.stringify(row)); navigate(`/platform-admin/details?resource=salons&id=${row.id}`); }}>مشاهده</Button> },
          ]}
        />
      </Card>
    </div>
  );
}

export function PlatformSalonsPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listSalons(options), []);
  return <ResourceListPage resource="salons" title="سالن‌ها" subtitle="همه tenantهای آرا، وضعیت اشتراک، مالک و سلامت عملیاتی هر سالن." loader={loader} statusOptions={[{ value: 'active', label: 'فعال' }, { value: 'suspended', label: 'تعلیق‌شده' }, { value: 'trial', label: 'آزمایشی' }, { value: 'expired', label: 'منقضی' }]} columns={[
    { key: 'name', title: 'سالن', render: (row: PlatformSalonRow) => <div className="platform-admin-table-name"><strong>{row.name}</strong><span>{row.timezone} · {row.qrToken}</span></div> },
    { key: 'owner', title: 'مالک', render: (row) => <div className="platform-admin-table-name"><strong>{personName(row.owner?.fullName, row.owner?.phone)}</strong><span dir="ltr">{row.owner?.phone ?? 'بدون تلفن'}</span></div> },
    { key: 'subscription', title: 'اشتراک', render: (row) => row.subscription ? <div><StatusTag value={row.subscription.status} /><span className="block text-xs text-gray-500">{label(row.subscription.planKind)} تا {dateLabel(row.subscription.expiresAt)}</span></div> : '—' },
    { key: 'counts', title: 'مصرف', render: (row) => `${faNumber.format(row.counts.staffMembers)} پرسنل · ${faNumber.format(row.counts.appointments)} نوبت` },
    { key: 'created', title: 'تاریخ ثبت', render: (row) => dateLabel(row.createdAt) },
  ]} action={(row, run, busy) => <Button danger={row.active} type={row.active ? 'primary' : 'default'} size="small" loading={busy === `salon-${row.id}`} onClick={() => { if (row.active && !window.confirm(`تعلیق سالن «${row.name}»؟`)) return; void run(`salon-${row.id}`, () => platformAdminApi.setSalonActive(row.id, !row.active).then(() => undefined)); }}>{row.active ? 'تعلیق' : 'فعال‌سازی'}</Button>} />;
}

export function PlatformCustomersPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listCustomers(options), []);
  return <ResourceListPage resource="customers" title="مشتری‌ها" subtitle="نمای کلی کاربران نهایی، سابقه نوبت و سیگنال‌های no-show در کل پلتفرم." loader={loader} columns={[
    { key: 'customer', title: 'مشتری', render: (row: PlatformCustomerRow) => <div className="platform-admin-table-name"><strong>{personName(row.fullName)}</strong><span dir="ltr">{row.phone}</span></div> },
    { key: 'appointments', title: 'نوبت‌ها', render: (row) => faNumber.format(row._count.appointments) },
    { key: 'waitlist', title: 'صف انتظار', render: (row) => faNumber.format(row._count.waitlistEntries) },
    { key: 'noShow', title: 'عدم مراجعه', render: (row) => <StatusTag value={row.noShowCount > 0 ? 'pending' : undefined}>{faNumber.format(row.noShowCount)}</StatusTag> },
    { key: 'id', title: 'شناسه', render: (row) => <Typography.Text copyable={{ text: row.id }} code>{idLabel(row.id)}</Typography.Text> },
  ]} />;
}

export function PlatformStaffPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listStaff(options), []);
  return <ResourceListPage resource="staff" title="پرسنل سالن‌ها" subtitle="دسترسی staff در سراسر tenantها؛ غیرفعال‌سازی ورود پرسنل از همین‌جا audit می‌شود." loader={loader} statusOptions={[{ value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }, { value: 'Owner', label: 'مالک' }, { value: 'Admin', label: 'ادمین' }, { value: 'Stylist', label: 'آرایشگر' }]} columns={[
    { key: 'staff', title: 'پرسنل', render: (row: PlatformStaffRow) => <div className="platform-admin-table-name"><strong>{row.fullName}</strong><span dir="ltr">{row.phone ?? 'بدون ورود OTP'}</span></div> },
    { key: 'salon', title: 'سالن', render: (row) => row.salon.name },
    { key: 'role', title: 'نقش', render: (row) => <StatusTag value={row.role}>{label(row.role)}</StatusTag> },
    { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.active ? 'active' : 'inactive'} /> },
  ]} action={(row, run, busy) => <Button danger={row.active} type={row.active ? 'primary' : 'default'} size="small" loading={busy === `staff-${row.id}`} onClick={() => void run(`staff-${row.id}`, () => platformAdminApi.setStaffActive(row.id, !row.active).then(() => undefined))}>{row.active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</Button>} />;
}

function AppointmentActions({ row, run, busyKey }: { row: PlatformAppointmentRow; run: (key: string, callback: () => Promise<void>) => void; busyKey: string | null }) {
  const actions: Array<{ value: 'approve' | 'reject' | 'cancel' | 'no_show' | 'complete'; title: string; danger?: boolean }> = [];
  if (row.status === 'pending') actions.push({ value: 'approve', title: 'تأیید' }, { value: 'reject', title: 'رد', danger: true });
  if (['pending', 'held', 'confirmed'].includes(row.status)) actions.push({ value: 'cancel', title: 'لغو', danger: true });
  if (row.status === 'confirmed') actions.push({ value: 'complete', title: 'انجام شد' }, { value: 'no_show', title: 'عدم مراجعه', danger: true });
  if (!actions.length) return <Typography.Text type="secondary">بدون اقدام</Typography.Text>;
  return <Space size={4} wrap>{actions.map((item) => <Button key={item.value} size="small" danger={item.danger} loading={busyKey === `${item.value}-${row.id}`} onClick={() => void run(`${item.value}-${row.id}`, () => platformAdminApi.appointmentAction(row.id, item.value).then(() => undefined))}>{item.title}</Button>)}</Space>;
}

export function PlatformAppointmentsPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listAppointments(options), []);
  return <ResourceListPage resource="appointments" title="نوبت‌ها" subtitle="عملیات cross-tenant روی نوبت‌ها با همان state machine موجود انجام می‌شود؛ تغییر مستقیم status نداریم." loader={loader} statusOptions={['pending', 'held', 'confirmed', 'completed', 'cancelled', 'no_show'].map((value) => ({ value, label: label(value) }))} columns={[
    { key: 'time', title: 'زمان', render: (row: PlatformAppointmentRow) => <div className="platform-admin-table-name"><strong>{dateLabel(row.startAt, true)}</strong><span>تا {dateLabel(row.endAt, true)}</span></div> },
    { key: 'customer', title: 'مشتری', render: (row) => <div className="platform-admin-table-name"><strong>{personName(row.customer.fullName, row.customer.phone)}</strong><span dir="ltr">{row.customer.phone}</span></div> },
    { key: 'salon', title: 'سالن / خدمت', render: (row) => <div className="platform-admin-table-name"><strong>{row.salon.name}</strong><span>{row.service.name} · {formatRial(row.service.priceRial)}</span></div> },
    { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.status} /> },
    { key: 'source', title: 'منبع', render: (row) => <StatusTag value={row.source} /> },
  ]} action={(row, run, busy) => <AppointmentActions row={row} run={run} busyKey={busy} />} />;
}

export function PlatformSubscriptionsPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listSubscriptions(options), []);
  return <ResourceListPage resource="subscriptions" title="اشتراک‌ها" subtitle="وضعیت lifecycle اشتراک هر سالن و تاریخ انقضا؛ فعال‌سازی مالی فقط از callback پرداخت انجام می‌شود." loader={loader} statusOptions={['trial', 'active', 'grace', 'expired'].map((value) => ({ value, label: label(value) }))} columns={[
    { key: 'salon', title: 'سالن', render: (row: PlatformSubscriptionRow) => row.salon.name },
    { key: 'plan', title: 'پلن', render: (row) => label(row.planKind) },
    { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.status} /> },
    { key: 'expires', title: 'انقضا', render: (row) => dateLabel(row.expiresAt) },
    { key: 'grace', title: 'مهلت', render: (row) => dateLabel(row.graceUntil) },
    { key: 'salonStatus', title: 'وضعیت سالن', render: (row) => <StatusTag value={row.salon.active ? 'active' : 'suspended'} /> },
  ]} />;
}

export function PlatformPaymentsPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listPayments(options), []);
  return <ResourceListPage resource="payments" title="پرداخت‌ها" subtitle="ledger یکپارچه پرداخت رزرو و اشتراک؛ مبلغ‌ها از Rial واقعی backend خوانده می‌شوند." loader={loader} statusOptions={['pending', 'paid', 'refunded', 'retained', 'failed'].map((value) => ({ value, label: label(value) }))} columns={[
    { key: 'kind', title: 'نوع', render: (row: PlatformPaymentRow) => <StatusTag value="web">{row.kind === 'appointment' ? 'رزرو' : 'اشتراک'}</StatusTag> },
    { key: 'salon', title: 'سالن', render: (row) => row.salon.name },
    { key: 'subject', title: 'شرح', render: (row) => <div className="platform-admin-table-name"><strong>{label(row.subject)}</strong><span>{row.customer ? personName(row.customer.fullName, row.customer.phone) : '—'}</span></div> },
    { key: 'amount', title: 'مبلغ', render: (row) => formatRial(row.amountRial) },
    { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.status} /> },
    { key: 'date', title: 'تاریخ', render: (row) => dateLabel(row.createdAt, true) },
  ]} />;
}

export function PlatformWaitlistPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listWaitlist(options), []);
  return <ResourceListPage resource="waitlist" title="صف انتظار" subtitle="تقاضاهای بدون slot آزاد، وضعیت اطلاع‌رسانی و سالن مربوطه." loader={loader} statusOptions={['waiting', 'notified', 'fulfilled', 'cancelled'].map((value) => ({ value, label: label(value) }))} columns={[
    { key: 'customer', title: 'مشتری', render: (row: PlatformWaitlistRow) => <div className="platform-admin-table-name"><strong>{personName(row.customer.fullName, row.customer.phone)}</strong><span dir="ltr">{row.customer.phone}</span></div> },
    { key: 'salon', title: 'سالن / خدمت', render: (row) => <div className="platform-admin-table-name"><strong>{row.salon.name}</strong><span>{row.service.name}</span></div> },
    { key: 'window', title: 'بازه مطلوب', render: (row) => `${dateLabel(row.windowStart, true)} – ${dateLabel(row.windowEnd, true)}` },
    { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.status} /> },
    { key: 'created', title: 'ثبت', render: (row) => dateLabel(row.createdAt, true) },
  ]} />;
}

export function PlatformQrScansPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listQrScans(options), []);
  return <ResourceListPage resource="qr-scans" title="اسکن‌های QR" subtitle="عملکرد کمپین‌های QR هر سالن؛ مناسب برای سنجش کانال جذب در MVP بدون marketplace." loader={loader} columns={[
    { key: 'salon', title: 'سالن', render: (row: PlatformQrScanRow) => row.salon.name },
    { key: 'source', title: 'منبع کمپین', render: (row) => <StatusTag value="web">{row.source}</StatusTag> },
    { key: 'created', title: 'زمان اسکن', render: (row) => dateLabel(row.createdAt, true) },
    { key: 'id', title: 'شناسه', render: (row) => <Typography.Text copyable={{ text: row.id }} code>{idLabel(row.id)}</Typography.Text> },
  ]} />;
}

export function PlatformAuditPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listAuditLogs(options), []);
  return <ResourceListPage resource="audit-logs" title="گزارش تغییرات" subtitle="ردیابی تغییرات مدیر پلتفرم؛ برای عیب‌یابی و پاسخ‌گویی، metadata به‌صورت ساختاری ذخیره می‌شود." loader={loader} columns={[
    { key: 'action', title: 'عملیات', render: (row: PlatformAuditRow) => <Typography.Text code>{row.action}</Typography.Text> },
    { key: 'entity', title: 'رکورد', render: (row) => <div className="platform-admin-table-name"><strong>{row.entityType}</strong><span>{idLabel(row.entityId)}</span></div> },
    { key: 'admin', title: 'مدیر', render: (row) => personName(row.admin.fullName, row.admin.phone) },
    { key: 'metadata', title: 'جزئیات', render: (row) => <Typography.Text ellipsis={{ tooltip: row.metadata ? JSON.stringify(row.metadata) : '—' }}>{row.metadata ? JSON.stringify(row.metadata) : '—'}</Typography.Text> },
    { key: 'date', title: 'زمان', render: (row) => dateLabel(row.createdAt, true) },
  ]} />;
}
