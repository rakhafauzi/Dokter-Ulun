import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import db from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const EKLAIM_KEY = String(process.env.EKLAIM_KEY || '').trim();
const EKLAIM_URL = String(process.env.EKLAIM_URL || '').trim();
const KODE_TARIF_RS = String(process.env.EKLAIM_KODE_TARIF_RS || process.env.KODE_TARIF_RS || 'CP').trim();
const DEFAULT_CODER_NIK = String(process.env.EKLAIM_CODER_NIK || '').trim();
const DEFAULT_NOMOR_SEP = String(process.env.EKLAIM_DEFAULT_NOMOR_SEP || '').trim();
const DEFAULT_NOMOR_RM = String(process.env.EKLAIM_DEFAULT_NOMOR_RM || '').trim();
const DEFAULT_NOMOR_KARTU = String(process.env.EKLAIM_DEFAULT_NOMOR_KARTU || '').trim();
const DEFAULT_NAMA_PASIEN = String(process.env.EKLAIM_DEFAULT_NAMA_PASIEN || '').trim();

const SEARCH_CONFIG = {
  idrg_diagnosa: {
    table: 'mlite_idr_codes',
    systemLike: 'ICD_10%'
  },
  idrg_prosedur: {
    table: 'mlite_idr_codes',
    systemLike: 'ICD_9%'
  },
  inacbg_diagnosa: {
    table: 'mlite_inacbg_codes',
    systemLike: 'ICD_10%'
  },
  inacbg_prosedur: {
    table: 'mlite_inacbg_codes',
    systemLike: 'ICD_9%'
  }
};

class InacbgSimulationService {
  static getDefaultPatientValues() {
    return {
      nomor_sep: DEFAULT_NOMOR_SEP,
      nomor_rm: DEFAULT_NOMOR_RM,
      nomor_kartu: DEFAULT_NOMOR_KARTU,
      nama_pasien: DEFAULT_NAMA_PASIEN,
      kode_tarif: KODE_TARIF_RS,
      coder_nik: DEFAULT_CODER_NIK
    };
  }

  static normalizeSearchType(type) {
    const normalizedType = String(type || 'idrg_diagnosa').trim().toLowerCase();
    if (!SEARCH_CONFIG[normalizedType]) {
      throw new Error('Tipe pencarian INACBG tidak valid');
    }

    return normalizedType;
  }

  static mapGenderToEklaim(gender) {
    return String(gender || '').trim().toUpperCase() === 'P' ? '2' : '1';
  }

  static mapStatusLanjutToJenisRawat(statusLanjut) {
    return String(statusLanjut || '').trim().toLowerCase() === 'ranap' ? '1' : '2';
  }

  static formatDateTime(dateValue, timeValue, fallbackTime = '00:00:00') {
    const date = String(dateValue || '').trim();
    if (!date) return '';
    const time = String(timeValue || fallbackTime || '00:00:00').trim() || '00:00:00';
    return `${date} ${time}`;
  }

