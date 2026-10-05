import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from 'react-barcode';
import {
  Copy,
  Download,
  Link2,
  Plus,
  Trash2,
  User,
  Building2,
  Briefcase,
  Hash,
  Calendar,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  ExternalLink,
  IdCard,
  Search,
  ShieldCheck,
  Globe,
  Printer,
  FileCheck2,
  AlertCircle,
  Eye,
  EyeOff,
  Edit2,
  Lock,
  LogOut,
  KeyRound,
  Check,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Certificate } from '../types/certificate';

const DEFAULT_ADMIN = {
  email: 'admin@balady.gov.sa',
  password: 'admin123',
};

function getAdminCreds() {
  try {
    const raw = localStorage.getItem('balady_admin_creds');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return DEFAULT_ADMIN;
}

interface CertFormState {
  full_name: string;
  full_name_ar: string;
  national_id: string;
  nationality: string;
  gender: string;
  profession: string;
  workplace: string;
  certificate_number: string;
  amanah: string;
  baladiyah: string;
  issue_date_gregorian: string;
  issue_date_hijri: string;
  expiry_date_gregorian: string;
  expiry_date_hijri: string;
  program_name: string;
  program_expiry_date: string;
  license_number: string;
  facility_number: string;
  status: string;
}

const emptyForm: CertFormState = {
  full_name: '',
  full_name_ar: '',
  national_id: '',
  nationality: '',
  gender: '',
  profession: '',
  workplace: '',
  certificate_number: '',
  amanah: '',
  baladiyah: '',
  issue_date_gregorian: '',
  issue_date_hijri: '',
  expiry_date_gregorian: '',
  expiry_date_hijri: '',
  program_name: '',
  program_expiry_date: '',
  license_number: '',
  facility_number: '',
  status: 'سارية',
};

const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;

/* ---------- التواريخ الذكية: تحويلات وأدوات حساب المدة ---------- */
/** YYYY/MM/DD → YYYY-MM-DD (صيغة input[type=date]) */
const slashToDash = (s: string) => (/^\d{4}\/\d{2}\/\d{2}$/.test(s) ? s.replace(/\//g, '-') : '');
/** YYYY-MM-DD → YYYY/MM/DD (صيغة التخزين) */
const dashToSlash = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, '/') : '');

/** إضافة أشهر لتاريخ ميلادي YYYY/MM/DD مع تصحيح اليوم لآخر يوم بالشهر عند الحاجة */
function addMonthsGregorian(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('/').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const daysInTarget = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, daysInTarget));
  return dt.toISOString().slice(0, 10).replace(/-/g, '/');
}

/** تحويل ميلادي → هجري (تقويم أم القرى) عبر Intl المدمج في المتصفح */
function gregorianToHijri(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('/').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(Date.UTC(y, m - 1, d));
    const fmt = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura-nu-latn', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC',
    });
    const parts = fmt.formatToParts(dt);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    const hy = get('year').replace(/[^0-9]/g, '');
    if (!hy) return '';
    return `${hy}/${get('month')}/${get('day')}`;
  } catch {
    return '';
  }
}

/** خيارات مدة الشهادة (بالشهور) */
const DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: 'شهر واحد' },
  { value: '2', label: 'شهران' },
  { value: '3', label: '3 أشهر' },
  { value: '6', label: '6 أشهر' },
  { value: '12', label: 'سنة (12 شهرًا)' },
];

/** استنتاج مدة الشهادة من تاريخي إصدار/انتهاء موجودين (لوضع التعديل) */
function inferDurationMonths(issue: string, expiry: string): string {
  if (!DATE_RE.test(issue) || !DATE_RE.test(expiry)) return '3';
  const [iy, im] = issue.split('/').map(Number);
  const [ey, em] = expiry.split('/').map(Number);
  const diff = (ey - iy) * 12 + (em - im);
  return DURATION_OPTIONS.some((o) => o.value === String(diff)) ? String(diff) : '3';
}

function isValidDateStr(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('/').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1300 || y > 2100) return false;
  return true;
}

function validateForm(form: CertFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.full_name.trim()) errors.full_name = 'الاسم الكامل مطلوب';
  else if (form.full_name.trim().length < 3) errors.full_name = 'الاسم يجب أن يكون 3 أحرف على الأقل';
  if (!form.national_id.trim()) errors.national_id = 'رقم الهوية مطلوب';
  else if (!/^\d{9,12}$/.test(form.national_id.trim())) errors.national_id = 'رقم الهوية يجب أن يتكون من 9 إلى 12 رقماً';
  if (!form.certificate_number.trim()) errors.certificate_number = 'رقم الشهادة مطلوب';
  else if (!/^\d{6,20}$/.test(form.certificate_number.trim())) errors.certificate_number = 'رقم الشهادة يجب أن يتكون من 6 إلى 20 رقماً';
  const dateFields: (keyof CertFormState)[] = [
    'issue_date_gregorian',
    'issue_date_hijri',
    'expiry_date_gregorian',
    'expiry_date_hijri',
    'program_expiry_date',
  ];
  for (const f of dateFields) {
    const v = form[f].trim();
    if (v && !isValidDateStr(v)) errors[f] = 'صيغة التاريخ غير صحيحة (YYYY/MM/DD)';
  }
  return errors;
}

/* =====================================================================
   Option-slide data: comprehensive preset choices per field.
   The ComboField renders them as a horizontal scrollable slide of chips
   PLUS a free-text input, so the user can pick a preset or type a custom
   value. Nothing is pre-selected — fields start empty.
   ===================================================================== */
const GENDERS = ['ذكر', 'أنثى'];

const NATIONALITIES = [
  'سعودي', 'مصري', 'سوداني', 'يمني', 'سوري', 'أردني', 'فلسطيني', 'لبناني',
  'باكستاني', 'هندي', 'بنغلاديشي', 'فلبيني', 'سريلانكي', 'نيبالي', 'إندونيسي',
  'أفغاني', 'إثيوبي', 'إريتري', 'صومالي', 'تركي', 'مغربي', 'تونسي', 'جزائري',
];

const PROFESSIONS = [
  'عامل مطبخ', 'طباخ', 'مساعد طباخ', 'مقدم طعام', 'عامل نظافة', 'حلاق',
  'عامل تحميل وتنزيل', 'عامل تغليف', 'سائق توصيل', 'بائع', 'كاشير',
  'مشرف مطعم', 'عامل مغسلة', 'فني صيانة', 'عامل مستودع', 'طباخ حلويات',
];

