import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

class RadiologyDataService {
  constructor() {
    this.dbConfig = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT, 10) || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'sik',
      timezone: '+00:00'
    };
  }

  async getConnection() {
    return await mysql.createConnection(this.dbConfig);
  }

  normalizeStatusRawat(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();

    if (normalizedValue === 'ranap' || normalizedValue === 'rawat inap') {
      return 'ranap';
    }

    if (normalizedValue === 'ralan' || normalizedValue === 'rawat jalan') {
      return 'ralan';
    }

    return null;
  }

  async getRadiologyRequests(no_rawat) {
    const connection = await this.getConnection();
    try {
      const query = `
        SELECT pr.*, d.nm_dokter
        FROM permintaan_radiologi pr
        LEFT JOIN dokter d ON pr.dokter_perujuk = d.kd_dokter
        WHERE pr.no_rawat = ?
        ORDER BY pr.tgl_permintaan DESC, pr.jam_permintaan DESC
      `;

      const [rows] = await connection.execute(query, [no_rawat]);
      return rows;
    } finally {
      await connection.end();
    }
  }

  async getRadiologyRequestDetails(noorder) {
    const connection = await this.getConnection();
    try {
      const query = `
        SELECT ppr.*, jpr.nm_perawatan, jpr.total_byr
        FROM permintaan_pemeriksaan_radiologi ppr
        LEFT JOIN jns_perawatan_radiologi jpr ON ppr.kd_jenis_prw = jpr.kd_jenis_prw
        WHERE ppr.noorder = ?
        ORDER BY jpr.nm_perawatan
      `;

      const [rows] = await connection.execute(query, [noorder]);
      return { examinations: rows };
    } finally {
      await connection.end();
    }
  }

  async getRadiologyServices() {
    const connection = await this.getConnection();
    try {
      const query = `
        SELECT kd_jenis_prw, nm_perawatan, total_byr
        FROM jns_perawatan_radiologi
        WHERE status = '1'
        ORDER BY nm_perawatan
        LIMIT 100
      `;

      const [rows] = await connection.execute(query);
      return rows;
    } finally {
      await connection.end();
    }
  }

  async createRadiologyRequest(no_rawat, dokter_perujuk, examinations, status_rawat) {
    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();

      const normalizedStatusRawat = this.normalizeStatusRawat(status_rawat) || 'ralan';
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const [sequenceRows] = await connection.execute(
        `
          SELECT MAX(noorder) AS last_noorder
          FROM permintaan_radiologi
          WHERE noorder LIKE ?
        `,
        [`PR${today}%`]
      );

      const lastNoorder = sequenceRows[0]?.last_noorder || '';
      const lastSequence = Number(String(lastNoorder).slice(`PR${today}`.length)) || 0;
      const nextSequence = String(lastSequence + 1).padStart(4, '0');
      const noorder = `PR${today}${nextSequence}`;

      const insertHeaderQuery = `
        INSERT INTO permintaan_radiologi (
          noorder,
          no_rawat,
          tgl_permintaan,
          jam_permintaan,
          tgl_sampel,
          jam_sampel,
          tgl_hasil,
          jam_hasil,
          dokter_perujuk,
          status
        )
        VALUES (?, ?, CURDATE(), CURTIME(), '0000-00-00', '00:00:00', '0000-00-00', '00:00:00', ?, ?)
      `;

      await connection.execute(insertHeaderQuery, [
        noorder,
        no_rawat,
        dokter_perujuk,
        normalizedStatusRawat
      ]);

      if (Array.isArray(examinations) && examinations.length > 0) {
        for (const examination of examinations) {
          const insertDetailQuery = `
            INSERT INTO permintaan_pemeriksaan_radiologi (noorder, kd_jenis_prw, stts_bayar)
            VALUES (?, ?, 'Belum')
          `;

          await connection.execute(insertDetailQuery, [noorder, examination.kd_jenis_prw]);
        }
      }

      await connection.commit();
      return { success: true, noorder, status_rawat: normalizedStatusRawat };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.end();
    }
  }

  async updateRadiologyRequest(noorder, examinations, status_rawat) {
    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();

      const normalizedStatusRawat = this.normalizeStatusRawat(status_rawat);

      if (normalizedStatusRawat) {
        await connection.execute(
          'UPDATE permintaan_radiologi SET status = ? WHERE noorder = ?',
          [normalizedStatusRawat, noorder]
        );
      }

      await connection.execute('DELETE FROM permintaan_pemeriksaan_radiologi WHERE noorder = ?', [noorder]);

      if (Array.isArray(examinations) && examinations.length > 0) {
        for (const examination of examinations) {
          const insertDetailQuery = `
            INSERT INTO permintaan_pemeriksaan_radiologi (noorder, kd_jenis_prw, stts_bayar)
            VALUES (?, ?, 'Belum')
          `;

          await connection.execute(insertDetailQuery, [noorder, examination.kd_jenis_prw]);
        }
      }

      await connection.commit();
      return { success: true, status_rawat: normalizedStatusRawat };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.end();
    }
  }

  async deleteRadiologyRequest(noorder) {
    const connection = await this.getConnection();
    try {
      await connection.execute('DELETE FROM permintaan_radiologi WHERE noorder = ?', [noorder]);
      return { success: true };
    } finally {
      await connection.end();
    }
  }
}

export default new RadiologyDataService();
