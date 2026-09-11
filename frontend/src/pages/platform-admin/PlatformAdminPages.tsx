import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  App as AntdApp,
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
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
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  ReloadOutlined,
  PrinterOutlined,
  PlusOutlined,
  SearchOutlined,
  ShopOutlined,
  TeamOutlined,
  UnlockOutlined,
  UserAddOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  platformAdminApi,
  type PlatformAppointmentRow,
  type PlatformAdminRow,
  type PlatformAuditRow,
  type PlatformCardOrderRow,
  type PlatformCustomerRow,
  type PlatformListOptions,
  type PlatformPage,
  type PlatformPaymentRow,
  type PlatformQrScanRow,
  type PlatformSalonRow,
  type PlatformServiceRow,
  type PlatformSalonResourceRow,
  type PlatformStaffRow,
  type PlatformSupportTicketRow,
  type PlatformSubscriptionRow,
  type PlatformWaitlistRow,
} from '../../api/client';
import { getApiErrorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { formatToman } from '../../components/ui/Money';
import { ErrorState } from '../../components/ui';
import './platform-admin.css';

export const platformDetailSnapshotKey = (resource: string, id: string) => `ara.platform-admin.detail:${resource}:${id}`;

const faNumber = new Intl.NumberFormat('fa-IR');
const dateFormatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' });

const STATUS_LABEL: Record<string, string> = {
  active: 'فعال', trial: 'آزمایشی', grace: 'مهلت تمدید', expired: 'منقضی', suspended: 'تعلیق‌شده', inactive: 'غیرفعال', deleted: 'حذف‌شده',
  pending: 'در انتظار', held: 'موقت', confirmed: 'تأییدشده', completed: 'انجام‌شده', cancelled: 'لغوشده', no_show: 'عدم مراجعه',
  received: 'دریافت‌شده', contacted: 'تماس گرفته شد', in_print: 'در حال چاپ', shipped: 'ارسال‌شده',
  open: 'باز', triaged: 'دسته‌بندی‌شده', in_progress: 'در حال پیگیری', resolved: 'حل‌شده', closed: 'بسته‌شده',
  low: 'کم', normal: 'عادی', high: 'زیاد', urgent: 'فوری',
  paid: 'پرداخت‌شده', refunded: 'مستردشده', retained: 'نگه‌داشته‌شده', failed: 'ناموفق', waiting: 'در صف', notified: 'اطلاع داده‌شده', fulfilled: 'تکمیل‌شده',
  web: 'وب', mobile: 'موبایل', walkin: 'حضوری', bot: 'ربات', monthly: 'ماهانه', quarterly: 'سه‌ماهه', annual: 'سالانه', Owner: 'مالک', Admin: 'ادمین', Stylist: 'عضو تیم',
};

function label(value: string | null | undefined): string {
  if (!value) return '—';
  return STATUS_LABEL[value] ?? value.replaceAll('_', ' ');
}

function tagColor(value: string | null | undefined): string {
  if (['active', 'paid', 'confirmed', 'completed', 'fulfilled'].includes(value ?? '')) return 'green';
  if (['pending', 'trial', 'grace', 'held', 'waiting', 'notified', 'received', 'contacted', 'open', 'triaged', 'normal'].includes(value ?? '')) return 'gold';
  if (['expired', 'suspended', 'inactive', 'deleted', 'cancelled', 'no_show', 'failed', 'urgent'].includes(value ?? '')) return 'red';
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

function PageHeader({
  title,
  subtitle,
  onRefresh,
  loading,
  extra,
}: {
  title: string;
  subtitle: string;
  onRefresh?: () => void;
  loading?: boolean;
  extra?: ReactNode;
}) {
  return (
    <header className="platform-admin-page-header">
      <div className="platform-admin-page-header__copy">
        <span className="platform-admin-page-header__eyebrow">مرکز مدیریت سراسری آرا</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <Space wrap>
        {extra}
        {onRefresh && <Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>بازخوانی</Button>}
      </Space>
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

function FormField({ label: title, children }: { label: string; children: ReactNode }) {
  return <label className="platform-admin-form-field"><span>{title}</span>{children}</label>;
}

function CrudModal({
  open,
  title,
  children,
  onCancel,
  onSubmit,
  loading,
  error,
  okText = 'ذخیره',
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
  loading: boolean;
  error: string;
  okText?: string;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onCancel={() => !loading && onCancel()}
      footer={<Space><Button onClick={onCancel} disabled={loading}>انصراف</Button><Button type="primary" onClick={onSubmit} loading={loading}>{okText}</Button></Space>}
      destroyOnHidden
    >
      <div className="platform-admin-form-grid">
        {children}
        {error && <Alert className="platform-admin-form-error" type="error" showIcon message={error} />}
      </div>
    </Modal>
  );
}

function PlatformSalonEditor({ row, open, onClose, onSaved }: { row?: PlatformSalonRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('Asia/Tehran');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? '');
    setOwnerName('');
    setPhone('');
    setTimezone(row?.timezone ?? 'Asia/Tehran');
    setError('');
  }, [open, row?.id, row?.name, row?.timezone]);
  const submit = async () => {
    if (!name.trim()) { setError('نام سالن را وارد کنید.'); return; }
    if (!row && (!ownerName.trim() || !phone.trim())) { setError('نام مالک و شماره موبایل الزامی است.'); return; }
    setSaving(true);
    setError('');
    try {
      if (row) await platformAdminApi.updateSalon(row.id, { name: name.trim(), timezone: timezone.trim() || 'Asia/Tehran' });
      else await platformAdminApi.createSalon({ salonName: name.trim(), ownerName: ownerName.trim(), phone: phone.trim(), timezone: timezone.trim() || undefined });
      onClose();
      onSaved();
    } catch (cause) { setError(getApiErrorMessage(cause, 'ذخیره سالن انجام نشد.')); } finally { setSaving(false); }
  };
  return <CrudModal open={open} title={row ? 'ویرایش سالن' : 'ثبت سالن جدید'} onCancel={onClose} onSubmit={() => void submit()} loading={saving} error={error} okText={row ? 'ذخیره تغییرات' : 'ثبت سالن'}>
    <FormField label="نام سالن"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} autoFocus /></FormField>
    {!row && <FormField label="نام مالک"><Input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} maxLength={120} /></FormField>}
    {!row && <FormField label="موبایل مالک"><Input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={20} /></FormField>}
    <FormField label="منطقه زمانی"><Input dir="ltr" value={timezone} onChange={(event) => setTimezone(event.target.value)} maxLength={80} /></FormField>
  </CrudModal>;
}

function PlatformCustomerEditor({ row, open, onClose, onSaved }: { row?: PlatformCustomerRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setFullName(row?.fullName ?? '');
    setPhone(row?.phone ?? '');
    setError('');
  }, [open, row?.id, row?.fullName, row?.phone]);
  const submit = async () => {
    if (!phone.trim()) { setError('شماره موبایل را وارد کنید.'); return; }
    setSaving(true); setError('');
    try {
      if (row) await platformAdminApi.updateCustomer(row.id, { fullName: fullName.trim() || null, phone: phone.trim() });
      else await platformAdminApi.createCustomer({ fullName: fullName.trim() || null, phone: phone.trim() });
      onClose(); onSaved();
    } catch (cause) { setError(getApiErrorMessage(cause, 'ذخیره کاربر انجام نشد.')); } finally { setSaving(false); }
  };
  return <CrudModal open={open} title={row ? 'ویرایش مشتری' : 'ثبت مشتری جدید'} onCancel={onClose} onSubmit={() => void submit()} loading={saving} error={error} okText={row ? 'ذخیره تغییرات' : 'ثبت مشتری'}>
    <FormField label="نام و نام خانوادگی"><Input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} autoFocus /></FormField>
    <FormField label="موبایل"><Input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={20} /></FormField>
  </CrudModal>;
}