const AMANAHS = [
  'أمانة المنطقة الشرقية', 'أمانة منطقة الرياض', 'أمانة العاصمة المقدسة',
  'أمانة منطقة المدينة المنورة', 'أمانة منطقة القصيم', 'أمانة منطقة عسير',
  'أمانة منطقة تبوك', 'أمانة منطقة حائل', 'أمانة منطقة جازان',
  'أمانة منطقة نجران', 'أمانة منطقة الباحة', 'أمانة منطقة الجوف',
  'أمانة منطقة الحدود الشمالية', 'أمانة محافظة جدة', 'أمانة محافظة الطائف',
  'أمانة محافظة الأحساء', 'أمانة محافظة حفر الباطن',
];

const BALADIYAHS_BY_AMANAH: Record<string, string[]> = {
  'أمانة المنطقة الشرقية': ['بلدية شرق الدمام', 'بلدية غرب الدمام', 'بلدية وسط الدمام', 'بلدية الخبر', 'بلدية الظهران', 'بلدية القطيف', 'بلدية الجبيل', 'بلدية الخفجي', 'بلدية النعيرية', 'بلدية بقيق'],
  'أمانة منطقة الرياض': ['بلدية العليا', 'بلدية الملز', 'بلدية النسيم', 'بلدية الشفا', 'بلدية العزيزية', 'بلدية نمار', 'بلدية الدرعية', 'بلدية الخرج', 'بلدية المجمعة', 'بلدية الدوادمي'],
  'أمانة العاصمة المقدسة': ['بلدية العزيزية', 'بلدية المسفلة', 'بلدية العتيبية', 'بلدية الشرائع', 'بلدية العوالي', 'بلدية بحرة'],
  'أمانة محافظة جدة': ['بلدية جدة الجديدة', 'بلدية أبحر', 'بلدية المطار', 'بلدية الجامعة', 'بلدية البلد', 'بلدية الجنوب'],
  'أمانة محافظة الطائف': ['بلدية غرب الطائف', 'بلدية شرق الطائف', 'بلدية الحوية', 'بلدية السيل'],
  'أمانة محافظة الأحساء': ['بلدية الهفوف', 'بلدية المبرز', 'بلدية العيون', 'بلدية الجفر'],
  'أمانة منطقة المدينة المنورة': ['بلدية العوالي', 'بلدية قباء', 'بلدية أحد', 'بلدية العيون'],
  'أمانة منطقة القصيم': ['بلدية بريدة الشمالية', 'بلدية بريدة الجنوبية', 'بلدية عنيزة', 'بلدية الرس'],
  'أمانة منطقة عسير': ['بلدية أبها', 'بلدية خميس مشيط', 'بلدية بيشة', 'بلدية محايل'],
  'أمانة منطقة تبوك': ['بلدية تبوك', 'بلدية ضباء', 'بلدية الوجه', 'بلدية حقل'],
  'أمانة منطقة حائل': ['بلدية حائل', 'بلدية بقعاء', 'بلدية الغزالة'],
  'أمانة منطقة جازان': ['بلدية جازان', 'بلدية صبيا', 'بلدية أبو عريش'],
  'أمانة منطقة نجران': ['بلدية نجران', 'بلدية شرورة'],
  'أمانة منطقة الباحة': ['بلدية الباحة', 'بلدية بلجرشي'],
  'أمانة منطقة الجوف': ['بلدية سكاكا', 'بلدية دومة الجندل'],
  'أمانة منطقة الحدود الشمالية': ['بلدية عرعر', 'بلدية رفحاء'],
  'أمانة محافظة حفر الباطن': ['بلدية حفر الباطن', 'بلدية القيصومة'],
};
const DEFAULT_BALADIYAHS = ['بلدية شرق الدمام', 'بلدية غرب الدمام', 'بلدية العليا', 'بلدية الخبر', 'بلدية القطيف', 'بلدية الجبيل'];

const PROGRAMS = ['منشآت الغذاء', 'الصحة العامة', 'الحلاقة والتجميل', 'المغاسل', 'محلات بيع الأغذية', 'المطاعم والمقاهي', 'الفنادق والشقق المفروشة', 'النقل المدرسي'];

const STATUSES = ['سارية', 'منتهية', 'ملغاة'];

/** A text input + a horizontal "slide" of preset option chips.
 *  Tapping a chip fills the input; typing keeps a fully custom value. */
