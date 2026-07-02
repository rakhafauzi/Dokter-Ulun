import { executeQuery } from '../config/database.js';

const DEFAULT_BANGSAL_CODES = ['B0001', 'B0014', 'B0018', 'B0112', 'B0002'];

class DepoFarmasiService {
  static async getData(options = {}) {
    const search = String(options.search || '').trim();
    const bangsalCodes = DEFAULT_BANGSAL_CODES;
    const searchClause = search
      ? `AND (a.kode_brng LIKE ? OR a.nama_brng LIKE ? OR c.nm_bangsal LIKE ?)`
      : '';
    const searchParams = search
      ? Array(3).fill(`%${search}%`)
      : [];

    const placeholders = bangsalCodes.map(() => '?').join(', ');
    const rows = await executeQuery(
      `
        SELECT
          a.kode_brng,
          a.nama_brng,
          gb.kd_bangsal,
          COALESCE(c.nm_bangsal, '') AS nm_bangsal,
          COALESCE(gb.stok, 0) AS stok
        FROM databarang a
        LEFT JOIN gudangbarang gb
          ON a.kode_brng = gb.kode_brng
         AND gb.kd_bangsal IN (${placeholders})
        LEFT JOIN bangsal c ON c.kd_bangsal = gb.kd_bangsal
        WHERE a.status = '1'
          ${searchClause}
        ORDER BY a.nama_brng ASC, c.nm_bangsal ASC
      `,
      [...bangsalCodes, ...searchParams]
    );

    const grouped = new Map();

    for (const row of rows) {
      const kodeBrng = String(row.kode_brng || '').trim();
      if (!kodeBrng) {
        continue;
      }

      if (!grouped.has(kodeBrng)) {
        grouped.set(kodeBrng, {
          kode_brng: kodeBrng,
          nama_brng: String(row.nama_brng || '').trim(),
          lokasi_stok: []
        });
      }

      if (row.kd_bangsal) {
        grouped.get(kodeBrng).lokasi_stok.push({
          kd_bangsal: String(row.kd_bangsal || '').trim(),
          nm_bangsal: String(row.nm_bangsal || '').trim() || String(row.kd_bangsal || '').trim(),
          stok: Number(row.stok || 0)
        });
      }
    }

    return {
      success: true,
      data: Array.from(grouped.values())
    };
  }
}

export default DepoFarmasiService;
