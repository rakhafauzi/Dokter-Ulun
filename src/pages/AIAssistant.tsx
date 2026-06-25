import { FormEvent, useMemo, useState } from 'react';
import { Bot, ChevronLeft, ChevronRight, History, Loader2, RotateCcw, Search, Send, Sparkles, User2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { API_URLS } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { formatUIDateTime } from '@/lib/date-utils';

interface AssistantPayload {
  intent: string;
  careType?: 'all' | 'ralan' | 'ranap' | null;
  answer: string;
  rows: Record<string, unknown>[];
  columns: string[];
  sqlPreview: string | null;
  suggestions?: string[];
  context?: {
    patientName?: string | null;
    targetDate?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    noRawat?: string | null;
    noRkmMedis?: string | null;
    identifier?: string | null;
    identifierType?: string | null;
    careType?: 'all' | 'ralan' | 'ranap' | null;
    inpatientTab?: 'rawat-bersama' | 'rawat-gabung' | null;
    inpatientStatus?: 'all' | 'masih-dirawat' | 'sudah-pulang' | 'pindah-kamar' | null;
    resumeStatus?: 'all' | 'belum_resume' | 'sudah_resume' | null;
    lastIntent?: string | null;
  };
}

type AssistantContext = NonNullable<AssistantPayload['context']>;

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  payload?: AssistantPayload;
}

interface AssistantLogHistoryEntry {
  role: 'user' | 'assistant';
  message: string;
}

interface AssistantLogEntry {
  timestamp: string;
  event?: string;
  status?: 'success' | 'error' | string;
  username?: string;
  doctor_name?: string;
  ip_address?: string;
  user_agent?: string;
  message?: string;
  conversation_history?: AssistantLogHistoryEntry[];
  plan?: Record<string, unknown> | null;
  intent?: string | null;
  answer?: string;
  row_count?: number;
  error?: string;
}

interface AssistantLogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type ChatFilterMode = 'all' | 'intent' | 'natural';
const ROW_CONTEXT_KEYS = {
  patientName: ['nm_pasien', 'patient_name', 'nama_pasien'],
  noRawat: ['no_rawat', 'nomor_rawat'],
  noRkmMedis: ['no_rkm_medis', 'no_rm', 'nomor_rm'],
  targetDate: ['tgl_registrasi', 'tgl_periksa', 'tanggal', 'tanggal_registrasi'],
  identifier: ['no_rkm_medis', 'no_ktp', 'nik', 'no_rawat']
} as const;

const EMPTY_CONTEXT: AssistantContext = {
  patientName: null,
  targetDate: null,
  startDate: null,
  endDate: null,
  noRawat: null,
  noRkmMedis: null,
  identifier: null,
  identifierType: null,
  careType: null,
  inpatientTab: null,
  inpatientStatus: null,
  resumeStatus: null,
  lastIntent: null
};

const examplePrompts = [
  'Tampilkan data pasien saya hari ini',
  'Tampilkan data pasien saya kemarin',
  'Berapa pasien rawat inap saya yang belum pulang?',
  'Tampilkan data pasien rawat gabung saya',
  'Cari pasien dengan no rekam medis 000123',
  'Tampilkan kunjungan terakhir pasien Siti Aminah',
  'Tampilkan diagnosis pasien Siti Aminah',
  'Tampilkan resep pasien Siti Aminah',
  'Berikan hasil lab pasien Siti Aminah tanggal 2026-06-12',
  'Berikan hasil radiologi pasien Siti Aminah tanggal 2026-06-12',
  'Tampilkan riwayat rawat inap pasien Siti Aminah',
  'Tampilkan laporan operasi pasien Siti Aminah'
];

const getTodayWibString = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(new Date());
};

const getRelativeDateWibString = (dayOffset: number) => {
  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + dayOffset);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(currentDate);
};

const formatCellValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const suggestionMatchesContext = (prompt: string, context: AssistantContext, lastIntent?: string | null) => {
  const normalizedPrompt = prompt.toLowerCase();

  if (context.careType === 'ranap' && normalizedPrompt.includes('rawat inap')) return true;
  if (context.careType === 'ralan' && normalizedPrompt.includes('rawat jalan')) return true;
  if (context.inpatientTab === 'rawat-bersama' && /rawat bersama|raber|konsul/.test(normalizedPrompt)) return true;
  if (context.inpatientTab === 'rawat-gabung' && normalizedPrompt.includes('rawat gabung')) return true;
  if (context.inpatientStatus === 'masih-dirawat' && /belum pulang|masih dirawat/.test(normalizedPrompt)) return true;
  if (context.inpatientStatus === 'sudah-pulang' && normalizedPrompt.includes('sudah pulang')) return true;
  if (context.inpatientStatus === 'pindah-kamar' && normalizedPrompt.includes('pindah kamar')) return true;
  if (context.resumeStatus === 'belum_resume' && normalizedPrompt.includes('belum resume')) return true;
  if (context.resumeStatus === 'sudah_resume' && normalizedPrompt.includes('sudah resume')) return true;
  if (context.patientName && /pasien ini|diagnosis|resep|lab|radiologi|kunjungan terakhir/.test(normalizedPrompt)) return true;
  if ((context.startDate && context.endDate) && /rentang tanggal|tanggal awal|tanggal akhir/.test(normalizedPrompt)) return true;
  if (context.targetDate && /tanggal ini|tanggal yang sama/.test(normalizedPrompt)) return true;
  if (lastIntent === 'today_patient_list' && /berapa pasien|kemarin/.test(normalizedPrompt)) return true;

  return false;
};

const rankSuggestions = (
  prompts: string[],
  context: AssistantContext,
  input: string,
  lastIntent?: string | null
) => {
  const normalizedInput = input.trim().toLowerCase();

  return [...prompts]
    .sort((left, right) => {
      const leftMatchesContext = suggestionMatchesContext(left, context, lastIntent) ? 1 : 0;
      const rightMatchesContext = suggestionMatchesContext(right, context, lastIntent) ? 1 : 0;
      const leftMatchesInput = normalizedInput && left.toLowerCase().includes(normalizedInput) ? 1 : 0;
      const rightMatchesInput = normalizedInput && right.toLowerCase().includes(normalizedInput) ? 1 : 0;
      const leftScore = leftMatchesContext * 4 + leftMatchesInput * 2;
      const rightScore = rightMatchesContext * 4 + rightMatchesInput * 2;

      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      return left.length - right.length;
    })
    .slice(0, 8);
};

const filterPromptsByInput = (prompts: string[], input: string) => {
  const normalizedInput = input.trim().toLowerCase();
  if (!normalizedInput) {
    return prompts.slice(0, 6);
  }

  return prompts
    .filter((prompt) => prompt.toLowerCase().includes(normalizedInput))
    .slice(0, 6);
};

const materializeSuggestion = (prompt: string, context: AssistantContext) => {
  const defaultPatientName = context.patientName || 'Siti Aminah';
  const defaultIdentifier = context.noRkmMedis || context.identifier || '000123';
  const defaultDate = context.targetDate || getTodayWibString();
  const defaultStartDate = context.startDate || getRelativeDateWibString(-7);
  const defaultEndDate = context.endDate || getTodayWibString();

  return prompt
    .replace(/\[nama pasien\]/gi, defaultPatientName)
    .replace(/\[tanggal awal\]/gi, defaultStartDate)
    .replace(/\[tanggal akhir\]/gi, defaultEndDate)
    .replace(/\[tanggal\]/gi, defaultDate)
    .replace(/\[nomor\]/gi, defaultIdentifier)
    .replace(/\s+/g, ' ')
    .trim();
};

const getAssistantModeMeta = (intent?: string | null) => {
  if (intent === 'natural_select') {
    return {
      label: 'Natural SQL',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-200'
    };
  }

  if (intent === 'intro') {
    return {
      label: 'Sistem',
      className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
    };
  }

  return {
    label: 'Intent',
    className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/60 dark:text-blue-200'
  };
};

const matchesChatFilter = (turn: ChatTurn, filterMode: ChatFilterMode) => {
  if (filterMode === 'all') {
    return true;
  }

  if (turn.role !== 'assistant') {
    return false;
  }

  if (filterMode === 'natural') {
    return turn.payload?.intent === 'natural_select';
  }

  return Boolean(turn.payload?.intent && turn.payload.intent !== 'natural_select');
};

