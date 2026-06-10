import { executeQuery, getConnection } from '../config/database.js';

class AllergyDataService {
  static normalizeCategory(value) {
    const normalized = String(value || '').trim();
    if (['Lingkungan', 'Makanan', 'Obat'].includes(normalized)) {
      return normalized;
    }
    throw new Error('Kategori alergi tidak valid');
  }

  static normalizeLimit(value, fallback = 20) {
    const parsed = Number.parseInt(String(value || fallback), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.min(parsed, 50);
  }

  static async listAllergies(noRkmMedis) {
    const normalizedNoRm = String(noRkmMedis || '').trim();
    if (!normalizedNoRm) {
      throw new Error('no_rkm_medis is required');
    }

    const query = `
      SELECT
        ma.id,
        ma.created_at,
        ma.kode_brng,
        ma.kategori,
        CASE
          WHEN ma.kategori = 'Obat' THEN COALESCE(db.nama_brng, '')
          ELSE COALESCE(masterAlergi.nama, '')
        END AS nm_alergi
      FROM mlite_alergi ma
      LEFT JOIN databarang db
        ON ma.kategori = 'Obat'
        AND ma.kode_brng = db.kode_brng
      LEFT JOIN master_alergi masterAlergi
        ON ma.kategori <> 'Obat'
        AND ma.kode_brng = masterAlergi.id
      WHERE ma.no_rkm_medis = ?
        AND COALESCE(ma.status, '1') = '1'
      ORDER BY ma.created_at DESC
    `;

    const rows = await executeQuery(query, [normalizedNoRm]);
    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        kode_brng: row.kode_brng,
        kategori: row.kategori,
        nama: row.nm_alergi || ''
      }))
    };
  }

  static async searchOptions(category, search = '', limit = 20) {
    const normalizedCategory = this.normalizeCategory(category);
    const keyword = String(search || '').trim();
    const effectiveLimit = this.normalizeLimit(limit);

    if (normalizedCategory === 'Obat') {
      const query = `
        SELECT kode_brng AS id, nama_brng AS text
        FROM databarang
        WHERE status = '1'
          AND (
            ? = ''
            OR kode_brng LIKE ?
            OR nama_brng LIKE ?
          )
        ORDER BY nama_brng ASC
        LIMIT ?
      `;

      const rows = await executeQuery(query, [
        keyword,
        `%${keyword}%`,
        `%${keyword}%`,
        effectiveLimit
      ]);

      return {
        success: true,
        data: rows
      };
    }

    const query = `
      SELECT id, nama AS text
      FROM master_alergi
      WHERE kategori = ?
        AND (
          ? = ''
          OR CAST(id AS CHAR) LIKE ?
          OR nama LIKE ?
        )
      ORDER BY nama ASC
      LIMIT ?
    `;

    const rows = await executeQuery(query, [
      normalizedCategory,
      keyword,
      `%${keyword}%`,
      `%${keyword}%`,
      effectiveLimit
    ]);

    return {
      success: true,
      data: rows
    };
  }

  static async saveAllergy({
    no_rkm_medis,
    kategori,
    kode_alergi,
    makanan_manual,
    lingkungan_manual,
    username
  }) {
    const normalizedNoRm = String(no_rkm_medis || '').trim();
    const normalizedCategory = this.normalizeCategory(kategori);
    const normalizedUsername = String(username || '').trim() || 'SYSTEM';

    if (!normalizedNoRm) {
      throw new Error('no_rkm_medis is required');
    }

    const connection = await getConnection();

    try {
      await connection.beginTransaction();

      let normalizedCode = String(kode_alergi || '').trim();
      const manualValue = normalizedCategory === 'Makanan'
        ? String(makanan_manual || '').trim()
        : normalizedCategory === 'Lingkungan'
          ? String(lingkungan_manual || '').trim()
          : '';

      if (normalizedCategory === 'Obat' && !normalizedCode) {
        throw new Error('Silakan pilih obat yang menyebabkan alergi');
      }

      if (normalizedCategory !== 'Obat' && !normalizedCode && !manualValue) {
        throw new Error(`Pilih alergi ${normalizedCategory.toLowerCase()} atau isi manual`);
      }

      if (manualValue) {
        const normalizedName = manualValue
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\b\w/g, (char) => char.toUpperCase());

        const [masterRows] = await connection.execute(
          `
            SELECT id
            FROM master_alergi
            WHERE nama = ? AND kategori = ?
            LIMIT 1
          `,
          [normalizedName, normalizedCategory]
        );

        if (masterRows.length) {
          normalizedCode = String(masterRows[0].id || '').trim();
        } else {
          const now = new Date();
          const createdAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
          await connection.execute(
            `
              INSERT INTO master_alergi (nama, kategori, user, created_at)
              VALUES (?, ?, ?, ?)
            `,
            [normalizedName, normalizedCategory, normalizedUsername, createdAt]
          );

          const [insertedRows] = await connection.execute(
            `
              SELECT id
              FROM master_alergi
              WHERE nama = ? AND kategori = ?
              ORDER BY id DESC
              LIMIT 1
            `,
            [normalizedName, normalizedCategory]
          );

          normalizedCode = String(insertedRows[0]?.id || '').trim();
        }
      }

      const [duplicateRows] = await connection.execute(
        `
          SELECT id
          FROM mlite_alergi
          WHERE no_rkm_medis = ?
            AND kode_brng = ?
            AND kategori = ?
            AND COALESCE(status, '1') = '1'
          LIMIT 1
        `,
        [normalizedNoRm, normalizedCode, normalizedCategory]
      );

      if (duplicateRows.length) {
        throw new Error('Alergi tersebut sudah terinput untuk pasien ini');
      }

      const now = new Date();
      const createdAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      await connection.execute(
        `
          INSERT INTO mlite_alergi (no_rkm_medis, kode_brng, kategori, user, created_at, status)
          VALUES (?, ?, ?, ?, ?, '1')
        `,
        [normalizedNoRm, normalizedCode, normalizedCategory, normalizedUsername, createdAt]
      );

      await connection.commit();
      return {
        success: true,
        message: 'Alergi berhasil disimpan'
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default AllergyDataService;
