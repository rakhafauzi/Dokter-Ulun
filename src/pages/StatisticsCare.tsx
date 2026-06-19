import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { API_URLS } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import { Filter, Loader2 } from 'lucide-react';

type StatisticsCareMode = 'rawat-jalan' | 'rawat-inap';

interface StatisticsCareProps {
  mode: StatisticsCareMode;
}

interface StatisticsDetailRow {
  monthNumber: number;
  monthKey: string;
  total: number;
}

interface StatisticsResponse {
  type: StatisticsCareMode;
  year: number;
  total: number;
  filters?: string[];
  detail: StatisticsDetailRow[];
}

const rawatJalanStatusOptions = [
  'Belum',
  'Sudah',
  'Batal',
  'Berkas Diterima',
  'Dirujuk',
  'Meninggal',
  'Dirawat',
  'Pulang Paksa',
  'DOA',
  'BLPL',
  'Dilayani',
  'Diperiksa'
] as const;

const monthFormatter = new Intl.DateTimeFormat('id-ID', { month: 'long' });

const getMonthLabel = (monthNumber: number) => {
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return '-';
  }

  return monthFormatter.format(new Date(2024, monthNumber - 1, 1));
};

const StatisticsCare = ({ mode }: StatisticsCareProps) => {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const availableYears = useMemo(
    () => Array.from({ length: currentYear - 2016 + 1 }, (_, index) => String(currentYear - index)),
    [currentYear]
  );

  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [appliedYear, setAppliedYear] = useState(String(currentYear));
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<string[]>([]);
  const [data, setData] = useState<StatisticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const pageTitle = mode === 'rawat-jalan' ? 'Statistik Rawat Jalan' : 'Statistik Rawat Inap';
  const chartTitle = mode === 'rawat-jalan' ? 'Grafik Rawat Jalan' : 'Grafik Rawat Inap';
  const detailTitle = mode === 'rawat-jalan' ? 'Detail Rawat Jalan' : 'Detail Rawat Inap';

  const chartData = useMemo(
    () =>
      (data?.detail || []).map((row) => ({
        ...row,
        monthLabel: getMonthLabel(row.monthNumber)
      })),
    [data]
  );

  const fetchStatistics = async () => {
    if (!user?.username) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(API_URLS.STATISTICS_DATA, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          statisticType: mode,
          periodType: 'monthly',
          startDate: `${appliedYear}-01-01`,
          endDate: `${appliedYear}-12-31`,
          year: appliedYear,
          username: user.username,
          filters: mode === 'rawat-jalan' ? appliedFilters : [],
          limit: 12
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || 'Gagal mengambil data statistik');
      }

      setData(payload.data as StatisticsResponse);
    } catch (error) {
      console.error('Error fetching care statistics:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatistics();
  }, [mode, appliedYear, appliedFilters, user?.username]);

  const handleApplyFilters = () => {
    setAppliedYear(selectedYear);
    setAppliedFilters(selectedFilters);
  };

  const handleToggleStatus = (status: string, checked: boolean) => {
    setSelectedFilters((previous) =>
      checked ? [...previous, status] : previous.filter((item) => item !== status)
    );
  };

  return (
    <div className="mx-auto w-full animate-fade-in space-y-6 rounded-md bg-white p-2 shadow-md transition-colors dark:bg-slate-950 dark:shadow-slate-950/40 md:space-y-8 md:p-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">{pageTitle}</h1>
        <p className="text-muted-foreground">
          Statistik kunjungan dokter {user?.name || '-'} untuk periode {appliedYear}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter Statistik</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="w-full lg:w-[220px]">
              <label className="mb-2 block text-sm font-medium">Tahun</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tahun" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === 'rawat-jalan' && (
              <div className="w-full lg:w-[320px]">
                <label className="mb-2 block text-sm font-medium">Filter Status</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <Filter className="mr-2 h-4 w-4" />
                      {selectedFilters.length > 0 ? `${selectedFilters.length} status dipilih` : 'Semua status'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[320px]">
                    <div className="space-y-3">
                      {rawatJalanStatusOptions.map((status) => (
                        <label key={status} className="flex items-center gap-3 text-sm">
                          <Checkbox
                            checked={selectedFilters.includes(status)}
                            onCheckedChange={(checked) => handleToggleStatus(status, checked === true)}
                          />
                          <span>{status}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleApplyFilters}>Terapkan</Button>
              {mode === 'rawat-jalan' && selectedFilters.length > 0 && (
                <Button variant="outline" onClick={() => setSelectedFilters([])}>
                  Reset Status
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-[320px] items-center justify-center rounded-md border bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Total Kunjungan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{data?.total || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Filter Aktif</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {mode === 'rawat-jalan' && appliedFilters.length > 0 ? (
                  appliedFilters.map((filter) => <Badge key={filter} variant="secondary">{filter}</Badge>)
                ) : (
                  <span className="text-sm text-muted-foreground">Tidak ada filter khusus</span>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{chartTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="monthLabel" />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value) => [value, 'Jumlah']} />
                    <Bar dataKey="total" name="Jumlah Kunjungan" fill={mode === 'rawat-jalan' ? '#2563eb' : '#16a34a'} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                  Belum ada data untuk periode ini.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{detailTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="p-3 text-left font-medium">Bulan</th>
                      <th className="p-3 text-left font-medium">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.detail || []).length > 0 ? (
                      data?.detail.map((row) => (
                        <tr key={row.monthKey} className="border-t">
                          <td className="p-3">{getMonthLabel(row.monthNumber)}</td>
                          <td className="p-3">{row.total}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t">
                        <td className="p-3 text-muted-foreground" colSpan={2}>
                          Tidak ada data detail untuk periode ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default StatisticsCare;