const getAssistantLogStatusBadgeClassName = (status?: string) => {
  const normalizedStatus = String(status || '').trim().toLowerCase();

  if (normalizedStatus === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-200';
  }

  if (normalizedStatus === 'error') {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-200';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
};

const getRowValue = (row: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }

  return null;
};

const hasContextValue = (context?: Partial<AssistantContext> | null) =>
  Boolean(
    context?.patientName ||
    context?.targetDate ||
    context?.startDate ||
    context?.endDate ||
    context?.noRawat ||
    context?.noRkmMedis ||
    context?.identifier ||
    context?.careType ||
    context?.inpatientTab ||
    context?.inpatientStatus ||
    context?.resumeStatus ||
    context?.lastIntent
  );

const mergeContexts = (...contexts: Array<Partial<AssistantContext> | null | undefined>): AssistantContext =>
  contexts.reduce<AssistantContext>(
    (merged, current) => ({
      patientName: current?.patientName ?? merged.patientName,
      targetDate: current?.targetDate ?? merged.targetDate,
      startDate: current?.startDate ?? merged.startDate,
      endDate: current?.endDate ?? merged.endDate,
      noRawat: current?.noRawat ?? merged.noRawat,
      noRkmMedis: current?.noRkmMedis ?? merged.noRkmMedis,
      identifier: current?.identifier ?? merged.identifier,
      identifierType: current?.identifierType ?? merged.identifierType,
      careType: current?.careType ?? merged.careType,
      inpatientTab: current?.inpatientTab ?? merged.inpatientTab,
      inpatientStatus: current?.inpatientStatus ?? merged.inpatientStatus,
      resumeStatus: current?.resumeStatus ?? merged.resumeStatus,
      lastIntent: current?.lastIntent ?? merged.lastIntent
    }),
    { ...EMPTY_CONTEXT }
  );

const buildContextFromRow = (
  row: Record<string, unknown>,
  fallbackContext?: Partial<AssistantContext> | null,
  fallbackIntent?: string | null
): AssistantContext | null => {
  const patientName = getRowValue(row, ROW_CONTEXT_KEYS.patientName) || fallbackContext?.patientName || null;
  const noRawat = getRowValue(row, ROW_CONTEXT_KEYS.noRawat) || fallbackContext?.noRawat || null;
  const noRkmMedis = getRowValue(row, ROW_CONTEXT_KEYS.noRkmMedis) || fallbackContext?.noRkmMedis || null;
  const targetDate = getRowValue(row, ROW_CONTEXT_KEYS.targetDate) || fallbackContext?.targetDate || null;
  const identifier = getRowValue(row, ROW_CONTEXT_KEYS.identifier) || noRkmMedis || noRawat || fallbackContext?.identifier || null;
  const identifierType = noRkmMedis
    ? 'no_rkm_medis'
    : noRawat
      ? 'no_rawat'
      : fallbackContext?.identifierType || null;

  if (!patientName && !noRawat && !noRkmMedis && !identifier) {
    return null;
  }

  return {
    patientName,
    targetDate,
    noRawat,
    noRkmMedis,
    identifier,
    identifierType,
    startDate: fallbackContext?.startDate || null,
    endDate: fallbackContext?.endDate || null,
    careType: fallbackContext?.careType || null,
    inpatientTab: fallbackContext?.inpatientTab || null,
    inpatientStatus: fallbackContext?.inpatientStatus || null,
    resumeStatus: fallbackContext?.resumeStatus || null,
    lastIntent: fallbackIntent || fallbackContext?.lastIntent || null
  };
};

const isSameContextRow = (row: Record<string, unknown>, activeContext: AssistantContext) =>
  Boolean(
    activeContext.noRawat &&
      getRowValue(row, ROW_CONTEXT_KEYS.noRawat) &&
      getRowValue(row, ROW_CONTEXT_KEYS.noRawat) === activeContext.noRawat
  ) ||
  Boolean(
    activeContext.noRkmMedis &&
      getRowValue(row, ROW_CONTEXT_KEYS.noRkmMedis) &&
      getRowValue(row, ROW_CONTEXT_KEYS.noRkmMedis) === activeContext.noRkmMedis
  );

