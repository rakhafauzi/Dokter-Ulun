import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Package } from 'lucide-react';
import { API_URLS } from '@/config/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface DepoFarmasiLocation {
  kd_bangsal: string;
  nm_bangsal: string;
  stok: number;
}

interface DepoFarmasiItem {
  kode_brng: string;
  nama_brng: string;
  lokasi_stok: DepoFarmasiLocation[];
}

const formatStock = (value: number) => Number(value || 0).toLocaleString('id-ID');
const ITEMS_PER_PAGE = 10;

const DepoFarmasi: React.FC = () => {
  const [items, setItems] = useState<DepoFarmasiItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = async (searchValue = appliedSearch) => {
    setLoading(true);
    setError('');
    try {
      const url = new URL(API_URLS.DEPO_FARMASI, window.location.origin);
      if (searchValue) {
        url.searchParams.set('search', searchValue);
      }

      const response = await fetch(url.toString(), {
        credentials: 'include'
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Gagal memuat data depo farmasi');
      }

      setItems(Array.isArray(result.data) ? result.data : []);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error fetching depo farmasi data:', err);
      setItems([]);
      setError(err instanceof Error ? err.message : 'Gagal memuat data depo farmasi');
      setCurrentPage(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData('');
  }, []);

  useEffect(() => {
    const normalizedValue = searchInput.trim();
    const timer = window.setTimeout(() => {
      if (normalizedValue === appliedSearch) {
        return;
      }

      setAppliedSearch(normalizedValue);
      setCurrentPage(1);
      void fetchData(normalizedValue);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [appliedSearch, searchInput]);

  const totalLocations = useMemo(
    () => items.reduce((total, item) => total + item.lokasi_stok.length, 0),
    [items]
  );
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return items.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [currentPage, items]);

  const handleReset = () => {
    setSearchInput('');
    setAppliedSearch('');
    setCurrentPage(1);
    void fetchData('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Depo Farmasi</h1>
          <p className="text-sm text-muted-foreground">
            Daftar stok obat, alkes, dan BHP medis dari depo yang dipakai pada versi legacy.
          </p>
        </div>
        <Button variant="outline" className="gap-2 self-start" onClick={() => void fetchData()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Data Obat, Alkes dan BHP Medis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Cari kode barang, nama barang, atau nama depo..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={handleReset} disabled={loading && !appliedSearch && !searchInput}>
              Reset
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{items.length.toLocaleString('id-ID')} barang</Badge>
            <Badge variant="outline">{totalLocations.toLocaleString('id-ID')} lokasi stok</Badge>
            {appliedSearch ? <Badge variant="outline">Filter: {appliedSearch}</Badge> : null}
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Kode Barang</TableHead>
                  <TableHead>Nama Barang</TableHead>
                  <TableHead className="w-[420px]">Lokasi &amp; Stok</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      Memuat data depo farmasi...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      Tidak ada data depo farmasi.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedItems.map((item) => (
                    <TableRow key={item.kode_brng}>
                      <TableCell className="font-medium">{item.kode_brng}</TableCell>
                      <TableCell>{item.nama_brng}</TableCell>
                      <TableCell>
                        {item.lokasi_stok.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {item.lokasi_stok.map((location) => (
                              <div
                                key={`${item.kode_brng}-${location.kd_bangsal}`}
                                className="rounded-md border bg-muted/20 px-3 py-2 text-sm"
                              >
                                <span className="font-medium">{location.nm_bangsal}</span>
                                <span className="text-muted-foreground"> {' - '}Stok {formatStock(location.stok)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Tidak ada stok di depo terpilih.</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {!loading && items.length > 0 ? (
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                Menampilkan {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, items.length)} dari {items.length.toLocaleString('id-ID')} barang
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  Sebelumnya
                </Button>
                <Badge variant="secondary">
                  Halaman {currentPage} / {totalPages}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default DepoFarmasi;