function PlatformStaffEditor({ row, open, onClose, onSaved }: { row?: PlatformStaffRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('Stylist');
  const [salonId, setSalonId] = useState('');
  const [salons, setSalons] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingSalons, setLoadingSalons] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setFullName(row?.fullName ?? '');
    setPhone(row?.phone ?? '');
    setRole(row?.role ?? 'Stylist');
    setSalonId(row?.salon.id ?? '');
    setError('');
    if (!row) {
      setLoadingSalons(true);
      platformAdminApi.listSalons({ page: 1, limit: 100 }).then((result) => setSalons(result.data.map((salon) => ({ id: salon.id, name: salon.name })))).catch(() => setError('فهرست سالن‌ها دریافت نشد.')).finally(() => setLoadingSalons(false));
    }
  }, [open, row?.id, row?.fullName, row?.phone, row?.role, row?.salon.id]);
  const submit = async () => {
    if (!fullName.trim()) { setError('نام عضو تیم را وارد کنید.'); return; }
    if (!row && !salonId) { setError('سالن را انتخاب کنید.'); return; }
    setSaving(true); setError('');
    try {
      if (row) await platformAdminApi.updateStaff(row.id, { fullName: fullName.trim(), role, phone: phone.trim() || null });
      else await platformAdminApi.createStaff({ salonId, fullName: fullName.trim(), role, phone: phone.trim() || null });
      onClose(); onSaved();
    } catch (cause) { setError(getApiErrorMessage(cause, 'ذخیره عضو تیم انجام نشد.')); } finally { setSaving(false); }
  };
  return <CrudModal open={open} title={row ? 'ویرایش عضو تیم' : 'ثبت عضو تیم جدید'} onCancel={onClose} onSubmit={() => void submit()} loading={saving} error={error} okText={row ? 'ذخیره تغییرات' : 'ثبت عضو تیم'}>
    {!row && <FormField label="سالن"><Select showSearch optionFilterProp="label" loading={loadingSalons} value={salonId || undefined} onChange={setSalonId} options={salons.map((salon) => ({ value: salon.id, label: salon.name }))} placeholder="انتخاب سالن" /></FormField>}
    <FormField label="نام عضو تیم"><Input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} autoFocus /></FormField>
    <FormField label="نقش"><Select value={role} onChange={setRole} options={[{ value: 'Owner', label: 'مالک' }, { value: 'Admin', label: 'ادمین سالن' }, { value: 'Stylist', label: 'عضو تیم' }]} /></FormField>
    <FormField label="موبایل ورود OTP"><Input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={20} /></FormField>
  </CrudModal>;
}

function PlatformAdminEditor({ row, open, onClose, onSaved }: { row?: PlatformAdminRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('operator');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setFullName(row?.fullName ?? ''); setPhone(row?.phone ?? ''); setRole(row?.role ?? 'operator'); setError('');
  }, [open, row?.id, row?.fullName, row?.phone, row?.role]);
  const submit = async () => {
    if (!fullName.trim() || !phone.trim()) { setError('نام و شماره موبایل الزامی است.'); return; }
    setSaving(true); setError('');
    try {
      if (row) await platformAdminApi.updatePlatformAdmin(row.id, { fullName: fullName.trim(), phone: phone.trim(), role: role.trim() || 'operator' });
      else await platformAdminApi.createPlatformAdmin({ fullName: fullName.trim(), phone: phone.trim(), role: role.trim() || 'operator' });
      onClose(); onSaved();
    } catch (cause) { setError(getApiErrorMessage(cause, 'ذخیره مدیر پلتفرم انجام نشد.')); } finally { setSaving(false); }
  };
  return <CrudModal open={open} title={row ? 'ویرایش مدیر پلتفرم' : 'افزودن مدیر پلتفرم'} onCancel={onClose} onSubmit={() => void submit()} loading={saving} error={error} okText="ذخیره">
    <FormField label="نام"><Input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} autoFocus /></FormField>
    <FormField label="موبایل"><Input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={20} /></FormField>
    <FormField label="نقش دسترسی"><Input dir="ltr" value={role} onChange={(event) => setRole(event.target.value)} maxLength={60} /></FormField>
  </CrudModal>;
}

function usePlatformConfirm() {
  const { modal } = AntdApp.useApp();
  return useCallback((title: string, content: string, onOk: () => void, danger = true) => {
    modal.confirm({
      title,
      content,
      okText: 'تأیید',
      cancelText: 'انصراف',
      okButtonProps: danger ? { danger: true } : undefined,
      onOk,
    });
  }, [modal]);
}

function usePlatformList<T>(loader: (options: PlatformListOptions) => Promise<PlatformPage<T>>, options: PlatformListOptions, reloadToken = 0) {
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
  }, [loader, optionsKey, reloadKey, reloadToken]);

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
  createAction,
  refreshToken = 0,
}: {
  resource: string;
  title: string;
  subtitle: string;
  loader: (options: PlatformListOptions) => Promise<PlatformPage<T>>;
  columns: Column<T>[];
  statusOptions?: Array<{ value: string; label: string }>;
  action?: ResourceAction<T>;
  createAction?: ReactNode;
  refreshToken?: number;
}) {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [page, setPage] = useState(1);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const options = useMemo(() => ({ page, limit: 12, search: search.trim() || undefined, status: statusFilter || undefined }), [page, search, statusFilter]);
  const { result, status, error, reload } = usePlatformList(loader, options, refreshToken);

  const run = async (key: string, callback: () => Promise<void>) => {
    setBusyKey(key);
    setActionError('');
    try { await callback(); reload(); } catch (cause) { setActionError(getApiErrorMessage(cause, 'تغییر وضعیت انجام نشد. دوباره تلاش کنید.')); } finally { setBusyKey(null); }
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
      <PageHeader
        title={title}
        subtitle={subtitle}
        onRefresh={reload}
        loading={status === 'loading'}
        extra={createAction}
      />
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
      <PageHeader
        title="مرکز عملیات"
        subtitle="وضعیت لحظه‌ای سالن‌ها، رزروها، درآمد و نقاط نیازمند پیگیری در کل آرا."
        onRefresh={load}
        loading={status === 'loading'}
      />
      <div className="platform-admin-dashboard-grid">
        <StatCard title="سالن‌های فعال" value={faNumber.format(metrics.activeSalons)} detail={`${faNumber.format(metrics.suspendedSalons)} تعلیق‌شده`} icon={<ShopOutlined />} />
        <StatCard title="مشتری‌ها" value={faNumber.format(metrics.totalCustomers)} detail={`${faNumber.format(metrics.totalStaff)} عضو تیم فعال`} icon={<TeamOutlined />} color="#4168c5" />
        <StatCard title="نوبت‌های امروز" value={faNumber.format(metrics.todayAppointments)} detail={`${faNumber.format(metrics.pendingAppointments)} در انتظار تأیید`} icon={<CalendarOutlined />} color="#257052" />
        <StatCard title="درآمد ۳۰ روز اخیر" value={`${formatToman(metrics.revenue30dRial)} تومان`} detail={`${faNumber.format(metrics.pendingPayments)} پرداخت در انتظار`} icon={<WalletOutlined />} color="#946000" />
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
  const confirm = usePlatformConfirm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformSalonRow | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);
  return <>
  <ResourceListPage resource="salons" refreshToken={refreshToken} title="سالن‌ها" subtitle="همه tenantهای آرا، وضعیت اشتراک، مالک و سلامت عملیاتی هر سالن." loader={loader} createAction={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setEditorOpen(true); }}>ثبت سالن</Button>} statusOptions={[{ value: 'active', label: 'فعال' }, { value: 'suspended', label: 'تعلیق‌شده' }, { value: 'trial', label: 'آزمایشی' }, { value: 'expired', label: 'منقضی' }]} columns={[
    { key: 'name', title: 'سالن', render: (row: PlatformSalonRow) => <div className="platform-admin-table-name"><strong>{row.name}</strong><span>{row.timezone} · {row.qrToken}</span></div> },
    { key: 'owner', title: 'مالک', render: (row) => <div className="platform-admin-table-name"><strong>{personName(row.owner?.fullName, row.owner?.phone)}</strong><span dir="ltr">{row.owner?.phone ?? 'بدون تلفن'}</span></div> },
    { key: 'subscription', title: 'اشتراک', render: (row) => row.subscription ? <div><StatusTag value={row.subscription.status} /><span className="block text-xs text-gray-500">{label(row.subscription.planKind)} تا {dateLabel(row.subscription.expiresAt)}</span></div> : '—' },
    { key: 'counts', title: 'مصرف', render: (row) => `${faNumber.format(row.counts.staffMembers)} عضو تیم · ${faNumber.format(row.counts.appointments)} نوبت` },
    { key: 'created', title: 'تاریخ ثبت', render: (row) => dateLabel(row.createdAt) },
  ]} action={(row, run, busy) => <Space size={4} wrap>
    <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); setEditorOpen(true); }}>ویرایش</Button>
    <Button danger={row.active} type={row.active ? 'primary' : 'default'} size="small" loading={busy === `salon-status-${row.id}`} onClick={() => {
      const next = !row.active;
      confirm(next ? 'فعال‌سازی سالن' : 'تعلیق سالن', `وضعیت سالن «${row.name}» تغییر کند؟`, () => void run(`salon-status-${row.id}`, () => platformAdminApi.setSalonActive(row.id, next).then(() => undefined)));
    }}>{row.active ? 'تعلیق' : 'فعال‌سازی'}</Button>
    {row.active && <Button danger size="small" icon={<DeleteOutlined />} loading={busy === `salon-delete-${row.id}`} onClick={() => confirm('آرشیو سالن', `سالن «${row.name}» آرشیو شود؟ تاریخچه آن حذف نمی‌شود.`, () => void run(`salon-delete-${row.id}`, () => platformAdminApi.deleteSalon(row.id).then(() => undefined)))}>آرشیو</Button>}
  </Space>} />
  <PlatformSalonEditor row={editing} open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => setRefreshToken((value) => value + 1)} />
  </>;
}

