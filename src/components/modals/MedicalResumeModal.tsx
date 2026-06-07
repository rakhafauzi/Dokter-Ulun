import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2, Trash2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { API_URLS } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';

interface MedicalResume {
  no_rawat: string;
  kd_dokter: string;
  diagnosa_awal: string;
  alasan: string;
  keluhan_utama: string;
  pemeriksaan_fisik: string;
  jalannya_penyakit: string;
  pemeriksaan_penunjang: string;
  hasil_laborat: string;
  tindakan_dan_operasi: string;
  obat_di_rs: string;
  diagnosa_utama: string;
  kd_diagnosa_utama: string;
  diagnosa_sekunder: string;
  kd_diagnosa_sekunder: string;
  diagnosa_sekunder2: string;
  kd_diagnosa_sekunder2: string;
  diagnosa_sekunder3: string;
  kd_diagnosa_sekunder3: string;
  diagnosa_sekunder4: string;
  kd_diagnosa_sekunder4: string;
  prosedur_utama: string;
  kd_prosedur_utama: string;
  prosedur_sekunder: string;
  kd_prosedur_sekunder: string;
  prosedur_sekunder2: string;
  kd_prosedur_sekunder2: string;
  prosedur_sekunder3: string;
  kd_prosedur_sekunder3: string;
  alergi: string;
  diet: string;
  lab_belum: string;
  edukasi: string;
  cara_keluar: string;
  ket_keluar: string;
  keadaan: string;
  ket_keadaan: string;
  dilanjutkan: string;
  ket_dilanjutkan: string;
  kontrol: string;
  obat_pulang: string;
  no_rkm_medis?: string;
  nm_pasien?: string;
  jenis_kelamin?: string;
  tgl_lahir?: string;
  tgl_masuk?: string;
  tgl_keluar?: string;
  lama?: string;
  stts_pulang?: string;
  kd_kamar?: string;
  nm_bangsal?: string;
  dokter_dpjp?: string;
  dokter_reg?: string;
  dokter_penulis?: string;
  has_resume?: number;
}

interface MedicalResumeModalProps {
  isOpen: boolean;
  onClose: () => void;
  noRawat: string;
}

