import supabase from './db-client.js';

function getPublicUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('data:')) return path;
  if (path.startsWith('/')) return path;
  try {
    const { data } = supabase.storage.from('certificate-photos').getPublicUrl(path);
    return data?.publicUrl || path;
  } catch {
    return path;
  }
}

function makeUuid() {
  const hex = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0').toUpperCase();
  return hex() + hex();
}

const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;

function isValidDateStr(v) {
  if (!v || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('/').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1300 || y > 2100) return false;
  return true;
}

function validatePayload(body, isUpdate = false) {
  const errors = {};
  const required = ['full_name', 'national_id', 'certificate_number'];
  for (const f of required) {
    if (!isUpdate || body[f] !== undefined) {
      const v = String(body[f] ?? '').trim();
      if (!v) errors[f] = 'هذا الحقل مطلوب';
    }
  }
  if (body.full_name !== undefined && String(body.full_name).trim().length < 3) {
    errors.full_name = 'الاسم الكامل يجب أن يكون 3 أحرف على الأقل';
  }
  if (body.national_id !== undefined && !/^\d{9,12}$/.test(String(body.national_id).trim())) {
    errors.national_id = 'رقم الهوية يجب أن يتكون من 9 إلى 12 رقماً';
  }
  if (body.certificate_number !== undefined && !/^\d{6,20}$/.test(String(body.certificate_number).trim())) {
    errors.certificate_number = 'رقم الشهادة يجب أن يتكون من 6 إلى 20 رقماً';
  }
  for (const f of ['issue_date_gregorian', 'issue_date_hijri', 'expiry_date_gregorian', 'expiry_date_hijri', 'program_expiry_date']) {
    if (body[f] !== undefined && body[f] !== null && String(body[f]).trim() !== '' && !isValidDateStr(String(body[f]).trim())) {
      errors[f] = 'صيغة التاريخ غير صحيحة (YYYY/MM/DD)';
    }
  }
  return errors;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { id, uuid, certificate_number } = req.query;

      if (id || uuid || certificate_number) {
        let query = supabase.from('certificates').select('*');
        if (id) {
          if (/^\d+$/.test(String(id))) {
            query = query.eq('id', parseInt(String(id), 10));
          } else {
            query = query.or(`uuid.eq.${id},certificate_number.eq.${id}`);
          }
        } else if (uuid) {
          query = query.or(`uuid.eq.${uuid},certificate_number.eq.${uuid}`);
        } else if (certificate_number) {
          query = query.eq('certificate_number', certificate_number);
        }

        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'الشهادة المطلوبة غير موجودة' });

        return res.status(200).json({
          ...data,
          photo_url: getPublicUrl(data.photo_url),
        });
      }

      const { data, error } = await supabase
        .from('certificates')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      return res.status(200).json(
        (data || []).map((c) => ({
          ...c,
          photo_url: getPublicUrl(c.photo_url),
        }))
      );
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      const errors = validatePayload(body);
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: 'تحقق من المدخلات', fieldErrors: errors });
      }

      const {
        full_name,
        full_name_ar,
        national_id,
        nationality,
        gender,
        profession,
        workplace,
        certificate_number,
        amanah,
        baladiyah,
        issue_date_gregorian,
        issue_date_hijri,
        expiry_date_gregorian,
        expiry_date_hijri,
        issue_date,
        expiry_date,
        program_name,
        program_expiry_date,
        license_number,
        facility_number,
        photo_url,
        barcode_value,
        uuid,
        status,
      } = body;

      const { data: existing } = await supabase
        .from('certificates')
        .select('id')
        .eq('certificate_number', String(certificate_number).trim())
        .maybeSingle();
      if (existing) {
        return res.status(409).json({
          error: 'رقم الشهادة مستخدم مسبقاً لشهادة أخرى',
          fieldErrors: { certificate_number: 'رقم الشهادة مستخدم مسبقاً' },
        });
      }

      const newUuid = uuid || makeUuid();
      const { data, error } = await supabase
        .from('certificates')
        .insert({
          full_name: String(full_name).trim(),
          full_name_ar: String(full_name_ar || full_name).trim(),
          national_id: String(national_id).trim(),
          nationality: nationality || '',
          gender: gender || '',
          profession: profession || '',
          workplace: workplace || '',
          certificate_number: String(certificate_number).trim(),
          amanah: amanah || '',
          baladiyah: baladiyah || '',
          issue_date_gregorian: issue_date_gregorian || issue_date || '',
          issue_date_hijri: issue_date_hijri || '',
          expiry_date_gregorian: expiry_date_gregorian || expiry_date || '',
          expiry_date_hijri: expiry_date_hijri || '',
          issue_date: issue_date || issue_date_gregorian || '',
          expiry_date: expiry_date || expiry_date_gregorian || '',
          program_name: program_name || '',
          program_expiry_date: program_expiry_date || '',
          license_number: license_number || '',
          facility_number: facility_number || '',
          photo_url: photo_url || '',
          // The barcode encodes the ENCRYPTED uuid so scanning it opens the
          // preview page (never the raw numeric id / certificate number).
          barcode_value: barcode_value || newUuid,
          uuid: newUuid,
          status: status || 'سارية',
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({
        ...data,
        photo_url: getPublicUrl(data.photo_url),
      });
    }

    if (req.method === 'PUT') {
      const { id, created_at, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'معرّف الشهادة id مطلوب' });

      const errors = validatePayload(rest, true);
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: 'تحقق من المدخلات', fieldErrors: errors });
      }

      if (rest.certificate_number) {
        const { data: existing } = await supabase
          .from('certificates')
          .select('id')
          .eq('certificate_number', String(rest.certificate_number).trim())
          .neq('id', id)
          .maybeSingle();
        if (existing) {
          return res.status(409).json({
            error: 'رقم الشهادة مستخدم مسبقاً لشهادة أخرى',
            fieldErrors: { certificate_number: 'رقم الشهادة مستخدم مسبقاً' },
          });
        }
      }

      const clean = { ...rest };
      for (const k of ['full_name', 'full_name_ar', 'national_id', 'certificate_number', 'barcode_value']) {
        if (clean[k] !== undefined && clean[k] !== null) clean[k] = String(clean[k]).trim();
      }
      if (clean.barcode_value === undefined && rest.uuid) {
        clean.barcode_value = rest.uuid;
      }

      const { data, error } = await supabase
        .from('certificates')
        .update(clean)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({
        ...data,
        photo_url: getPublicUrl(data.photo_url),
      });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'معرّف الشهادة id مطلوب للحذف' });

      const { error } = await supabase.from('certificates').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'طريقة الطلب غير مسموح بها' });
  } catch (err) {
    console.error('Certificates API error:', err);
    res.status(500).json({ error: err.message || 'خطأ داخلي في الخادم' });
  }
}