export function PlatformCustomersPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listCustomers(options), []);
  const confirm = usePlatformConfirm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformCustomerRow | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);
  return <>
  <ResourceListPage resource="customers" refreshToken={refreshToken} title="مشتری‌ها" subtitle="مدیریت کامل کاربران نهایی؛ ویرایش، مسدودسازی، رفع مسدودی و حذف نرم با حفظ تاریخچه." loader={loader} createAction={<Button type="primary" icon={<UserAddOutlined />} onClick={() => { setEditing(undefined); setEditorOpen(true); }}>ثبت مشتری</Button>} statusOptions={[{ value: 'active', label: 'فعال' }, { value: 'blocked', label: 'مسدود' }, { value: 'deleted', label: 'حذف‌شده' }]} columns={[
    { key: 'customer', title: 'مشتری', render: (row: PlatformCustomerRow) => <div className="platform-admin-table-name"><strong>{personName(row.fullName)}</strong><span dir="ltr">{row.phone}</span></div> },
    { key: 'appointments', title: 'نوبت‌ها', render: (row) => faNumber.format(row._count.appointments) },
    { key: 'waitlist', title: 'صف انتظار', render: (row) => faNumber.format(row._count.waitlistEntries) },
    { key: 'noShow', title: 'عدم مراجعه', render: (row) => <StatusTag value={row.noShowCount > 0 ? 'pending' : undefined}>{faNumber.format(row.noShowCount)}</StatusTag> },
    { key: 'status', title: 'وضعیت حساب', render: (row) => <StatusTag value={row.deletedAt ? 'deleted' : row.active ? 'active' : 'inactive'} /> },
    { key: 'id', title: 'شناسه', render: (row) => <Typography.Text copyable={{ text: row.id }} code>{idLabel(row.id)}</Typography.Text> },
  ]} action={(row, run, busy) => <Space size={4} wrap>
    <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); setEditorOpen(true); }}>ویرایش</Button>
    <Button size="small" icon={<UnlockOutlined />} loading={busy === `customer-status-${row.id}`} onClick={() => {
      const next = !row.active;
      const restoring = Boolean(row.deletedAt);
      confirm(restoring ? 'بازیابی کاربر' : next ? 'رفع مسدودی کاربر' : 'مسدودسازی کاربر', `حساب «${personName(row.fullName, row.phone)}» ${restoring ? 'بازیابی' : next ? 'فعال' : 'مسدود'} شود؟`, () => void run(`customer-status-${row.id}`, () => platformAdminApi.setCustomerActive(row.id, restoring ? true : next).then(() => undefined)));
    }}>{row.deletedAt ? 'بازیابی' : row.active ? 'مسدودکردن' : 'رفع مسدودی'}</Button>
    {!row.deletedAt && <Button danger size="small" icon={<DeleteOutlined />} loading={busy === `customer-delete-${row.id}`} onClick={() => confirm('حذف کاربر', `حساب «${personName(row.fullName, row.phone)}» حذف نرم شود؟ سابقه مالی و نوبت‌ها باقی می‌ماند.`, () => void run(`customer-delete-${row.id}`, () => platformAdminApi.deleteCustomer(row.id).then(() => undefined)))}>حذف</Button>}
  </Space>} />
  <PlatformCustomerEditor row={editing} open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => setRefreshToken((value) => value + 1)} />
  </>;
}

export function PlatformStaffPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listStaff(options), []);
  const confirm = usePlatformConfirm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformStaffRow | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);
  return <>
  <ResourceListPage resource="staff" refreshToken={refreshToken} title="تیم سالن‌ها" subtitle="مدیریت اعضای تیم در سراسر tenantها؛ ویرایش نقش، کنترل ورود، حذف نرم و بازیابی." loader={loader} createAction={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setEditorOpen(true); }}>افزودن عضو تیم</Button>} statusOptions={[{ value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }, { value: 'deleted', label: 'حذف‌شده' }, { value: 'Owner', label: 'مالک' }, { value: 'Admin', label: 'ادمین' }, { value: 'Stylist', label: 'عضو تیم' }]} columns={[
    { key: 'staff', title: 'عضو تیم', render: (row: PlatformStaffRow) => <div className="platform-admin-table-name"><strong>{row.fullName}</strong><span dir="ltr">{row.phone ?? 'بدون ورود OTP'}</span></div> },
    { key: 'salon', title: 'سالن', render: (row) => row.salon.name },
    { key: 'role', title: 'نقش', render: (row) => <StatusTag value={row.role}>{label(row.role)}</StatusTag> },
    { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.deletedAt ? 'deleted' : row.active ? 'active' : 'inactive'} /> },
  ]} action={(row, run, busy) => <Space size={4} wrap>
    <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); setEditorOpen(true); }}>ویرایش</Button>
    <Button danger={row.active} type={row.active ? 'primary' : 'default'} size="small" loading={busy === `staff-status-${row.id}`} onClick={() => {
      const next = !row.active;
      confirm(next ? 'فعال‌سازی عضو تیم' : 'غیرفعال‌سازی عضو تیم', `ورود «${row.fullName}» ${next ? 'فعال' : 'غیرفعال'} شود؟`, () => void run(`staff-status-${row.id}`, () => platformAdminApi.setStaffActive(row.id, next).then(() => undefined)));
    }}>{row.active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</Button>
    {!row.deletedAt && <Button danger size="small" icon={<DeleteOutlined />} loading={busy === `staff-delete-${row.id}`} onClick={() => confirm('حذف عضو تیم', `«${row.fullName}» حذف نرم شود؟`, () => void run(`staff-delete-${row.id}`, () => platformAdminApi.deleteStaff(row.id).then(() => undefined)))}>حذف</Button>}
  </Space>} />
  <PlatformStaffEditor row={editing} open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => setRefreshToken((value) => value + 1)} />
  </>;
}

