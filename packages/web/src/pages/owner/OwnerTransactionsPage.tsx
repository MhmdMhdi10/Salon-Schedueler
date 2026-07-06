import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Receipt, RefreshCw } from 'lucide-react';
import { ApiError, adminApi, type Transaction } from '../../api/client';
import { useSalonId } from '../../auth/useSalonId';
import { SeoHead } from '../../components/seo';
import {
  Badge,
  type BadgeStatus,
  Button,
  Card,
  EmptyState,
  ErrorState,
  JalaliDate,
  Money,
  Skeleton,
} from '../../components/ui';

type Status = 'loading' | 'error' | 'ready';

const kindLabel: Record<Transaction['kind'], string> = {
  appointment: 'نوبت',
  subscription: 'اشتراک',
};

/** Persian labels for payment statuses (stored in English in the DB). */
const statusLabel: Record<string, string> = {
  paid: 'پرداخت‌شده',
  confirmed: 'تأییدشده',
  verified: 'تأییدشده',
  pending: 'در انتظار',
  failed: 'ناموفق',
  cancelled: 'لغوشده',
};

/** Persian labels for subscription plan kinds. */
const planLabel: Record<string, string> = {
  monthly: 'ماهانه',
  quarterly: 'سه‌ماهه',
  annual: 'سالانه',
  trial: 'آزمایشی',
};

function statusBadge(s: string): BadgeStatus {
  if (s === 'paid' || s === 'confirmed' || s === 'verified') return 'success';
  if (s === 'pending') return 'warning';
  if (s === 'failed' || s === 'cancelled') return 'danger';
  return 'neutral';
}

function txLabel(tx: Transaction): string {
  if (tx.kind === 'subscription' && tx.label && planLabel[tx.label]) {
    return `اشتراک ${planLabel[tx.label]}`;
  }
  return tx.label ?? kindLabel[tx.kind];
}

export function OwnerTransactionsPage() {
  const { t } = useTranslation();
  const salonId = useSalonId();
  const [status, setStatus] = useState<Status>('loading');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState('');

  const load = () => {
    setStatus('loading');
    adminApi
      .getTransactions(salonId)
      .then((res) => {
        setTransactions(res.transactions);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : t('common.error'));
        setStatus('error');
      });
  };

  useEffect(load, [salonId, t]);

  return (
    <section data-testid="owner-transactions-page" className="flex flex-col gap-5">
      <SeoHead title={t('owner.transactions.title', { defaultValue: 'تراکنش‌ها' })} />

      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl text-display text-text">
            {t('owner.transactions.title', { defaultValue: 'تراکنش‌ها' })}
          </h1>
          <p className="text-sm text-muted">
            {t('owner.transactions.subtitle', {
              defaultValue: 'تاریخچهٔ پرداخت‌های نوبت و اشتراک',
            })}
          </p>
        </div>
        <Button variant="ghost" startIcon={<RefreshCw className="h-4 w-4" />} onClick={load}>
          {t('common.refresh', { defaultValue: 'بازخوانی' })}
        </Button>
      </header>

      {status === 'loading' && (
        <Card className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rect" className="h-14" />
          ))}
        </Card>
      )}

      {status === 'error' && (
        <ErrorState
          title={t('owner.transactions.errorTitle', { defaultValue: 'خطا در بارگذاری' })}
          description={error}
          retryLabel={t('common.retry', { defaultValue: 'تلاش مجدد' })}
          onRetry={load}
        />
      )}

      {status === 'ready' && transactions.length === 0 && (
        <EmptyState
          icon={<Receipt className="h-8 w-8" />}
          title={t('owner.transactions.emptyTitle', { defaultValue: 'تراکنشی ثبت نشده' })}
          description={t('owner.transactions.emptyBody', {
            defaultValue: 'هنوز پرداختی برای این سالن ثبت نشده است.',
          })}
        />
      )}

      {status === 'ready' && transactions.length > 0 && (
        <Card className="flex flex-col">
          <ul className="flex flex-col">
            {transactions.map((tx) => (
              <li
                key={`${tx.kind}-${tx.id}`}
                className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">
                      {txLabel(tx)}
                    </span>
                    <Badge status={statusBadge(tx.status)}>
                      {statusLabel[tx.status] ?? tx.status}
                    </Badge>
                  </div>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <span>{kindLabel[tx.kind]}</span>
                    <span aria-hidden="true">•</span>
                    <JalaliDate value={tx.createdAt} />
                    {tx.refId && (
                      <>
                        <span aria-hidden="true">•</span>
                        <span dir="ltr">{tx.refId}</span>
                      </>
                    )}
                  </span>
                </div>
                <Money amountRial={tx.amountRial} className="shrink-0 text-sm font-bold text-text" />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

export default OwnerTransactionsPage;
