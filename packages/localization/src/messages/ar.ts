import type { MessageKey } from '../types';

// Arabic catalog. Must define every key in the English catalog (enforced by type and test).
export const ar: Record<MessageKey, string> = {
  'app.erp.name': 'نظام تخطيط موارد السيارات',
  'app.customer.name': 'تطبيق العملاء',
  'app.manager.name': 'تطبيق المدير',
  'common.language': 'اللغة',
  'common.switchLanguage': 'English',
  'common.loading': 'جارٍ التحميل…',
  'common.retry': 'إعادة المحاولة',
  'common.lastChecked': 'آخر فحص',
  'health.title': 'حالة النظام',
  'health.api': 'واجهة البرمجة',
  'health.database': 'قاعدة البيانات',
  'health.cache': 'ذاكرة التخزين المؤقت',
  'health.queue': 'قائمة المهام',
  'health.status.up': 'يعمل',
  'health.status.down': 'غير متاح',
  'health.status.unknown': 'غير معروف',
  'health.unreachable': 'تعذر الوصول إلى واجهة البرمجة.',
  'foundation.notice':
    'إصدار الأساس (المرحلة 0). لم يتم تنفيذ الوحدات التشغيلية بعد، ولا يتم إنشاء أو تعديل أي سجلات هنا.',
  'customer.home.subtitle': 'احجز الخدمات وتابع الإصلاحات وتسوّق قطع الغيار — في المراحل القادمة.',
  'manager.home.subtitle': 'لوحات المعلومات والموافقات للفروع المصرح بها — في المراحل القادمة.',
  'erp.home.subtitle': 'الورشة والمخزون والمبيعات والمحاسبة والموارد البشرية وإدارة العملاء — على مراحل.',
};