function PlatformServiceEditor({ row, open, onClose, onSaved }: { row?: PlatformServiceRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('30');
  const [price, setPrice] = useState('0');
  const [salonId, setSalonId] = useState('');
  const [salons, setSalons] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingSalons, setLoadingSalons] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? '');
    setDuration(row ? String(row.durationMin) : '30');
    setPrice(row ? String(row.priceRial) : '0');
    setSalonId(row?.salonId ?? '');
    setError('');
    if (!row) {
      setLoadingSalons(true);
      platformAdminApi.listSalons({ page: 1, limit: 100 }).then((result) => setSalons(result.data.map((salon) => ({ id: salon.id, name: salon.name })))).catch(() => setError('فهرست سالن‌ها دریافت نشد.')).finally(() => setLoadingSalons(false));
    }
  }, [open, row?.id, row?.name, row?.durationMin, row?.priceRial, row?.salonId]);
  const submit = async () => {
    const durationMinutes = Number(duration);
    const priceRial = Number(price);
    if (!name.trim() || !salonId) { setError('نام خدمت و سالن را وارد کنید.'); return; }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) { setError('مدت خدمت باید بین ۵ تا ۴۸۰ دقیقه باشد.'); return; }
    if (!Number.isInteger(priceRial) || priceRial < 0) { setError('قیمت معتبر نیست.'); return; }
    setSaving(true); setError('');
    try {
      if (row) await platformAdminApi.updateService(row.id, { name: name.trim(), durationMinutes, priceRial });
      else await platformAdminApi.createService({ salonId, name: name.trim(), durationMinutes, priceRial });
      onClose(); onSaved();
    } catch (cause) { setError(getApiErrorMessage(cause, 'ذخیره خدمت انجام نشد.')); } finally { setSaving(false); }
  };
  return <CrudModal open={open} title={row ? 'ویرایش خدمت' : 'ثبت خدمت جدید'} onCancel={onClose} onSubmit={() => void submit()} loading={saving} error={error} okText="ذخیره">
    {!row && <FormField label="سالن"><Select showSearch optionFilterProp="label" loading={loadingSalons} value={salonId || undefined} onChange={setSalonId} options={salons.map((salon) => ({ value: salon.id, label: salon.name }))} placeholder="انتخاب سالن" /></FormField>}
    <FormField label="نام خدمت"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} autoFocus /></FormField>
    <FormField label="مدت (دقیقه)"><Input dir="ltr" type="number" min={5} max={480} value={duration} onChange={(event) => setDuration(event.target.value)} /></FormField>
    <FormField label="قیمت (ریال)"><Input dir="ltr" type="number" min={0} value={price} onChange={(event) => setPrice(event.target.value)} /></FormField>
  </CrudModal>;
}

function PlatformSalonResourceEditor({ resource, row, open, onClose, onSaved }: { resource: 'chairs' | 'equipment'; row?: PlatformSalonResourceRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('physical');
  const [salonId, setSalonId] = useState('');
  const [salons, setSalons] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingSalons, setLoadingSalons] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const title = resource === 'chairs' ? 'صندلی' : 'تجهیزات';
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? ''); setKind(row?.kind ?? 'physical'); setSalonId(row?.salonId ?? ''); setError('');
    if (!row) {
      setLoadingSalons(true);
      platformAdminApi.listSalons({ page: 1, limit: 100 }).then((result) => setSalons(result.data.map((salon) => ({ id: salon.id, name: salon.name })))).catch(() => setError('فهرست سالن‌ها دریافت نشد.')).finally(() => setLoadingSalons(false));
    }
  }, [open, row?.id, row?.name, row?.kind, row?.salonId]);
  const submit = async () => {
    if (!name.trim() || !salonId) { setError('نام و سالن را وارد کنید.'); return; }
    setSaving(true); setError('');
    try {
      if (row) {
        if (resource === 'chairs') await platformAdminApi.updateChair(row.id, { name: name.trim() });
        else await platformAdminApi.updateEquipment(row.id, { name: name.trim() });
      } else if (resource === 'chairs') await platformAdminApi.createChair({ salonId, name: name.trim(), kind });
      else await platformAdminApi.createEquipment({ salonId, name: name.trim() });
      onClose(); onSaved();
    } catch (cause) { setError(getApiErrorMessage(cause, `ذخیره ${title} انجام نشد.`)); } finally { setSaving(false); }
  };
  return <CrudModal open={open} title={row ? `ویرایش ${title}` : `ثبت ${title} جدید`} onCancel={onClose} onSubmit={() => void submit()} loading={saving} error={error} okText="ذخیره">
    {!row && <FormField label="سالن"><Select showSearch optionFilterProp="label" loading={loadingSalons} value={salonId || undefined} onChange={setSalonId} options={salons.map((salon) => ({ value: salon.id, label: salon.name }))} placeholder="انتخاب سالن" /></FormField>}
    <FormField label={`نام ${title}`}><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus /></FormField>
    {resource === 'chairs' && !row && <FormField label="نوع"><Select value={kind} onChange={setKind} options={[{ value: 'physical', label: 'فیزیکی' }, { value: 'mobile', label: 'سیار' }]} /></FormField>}
  </CrudModal>;
}

export function PlatformServicesPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listServices(options), []);
  const confirm = usePlatformConfirm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformServiceRow | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);
  return <>
    <ResourceListPage resource="services" refreshToken={refreshToken} title="خدمات سالن‌ها" subtitle="مدیریت متمرکز کاتالوگ خدمات، مدت، قیمت و وضعیت انتشار در همه سالن‌ها." loader={loader} createAction={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setEditorOpen(true); }}>ثبت خدمت</Button>} statusOptions={[{ value: 'active', label: 'فعال' }, { value: 'deleted', label: 'حذف‌شده' }]} columns={[
      { key: 'service', title: 'خدمت', render: (row: PlatformServiceRow) => <div className="platform-admin-table-name"><strong>{row.name}</strong><span>{row.salon.name} · {faNumber.format(row.durationMin)} دقیقه</span></div> },
      { key: 'price', title: 'قیمت', render: (row) => `${formatToman(row.priceRial)} تومان` },
      { key: 'staff', title: 'ارائه‌دهنده', render: (row) => faNumber.format(row._count.serviceStaff) },
      { key: 'appointments', title: 'نوبت‌ها', render: (row) => faNumber.format(row._count.appointments) },
      { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.deletedAt ? 'deleted' : 'active'} /> },
    ]} action={(row, run, busy) => <Space size={4} wrap>
      <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); setEditorOpen(true); }}>ویرایش</Button>
      <Button size="small" loading={busy === `service-status-${row.id}`} onClick={() => void run(`service-status-${row.id}`, () => platformAdminApi.updateService(row.id, { active: Boolean(row.deletedAt) }).then(() => undefined))}>{row.deletedAt ? 'بازیابی' : 'غیرفعال‌سازی'}</Button>
      {!row.deletedAt && <Button danger size="small" icon={<DeleteOutlined />} loading={busy === `service-delete-${row.id}`} onClick={() => confirm('حذف خدمت', `«${row.name}» حذف نرم شود؟ سابقه نوبت‌ها باقی می‌ماند.`, () => void run(`service-delete-${row.id}`, () => platformAdminApi.deleteService(row.id).then(() => undefined)))}>حذف</Button>}
    </Space>} />
    <PlatformServiceEditor row={editing} open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => setRefreshToken((value) => value + 1)} />
  </>;
}

export function PlatformChairsPage() {
  return <PlatformSalonResourcePage resource="chairs" title="صندلی‌ها" subtitle="ظرفیت فیزیکی و سیار سالن‌ها را از مرکز مدیریت کنترل کنید." />;
}

export function PlatformEquipmentPage() {
  return <PlatformSalonResourcePage resource="equipment" title="تجهیزات" subtitle="تجهیزات ثبت‌شده سالن‌ها؛ حذف نرم، بازیابی و ویرایش نام بدون ازبین‌بردن تاریخچه." />;
}