export const MedicalResumeModal: React.FC<MedicalResumeModalProps> = ({ isOpen, onClose, noRawat }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const currentDoctorCode = user?.kd_dokter || user?.username || '';
  const currentDoctorName = user?.name || user?.username || '-';
  const caraKeluarOptions = ['Atas Izin Dokter', 'Pindah RS', 'Pulang Atas Permintaan Sendiri', 'Lainnya'];
  const keadaanOptions = ['Membaik', 'Sembuh', 'Keadaan Khusus', 'Meninggal'];
  const dilanjutkanOptions = ['Kembali Ke RS', 'RS Lain', 'Dokter Luar', 'Puskesmes', 'Lainnya'];

  const createDefaultForm = useMemo(() => {
    return (): MedicalResume => ({
      no_rawat: noRawat,
      kd_dokter: currentDoctorCode,
      diagnosa_awal: '',
      alasan: '',
      keluhan_utama: '',
      pemeriksaan_fisik: '',
      jalannya_penyakit: '',
      pemeriksaan_penunjang: '',
      hasil_laborat: '',
      tindakan_dan_operasi: '',
      obat_di_rs: '',
      diagnosa_utama: '',
      kd_diagnosa_utama: '',
      diagnosa_sekunder: '',
      kd_diagnosa_sekunder: '',
      diagnosa_sekunder2: '',
      kd_diagnosa_sekunder2: '',
      diagnosa_sekunder3: '',
      kd_diagnosa_sekunder3: '',
      diagnosa_sekunder4: '',
      kd_diagnosa_sekunder4: '',
      prosedur_utama: '',
      kd_prosedur_utama: '',
      prosedur_sekunder: '',
      kd_prosedur_sekunder: '',
      prosedur_sekunder2: '',
      kd_prosedur_sekunder2: '',
      prosedur_sekunder3: '',
      kd_prosedur_sekunder3: '',
      alergi: '',
      diet: '',
      lab_belum: '',
      edukasi: '',
      cara_keluar: 'Atas Izin Dokter',
      ket_keluar: '',
      keadaan: 'Membaik',
      ket_keadaan: '',
      dilanjutkan: 'Kembali Ke RS',
      ket_dilanjutkan: '',
      kontrol: '',
      obat_pulang: '',
      dokter_penulis: currentDoctorName,
      has_resume: 0,
    });
  }, [currentDoctorCode, currentDoctorName, noRawat]);

  const [formData, setFormData] = useState<MedicalResume>(createDefaultForm);

  useEffect(() => {
    if (isOpen) {
      void fetchResume();
    }
  }, [isOpen, noRawat]);

  useEffect(() => {
    if (!loading) {
      setFormData((previous) => ({
        ...previous,
        no_rawat: noRawat,
        kd_dokter: previous.kd_dokter || currentDoctorCode,
        dokter_penulis: previous.dokter_penulis || currentDoctorName,
      }));
    }
  }, [currentDoctorCode, currentDoctorName, loading, noRawat]);

  const fetchResume = async () => {
    if (!noRawat) {
      setFormData(createDefaultForm());
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URLS.RESUME_PASIEN_DATA}/${encodeURIComponent(noRawat)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Gagal memuat resume pasien');
      }

      setFormData({
        ...createDefaultForm(),
        ...result.data,
        no_rawat: result.data.no_rawat || noRawat,
        kd_dokter: result.data.kd_dokter || currentDoctorCode,
        dokter_penulis: result.data.dokter_penulis || currentDoctorName,
        kontrol: result.data.kontrol || '',
        has_resume: Number(result.data.has_resume || 0),
      });
    } catch (error) {
      console.error('Error fetching resumes:', error);
      toast({
        title: "Error",
        description: "Gagal memuat resume medis",
        variant: "destructive",
      });
      setFormData(createDefaultForm());
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!noRawat) {
      toast({
        title: "Error",
        description: "No. rawat tidak ditemukan",
        variant: "destructive",
      });
      return;
    }

    if (!currentDoctorCode) {
      toast({
        title: "Error",
        description: "Identitas dokter login tidak ditemukan",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`${API_URLS.RESUME_PASIEN_DATA}/${encodeURIComponent(noRawat)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          kd_dokter: currentDoctorCode,
          no_rawat: noRawat,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal menyimpan resume medis');
      }

      await fetchResume();
      toast({
        title: "Berhasil",
        description: "Resume medis berhasil disimpan",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Gagal menyimpan resume medis",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!noRawat) {
      return;
    }

    if (confirm('Apakah Anda yakin ingin menghapus resume medis ini?')) {
      try {
        setDeleting(true);
        const response = await fetch(`${API_URLS.RESUME_PASIEN_DATA}/${encodeURIComponent(noRawat)}`, {
          method: 'DELETE',
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Gagal menghapus resume medis');
        }

        await fetchResume();
        toast({
          title: "Berhasil",
          description: "Resume medis berhasil dihapus",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Gagal menghapus resume medis",
          variant: "destructive",
        });
      } finally {
        setDeleting(false);
      }
    }
  };

  const updateField = <K extends keyof MedicalResume>(field: K, value: MedicalResume[K]) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Resume Pasien
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informasi Rawat Inap</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">No. Rawat</p>
                <p className="font-medium">{formData.no_rawat || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">No. RM / Pasien</p>
                <p className="font-medium">{formData.no_rkm_medis || '-'} {formData.nm_pasien ? `- ${formData.nm_pasien}` : ''}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Dokter Penulis</p>
                <p className="font-medium">{formData.dokter_penulis || currentDoctorName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tanggal Masuk</p>
                <p className="font-medium">{formData.tgl_masuk || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tanggal Keluar</p>
                <p className="font-medium">{formData.tgl_keluar || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Bangsal / Kamar</p>
                <p className="font-medium">{formData.nm_bangsal || '-'} {formData.kd_kamar ? `- ${formData.kd_kamar}` : ''}</p>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="py-10 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Memuat data resume pasien...
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{formData.has_resume ? 'Edit Resume Pasien' : 'Tambah Resume Pasien'}</span>
                  <div className="flex gap-2">
                    {formData.has_resume ? (
                      <Button variant="destructive" onClick={handleDelete} disabled={deleting || saving}>
                        {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        Hapus
                      </Button>
                    ) : null}
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Simpan
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="diagnosa_awal">Diagnosa Awal</Label>
                    <Input id="diagnosa_awal" value={formData.diagnosa_awal} onChange={(e) => updateField('diagnosa_awal', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="alasan">Alasan</Label>
                    <Input id="alasan" value={formData.alasan} onChange={(e) => updateField('alasan', e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="keluhan_utama">Keluhan Utama</Label>
                    <Textarea id="keluhan_utama" rows={3} value={formData.keluhan_utama} onChange={(e) => updateField('keluhan_utama', e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="pemeriksaan_fisik">Pemeriksaan Fisik</Label>
                    <Textarea id="pemeriksaan_fisik" rows={3} value={formData.pemeriksaan_fisik} onChange={(e) => updateField('pemeriksaan_fisik', e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="jalannya_penyakit">Jalannya Penyakit</Label>
                    <Textarea id="jalannya_penyakit" rows={3} value={formData.jalannya_penyakit} onChange={(e) => updateField('jalannya_penyakit', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="pemeriksaan_penunjang">Pemeriksaan Penunjang</Label>
                    <Textarea id="pemeriksaan_penunjang" rows={3} value={formData.pemeriksaan_penunjang} onChange={(e) => updateField('pemeriksaan_penunjang', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="hasil_laborat">Hasil Laborat</Label>
                    <Textarea id="hasil_laborat" rows={3} value={formData.hasil_laborat} onChange={(e) => updateField('hasil_laborat', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="tindakan_dan_operasi">Tindakan dan Operasi</Label>
                    <Textarea id="tindakan_dan_operasi" rows={3} value={formData.tindakan_dan_operasi} onChange={(e) => updateField('tindakan_dan_operasi', e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="obat_di_rs">Obat di RS</Label>
                    <Textarea id="obat_di_rs" rows={3} value={formData.obat_di_rs} onChange={(e) => updateField('obat_di_rs', e.target.value)} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">Diagnosa</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="diagnosa_utama">Diagnosa Utama</Label>
                      <Input id="diagnosa_utama" value={formData.diagnosa_utama} onChange={(e) => updateField('diagnosa_utama', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="kd_diagnosa_utama">Kode Diagnosa Utama</Label>
                      <Input id="kd_diagnosa_utama" value={formData.kd_diagnosa_utama} onChange={(e) => updateField('kd_diagnosa_utama', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="diagnosa_sekunder">Diagnosa Sekunder 1</Label>
                      <Input id="diagnosa_sekunder" value={formData.diagnosa_sekunder} onChange={(e) => updateField('diagnosa_sekunder', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="kd_diagnosa_sekunder">Kode Diagnosa Sekunder 1</Label>
                      <Input id="kd_diagnosa_sekunder" value={formData.kd_diagnosa_sekunder} onChange={(e) => updateField('kd_diagnosa_sekunder', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="diagnosa_sekunder2">Diagnosa Sekunder 2</Label>
                      <Input id="diagnosa_sekunder2" value={formData.diagnosa_sekunder2} onChange={(e) => updateField('diagnosa_sekunder2', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="kd_diagnosa_sekunder2">Kode Diagnosa Sekunder 2</Label>
                      <Input id="kd_diagnosa_sekunder2" value={formData.kd_diagnosa_sekunder2} onChange={(e) => updateField('kd_diagnosa_sekunder2', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="diagnosa_sekunder3">Diagnosa Sekunder 3</Label>
                      <Input id="diagnosa_sekunder3" value={formData.diagnosa_sekunder3} onChange={(e) => updateField('diagnosa_sekunder3', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="kd_diagnosa_sekunder3">Kode Diagnosa Sekunder 3</Label>
                      <Input id="kd_diagnosa_sekunder3" value={formData.kd_diagnosa_sekunder3} onChange={(e) => updateField('kd_diagnosa_sekunder3', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="diagnosa_sekunder4">Diagnosa Sekunder 4</Label>
                      <Input id="diagnosa_sekunder4" value={formData.diagnosa_sekunder4} onChange={(e) => updateField('diagnosa_sekunder4', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="kd_diagnosa_sekunder4">Kode Diagnosa Sekunder 4</Label>
                      <Input id="kd_diagnosa_sekunder4" value={formData.kd_diagnosa_sekunder4} onChange={(e) => updateField('kd_diagnosa_sekunder4', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">Prosedur</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="prosedur_utama">Prosedur Utama</Label>
                      <Input id="prosedur_utama" value={formData.prosedur_utama} onChange={(e) => updateField('prosedur_utama', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="kd_prosedur_utama">Kode Prosedur Utama</Label>
                      <Input id="kd_prosedur_utama" value={formData.kd_prosedur_utama} onChange={(e) => updateField('kd_prosedur_utama', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="prosedur_sekunder">Prosedur Sekunder 1</Label>
                      <Input id="prosedur_sekunder" value={formData.prosedur_sekunder} onChange={(e) => updateField('prosedur_sekunder', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="kd_prosedur_sekunder">Kode Prosedur Sekunder 1</Label>
                      <Input id="kd_prosedur_sekunder" value={formData.kd_prosedur_sekunder} onChange={(e) => updateField('kd_prosedur_sekunder', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="prosedur_sekunder2">Prosedur Sekunder 2</Label>
                      <Input id="prosedur_sekunder2" value={formData.prosedur_sekunder2} onChange={(e) => updateField('prosedur_sekunder2', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="kd_prosedur_sekunder2">Kode Prosedur Sekunder 2</Label>
                      <Input id="kd_prosedur_sekunder2" value={formData.kd_prosedur_sekunder2} onChange={(e) => updateField('kd_prosedur_sekunder2', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="prosedur_sekunder3">Prosedur Sekunder 3</Label>
                      <Input id="prosedur_sekunder3" value={formData.prosedur_sekunder3} onChange={(e) => updateField('prosedur_sekunder3', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="kd_prosedur_sekunder3">Kode Prosedur Sekunder 3</Label>
                      <Input id="kd_prosedur_sekunder3" value={formData.kd_prosedur_sekunder3} onChange={(e) => updateField('kd_prosedur_sekunder3', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold">Rencana Pulang</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="alergi">Alergi</Label>
                      <Input id="alergi" value={formData.alergi} onChange={(e) => updateField('alergi', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="kontrol">Kontrol</Label>
                      <Input id="kontrol" type="datetime-local" value={formData.kontrol || ''} onChange={(e) => updateField('kontrol', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="diet">Diet</Label>
                      <Textarea id="diet" rows={3} value={formData.diet} onChange={(e) => updateField('diet', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="lab_belum">Lab Belum</Label>
                      <Textarea id="lab_belum" rows={3} value={formData.lab_belum} onChange={(e) => updateField('lab_belum', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="edukasi">Edukasi</Label>
                      <Textarea id="edukasi" rows={3} value={formData.edukasi} onChange={(e) => updateField('edukasi', e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="obat_pulang">Obat Pulang</Label>
                      <Textarea id="obat_pulang" rows={3} value={formData.obat_pulang} onChange={(e) => updateField('obat_pulang', e.target.value)} />
                    </div>
                    <div>
                      <Label>Cara Keluar</Label>
                      <Select value={formData.cara_keluar} onValueChange={(value) => updateField('cara_keluar', value)}>
                        <SelectTrigger><SelectValue placeholder="Pilih cara keluar" /></SelectTrigger>
                        <SelectContent>
                          {caraKeluarOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="ket_keluar">Keterangan Cara Keluar</Label>
                      <Input id="ket_keluar" value={formData.ket_keluar} onChange={(e) => updateField('ket_keluar', e.target.value)} />
                    </div>
                    <div>
                      <Label>Keadaan</Label>
                      <Select value={formData.keadaan} onValueChange={(value) => updateField('keadaan', value)}>
                        <SelectTrigger><SelectValue placeholder="Pilih keadaan" /></SelectTrigger>
                        <SelectContent>
                          {keadaanOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="ket_keadaan">Keterangan Keadaan</Label>
                      <Input id="ket_keadaan" value={formData.ket_keadaan} onChange={(e) => updateField('ket_keadaan', e.target.value)} />
                    </div>
                    <div>
                      <Label>Dilanjutkan</Label>
                      <Select value={formData.dilanjutkan} onValueChange={(value) => updateField('dilanjutkan', value)}>
                        <SelectTrigger><SelectValue placeholder="Pilih tindak lanjut" /></SelectTrigger>
                        <SelectContent>
                          {dilanjutkanOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="ket_dilanjutkan">Keterangan Dilanjutkan</Label>
                      <Input id="ket_dilanjutkan" value={formData.ket_dilanjutkan} onChange={(e) => updateField('ket_dilanjutkan', e.target.value)} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
