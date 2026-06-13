import pool from '../config/database.js';

class TriageIgdService {
  static normalizeText(value, fallback = '') {
    if (value === null || value === undefined) {
      return fallback;
    }

    return String(value).trim();
  }

  static toStoredValue(value, fallback = '') {
    const normalized = this.normalizeText(value, fallback);
    return normalized || fallback;
  }

  static normalizeSelectedActions(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return Array.from(
      new Set(
        value
          .map((item) => this.normalizeText(item))
          .filter(Boolean)
      )
    );
  }

  static calculateImt(berat, tinggi) {
    const numericWeight = Number.parseFloat(String(berat ?? '').replace(',', '.'));
    const numericHeight = Number.parseFloat(String(tinggi ?? '').replace(',', '.'));

    if (!Number.isFinite(numericWeight) || !Number.isFinite(numericHeight) || numericHeight <= 0) {
      return '';
    }

    const heightInMeters = numericHeight / 100;
    const imt = numericWeight / (heightInMeters * heightInMeters);
    return Number.isFinite(imt) ? imt.toFixed(2) : '';
  }

  static async getMasterOptions() {
    const connection = await pool.getConnection();

    try {
      const [rows] = await connection.execute(
        `
          SELECT kd_level, nm_level, kd_tindakan, nm_tindakan
          FROM master_triase_igd
          WHERE status = '1'
          ORDER BY kd_level ASC, nm_pemeriksaan ASC, nm_tindakan ASC
        `
      );

      return rows.map((row) => ({
        kd_level: this.normalizeText(row.kd_level),
        nm_level: this.normalizeText(row.nm_level),
        kd_tindakan: this.normalizeText(row.kd_tindakan),
        nm_tindakan: this.normalizeText(row.nm_tindakan)
      }));
    } finally {
      connection.release();
    }
  }

  static async getTriageByNoRawat(noRawat) {
    const normalizedNoRawat = this.normalizeText(noRawat);
    if (!normalizedNoRawat) {
      throw new Error('no_rawat wajib diisi');
    }

    const connection = await pool.getConnection();

    try {
      const [[row]] = await connection.execute(
        `
          SELECT *
          FROM data_triase_igd
          WHERE no_rawat = ?
          LIMIT 1
        `,
        [normalizedNoRawat]
      );

      if (!row) {
        return null;
      }

      const [detailRows] = await connection.execute(
        `
          SELECT
            dpt.kd_tindakan,
            COALESCE(mti.nm_tindakan, '') AS nm_tindakan,
            COALESCE(mti.kd_level, '') AS kd_level,
            COALESCE(mti.nm_level, '') AS nm_level
          FROM detail_pemeriksaan_triase dpt
          LEFT JOIN master_triase_igd mti ON mti.kd_tindakan = dpt.kd_tindakan
          WHERE dpt.no_rawat = ?
          ORDER BY mti.kd_level ASC, mti.nm_tindakan ASC
        `,
        [normalizedNoRawat]
      );

      const firstAction = detailRows[0] || {};

      return {
        no_rawat: normalizedNoRawat,
        tanggal: row.tanggal,
        jam: row.jam,
        kd_dokter: this.normalizeText(row.kd_dokter),
        kd_petugas: this.normalizeText(row.kd_petugas),
        namakasus: this.normalizeText(row.namakasus),
        stts_diantar: this.normalizeText(row.stts_diantar),
        transportasi: this.normalizeText(row.transportasi),
        stts_fungsional: this.normalizeText(row.stts_fungsional),
        psikologis: this.normalizeText(row.psikologis),
        stts_tinggal: this.normalizeText(row.stts_tinggal),
        keluhan_utama: this.normalizeText(row.keluhan_utama),
        riwayat_penyakit: this.normalizeText(row.riwayat_penyakit),
        saturasi: this.normalizeText(row.saturasi),
        periksafisik: this.normalizeText(row.periksafisik),
        skala_nyeri: this.normalizeText(row.skala_nyeri),
        resiko_jatuh: this.normalizeText(row.resiko_jatuh),
        diagnosis: this.normalizeText(row.diagnosis),
        tindakan: this.normalizeText(row.tindakan),
        keterangan: this.normalizeText(row.keterangan),
        kd_level: this.normalizeText(firstAction.kd_level),
        nm_level: this.normalizeText(firstAction.nm_level),
        selected_tindakan: detailRows.map((detail) => ({
          kd_tindakan: this.normalizeText(detail.kd_tindakan),
          nm_tindakan: this.normalizeText(detail.nm_tindakan)
        }))
      };
    } finally {
      connection.release();
    }
  }

