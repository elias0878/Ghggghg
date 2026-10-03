import supabase from './db-client.js';

const BUCKET = 'certificate-photos';

/**
 * Sign an upload directly in the browser: the frontend requests a signed URL
 * for a unique path, then PUTs the raw file bytes straight to Supabase
 * Storage. This avoids the ~4.5MB Vercel serverless base64 payload ceiling
 * that caused "تعذر قراءة ملف الصورة" / failed uploads for larger photos.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileName, contentType } = req.body || {};
    if (!fileName) {
      return res.status(400).json({ error: 'fileName مطلوب' });
    }

    const ct = typeof contentType === 'string' && contentType ? contentType : 'image/jpeg';
    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'photo';
    const ext = /\.(jpe?g|png|gif|webp|bmp|tiff?|svg|avif|heic|heif|ico)$/i.test(safeName) ? '' : '.jpg';
    const uniqueName = `photos/${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${safeName}${ext}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(uniqueName, { upsert: true });

    if (error) {
      console.error('Signed upload URL error:', error);
      const msg = /bucket|not found/i.test(error.message || '')
        ? `مخزن الصور غير مهيأ بعد. يرجى إنشاء bucket باسم ${BUCKET} ثم إعادة المحاولة`
        : `فشل تجهيز الرفع: ${error.message}`;
      return res.status(500).json({ error: msg });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uniqueName);
    if (!urlData?.publicUrl) {
      return res.status(500).json({ error: 'فشل إنشاء رابط الصورة' });
    }

    return res.status(200).json({
      path: uniqueName,
      signedUrl: data.signedUrl,
      token: data.token,
      url: urlData.publicUrl,
      contentType: ct,
    });
  } catch (err) {
    console.error('Sign-upload API error:', err);
    res.status(500).json({ error: err.message || 'خطأ داخلي أثناء تجهيز الرفع' });
  }
}