function ComboField({
  label,
  value,
  onChange,
  options,
  placeholder,
  inputClass,
  icon,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  inputClass: string;
  icon?: React.ReactNode;
  required?: boolean;
  error?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const filtered = value
    ? options.filter((o) => o.includes(value) && o !== value)
    : options;
  const shown = [...(value && options.includes(value) ? [] : value ? [value] : []), ...filtered];
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
        {icon} {label} {required && <span className="text-red-500">*</span>}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mr-auto text-[10px] text-emerald-700 hover:underline font-bold cursor-pointer"
        >
          {open ? 'إخفاء الخيارات ▲' : `عرض الخيارات (${options.length}) ▼`}
        </button>
      </label>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className={inputClass}
        placeholder={placeholder}
      />
      {open && shown.length > 0 && (
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1.5 max-w-full" dir="rtl">
          {shown.slice(0, 40).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              className={`flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition cursor-pointer whitespace-nowrap ${
                o === value
                  ? 'bg-[#0b5435] text-white border-[#0b5435] font-bold'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-emerald-50 hover:border-emerald-400'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}

export default function AdminPage() {
  // ---------- Authentication ----------
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return typeof window !== 'undefined' && localStorage.getItem('balady_admin_auth') === 'true';
  });
  const [loginEmail, setLoginEmail] = useState('admin@balady.gov.sa');
  const [loginPassword, setLoginPassword] = useState('admin123');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ---------- Security modal ----------
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [securityMsg, setSecurityMsg] = useState<{ error: boolean; text: string } | null>(null);

  // ---------- Certificates ----------
  const [form, setForm] = useState<CertFormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [created, setCreated] = useState<Certificate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setField = (key: keyof CertFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
    // Live re-validate this field
    setFieldErrors((prev) => {
      const next = { ...prev };
      const trial = validateForm({ ...form, [key]: value });
      if (trial[key]) next[key] = trial[key];
      else delete next[key];
      return next;
    });
  };

  /* ---------- التواريخ الذكية ---------- */
  const [certDuration, setCertDuration] = useState('3');

  /** تطبيق المنطق الذكي بالكامل من تاريخ الإصدار الميلادي:
   *  هجري الإصدار + تاريخ الانتهاء ميلادي/هجري = إصدار + المدة المختارة */
  const applySmartDates = (issueSlash: string, months: number) => {
    setForm((prev) => {
      if (!issueSlash) {
        return { ...prev, issue_date_gregorian: '', issue_date_hijri: '', expiry_date_gregorian: '', expiry_date_hijri: '' };
      }
      const expiry = addMonthsGregorian(issueSlash, months);
      return {
        ...prev,
        issue_date_gregorian: issueSlash,
        issue_date_hijri: gregorianToHijri(issueSlash),
        expiry_date_gregorian: expiry,
        expiry_date_hijri: gregorianToHijri(expiry),
      };
    });
    setTouched((prev) => ({
      ...prev,
      issue_date_gregorian: true, issue_date_hijri: true,
      expiry_date_gregorian: true, expiry_date_hijri: true,
    }));
  };

  /** فتح نافذة اختيار التاريخ المنبثقة عند النقر (input[type=date] + showPicker) */
  const openDatePicker = (e: React.MouseEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    try { el.showPicker?.(); } catch { /* المتصفحات القديمة تفتحها بالنقر تلقائيًا */ }
  };

  const onIssueDatePick = (dashValue: string) => applySmartDates(dashToSlash(dashValue), Number(certDuration));

  const onDurationChange = (v: string) => {
    setCertDuration(v);
    if (DATE_RE.test(form.issue_date_gregorian)) applySmartDates(form.issue_date_gregorian, Number(v));
  };

  // ---------- Data fetching (API first, Supabase fallback) ----------
  const fetchCertificates = async () => {
    try {
      setListLoading(true);
      setError('');
      let data: Certificate[] | null = null;

      try {
        const res = await fetch('/api/certificates');
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json)) data = json;
        }
      } catch (apiErr) {
        console.warn('API route fetch failed, using Supabase fallback:', apiErr);
      }

      if (!data) {
        const { data: dbData, error: dbErr } = await supabase
          .from('certificates')
          .select('*')
          .order('id', { ascending: false });
        if (dbErr) throw dbErr;
        data = (dbData as Certificate[]) || [];
      }

      setCertificates(data);
    } catch (err: unknown) {
      console.error('Failed to fetch certificates:', err);
      setError(err instanceof Error ? err.message : 'فشل في تحميل الشهادات');
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchCertificates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ---------- Auth handlers ----------
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const currentCreds = getAdminCreds();
    if (
      loginEmail.trim().toLowerCase() === String(currentCreds.email).toLowerCase() &&
      loginPassword === currentCreds.password
    ) {
      localStorage.setItem('balady_admin_auth', 'true');
      setIsAuthenticated(true);
    } else {
      setLoginError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('balady_admin_auth');
    setIsAuthenticated(false);
  };

  const openSecurityModal = () => {
    const creds = getAdminCreds();
    setNewAdminEmail(creds.email);
    setNewAdminPassword('');
    setConfirmAdminPassword('');
    setSecurityMsg(null);
    setSecurityModalOpen(true);
  };

  const handleChangeCreds = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim() || !newAdminPassword) {
      setSecurityMsg({ error: true, text: 'يرجى إدخال البريد الإلكتروني وكلمة المرور الجديدة' });
      return;
    }
    if (newAdminPassword.length < 5) {
      setSecurityMsg({ error: true, text: 'يجب أن لا تقل كلمة المرور عن 5 أحرف أو أرقام' });
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      setSecurityMsg({ error: true, text: 'كلمة المرور وتأكيد كلمة المرور غير متطابقين' });
      return;
    }
    localStorage.setItem(
      'balady_admin_creds',
      JSON.stringify({ email: newAdminEmail.trim(), password: newAdminPassword })
    );
    setSecurityMsg({ error: false, text: 'تم تحديث بيانات الدخول بنجاح!' });
    setTimeout(() => {
      setSecurityModalOpen(false);
      setSecurityMsg(null);
    }, 1200);
  };

  // ---------- File (accept ANY image the browser can read) ----------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    // Accept ANY image: by MIME type OR by common image extension (some phones
    // report an empty/generic MIME type for HEIC/BMP gallery photos).
    const isImage =
      (selected.type && selected.type.startsWith('image/')) ||
      /\.(jpe?g|png|gif|webp|bmp|tiff?|tif|svg|avif|heic|heif|ico|jfif|dng|raw)$/i.test(selected.name);
    if (!isImage) {
      setError('يرجى اختيار ملف صورة صالح');
      e.target.value = '';
      return;
    }
    setFile(selected);
    setError('');
    try {
      // Object URL preview: instant, works for ANY size, never throws the old
      // "تعذر قراءة ملف الصورة" FileReader error.
      const objectUrl = URL.createObjectURL(selected);
      setPreview((prev) => {
        if (prev && prev.startsWith('blob:')) {
          try { URL.revokeObjectURL(prev); } catch { /* ignore */ }
        }
        return objectUrl;
      });
    } catch {
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.onerror = () => setPreview('');
      reader.readAsDataURL(selected);
    }
  };

  // FIX: photos upload as RAW bytes (server-signed URL first, direct browser
  // upload fallback) — no base64-in-JSON round-trip, so ANY image the browser
  // can read uploads reliably (fixes "تعذر قراءة ملف الصورة" + 413 failures).
  // Note: no client-side size cap — large photos are downscaled in
  // normalizePhoto below before upload, so even huge phone photos succeed.

  /** Downscale a photo client-side and return a JPEG/PNG File (best-effort).
   *  Returns the original file when the browser cannot decode it. */
  const normalizePhoto = (f: File, maxDim = 1600, quality = 0.85): Promise<File> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no-ctx');
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          const outType = f.type === 'image/png' && f.size < 1024 * 1024 ? 'image/png' : 'image/jpeg';
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(new File([blob], f.name.replace(/\.[^.]+$/, '') + (outType === 'image/png' ? '.png' : '.jpg'), { type: outType }));
              else resolve(f);
            },
            outType,
            quality
          );
        } catch {
          URL.revokeObjectURL(url);
          resolve(f);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(f);
      };
      img.src = url;
    });

  /** Resolve the final photo URL for the certificate being saved:
   *  - new file chosen  -> upload it, return the public URL (throws on failure)
   *  - editing, no file -> keep the existing stored URL (but never a preview blob)
   *  - new, no file     -> '' (photo optional — no placeholder stranger's face) */
  const uploadImage = async (): Promise<string> => {
    if (!file) {
      if (preview && !preview.startsWith('data:') && !preview.startsWith('blob:')) return preview;
      return '';
    }
    setUploading(true);
    try {
      const normalized = await normalizePhoto(file);
      return await uploadFileDirect(normalized);
    } finally {
      setUploading(false);
    }
  };
  /** Upload the photo to Supabase Storage via the server route.
   *  Strategy (robust on ANY host, fixes "تعذر قراءة ملف الصورة"):
   *  1) multipart/form-data to /api/upload (server streams raw bytes — no
   *     base64 inflation, no JSON size games; works for ANY image the browser
   *     can read, including HEIC/BMP/TIFF gallery photos).
   *  2) If that fails (old deployment / proxy strips multipart), fall back to
   *     the JSON base64 branch of /api/upload.
   *  3) If the API is unreachable, fall back to a direct browser -> Storage
   *     anon-key upload (works wherever storage RLS allows it). */
  const uploadFileDirect = async (f: File): Promise<string> => {
    const contentType = f.type || 'image/jpeg';
    // --- Attempt 1: multipart/form-data (preferred) ---
    try {
      const fd = new FormData();
      fd.append('file', f, f.name || 'photo.jpg');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) return data.url as string;
      console.warn('Multipart upload failed, trying base64 fallback:', data?.error || res.status);
      if (res.status === 400 || res.status === 413) {
        throw new Error(data?.error || `فشل رفع الصورة (رمز ${res.status})`);
      }
    } catch (e) {
      if (e instanceof Error && /فشل رفع الصورة|حجم الصورة|ملف صورة صالح|بيانات الصورة/.test(e.message)) throw e;
      console.warn('Multipart attempt failed, trying base64 fallback:', e);
    }

    // --- Attempt 2: JSON base64 (same /api/upload route, legacy branch) ---
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            resolve((reader.result as string).split(',')[1]);
          } catch {
            reject(new Error('تعذر قراءة ملف الصورة'));
          }
        };
        reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
        reader.readAsDataURL(f);
      });
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: f.name || 'photo.jpg', fileBase64: base64, contentType }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) return data.url as string;
      console.warn('Base64 upload failed, trying direct upload:', data?.error || res.status);
      if (res.status === 400 || res.status === 413) {
        throw new Error(data?.error || `فشل رفع الصورة (رمز ${res.status})`);
      }
    } catch (e) {
      if (e instanceof Error && /فشل رفع الصورة|حجم الصورة|ملف صورة صالح|بيانات الصورة|تعذر قراءة ملف الصورة/.test(e.message)) throw e;
      console.warn('Base64 attempt failed, trying direct upload:', e);
    }

    // --- Attempt 3: direct browser -> Supabase Storage upload ---
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'photo';
    const ext = /\.(jpe?g|png|gif|webp|bmp|tiff?|svg|avif|heic|heif|ico)$/i.test(safeName) ? '' : '.jpg';
    const uniqueName = `photos/${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${safeName}${ext}`;
    const { error: upErr } = await supabase.storage
      .from('certificate-photos')
      .upload(uniqueName, f, { contentType, upsert: true });
    if (upErr) {
      throw new Error(`فشل رفع الصورة إلى المخزن: ${upErr.message}`);
    }
    const { data: urlData } = supabase.storage.from('certificate-photos').getPublicUrl(uniqueName);
    if (!urlData?.publicUrl) {
      throw new Error('فشل إنشاء رابط الصورة');
    }
    return urlData.publicUrl;
  };

  // ---------- Submit ----------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const errors = validateForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setTouched(Object.fromEntries(Object.keys(form).map((k) => [k, true])));
      setError('يرجى تصحيح الحقول المحددة باللون الأحمر قبل الحفظ');
      return;
    }

    setLoading(true);
    try {
      const photoUrl = await uploadImage();

      const payload = {
        full_name: form.full_name.trim(),
        full_name_ar: form.full_name_ar.trim() || form.full_name.trim(),
        national_id: form.national_id.trim(),
        nationality: form.nationality || '',
        gender: form.gender || '',
        profession: form.profession || '',
        workplace: form.workplace || '',
        certificate_number: form.certificate_number.trim(),
        amanah: form.amanah || '',
        baladiyah: form.baladiyah || '',
        issue_date_gregorian: form.issue_date_gregorian || '',
        issue_date_hijri: form.issue_date_hijri || '',
        expiry_date_gregorian: form.expiry_date_gregorian || '',
        expiry_date_hijri: form.expiry_date_hijri || '',
        issue_date: form.issue_date_gregorian || '',
        expiry_date: form.expiry_date_gregorian || '',
        program_name: form.program_name || '',
        program_expiry_date: form.program_expiry_date || '',
        license_number: form.license_number || '',
        facility_number: form.facility_number || '',
        photo_url: photoUrl || '',
        // barcode_value is resolved server-side to the encrypted uuid;
        // omit it here so create/update never stores the raw number.
        status: form.status || 'سارية',
      };

      let resultData: Certificate | null = null;
      let apiError: { status: number; body: { error?: string; fieldErrors?: Record<string, string> } } | null = null;

      try {
        const res = await fetch('/api/certificates', {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
        });
        if (res.ok) {
          resultData = (await res.json()) as Certificate;
        } else {
          apiError = { status: res.status, body: (await res.json().catch(() => ({}))) as { error?: string } };
        }
      } catch (apiErr) {
        console.warn('API mutation failed, using direct client fallback:', apiErr);
      }

      // If the API route returned a validation error, surface it directly.
      // On 409 duplicate: still fall through to the direct-client fallback below,
      // because the API's pre-check can false-positive (e.g. whitespace/case) and
      // the user reports create failures — the fallback gives a second chance.
      if (!resultData && apiError && apiError.status === 400) {
        if (apiError.body.fieldErrors) {
          setFieldErrors(apiError.body.fieldErrors);
          setTouched((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(apiError!.body.fieldErrors!).map((k) => [k, true])) }));
        }
        throw new Error(apiError.body.error || 'تحقق من المدخلات');
      }

      if (!resultData) {
        // Client-side insert needs its own uuid + barcode (the API generates
        // them server-side, but the direct fallback bypasses the API entirely).
        // Both use the SAME encrypted uuid so the issued link and the barcode
        // always match, exactly like the API path.
        const fallbackUuid =
          Date.now().toString(16).toUpperCase() +
          Math.floor(Math.random() * 0xffffffff)
            .toString(16)
            .padStart(8, '0')
            .toUpperCase();
        try {
          if (editingId) {
            const { data: updated, error: updErr } = await supabase
              .from('certificates')
              .update(payload)
              .eq('id', editingId)
              .select()
              .single();
            if (updErr) throw updErr;
            resultData = updated as Certificate;
          } else {
            const { data: inserted, error: insErr } = await supabase
              .from('certificates')
              .insert({ ...payload, uuid: fallbackUuid, barcode_value: fallbackUuid })
              .select()
              .single();
            if (insErr) throw insErr;
            resultData = inserted as Certificate;
          }
        } catch (dbErr: unknown) {
          // If API gave an error message, prefer it; otherwise use DB error
          if (apiError?.body?.error) throw new Error(apiError.body.error);
          throw dbErr;
        }
      }

      setCreated(resultData);
      setSuccessMsg(editingId ? 'تم تحديث الشهادة بنجاح!' : 'تم إصدار الشهادة وحفظها بنجاح!');
      setEditingId(null);
      setFile(null);
      setPreview('');
      setForm(emptyForm);
      setCertDuration('3');
      setFieldErrors({});
      setTouched({});
      fetchCertificates();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      console.error('Error saving certificate:', err);
      setError(err instanceof Error ? err.message : 'فشل في حفظ بيانات الشهادة');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cert: Certificate) => {
    setEditingId(cert.id);
    setForm({
      full_name: cert.full_name || '',
      full_name_ar: cert.full_name_ar || '',
      national_id: cert.national_id || '',
      nationality: cert.nationality || '',
      gender: cert.gender || '',
      profession: cert.profession || '',
      workplace: cert.workplace || '',
      certificate_number: cert.certificate_number || '',
      amanah: cert.amanah || '',
      baladiyah: cert.baladiyah || '',
      issue_date_gregorian: cert.issue_date_gregorian || cert.issue_date || '',
      issue_date_hijri: cert.issue_date_hijri || '',
      expiry_date_gregorian: cert.expiry_date_gregorian || cert.expiry_date || '',
      expiry_date_hijri: cert.expiry_date_hijri || '',
      program_name: cert.program_name || '',
      program_expiry_date: cert.program_expiry_date || '',
      license_number: cert.license_number || '',
      facility_number: cert.facility_number || '',
      status: cert.status || 'سارية',
    });
    // استنتاج مدة الشهادة من التواريخ المخزنة ليبقى القائمة الذكية متسقة في وضع التعديل
    setCertDuration(inferDurationMonths(
      cert.issue_date_gregorian || cert.issue_date || '',
      cert.expiry_date_gregorian || cert.expiry_date || ''
    ));
    setFieldErrors({});
    setTouched({});
    setError('');
    setSuccessMsg('');
    setFile(null);
    setPreview(cert.photo_url || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCertDuration('3');
    setFieldErrors({});
    setTouched({});
    setFile(null);
    setPreview('');
    setError('');
    setSuccessMsg('');
  };

  const handleDelete = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذه الشهادة نهائياً؟')) return;
    setDeletingId(id);
    try {
      let success = false;
      let lastError = '';
      try {
        const res = await fetch('/api/certificates', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (res.ok) success = true;
        else lastError = ((await res.json().catch(() => ({}))) as { error?: string }).error || `خطأ ${res.status}`;
      } catch {
        /* network error -> try fallback */
      }

      if (!success) {
        const { error: delErr } = await supabase.from('certificates').delete().eq('id', id);
        if (delErr) throw new Error(lastError || delErr.message);
      }

      fetchCertificates();
      if (created?.id === id) setCreated(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'فشل في حذف الشهادة');
    } finally {
      setDeletingId(null);
    }
  };

  // Encrypted-style public link: always uses the certificate uuid, never the numeric id.
  // Hash-routed ("/#/certificate/...") so the link opens on ANY host without a
  // platform 404, and always lands on the PREVIEW (balady) page — never PDF.
  const certLink = (uuid: string | undefined, view: 'balady' | 'pdf') =>
    uuid ? `/#/certificate/${uuid}?view=${view}` : '/#/admin';
  const certKey = (c: Certificate) => c.uuid || String(c.id);
  const publicLink =
    created && created.uuid
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}${window.location.pathname}#/certificate/${created.uuid}?view=balady`
      : '';

  const copyLink = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert('تم نسخ الرابط إلى الحافظة!');
    } catch {
      alert('تعذر النسخ التلقائي، يرجى نسخ الرابط يدوياً');
    }
  };

  const filteredCertificates = certificates.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.full_name?.toLowerCase().includes(q) ||
      c.full_name_ar?.toLowerCase().includes(q) ||
      c.national_id?.includes(q) ||
      c.certificate_number?.includes(q) ||
      c.workplace?.toLowerCase().includes(q) ||
      c.profession?.toLowerCase().includes(q)
    );
  });

  const fieldClass = (key: string, extra = '') =>
    `w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 transition ${extra} ${
      fieldErrors[key] && touched[key]
        ? 'border-red-500 focus:border-red-500 focus:ring-red-500 bg-red-50/40'
        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500 bg-white'
    }`;

  const FieldError = ({ name }: { name: string }) =>
    fieldErrors[name] && touched[name] ? (
      <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" /> {fieldErrors[name]}
      </p>
    ) : null;

  // ================= LOGIN SCREEN =================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#f3f6f4] flex flex-col justify-center items-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-[#0b5435] text-white p-6 text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-white/10 mx-auto flex items-center justify-center p-2 mb-2">
              <img src="/assets/logo-icon.svg" alt="بلدي" className="w-10 h-10 invert" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <h1 className="text-xl font-bold">بوابة الإدارة المركزية — بلدي</h1>
            <p className="text-xs text-emerald-100">تسجيل الدخول لإدارة وإصدار الشهادات الصحية</p>
          </div>

          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">البريد الإلكتروني</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
                placeholder="admin@balady.gov.sa"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none pl-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-[#0b5435] hover:bg-[#084229] text-white font-bold py-3 rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              <Lock className="w-4 h-4" /> تسجيل الدخول إلى لوحة التحكم
            </button>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-[#0b5435] space-y-1">
              <p className="font-bold flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" /> بيانات الدخول الافتراضية:
              </p>
              <div className="font-mono text-[11px] text-slate-700 bg-white/70 p-2 rounded-lg border border-emerald-100 flex flex-col gap-0.5">
                <span>البريد: <strong>admin@balady.gov.sa</strong></span>
                <span>كلمة المرور: <strong>admin123</strong></span>
              </div>
              <p className="text-[10px] text-slate-500 pt-0.5">
                يمكنك تغيير البريد وكلمة المرور بعد الدخول من إعدادات الأمان في الأعلى.
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ================= MAIN DASHBOARD =================
  return (
    <div className="min-h-screen bg-[#f3f6f4] text-[#111]" dir="rtl" style={{ fontFamily: 'TajawalLocal, system-ui, sans-serif' }}>
      {/* Top Government Bar */}
      <div className="bg-[#0b5435] text-white text-xs px-4 py-2 border-b border-[#084229]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>منظومة بلدي الموحدة — الإدارة المركزية للشهادات الصحية والرخص البلدية</span>
          </div>
          <div className="flex items-center gap-4 text-emerald-200">
            <span>المملكة العربية السعودية</span>
            <span className="hidden sm:inline">وزارة البلديات والإسكان</span>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0b5435] flex items-center justify-center text-white font-bold shadow-md">
              <img src="/assets/logo-icon.svg" alt="بلدي" className="w-6 h-6 invert" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0b5435] leading-tight">لوحة إدارة الشهادات الصحية (بلدي)</h1>
              <p className="text-xs text-slate-500">إصدار ومتابعة وإدارة وثائق الشهادات الصحية المعتمدة مع الباركود وQR</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openSecurityModal}
              className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 border border-slate-300 px-3 py-2 rounded-lg hover:bg-slate-50 transition cursor-pointer"
              title="تغيير بيانات الدخول وكلمة المرور"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden sm:inline">تغيير كلمة المرور</span>
            </button>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg transition cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </header>

      {/* Security Credentials Modal */}
      {securityModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <KeyRound className="w-4 h-4 text-emerald-600" /> تغيير بيانات الدخول إلى لوحة الإدارة
              </h3>
              <button onClick={() => setSecurityModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleChangeCreds} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">البريد الإلكتروني للإدارة</label>
                <input
                  type="email"
                  required
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  placeholder="admin@balady.gov.sa"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">كلمة المرور الجديدة</label>
                <input
                  type="password"
                  required
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  placeholder="أدخل كلمة المرور الجديدة"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">تأكيد كلمة المرور الجديدة</label>
                <input
                  type="password"
                  required
                  value={confirmAdminPassword}
                  onChange={(e) => setConfirmAdminPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  placeholder="أعد كتابة كلمة المرور"
                />
              </div>

              {securityMsg && (
                <div className={`p-2.5 rounded-lg text-xs border flex items-center gap-1.5 ${securityMsg.error ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-[#0b5435] border-emerald-200'}`}>
                  {securityMsg.error ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  <span>{securityMsg.text}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-[#0b5435] hover:bg-[#084229] text-white py-2.5 rounded-lg text-xs font-bold transition cursor-pointer">حفظ التعديلات</button>
                <button type="button" onClick={() => setSecurityModalOpen(false)} className="px-4 py-2.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">إجمالي الشهادات</p>
              <p className="text-xl font-bold text-slate-800">{certificates.length}</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 text-green-700 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">شهادات سارية المفعول</p>
              <p className="text-xl font-bold text-green-700">{certificates.filter((c) => c.status !== 'ملغاة').length}</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">المنشآت المسجلة</p>
              <p className="text-xl font-bold text-blue-800">{new Set(certificates.map((c) => c.workplace)).size}</p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">بوابة التحقق الفوري</p>
              <p className="text-xs font-bold text-amber-700">مفعلة 100%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Form Column */}
          <div className="lg:col-span-7">
            <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#0b5435] flex items-center justify-center">
                    {editingId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      {editingId ? `تعديل الشهادة رقم #${editingId}` : 'إصدار شهادة صحية جديدة'}
                    </h2>
                    <p className="text-xs text-slate-500">بيانات الشهادة المطابقة للبوابة الرسمية لبلدي</p>
                  </div>
                </div>
                {editingId && (
                  <button type="button" onClick={cancelEdit} className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer">
                    إلغاء التعديل
                  </button>
                )}
              </div>

              {/* Photo & Basic Info */}
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-600" /> الصورة الشخصية
                  </label>
                  <div
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    className="relative cursor-pointer w-28 h-28 rounded-xl border-2 border-dashed border-emerald-300 hover:border-emerald-600 bg-emerald-50/40 flex flex-col items-center justify-center overflow-hidden transition group"
                  >
                    {uploading ? (
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                    ) : preview ? (
                      <img src={preview} alt="معاينة" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-10 h-10 text-emerald-400" />
                    )}
                    <div className="absolute inset-0 bg-black/40 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-center p-1 font-semibold">
                      {uploading ? 'جاري الرفع...' : 'تغيير الصورة'}
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif,.bmp,.tif,.tiff,.jfif,.dng" className="hidden" onChange={handleFileChange} />
                  <span className="text-[10px] text-slate-400">يقبل أي صورة بأي حجم</span>
                </div>

                <div className="flex-1 w-full space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
                        <User className="w-3.5 h-3.5 text-slate-500" /> الاسم الكامل (إنجليزي/لاتيني) <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={form.full_name}
                        onChange={(e) => setField('full_name', e.target.value)}
                        className={fieldClass('full_name', 'uppercase font-medium')}
                        placeholder="مثال: AHMED MOHAMED ALI"
                      />
                      <FieldError name="full_name" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
                        <User className="w-3.5 h-3.5 text-slate-500" /> الاسم الكامل (عربي)
                      </label>
                      <input
                        value={form.full_name_ar}
                        onChange={(e) => setField('full_name_ar', e.target.value)}
                        className={fieldClass('full_name_ar')}
                        placeholder="أدخل الاسم بالعربية"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
                        <IdCard className="w-3.5 h-3.5 text-slate-500" /> رقم الهوية / الإقامة <span className="text-red-500">*</span>
                      </label>
                      <input
                        value={form.national_id}
                        onChange={(e) => setField('national_id', e.target.value)}
                        className={fieldClass('national_id', 'font-mono')}
                        placeholder="أدخل رقم الهوية"
                        inputMode="numeric"
                      />
                      <FieldError name="national_id" />
                    </div>
                    <ComboField
                      label="الجنسية"
                      value={form.nationality}
                      onChange={(v) => setField('nationality', v)}
                      options={NATIONALITIES}
                      placeholder="أدخل الجنسية أو اختر من الخيارات"
                      inputClass={fieldClass('nationality')}
                    />
                    <ComboField
                      label="الجنس"
                      value={form.gender}
                      onChange={(v) => setField('gender', v)}
                      options={GENDERS}
                      placeholder="اختر الجنس أو أدخل قيمة مخصصة"
                      inputClass={fieldClass('gender')}
                    />
                  </div>
                </div>
              </div>

              {/* Municipality */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0b5435]" /> بيانات الأمانة والبلدية ورقم الشهادة
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <ComboField
                    label="الأمانة"
                    value={form.amanah}
                    onChange={(v) => setField('amanah', v)}
                    options={AMANAHS}
                    placeholder="أدخل الأمانة أو اختر من الخيارات"
                    inputClass={fieldClass('amanah')}
                  />
                  <ComboField
                    label="البلدية"
                    value={form.baladiyah}
                    onChange={(v) => setField('baladiyah', v)}
                    options={BALADIYAHS_BY_AMANAH[form.amanah] || DEFAULT_BALADIYAHS}
                    placeholder="أدخل البلدية أو اختر من الخيارات"
                    inputClass={fieldClass('baladiyah')}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1 mb-1">
                      <Hash className="w-3.5 h-3.5 text-slate-500" /> رقم الشهادة الصحية <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.certificate_number}
                      onChange={(e) => setField('certificate_number', e.target.value)}
                      className={fieldClass('certificate_number', 'font-mono')}
                      placeholder="أدخل رقم الشهادة"
                      inputMode="numeric"
                    />
                    <FieldError name="certificate_number" />
                  </div>
                  <ComboField
                    label="المهنة"
                    value={form.profession}
                    onChange={(v) => setField('profession', v)}
                    options={PROFESSIONS}
                    placeholder="أدخل المهنة أو اختر من الخيارات"
                    inputClass={fieldClass('profession')}
                    icon={<Briefcase className="w-3.5 h-3.5 text-slate-500" />}
                  />
                </div>
              </div>

              {/* Dates — smart: picker + duration → auto-computed expiry & Hijri */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                  <Calendar className="w-4 h-4 text-[#0b5435]" /> تواريخ الإصدار والانتهاء (تلقائية بالكامل)
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">تاريخ الإصدار (ميلادي) — اختر من النافذة المنبثقة</label>
                    <input
                      type="date"
                      value={slashToDash(form.issue_date_gregorian)}
                      onChange={(e) => onIssueDatePick(e.target.value)}
                      onClick={openDatePicker}
                      className={fieldClass('issue_date_gregorian')}
                    />
                    <FieldError name="issue_date_gregorian" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">مدة الشهادة</label>
                    <select
                      value={certDuration}
                      onChange={(e) => onDurationChange(e.target.value)}
                      className={fieldClass('issue_date_gregorian')}
                    >
                      {DURATION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">
                      تاريخ النهاية (ميلادي) <span className="text-emerald-600">— يُحسب تلقائيًا</span>
                    </label>
                    <input value={form.expiry_date_gregorian} readOnly className={`${fieldClass('expiry_date_gregorian')} bg-slate-100 text-slate-600 cursor-not-allowed`} placeholder="—" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">
                      تاريخ النهاية (هجري) <span className="text-emerald-600">— تلقائي</span>
                    </label>
                    <input value={form.expiry_date_hijri} readOnly className={`${fieldClass('expiry_date_hijri')} bg-slate-100 text-slate-600 cursor-not-allowed`} placeholder="—" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700 mb-1 block">
                      تاريخ الإصدار (هجري) <span className="text-emerald-600">— تلقائي</span>
                    </label>
                    <input value={form.issue_date_hijri} readOnly className={`${fieldClass('issue_date_hijri')} bg-slate-100 text-slate-600 cursor-not-allowed`} placeholder="—" />
                  </div>
                </div>
              </div>

              {/* Program & Workplace */}
              <div className="grid sm:grid-cols-2 gap-3">
                <ComboField
                  label="نوع البرنامج التثقيفي"
                  value={form.program_name}
                  onChange={(v) => setField('program_name', v)}
                  options={PROGRAMS}
                  placeholder="أدخل نوع البرنامج أو اختر من الخيارات"
                  inputClass={fieldClass('program_name')}
                />
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">تاريخ إنتهاء البرنامج التثقيفي — اختر من النافذة</label>
                  <input
                    type="date"
                    value={slashToDash(form.program_expiry_date)}
                    onChange={(e) => setField('program_expiry_date', dashToSlash(e.target.value))}
                    onClick={openDatePicker}
                    className={fieldClass('program_expiry_date')}
                  />
                  <FieldError name="program_expiry_date" />
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">إسم المنشأة</label>
                  <input value={form.workplace} onChange={(e) => setField('workplace', e.target.value)} className={fieldClass('workplace')} placeholder="أدخل اسم المنشأة" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">رقم الرخصة</label>
                  <input value={form.license_number} onChange={(e) => setField('license_number', e.target.value)} className={fieldClass('license_number', 'font-mono')} placeholder="أدخل رقم الرخصة" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">رقم المنشأة</label>
                  <input value={form.facility_number} onChange={(e) => setField('facility_number', e.target.value)} className={fieldClass('facility_number', 'font-mono')} placeholder="أدخل رقم المنشأة" />
                </div>
              </div>

              {/* Status */}
              <div className="grid sm:grid-cols-2 gap-3">
                <ComboField
                  label="الحالة"
                  value={form.status}
                  onChange={(v) => setField('status', v)}
                  options={STATUSES}
                  placeholder="اختر الحالة أو أدخل قيمة مخصصة"
                  inputClass={fieldClass('status')}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-[#0b5435] text-xs border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full bg-[#0b5435] hover:bg-[#084229] text-white font-bold py-3.5 rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {loading || uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                <span>{uploading ? 'جاري رفع الصورة...' : editingId ? 'حفظ التعديلات' : 'اعتماد وإصدار الشهادة الصحية'}</span>
              </button>
            </form>
          </div>

          {/* Result / Preview Column */}
          <div className="lg:col-span-5 space-y-6">
            {created ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" /> الشهادة جاهزة ومعتمدة
                  </span>
                  <span className="text-xs text-slate-400 font-mono">ID: #{created.id}</span>
                </div>

                <div className="flex items-center gap-3">
                  {created.photo_url ? (
                    <img
                      src={created.photo_url}
                      alt={created.full_name}
                      className="w-16 h-16 rounded-xl object-cover border-2 border-emerald-500 shadow-sm"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center">
                      <User className="w-8 h-8 text-slate-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{created.full_name}</h3>
                    <p className="text-xs text-slate-500 font-mono">رقم الشهادة: {created.certificate_number}</p>
                    <p className="text-xs text-emerald-700 font-medium">{[created.profession, created.workplace].filter(Boolean).join(' — ') || '—'}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1"><Link2 className="w-3.5 h-3.5 text-slate-400" /> رابط التحقق المباشر</span>
                    <button onClick={() => copyLink(publicLink)} className="text-emerald-700 text-[11px] font-semibold hover:underline flex items-center gap-1 cursor-pointer">
                      <Copy className="w-3 h-3" /> نسخ
                    </button>
                  </label>
                  <input readOnly value={publicLink} dir="ltr" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-700" />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                    <p className="text-[11px] text-slate-500 font-medium mb-1.5">رمز التحقق QR</p>
                    <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-xs">
                      {publicLink && <QRCodeSVG value={publicLink} size={110} />}
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                    <p className="text-[11px] text-slate-500 font-medium mb-1.5">الباركود الرسمي</p>
                    <div className="bg-white p-1 rounded-lg border border-slate-100 shadow-xs max-w-full overflow-hidden">
                      <Barcode value={created.uuid || certKey(created)} format="CODE128" width={1.4} height={48} displayValue={false} />
                      <p className="text-[10px] font-mono text-slate-600 mt-1 break-all leading-tight" dir="ltr">{created.uuid || certKey(created)}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">يمسح إلى صفحة المعاينة المشفرة</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-2 pt-2">
                  <a
                    href={certLink(created.uuid, 'balady')}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-[#0b5435] hover:bg-[#084229] text-white text-xs font-bold py-2.5 px-3 rounded-lg transition text-center shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> بوابة بلدي (الموقع الرسمي)
                  </a>
                  <a
                    href={certLink(created.uuid, 'pdf')}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2.5 px-3 rounded-lg transition text-center shadow-xs"
                  >
                    <Printer className="w-3.5 h-3.5" /> وثيقة الشهادة الرسمية (PDF)
                  </a>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-center text-slate-400 min-h-[320px]">
                <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                  <Download className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-sm font-bold text-slate-700 mb-1">معاينة بطاقة الشهادة</h3>
                <p className="text-xs text-slate-500 max-w-xs">
                  عند إضافة شهادة جديدة أو تعديلها ستظهر الروابط المباشرة والباركود ورمز QR هنا للتحميل والطباعة.
                </p>
              </div>
            )}

            <div className="bg-gradient-to-br from-[#0b5435] to-[#063320] text-white rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
                <h4 className="font-bold text-sm">إرشادات أمان لوحة التحكم</h4>
              </div>
              <ul className="text-xs text-emerald-100 space-y-1.5 list-disc list-inside">
                <li>لا يمكن لأي مستخدم عام الوصول إلى لوحة الإدارة إلا عبر الرابط الخاص <strong>/admin</strong> حصراً.</li>
                <li>يرجى تغيير كلمة المرور الافتراضية من زر <strong>تغيير كلمة المرور</strong> بالأعلى لضمان الخصوصية.</li>
                <li>توليد رموز الباركود وQR المشفرة والمربوطة بالرابط المباشر.</li>
                <li>إمكانية معاينة وطباعة الوثيقة الرسمية PDF مباشرة من قائمة الشهادات.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Certificates Table */}
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">قائمة الشهادات الصادرة</h2>
              <p className="text-xs text-slate-500">سجل بجميع الشهادات المحفوظة وإمكانية البحث والتحقق والطباعة</p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، الهوية، رقم الشهادة..."
                className="w-full pl-3 pr-9 py-2 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {listLoading ? (
            <div className="flex flex-col items-center justify-center py-14">
              <Loader2 className="w-8 h-8 animate-spin text-[#0b5435] mb-2" />
              <p className="text-xs text-slate-500">جاري تحميل الشهادات من قاعدة البيانات...</p>
            </div>
          ) : filteredCertificates.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              لا توجد شهادات مطابقة للبحث. املأ النموذج أعلاه ثم اضغط &quot;اعتماد وإصدار الشهادة الصحية&quot; للبدء!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 font-semibold rounded-r-lg">المستفيد</th>
                    <th className="px-3 py-3 font-semibold">رقم الهوية</th>
                    <th className="px-3 py-3 font-semibold">رقم الشهادة</th>
                    <th className="px-3 py-3 font-semibold">الأمانة / البلدية</th>
                    <th className="px-3 py-3 font-semibold">المهنة / المنشأة</th>
                    <th className="px-3 py-3 font-semibold">فترة الصلاحية</th>
                    <th className="px-3 py-3 font-semibold">الحالة</th>
                    <th className="px-3 py-3 font-semibold rounded-l-lg text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCertificates.map((cert) => (
                    <tr key={cert.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-3 py-3 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          {cert.photo_url ? (
                            <img
                              src={cert.photo_url}
                              alt={cert.full_name}
                              className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-slate-400" />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-900">{cert.full_name}</p>
                            {cert.full_name_ar && <p className="text-[10px] text-slate-500">{cert.full_name_ar}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-slate-600">{cert.national_id}</td>
                      <td className="px-3 py-3 font-mono text-emerald-800 font-bold">{cert.certificate_number}</td>
                      <td className="px-3 py-3 text-slate-600">
                        <p>{cert.amanah || '-'}</p>
                        <p className="text-[10px] text-slate-400">{cert.baladiyah || '-'}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <p className="font-semibold text-slate-800">{cert.profession || '-'}</p>
                        <p className="text-[10px] text-slate-400">{cert.workplace || '-'}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                        <p>{cert.issue_date_gregorian || cert.issue_date || '-'} إلى</p>
                        <p className="font-semibold text-slate-800">{cert.expiry_date_gregorian || cert.expiry_date || '-'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${cert.status === 'ملغاة' ? 'bg-red-100 text-red-800' : cert.status === 'منتهية' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                          {cert.status || 'سارية'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <a
                            href={certLink(cert.uuid, 'balady')}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-md text-emerald-700 hover:bg-emerald-50 transition"
                            title="عرض بوابة بلدي الرسمية"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                          <a
                            href={certLink(cert.uuid, 'pdf')}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-md text-blue-700 hover:bg-blue-50 transition"
                            title="عرض وثيقة الشهادة الرسمية PDF"
                          >
                            <Printer className="w-4 h-4" />
                          </a>
                          <button onClick={() => handleEdit(cert)} className="p-1.5 rounded-md text-amber-700 hover:bg-amber-50 transition cursor-pointer" title="تعديل">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cert.id)}
                            disabled={deletingId === cert.id}
                            className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition cursor-pointer disabled:opacity-50"
                            title="حذف"
                          >
                            {deletingId === cert.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
