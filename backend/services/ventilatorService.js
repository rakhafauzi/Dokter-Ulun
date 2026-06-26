import { executeQuery } from '../config/database.js';

class VentilatorService {
  static async listByNoRawat(noRawat) {
    const normalizedNoRawat = String(noRawat || '').trim();
    if (!normalizedNoRawat) {
      throw new Error('no_rawat wajib diisi');
    }

    const rows = await executeQuery(
      `
        SELECT
          id,
          no_rawat,
          jns_tindakan,
          intubasi,
          ekstubasi,
          user,
          created_at
        FROM mlite_ventilator
        WHERE no_rawat = ?
          AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
      `,
      [normalizedNoRawat]
    );

    return (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      jns_tindakan: String(row?.jns_tindakan || '').trim(),
      intubasi: String(row?.intubasi || '').trim(),
      ekstubasi: String(row?.ekstubasi || '').trim(),
      user: String(row?.user || '').trim()
    }));
  }
}

export default VentilatorService;
