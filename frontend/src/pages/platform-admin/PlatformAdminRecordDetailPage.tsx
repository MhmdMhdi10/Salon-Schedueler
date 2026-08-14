import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Collapse, Descriptions, Empty, Skeleton, Space, Tag, Typography } from 'antd';
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  EyeOutlined,
  LinkOutlined,
  ReloadOutlined,
  SettingOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { platformAdminApi } from '../../api/client';
import { formatRial } from '../../components/ui/Money';
import { platformDetailSnapshotKey } from './PlatformAdminPages';
import './platform-admin.css';

type DetailRecord = Record<string, unknown> & { id?: string };
type Entry = [string, unknown];

const RESOURCE_LABEL: Record<string, string> = {
  salons: 'سالن‌ها', customers: 'مشتری‌ها', staff: 'پرسنل', appointments: 'نوبت‌ها', subscriptions: 'اشتراک‌ها',
  payments: 'پرداخت‌ها', waitlist: 'صف انتظار', 'qr-scans': 'اسکن‌های QR', 'audit-logs': 'گزارش تغییرات',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'فعال', trial: 'آزمایشی', grace: 'مهلت تمدید', expired: 'منقضی', suspended: 'تعلیق‌شده', inactive: 'غیرفعال',
  pending: 'در انتظار', held: 'موقت', confirmed: 'تأییدشده', completed: 'انجام‌شده', cancelled: 'لغوشده', no_show: 'عدم مراجعه',
  paid: 'پرداخت‌شده', refunded: 'مستردشده', retained: 'نگه‌داشته‌شده', failed: 'ناموفق', waiting: 'در صف', notified: 'اطلاع داده‌شده', fulfilled: 'تکمیل‌شده',
  Owner: 'مالک', Admin: 'ادمین', Stylist: 'آرایشگر',
};

const faNumber = new Intl.NumberFormat('fa-IR');
const dateTimeFormatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    id: 'شناسه', name: 'نام', fullName: 'نام کامل', phone: 'تلفن', qrToken: 'توکن QR', timezone: 'منطقه زمانی', active: 'فعال',
    status: 'وضعیت', role: 'نقش', source: 'منبع', createdAt: 'تاریخ ایجاد', updatedAt: 'آخرین تغییر', lastLoginAt: 'آخرین ورود',
    startAt: 'شروع', endAt: 'پایان', windowStart: 'شروع بازه', windowEnd: 'پایان بازه', startedAt: 'شروع اشتراک', expiresAt: 'انقضا', graceUntil: 'مهلت تمدید',
    amountRial: 'مبلغ (ریال)', priceRial: 'قیمت (ریال)', depositRial: 'ودیعه (ریال)', gateway: 'درگاه', refId: 'شناسه مرجع',
    planKind: 'نوع پلن', autoApprove: 'تأیید خودکار', bookingWindowDays: 'افق رزرو (روز)', brandAccent: 'رنگ برند', noShowCount: 'عدم مراجعه',
    durationMin: 'مدت (دقیقه)', bufferMin: 'فاصله (دقیقه)', requiresDeposit: 'نیازمند ودیعه', entityType: 'نوع رکورد', entityId: 'شناسه رکورد',
    action: 'عملیات', metadata: 'جزئیات ساختاری', salon: 'سالن', customer: 'مشتری', staffMember: 'پرسنل', service: 'خدمت', payments: 'پرداخت‌ها',
    appointments: 'نوبت‌ها', waitlistEntries: 'صف انتظار', customerNotes: 'یادداشت‌ها', preferredStaff: 'پرسنل منتخب', subscription: 'اشتراک', admin: 'مدیر',
  };
  return labels[field] ?? field.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
}

function statusColor(value: string): string {
  if (['active', 'paid', 'confirmed', 'completed', 'fulfilled'].includes(value)) return 'green';
  if (['pending', 'trial', 'grace', 'held', 'waiting', 'notified'].includes(value)) return 'gold';
  if (['expired', 'suspended', 'inactive', 'cancelled', 'no_show', 'failed'].includes(value)) return 'red';
  return 'default';
}

function recordTitle(record: DetailRecord | null): string {
  if (!record) return 'جزئیات رکورد';
  for (const key of ['name', 'fullName', 'subject', 'action', 'phone', 'source']) {
    if (typeof record[key] === 'string' && record[key]) return String(record[key]);
  }
  return record.id ? `رکورد ${record.id.slice(0, 8)}` : 'جزئیات رکورد';
}

function isDateField(field: string): boolean {
  return /(At|Date|Until|Start|End)$/.test(field);
}

function isStatusField(field: string): boolean {
  return field === 'status' || field === 'role' || field === 'action' || field.endsWith('Status');
}

