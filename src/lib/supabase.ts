import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[supabase] متغيرات VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY غير موجودة في البناء — ' +
      'المسار المباشر من المتصفح معطّل، لكن الموقع يعمل عبر /api'
  );
}

/**
 * عميل آمن لا يُسقط التطبيق أبدًا:
 * createClient('') كان يرمي "supabaseUrl is required" لحظة تحميل الصفحة
 * فيتحول الموقع كله لصفحة بيضاء. الآن نمرر بديلًا صالح الشكل عند نقص
 * المتغيرات — استدعاءات المسار المباشر تفشل بلطف (وتلتقطها الأجزاء
 * الاحتياطية في الواجهة) بينما المسار الأساسي عبر /api يبقى يعمل.
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.invalid',
  supabaseAnonKey || 'missing-anon-key'
);

/** هل المسار المباشر من المتصفح جاهز؟ (للتشخيص في وحدة التحكم) */
export const supabaseDirectReady = Boolean(supabaseUrl && supabaseAnonKey);

export default supabase;