function PlatformSalonResourcePage({ resource, title, subtitle }: { resource: 'chairs' | 'equipment'; title: string; subtitle: string }) {
  const loader = useCallback((options: PlatformListOptions) => resource === 'chairs' ? platformAdminApi.listChairs(options) : platformAdminApi.listEquipment(options), [resource]);
  const confirm = usePlatformConfirm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformSalonResourceRow | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);
  const update = (id: string, active: boolean) => resource === 'chairs' ? platformAdminApi.updateChair(id, { active }) : platformAdminApi.updateEquipment(id, { active });
  const remove = (id: string) => resource === 'chairs' ? platformAdminApi.deleteChair(id) : platformAdminApi.deleteEquipment(id);
  return <>
    <ResourceListPage resource={resource} refreshToken={refreshToken} title={title} subtitle={subtitle} loader={loader} createAction={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setEditorOpen(true); }}>ثبت {resource === 'chairs' ? 'صندلی' : 'تجهیزات'}</Button>} statusOptions={[{ value: 'active', label: 'فعال' }, { value: 'deleted', label: 'حذف‌شده' }]} columns={[
      { key: 'name', title: 'نام', render: (row: PlatformSalonResourceRow) => <div className="platform-admin-table-name"><strong>{row.name}</strong><span>{row.salon.name}</span></div> },
      ...(resource === 'chairs' ? [{ key: 'kind', title: 'نوع', render: (row: PlatformSalonResourceRow) => label(row.kind) }] : []),
      { key: 'status', title: 'وضعیت', render: (row: PlatformSalonResourceRow) => <StatusTag value={row.deletedAt ? 'deleted' : row.active ? 'active' : 'inactive'} /> },
    ]} action={(row, run, busy) => <Space size={4} wrap>
      <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); setEditorOpen(true); }}>ویرایش</Button>
      <Button size="small" loading={busy === `${resource}-status-${row.id}`} onClick={() => void run(`${resource}-status-${row.id}`, () => update(row.id, !row.active).then(() => undefined))}>{row.active ? 'غیرفعال‌سازی' : 'بازیابی'}</Button>
      {!row.deletedAt && <Button danger size="small" icon={<DeleteOutlined />} loading={busy === `${resource}-delete-${row.id}`} onClick={() => confirm(`حذف ${title}`, `«${row.name}» حذف نرم شود؟`, () => void run(`${resource}-delete-${row.id}`, () => remove(row.id).then(() => undefined)))}>حذف</Button>}
    </Space>} />
    <PlatformSalonResourceEditor resource={resource} row={editing} open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => setRefreshToken((value) => value + 1)} />
  </>;
}

export function PlatformAdminsPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listPlatformAdmins(options), []);
  const confirm = usePlatformConfirm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformAdminRow | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);
  return <>
    <ResourceListPage resource="platform-admins" refreshToken={refreshToken} title="مدیران پلتفرم" subtitle="مدیریت مدیران سراسری با جلوگیری از حذف خودکار آخرین مدیر فعال." loader={loader} createAction={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setEditorOpen(true); }}>افزودن مدیر</Button>} statusOptions={[{ value: 'active', label: 'فعال' }, { value: 'inactive', label: 'غیرفعال' }]} columns={[
      { key: 'admin', title: 'مدیر', render: (row: PlatformAdminRow) => <div className="platform-admin-table-name"><strong>{row.fullName}</strong><span dir="ltr">{row.phone}</span></div> },
      { key: 'role', title: 'نقش', render: (row) => <StatusTag value="Owner">{row.role}</StatusTag> },
      { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.active ? 'active' : 'inactive'} /> },
      { key: 'lastLogin', title: 'آخرین ورود', render: (row) => dateLabel(row.lastLoginAt, true) },
      { key: 'activity', title: 'فعالیت', render: (row) => `${faNumber.format(row._count.auditLogs)} تغییر · ${faNumber.format(row._count.assignedSupportTickets)} تیکت` },
    ]} action={(row, run, busy) => <Space size={4} wrap>
      <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); setEditorOpen(true); }}>ویرایش</Button>
      <Button size="small" loading={busy === `platform-admin-status-${row.id}`} onClick={() => {
        const next = !row.active;
        confirm(next ? 'فعال‌سازی مدیر' : 'غیرفعال‌سازی مدیر', `حساب «${row.fullName}» ${next ? 'فعال' : 'غیرفعال'} شود؟`, () => void run(`platform-admin-status-${row.id}`, () => platformAdminApi.updatePlatformAdmin(row.id, { active: next }).then(() => undefined)));
      }}>{row.active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</Button>
      {row.active && <Button danger size="small" icon={<DeleteOutlined />} loading={busy === `platform-admin-delete-${row.id}`} onClick={() => confirm('حذف مدیر', `حساب «${row.fullName}» حذف نرم شود؟`, () => void run(`platform-admin-delete-${row.id}`, () => platformAdminApi.deletePlatformAdmin(row.id).then(() => undefined)))}>حذف</Button>}
    </Space>} />
    <PlatformAdminEditor row={editing} open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => setRefreshToken((value) => value + 1)} />
  </>;
}

function PlatformAppointmentEditor({ row, open, onClose, onSaved }: { row?: PlatformAppointmentRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [salonId, setSalonId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [startAt, setStartAt] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [salons, setSalons] = useState<Array<{ id: string; name: string }>>([]);
  const [services, setServices] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setSalonId(row?.salon.id ?? ''); setServiceId(''); setStartAt(row ? new Date(row.startAt).toISOString().slice(0, 16) : '');
    setPhone(row?.customer.phone ?? ''); setFullName(row?.customer.fullName ?? ''); setCustomerNote(row?.customerNote ?? ''); setError('');
    if (!row) {
      setLoadingOptions(true);
      platformAdminApi.listSalons({ page: 1, limit: 100 }).then((result) => setSalons(result.data.map((salon) => ({ id: salon.id, name: salon.name })))).catch(() => setError('فهرست سالن‌ها دریافت نشد.')).finally(() => setLoadingOptions(false));
    }
  }, [open, row?.id, row?.salon.id, row?.startAt, row?.customer.phone, row?.customer.fullName, row?.customerNote]);
  useEffect(() => {
    if (!open || !salonId || row) return;
    platformAdminApi.listServices({ salonId, page: 1, limit: 100, status: 'active' }).then((result) => setServices(result.data.map((service) => ({ id: service.id, name: service.name })))).catch(() => setError('فهرست خدمات دریافت نشد.'));
  }, [open, salonId, row]);
  const submit = async () => {
    if (row) {
      setSaving(true); setError('');
      try { await platformAdminApi.updateAppointment(row.id, { customerNote: customerNote.trim() || null, locationType: row.locationType === 'customer' ? 'customer' : 'salon', locationAddress: row.locationAddress }); onClose(); onSaved(); }
      catch (cause) { setError(getApiErrorMessage(cause, 'ویرایش نوبت انجام نشد.')); }
      finally { setSaving(false); }
      return;
    }
    if (!salonId || !serviceId || !startAt || !phone.trim()) { setError('سالن، خدمت، زمان و موبایل الزامی است.'); return; }
    setSaving(true); setError('');
    try {
      await platformAdminApi.createAppointment({ salonId, serviceId, startAt: new Date(startAt).toISOString(), phone: phone.trim(), fullName: fullName.trim() || undefined, customerNote: customerNote.trim() || undefined });
      onClose(); onSaved();
    } catch (cause) { setError(getApiErrorMessage(cause, 'ثبت نوبت انجام نشد.')); } finally { setSaving(false); }
  };
  return <CrudModal open={open} title={row ? 'ویرایش نوبت' : 'ثبت نوبت حضوری'} onCancel={onClose} onSubmit={() => void submit()} loading={saving} error={error} okText="ذخیره">
    {!row && <FormField label="سالن"><Select showSearch optionFilterProp="label" loading={loadingOptions} value={salonId || undefined} onChange={(value) => { setSalonId(value); setServiceId(''); }} options={salons.map((salon) => ({ value: salon.id, label: salon.name }))} placeholder="انتخاب سالن" /></FormField>}
    {!row && <FormField label="خدمت"><Select showSearch optionFilterProp="label" loading={!salonId} disabled={!salonId} value={serviceId || undefined} onChange={setServiceId} options={services.map((service) => ({ value: service.id, label: service.name }))} placeholder="انتخاب خدمت" /></FormField>}
    <FormField label="زمان شروع"><Input dir="ltr" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} disabled={Boolean(row)} /></FormField>
    <FormField label="موبایل مشتری"><Input dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={20} disabled={Boolean(row)} /></FormField>
    <FormField label="نام مشتری"><Input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} disabled={Boolean(row)} /></FormField>
    <FormField label="یادداشت"><Input.TextArea value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} maxLength={1000} rows={3} /></FormField>
  </CrudModal>;
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
  const confirm = usePlatformConfirm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformAppointmentRow | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);
  return <>
  <ResourceListPage resource="appointments" refreshToken={refreshToken} title="نوبت‌ها" subtitle="ثبت نوبت حضوری، ویرایش یادداشت، چرخه تأیید و لغو امن با حفظ تاریخچه." loader={loader} createAction={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); setEditorOpen(true); }}>ثبت نوبت حضوری</Button>} statusOptions={['pending', 'held', 'confirmed', 'completed', 'cancelled', 'no_show'].map((value) => ({ value, label: label(value) }))} columns={[
    { key: 'time', title: 'زمان', render: (row: PlatformAppointmentRow) => <div className="platform-admin-table-name"><strong>{dateLabel(row.startAt, true)}</strong><span>تا {dateLabel(row.endAt, true)}</span></div> },
    { key: 'customer', title: 'مشتری', render: (row) => <div className="platform-admin-table-name"><strong>{personName(row.customer.fullName, row.customer.phone)}</strong><span dir="ltr">{row.customer.phone}</span></div> },
    { key: 'salon', title: 'سالن / خدمت', render: (row) => <div className="platform-admin-table-name"><strong>{row.salon.name}</strong><span>{row.service.name} · {formatToman(row.service.priceRial)} تومان</span></div> },
    { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.status} /> },
    { key: 'source', title: 'منبع', render: (row) => <StatusTag value={row.source} /> },
  ]} action={(row, run, busy) => <Space size={4} wrap>
    <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); setEditorOpen(true); }}>ویرایش</Button>
    <AppointmentActions row={row} run={run} busyKey={busy} />
    {['pending', 'held', 'confirmed'].includes(row.status) && <Button danger size="small" icon={<DeleteOutlined />} loading={busy === `delete-${row.id}`} onClick={() => confirm('لغو نوبت', `نوبت «${personName(row.customer.fullName, row.customer.phone)}» لغو شود؟`, () => void run(`delete-${row.id}`, () => platformAdminApi.deleteAppointment(row.id).then(() => undefined)))}>لغو</Button>}
  </Space>} />
  <PlatformAppointmentEditor row={editing} open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => setRefreshToken((value) => value + 1)} />
  </>;
}

