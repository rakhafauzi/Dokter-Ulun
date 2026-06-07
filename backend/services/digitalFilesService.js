import { executeQuery } from '../config/database.js';

class DigitalFilesService {
  static getUploadsBaseUrl() {
    return String(process.env.DIGITAL_FILES_BASE_URL || '').trim().replace(/\/+$/, '');
  }

  static buildFileUrl(lokasiFile) {
    const baseUrl = this.getUploadsBaseUrl();
    const normalizedPath = String(lokasiFile || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');

    if (!baseUrl || !normalizedPath) {
      return '';
    }

    const encodedPath = normalizedPath
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${baseUrl}/${encodedPath}`;
  }

  static inferMimeType(filePath) {
    const normalizedPath = String(filePath || '').toLowerCase();

    if (normalizedPath.endsWith('.pdf')) return 'application/pdf';
    if (normalizedPath.endsWith('.jpg') || normalizedPath.endsWith('.jpeg')) return 'image/jpeg';
    if (normalizedPath.endsWith('.png')) return 'image/png';
    if (normalizedPath.endsWith('.gif')) return 'image/gif';
    if (normalizedPath.endsWith('.webp')) return 'image/webp';
    if (normalizedPath.endsWith('.doc')) return 'application/msword';
    if (normalizedPath.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    return 'application/octet-stream';
  }

  static extractFileName(filePath) {
    const normalizedPath = String(filePath || '').replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(Boolean);
    return parts[parts.length - 1] || normalizedPath || '-';
  }

  static async getFiles(noRawat) {
    if (!noRawat) {
      throw new Error('no_rawat wajib diisi');
    }

    const sql = `
      SELECT
        bdp.no_rawat,
        bdp.kode,
        bdp.lokasi_file,
        COALESCE(mbd.nama, bdp.kode) AS nama_berkas
      FROM berkas_digital_perawatan bdp
      LEFT JOIN master_berkas_digital mbd ON mbd.kode = bdp.kode
      WHERE bdp.no_rawat = ?
      ORDER BY COALESCE(mbd.nama, bdp.kode) ASC, bdp.lokasi_file ASC
    `;

    const rows = await executeQuery(sql, [noRawat]);
    const data = rows.map((row) => {
      const lokasiFile = String(row.lokasi_file || '').trim();
      const fileName = this.extractFileName(lokasiFile);
      const fileUrl = this.buildFileUrl(lokasiFile);

      return {
        id: `${row.no_rawat}-${row.kode}-${lokasiFile}`,
        no_rawat: row.no_rawat,
        kode: String(row.kode || '').trim(),
        nama_berkas: String(row.nama_berkas || row.kode || '').trim(),
        lokasi_file: lokasiFile,
        nama_file: fileName,
        tipe_file: this.inferMimeType(fileName),
        url: fileUrl,
      };
    });

    return {
      success: true,
      data,
      uploads_base_url: this.getUploadsBaseUrl(),
    };
  }
}

export default DigitalFilesService;
