import { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import CertificatePage from './pages/CertificatePage';

const DEFAULT_CERT = 'D995B9BCBA5F48ADAA39DAD08CF2343E';

/**
 * Hash routing is used (instead of BrowserRouter) so that EVERY deep link —
 * /admin, /certificate/:uuid, /health/issue/PrintedLicenses — resolves to the
 * SPA on ANY host (Vercel, mirrors, static previews). With path routing, a
 * direct open/refresh of a deep link returns the platform "This page doesn't
 * exist / 404 NOT_FOUND" page whenever rewrites don't apply. Hash links like
 * /#/certificate/<uuid> always load index.html first, so this class of 404
 * becomes impossible.
 */
function LegacyDeepLinkRedirect() {
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    // Only act on a fresh page load that has NO hash route yet (i.e. someone
    // opened a previously-shared path-style link on a host serving index.html).
    if (window.location.hash && window.location.hash.length > 1) return;
    const path = window.location.pathname;
    const search = window.location.search;
    const m = path.match(/^\/certificate\/(.+)$/);
    if (m) {
      navigate(`/certificate/${decodeURIComponent(m[1])}${search}`, { replace: true });
    } else if (path.startsWith('/health/issue/PrintedLicenses')) {
      navigate(`/health/issue/PrintedLicenses${search}`, { replace: true });
    }
  }, [navigate]);
  return null;
}

function NotFound() {
  return (
    <div className="min-h-screen bg-[#f3f6f4] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center max-w-md w-full space-y-4">
        <h2 className="text-xl font-bold text-slate-800">الصفحة غير موجودة</h2>
        <p className="text-sm text-slate-600">الرابط الذي تحاول فتحه غير صحيح أو انتهت صلاحيته.</p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 bg-[#0b5435] hover:bg-[#084229] text-white text-xs font-bold py-2.5 px-4 rounded-xl transition"
          >
            لوحة الإدارة
          </Link>
          <Link
            to={`/certificate/${DEFAULT_CERT}`}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 px-4 rounded-xl transition"
          >
            عرض شهادة مرجعية
          </Link>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <LegacyDeepLinkRedirect />
      <Routes>
        {/* Public root directly shows the official certificate (encrypted uuid link) */}
        <Route path="/" element={<Navigate to={`/certificate/${DEFAULT_CERT}`} replace />} />
        {/* Admin panel is ONLY accessible directly via /admin */}
        <Route path="/admin" element={<AdminPage />} />
        {/* Certificate view (uuid-encrypted link) */}
        <Route path="/certificate/:id" element={<CertificatePage />} />
        {/* Official Balady path */}
        <Route path="/health/issue/PrintedLicenses" element={<CertificatePage />} />
        {/* Friendly in-app 404 (never a platform NOT_FOUND page) */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