  static getCurrentDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  static mcEncrypt(data, hexKey) {
    const key = Buffer.from(hexKey, 'hex');
    if (key.length !== 32) {
      throw new Error('Needs a 256-bit key!');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const signature = crypto.createHmac('sha256', key).update(encrypted).digest().subarray(0, 10);
    return Buffer.concat([signature, iv, encrypted]).toString('base64');
  }

  static mcDecrypt(encodedValue, hexKey) {
    const key = Buffer.from(hexKey, 'hex');
    if (key.length !== 32) {
      throw new Error('Needs a 256-bit key!');
    }

    const decoded = Buffer.from(String(encodedValue || '').trim(), 'base64');
    const ivSize = 16;
    const signature = decoded.subarray(0, 10);
    const iv = decoded.subarray(10, 10 + ivSize);
    const encrypted = decoded.subarray(10 + ivSize);
    const calculatedSignature = crypto.createHmac('sha256', key).update(encrypted).digest().subarray(0, 10);

    if (!crypto.timingSafeEqual(signature, calculatedSignature)) {
      return 'SIGNATURE_NOT_MATCH';
    }

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  static async sendRequest(requestData) {
    if (!EKLAIM_KEY) {
      throw new Error('EKLAIM_KEY belum diatur di .env');
    }

    if (!EKLAIM_URL) {
      throw new Error('EKLAIM_URL belum diatur di .env');
    }

    const encryptedPayload = this.mcEncrypt(requestData, EKLAIM_KEY);

    const response = await fetch(EKLAIM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: encryptedPayload
    });

    const rawText = await response.text();
    const matchedEncrypted = rawText.match(/----BEGIN ENCRYPTED DATA----([\s\S]*?)----END ENCRYPTED DATA----/);
    const encryptedData = matchedEncrypted
      ? matchedEncrypted[1].replace(/\s+/g, '').trim()
      : rawText.trim();

    const decrypted = this.mcDecrypt(encryptedData, EKLAIM_KEY);
    if (decrypted === 'SIGNATURE_NOT_MATCH') {
      return {
        metadata: {
          code: 500,
          message: 'SIGNATURE_NOT_MATCH'
        }
      };
    }

    return JSON.parse(decrypted);
  }

  static async searchCodes(search, type) {
    const normalizedType = this.normalizeSearchType(type);
    const config = SEARCH_CONFIG[normalizedType];
    const keyword = `%${String(search || '').trim()}%`;

    const sql = `
      SELECT code, description
      FROM ${config.table}
      WHERE system LIKE ?
        AND (code LIKE ? OR description LIKE ?)
      ORDER BY
        CASE
          WHEN code = ? THEN 0
          WHEN code LIKE ? THEN 1
          WHEN description LIKE ? THEN 2
          ELSE 3
        END,
        code ASC
      LIMIT 20
    `;

    const exactKeyword = String(search || '').trim();
    const [rows] = await db.execute(sql, [
      config.systemLike,
      keyword,
      keyword,
      exactKeyword,
      `${exactKeyword}%`,
      `%${exactKeyword}%`
    ]);

    return {
      results: rows || []
    };
  }

  static async getCodeInfo(code, type) {
    const normalizedCode = String(code || '').trim();
    const normalizedType = String(type || 'idrg').trim().toLowerCase();
    const requestedTable = normalizedType.includes('idrg') ? 'mlite_idr_codes' : 'mlite_inacbg_codes';
    const otherTable = requestedTable === 'mlite_idr_codes' ? 'mlite_inacbg_codes' : 'mlite_idr_codes';

    const [requestedRows] = await db.execute(
      `SELECT code, description FROM ${requestedTable} WHERE code = ? LIMIT 1`,
      [normalizedCode]
    );

    if (requestedRows.length > 0) {
      return {
        ...requestedRows[0],
        valid: true
      };
    }

    const [otherRows] = await db.execute(
      `SELECT code, description FROM ${otherTable} WHERE code = ? LIMIT 1`,
      [normalizedCode]
    );

    if (otherRows.length > 0) {
      return {
        ...otherRows[0],
        valid: false
      };
    }

    return {
      code: normalizedCode,
      description: 'Kode tidak ditemukan',
      valid: false
    };
  }

  static async getDefaults(noRawat) {
    const defaultPatientValues = this.getDefaultPatientValues();
    const normalizedNoRawat = String(noRawat || '').trim();
    if (!normalizedNoRawat) {
      return {
        patient: {
          nomor_sep: defaultPatientValues.nomor_sep,
          nomor_rm: defaultPatientValues.nomor_rm,
          nomor_kartu: defaultPatientValues.nomor_kartu,
          nama_pasien: defaultPatientValues.nama_pasien,
          tgl_lahir: '',
          gender: '1',
          jenis_rawat: '2',
          kelas_rawat: '3',
          tgl_masuk: this.getCurrentDateTime(),
          tgl_pulang: this.getCurrentDateTime(),
          kode_tarif: defaultPatientValues.kode_tarif || 'CP',
          payor_id: '3',
          payor_cd: 'JKN',
          cob_cd: '0',
          coder_nik: defaultPatientValues.coder_nik,
          pasien_id: ''
        },
        optional: {
          biaya_bedah: '0',
          biaya_obat: '0',
          biaya_bmhp: '0',
          biaya_alkes: '0',
          adl_sub_acute: '0',
          adl_chronic: '0',
          icu_indikator: '0',
          icu_los: '0',
          ventilator_hour: '0'
        },
        idrg: {
          diagnosa: [],
          prosedur: []
        },
        inacbg: {
          diagnosa: [],
          prosedur: []
        }
      };
    }

    const patientSql = `
      SELECT
        rp.no_rawat,
        rp.no_rkm_medis,
        rp.tgl_registrasi,
        rp.jam_reg,
        rp.status_lanjut,
        rp.kd_pj,
        p.nm_pasien,
        p.no_peserta,
        p.jk,
        p.tgl_lahir,
        ki.tgl_masuk AS ranap_tgl_masuk,
        ki.jam_masuk AS ranap_jam_masuk,
        ki.tgl_keluar AS ranap_tgl_keluar,
        ki.jam_keluar AS ranap_jam_keluar
      FROM reg_periksa rp
      INNER JOIN pasien p ON p.no_rkm_medis = rp.no_rkm_medis
      LEFT JOIN (
        SELECT x.no_rawat, x.tgl_masuk, x.jam_masuk, x.tgl_keluar, x.jam_keluar
        FROM kamar_inap x
        INNER JOIN (
          SELECT no_rawat, MAX(CONCAT(tgl_masuk, ' ', jam_masuk)) AS latest_inap
          FROM kamar_inap
          GROUP BY no_rawat
        ) latest ON latest.no_rawat = x.no_rawat
          AND latest.latest_inap = CONCAT(x.tgl_masuk, ' ', x.jam_masuk)
      ) ki ON ki.no_rawat = rp.no_rawat
      WHERE rp.no_rawat = ?
      LIMIT 1
    `;

    const icd10Sql = `
      SELECT dp.kd_penyakit AS code, COALESCE(p.nm_penyakit, '') AS description
      FROM diagnosa_pasien dp
      LEFT JOIN penyakit p ON p.kd_penyakit = dp.kd_penyakit
      WHERE dp.no_rawat = ?
      ORDER BY dp.prioritas ASC, dp.kd_penyakit ASC
    `;

    const icd9Sql = `
      SELECT pp.kode AS code, COALESCE(i9.deskripsi_pendek, '') AS description
      FROM prosedur_pasien pp
      LEFT JOIN icd9 i9 ON i9.kode = pp.kode
      WHERE pp.no_rawat = ?
      ORDER BY pp.prioritas ASC, pp.kode ASC
    `;

    const [patientRows] = await db.execute(patientSql, [normalizedNoRawat]);
    if (!patientRows.length) {
      throw new Error('Data pasien tidak ditemukan');
    }

    const patient = patientRows[0];
    const [icd10Rows] = await db.execute(icd10Sql, [normalizedNoRawat]);
    const [icd9Rows] = await db.execute(icd9Sql, [normalizedNoRawat]);

    const jenisRawat = this.mapStatusLanjutToJenisRawat(patient.status_lanjut);
    const currentDateTime = this.getCurrentDateTime();

    return {
      patient: {
        nomor_sep: defaultPatientValues.nomor_sep,
        nomor_rm: patient.no_rkm_medis || defaultPatientValues.nomor_rm,
        nomor_kartu: patient.no_peserta || defaultPatientValues.nomor_kartu,
        nama_pasien: patient.nm_pasien || defaultPatientValues.nama_pasien,
        tgl_lahir: patient.tgl_lahir,
        gender: this.mapGenderToEklaim(patient.jk),
        jenis_rawat: jenisRawat,
        kelas_rawat: '3',
        tgl_masuk: currentDateTime,
        tgl_pulang: currentDateTime,
        kode_tarif: defaultPatientValues.kode_tarif || 'CP',
        payor_id: '3',
        payor_cd: 'JKN',
        cob_cd: '0',
        coder_nik: defaultPatientValues.coder_nik,
        pasien_id: normalizedNoRawat
      },
      optional: {
        biaya_bedah: '0',
        biaya_obat: '0',
        biaya_bmhp: '0',
        biaya_alkes: '0',
        adl_sub_acute: '0',
        adl_chronic: '0',
        icu_indikator: '0',
        icu_los: '0',
        ventilator_hour: '0'
      },
      idrg: {
        diagnosa: icd10Rows,
        prosedur: icd9Rows
      },
      inacbg: {
        diagnosa: [],
        prosedur: []
      }
    };
  }

  static buildApiPayload(method, data = {}, nomorSep = '') {
    const payload = {
      metadata: {
        method
      }
    };

    if (nomorSep) {
      payload.metadata.nomor_sep = nomorSep;
    }

    const normalizedData = { ...(data || {}) };
    if (nomorSep && !normalizedData.nomor_sep) {
      normalizedData.nomor_sep = nomorSep;
    }

    if (method === 'grouper') {
      payload.metadata.grouper = normalizedData.grouper || 'idrg';
      payload.metadata.stage = normalizedData.stage || '1';
      delete normalizedData.grouper;
      delete normalizedData.stage;
    }

    payload.data = normalizedData;
    return payload;
  }

  static async apiCall(method, data = {}, nomorSep = '') {
    const payload = this.buildApiPayload(method, data, nomorSep);
    const response = await this.sendRequest(JSON.stringify(payload));
    return {
      payload,
      response
    };
  }
}

export default InacbgSimulationService;