function PlatformSubscriptionEditor({ row, open, onClose, onSaved }: { row?: PlatformSubscriptionRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState('trial');
  const [planKind, setPlanKind] = useState('trial');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setStatus(row?.status ?? 'trial'); setPlanKind(row?.planKind ?? 'trial');
    setExpiresAt(row ? new Date(row.expiresAt).toISOString().slice(0, 16) : ''); setError('');
  }, [open, row?.id, row?.status, row?.planKind, row?.expiresAt]);
  const submit = async () => {
    if (!row || !expiresAt) { setError('تاریخ انقضا را وارد کنید.'); return; }
    setSaving(true); setError('');
    try { await platformAdminApi.updateSubscription(row.id, { status, planKind, expiresAt: new Date(expiresAt).toISOString() }); onClose(); onSaved(); }
    catch (cause) { setError(getApiErrorMessage(cause, 'ویرایش اشتراک انجام نشد.')); }
    finally { setSaving(false); }
  };
  return <CrudModal open={open} title="ویرایش اشتراک" onCancel={onClose} onSubmit={() => void submit()} loading={saving} error={error} okText="ذخیره">
    <div className="platform-admin-form-note">سالن: <strong>{row?.salon.name ?? '—'}</strong></div>
    <FormField label="وضعیت"><Select value={status} onChange={setStatus} options={['trial', 'active', 'grace', 'expired'].map((value) => ({ value, label: label(value) }))} /></FormField>
    <FormField label="پلن"><Select value={planKind} onChange={setPlanKind} options={['trial', 'monthly', 'quarterly', 'annual'].map((value) => ({ value, label: label(value) }))} /></FormField>
    <FormField label="تاریخ انقضا"><Input dir="ltr" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></FormField>
  </CrudModal>;
}

export function PlatformSubscriptionsPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listSubscriptions(options), []);
  const confirm = usePlatformConfirm();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformSubscriptionRow | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);
  return <>
  <ResourceListPage resource="subscriptions" refreshToken={refreshToken} title="اشتراک‌ها" subtitle="ویرایش lifecycle و انقضا از اینجا؛ پرداخت‌های ثبت‌شده و تاریخچه مالی حذف نمی‌شوند." loader={loader} statusOptions={['trial', 'active', 'grace', 'expired'].map((value) => ({ value, label: label(value) }))} columns={[
    { key: 'salon', title: 'سالن', render: (row: PlatformSubscriptionRow) => row.salon.name },
    { key: 'plan', title: 'پلن', render: (row) => label(row.planKind) },
    { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.status} /> },
    { key: 'expires', title: 'انقضا', render: (row) => dateLabel(row.expiresAt) },
    { key: 'grace', title: 'مهلت', render: (row) => dateLabel(row.graceUntil) },
    { key: 'salonStatus', title: 'وضعیت سالن', render: (row) => <StatusTag value={row.salon.active ? 'active' : 'suspended'} /> },
  ]} action={(row, run, busy) => <Space size={4} wrap>
    <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); setEditorOpen(true); }}>ویرایش</Button>
    {row.status !== 'expired' && <Button danger size="small" icon={<DeleteOutlined />} loading={busy === `subscription-delete-${row.id}`} onClick={() => confirm('پایان اشتراک', `اشتراک «${row.salon.name}» فوراً منقضی شود؟ سابقه پرداخت حفظ می‌شود.`, () => void run(`subscription-delete-${row.id}`, () => platformAdminApi.deleteSubscription(row.id).then(() => undefined)))}>پایان اشتراک</Button>}
  </Space>} />
  <PlatformSubscriptionEditor row={editing} open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => setRefreshToken((value) => value + 1)} />
  </>;
}

export function PlatformPaymentsPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listPayments(options), []);
  const confirm = usePlatformConfirm();
  return <ResourceListPage resource="payments" title="پرداخت‌ها" subtitle="دفتر مالی یکپارچه؛ وضعیت قابل اصلاح برای reconciliation است، حذف رکورد مالی عمداً ممنوع است." loader={loader} statusOptions={['pending', 'paid', 'refunded', 'retained', 'failed'].map((value) => ({ value, label: label(value) }))} columns={[
    { key: 'kind', title: 'نوع', render: (row: PlatformPaymentRow) => <StatusTag value="web">{row.kind === 'appointment' ? 'رزرو' : 'اشتراک'}</StatusTag> },
    { key: 'salon', title: 'سالن', render: (row) => row.salon.name },
    { key: 'subject', title: 'شرح', render: (row) => <div className="platform-admin-table-name"><strong>{label(row.subject)}</strong><span>{row.customer ? personName(row.customer.fullName, row.customer.phone) : '—'}</span></div> },
    { key: 'amount', title: 'مبلغ', render: (row) => `${formatToman(row.amountRial)} تومان` },
    { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.status} /> },
    { key: 'date', title: 'تاریخ', render: (row) => dateLabel(row.createdAt, true) },
  ]} action={(row, run, busy) => <Select size="small" value={row.status} loading={busy === `payment-${row.id}`} options={['pending', 'paid', 'refunded', 'retained', 'failed'].map((value) => ({ value, label: label(value) }))} aria-label={`وضعیت پرداخت ${row.id}`} onChange={(value) => {
    const save = () => void run(`payment-${row.id}`, () => platformAdminApi.updatePayment(row.id, row.kind, value).then(() => undefined));
    if (value === 'refunded' || value === 'paid') confirm('اصلاح وضعیت پرداخت', `وضعیت پرداخت به «${label(value)}» تغییر کند؟`, save, false);
    else save();
  }} />}/>
}

