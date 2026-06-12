import { executeQuery } from '../config/database.js';

class AssesmenRehabMedikService {
  static parseAccessAliases() {
    const rawValue = String(process.env.ASSESMEN_REHAB_MEDIK_ACCESS || '').trim();

    if (!rawValue) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(rawValue);
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    } catch (error) {
      console.error('Failed to parse ASSESMEN_REHAB_MEDIK_ACCESS:', error);
      return [];
    }
  }

  static normalizeText(value) {
    return String(value ?? '').trim();
  }

  static normalizeSuspek(value) {
    return this.normalizeText(value) === 'Ya' ? 'Ya' : 'Tidak';
  }

  static canAccess(username) {
    const normalizedUsername = this.normalizeText(username);
    if (!normalizedUsername) {
      return false;
    }

    return this.parseAccessAliases().includes(normalizedUsername);
  }

  static ensureAccess(username) {
    if (!this.canAccess(username)) {
      const error = new Error('Anda tidak memiliki akses ke assesmen rehab medik');
      error.statusCode = 403;
      throw error;
    }
  }

  static mapAssessmentRow(row) {
    return {
      no_rawat: this.normalizeText(row?.no_rawat),
      tanggal: this.normalizeText(row?.tanggal),
      time: this.normalizeText(row?.time),
      anamnesa: this.normalizeText(row?.anamnesa),
      pemeriksaan_fisik: this.normalizeText(row?.pemeriksaan_fisik),
      diagnosa_fungsi: this.normalizeText(row?.diagnosa_fungsi),
      anjuran: this.normalizeText(row?.anjuran),
      evaluasi: this.normalizeText(row?.evaluasi),
      hasil: this.normalizeText(row?.hasil),
      kesimpulan: this.normalizeText(row?.kesimpulan),
      rekomendasi: this.normalizeText(row?.rekomendasi),
      suspek_penyakit: this.normalizeSuspek(row?.suspek_penyakit)
    };
  }

  static async getAccessInfo(username) {
    return {
      success: true,
      can_access: this.canAccess(username),
      aliases: this.parseAccessAliases()
    };
  }

  static async getAssessmentData(noRawat, username) {
    this.ensureAccess(username);

    const normalizedNoRawat = this.normalizeText(noRawat);
    if (!normalizedNoRawat) {
      throw new Error('no_rawat wajib diisi');
    }

    const regRows = await executeQuery(
      `
        SELECT no_rkm_medis
        FROM reg_periksa
        WHERE no_rawat = ?
        LIMIT 1
      `,
      [normalizedNoRawat]
    );

    const regRow = Array.isArray(regRows) ? regRows[0] : null;
    if (!regRow?.no_rkm_medis) {
      throw new Error('Data registrasi pasien tidak ditemukan');
    }

    const [currentRows, historyRows] = await Promise.all([
      executeQuery(
        `
          SELECT *
          FROM form_assesment_terapi
          WHERE no_rawat = ?
          ORDER BY tanggal DESC, \`time\` DESC
        `,
        [normalizedNoRawat]
      ),
      executeQuery(
        `
          SELECT
            fat.*,
            rp.no_rawat
          FROM reg_periksa rp
          INNER JOIN form_assesment_terapi fat ON fat.no_rawat = rp.no_rawat
          WHERE rp.no_rkm_medis = ?
          ORDER BY fat.tanggal DESC, fat.\`time\` DESC, rp.tgl_registrasi DESC
        `,
        [regRow.no_rkm_medis]
      )
    ]);

    return {
      success: true,
      current: Array.isArray(currentRows) ? currentRows.map((row) => this.mapAssessmentRow(row)) : [],
      history: Array.isArray(historyRows) ? historyRows.map((row) => this.mapAssessmentRow(row)) : []
    };
  }

  static async saveAssessment(payload = {}) {
    const username = this.normalizeText(payload.username);
    this.ensureAccess(username);

    const noRawat = this.normalizeText(payload.no_rawat);
    if (!noRawat) {
      throw new Error('no_rawat wajib diisi');
    }

    const data = {
      anamnesa: this.normalizeText(payload.anamnesa),
      pemeriksaan_fisik: this.normalizeText(payload.pemeriksaan_fisik),
      diagnosa_fungsi: this.normalizeText(payload.diagnosa_fungsi),
      anjuran: this.normalizeText(payload.anjuran),
      evaluasi: this.normalizeText(payload.evaluasi),
      hasil: this.normalizeText(payload.hasil),
      kesimpulan: this.normalizeText(payload.kesimpulan),
      rekomendasi: this.normalizeText(payload.rekomendasi),
      suspek_penyakit: this.normalizeSuspek(payload.suspek_penyakit)
    };

    const existingRows = await executeQuery(
      `
        SELECT no_rawat
        FROM form_assesment_terapi
        WHERE no_rawat = ?
        LIMIT 1
      `,
      [noRawat]
    );

    const existingRow = Array.isArray(existingRows) ? existingRows[0] : null;

    if (existingRow) {
      await executeQuery(
        `
          UPDATE form_assesment_terapi
          SET
            anamnesa = ?,
            pemeriksaan_fisik = ?,
            diagnosa_fungsi = ?,
            anjuran = ?,
            evaluasi = ?,
            hasil = ?,
            kesimpulan = ?,
            rekomendasi = ?,
            suspek_penyakit = ?,
            tanggal = CURDATE(),
            \`time\` = CURTIME()
          WHERE no_rawat = ?
        `,
        [
          data.anamnesa,
          data.pemeriksaan_fisik,
          data.diagnosa_fungsi,
          data.anjuran,
          data.evaluasi,
          data.hasil,
          data.kesimpulan,
          data.rekomendasi,
          data.suspek_penyakit,
          noRawat
        ]
      );

      return {
        success: true,
        message: 'Assesmen rehab medik berhasil diperbarui'
      };
    }

    await executeQuery(
      `
        INSERT INTO form_assesment_terapi (
          no_rawat,
          tanggal,
          \`time\`,
          anamnesa,
          pemeriksaan_fisik,
          diagnosa_fungsi,
          anjuran,
          evaluasi,
          hasil,
          kesimpulan,
          rekomendasi,
          suspek_penyakit
        ) VALUES (?, CURDATE(), CURTIME(), ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        noRawat,
        data.anamnesa,
        data.pemeriksaan_fisik,
        data.diagnosa_fungsi,
        data.anjuran,
        data.evaluasi,
        data.hasil,
        data.kesimpulan,
        data.rekomendasi,
        data.suspek_penyakit
      ]
    );

    return {
      success: true,
      message: 'Assesmen rehab medik berhasil disimpan'
    };
  }

  static async deleteAssessment(noRawat, username) {
    this.ensureAccess(username);

    const normalizedNoRawat = this.normalizeText(noRawat);
    if (!normalizedNoRawat) {
      throw new Error('no_rawat wajib diisi');
    }

    await executeQuery(
      `
        DELETE FROM form_assesment_terapi
        WHERE no_rawat = ?
      `,
      [normalizedNoRawat]
    );

    return {
      success: true,
      message: 'Assesmen rehab medik berhasil dihapus'
    };
  }
}

export default AssesmenRehabMedikService;