  static async saveTriage(payload) {
    const connection = await pool.getConnection();

    try {
      const no_rawat = this.normalizeText(payload.no_rawat);
      const kd_dokter = this.normalizeText(payload.kd_dokter);
      const kd_petugas = this.normalizeText(payload.kd_petugas || payload.username || payload.kd_dokter);
      const tanggal = this.normalizeText(payload.tanggal);
      const jam = this.normalizeText(payload.jam);

      if (!no_rawat || !kd_dokter || !tanggal || !jam) {
        throw new Error('no_rawat, kd_dokter, tanggal, dan jam wajib diisi');
      }

      const selectedActions = this.normalizeSelectedActions(payload.selected_tindakan);
      const calculatedImt = this.calculateImt(payload.berat, payload.tinggi);

      await connection.beginTransaction();

      await connection.execute(
        `
          INSERT INTO data_triase_igd (
            no_rawat, tanggal, jam, kd_dokter, kd_petugas, namakasus, stts_diantar, transportasi,
            stts_fungsional, psikologis, stts_tinggal, keluhan_utama, riwayat_penyakit, saturasi,
            lk, lila, imt, ld, lp, edukasi, riwayat_penyakit_dahulu, riwayat_pengobatan, riwayat_masuk_rs,
            riwayat_penyakit_keluarga, riwayat_operasi, riwayat_trauma, periksafisik, skala_nyeri,
            resiko_jatuh, nilai_resiko_jatuh, diagnosa_keperawatan, intervensi, diagnosis, tindakan, keterangan
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            tanggal = VALUES(tanggal),
            jam = VALUES(jam),
            kd_dokter = VALUES(kd_dokter),
            kd_petugas = VALUES(kd_petugas),
            namakasus = VALUES(namakasus),
            stts_diantar = VALUES(stts_diantar),
            transportasi = VALUES(transportasi),
            stts_fungsional = VALUES(stts_fungsional),
            psikologis = VALUES(psikologis),
            stts_tinggal = VALUES(stts_tinggal),
            keluhan_utama = VALUES(keluhan_utama),
            riwayat_penyakit = VALUES(riwayat_penyakit),
            saturasi = VALUES(saturasi),
            lk = VALUES(lk),
            lila = VALUES(lila),
            imt = VALUES(imt),
            ld = VALUES(ld),
            lp = VALUES(lp),
            edukasi = VALUES(edukasi),
            riwayat_penyakit_dahulu = VALUES(riwayat_penyakit_dahulu),
            riwayat_pengobatan = VALUES(riwayat_pengobatan),
            riwayat_masuk_rs = VALUES(riwayat_masuk_rs),
            riwayat_penyakit_keluarga = VALUES(riwayat_penyakit_keluarga),
            riwayat_operasi = VALUES(riwayat_operasi),
            riwayat_trauma = VALUES(riwayat_trauma),
            periksafisik = VALUES(periksafisik),
            skala_nyeri = VALUES(skala_nyeri),
            resiko_jatuh = VALUES(resiko_jatuh),
            nilai_resiko_jatuh = VALUES(nilai_resiko_jatuh),
            diagnosa_keperawatan = VALUES(diagnosa_keperawatan),
            intervensi = VALUES(intervensi),
            diagnosis = VALUES(diagnosis),
            tindakan = VALUES(tindakan),
            keterangan = VALUES(keterangan)
        `,
        [
          no_rawat,
          tanggal,
          jam,
          kd_dokter,
          kd_petugas,
          this.toStoredValue(payload.namakasus, 'Non Trauma'),
          this.toStoredValue(payload.stts_diantar),
          this.toStoredValue(payload.transportasi),
          this.toStoredValue(payload.stts_fungsional),
          this.toStoredValue(payload.psikologis, 'Stabil'),
          this.toStoredValue(payload.stts_tinggal),
          this.toStoredValue(payload.keluhan_utama),
          this.toStoredValue(payload.riwayat_penyakit),
          this.toStoredValue(payload.saturasi),
          this.toStoredValue(payload.lk),
          this.toStoredValue(payload.lila),
          this.toStoredValue(payload.imt, calculatedImt),
          this.toStoredValue(payload.ld),
          this.toStoredValue(payload.lp),
          this.toStoredValue(payload.edukasi),
          this.toStoredValue(payload.riwayat_penyakit_dahulu),
          this.toStoredValue(payload.riwayat_pengobatan),
          this.toStoredValue(payload.riwayat_masuk_rs),
          this.toStoredValue(payload.riwayat_penyakit_keluarga),
          this.toStoredValue(payload.riwayat_operasi),
          this.toStoredValue(payload.riwayat_trauma),
          this.toStoredValue(payload.periksafisik),
          this.toStoredValue(payload.skala_nyeri),
          this.toStoredValue(payload.resiko_jatuh),
          this.toStoredValue(payload.nilai_resiko_jatuh),
          this.toStoredValue(payload.diagnosa_keperawatan),
          this.toStoredValue(payload.intervensi),
          this.toStoredValue(payload.diagnosis),
          this.toStoredValue(payload.tindakan),
          this.toStoredValue(payload.keterangan)
        ]
      );

      await connection.execute(
        'DELETE FROM detail_pemeriksaan_triase WHERE no_rawat = ?',
        [no_rawat]
      );

      if (selectedActions.length > 0) {
        const detailPlaceholders = selectedActions.map(() => '(?, ?)').join(', ');
        const detailValues = selectedActions.flatMap((kdTindakan) => [no_rawat, kdTindakan]);

        await connection.execute(
          `INSERT INTO detail_pemeriksaan_triase (no_rawat, kd_tindakan) VALUES ${detailPlaceholders}`,
          detailValues
        );
      }

      await connection.commit();

      return {
        success: true,
        message: 'Triase IGD berhasil disimpan'
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default TriageIgdService;
