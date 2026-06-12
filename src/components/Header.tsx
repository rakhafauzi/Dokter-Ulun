
import React from 'react';
import { Bell, BellOff, BellRing, FlaskConical, Loader2, Menu, Pill, Radio, Search, Settings as SettingsIcon, User, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { API_URLS } from '@/config/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import logoImg from '@/assets/logo.png'; // Add this import
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  NOTIFICATION_PREFERENCES_CHANGED_EVENT,
  type NotificationPreferences,
  loadNotificationPreferences,
  saveNotificationPreferences
} from '@/lib/notification-preferences';

interface HeaderProps {
  hospitalName: string;
  isMobile?: boolean;
  onMenuClick?: () => void;
  username?: string;
  doctorId?: string;
  onLogout?: () => void;
  onMedicalRecordSearchClick?: () => void;
}

interface DoctorNotificationItem {
  id: string;
  type: 'prescription' | 'laboratory' | 'radiology';
  title: string;
  status: 'menunggu' | 'diproses' | 'selesai';
  status_label: string;
  description: string;
  reference_id: string;
  no_rawat: string;
  no_rkm_medis: string;
  patient_name: string;
  created_at: string;
  sampled_at?: string;
  result_at?: string;
  processed_at?: string;
}

interface DoctorNotificationSummary {
  active: number;
  menunggu: number;
  diproses: number;
  selesai: number;
  prescription: number;
  laboratory: number;
  radiology: number;
}

type NotificationTab = 'prescription' | 'laboratory' | 'radiology';
type NotificationFilter = 'all' | 'active' | 'ready';

const formatNotificationTime = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '-';
  }

  const parsedDate = new Date(normalized.replace(' ', 'T'));
  if (Number.isNaN(parsedDate.getTime())) {
    return normalized;
  }

  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(parsedDate);
};

const getNotificationTypeLabel = (type: DoctorNotificationItem['type']) => {
  switch (type) {
    case 'prescription':
      return 'Peresepan';
    case 'laboratory':
      return 'Lab';
    case 'radiology':
      return 'Radiologi';
    default:
      return 'Proses';
  }
};

const getNotificationTypeIcon = (type: DoctorNotificationItem['type']) => {
  switch (type) {
    case 'prescription':
      return Pill;
    case 'laboratory':
      return FlaskConical;
    case 'radiology':
      return Radio;
    default:
      return Bell;
  }
};

