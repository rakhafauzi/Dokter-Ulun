import axios from 'axios';
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

  static normalizeWhatsappNumber(value) {
    const normalized = this.normalizePhone(value);
    const digitsOnly = normalized.replace(/\D/g, '');

    if (digitsOnly.startsWith('62')) {
      return digitsOnly;
    }

    if (digitsOnly.startsWith('0')) {
      return `62${digitsOnly.slice(1)}`;
    }

    return `62${digitsOnly}`;
  }

  static normalizeMessage(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw new Error('Pesan WhatsApp wajib diisi');
    }

    if (normalized.length > 5000) {
      throw new Error('Pesan WhatsApp terlalu panjang');
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

  static async sendWhatsappMessage(payload) {
    const phoneNumber = this.normalizeWhatsappNumber(payload?.no_tlp);
    const message = this.normalizeMessage(payload?.message);

    const waGatewayUrl = String(process.env.WA_GATEWAY_URL || '').trim();
    const apiKey = String(process.env.WA_GATEWAY_API_KEY || '').trim();
    const senderNumber = String(process.env.WA_SENDER_NUMBER || '').trim();

    if (!waGatewayUrl || !apiKey || !senderNumber) {
      throw new Error('Konfigurasi WA Gateway belum lengkap');
    }

    const formData = new URLSearchParams();
    formData.append('api_key', apiKey);
    formData.append('sender', senderNumber);
    formData.append('number', phoneNumber);
    formData.append('message', message);
    formData.append('type', 'text');

    const response = await axios.post(waGatewayUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (response.status !== 200) {
      throw new Error('Gagal mengirim pesan WhatsApp');
    }

    return {
      success: true,
      message: 'Pesan WhatsApp berhasil dikirim'
    };
  }
}

export default PatientContactService;
