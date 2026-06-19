import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Search,
  ArrowUp,
  ArrowDown,
  Clipboard,
  ActivitySquare,
  Stethoscope,
  Filter,
  X,
  Brain,
  FlaskConical
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { API_URLS } from '@/config/api';

type MedicalCodeTab = 'icd10' | 'icd9' | 'snomed' | 'loinc';

type ColumnConfig = {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  render?: (item: any) => React.ReactNode;
};

const TAB_CONFIG: Record<MedicalCodeTab, {
  title: string;
  description: string;
  placeholder: string;
  resultTitle: string;
  emptyHint: string;
}> = {
  icd10: {
    title: 'Pencarian ICD-10',
    description: 'Masukkan kode atau kata kunci untuk mencari diagnosis ICD-10.',
    placeholder: 'Cari kode ICD-10 atau kata kunci...',
    resultTitle: 'Hasil Pencarian ICD-10',
    emptyHint: 'Coba dengan kata kunci lain atau kode ICD-10 yang lebih spesifik'
  },
  icd9: {
    title: 'Pencarian ICD-9-CM',
    description: 'Masukkan kode atau kata kunci untuk mencari prosedur/tindakan ICD-9-CM.',
    placeholder: 'Cari kode ICD-9-CM atau kata kunci...',
    resultTitle: 'Hasil Pencarian ICD-9-CM',
    emptyHint: 'Coba dengan kata kunci lain atau kode ICD-9-CM yang lebih spesifik'
  },
  snomed: {
    title: 'Pencarian SNOMED CT',
    description: 'Masukkan kode atau istilah untuk mencari terminologi SNOMED CT.',
    placeholder: 'Cari kode SNOMED CT atau istilah...',
    resultTitle: 'Hasil Pencarian SNOMED CT',
    emptyHint: 'Coba dengan istilah SNOMED CT lain yang lebih spesifik'
  },
  loinc: {
    title: 'Pencarian LOINC',
    description: 'Masukkan kode atau kata kunci untuk mencari kode LOINC laboratorium dan radiologi.',
    placeholder: 'Cari kode LOINC atau kata kunci...',
    resultTitle: 'Hasil Pencarian LOINC',
    emptyHint: 'Coba dengan kata kunci LOINC lain yang lebih spesifik'
  }
};