const getNotificationStatusClassName = (status: DoctorNotificationItem['status']) => {
  switch (status) {
    case 'menunggu':
      return 'bg-amber-100 text-amber-700';
    case 'diproses':
      return 'bg-blue-100 text-blue-700';
    case 'selesai':
      return 'bg-emerald-100 text-emerald-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

const getTabLabel = (tab: NotificationTab) => {
  switch (tab) {
    case 'prescription':
      return 'Resep';
    case 'laboratory':
      return 'Lab';
    case 'radiology':
      return 'Rad';
    default:
      return '';
  }
};

const getReadyFilterLabel = (tab: NotificationTab) => {
  return tab === 'prescription' ? 'Selesai' : 'Hasil Siap';
};

const isResultReadyNotification = (item: DoctorNotificationItem) =>
  (item.type === 'laboratory' || item.type === 'radiology') && item.status === 'selesai';

const getNotificationPriorityScore = (item: DoctorNotificationItem) => {
  if (isResultReadyNotification(item)) {
    return 400;
  }

  if (item.status === 'menunggu') {
    return item.type === 'prescription' ? 320 : 300;
  }

  if (item.status === 'diproses') {
    return item.type === 'prescription' ? 230 : 220;
  }

  return item.type === 'prescription' ? 120 : 140;
};

const getNotificationPriorityLabel = (item: DoctorNotificationItem) => {
  if (isResultReadyNotification(item)) {
    return 'Hasil Siap';
  }

  if (item.status === 'menunggu') {
    return 'Prioritas';
  }

  if (item.status === 'diproses') {
    return 'Dipantau';
  }

  return '';
};

const sortNotificationsByPriority = (items: DoctorNotificationItem[]) => {
  return [...items].sort((left, right) => {
    const priorityGap = getNotificationPriorityScore(right) - getNotificationPriorityScore(left);
    if (priorityGap !== 0) {
      return priorityGap;
    }

    return new Date(right.result_at || right.processed_at || right.created_at || 0).getTime()
      - new Date(left.result_at || left.processed_at || left.created_at || 0).getTime();
  });
};

const getNotificationAccentClassName = (item: DoctorNotificationItem) => {
  if (isResultReadyNotification(item)) {
    return 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70 focus:bg-emerald-100/70';
  }

  if (item.status === 'menunggu') {
    return 'border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 focus:bg-amber-100/70';
  }

  if (item.status === 'diproses') {
    return 'border-blue-200 bg-blue-50/60 hover:bg-blue-100/70 focus:bg-blue-100/70';
  }

  return 'border-transparent';
};

const getNotificationTimeText = (item: DoctorNotificationItem) => {
  if (isResultReadyNotification(item)) {
    return `Hasil ${formatNotificationTime(item.result_at || item.created_at)}`;
  }

  if (item.status === 'diproses' && (item.sampled_at || item.processed_at)) {
    return `Diproses ${formatNotificationTime(item.sampled_at || item.processed_at)}`;
  }

  return `Masuk ${formatNotificationTime(item.created_at)}`;
};

const filterNotifications = (
  items: DoctorNotificationItem[],
  filter: NotificationFilter,
  tab: NotificationTab
) => {
  if (filter === 'active') {
    return items.filter((item) => item.status !== 'selesai');
  }

  if (filter === 'ready') {
    if (tab === 'prescription') {
      return items.filter((item) => item.status === 'selesai');
    }

    return items.filter((item) => isResultReadyNotification(item));
  }

  return items;
};

const buildNotificationSummary = (items: DoctorNotificationItem[]): DoctorNotificationSummary => ({
  active: items.filter((item) => item.status !== 'selesai').length,
  menunggu: items.filter((item) => item.status === 'menunggu').length,
  diproses: items.filter((item) => item.status === 'diproses').length,
  selesai: items.filter((item) => item.status === 'selesai').length,
  prescription: items.filter((item) => item.type === 'prescription' && item.status !== 'selesai').length,
  laboratory: items.filter((item) => item.type === 'laboratory' && item.status !== 'selesai').length,
  radiology: items.filter((item) => item.type === 'radiology' && item.status !== 'selesai').length
});

const Header: React.FC<HeaderProps> = ({ 
  hospitalName, 
  isMobile = false, 
  onMenuClick,
  username,
  doctorId,
  onLogout,
  onMedicalRecordSearchClick
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = React.useState<DoctorNotificationItem[]>([]);
  const [notificationLoading, setNotificationLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<NotificationTab>('prescription');
  const [tabFilters, setTabFilters] = React.useState<Record<NotificationTab, NotificationFilter>>({
    prescription: 'all',
    laboratory: 'all',
    radiology: 'all'
  });
  const [notificationPreferences, setNotificationPreferences] = React.useState<NotificationPreferences>(() => loadNotificationPreferences());
  const previousActiveSignatureRef = React.useRef('');
  const previousResultReadySignatureRef = React.useRef('');
  const hasLoadedNotificationsRef = React.useRef(false);
  const fetchNotificationsRef = React.useRef<((showLoading?: boolean) => Promise<void>) | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const soundEnabled = notificationPreferences.sound;

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handlePreferencesChanged = (event: Event) => {
      const customEvent = event as CustomEvent<NotificationPreferences | undefined>;
      setNotificationPreferences(customEvent.detail || loadNotificationPreferences());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key) {
        setNotificationPreferences(loadNotificationPreferences());
      }
    };

    window.addEventListener(NOTIFICATION_PREFERENCES_CHANGED_EVENT, handlePreferencesChanged as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(NOTIFICATION_PREFERENCES_CHANGED_EVENT, handlePreferencesChanged as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const playNotificationSound = React.useCallback((variant: 'update' | 'lab-ready' | 'radiology-ready') => {
    if (!soundEnabled || typeof window === 'undefined') {
      return;
    }

    try {
      const audioWindow = window as Window & typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextCtor = window.AudioContext || audioWindow.webkitAudioContext;

      if (!AudioContextCtor) {
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextCtor();
      }

      const context = audioContextRef.current;
      if (context.state === 'suspended') {
        void context.resume();
      }

      const tones =
        variant === 'lab-ready'
          ? [880, 1174]
          : variant === 'radiology-ready'
            ? [740, 988]
            : [659, 784];
      const startAt = context.currentTime + 0.02;

      tones.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startAt + index * 0.18);

        gainNode.gain.setValueAtTime(0.001, startAt + index * 0.18);
        gainNode.gain.exponentialRampToValueAtTime(0.08, startAt + index * 0.18 + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startAt + index * 0.18 + 0.16);

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        oscillator.start(startAt + index * 0.18);
        oscillator.stop(startAt + index * 0.18 + 0.18);
      });
    } catch (error) {
      console.error('Unable to play notification sound:', error);
    }
  }, [soundEnabled]);

  React.useEffect(() => {
    if (!doctorId) {
      setNotifications([]);
      return;
    }

    let isMounted = true;

    const fetchNotifications = async (showLoading = false) => {
      try {
        if (showLoading && isMounted) {
          setNotificationLoading(true);
        }

        const params = new URLSearchParams({
          doctorId,
          limit: '8'
        });
        const response = await fetch(`${API_URLS.DOCTOR_NOTIFICATIONS}?${params.toString()}`, {
          credentials: 'include'
        });
        const responseJson = await response.json();

        if (!response.ok || !responseJson?.success) {
          throw new Error(responseJson?.error || `HTTP error ${response.status}`);
        }

        if (!isMounted) {
          return;
        }

        const nextNotifications = Array.isArray(responseJson?.data) ? responseJson.data : [];
        const effectiveNextNotifications = nextNotifications.filter((item: DoctorNotificationItem) => notificationPreferences[item.type]);
        const nextSummary = buildNotificationSummary(effectiveNextNotifications);
        const nextActiveSignature = effectiveNextNotifications
          .filter((item: DoctorNotificationItem) => item.status !== 'selesai')
          .map((item: DoctorNotificationItem) => `${item.id}:${item.status}`)
          .join('|');
        const nextResultReadySignature = effectiveNextNotifications
          .filter((item: DoctorNotificationItem) => isResultReadyNotification(item))
          .map((item: DoctorNotificationItem) => `${item.id}:${item.result_at || item.created_at}`)
          .join('|');
        const readyItems = effectiveNextNotifications.filter((item: DoctorNotificationItem) => isResultReadyNotification(item));
        const latestReadyItem = readyItems[0];

        const hasNewResultReady =
          hasLoadedNotificationsRef.current &&
          nextResultReadySignature &&
          nextResultReadySignature !== previousResultReadySignatureRef.current;

        if (hasNewResultReady) {
          const completedResults = nextNotifications.filter((item: DoctorNotificationItem) => isResultReadyNotification(item)).length;
          const nextPreferredTab = latestReadyItem?.type === 'radiology' ? 'radiology' : 'laboratory';
          toast.success(`Ada ${completedResults} hasil pemeriksaan siap dibaca`, {
            description: 'Periksa tab Laboratorium atau Radiologi untuk hasil terbaru.'
          });
          setActiveTab(nextPreferredTab);
          setTabFilters((previous) => ({
            ...previous,
            [nextPreferredTab]: 'ready'
          }));
          playNotificationSound(latestReadyItem?.type === 'radiology' ? 'radiology-ready' : 'lab-ready');
        } else if (
          hasLoadedNotificationsRef.current &&
          nextActiveSignature &&
          nextActiveSignature !== previousActiveSignatureRef.current
        ) {
          toast.info(`Ada pembaruan proses layanan: ${nextSummary.active} notifikasi aktif`, {
            description: 'Periksa proses resep, laboratorium, atau radiologi terbaru.'
          });
          playNotificationSound('update');
        }

        previousActiveSignatureRef.current = nextActiveSignature;
        previousResultReadySignatureRef.current = nextResultReadySignature;
        hasLoadedNotificationsRef.current = true;
        setNotifications(nextNotifications);
      } catch (error) {
        if (showLoading) {
          console.error('Error fetching doctor notifications:', error);
        }
      } finally {
        if (isMounted) {
          setNotificationLoading(false);
        }
      }
    };

    fetchNotificationsRef.current = fetchNotifications;

    void fetchNotifications(true);
    const intervalId = window.setInterval(() => {
      void fetchNotifications(false);
    }, 60000);

    return () => {
      isMounted = false;
      fetchNotificationsRef.current = null;
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
      window.clearInterval(intervalId);
    };
  }, [doctorId, notificationPreferences, playNotificationSound]);

  const effectiveNotifications = React.useMemo(
    () => notifications.filter((item) => notificationPreferences[item.type]),
    [notificationPreferences, notifications]
  );

  const notificationSummary = React.useMemo(
    () => buildNotificationSummary(effectiveNotifications),
    [effectiveNotifications]
  );

  const handleOpenNotification = (item: DoctorNotificationItem) => {
    if (!item.no_rkm_medis) {
      return;
    }

    navigate(`/rekam-medik/${item.no_rkm_medis}`, {
      state: {
        backgroundLocation: location
      }
    });
  };

  const notificationsByTab = React.useMemo<Record<NotificationTab, DoctorNotificationItem[]>>(() => ({
    prescription: sortNotificationsByPriority(effectiveNotifications.filter((item) => item.type === 'prescription')),
    laboratory: sortNotificationsByPriority(effectiveNotifications.filter((item) => item.type === 'laboratory')),
    radiology: sortNotificationsByPriority(effectiveNotifications.filter((item) => item.type === 'radiology'))
  }), [effectiveNotifications]);

  const filteredNotificationsByTab = React.useMemo<Record<NotificationTab, DoctorNotificationItem[]>>(() => ({
    prescription: filterNotifications(notificationsByTab.prescription, tabFilters.prescription, 'prescription'),
    laboratory: filterNotifications(notificationsByTab.laboratory, tabFilters.laboratory, 'laboratory'),
    radiology: filterNotifications(notificationsByTab.radiology, tabFilters.radiology, 'radiology')
  }), [notificationsByTab, tabFilters]);

  const tabStats = React.useMemo<Record<NotificationTab, { total: number; menunggu: number; diproses: number; selesai: number; active: number; readyResults: number }>>(() => {
    const buildStats = (items: DoctorNotificationItem[]) => ({
      total: items.length,
      menunggu: items.filter((item) => item.status === 'menunggu').length,
      diproses: items.filter((item) => item.status === 'diproses').length,
      selesai: items.filter((item) => item.status === 'selesai').length,
      active: items.filter((item) => item.status !== 'selesai').length,
      readyResults: items.filter((item) => isResultReadyNotification(item)).length
    });

    return {
      prescription: buildStats(notificationsByTab.prescription),
      laboratory: buildStats(notificationsByTab.laboratory),
      radiology: buildStats(notificationsByTab.radiology)
    };
  }, [notificationsByTab]);

  const renderNotificationList = (items: DoctorNotificationItem[], emptyMessage: string) => {
    if (items.length === 0) {
      return (
        <div className="px-3 py-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      );
    }

    return items.map((item) => {
      const TypeIcon = getNotificationTypeIcon(item.type);
      const priorityLabel = getNotificationPriorityLabel(item);
      const isResultReady = isResultReadyNotification(item);

      return (
        <React.Fragment key={item.id}>
          <DropdownMenuItem
            className={cn(
              'block rounded-md border px-3 py-3 cursor-pointer',
              getNotificationAccentClassName(item)
            )}
            onClick={() => handleOpenNotification(item)}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
                <TypeIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.patient_name || 'Pasien'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {getNotificationTypeLabel(item.type)} • {item.reference_id}
                    </p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold', getNotificationStatusClassName(item.status))}>
                    {item.status_label}
                  </span>
                </div>
                {priorityLabel ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={cn(
                      'rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide',
                      isResultReady ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white'
                    )}>
                      {priorityLabel}
                    </span>
                    {isResultReady ? (
                      <span className="text-[11px] font-medium text-emerald-700">
                        Hasil pemeriksaan sudah tersedia
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {item.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>No. RM {item.no_rkm_medis || '-'}</span>
                  <span>{getNotificationTimeText(item)}</span>
                </div>
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </React.Fragment>
      );
    });
  };

  return (
    <header className="fixed top-0 left-0 right-0 bg-primary h-16 w-full shadow-md z-50">
      <div className="h-full flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center">
          {isMobile && (
            <button 
              onClick={onMenuClick}
              className="mr-3 p-1.5 rounded-full text-white hover:bg-white/20 transition-colors"
              aria-label="Toggle navigation menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          )}
          <img 
            src={logoImg} 
            alt="Hospital Logo" 
            className="h-10 w-10 mr-3 object-contain"
          />          
          <h1 className="text-white font-bold text-base md:text-lg truncate">{hospitalName}</h1>
        </div>
        
        <div className="flex items-center space-x-3 md:space-x-4">
          <div className="relative hidden md:block">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-white/60" />
            </div>
            <button
              type="button"
              onClick={onMedicalRecordSearchClick}
              className="w-72 bg-white/10 text-left text-white/70 hover:bg-white/15 border-none rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition-colors"
            >
              Cari rekam medis pasien...
            </button>
          </div>

          <button
            type="button"
            onClick={onMedicalRecordSearchClick}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors md:hidden"
            aria-label="Cari rekam medis pasien"
          >
            <Search className="h-5 w-5 text-white" />
          </button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                aria-label="Notifikasi proses layanan"
              >
                {notificationLoading ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Bell className="h-5 w-5 text-white" />
                )}
                {notificationSummary.active > 0 ? (
                  <span className="absolute -top-2 -right-2 min-w-[24px] h-6 px-1.5 bg-red-600 text-white text-xs leading-none font-extrabold rounded-full border-2 border-white shadow-md flex items-center justify-center z-10">
                    {notificationSummary.active > 99 ? '99+' : notificationSummary.active}
                  </span>
                ) : null}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[360px] p-0">
              <div className="px-4 py-3 border-b">
                <div className="flex items-center justify-between gap-2">
                  <DropdownMenuLabel className="p-0">Notifikasi Proses</DropdownMenuLabel>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        const nextPreferences = {
                          ...notificationPreferences,
                          sound: !notificationPreferences.sound
                        };
                        setNotificationPreferences(nextPreferences);
                        saveNotificationPreferences(nextPreferences);
                      }}
                      aria-label={soundEnabled ? 'Matikan suara notifikasi' : 'Aktifkan suara notifikasi'}
                    >
                      {soundEnabled ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => void fetchNotificationsRef.current?.(true)}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pantau proses peresepan, laboratorium, dan radiologi pasien Anda.
                </p>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <span>
                    Total aktif: <span className="font-semibold">{notificationSummary.active}</span>
                  </span>
                  <span className={cn(
                    'rounded-full px-2 py-1 font-semibold',
                    soundEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                  )}>
                    {soundEnabled ? 'Suara ON' : 'Suara OFF'}
                  </span>
                </div>
              </div>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as NotificationTab)} className="w-full">
                <div className="px-2 pt-2">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="prescription" className="gap-2 text-xs">
                      Resep
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                        {tabStats.prescription.active}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="laboratory" className="gap-2 text-xs">
                      Laboratorium
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                        {tabStats.laboratory.active}
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="radiology" className="gap-2 text-xs">
                      Radiologi
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                        {tabStats.radiology.active}
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                {(['prescription', 'laboratory', 'radiology'] as NotificationTab[]).map((tab) => (
                  <TabsContent key={tab} value={tab} className="mt-0">
                    <div className="px-2 pb-2">
                      <div className="grid grid-cols-3 gap-2 px-2 py-2 text-xs">
                        <div className="rounded-md bg-amber-50 px-2 py-2 text-amber-700">
                          <div className="font-semibold">{tabStats[tab].menunggu}</div>
                          <div>Menunggu</div>
                        </div>
                        <div className="rounded-md bg-blue-50 px-2 py-2 text-blue-700">
                          <div className="font-semibold">{tabStats[tab].diproses}</div>
                          <div>Diproses</div>
                        </div>
                        <div className="rounded-md bg-emerald-50 px-2 py-2 text-emerald-700">
                          <div className="font-semibold">{tabStats[tab].selesai}</div>
                          <div>Selesai</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 px-2 pb-1 text-[11px] text-muted-foreground">
                        <span>
                          {getTabLabel(tab)}: {tabStats[tab].total} item, {tabStats[tab].active} aktif
                        </span>
                        {(tab === 'laboratory' || tab === 'radiology') && tabStats[tab].readyResults > 0 ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                            Hasil siap: {tabStats[tab].readyResults}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2 px-2 pb-2">
                        <Button
                          type="button"
                          variant={tabFilters[tab] === 'all' ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => setTabFilters((previous) => ({ ...previous, [tab]: 'all' }))}
                        >
                          Semua
                        </Button>
                        <Button
                          type="button"
                          variant={tabFilters[tab] === 'active' ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => setTabFilters((previous) => ({ ...previous, [tab]: 'active' }))}
                        >
                          Aktif Saja
                        </Button>
                        <Button
                          type="button"
                          variant={tabFilters[tab] === 'ready' ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => setTabFilters((previous) => ({ ...previous, [tab]: 'ready' }))}
                        >
                          {getReadyFilterLabel(tab)}
                        </Button>
                      </div>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto p-2 pt-0">
                      {renderNotificationList(
                        filteredNotificationsByTab[tab],
                        notificationPreferences[tab]
                          ? `Belum ada notifikasi ${getTabLabel(tab).toLowerCase()} untuk filter ini.`
                          : `Notifikasi ${getTabLabel(tab).toLowerCase()} sedang dinonaktifkan di Pengaturan.`
                      )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-2 cursor-pointer">
                <div className="h-9 w-9 bg-white/20 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-white" />
                </div>
                {!isMobile && username && (
                  <div className="text-white text-sm hidden md:block">{username}</div>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-sm font-medium">
                {username || 'User'}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/pengaturan')} className="cursor-pointer">
                <SettingsIcon className="mr-2 h-4 w-4" />
                <span>Pengaturan</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="text-red-500 cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Header;
