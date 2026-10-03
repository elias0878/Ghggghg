import supabase from './db-client.js';

const MAX_BYTES = 5 * 1024 * 1024; // matches bucket file_size_limit

// Accept ANY image type (jpeg, png, webp, gif, bmp, tiff, svg, avif, heic, ico, ...).
// Never reject a real photo because of an exotic MIME/extension.
function looksLikeImage(contentType, fileName) {
  if (typeof contentType === 'string' && contentType.toLowerCase().startsWith('image/')) return true;
  if (typeof fileName === 'string' && /\.(jpe?g|png|gif|webp|bmp|tiff?|tif|svg|avif|heic|heif|ico|jfif|dng)$/i.test(fileName)) return true;
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Vercel parses JSON automatically; the raw-file branch sends bytes with a
    // filename in the query string instead.
    const q = req.query || {};
    let buffer = null;
    let fileName = q.fileName || q.name || '';
    let contentType = q.contentType || req.headers['x-file-type'] || req.headers['content-type'] || '';

    if (req.body && typeof req.body === 'object' && !(req.body instanceof Buffer) && (req.body.fileBase64 || req.body.data)) {
      // --- Branch A: legacy JSON base64 (kept for compatibility) ---
      const fileBase64 = req.body.fileBase64 || req.body.data || '';
      fileName = req.body.fileName || fileName || 'photo.jpg';
      contentType = req.body.contentType || contentType || 'image/jpeg';
      if (!fileBase64) return res.status(400).json({ error: 'بيانات الصورة مفقودة' });
      try {
        buffer = Buffer.from(String(fileBase64).includes(',') ? String(fileBase64).split(',').pop() : String(fileBase64), 'base64');
      } catch {
        return res.status(400).json({ error: 'بيانات الصورة غير صالحة' });
      }
    } else if (req.body && (Buffer.isBuffer(req.body) || req.body instanceof Uint8Array)) {
      // --- Branch B: raw bytes body (no JSON wrapper) ---
      buffer = Buffer.from(req.body);
    } else if (typeof req.body === 'string' && req.body.length > 0 && !/^\s*\{/.test(req.body)) {
      // Raw base64 string body
      try {
        buffer = Buffer.from(req.body, 'base64');
      } catch {
        return res.status(400).json({ error: 'بيانات الصورة غير صالحة' });
      }
    } else {
      // --- Branch C: stream the raw request body ourselves (multipart or octet) ---
      const chunks = [];
      try {
        for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      } catch {
        return res.status(400).json({ error: 'تعذر قراءة ملف الصورة' });
      }
      const raw = Buffer.concat(chunks);
      if (!raw.length) return res.status(400).json({ error: 'تعذر قراءة ملف الصورة — الملف فارغ' });
      const ctype = String(req.headers['content-type'] || '');
      const m = ctype.match(/multipart\/form-data;\s*boundary=(.+)/i);
      if (m) {
        // Minimal multipart parser: extract the first file part
        const boundary = '--' + m[1].trim();
        const text = raw.toString('latin1');
        const parts = text.split(boundary);
        let found = null;
        for (const part of parts) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;
          const header = part.slice(0, headerEnd);
          const fn = (header.match(/filename="([^"]*)"/i) || [])[1] || '';
          const pt = (header.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || '';
          let body = part.slice(headerEnd + 4);
          if (body.endsWith('\r\n')) body = body.slice(0, -2);
          if (fn || /name="file"/i.test(header)) {
            found = { data: Buffer.from(body, 'latin1'), fileName: fn, contentType: pt.trim() };
            break;
          }
        }
        if (!found) return res.status(400).json({ error: 'تعذر قراءة ملف الصورة من النموذج' });
        buffer = found.data;
        if (found.fileName) fileName = found.fileName;
        if (found.contentType) contentType = found.contentType;
      } else {
        buffer = raw;
      }
    }

    if (!buffer || !buffer.length) {
      return res.status(400).json({ error: 'تعذر قراءة ملف الصورة' });
    }
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'حجم الصورة كبير جداً. يرجى اختيار صورة أصغر (بحد أقصى 5 ميجابايت)' });
    }
    if (fileName && !looksLikeImage(contentType, fileName)) {
      return res.status(400).json({ error: 'يرجى اختيار ملف صورة صالح' });
    }

    const safeContentType = typeof contentType === 'string' && contentType && !contentType.includes('multipart')
      ? contentType.split(';')[0].trim()
      : 'image/jpeg';
    const safeName = String(fileName || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'photo';
    const ext = /\.(jpe?g|png|gif|webp|bmp|tiff?|svg|avif|heic|heif|ico)$/i.test(safeName) ? '' : '.jpg';
    const uniqueName = `photos/${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${safeName}${ext}`;

    const { data, error } = await supabase.storage
      .from('certificate-photos')
      .upload(uniqueName, buffer, { contentType: safeContentType, upsert: true });

    if (error) {
      console.error('Storage upload error:', error);
      const msg = /bucket|not found/i.test(error.message || '')
        ? 'مخزن الصور غير مهيأ بعد. يرجى إنشاء bucket باسم certificate-photos ثم إعادة المحاولة'
        : `فشل رفع الصورة: ${error.message}`;
      return res.status(500).json({ error: msg });
    }
    if (!data?.path) {
      console.error('Storage upload returned no path');
      return res.status(500).json({ error: 'فشل رفع الصورة: لم يرجع المخزن مسار الملف' });
    }

    const { data: urlData } = supabase.storage.from('certificate-photos').getPublicUrl(data.path);
    if (!urlData?.publicUrl) {
      console.error('Storage getPublicUrl returned empty for path:', data.path);
      return res.status(500).json({ error: 'فشل إنشاء رابط الصورة' });
    }

    return res.status(200).json({ path: data.path, url: urlData.publicUrl });
  } catch (err) {
    console.error('Upload API error:', err);
    res.status(500).json({ error: err.message || 'خطأ داخلي أثناء رفع الصورة' });
  }
}