const MasterICD = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<MedicalCodeTab>('icd10');
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { paginationState, handlePageChange, handleItemsPerPageChange, updatePagination } = usePagination({
    initialItemsPerPage: 10
  });

  const columns = useMemo<Record<MedicalCodeTab, ColumnConfig[]>>(() => ({
    icd10: [
      { key: 'kd_penyakit', label: 'Kode', sortable: true, className: 'font-medium' },
      { key: 'nm_penyakit', label: 'Nama Penyakit', sortable: true },
      {
        key: 'ciri_ciri',
        label: 'Ciri-Ciri',
        render: (item) => <div className="max-w-xs truncate" title={item.ciri_ciri}>{item.ciri_ciri || '-'}</div>
      },
      { key: 'keterangan', label: 'Keterangan', render: (item) => item.keterangan || '-' },
      { key: 'nm_kategori', label: 'Kategori', render: (item) => item.nm_kategori || '-' },
      {
        key: 'status',
        label: 'Status',
        render: (item) => (
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            item.status === 'Menular' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}>
            {item.status}
          </span>
        )
      }
    ],
    icd9: [
      { key: 'kode', label: 'Kode', sortable: true, className: 'font-medium' },
      { key: 'deskripsi_pendek', label: 'Deskripsi Pendek', sortable: true },
      {
        key: 'deskripsi_panjang',
        label: 'Deskripsi Panjang',
        render: (item) => <div className="max-w-md" title={item.deskripsi_panjang}>{item.deskripsi_panjang || '-'}</div>
      }
    ],
    snomed: [
      { key: 'kode', label: 'Kode', sortable: true, className: 'font-medium' },
      {
        key: 'istilah',
        label: 'Istilah',
        sortable: true,
        render: (item) => <div className="max-w-xl" title={item.istilah}>{item.istilah || '-'}</div>
      },
      {
        key: 'related_icd_codes',
        label: 'Mapping ICD',
        render: (item) => item.related_icd_codes || '-'
      }
    ],
    loinc: [
      { key: 'kode', label: 'Kode', sortable: true, className: 'font-medium' },
      { key: 'sumber', label: 'Sumber', sortable: true },
      {
        key: 'nama_pemeriksaan',
        label: 'Nama Pemeriksaan',
        sortable: true,
        render: (item) => <div className="max-w-sm" title={item.nama_pemeriksaan}>{item.nama_pemeriksaan || '-'}</div>
      },
      {
        key: 'display',
        label: 'Display',
        render: (item) => <div className="max-w-xl" title={item.display}>{item.display || '-'}</div>
      },
      {
        key: 'kategori',
        label: 'Kategori',
        render: (item) => item.kategori || '-'
      }
    ]
  }), []);

  const fetchMedicalCodeData = async (tab: MedicalCodeTab, search = '') => {
    setLoading(true);
    try {
      const response = await fetch(API_URLS.ICD_DATA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: paginationState.currentPage,
          itemsPerPage: paginationState.itemsPerPage,
          search,
          icdType: tab
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSearchResults(data.data || []);
      updatePagination({
        total: data.total,
        totalPages: data.totalPages
      });
      setHasSearched(true);
    } catch (error) {
      console.error('Error fetching medical code data:', error);
      toast({
        title: "Error",
        description: "Gagal memuat data kode medis",
        variant: "destructive"
      });
      setSearchResults([]);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    updatePagination({ page: 1 });
    setSortField('');
    setSortDirection('asc');
    fetchMedicalCodeData(activeTab, searchQuery);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setSortField('');
    setSortDirection('asc');
    updatePagination({ page: 1 });
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as MedicalCodeTab);
    setSearchResults([]);
    setHasSearched(false);
    setSearchQuery('');
    setSortField('');
    setSortDirection('asc');
    updatePagination({ page: 1 });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Kode Disalin",
      description: `Kode ${code} berhasil disalin ke clipboard`,
    });
  };

  const handleSort = (field: string) => {
    const nextDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(nextDirection);

    const sorted = [...searchResults].sort((a, b) => {
      const aValue = String(a?.[field] ?? '').toLowerCase();
      const bValue = String(b?.[field] ?? '').toLowerCase();
      if (aValue === bValue) return 0;
      return nextDirection === 'asc'
        ? (aValue > bValue ? 1 : -1)
        : (aValue < bValue ? 1 : -1);
    });

    setSearchResults(sorted);
  };

  useEffect(() => {
    if (hasSearched) {
      fetchMedicalCodeData(activeTab, searchQuery);
    }
  }, [paginationState.currentPage, paginationState.itemsPerPage]);

  const SortIcon = ({ field }: { field: string }) => {
    if (field !== sortField) return null;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const currentConfig = TAB_CONFIG[activeTab];
  const currentColumns = columns[activeTab];

  return (
    <div className="mx-auto w-full animate-fade-in space-y-6 rounded-md bg-white p-2 shadow-md transition-colors dark:bg-slate-950 dark:shadow-slate-950/40 md:space-y-8 md:p-6">
      <div className="flex items-center space-x-2 mb-6">
        <FileText size={24} className="text-primary" />
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Kode Medis</h1>
      </div>
      <Separator className="mb-6" />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-[760px] grid-cols-4 mb-8">
          <TabsTrigger value="icd10" className="flex items-center gap-2">
            <Stethoscope size={16} />
            <span>ICD-10</span>
          </TabsTrigger>
          <TabsTrigger value="icd9" className="flex items-center gap-2">
            <ActivitySquare size={16} />
            <span>ICD-9-CM</span>
          </TabsTrigger>
          <TabsTrigger value="snomed" className="flex items-center gap-2">
            <Brain size={16} />
            <span>SNOMED CT</span>
          </TabsTrigger>
          <TabsTrigger value="loinc" className="flex items-center gap-2">
            <FlaskConical size={16} />
            <span>LOINC</span>
          </TabsTrigger>
        </TabsList>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{currentConfig.title}</CardTitle>
            <CardDescription>{currentConfig.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-1 items-center space-x-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  className="flex-1"
                  placeholder={currentConfig.placeholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSearch} disabled={loading}>
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Filter className="h-4 w-4 mr-2" />
                  )}
                  Cari
                </Button>
                <Button variant="outline" onClick={handleClearSearch}>
                  <X className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {hasSearched && (
          <Card>
            <CardHeader>
              <CardTitle>{currentConfig.resultTitle}</CardTitle>
              <CardDescription>
                {loading
                  ? "Memuat..."
                  : searchResults.length === 0
                    ? "Tidak ditemukan hasil yang sesuai"
                    : `Ditemukan ${paginationState.totalItems} hasil`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center items-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : searchResults.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted">
                          {currentColumns.map((column) => (
                            <th
                              key={column.key}
                              className={`p-3 text-left font-medium ${column.sortable ? 'cursor-pointer' : ''}`}
                              onClick={column.sortable ? () => handleSort(column.key) : undefined}
                            >
                              <div className="flex items-center">
                                {column.label}
                                {column.sortable ? <SortIcon field={column.key} /> : null}
                              </div>
                            </th>
                          ))}
                          <th className="p-3 text-left font-medium">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.map((item, index) => {
                          const code = item.kd_penyakit || item.kode || '';
                          return (
                            <tr key={`${activeTab}-${code}-${index}`} className="border-b">
                              {currentColumns.map((column) => (
                                <td key={column.key} className={`p-3 ${column.className || ''}`}>
                                  {column.render ? column.render(item) : (item[column.key] || '-')}
                                </td>
                              ))}
                              <td className="p-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCopyCode(code)}
                                >
                                  <Clipboard className="h-4 w-4 mr-1" />
                                  Salin
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4">
                    <PaginationControls
                      currentPage={paginationState.currentPage}
                      totalPages={paginationState.totalPages}
                      itemsPerPage={paginationState.itemsPerPage}
                      totalItems={paginationState.totalItems}
                      onPageChange={handlePageChange}
                      onItemsPerPageChange={handleItemsPerPageChange}
                    />
                  </div>
                </>
              ) : (
                <div className="text-center py-10">
                  <p className="text-muted-foreground">Tidak ada hasil yang ditemukan untuk "{searchQuery}"</p>
                  <p className="text-sm mt-2">{currentConfig.emptyHint}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </Tabs>
    </div>
  );
};

export default MasterICD;