export function PlatformWaitlistPage() {
  const loader = useCallback((options: PlatformListOptions) => platformAdminApi.listWaitlist(options), []);
  const confirm = usePlatformConfirm();
  return <ResourceListPage resource="waitlist" title="صف انتظار" subtitle="تقاضاهای بدون slot آزاد؛ وضعیت و لغو هر ورودی از همین فهرست قابل مدیریت است." loader={loader} statusOptions={['waiting', 'notified', 'fulfilled', 'cancelled'].map((value) => ({ value, label: label(value) }))} columns={[
    { key: 'customer', title: 'مشتری', render: (row: PlatformWaitlistRow) => <div className="platform-admin-table-name"><strong>{personName(row.customer.fullName, row.customer.phone)}</strong><span dir="ltr">{row.customer.phone}</span></div> },
    { key: 'salon', title: 'سالن / خدمت', render: (row) => <div className="platform-admin-table-name"><strong>{row.salon.name}</strong><span>{row.service.name}</span></div> },
    { key: 'window', title: 'بازه مطلوب', render: (row) => `${dateLabel(row.windowStart, true)} – ${dateLabel(row.windowEnd, true)}` },
    { key: 'status', title: 'وضعیت', render: (row) => <StatusTag value={row.status} /> },
    { key: 'created', title: 'ثبت', render: (row) => dateLabel(row.createdAt, true) },
  ]} action={(row, run, busy) => <Space size={4} wrap>
    <Select size="small" value={row.status} loading={busy === `waitlist-${row.id}`} options={['waiting', 'notified', 'fulfilled', 'cancelled'].map((value) => ({ value, label: label(value) }))} aria-label={`وضعیت صف انتظار ${row.id}`} onChange={(value) => void run(`waitlist-${row.id}`, () => platformAdminApi.updateWaitlist(row.id, { status: value }).then(() => undefined))} />
    {row.status !== 'cancelled' && <Button danger size="small" icon={<DeleteOutlined />} loading={busy === `waitlist-delete-${row.id}`} onClick={() => confirm('لغو صف انتظار', 'این درخواست از صف خارج شود؟', () => void run(`waitlist-delete-${row.id}`, () => platformAdminApi.deleteWaitlist(row.id).then(() => undefined)))}>لغو</Button>}
  </Space>} />;
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

const CARD_ORDER_STATUS_OPTIONS = [
  'received',
  'contacted',
  'in_print',
  'shipped',
  'completed',
  'cancelled',
].map((value) => ({ value, label: label(value) }));

function printSpecsLabel(specs: Record<string, unknown> | null): string {
  if (!specs) return '—';
  const labels: Record<string, string> = {
    paper: 'جنس',
    finish: 'روکش',
    doubleSided: 'دوطرفه',
  };
  const entries = Object.entries(specs).filter(
    ([, value]) => value !== undefined && value !== null && value !== '' && typeof value !== 'object',
  );
  return entries.length
    ? entries.map(([key, value]) => `${labels[key] ?? key}: ${String(value)}`).join(' · ')
    : '—';
}

function deliveryLocationLabel(specs: Record<string, unknown> | null): string | null {
  const location = specs?.deliveryLocation;
  if (!location || typeof location !== 'object' || Array.isArray(location)) return null;
  const record = location as Record<string, unknown>;
  const province = typeof record.province === 'string' ? record.province : '';
  const city = typeof record.city === 'string' ? record.city : '';
  return [province, city].filter(Boolean).join('، ') || null;
}

function deliveryPostalCode(specs: Record<string, unknown> | null): string | null {
  const location = specs?.deliveryLocation;
  if (!location || typeof location !== 'object' || Array.isArray(location)) return null;
  const postalCode = (location as Record<string, unknown>).postalCode;
  return typeof postalCode === 'string' && postalCode ? postalCode : null;
}

export function PlatformCardOrdersPage() {
  const [rows, setRows] = useState<PlatformCardOrderRow[]>([]);
  const [resultSummary, setResultSummary] = useState<{ orderCount: number; pieceCount: number } | undefined>();
  const [pageInfo, setPageInfo] = useState({ page: 1, limit: 20, total: 0, pageCount: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await platformAdminApi.listCardOrders({
        page,
        limit: 20,
        status: statusFilter || undefined,
      });
      setRows(result.orders);
      setResultSummary(result.summary);
      setPageInfo(result.page);
    } catch {
      setError('دریافت سفارش‌های کارت انجام نشد.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (row: PlatformCardOrderRow, status: string) => {
    setBusyId(row.id);
    setError('');
    try {
      await platformAdminApi.updateCardOrder(row.id, status);
      await load();
    } catch {
      setError('تغییر وضعیت سفارش انجام نشد.');
    } finally {
      setBusyId(null);
    }
  };

  const totalPieces = rows.reduce((sum, row) => sum + row.quantity, 0);
  const columns: ColumnsType<PlatformCardOrderRow> = [
    {
      title: 'سفارش',
      key: 'order',
      render: (_value, row) => (
        <div className="platform-admin-table-name">
          <strong><Typography.Text copyable={{ text: row.orderNumber }}>{row.orderNumber}</Typography.Text></strong>
          <span>{dateLabel(row.createdAt, true)}</span>
        </div>
      ),
    },
    {
      title: 'سالن',
      key: 'salon',
      render: (_value, row) => <div className="platform-admin-table-name"><strong>{row.salon.name}</strong><span>{label(row.template)}</span></div>,
    },
    {
      title: 'تولید',
      key: 'production',
      render: (_value, row) => <div className="platform-admin-table-name"><strong><Typography.Text>{faNumber.format(row.quantity)} عدد</Typography.Text></strong><span>{printSpecsLabel(row.printSpecs)}</span></div>,
    },
    {
      title: 'تحویل',
      key: 'contact',
      render: (_value, row) => {
        const location = deliveryLocationLabel(row.printSpecs);
        const postalCode = deliveryPostalCode(row.printSpecs);
        return (
          <div className="platform-admin-table-name">
            <strong>{row.contactName}</strong>
            <span dir="ltr">{row.phone}</span>
            {location && <span>{location}</span>}
            <span>{row.address}</span>
            {postalCode && <span dir="ltr">کد پستی: {postalCode}</span>}
          </div>
        );
      },
    },
    {
      title: 'یادداشت',
      key: 'notes',
      render: (_value, row) => <Typography.Text ellipsis={{ tooltip: row.notes ?? undefined }}>{row.notes || '—'}</Typography.Text>,
    },
    {
      title: 'وضعیت',
      key: 'status',
      render: (_value, row) => <Select value={row.status} loading={busyId === row.id} options={CARD_ORDER_STATUS_OPTIONS} onChange={(value) => void updateStatus(row, value)} style={{ minWidth: 150 }} aria-label={`وضعیت سفارش ${row.orderNumber}`} />,
    },
  ];

  return (
    <div className="platform-admin-page">
      <PageHeader title="سفارش کارت چاپی" subtitle="اطلاعات تماس، تعداد و مشخصات تولید در یک گزارش قابل چاپ؛ پیگیری ادامه کار از طریق inbox سالن انجام می‌شود." onRefresh={() => void load()} loading={loading} />
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button icon={<PrinterOutlined />} onClick={() => window.print()}>چاپ گزارش</Button>
      </div>
      <Card className="platform-admin-filter-card">
        <div className="platform-admin-filter-row">
          <Select allowClear value={statusFilter || undefined} onChange={(value) => { setStatusFilter(value ?? ''); setPage(1); }} placeholder="همه وضعیت‌ها" options={CARD_ORDER_STATUS_OPTIONS} style={{ minWidth: 220 }} aria-label="فیلتر وضعیت سفارش کارت" />
        </div>
      </Card>
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Typography.Text type="secondary">تعداد سفارش‌های فیلترشده</Typography.Text><div className="text-xl font-bold">{faNumber.format(pageInfo.total)}</div></div>
          <div><Typography.Text type="secondary">تعداد کارت برای گزارش چاپ</Typography.Text><div className="text-xl font-bold">{faNumber.format(resultSummary?.pieceCount ?? totalPieces)}</div></div>
        </div>
      </Card>
      {error && <Alert className="mb-4" type="error" showIcon message={error} />}
      <Table<PlatformCardOrderRow>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1200 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="سفارشی برای نمایش وجود ندارد." /> }}
        pagination={{ current: pageInfo.page, pageSize: pageInfo.limit, total: pageInfo.total, showSizeChanger: false, onChange: setPage, showTotal: (total) => `${faNumber.format(total)} سفارش` }}
      />
    </div>
  );
}

const SUPPORT_STATUS_OPTIONS = ['open', 'triaged', 'in_progress', 'resolved', 'closed'].map((value) => ({ value, label: label(value) }));
const SUPPORT_PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'].map((value) => ({ value, label: label(value) }));

function SupportTicketActions({ row, onSaved }: { row: PlatformSupportTicketRow; onSaved: () => void }) {
  const { principal } = useAuth();
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState<PlatformSupportTicketRow | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [status, setStatus] = useState(row.status);
  const [priority, setPriority] = useState(row.priority);
  const [resolution, setResolution] = useState(row.resolution ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (assignedAdminId?: string | null) => {
    setSaving(true);
    setError('');
    try {
      await platformAdminApi.updateSupportTicket(row.id, {
        status,
        priority,
        resolution,
        ...(assignedAdminId !== undefined ? { assignedAdminId } : {}),
      });
      setOpen(false);
      onSaved();
    } catch {
      setError('تغییر تیکت انجام نشد.');
    } finally {
      setSaving(false);
    }
  };

  const openDetails = async () => {
    setDetailsOpen(true);
    setDetails(null);
    setDetailsError('');
    setDetailsLoading(true);
    try {
      const result = await platformAdminApi.getSupportTicket(row.id);
      setDetails(result.ticket);
    } catch {
      setDetailsError('دریافت جزئیات تیکت انجام نشد.');
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <>
      <Space size={4} wrap>
        <Button size="small" icon={<EyeOutlined />} onClick={() => void openDetails()}>جزئیات</Button>
        {principal?.platformAdminId && <Button size="small" disabled={saving} onClick={() => void save(principal.platformAdminId)}>واگذاری به من</Button>}
        <Button size="small" onClick={() => { setStatus(row.status); setPriority(row.priority); setResolution(row.resolution ?? ''); setOpen(true); }}>ویرایش</Button>
      </Space>
      <Modal open={detailsOpen} title={`جزئیات ${row.ticketNumber}`} onCancel={() => !detailsLoading && setDetailsOpen(false)} footer={null} destroyOnHidden>
        {detailsLoading ? <Skeleton active /> : detailsError ? <Alert type="error" showIcon message={detailsError} /> : details && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid gap-2 rounded-lg bg-surface p-3 sm:grid-cols-2">
              <span>مسیر: {details.page || '—'}</span>
              <span>اقدام: {details.action || '—'}</span>
              <span>کد خطا: {details.errorCode || '—'}</span>
              <span>شناسه درخواست: {details.requestId || '—'}</span>
              <span>مرورگر: {details.browser || '—'}</span>
              <span>دستگاه: {details.device || '—'}</span>
            </div>
            <div className="rounded-lg border border-border p-3 whitespace-pre-wrap leading-7">{details.message}</div>
            {details.screenshot?.dataBase64 ? (
              <img
                src={`data:${details.screenshot.mime};base64,${details.screenshot.dataBase64}`}
                alt={`تصویر پیوست ${details.screenshot.name}`}
                className="max-h-[28rem] w-full rounded-lg border border-border object-contain"
              />
            ) : details.screenshot ? (
              <p className="m-0 text-muted">فایل پیوست: {details.screenshot.name}</p>
            ) : null}
            {details.resolution && <div className="rounded-lg bg-surface p-3 leading-7"><strong>نتیجه بررسی:</strong> {details.resolution}</div>}
          </div>
        )}
      </Modal>
      <Modal open={open} title={`پیگیری ${row.ticketNumber}`} onCancel={() => !saving && setOpen(false)} onOk={() => void save()} okText="ذخیره" cancelText="انصراف" confirmLoading={saving} destroyOnHidden>
        <div className="flex flex-col gap-3">
          <div className="rounded-lg bg-surface p-3 text-sm"><strong>گزارش:</strong> {row.message}</div>
          <Select value={status} options={SUPPORT_STATUS_OPTIONS} onChange={setStatus} aria-label="وضعیت تیکت" />
          <Select value={priority} options={SUPPORT_PRIORITY_OPTIONS} onChange={setPriority} aria-label="اولویت تیکت" />
          <Input.TextArea value={resolution} onChange={(event) => setResolution(event.target.value)} maxLength={2000} rows={4} placeholder="نتیجه بررسی یا راه‌حل…" aria-label="نتیجه بررسی" />
          {error && <Alert type="error" showIcon message={error} />}
        </div>
      </Modal>
    </>
  );
}

export function PlatformSupportPage() {
  const [rows, setRows] = useState<PlatformSupportTicketRow[]>([]);
  const [pageInfo, setPageInfo] = useState({ page: 1, limit: 20, total: 0, pageCount: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await platformAdminApi.listSupportTickets({ page, limit: 20, status: statusFilter || undefined });
      setRows(result.tickets);
      setPageInfo(result.page);
    } catch {
      setError('دریافت گزارش‌های پشتیبانی انجام نشد.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<PlatformSupportTicketRow> = [
    {
      title: 'تیکت',
      key: 'ticket',
      render: (_value, row) => <div className="platform-admin-table-name"><strong><Typography.Text copyable={{ text: row.ticketNumber }}>{row.ticketNumber}</Typography.Text></strong><span>{dateLabel(row.createdAt, true)}</span></div>,
    },
    {
      title: 'گزارش‌دهنده',
      key: 'reporter',
      render: (_value, row) => <div className="platform-admin-table-name"><strong>{personName(row.reporter?.fullName ?? row.reporterStaff?.fullName, row.reporter?.phone ?? row.reporterStaff?.phone)}</strong><span>{row.salon?.name ?? 'بدون سالن'} · {label(row.reporterRole)}</span></div>,
    },
    {
      title: 'شرح',
      key: 'message',
      render: (_value, row) => <Typography.Paragraph ellipsis={{ rows: 2, tooltip: row.message }} className="!mb-0 !max-w-[22rem]">{row.message}</Typography.Paragraph>,
    },
    {
      title: 'زمینه خطا',
      key: 'context',
      render: (_value, row) => <div className="platform-admin-table-name"><span>{row.page || '—'}{row.action ? ` · ${row.action}` : ''}</span><Typography.Text code>{row.errorCode || row.requestId || 'بدون کد'}</Typography.Text><span>{row.browser || '—'} · {row.device || '—'}</span></div>,
    },
    {
      title: 'وضعیت',
      key: 'state',
      render: (_value, row) => <Space size={4}><StatusTag value={row.status} /><StatusTag value={row.priority} /></Space>,
    },
    {
      title: 'اقدام',
      key: 'actions',
      render: (_value, row) => <SupportTicketActions row={row} onSaved={() => void load()} />,
    },
  ];

  return (
    <div className="platform-admin-page">
      <PageHeader title="پشتیبانی و گزارش خطا" subtitle="هر گزارش با شناسه، کاربر، مسیر، اقدام، request ID و context دستگاه قابل پیگیری و resolve است." onRefresh={() => void load()} loading={loading} />
      <Card className="platform-admin-filter-card">
        <div className="platform-admin-filter-row">
          <Select allowClear value={statusFilter || undefined} onChange={(value) => { setStatusFilter(value ?? ''); setPage(1); }} placeholder="همه وضعیت‌ها" options={SUPPORT_STATUS_OPTIONS} style={{ minWidth: 220 }} aria-label="فیلتر وضعیت تیکت" />
        </div>
      </Card>
      {error && <Alert className="mb-4" type="error" showIcon message={error} />}
      <Table<PlatformSupportTicketRow>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1300 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="گزارشی برای نمایش وجود ندارد." /> }}
        pagination={{ current: pageInfo.page, pageSize: pageInfo.limit, total: pageInfo.total, showSizeChanger: false, onChange: setPage, showTotal: (total) => `${faNumber.format(total)} گزارش` }}
      />
    </div>
  );
}
