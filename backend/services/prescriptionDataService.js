import { executeQuery, getConnection } from '../config/database.js';

class PrescriptionDataService {
  getEnvValue(key) {
    const upper = String(key || '').trim();
    if (!upper) {
      return '';
    }
    return (
      String(process.env[upper] || '').trim() ||
      String(process.env[upper.toLowerCase()] || '').trim()
    );
  }

  parseMedicineQty(value) {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return parsed;
  }

  async resolveStockBangsalCode(connection, no_rawat, resolvedPrescriptionStatus) {
    const normalizedStatus = String(resolvedPrescriptionStatus || '').trim().toLowerCase();

    if (normalizedStatus === 'ranap') {
      const value = this.getEnvValue('STOK_RESEP_RANAP');
      if (!value) {
        throw new Error('Konfigurasi STOK_RESEP_RANAP belum diisi');
      }
      return value;
    }

    const [rows] = await connection.execute(
      `
        SELECT kd_poli
        FROM reg_periksa
        WHERE no_rawat = ?
        LIMIT 1
      `,
      [no_rawat]
    );

    const kdPoli = String(rows?.[0]?.kd_poli || '').trim();

    if (kdPoli === 'IGDK') {
      const value = this.getEnvValue('STOK_RESEP_IGD');
      if (!value) {
        throw new Error('Konfigurasi STOK_RESEP_IGD belum diisi');
      }
      return value;
    }

    const value = this.getEnvValue('STOK_RESEP_RAJAL');
    if (!value) {
      throw new Error('Konfigurasi STOK_RESEP_RAJAL belum diisi');
    }
    return value;
  }

  async validateMedicineStock(connection, kdBangsal, medicines) {
    if (!kdBangsal) {
      throw new Error('Kode bangsal stok resep tidak ditemukan');
    }

    const requestedByCode = new Map();
    for (const item of Array.isArray(medicines) ? medicines : []) {
      const code = String(item?.kode_brng || '').trim();
      if (!code) {
        continue;
      }
      const qty = this.parseMedicineQty(item?.jml);
      if (!qty) {
        continue;
      }
      requestedByCode.set(code, (requestedByCode.get(code) || 0) + qty);
    }

    const codes = Array.from(requestedByCode.keys());
    if (!codes.length) {
      return;
    }

    const placeholders = codes.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `
        SELECT
          gb.kode_brng,
          COALESCE(db.nama_brng, '') AS nama_brng,
          SUM(COALESCE(gb.stok, 0)) AS stok
        FROM gudangbarang gb
        LEFT JOIN databarang db ON db.kode_brng = gb.kode_brng
        WHERE gb.kd_bangsal = ?
          AND gb.kode_brng IN (${placeholders})
        GROUP BY gb.kode_brng, db.nama_brng
      `,
      [kdBangsal, ...codes]
    );

    const stockByCode = new Map();
    for (const row of rows) {
      const code = String(row?.kode_brng || '').trim();
      const stok = Number(row?.stok) || 0;
      stockByCode.set(code, stok);
    }

    const shortages = [];
    for (const code of codes) {
      const requested = requestedByCode.get(code) || 0;
      const available = stockByCode.get(code) || 0;
      if (requested > available) {
        const name = String(rows.find((r) => String(r?.kode_brng || '').trim() === code)?.nama_brng || '').trim();
        shortages.push(`${code}${name ? ` (${name})` : ''} butuh ${requested}, stok ${available}`);
      }
    }

