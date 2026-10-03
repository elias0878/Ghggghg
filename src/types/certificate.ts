export interface Certificate {
  id: number;
  uuid?: string;
  full_name: string;
  full_name_ar?: string;
  national_id: string;
  nationality?: string;
  gender?: string;
  profession: string;
  workplace: string;
  certificate_number: string;
  amanah?: string;
  baladiyah?: string;
  issue_date?: string;
  expiry_date?: string;
  issue_date_gregorian?: string;
  issue_date_hijri?: string;
  expiry_date_gregorian?: string;
  expiry_date_hijri?: string;
  program_name?: string;
  program_expiry_date?: string;
  license_number?: string;
  facility_number?: string;
  photo_url: string;
  barcode_value: string;
  status?: string;
  created_at?: string;
}
