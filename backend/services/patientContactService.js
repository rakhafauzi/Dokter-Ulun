import { executeQuery } from '../config/database.js';

class PatientContactService {
  static normalizePhone(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw new Error('Nomor WhatsApp wajib diisi');
    }

    const digitsOnly = normalized.replace(/\D/g, '');
    if (digitsOnly.length < 8) {
      throw new Error('Nomor WhatsApp minimal 8 digit');
    }

    if (digitsOnly.length > 20) {
      throw new Error('Nomor WhatsApp terlalu panjang');
    }

    return normalized;
  }

  static async updatePatientWhatsapp(payload) {
    const noRkmMedis = String(payload?.no_rkm_medis || '').trim();
    const whatsapp = this.normalizePhone(payload?.no_tlp);

    if (!noRkmMedis) {
      throw new Error('no_rkm_medis wajib diisi');
    }

    const result = await executeQuery(
      `
        UPDATE pasien
        SET no_tlp = ?
        WHERE no_rkm_medis = ?
      `,
      [whatsapp, noRkmMedis]
    );

    if (!result.affectedRows) {
      throw new Error('Data pasien tidak ditemukan');
    }

    return {
      success: true,
      message: 'Nomor WhatsApp berhasil diperbarui'
    };
  }
}

export default PatientContactService;