function isIdField(field: string): boolean {
  return field === 'id' || field.endsWith('Id');
}

function valueTitle(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as DetailRecord;
  return record.name ? String(record.name) : record.fullName ? String(record.fullName) : record.phone ? String(record.phone) : record.id ? String(record.id) : '';
}

function ScalarValue({ field, value }: { field: string; value: unknown }): ReactNode {
  if (value === null || value === undefined || value === '') return <Typography.Text type="secondary">—</Typography.Text>;
  if (typeof value === 'boolean') return <Tag color={value ? 'green' : 'default'}>{value ? 'بله' : 'خیر'}</Tag>;
  if (isStatusField(field) && typeof value === 'string') return <Tag color={statusColor(value)}>{STATUS_LABEL[value] ?? value}</Tag>;
  if (isDateField(field) && typeof value === 'string') {
    const date = new Date(value);
    return <time dateTime={value}>{Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)}</time>;
  }
  if (typeof value === 'number') return <span>{faNumber.format(value)}</span>;
  if (typeof value === 'string' && /Rial$/i.test(field)) return <span>{formatRial(value)} ریال</span>;
  if (typeof value === 'string' && isIdField(field)) return <Typography.Text code copyable={{ text: value }} dir="ltr">{value}</Typography.Text>;
  return <Typography.Text className="platform-admin-detail-scalar">{String(value)}</Typography.Text>;
}

function CompactRecord({ record }: { record: DetailRecord }) {
  const entries = Object.entries(record).filter(([field, value]) => field !== 'id' && value !== null && typeof value !== 'object').slice(0, 6);
  return <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>{entries.map(([field, value]) => <Descriptions.Item key={field} label={fieldLabel(field)}><ScalarValue field={field} value={value} /></Descriptions.Item>)}</Descriptions>;
}

function RelatedSection({ field, value }: { field: string; value: unknown }) {
  const records = Array.isArray(value) ? value : [value];
  const items = records.filter((item) => item !== null && item !== undefined).map((item, index) => {
    const itemRecord = item && typeof item === 'object' && !Array.isArray(item) ? item as DetailRecord : null;
    return {
      key: `${field}-${index}`,
      label: <span><LinkOutlined /> {itemRecord ? valueTitle(itemRecord) || `${fieldLabel(field)} ${index + 1}` : `${fieldLabel(field)} ${index + 1}`}</span>,
      children: itemRecord ? <CompactRecord record={itemRecord} /> : <ScalarValue field={field} value={item} />,
    };
  });
  return <Collapse bordered={false} items={items.length ? items : [{ key: 'empty', label: fieldLabel(field), children: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="اطلاعاتی ثبت نشده است." /> }]} />;
}

function DetailSection({ title, hint, icon, entries }: { title: string; hint: string; icon: ReactNode; entries: Entry[] }) {
  if (!entries.length) return null;
  return (
    <section className="platform-admin-detail-section">
      <header className="platform-admin-detail-section__header"><span className="platform-admin-detail-section__icon">{icon}</span><span className="platform-admin-detail-section__heading"><strong>{title}</strong><small>{hint}</small></span><Tag>{faNumber.format(entries.length)} فیلد</Tag></header>
      <div className="platform-admin-detail-section__fields">
        {entries.map(([field, value]) => <dl key={field} className={`platform-admin-detail-field${typeof value === 'string' && value.length > 90 ? ' platform-admin-detail-field--wide' : ''}`}><dt>{fieldLabel(field)}</dt><dd><ScalarValue field={field} value={value} /></dd></dl>)}
      </div>
    </section>
  );
}

function detailGroups(record: DetailRecord) {
  const entries = Object.entries(record).filter(([field]) => field !== 'id' && !field.startsWith('_'));
  const complex = entries.filter(([, value]) => value !== null && typeof value === 'object');
  const scalar = entries.filter(([, value]) => value === null || typeof value !== 'object');
  const stateKeys = new Set(['status', 'role', 'active', 'autoApprove', 'isActive', 'isBanned', 'noShowCount', 'action']);
  const timelineKeys = new Set(['createdAt', 'updatedAt', 'lastLoginAt', 'startAt', 'endAt', 'windowStart', 'windowEnd', 'startedAt', 'expiresAt', 'graceUntil']);
  const commerceKeys = new Set(['amountRial', 'priceRial', 'depositRial', 'gateway', 'refId', 'planKind']);
  return {
    main: scalar.filter(([field]) => !stateKeys.has(field) && !timelineKeys.has(field) && !commerceKeys.has(field)),
    state: scalar.filter(([field]) => stateKeys.has(field)),
    commerce: scalar.filter(([field]) => commerceKeys.has(field)),
    timeline: scalar.filter(([field]) => timelineKeys.has(field)),
    complex,
  };
}

export function PlatformAdminRecordDetailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const resource = params.get('resource') ?? '';
  const id = params.get('id') ?? '';
  const storageKey = platformDetailSnapshotKey(resource, id);
  const [record, setRecord] = useState<DetailRecord | null>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) as DetailRecord : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [remoteFailed, setRemoteFailed] = useState(false);

  const load = useCallback(async () => {
    if (!resource || !id) return;
    setLoading(true);
    setRemoteFailed(false);
    try {
      const response = await platformAdminApi.getDetail(resource, id);
      setRecord(response.record);
      sessionStorage.setItem(storageKey, JSON.stringify(response.record));
    } catch {
      setRemoteFailed(true);
    } finally { setLoading(false); }
  }, [id, resource, storageKey]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => (record ? detailGroups(record) : null), [record]);
  const glance = record ? Object.entries(record).filter(([field, value]) => field !== 'id' && value !== null && typeof value !== 'object').slice(0, 7) : [];
  const backPath = sessionStorage.getItem(`${storageKey}:back`);
  const goBack = () => backPath?.startsWith('/platform-admin') ? navigate(backPath) : navigate(-1);

  if (!record && loading) return <div className="platform-admin-detail-page"><Card><Skeleton active paragraph={{ rows: 12 }} /></Card></div>;
  if (!record) return <div className="platform-admin-detail-page"><Card><Empty description="رکورد پیدا نشد." /></Card></div>;

  return (
    <div className="platform-admin-detail-page">
      <header className="platform-admin-detail-hero">
        <div className="platform-admin-detail-hero__main"><span className="platform-admin-detail-hero__mark"><DatabaseOutlined /></span><div className="platform-admin-detail-hero__copy"><div className="platform-admin-detail-hero__eyebrow"><span>پرونده رکورد</span><span className="platform-admin-detail-hero__resource"><strong>منبع:</strong><strong>{RESOURCE_LABEL[resource] ?? resource}</strong></span></div><h1>{recordTitle(record)}</h1>{typeof record.status === 'string' && <Tag color={statusColor(record.status)}>{STATUS_LABEL[record.status] ?? record.status}</Tag>}</div></div>
        <Space className="platform-admin-detail-hero__actions" wrap><Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>بازخوانی</Button><Button icon={<ArrowRightOutlined />} onClick={goBack}>بازگشت</Button></Space>
      </header>
      {remoteFailed && <Alert className="mb-4" type="warning" showIcon message="نمایش snapshot ذخیره‌شده؛ دریافت نسخه‌ی تازه ممکن نشد." />}
      <div className="platform-admin-detail-layout">
        <div className="platform-admin-detail-main">
          <DetailSection title="اطلاعات اصلی" hint="مشخصات پایه این رکورد" icon={<DatabaseOutlined />} entries={groups?.main ?? []} />
          <DetailSection title="وضعیت و کنترل" hint="state و flags عملیاتی" icon={<SettingOutlined />} entries={groups?.state ?? []} />
          <DetailSection title="مالی" hint="مبلغ، پلن و درگاه" icon={<WalletOutlined />} entries={groups?.commerce ?? []} />
          <DetailSection title="Timeline" hint="تاریخچه زمانی رکورد" icon={<CalendarOutlined />} entries={groups?.timeline ?? []} />
          {!!groups?.complex.length && <section className="platform-admin-detail-section"><header className="platform-admin-detail-section__header"><span className="platform-admin-detail-section__icon"><ApartmentOutlined /></span><span className="platform-admin-detail-section__heading"><strong>ارتباطات و جزئیات</strong><small>رکوردهای مرتبط و داده‌های nested</small></span><Tag>{faNumber.format(groups.complex.length)} بخش</Tag></header><div className="platform-admin-detail-related">{groups.complex.map(([field, value]) => <RelatedSection key={field} field={field} value={value} />)}</div></section>}
        </div>
        <aside className="platform-admin-detail-aside"><header><strong>نمای سریع</strong><small>خلاصه‌ی عملیاتی رکورد</small></header><div className="platform-admin-detail-aside__model"><EyeOutlined /><span><small>منبع</small><strong>{RESOURCE_LABEL[resource] ?? resource}</strong></span></div><Descriptions column={1} size="small" colon={false} layout="vertical">{glance.map(([field, value]) => <Descriptions.Item key={field} label={fieldLabel(field)}><ScalarValue field={field} value={value} /></Descriptions.Item>)}{id && <Descriptions.Item label="شناسه"><Typography.Text code copyable={{ text: id }} dir="ltr">{id}</Typography.Text></Descriptions.Item>}</Descriptions></aside>
      </div>
    </div>
  );
}

export default PlatformAdminRecordDetailPage;
