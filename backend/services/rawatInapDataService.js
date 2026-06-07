import db from '../config/database.js';

class RawatInapDataService {
  static shouldKeepMovementRows(statusPulang) {
    return String(statusPulang || '').trim() === 'pindah-kamar';
  }

  static applyStatusRawatFilter(whereConditions, params, statusPulang) {
    const normalizedStatus = String(statusPulang || 'all').trim();

    if (!normalizedStatus || normalizedStatus === 'all') {
      return;
    }

    if (normalizedStatus === 'masih-dirawat') {
      whereConditions.push(`COALESCE(ki.stts_pulang, '') = '-'`);
      return;
    }

    if (normalizedStatus === 'pindah-kamar') {
      whereConditions.push(`COALESCE(ki.stts_pulang, '') = 'Pindah Kamar'`);
      return;
    }

    if (normalizedStatus === 'sudah-pulang') {
      whereConditions.push(`COALESCE(ki.stts_pulang, '') NOT IN ('', '-', 'Pindah Kamar')`);
      return;
    }

    whereConditions.push('ki.stts_pulang = ?');
    params.push(normalizedStatus);
  }

  static getBaseFilters({
    search = "",
    statusPulang = "all",
    username = "",
    startDate,
    endDate
  }) {
    const whereConditions = ['ki.tgl_masuk IS NOT NULL'];
    const params = [];
    const normalizedUsername = String(username || '').trim();

    if (normalizedUsername) {
      whereConditions.push(`EXISTS (
        SELECT 1
        FROM dpjp_ranap dr_user
        WHERE dr_user.no_rawat = ki.no_rawat
          AND dr_user.kd_dokter = ?
      )`);
      params.push(normalizedUsername);
    }

    if (search && search.trim()) {
      whereConditions.push(`(
        p.nm_pasien LIKE ? OR
        p.no_rkm_medis LIKE ? OR
        rp.no_rawat LIKE ? OR
        d.nm_dokter LIKE ? OR
        k.kd_kamar LIKE ? OR
        b.nm_bangsal LIKE ?
      )`);
      const searchParam = `%${search.trim()}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    this.applyStatusRawatFilter(whereConditions, params, statusPulang);

    if (startDate && endDate) {
      whereConditions.push('DATE(ki.tgl_masuk) BETWEEN ? AND ?');
      params.push(startDate, endDate);
    }

    return {
      whereConditions,
      params,
      normalizedUsername
    };
  }

  static getTabFilter(normalizedTab = 'rawat-inap', normalizedUsername = '') {
    if (normalizedTab === 'rawat-bersama') {
      if (!normalizedUsername) {
        return { condition: '1 = 0', params: [] };
      }

      return {
        condition: `EXISTS (
          SELECT 1
          FROM dpjp_ranap dr_raber
          WHERE dr_raber.no_rawat = ki.no_rawat
            AND dr_raber.kd_dokter = ?
            AND dr_raber.jenis_dpjp = 'Raber'
        )`,
        params: [normalizedUsername]
      };
    }

    if (normalizedTab === 'rawat-gabung') {
      return {
        condition: `EXISTS (
          SELECT 1
          FROM dpjp_ranap dr_multi
          WHERE dr_multi.no_rawat = ki.no_rawat
          GROUP BY dr_multi.no_rawat
          HAVING COUNT(DISTINCT dr_multi.kd_dokter) > 1
        )`,
        params: []
      };
    }

    if (!normalizedUsername) {
      return { condition: '1 = 0', params: [] };
    }

    return {
      condition: `EXISTS (
        SELECT 1
        FROM dpjp_ranap dr_main
        WHERE dr_main.no_rawat = ki.no_rawat
          AND dr_main.kd_dokter = ?
          AND COALESCE(dr_main.jenis_dpjp, 'Utama') <> 'Raber'
      )`,
      params: [normalizedUsername]
    };
  }

  static getFromClause() {
    return `
      FROM kamar_inap ki
      LEFT JOIN reg_periksa rp ON ki.no_rawat = rp.no_rawat
      LEFT JOIN pasien p ON rp.no_rkm_medis = p.no_rkm_medis
      LEFT JOIN dpjp_ranap dr ON ki.no_rawat = dr.no_rawat
      LEFT JOIN dokter d ON dr.kd_dokter = d.kd_dokter
      LEFT JOIN kamar k ON ki.kd_kamar = k.kd_kamar
      LEFT JOIN bangsal b ON k.kd_bangsal = b.kd_bangsal
    `;
  }

  static getGroupedCountQuery(fromClause, whereClause, keepMovementRows = false) {
    if (keepMovementRows) {
      return `
        SELECT COUNT(*) as total
        FROM (
          SELECT ki.no_rawat
          ${fromClause}
          ${whereClause}
          GROUP BY ki.no_rawat, p.no_rkm_medis, p.nm_pasien, p.jk, p.tgl_lahir,
                   ki.tgl_masuk, ki.tgl_keluar, ki.diagnosa_awal, ki.diagnosa_akhir,
                   ki.stts_pulang, k.kd_kamar, b.nm_bangsal, rp.tgl_registrasi,
                   rp.jam_reg, rp.status_lanjut, ki.lama, ki.trf_kamar
        ) counted_rows
      `;
    }

    return `
      SELECT COUNT(DISTINCT ki.no_rawat) as total
      ${fromClause}
      ${whereClause}
    `;
  }

  static async getTabCounts(baseWhereConditions, baseParams, normalizedUsername, statusPulang = 'all') {
    const fromClause = this.getFromClause();
    const keepMovementRows = this.shouldKeepMovementRows(statusPulang);
    const countTabs = [
      { key: 'rawat_inap', tab: 'rawat-inap' },
      { key: 'rawat_bersama', tab: 'rawat-bersama' },
      { key: 'rawat_gabung', tab: 'rawat-gabung' }
    ];

    const countEntries = await Promise.all(
      countTabs.map(async ({ key, tab }) => {
        const tabFilter = this.getTabFilter(tab, normalizedUsername);
        const whereConditions = [...baseWhereConditions, tabFilter.condition];
        const params = [...baseParams, ...tabFilter.params];
        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
        const countQuery = this.getGroupedCountQuery(fromClause, whereClause, keepMovementRows);
        const [countResult] = await db.execute(countQuery, params);

        return [key, countResult[0]?.total || 0];
      })
    );

    return Object.fromEntries(countEntries);
  }

  static formatDateOnly(dateStr) {
    if (!dateStr) return '';
    
    // Handle MySQL DATE format (YYYY-MM-DD)
    if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateStr;
    }
    
    // Handle Date object or ISO string
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error formatting date:', dateStr, error);
      return '';
    }
  }

  static async getRawatInapData({
    page = "1",
    itemsPerPage = "50", 
    search = "",
    statusPulang = "all",
    username = "",
    tab = "rawat-inap",
    startDate,
    endDate,
    includeTabCounts = true,
    countsOnly = false
  }) {
    try {
      console.log('=== Rawat Inap Data Request ===');
      console.log('Request params:', { page, itemsPerPage, search, statusPulang, username, tab, startDate, endDate });

      // Validate and limit itemsPerPage
      const limit = parseInt(itemsPerPage) === -1 || parseInt(itemsPerPage) > 1000 ? 10000 : Math.min(parseInt(itemsPerPage), 1000);
      const offset = (parseInt(page) - 1) * (limit === 10000 ? 0 : limit);
      console.log('Pagination - Page:', page, 'Items per page:', limit, 'Offset:', offset);

      const {
        whereConditions: baseWhereConditions,
        params: baseParams,
        normalizedUsername
      } = this.getBaseFilters({
        search,
        statusPulang,
        username,
        startDate,
        endDate
      });
      const normalizedTab = String(tab || 'rawat-inap').trim();
      const shouldIncludeTabCounts = includeTabCounts === true || includeTabCounts === 'true';
      const shouldReturnCountsOnly = countsOnly === true || countsOnly === 'true';
      const tabFilter = this.getTabFilter(normalizedTab, normalizedUsername);
      const whereConditions = [...baseWhereConditions, tabFilter.condition];
      const params = [...baseParams, ...tabFilter.params];
      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const fromClause = this.getFromClause();
      const keepMovementRows = this.shouldKeepMovementRows(statusPulang);
      console.log('WHERE clause:', whereClause);
      console.log('Parameters:', params);

      const query = keepMovementRows
        ? `
            SELECT 
              ki.no_rawat,
              p.no_rkm_medis,
              p.nm_pasien,
              p.jk as jenis_kelamin,
              p.tgl_lahir,
              ki.tgl_masuk,
              ki.tgl_keluar,
              ki.diagnosa_awal,
              ki.diagnosa_akhir,
              ki.stts_pulang,
              k.kd_kamar,
              b.nm_bangsal,
              GROUP_CONCAT(DISTINCT CONCAT(d.nm_dokter, ' (', COALESCE(dr.jenis_dpjp, 'Tidak Diketahui'), ')') SEPARATOR ', ') as dokter_dpjp,
              rp.tgl_registrasi,
              rp.jam_reg,
              rp.status_lanjut,
              CASE
                WHEN COALESCE(ki.stts_pulang, '') IN ('', '-', 'Pindah Kamar')
                  THEN DATEDIFF(CURDATE(), DATE(ki.tgl_masuk)) + 1
                ELSE DATEDIFF(DATE(ki.tgl_keluar), DATE(ki.tgl_masuk)) + 1
              END as lama,
              ki.trf_kamar
            ${fromClause}
            ${whereClause}
            GROUP BY ki.no_rawat, p.no_rkm_medis, p.nm_pasien, p.jk, p.tgl_lahir,
                     ki.tgl_masuk, ki.tgl_keluar, ki.diagnosa_awal, ki.diagnosa_akhir,
                     ki.stts_pulang, k.kd_kamar, b.nm_bangsal, rp.tgl_registrasi,
                     rp.jam_reg, rp.status_lanjut, ki.lama, ki.trf_kamar
            ORDER BY ki.tgl_masuk DESC
            ${limit === 10000 ? '' : `LIMIT ${limit} OFFSET ${offset}`}
          `
        : `
            SELECT 
              ki.no_rawat,
              p.no_rkm_medis,
              p.nm_pasien,
              p.jk as jenis_kelamin,
              p.tgl_lahir,
              MIN(ki.tgl_masuk) as tgl_masuk,
              NULLIF(
                SUBSTRING_INDEX(
                  GROUP_CONCAT(COALESCE(DATE_FORMAT(ki.tgl_keluar, '%Y-%m-%d'), '') ORDER BY ki.tgl_masuk DESC SEPARATOR '||'),
                  '||',
                  1
                ),
                ''
              ) as tgl_keluar,
              SUBSTRING_INDEX(
                GROUP_CONCAT(COALESCE(ki.diagnosa_awal, '') ORDER BY ki.tgl_masuk ASC SEPARATOR '||'),
                '||',
                1
              ) as diagnosa_awal,
              SUBSTRING_INDEX(
                GROUP_CONCAT(COALESCE(ki.diagnosa_akhir, '') ORDER BY ki.tgl_masuk DESC SEPARATOR '||'),
                '||',
                1
              ) as diagnosa_akhir,
              SUBSTRING_INDEX(
                GROUP_CONCAT(COALESCE(ki.stts_pulang, '') ORDER BY ki.tgl_masuk DESC SEPARATOR '||'),
                '||',
                1
              ) as stts_pulang,
              SUBSTRING_INDEX(
                GROUP_CONCAT(COALESCE(k.kd_kamar, '') ORDER BY ki.tgl_masuk DESC SEPARATOR '||'),
                '||',
                1
              ) as kd_kamar,
              SUBSTRING_INDEX(
                GROUP_CONCAT(COALESCE(b.nm_bangsal, '') ORDER BY ki.tgl_masuk DESC SEPARATOR '||'),
                '||',
                1
              ) as nm_bangsal,
              GROUP_CONCAT(DISTINCT CONCAT(d.nm_dokter, ' (', COALESCE(dr.jenis_dpjp, 'Tidak Diketahui'), ')') SEPARATOR ', ') as dokter_dpjp,
              rp.tgl_registrasi,
              rp.jam_reg,
              rp.status_lanjut,
              CASE
                WHEN SUBSTRING_INDEX(
                  GROUP_CONCAT(COALESCE(ki.stts_pulang, '') ORDER BY ki.tgl_masuk DESC SEPARATOR '||'),
                  '||',
                  1
                ) IN ('', '-', 'Pindah Kamar')
                  THEN DATEDIFF(CURDATE(), MIN(DATE(ki.tgl_masuk))) + 1
                ELSE DATEDIFF(
                  STR_TO_DATE(
                    NULLIF(
                      SUBSTRING_INDEX(
                        GROUP_CONCAT(COALESCE(DATE_FORMAT(ki.tgl_keluar, '%Y-%m-%d'), '') ORDER BY ki.tgl_masuk DESC SEPARATOR '||'),
                        '||',
                        1
                      ),
                      ''
                    ),
                    '%Y-%m-%d'
                  ),
                  MIN(DATE(ki.tgl_masuk))
                ) + 1
              END as lama,
              SUBSTRING_INDEX(
                GROUP_CONCAT(COALESCE(ki.trf_kamar, '') ORDER BY ki.tgl_masuk DESC SEPARATOR '||'),
                '||',
                1
              ) as trf_kamar
            ${fromClause}
            ${whereClause}
            GROUP BY ki.no_rawat, p.no_rkm_medis, p.nm_pasien, p.jk, p.tgl_lahir,
                     rp.tgl_registrasi, rp.jam_reg, rp.status_lanjut
            ORDER BY MIN(ki.tgl_masuk) DESC
            ${limit === 10000 ? '' : `LIMIT ${limit} OFFSET ${offset}`}
          `;

      let total = 0;
      let data = [];
      let tabCounts = null;

      if (!shouldReturnCountsOnly) {
        const countQuery = this.getGroupedCountQuery(fromClause, whereClause, keepMovementRows);

        console.log('Executing main query:', query);
        const queryParams = params;
        console.log('Query parameters:', queryParams);

        const [countResult] = await db.execute(countQuery, params);
        total = countResult[0]?.total || 0;

        const [dataResult] = await db.execute(query, queryParams);
        data = dataResult || [];

        console.log('Total count result:', total);
        console.log('Data result rows count:', data.length);
        console.log('Sample data row:', data[0]);
        console.log(`Found ${data.length} records out of ${total} total`);
      }

      if (shouldIncludeTabCounts || shouldReturnCountsOnly) {
        tabCounts = await this.getTabCounts(baseWhereConditions, baseParams, normalizedUsername, statusPulang);
        console.log('Tab counts:', tabCounts);
      }

      // Format date fields
      const formattedData = data.map(row => ({
        ...row,
        tgl_lahir: this.formatDateOnly(row.tgl_lahir),
        tgl_masuk: this.formatDateOnly(row.tgl_masuk),
        tgl_keluar: this.formatDateOnly(row.tgl_keluar),
        tgl_registrasi: this.formatDateOnly(row.tgl_registrasi)
      }));

      return {
        success: true,
        data: formattedData,
        total,
        ...(tabCounts ? { tabCounts } : {}),
        limit,
        offset,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      };

    } catch (error) {
      console.error('Error in rawat-inap-data service:', error);
      throw error;
    }
  }
}

export default RawatInapDataService;