const canSelectRowAsContext = (
  intent?: string | null,
  careType?: AssistantPayload['careType']
) => intent === 'today_patient_list' && (careType === 'all' || careType === 'ranap' || careType === null || careType === undefined);

const createInitialAssistantTurn = (): ChatTurn => ({
  id: 'assistant-intro',
  role: 'assistant',
  message: 'Saya siap membantu dengan chat natural. Pertanyaan Anda akan dipahami secara kontekstual dan hanya dijalankan sebagai query database baca-saja yang aman.',
  payload: {
    intent: 'intro',
    answer: 'Saya memakai mode hybrid: intent klinis yang sudah dikenal tetap diprioritaskan, lalu pertanyaan yang lebih bebas bisa diterjemahkan ke query MySQL `SELECT` yang aman.',
    rows: [],
    columns: [],
    sqlPreview: null,
    suggestions: examplePrompts
  }
});

const AIAssistant = () => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [assistantLogs, setAssistantLogs] = useState<AssistantLogEntry[]>([]);
  const [assistantLogPagination, setAssistantLogPagination] = useState<AssistantLogPagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  });
  const [logFilters, setLogFilters] = useState({
    username: '',
    status: 'all',
    search: ''
  });
  const [selectedContext, setSelectedContext] = useState<AssistantContext | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([createInitialAssistantTurn()]);
  const [chatFilterMode, setChatFilterMode] = useState<ChatFilterMode>('all');
  const [expandedSqlPreviewIds, setExpandedSqlPreviewIds] = useState<string[]>([]);

  const lastAssistantPayload = useMemo(
    () => [...chatHistory].reverse().find((turn) => turn.role === 'assistant' && turn.payload)?.payload || null,
    [chatHistory]
  );
  const activeContext = useMemo(
    () => mergeContexts(lastAssistantPayload?.context, selectedContext),
    [lastAssistantPayload?.context, selectedContext]
  );
  const quickSuggestionPrompts = useMemo(() => {
    const backendSuggestions = lastAssistantPayload?.suggestions || [];
    const mergedSuggestions = [...backendSuggestions, ...examplePrompts];
    return rankSuggestions(
      Array.from(new Set(mergedSuggestions)),
      activeContext,
      message,
      lastAssistantPayload?.intent || activeContext.lastIntent || null
    );
  }, [activeContext, lastAssistantPayload?.intent, lastAssistantPayload?.suggestions, message]);
  const visibleSuggestionPrompts = useMemo(
    () => filterPromptsByInput(quickSuggestionPrompts, message),
    [quickSuggestionPrompts, message]
  );
  const naturalSuggestionPrompts = useMemo(
    () => Array.from(new Set(visibleSuggestionPrompts.map((prompt) => materializeSuggestion(prompt, activeContext)))),
    [activeContext, visibleSuggestionPrompts]
  );
  const filteredChatHistory = useMemo(
    () => chatHistory.filter((turn) => matchesChatFilter(turn, chatFilterMode)),
    [chatFilterMode, chatHistory]
  );
  const handleSuggestionClick = (prompt: string) => {
    setMessage(prompt);
  };

  const toggleSqlPreview = (turnId: string) => {
    setExpandedSqlPreviewIds((previous) =>
      previous.includes(turnId)
        ? previous.filter((item) => item !== turnId)
        : [...previous, turnId]
    );
  };

  const handleResetContext = () => {
    setChatHistory([createInitialAssistantTurn()]);
    setMessage('');
    setSelectedContext(null);
    setExpandedSqlPreviewIds([]);
    toast({
      title: 'Konteks Direset',
      description: 'Percakapan AI dimulai ulang tanpa konteks pasien atau tanggal sebelumnya.'
    });
  };

  const fetchAssistantLogs = async (nextPage = 1, overrideFilters?: Partial<typeof logFilters>) => {
    setLogsLoading(true);
    try {
      const effectiveFilters = {
        ...logFilters,
        ...overrideFilters
      };
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', String(assistantLogPagination.limit));

      if (effectiveFilters.username.trim()) {
        params.set('username', effectiveFilters.username.trim());
      }

      if (effectiveFilters.status !== 'all') {
        params.set('status', effectiveFilters.status);
      }

      if (effectiveFilters.search.trim()) {
        params.set('search', effectiveFilters.search.trim());
      }

      const response = await fetch(`${API_URLS.DOCTOR_AI_ASSISTANT_LOGS}?${params.toString()}`, {
        credentials: 'include'
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Gagal memuat log AI assistant');
      }

      setAssistantLogs(Array.isArray(payload.data) ? payload.data : []);
      setAssistantLogPagination(
        payload.pagination || {
          page: nextPage,
          limit: assistantLogPagination.limit,
          total: 0,
          totalPages: 1
        }
      );
    } catch (error) {
      console.error('Failed to fetch AI assistant logs:', error);
      toast({
        title: 'Gagal Memuat Log',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat log AI assistant',
        variant: 'destructive'
      });
      setAssistantLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleOpenLogDialog = () => {
    setLogDialogOpen(true);
    void fetchAssistantLogs(1);
  };

  const handleApplyLogFilters = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await fetchAssistantLogs(1);
  };

  const handleResetLogFilters = () => {
    const nextFilters = {
      username: '',
      status: 'all',
      search: ''
    };
    setLogFilters(nextFilters);
    void fetchAssistantLogs(1, nextFilters);
  };

  const handleSelectRowContext = (row: Record<string, unknown>, payload?: AssistantPayload) => {
    const nextContext = buildContextFromRow(row, activeContext, payload?.intent || lastAssistantPayload?.intent || null);
    if (!nextContext) {
      return;
    }

    setSelectedContext(nextContext);
    toast({
      title: 'Konteks Pasien Aktif',
      description: `${nextContext.patientName || 'Pasien terpilih'} siap dipakai untuk pertanyaan lanjutan.`
    });
  };

  const submitQuestion = async (prompt?: string) => {
    const finalMessage = String(prompt || message).trim();
    if (!finalMessage || !user?.username) {
      return;
    }
    const debugTraceId = `ai-${Date.now()}`;

    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      message: finalMessage
    };
    const contextTurn = selectedContext && hasContextValue(selectedContext)
      ? {
          role: 'assistant' as const,
          message: 'Konteks aktif dipilih dari baris data pasien.',
          payload: {
            intent: selectedContext.lastIntent || 'manual_context',
            answer: '',
            rows: [],
            columns: [],
            sqlPreview: null,
            context: selectedContext
          }
        }
      : null;
    const historyForRequest = [...chatHistory, userTurn, ...(contextTurn ? [contextTurn] : [])]
      .slice(-10)
      .map((turn) => ({
        role: turn.role,
        message: turn.message,
        payload: turn.payload
      }));

    setChatHistory((previous) => [...previous, userTurn]);
    setLoading(true);
    setMessage('');

    try {
      // #region debug-point A:ai-request-start
      import.meta.env.DEV && fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"prod-ai-json-error",runId:"pre-fix",hypothesisId:"A",location:"src/pages/AIAssistant.tsx:submitQuestion",msg:"[DEBUG] AI request start",data:{traceId:debugTraceId,url:API_URLS.DOCTOR_AI_ASSISTANT,username:user.username,hasSelectedContext:Boolean(selectedContext),historyCount:historyForRequest.length},ts:Date.now()})}).catch(()=>{});
      // #endregion
      const response = await fetch(API_URLS.DOCTOR_AI_ASSISTANT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          message: finalMessage,
          username: user.username,
          doctorName: user.name,
          conversationHistory: historyForRequest
        })
      });

      // #region debug-point B:ai-response-meta
      import.meta.env.DEV && response.clone().text().then((body)=>fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"prod-ai-json-error",runId:"pre-fix",hypothesisId:"B",location:"src/pages/AIAssistant.tsx:submitQuestion",msg:"[DEBUG] AI response meta",data:{traceId:debugTraceId,url:response.url,status:response.status,ok:response.ok,redirected:response.redirected,contentType:response.headers.get('content-type'),bodyStart:body.slice(0,180)},ts:Date.now()})}).catch(()=>{})).catch((cloneError)=>fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"prod-ai-json-error",runId:"pre-fix",hypothesisId:"B",location:"src/pages/AIAssistant.tsx:submitQuestion",msg:"[DEBUG] AI response clone failed",data:{traceId:debugTraceId,error:cloneError instanceof Error ? cloneError.message : String(cloneError)},ts:Date.now()})}).catch(()=>{}));
      // #endregion

      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || payload.message || 'Gagal memproses pertanyaan AI');
      }

      const assistantTurn: ChatTurn = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        message: payload.data.answer,
        payload: payload.data
      };

      setSelectedContext(null);
      setChatHistory((previous) => [...previous, assistantTurn]);
    } catch (error) {
      // #region debug-point C:ai-request-error
      import.meta.env.DEV && fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"prod-ai-json-error",runId:"pre-fix",hypothesisId:"C",location:"src/pages/AIAssistant.tsx:submitQuestion",msg:"[DEBUG] AI request error",data:{traceId:debugTraceId,error:error instanceof Error ? error.message : String(error)},ts:Date.now()})}).catch(()=>{});
      // #endregion
      console.error('AI assistant request failed:', error);
      toast({
        title: 'AI Assistant Error',
        description: error instanceof Error ? error.message : 'Terjadi kesalahan saat memproses pertanyaan',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitQuestion();
  };

  return (
    <div className="mx-auto w-full animate-fade-in space-y-6 rounded-md bg-white p-2 shadow-md transition-colors dark:bg-slate-950 dark:shadow-slate-950/40 md:space-y-8 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">AI Asisten Dokter</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Asisten ini menerima pertanyaan natural seperti percakapan biasa. Sistem memprioritaskan intent klinis yang sudah dikenal, lalu memakai fallback query `SELECT` yang aman untuk pertanyaan yang lebih bebas.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={handleOpenLogDialog} disabled={loading}>
              <History className="mr-2 h-4 w-4" />
              Log AI Assistant
            </Button>
            <Button type="button" variant="outline" onClick={handleResetContext} disabled={loading}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Konteks
            </Button>
          </div>
        </div>

        <div className="grid gap-6">
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <CardTitle>Chat</CardTitle>
                <div className="flex flex-col gap-2 md:items-end">
                  <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                    <Badge variant="outline" className="max-w-full whitespace-normal">
                      Pasien: {activeContext.patientName || '-'}
                    </Badge>
                    <Badge variant="outline" className="max-w-full whitespace-normal">
                      No. Rawat: {activeContext.noRawat || '-'}
                    </Badge>
                    <Badge variant="outline" className="max-w-full whitespace-normal">
                      No. RM: {activeContext.noRkmMedis || '-'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={chatFilterMode === 'all' ? 'default' : 'outline'}
                      size="sm"
                      className="h-8"
                      onClick={() => setChatFilterMode('all')}
                    >
                      Semua
                    </Button>
                    <Button
                      type="button"
                      variant={chatFilterMode === 'intent' ? 'default' : 'outline'}
                      size="sm"
                      className="h-8"
                      onClick={() => setChatFilterMode('intent')}
                    >
                      Intent
                    </Button>
                    <Button
                      type="button"
                      variant={chatFilterMode === 'natural' ? 'default' : 'outline'}
                      size="sm"
                      className="h-8"
                      onClick={() => setChatFilterMode('natural')}
                    >
                      Natural SQL
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-[560px] space-y-4 overflow-y-auto rounded-md border bg-muted/20 p-4">
                {filteredChatHistory.map((turn) => (
                  <div
                    key={turn.id}
                    className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-lg px-4 py-3 shadow-sm ${
                        turn.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'border bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {turn.role === 'assistant' ? (() => {
                        const modeMeta = getAssistantModeMeta(turn.payload?.intent);
                        const isSqlPreviewExpanded = expandedSqlPreviewIds.includes(turn.id);

                        return (
                          <>
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium opacity-80">
                        <Bot className="h-4 w-4" />
                        <span>AI Asisten</span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${modeMeta.className}`}
                            >
                              {modeMeta.label}
                            </span>
                            {turn.payload?.sqlPreview ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => toggleSqlPreview(turn.id)}
                              >
                                {isSqlPreviewExpanded ? 'Sembunyikan SQL' : 'Lihat SQL'}
                              </Button>
                            ) : null}
                          </div>
                          <div className="whitespace-pre-wrap text-sm text-inherit">{turn.message}</div>
                          {turn.payload?.sqlPreview && isSqlPreviewExpanded ? (
                            <div className="mt-2 rounded-md bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground">
                              <span className="font-semibold">SQL Preview:</span> {turn.payload.sqlPreview}
                            </div>
                          ) : null}
                        </>
                        );
                      })() : (
                        <>
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium opacity-80">
                            <User2 className="h-4 w-4" />
                            <span>Dokter</span>
                          </div>
                          <div className="whitespace-pre-wrap text-sm">{turn.message}</div>
                        </>
                      )}

                      {turn.role === 'assistant' && turn.payload?.rows?.length ? (
                        <div className="mt-4 space-y-3">
                          {canSelectRowAsContext(turn.payload?.intent, turn.payload?.careType) ? (
                            <div className="text-xs text-muted-foreground">
                              Klik baris pasien untuk menjadikannya konteks aktif.
                            </div>
                          ) : null}
                          <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-muted/50">
                                  {turn.payload.columns.map((column) => (
                                    <th key={column} className="p-3 text-left font-medium">
                                      {column}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {turn.payload.rows.map((row, index) => {
                                  const rowContext = buildContextFromRow(
                                    row,
                                    turn.payload?.context,
                                    turn.payload?.intent || null
                                  );
                                  const isSelectable =
                                    canSelectRowAsContext(turn.payload?.intent, turn.payload?.careType) && Boolean(rowContext);
                                  const isActiveRow = isSelectable && isSameContextRow(row, activeContext);

                                  return (
                                    <tr
                                      key={`${index}-${JSON.stringify(row)}`}
                                      className={`border-t ${
                                        isSelectable ? 'cursor-pointer hover:bg-muted/50' : ''
                                      } ${isActiveRow ? 'bg-primary/10' : ''}`}
                                      onClick={() =>
                                        isSelectable ? handleSelectRowContext(row, turn.payload) : undefined
                                      }
                                    >
                                      {turn.payload?.columns.map((column) => (
                                        <td key={`${index}-${column}`} className="p-3 align-top">
                                          {formatCellValue(row[column])}
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {canSelectRowAsContext(turn.payload?.intent, turn.payload?.careType) &&
                          turn.payload.rows.some((item) =>
                            Boolean(buildContextFromRow(item, turn.payload?.context, turn.payload?.intent || null))
                          ) ? (
                            <div className="text-[11px] text-muted-foreground">
                              Baris yang berisi identitas pasien bisa diklik untuk memperbarui konteks aktif.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-lg border bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Memproses pertanyaan...</span>
                      </div>
                    </div>
                  </div>
                )}
                {!loading && filteredChatHistory.length === 0 ? (
                  <div className="rounded-md border border-dashed bg-white/80 px-4 py-6 text-center text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/80">
                    Belum ada chat yang cocok untuk filter ini.
                  </div>
                ) : null}
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Tulis pertanyaan natural Anda, misalnya: tampilkan diagnosis pasien Siti Aminah yang berobat minggu ini"
                  rows={4}
                  disabled={loading}
                />
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Contoh pertanyaan natural
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {naturalSuggestionPrompts.map((prompt) => (
                      <Button
                        key={prompt}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto whitespace-normal text-left"
                        onClick={() => handleSuggestionClick(prompt)}
                        disabled={loading}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                  {message.trim() && naturalSuggestionPrompts.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      Tidak ada saran yang cocok dengan teks input saat ini.
                    </div>
                  ) : null}
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={loading || !message.trim()}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Kirim
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
        <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-5xl overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <History className="h-5 w-5" />
                Log AI Assistant
              </DialogTitle>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <form onSubmit={handleApplyLogFilters} className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cari isi pertanyaan/chat</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={logFilters.search}
                      onChange={(event) => setLogFilters((previous) => ({ ...previous, search: event.target.value }))}
                      className="pl-9"
                      placeholder="Cari pertanyaan, jawaban, atau riwayat chat..."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Username</label>
                  <Input
                    value={logFilters.username}
                    onChange={(event) => setLogFilters((previous) => ({ ...previous, username: event.target.value }))}
                    placeholder="Filter username / dokter"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={logFilters.status}
                    onValueChange={(value) => setLogFilters((previous) => ({ ...previous, status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua</SelectItem>
                      <SelectItem value="success">Sukses</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 self-end sm:flex-row">
                  <Button type="button" variant="outline" onClick={handleResetLogFilters} disabled={logsLoading}>
                    Reset
                  </Button>
                  <Button type="submit" disabled={logsLoading}>
                    {logsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Terapkan
                  </Button>
                </div>
              </form>

              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <p>
                  Total log: <span className="font-medium text-foreground">{assistantLogPagination.total}</span>
                </p>
                <p>
                  Halaman {assistantLogPagination.page} dari {assistantLogPagination.totalPages}
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {logsLoading ? (
                  <div className="flex items-center justify-center rounded-lg border py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Memuat log AI assistant...
                  </div>
                ) : assistantLogs.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                    Belum ada log AI assistant yang cocok dengan filter saat ini.
                  </div>
                ) : (
                  assistantLogs.map((entry, index) => (
                    <div key={`${entry.timestamp}-${entry.username}-${index}`} className="rounded-lg border bg-background p-4 space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${getAssistantLogStatusBadgeClassName(entry.status)}`}>
                              {String(entry.status || 'unknown').trim() || 'unknown'}
                            </span>
                            <Badge variant="outline">{entry.intent || 'tanpa intent'}</Badge>
                          </div>
                          <div className="text-sm">
                            <p className="font-medium">{entry.doctor_name || entry.username || 'Pengguna tidak diketahui'}</p>
                            <p className="text-muted-foreground">
                              Username: {entry.username || '-'}
                              {entry.row_count !== undefined ? ` | Rows: ${entry.row_count}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {entry.timestamp ? formatUIDateTime(entry.timestamp) : '-'}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pertanyaan</p>
                        <p className="whitespace-pre-wrap break-words text-sm">{entry.message || '-'}</p>
                      </div>

                      {entry.answer ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jawaban</p>
                          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{entry.answer}</p>
                        </div>
                      ) : null}

                      {entry.error ? (
                        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/60 dark:text-red-200">
                          {entry.error}
                        </div>
                      ) : null}

                      <details className="rounded-md border bg-muted/20 p-3">
                        <summary className="cursor-pointer text-sm font-medium">
                          Riwayat chat yang dipakai ({Array.isArray(entry.conversation_history) ? entry.conversation_history.length : 0})
                        </summary>
                        <div className="mt-3 space-y-2">
                          {Array.isArray(entry.conversation_history) && entry.conversation_history.length > 0 ? (
                            entry.conversation_history.map((historyItem, historyIndex) => (
                              <div key={`${entry.timestamp}-history-${historyIndex}`} className="rounded-md border bg-background p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {historyItem.role === 'assistant' ? 'AI' : 'Dokter'}
                                </p>
                                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{historyItem.message || '-'}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">Tidak ada riwayat chat yang terekam.</p>
                          )}
                        </div>
                      </details>

                      {entry.plan ? (
                        <details className="rounded-md border bg-muted/20 p-3">
                          <summary className="cursor-pointer text-sm font-medium">Plan / intent yang dipakai</summary>
                          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                            {JSON.stringify(entry.plan, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Menampilkan {assistantLogs.length} log dari total {assistantLogPagination.total}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={logsLoading || assistantLogPagination.page <= 1}
                    onClick={() => void fetchAssistantLogs(assistantLogPagination.page - 1)}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Sebelumnya
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={logsLoading || assistantLogPagination.page >= assistantLogPagination.totalPages}
                    onClick={() => void fetchAssistantLogs(assistantLogPagination.page + 1)}
                  >
                    Berikutnya
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
};

export default AIAssistant;
