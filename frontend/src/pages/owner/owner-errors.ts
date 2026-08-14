import { ApiError } from '../../api/client';

/** Minimal translator shape (react-i18next `t` with defaultValue options). */
type T = (key: string, options?: Record<string, unknown>) => string;

/**
 * Map a failed request to a **specific Persian** message for the owner panel.
 *
 * The backend's `ApiError.message` is raw English server text ("Salon not
 * found: …", "Request failed") and must never render inside the Persian UI
 * (ui-ux §13). This maps the machine `code`/`status` to catalog copy with a
 * generic Persian fallback — callers pass the result to `ErrorState`
 * descriptions, toasts, and inline alerts instead of `err.message`.
 */
export function ownerErrorMessage(err: unknown, t: T): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'SUBSCRIPTION_REQUIRED':
        return t('owner.errors.subscriptionRequired', {
          defaultValue: 'این بخش به اشتراک فعال نیاز دارد.',
        });
      case 'FORBIDDEN':
        return t('owner.errors.forbidden', {
          defaultValue: 'شما اجازهٔ دسترسی به این بخش را ندارید.',
        });
      case 'UNAUTHORIZED':
        return t('owner.errors.unauthorized', {
          defaultValue: 'نشست شما منقضی شده است — دوباره وارد شوید.',
        });
      case 'NOT_FOUND':
        return t('owner.errors.notFound', {
          defaultValue: 'موردی که دنبال آن بودید پیدا نشد.',
        });
      case 'VALIDATION_ERROR':
        return t('owner.errors.validation', {
          defaultValue: 'اطلاعات واردشده معتبر نیست — دوباره بررسی کنید.',
        });
      case 'PHONE_TAKEN':
        return t('admin.config.staff.phoneTaken', {
          defaultValue: 'این شماره قبلاً برای کاربر دیگری ثبت شده است.',
        });
      default:
        if (err.status >= 500) {
          return t('owner.errors.server', {
            defaultValue: 'سرور در دسترس نیست — کمی بعد دوباره تلاش کنید.',
          });
        }
    }
  }
  return t('common.error', { defaultValue: 'خطایی رخ داد — دوباره تلاش کنید.' });
}
