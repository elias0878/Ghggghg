import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, AlertCircle, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Certificate } from '../types/certificate';

/** Escape a value so it can be safely injected into an HTML attribute (value="..."). */
function escapeAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const currentView = searchParams.get('view') === 'pdf' ? 'pdf' : 'balady';

  const [cert, setCert] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [baladyHtml, setBaladyHtml] = useState<string>('');
  const [templateError, setTemplateError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    document.title = 'شهادة صحية للأنشطة التجارية — منصة بلدي';
  }, []);

  useEffect(() => {
    const fetchCert = async () => {
      try {
        setLoading(true);
        setError('');
        const queryId = id || searchParams.get('uuid') || searchParams.get('id') || '';
        if (!queryId) throw new Error('لم يتم تحديد الشهادة المطلوبة');

        let data: Certificate | null = null;

        // Try the API route first (works on Vercel deployments with functions).
        // On ANY non-OK status (404-no-row, 404-missing-route on mirrors, 500…)
        // fall through to the direct Supabase query — never abort early, so a
        // stale route can never surface as a false "not found".
        try {
          const res = await fetch(`/api/certificates?id=${encodeURIComponent(queryId)}`);
          if (res.ok) {
            data = (await res.json()) as Certificate;
          } else {
            console.warn(`API route returned ${res.status}, using Supabase fallback`);
          }
        } catch (apiErr) {
          console.warn('API route fetch error, using Supabase fallback:', apiErr);
        }

        // 2. Direct Supabase fallback (numeric id OR uuid OR certificate number)
        if (!data) {
          let query = supabase.from('certificates').select('*');
          if (/^\d+$/.test(queryId)) {
            query = query.eq('id', parseInt(queryId, 10));
          } else {
            query = query.or(`uuid.eq.${queryId},certificate_number.eq.${queryId}`);
          }
          const { data: dbData, error: dbErr } = await query.maybeSingle();
          if (!dbErr && dbData) data = dbData as Certificate;
        }

        if (!data) throw new Error('لم يتم العثور على الشهادة المطلوبة');
        setCert(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'خطأ في الاتصال بالخادم');
      } finally {
        setLoading(false);
      }
    };
    fetchCert();
  }, [id, searchParams]);

  // When cert data is ready, prepare the authentic balady HTML template
  useEffect(() => {
    if (!cert) return;

    const prepareBaladyHtml = async () => {
      try {
        setTemplateError('');
        const res = await fetch('/templates/balady-source.html');
        if (!res.ok) throw new Error(`تعذر تحميل القالب الرسمي (رمز ${res.status})`);
        let html = await res.text();
        if (!html || html.length < 1000) throw new Error('القالب الرسمي غير مكتمل');

        // Replace certificate fields with dynamic values.
        // CRITICAL: only ever replace the single official-card occurrence of each
        // value (first occurrence). The real Balady page contains duplicated
        // markup (mobile/desktop copies etc.), and replacing ALL occurrences plus
        // a second "clear leftovers" pass corrupted the layout — that is what
        // produced the broken/"page doesn't exist" rendering. First-occurrence
        // replacement keeps the original Balady page 100% intact.
        const val = (oldValue: string, newValue: string | undefined) => {
          html = html.replace(`value="${oldValue}"`, `value="${escapeAttr(newValue || '')}"`);
        };
        val('أمانة المنطقة الشرقية', cert.amanah);
        val('بلدية شرق الدمام', cert.baladiyah);
        val('MUHAMMAD SAMI ALLAH DITTA', cert.full_name);
        val('2517075228', cert.national_id);
        val('ذكر', cert.gender);
        val('باكستان', cert.nationality);
        val('470822641868', cert.certificate_number);
        val('عامل مطبخ', cert.profession);
        val('2026/02/09', cert.issue_date_gregorian || cert.issue_date);
        val('1447/08/21', cert.issue_date_hijri);
        val('2027/01/29', cert.expiry_date_gregorian || cert.expiry_date);
        val('1448/08/21', cert.expiry_date_hijri);
        val('1449/07/18', cert.program_expiry_date);
        val('منشآت الغذاء', cert.program_name);
        // NOTE: the facility name input has trailing spaces in the original template.
        // Match it flexibly (any trailing whitespace) — but replace ONLY the first
        // (official card) occurrence so page duplicates stay untouched.
        html = html.replace(
          /value="شركة شباب الخليج المميز\s*"/,
          `value="${escapeAttr(cert.workplace || '')}"`
        );
        val('41062972936', cert.license_number);
        val('7016681426', cert.facility_number);

        // Replace beneficiary photo only when the certificate has one;
        // otherwise swap in a neutral inline avatar so the template's ORIGINAL
        // embedded photo (a base64 stranger's face) is NEVER displayed
        const NEUTRAL_AVATAR =
          'data:image/svg+xml;utf8,' +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#eef2f3"/><circle cx="100" cy="78" r="36" fill="#9fb3b7"/><path d="M40 170c10-38 34-56 60-56s50 18 60 56" fill="#9fb3b7"/></svg>`
          );
        const photoSrc = escapeAttr(cert.photo_url || NEUTRAL_AVATAR);
        const photoRegex = /(<img width="200" height="200" class="m-3" style="margin:20px" src=")[^"]*(")/;
        if (photoRegex.test(html)) {
          html = html.replace(photoRegex, `$1${photoSrc}$2`);
        }

        // Inject a tiny compatibility shim so the captured Balady page renders
        // EXACTLY like the official site inside our iframe preview:
        //  1) define `dontHide` (the page's inline script assigns to it without
        //     declaring it — fatal under strict CSP/sandbox otherwise),
        //  2) stub the two missing library files (startup.js query-string file +
        //     jquery.validate) so nothing throws and the preloader always hides,
        //  3) force-hide the preloader overlay once loading completes.
        const shim = `
          <script>
            window.dontHide = false;
            window.addEventListener('load', function () {
              setTimeout(function () {
                try {
                  var p = document.getElementById('preloader-logo');
                  if (p) { p.style.display = 'none'; }
                  document.body.classList.add('loaded');
                } catch (e) {}
              }, 1500);
            });
            setTimeout(function () {
              try {
                var p2 = document.getElementById('preloader-logo');
                if (p2) { p2.style.display = 'none'; }
                document.body.classList.add('loaded');
              } catch (e) {}
            }, 4000);
          </script>
        `;
        if (html.includes('</body>')) {
          html = html.replace('</body>', shim + '</body>');
        } else {
          html = html + shim;
        }

        setBaladyHtml(html);
      } catch (err) {
        console.error('Failed to prepare balady HTML:', err);
        setTemplateError(err instanceof Error ? err.message : 'تعذر تحميل القالب الرسمي');
      }
    };

    prepareBaladyHtml();
  }, [cert]);

  // The QR / barcode / share link always points at the PREVIEW (balady) page
  // keyed by the encrypted uuid — never at the print/PDF view and never by id.
  // Hash-routed so the link resolves on any host without a platform 404.
  const publicLink =
    typeof window !== 'undefined' && cert?.uuid
      ? `${window.location.origin}${window.location.pathname}#/certificate/${cert.uuid}?view=balady`
      : typeof window !== 'undefined'
        ? window.location.href.split('#')[0]
        : '';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f3f6f4] flex flex-col items-center justify-center gap-3" dir="rtl">
        <Loader2 className="w-10 h-10 animate-spin text-[#075030]" />
        <p className="text-sm font-medium text-slate-600">جاري التحقق واسترجاع رخصة الشهادة الصحية من منصة بلدي...</p>
      </div>
    );
  }

  if (error || !cert) {
    return (
      <div className="min-h-screen bg-[#f3f6f4] flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center max-w-md w-full space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-800">الشهادة غير موجودة</h2>
          <p className="text-sm text-slate-600">{error || 'لم يتم العثور على وثيقة الشهادة الصحية المطلوبة.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#111] flex flex-col" dir="rtl">
      {/* Main View: Pure Balady Official Portal or Tuned PDF Document without any external header */}
      {currentView === 'balady' ? (
        /* ================= EXACT OFFICIAL BALADY PORTAL VIEW ================= */
        <div className="w-full min-h-screen flex flex-col">
          {baladyHtml ? (
            <iframe
              ref={iframeRef}
              srcDoc={baladyHtml}
              title="شهادة صحية للأنشطة التجارية - منصة بلدي"
              className="w-full flex-1 border-0 min-h-screen"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : templateError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 px-4">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <p className="text-sm font-bold text-slate-700">تعذر عرض القالب الرسمي لمنصة بلدي</p>
              <p className="text-xs text-slate-500">{templateError}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#075030]" />
              <p className="text-sm text-slate-500">جاري عرض القالب الرسمي لمنصة بلدي...</p>
            </div>
          )}
        </div>
      ) : (
        /* ================= EXACT 2-PAGE PRINTABLE PDF CERTIFICATE ================= */
        <CertificatePdfView cert={cert} publicLink={publicLink} />
      )}
    </div>
  );
}

/* =====================================================================
   Exact 2-page printable PDF certificate (kept from previous design)
   ===================================================================== */
function CertificatePdfView({ cert, publicLink }: { cert: Certificate; publicLink: string }) {
  const stackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function scalePages() {
      if (!stackRef.current) return;
      const hosts = stackRef.current.querySelectorAll<HTMLElement>('.pdf-page-host');
      hosts.forEach((host) => {
        const canvas = host.querySelector<HTMLElement>('.pdf-canvas');
        const baseW = Number(host.dataset.baseW);
        const baseH = Number(host.dataset.baseH);
        const hostWidth = host.clientWidth;
        if (!canvas || !baseW || !baseH || !hostWidth) return;
        const scale = hostWidth / baseW;
        host.style.height = `${baseH * scale}px`;
        canvas.style.transform = `scale(${scale})`;
      });
    }

    scalePages();
    window.addEventListener('resize', scalePages);
    return () => window.removeEventListener('resize', scalePages);
  }, []);

  return (
    <div className="pdf-screen-wrap w-full min-h-screen bg-[#e9edf0] py-6 px-3 flex flex-col items-center">
      <div className="print:hidden mb-4 flex items-center gap-3">
        <button
          onClick={() => window.print()}
          className="bg-[#0e7270] hover:bg-[#0a5857] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition flex items-center gap-2 cursor-pointer"
        >
          <Printer className="w-4 h-4" /> طباعة الوثيقة الرسمية / حفظ PDF
        </button>
      </div>

      <style>{`
        .pdf-stack {
          max-width: 1012px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
          align-items: center;
          width: 100%;
        }
        .pdf-page-host {
          position: relative;
          width: 100%;
          max-width: var(--base-w-px);
          aspect-ratio: var(--base-w) / var(--base-h);
        }
        .pdf-canvas {
          position: absolute;
          inset: 0 auto auto 0;
          width: var(--base-w-px);
          height: var(--base-h-px);
          transform-origin: top left;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0,0,0,.12);
          background: white;
          direction: ltr;
        }
        .pdf-page1 {
          --base-w: 1012;
          --base-h: 638;
          --base-w-px: 1012px;
          --base-h-px: 638px;
          background: linear-gradient(180deg, #f7f9fa 0%, #eff3f4 100%);
        }
        .pdf-page2 {
          --base-w: 1011;
          --base-h: 639;
          --base-w-px: 1011px;
          --base-h-px: 639px;
          background: #4a8483;
          color: white;
        }
        .pdf-art {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .pdf-abs { position: absolute; }
        .pdf-rtl { direction: rtl; unicode-bidi: isolate; }
        .pdf-ltr { direction: ltr; unicode-bidi: isolate; }

        .pdf-p1-titlebar { left: 0; top: 17px; width: 524px; height: 105px; background: #0e7270; }
        .pdf-p1-title {
          left: 26px; top: 36px; width: 468px;
          font-size: 48px; line-height: 1; color: #fff;
          font-weight: 700; text-align: right;
          font-family: 'NotoKufi', sans-serif;
        }
        .pdf-p1-balady-logo { left: 792px; top: 14px; width: 100px; height: 107px; }
        .pdf-p1-ministry-logo { left: 889px; top: 14px; width: 116px; height: 107px; }
        .pdf-p1-aseer-logo { left: 676px; top: 20px; width: 160px; height: 110px; object-fit: contain; }

        .pdf-p1-photo-frame, .pdf-p1-qr-frame {
          border: 1.5px solid #98c96b;
          background: rgba(255,255,255,.2);
        }
        .pdf-p1-photo-frame { left: 20px; top: 135px; width: 206px; height: 202px; }
        .pdf-p1-qr-frame { left: 20px; top: 360px; width: 206px; height: 202px; }
        .pdf-p1-photo { left: 22px; top: 137px; width: 202px; height: 198px; object-fit: cover; }
        .pdf-p1-qr { left: 22px; top: 362px; width: 202px; height: 198px; background: #fff; }

        .pdf-p1-name {
          left: 352px; top: 166px; width: 642px;
          color: #157d7b;
          font-family: 'PdfLiberationSerif', 'Times New Roman', serif;
          font-size: 27px; line-height: 1; text-align: center;
          font-weight: 500; letter-spacing: 0.5px; white-space: nowrap;
        }

        .pdf-p1-box { position: absolute; width: 355px; height: 42px; background: #fff; border-radius: 4px; }
        .pdf-p1-label {
          position: absolute; font-size: 15px; color: #111; line-height: 1;
          text-align: right; font-weight: 600; white-space: nowrap;
          font-family: 'NotoKufi', sans-serif;
        }
        .pdf-p1-value-num, .pdf-p1-value-ar {
          position: absolute; width: 355px; height: 42px;
          line-height: 42px; font-size: 18px; color: #000;
          white-space: nowrap; padding: 0 14px; text-align: right;
        }
        .pdf-p1-value-num { font-family: 'PdfArial', Arial, sans-serif; }
        .pdf-p1-value-ar { font-family: 'NotoKufi', sans-serif; }

        .pdf-p1-l1 { left: 251px; top: 228px; width: 355px; }
        .pdf-p1-r1 { left: 638px; top: 228px; width: 355px; }
        .pdf-p1-l2 { left: 251px; top: 319px; width: 355px; }
        .pdf-p1-r2 { left: 638px; top: 319px; width: 355px; }
        .pdf-p1-l3 { left: 251px; top: 406px; width: 355px; }
        .pdf-p1-r3 { left: 638px; top: 406px; width: 355px; }
        .pdf-p1-l4 { left: 251px; top: 492px; width: 355px; }
        .pdf-p1-r4 { left: 638px; top: 492px; width: 355px; }

        .pdf-b-l1 { left: 251px; top: 255px; }
        .pdf-b-r1 { left: 638px; top: 255px; }
        .pdf-b-l2 { left: 251px; top: 346px; }
        .pdf-b-r2 { left: 638px; top: 346px; }
        .pdf-b-l3 { left: 251px; top: 433px; }
        .pdf-b-r3 { left: 638px; top: 433px; }
        .pdf-b-l4 { left: 251px; top: 519px; }
        .pdf-b-r4 { left: 638px; top: 519px; }

        .pdf-v-country { left: 251px; top: 255px; }
        .pdf-v-id { left: 638px; top: 255px; }
        .pdf-v-job { left: 251px; top: 346px; }
        .pdf-v-cert { left: 638px; top: 346px; }
        .pdf-v-exp { left: 251px; top: 433px; }
        .pdf-v-issue { left: 638px; top: 433px; }
        .pdf-v-course { left: 251px; top: 519px; }
        .pdf-v-type { left: 638px; top: 519px; }

        .pdf-p1-footer-phone { left: 20px; top: 575px; width: 273px; height: 56px; }
        .pdf-p1-footer-balady { left: 297px; top: 575px; width: 234px; height: 56px; }
        .pdf-p1-footer-social { left: 535px; top: 575px; width: 240px; height: 56px; }
        .pdf-p1-footer-web { left: 779px; top: 575px; width: 207px; height: 56px; }

        .pdf-p2-title {
          left: 44px; top: 32px; font-size: 54px; line-height: 1;
          color: #fff; font-weight: 400; white-space: nowrap;
          font-family: 'NotoKufi', sans-serif;
        }
        .pdf-p2-palm { left: 515px; top: 0; width: 127px; height: 109px; }
        .pdf-p2-ministry-text { left: 650px; top: 12px; width: 209px; height: 106px; }
        .pdf-p2-ministry-mark { left: 858px; top: 10px; width: 144px; height: 108px; }

        .pdf-p2-star { position: absolute; width: 44px; height: 44px; }
        .pdf-p2-text {
          position: absolute; text-align: right; color: #fff;
          font-size: 25px; line-height: 1.52; font-weight: 400;
          white-space: pre-line; font-family: 'NotoKufi', sans-serif;
        }
        .pdf-p2-t1 { left: 54px; top: 184px; width: 810px; }
        .pdf-p2-s1 { left: 899px; top: 188px; }
        .pdf-p2-t2 { left: 54px; top: 256px; width: 810px; }
        .pdf-p2-s2 { left: 899px; top: 266px; }
        .pdf-p2-t3 { left: 54px; top: 376px; width: 810px; }
        .pdf-p2-s3 { left: 899px; top: 386px; }
        .pdf-p2-t4 { left: 54px; top: 510px; width: 810px; }
        .pdf-p2-s4 { left: 899px; top: 516px; }

        @media print {
          /* PDF فقط: وجهان في صفحة A4 عمودية واحدة — البطاقة الأولى للمنتصف والثانية تكمل الصفحة */
          @page { size: A4 portrait; margin: 0; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .pdf-screen-wrap { padding: 0 !important; background: #fff !important; min-height: 0 !important; display: block !important; }
          .pdf-stack {
            max-width: none !important;
            width: 794px !important;
            display: block !important;
            margin: 0 !important;
            padding: 64px 0 0 !important;
            gap: 0 !important;
          }
          .pdf-page-host {
            max-width: none !important;
            width: 740px !important;
            aspect-ratio: auto !important;
            margin: 0 auto !important;
            overflow: hidden !important;
            page-break-inside: avoid !important; break-inside: avoid !important;
            page-break-after: avoid !important; break-after: avoid !important;
          }
          /* ارتفاع كل بطاقة بعد التصغير (740/1012 و 740/1011) مع سماح بكسل إضافي */
          .pdf-page-host[data-base-w="1012"] { height: 468px !important; }
          .pdf-page-host[data-base-w="1011"] { height: 469px !important; margin-top: 26px !important; }
          .pdf-canvas {
            transform-origin: top left !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* نفس تكبير الشاشة يُلغى هنا: نكبّر من اللوحة الأصلية إلى عرض 740px بالضبط */
          .pdf-page-host[data-base-w="1012"] .pdf-canvas { transform: scale(0.73123) !important; }
          .pdf-page-host[data-base-w="1011"] .pdf-canvas { transform: scale(0.73195) !important; }
        }
      `}</style>

      <div ref={stackRef} className="pdf-stack">
        {/* PAGE 1 */}
        <section
          className="pdf-page-host"
          data-base-w="1012"
          data-base-h="638"
          style={{ '--base-w': '1012', '--base-h': '638', '--base-w-px': '1012px', '--base-h-px': '638px' } as React.CSSProperties}
        >
          <div className="pdf-canvas pdf-page1">
            <svg className="pdf-art" viewBox="0 0 1012 638" aria-hidden="true">
              <defs>
                <linearGradient id="p1bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#f7f9fa" />
                  <stop offset="100%" stopColor="#eef2f3" />
                </linearGradient>
              </defs>
              <rect width="1012" height="638" fill="url(#p1bg)" />
              <g opacity="0.35">
                <path d="M420 0 L1012 0 L1012 570 C876 548 738 520 565 486 C462 466 338 442 0 420 L0 0 Z" fill="#f7f9fa" />
                <path d="M540 0 L1012 0 L1012 515 C872 496 730 471 550 433 C509 425 472 415 420 403 Z" fill="#eef2f3" />
              </g>
              <g opacity="0.18" fill="none" stroke="#c5d0d2" strokeWidth="2">
                <path d="M744 106 C807 68 867 70 916 109" />
                <path d="M703 214 C781 123 838 96 949 67" />
                <path d="M735 396 C779 285 832 226 936 170" />
                <path d="M719 318 C790 251 851 227 950 212" />
              </g>
              <path d="M36 631 H967 Q1005 631 1005 592 V563" fill="none" stroke="#1c7978" strokeWidth="2" />
            </svg>

            <div className="pdf-abs pdf-p1-titlebar"></div>
            <div className="pdf-abs pdf-p1-title pdf-rtl">شهادة صحية</div>

            <img className="pdf-abs pdf-p1-aseer-logo" src="/assets/p1_aseer_only.png" alt="" />
            <img className="pdf-abs pdf-p1-balady-logo" src="/assets/p1_balady_logo.png" alt="" />
            <img className="pdf-abs pdf-p1-ministry-logo" src="/assets/p1_ministry_logo.png" alt="" />

            <div className="pdf-abs pdf-p1-photo-frame"></div>
            <div className="pdf-abs pdf-p1-qr-frame"></div>

            {cert.photo_url ? (
              <img
                className="pdf-abs pdf-p1-photo"
                src={cert.photo_url}
                alt={cert.full_name}
              />
            ) : (
              <svg className="pdf-abs pdf-p1-photo" viewBox="0 0 202 198" aria-hidden="true">
                <rect width="202" height="198" fill="#eef2f3" />
                <circle cx="101" cy="76" r="34" fill="#9fb3b7" />
                <path d="M41 168c10-36 33-54 60-54s50 18 60 54" fill="#9fb3b7" />
              </svg>
            )}

            <div className="pdf-abs pdf-p1-qr flex items-center justify-center bg-white">
              <QRCodeSVG value={publicLink} size={190} />
            </div>

            <div className="pdf-abs pdf-p1-name pdf-ltr">
              {cert.full_name || ''}
            </div>

            <div className="pdf-p1-label pdf-p1-l1 pdf-rtl">الجنسية</div>
            <div className="pdf-p1-label pdf-p1-r1 pdf-rtl">رقم الهوية</div>
            <div className="pdf-p1-label pdf-p1-l2 pdf-rtl">المهنة</div>
            <div className="pdf-p1-label pdf-p1-r2 pdf-rtl">رقم الشهادة الصحية</div>
            <div className="pdf-p1-label pdf-p1-l3 pdf-rtl">تاريخ نهاية الشهادة الصحية</div>
            <div className="pdf-p1-label pdf-p1-r3 pdf-rtl">تاريخ إصدار الشهادة الصحية</div>
            <div className="pdf-p1-label pdf-p1-l4 pdf-rtl">تاريخ انتهاء البرنامج التثقيفي</div>
            <div className="pdf-p1-label pdf-p1-r4 pdf-rtl">نوع البرنامج التثقيفي</div>

            <div className="pdf-p1-box pdf-b-l1"></div>
            <div className="pdf-p1-box pdf-b-r1"></div>
            <div className="pdf-p1-box pdf-b-l2"></div>
            <div className="pdf-p1-box pdf-b-r2"></div>
            <div className="pdf-p1-box pdf-b-l3"></div>
            <div className="pdf-p1-box pdf-b-r3"></div>
            <div className="pdf-p1-box pdf-b-l4"></div>
            <div className="pdf-p1-box pdf-b-r4"></div>

            <div className="pdf-p1-value-ar pdf-v-country pdf-rtl">{cert.nationality || ''}</div>
            <div className="pdf-p1-value-num pdf-v-id pdf-ltr">{cert.national_id}</div>
            <div className="pdf-p1-value-ar pdf-v-job pdf-rtl">{cert.profession || ''}</div>
            <div className="pdf-p1-value-num pdf-v-cert pdf-ltr">{cert.certificate_number}</div>
            <div className="pdf-p1-value-num pdf-v-exp pdf-ltr">
              {cert.expiry_date_hijri || cert.expiry_date || ''}
            </div>
            <div className="pdf-p1-value-num pdf-v-issue pdf-ltr">
              {cert.issue_date_hijri || cert.issue_date || ''}
            </div>
            <div className="pdf-p1-value-num pdf-v-course pdf-ltr">
              {cert.program_expiry_date || ''}
            </div>
            <div className="pdf-p1-value-ar pdf-v-type pdf-rtl">{cert.program_name || ''}</div>

            <img className="pdf-abs pdf-p1-footer-phone" src="/assets/p1_footer_phone.png" alt="" />
            <img className="pdf-abs pdf-p1-footer-balady" src="/assets/p1_footer_balady.png" alt="" />
            <img className="pdf-abs pdf-p1-footer-social" src="/assets/p1_footer_social.png" alt="" />
            <img className="pdf-abs pdf-p1-footer-web" src="/assets/p1_footer_web.png" alt="" />
          </div>
        </section>

        {/* PAGE 2 */}
        <section
          className="pdf-page-host"
          data-base-w="1011"
          data-base-h="639"
          style={{ '--base-w': '1011', '--base-h': '639', '--base-w-px': '1011px', '--base-h-px': '639px' } as React.CSSProperties}
        >
          <div className="pdf-canvas pdf-page2">
            <svg className="pdf-art" viewBox="0 0 1011 639" aria-hidden="true">
              <rect width="1011" height="639" fill="#4a8483" />
              <g opacity="0.16" fill="none" stroke="#b8cdcd" strokeWidth="2">
                <path d="M0 22 C97 125 151 236 193 497" />
                <path d="M0 309 C58 367 123 456 121 637" />
                <path d="M20 58 C69 104 156 124 235 220" />
                <path d="M19 243 C89 247 131 300 192 499" />
              </g>
            </svg>

            <div className="pdf-abs pdf-p2-title pdf-rtl">تعليمات وإرشادات</div>
            <img className="pdf-abs pdf-p2-palm" src="/assets/p2_palm_circle2.png" alt="" />
            <img className="pdf-abs pdf-p2-ministry-text" src="/assets/p2_ministry_text2.png" alt="" />
            <img className="pdf-abs pdf-p2-ministry-mark" src="/assets/p2_ministry_mark2.png" alt="" />

            <div className="pdf-p2-text pdf-p2-t1 pdf-rtl">شهادة صحية تجدد سنوياً.</div>
            <img className="pdf-p2-star pdf-p2-s1" src="/assets/p2_bullet2.png" alt="" />

            <div className="pdf-p2-text pdf-p2-t2 pdf-rtl">
              يسمح لحامل الشهادة الصحية بالعمل في منشآت الغذاء أو الصحة العامة وفق المهنة المسموح بها نظاماً.
            </div>
            <img className="pdf-p2-star pdf-p2-s2" src="/assets/p2_bullet2.png" alt="" />

            <div className="pdf-p2-text pdf-p2-t3 pdf-rtl">
              يلزم حامل هذه الشهادة بإجراء فحص طبي عند عودته من الخارج قبل البدء بممارسة العمل.
            </div>
            <img className="pdf-p2-star pdf-p2-s3" src="/assets/p2_bullet2.png" alt="" />

            <div className="pdf-p2-text pdf-p2-t4 pdf-rtl">لا تعتبر الشهادة إثبات هوية.</div>
            <img className="pdf-p2-star pdf-p2-s4" src="/assets/p2_bullet2.png" alt="" />
          </div>
        </section>
      </div>
    </div>
  );
}