    if (shortages.length) {
      throw new Error(`Stok tidak mencukupi di bangsal ${kdBangsal}: ${shortages.join('; ')}`);
    }
  }

  normalizePrescriptionStatus(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();

    if (
      normalizedValue === 'ralan' ||
      normalizedValue === 'ranap' ||
      normalizedValue === 'pulang' ||
      normalizedValue === 'ibs'
    ) {
      return normalizedValue;
    }

    if (normalizedValue === 'rawat jalan') {
      return 'ralan';
    }

    if (normalizedValue === 'rawat inap') {
      return 'ranap';
    }

    if (normalizedValue === 'obat pulang') {
      return 'pulang';
    }

    if (normalizedValue === 'ibs') {
      return 'ibs';
    }

    return null;
  }

  async resolvePrescriptionStatus(connection, no_rawat, requestedStatus) {
    const normalizedRequestedStatus = this.normalizePrescriptionStatus(requestedStatus);

    if (normalizedRequestedStatus) {
      return normalizedRequestedStatus;
    }

    const [registrationRows] = await connection.execute(
      `
        SELECT status_lanjut
        FROM reg_periksa
        WHERE no_rawat = ?
        LIMIT 1
      `,
      [no_rawat]
    );

    const registration = registrationRows[0];

    if (!registration?.status_lanjut) {
      return 'ralan';
    }

    return registration.status_lanjut === 'Ranap' ? 'ranap' : 'ralan';
  }

  normalizePrescriptionDate(value) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      return value.trim();
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error('Tanggal resep tidak valid');
    }

    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Get prescriptions for a patient
  async getPrescriptions(no_rawat) {
    if (!no_rawat) {
      throw new Error('no_rawat is required');
    }

    const query = `
      SELECT ro.*, d.nm_dokter 
      FROM resep_obat ro
      LEFT JOIN dokter d ON ro.kd_dokter = d.kd_dokter
      WHERE ro.no_rawat = ?
      ORDER BY ro.tgl_peresepan DESC, ro.jam_peresepan DESC
    `;
    
    try {
      const result = await executeQuery(query, [no_rawat]);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Error getting prescriptions:', error);
      throw error;
    }
  }

  // Get prescription details (medicines and compounds)
  async getPrescriptionDetails(no_resep) {
    if (!no_resep) {
      throw new Error('no_resep is required');
    }

    try {
      // Get prescription medicines
      const medicineQuery = `
        SELECT rd.*, db.nama_brng, db.kode_sat AS satuan, db.kelas1 AS harga
        FROM resep_dokter rd
        LEFT JOIN databarang db ON rd.kode_brng = db.kode_brng
        WHERE rd.no_resep = ?
      `;
      
      // Get prescription compounds
      const compoundQuery = `
        SELECT rdr.*, mr.nm_racik
        FROM resep_dokter_racikan rdr
        LEFT JOIN metode_racik mr ON rdr.kd_racik = mr.kd_racik
        WHERE rdr.no_resep = ?
      `;
      
      const [medicines, compounds] = await Promise.all([
        executeQuery(medicineQuery, [no_resep]),
        executeQuery(compoundQuery, [no_resep])
      ]);
      
      return {
        success: true,
        medicines,
        compounds
      };
    } catch (error) {
      console.error('Error getting prescription details:', error);
      throw error;
    }
  }

  // Get available medicines
  async getMedicines() {
    const query = `
      SELECT kode_brng, nama_brng, kode_sat as satuan, kelas1 as harga
      FROM databarang
      WHERE status = '1'
      ORDER BY nama_brng
      LIMIT 100
    `;
    
    try {
      const result = await executeQuery(query);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Error getting medicines:', error);
      throw error;
    }
  }

  async searchMedicines(search = '', limit = 20, no_rawat = '') {
    const keyword = String(search || '').trim();
    const effectiveLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const normalizedNoRawat = String(no_rawat || '').trim();

    const connection = await getConnection();

    try {
      let stockBangsalCode = '';

      if (normalizedNoRawat) {
        const resolvedPrescriptionStatus = await this.resolvePrescriptionStatus(connection, normalizedNoRawat, null);
        stockBangsalCode = await this.resolveStockBangsalCode(connection, normalizedNoRawat, resolvedPrescriptionStatus);
      }

      const query = `
        SELECT
          db.kode_brng,
          db.nama_brng,
          db.kode_sat AS satuan,
          db.kelas1 AS harga,
          SUM(COALESCE(gb.stok, 0)) AS stok
        FROM gudangbarang gb
        INNER JOIN databarang db ON db.kode_brng = gb.kode_brng
        WHERE db.status = '1'
          ${stockBangsalCode ? 'AND gb.kd_bangsal = ?' : ''}
          AND (
            ? = ''
            OR db.kode_brng LIKE ?
            OR db.nama_brng LIKE ?
          )
        GROUP BY db.kode_brng, db.nama_brng, db.kode_sat, db.kelas1
        HAVING stok > 0
        ORDER BY
          CASE
            WHEN db.kode_brng = ? THEN 0
            WHEN db.kode_brng LIKE ? THEN 1
            WHEN db.nama_brng LIKE ? THEN 2
            ELSE 3
          END,
          db.nama_brng ASC
        LIMIT ?
      `;

      const params = [];
      if (stockBangsalCode) {
        params.push(stockBangsalCode);
      }
      params.push(
        keyword,
        `%${keyword}%`,
        `%${keyword}%`,
        keyword,
        `${keyword}%`,
        `${keyword}%`,
        effectiveLimit
      );

      const [rows] = await connection.execute(query, params);

      return {
        success: true,
        data: rows
      };
    } catch (error) {
      console.error('Error searching medicines from gudangbarang:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async searchPackages(search = '', limit = 20) {
    const keyword = String(search || '').trim();
    const effectiveLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const query = `
      SELECT id, kd_paket, nama_paket
      FROM eresep_paket_operasi
      WHERE status = '1'
        AND (
          ? = ''
          OR kd_paket LIKE ?
          OR nama_paket LIKE ?
        )
      ORDER BY nama_paket ASC
      LIMIT ?
    `;

    try {
      const result = await executeQuery(query, [
        keyword,
        `%${keyword}%`,
        `%${keyword}%`,
        effectiveLimit
      ]);

      return {
        success: true,
        data: result.map((row) => ({
          id: row.id,
          kd_paket: row.kd_paket,
          nama_paket: row.nama_paket,
          text: `${row.kd_paket} - ${row.nama_paket}`
        }))
      };
    } catch (error) {
      console.error('Error searching packages:', error);
      throw error;
    }
  }

  async getPackageItems(packageId, no_rawat) {
    const normalizedPackageId = String(packageId || '').trim();
    const normalizedNoRawat = String(no_rawat || '').trim();

    if (!normalizedPackageId) {
      throw new Error('package_id is required');
    }

    if (!normalizedNoRawat) {
      throw new Error('no_rawat is required');
    }

    const connection = await getConnection();

    try {
      const resolvedPrescriptionStatus = await this.resolvePrescriptionStatus(connection, normalizedNoRawat, null);
      const stockBangsalCode = await this.resolveStockBangsalCode(connection, normalizedNoRawat, resolvedPrescriptionStatus);

      const [rows] = await connection.execute(
        `
          SELECT
            ept.kd_obat AS kode_brng,
            db.nama_brng,
            db.kode_sat AS satuan,
            ept.jumlah,
            ept.aturan_pakai,
            SUM(COALESCE(gb.stok, 0)) AS stok
          FROM eresep_paket_operasi_template ept
          LEFT JOIN databarang db ON db.kode_brng = ept.kd_obat
          LEFT JOIN gudangbarang gb ON gb.kode_brng = ept.kd_obat AND gb.kd_bangsal = ?
          WHERE ept.id_paket = ?
          GROUP BY ept.kd_obat, db.nama_brng, db.kode_sat, ept.jumlah, ept.aturan_pakai
          ORDER BY db.nama_brng ASC
        `,
        [stockBangsalCode, normalizedPackageId]
      );

      return {
        success: true,
        kd_bangsal: stockBangsalCode,
        data: rows.map((row) => ({
          kode_brng: row.kode_brng,
          nama_brng: row.nama_brng,
          satuan: row.satuan,
          jumlah: row.jumlah,
          aturan_pakai: row.aturan_pakai,
          stok: Number(row.stok) || 0
        }))
      };
    } catch (error) {
      console.error('Error getting package items:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get compound methods
  async getCompoundMethods() {
    const query = `SELECT * FROM metode_racik ORDER BY nm_racik`;
    
    try {
      const result = await executeQuery(query);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Error getting compound methods:', error);
      throw error;
    }
  }

  // Create new prescription
  async createPrescription(no_rawat, kd_dokter, medicines, compounds, prescriptionDate, prescriptionStatus) {
    if (!no_rawat || !kd_dokter) {
      throw new Error('no_rawat and kd_dokter are required');
    }

    const connection = await getConnection();
    
    try {
      await connection.beginTransaction();
      const normalizedPrescriptionDate = this.normalizePrescriptionDate(prescriptionDate) || new Date().toISOString().slice(0, 10);
      const resolvedPrescriptionStatus = await this.resolvePrescriptionStatus(connection, no_rawat, prescriptionStatus);
      const stockBangsalCode = await this.resolveStockBangsalCode(connection, no_rawat, resolvedPrescriptionStatus);
      await this.validateMedicineStock(connection, stockBangsalCode, medicines);
      
      // Generate no_resep dengan format YYYYMMDD + 5 digit urutan harian.
      const datePrefix = normalizedPrescriptionDate.replace(/-/g, '');
      const [sequenceRows] = await connection.execute(
        `
          SELECT MAX(no_resep) AS last_no_resep
          FROM resep_obat
          WHERE no_resep LIKE ?
        `,
        [`${datePrefix}%`]
      );
      const lastNoResep = sequenceRows[0]?.last_no_resep || '';
      const lastSequence = Number(String(lastNoResep).slice(datePrefix.length)) || 0;
      const nextSequence = String(lastSequence + 1).padStart(5, '0');
      const no_resep = `${datePrefix}${nextSequence}`;
      
      // Insert main prescription
      const insertPrescriptionQuery = `
        INSERT INTO resep_obat (no_resep, tgl_perawatan, jam, no_rawat, kd_dokter, tgl_peresepan, jam_peresepan, status)
        VALUES (?, '0000-00-00', '00:00:00', ?, ?, ?, CURTIME(), ?)
      `;
      
      await connection.execute(insertPrescriptionQuery, [
        no_resep,
        no_rawat,
        kd_dokter,
        normalizedPrescriptionDate,
        resolvedPrescriptionStatus
      ]);
      
      // Insert medicines
      if (medicines && medicines.length > 0) {
        for (const medicine of medicines) {
          const insertMedicineQuery = `
            INSERT INTO resep_dokter (no_resep, kode_brng, jml, aturan_pakai)
            VALUES (?, ?, ?, ?)
          `;
          await connection.execute(insertMedicineQuery, [no_resep, medicine.kode_brng, medicine.jml, medicine.aturan_pakai]);
        }
      }
      
      // Insert compounds
      if (compounds && compounds.length > 0) {
        for (const compound of compounds) {
          const insertCompoundQuery = `
            INSERT INTO resep_dokter_racikan (no_resep, no_racik, nama_racik, kd_racik, jml_dr, aturan_pakai, keterangan)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;
          await connection.execute(insertCompoundQuery, [no_resep, compound.no_racik, compound.nama_racik, compound.kd_racik, compound.jml_dr, compound.aturan_pakai, compound.keterangan]);
        }
      }
      
      await connection.commit();
      
      return {
        success: true,
        no_resep
      };
    } catch (error) {
      await connection.rollback();
      console.error('Error creating prescription:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Update existing prescription
  async updatePrescription(no_resep, medicines, compounds, prescriptionDate, prescriptionStatus, username = '') {
    if (!no_resep) {
      throw new Error('no_resep is required');
    }

    const connection = await getConnection();
    
    try {
      await connection.beginTransaction();
      const normalizedUsername = String(username || '').trim();

      if (normalizedUsername) {
        const [ownerRows] = await connection.execute(
          'SELECT kd_dokter FROM resep_obat WHERE no_resep = ? LIMIT 1',
          [no_resep]
        );

        if (!ownerRows.length) {
          throw new Error('Resep tidak ditemukan atau sudah dihapus');
        }

        if (String(ownerRows[0].kd_dokter || '').trim() !== normalizedUsername) {
          throw new Error('Anda tidak berhak mengedit resep ini');
        }
      }

      const normalizedPrescriptionDate = this.normalizePrescriptionDate(prescriptionDate);
      const normalizedPrescriptionStatus = this.normalizePrescriptionStatus(prescriptionStatus);

      const [headerRows] = await connection.execute(
        `
          SELECT no_rawat, status
          FROM resep_obat
          WHERE no_resep = ?
          LIMIT 1
        `,
        [no_resep]
      );

      if (!headerRows.length) {
        throw new Error('Resep tidak ditemukan atau sudah dihapus');
      }

      const noRawatHeader = String(headerRows[0].no_rawat || '').trim();
      const resolvedStatus = normalizedPrescriptionStatus || (await this.resolvePrescriptionStatus(connection, noRawatHeader, headerRows[0].status));
      const stockBangsalCode = await this.resolveStockBangsalCode(connection, noRawatHeader, resolvedStatus);
      await this.validateMedicineStock(connection, stockBangsalCode, medicines);

      const headerUpdates = [];
      const headerParams = [];

      if (normalizedPrescriptionDate) {
        headerUpdates.push('tgl_peresepan = ?');
        headerParams.push(normalizedPrescriptionDate);
      }

      if (normalizedPrescriptionStatus) {
        headerUpdates.push('status = ?');
        headerParams.push(normalizedPrescriptionStatus);
      }

      if (headerUpdates.length > 0) {
        await connection.execute(
          `UPDATE resep_obat SET ${headerUpdates.join(', ')} WHERE no_resep = ?`,
          [...headerParams, no_resep]
        );
      }
      
      // Delete existing medicines and compounds
      await connection.execute('DELETE FROM resep_dokter WHERE no_resep = ?', [no_resep]);
      await connection.execute('DELETE FROM resep_dokter_racikan WHERE no_resep = ?', [no_resep]);
      
      // Insert updated medicines
      if (medicines && medicines.length > 0) {
        for (const medicine of medicines) {
          const insertMedicineQuery = `
            INSERT INTO resep_dokter (no_resep, kode_brng, jml, aturan_pakai)
            VALUES (?, ?, ?, ?)
          `;
          await connection.execute(insertMedicineQuery, [no_resep, medicine.kode_brng, medicine.jml, medicine.aturan_pakai]);
        }
      }
      
      // Insert updated compounds
      if (compounds && compounds.length > 0) {
        for (const compound of compounds) {
          const insertCompoundQuery = `
            INSERT INTO resep_dokter_racikan (no_resep, no_racik, nama_racik, kd_racik, jml_dr, aturan_pakai, keterangan)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `;
          await connection.execute(insertCompoundQuery, [no_resep, compound.no_racik, compound.nama_racik, compound.kd_racik, compound.jml_dr, compound.aturan_pakai, compound.keterangan]);
        }
      }
      
      await connection.commit();
      
      return {
        success: true
      };
    } catch (error) {
      await connection.rollback();
      console.error('Error updating prescription:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Delete prescription
  async deletePrescription(no_resep, username = '') {
    if (!no_resep) {
      throw new Error('no_resep is required');
    }

    const connection = await getConnection();
    
    try {
      await connection.beginTransaction();
      const normalizedUsername = String(username || '').trim();

      if (normalizedUsername) {
        const [ownerRows] = await connection.execute(
          'SELECT kd_dokter FROM resep_obat WHERE no_resep = ? LIMIT 1',
          [no_resep]
        );

        if (!ownerRows.length) {
          throw new Error('Resep tidak ditemukan atau sudah dihapus');
        }

        if (String(ownerRows[0].kd_dokter || '').trim() !== normalizedUsername) {
          throw new Error('Anda tidak berhak menghapus resep ini');
        }
      }
      
      // Delete related records first
      await connection.execute('DELETE FROM resep_dokter WHERE no_resep = ?', [no_resep]);
      await connection.execute('DELETE FROM resep_dokter_racikan WHERE no_resep = ?', [no_resep]);
      
      // Delete main prescription
      await connection.execute('DELETE FROM resep_obat WHERE no_resep = ?', [no_resep]);
      
      await connection.commit();
      
      return {
        success: true
      };
    } catch (error) {
      await connection.rollback();
      console.error('Error deleting prescription:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default new PrescriptionDataService();
