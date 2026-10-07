import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  Activity, ArrowLeft, ArrowRight, Check, ChevronRight, Compass, Crosshair,
  Copy, Eye, EyeOff, Flag, Gauge, Headphones, MapPin, Menu, Navigation, Pause,
  Play, Plus, RefreshCw, RotateCcw, Search, Settings, Shield, Siren, Sparkles,
  Trash2, Users, Volume2, VolumeX, Waves, X, Map, Upload,
  CircleHelp,
  Download,
} from 'lucide-react';
import {
  getGetAdminOverviewQueryKey, getGetCheckpointsQueryKey, getGetCurrentUserQueryKey,
  getHealthCheckQueryKey,
  getExportResultsQueryKey, getGetGameSettingsQueryKey, getGetGameStateQueryKey, getGetTeamsQueryKey,
  useAdminLogin, useBulkCreateTeams, useCreateCheckpoint, useCreateTeam, useDeactivateCheckpoint,
   useDeleteTeam, useEndEvent, useExportResults, useGetAdminOverview, useGetCheckpoints,
  useGetCurrentUser, useGetGameSettings, useGetGameState, useGetTeams, useHealthCheck, useLogout,
   usePauseEvent, useRegenerateTeamCode, useReleaseTeamLogin, useResetTeam, useStartEvent, useStartVoyage, useTeamLogin,
  useUpdateCheckpoint, useUpdateGameSettings, useUpdateTeam,
} from '@workspace/api-client-react';
import type { AdminOverview, AdminTeam, Checkpoint, Completion, GameSettings, GameState } from '@workspace/api-client-react';
import type { ButtonHTMLAttributes, FormEvent, ReactNode } from 'react';
import { useOdysseySocket } from '@/hooks/use-odyssey-socket';
import { createSirenAudio, type SirenAudioEngine } from '@/lib/siren-audio';
import { ErrorBoundary } from '@/components/error-boundary';
import { VolunteerAccountsPanel } from '@/components/admin/VolunteerAccountsPanel';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { BRAND } from '../../../shared/branding';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });
const apiErr = (e: unknown) => (typeof e === 'string' ? e : e instanceof Error ? e.message : 'The oracle could not complete that request. Please try again.');
const statusLabel = (s?: string) => (s || 'NOT_STARTED').replaceAll('_', ' ').toLowerCase();
const brandTitleParts = BRAND.event.split(/\s+/);
const brandTitleLineOne = brandTitleParts.slice(0, 2).join(' ');
const brandTitleLineTwo = brandTitleParts.slice(2).join(' ');
const brandFileStem = `${BRAND.event.toLowerCase().replace(/ 3\.0$/, ' 3').replace(/[^a-z0-9]+/g, '-')}-${BRAND.subtitle.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '-')}`;
const normalizeTeamCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const formatTeamCode = (value: string) => {
  const normalized = normalizeTeamCode(value);
  return normalized.length > 4 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
};
function getOrCreateDeviceId() {
  const storageKey = 'watt-a-play-device-id';
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const id = window.crypto.randomUUID();
  window.localStorage.setItem(storageKey, id);
  return id;
}
type Team = AdminTeam;
const timeAgo = (date?: string | null) => {
  if (!date) return 'Not yet seen';
  const sec = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  return sec < 60 ? `${sec}s ago` : `${Math.floor(sec / 60)}m ago`;
};
function Brand({ compact = false, darkSurface = false }: { compact?: boolean; darkSurface?: boolean }) {
  const logoSurfaceClass = darkSurface || compact ? 'bg-[#f1e4c4]' : 'bg-[#e8d6b0]';
  return <div className="flex items-center gap-3">
    <div className={`grid h-11 w-11 shrink-0 place-items-center ${logoSurfaceClass}`}>
      <img src={BRAND.logoPath} alt={BRAND.organiser} className="h-full w-full object-contain mix-blend-multiply"/>
    </div>
    <div className="min-w-0">
      {!compact && <div className="font-script text-lg leading-none text-[#5c4026]">{BRAND.presenter}</div>}
      <div className="font-cinzel text-[13px] font-extrabold leading-tight tracking-[.06em] text-[#2a1b10]">{BRAND.event}</div>
      {!compact && <div className="font-cormorant text-[12px] font-semibold tracking-[.15em] text-[#5c4026]">{BRAND.subtitle}</div>}
    </div>
  </div>;
}
function LogoUploadSlot({small=false,slot='logo',surface='parchment'}:{small?:boolean;slot?:string;surface?:'parchment'|'tag'}) {
  const surfaceClass = surface === 'tag' || slot === 'admin-header' || slot === 'admin-sidebar' || slot === 'login-organiser' ? 'bg-[#f1e4c4]' : 'bg-[#e8d6b0]';
  return <div className={`flex shrink-0 items-center justify-center ${surfaceClass} ${small?'h-11 w-11':'h-12 w-[148px]'}`} title={BRAND.organiser}>
    <img src={BRAND.logoPath} alt={BRAND.organiser} className="h-full w-full object-contain mix-blend-multiply" data-brand-slot={slot}/>
  </div>;
}
function Starfield() { return <div aria-hidden className="pointer-events-none fixed inset-0 starfield opacity-50" />; }
function Header({ label = 'THE ODYSSEY' }: { label?: string }) {
  return <header className="relative z-10 flex items-center justify-between border-b border-[#9c7a4b80] px-5 py-4 sm:px-8"><Brand /><span className="hidden font-cinzel text-[10px] tracking-[.18em] text-[#5c4026] sm:block">{label}</span><LogoUploadSlot small slot="team-header"/></header>;
}
function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div className="border border-[#c1440e80] bg-[#c1440e16] p-4 text-sm text-[#f2b69e]" role="alert" data-testid="status-error"><div className="font-cinzel">The Fates Have Spoken</div><p className="mt-1">{apiErr(error)}</p>{retry && <button className="mt-3 inline-flex min-h-10 items-center gap-2 underline" onClick={retry} data-testid="button-retry"><RefreshCw size={14}/> Try again</button>}</div>;
}
function Loading({ text = 'Consulting the oracle…' }: { text?: string }) {
  return <div className="space-y-3" aria-label="Loading"><div className="h-16 animate-pulse bg-[#12284d]"/><div className="h-32 animate-pulse bg-[#102344]"/><p className="font-cormorant text-lg italic text-[#b9c4d5]">{text}</p></div>;
}
function PageTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return <div className="mb-7"><p className="label text-[#d4af37]">{eyebrow}</p><h1 className="mt-2 font-cinzel text-2xl tracking-wide text-[#ede6d6] sm:text-3xl">{title}</h1>{detail && <p className="mt-2 max-w-2xl font-cormorant text-xl text-[#b9c4d5]">{detail}</p>}</div>;
}
function GoldButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`gold-button flex w-full items-center justify-center gap-2 rounded-sm px-5 ${props.className || ''}`} style={{color:'#f1e4c4'}}>{children}</button>;
}
function TallShip() {
  return <svg className="tall-ship" viewBox="0 0 560 230" role="img" aria-label="Engraved tall ship illustration">
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path strokeWidth="4" d="M36 190q228 27 485-4l-54 26q-178 18-367-2zM130 190l12-131m94 134V22m111 136-4-116m-93 0 80 27m-93-2-75 28m99-56-68-34m70 1 72-34"/>
      <path strokeWidth="2.5" d="m139 67-4 101-62-22zm-1 10-47 56m45-34-56 32m157-119 4 124-79-22zm3 10 67 80m-65-52-76 31m151-94-2 102-61-22zm0 18 48 61m-47-36-58 26m150-81 8 79-44-11zm4 16 31 42m-31-24-46 19M105 187l20-41m51 44 20-41m58 43 17-42m44 42 14-35m53 37 19-31m-278-7 256 8m-179-119 18 10m-20 18 31 5m-25 17 28 4m-95 9 20 10m-20 15 20 6m-21 14 19 4m117-109 20 9m-18 18 21 6m-22 14 20 5m-75 17 22 8m-22 13 21 6m-22 12 21 4"/>
      <path strokeWidth="1.4" d="M62 198q218 18 419-4M147 59 115 39m137-15 40-19m69 41 39-18M196 32l-34-19m113 33 39-21M122 85l-32-16m165-26 32 3m-117 52-32-3m197 3 28-10m-115 29 27 9m-179 10 25 9m309 41 45 7M82 185l-27-9m349-70 37-13M221 135l27 9m-64 27 28 7m97-39 28 8"/>
      <path strokeWidth="1" d="M35 219h474M53 225h450M110 188l-26 29m117-29-20 29m119-29-15 29m92-30-8 28M122 196h278m-258 9h224"/>
    </g>
  </svg>;
}
function App() {
  const [online,setOnline]=useState(true);
  const [secureContext,setSecureContext]=useState(true);
  useEffect(()=>{
    const updateOnline=()=>setOnline(navigator.onLine);
    setOnline(navigator.onLine);
    setSecureContext(window.isSecureContext);
    window.addEventListener('online',updateOnline);
    window.addEventListener('offline',updateOnline);
    return()=>{window.removeEventListener('online',updateOnline);window.removeEventListener('offline',updateOnline);};
  },[]);
  useEffect(()=>{
    document.title = `${BRAND.event}: ${BRAND.subtitle}`;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    const twitterTitle = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]');
    const descriptionText = `${BRAND.segment}, presented by ${BRAND.organiser}.`;
    if(description) description.content = descriptionText;
    if(ogTitle) ogTitle.content = document.title;
    if(ogDescription) ogDescription.content = descriptionText;
    if(twitterTitle) twitterTitle.content = document.title;
    const twitterDescription = document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]');
    if(twitterDescription) twitterDescription.content = descriptionText;
  },[]);
  return <QueryClientProvider client={queryClient}><TooltipProvider>
    {(!online||!secureContext)&&<div className="fixed inset-x-0 top-0 z-[100] border-b border-[#d4af3770] bg-[#07152fee] px-4 py-2 text-center text-xs text-[#f2d98a]" role={secureContext?'status':'alert'} aria-live="polite" data-testid="status-app-environment">
      {!online?'Connection lost. The last GPS fix will resume syncing when you reconnect.':"This page is not using a secure connection. GPS and compass permissions require HTTPS."}
    </div>}
    <WouterRouter><Routed/></WouterRouter><Toaster/>
  </TooltipProvider></QueryClientProvider>;
}
function Routed() {
  const [path] = useLocation();
  return <ErrorBoundary resetKey={path}><Starfield/><Switch>
    <Route path="/" component={TeamEntry}/><Route path="/voyage" component={Voyage}/>
    <Route path="/admin/login" component={AdminLogin}/>
    <Route path="/admin" component={AdminOverviewPage}/><Route path="/admin/checkpoints" component={CheckpointsPage}/>
    <Route path="/admin/teams" component={TeamsPage}/><Route path="/admin/settings" component={SettingsPage}/>
    <Route path="/admin/volunteers" component={VolunteerAccountsPage}/>
    <Route component={NotFound}/>
  </Switch></ErrorBoundary>;
}
function TeamEntry() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000, retry: false } });
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false } });
  const login = useTeamLogin();
  const [accessCode, setAccessCode] = useState('');
  const [captainName, setCaptainName] = useState('');
  const [needsCaptainName, setNeedsCaptainName] = useState(false);
  const [error, setError] = useState('');
  const submittedCode = useRef('');
  const eventState = useGetGameState({ query: { queryKey: getGetGameStateQueryKey(), enabled: !!current.data?.user && current.data.user.role === 'TEAM', retry: false, refetchInterval: 12000 } });
   useEffect(() => {
     const role = current.data?.user?.role;
     if (role === 'TEAM') setLocation('/voyage');
     else if (role === 'ADMIN' || role === 'VOLUNTEER') setLocation('/admin');
   }, [current.data, setLocation]);
  const submit = async (e?: FormEvent, rawCode = accessCode) => {
    e?.preventDefault();
    const code = normalizeTeamCode(rawCode);
    if(code.length !== 8 || login.isPending) return;
    const submissionKey = `${code}|${needsCaptainName ? captainName.trim() : ''}`;
    if(submittedCode.current === submissionKey) return;
    submittedCode.current = submissionKey;
    setError('');
    try {
      await login.mutateAsync({
        data: {
          code,
          deviceId: getOrCreateDeviceId(),
          ...(needsCaptainName ? { leaderName: captainName.trim() } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      setLocation('/voyage');
    } catch (e) {
      const responseCode = (e as { data?: { code?: string } })?.data?.code;
      if(responseCode === 'NEEDS_LEADER_NAME') {
        setNeedsCaptainName(true);
        submittedCode.current = `${code}|`;
      } else {
        submittedCode.current = '';
        setError(apiErr(e));
      }
    }
  };
  const waiting = eventState.data && eventState.data.eventStatus !== 'ACTIVE';
  return <main className="relative min-h-[100dvh] overflow-hidden px-5 pb-12 pt-[max(18px,env(safe-area-inset-top))]">
    <Header label={BRAND.segment.toUpperCase()}/>
    <div className="poster-layout relative z-10 mx-auto grid max-w-6xl items-center gap-8 py-7 md:min-h-[calc(100dvh-105px)] md:grid-cols-[1.1fr_.9fr] md:gap-12 md:py-10">
      <section className="poster-copy relative text-left">
        <div className="poster-corner-frame" aria-hidden="true"><span/><span/><span/><span/></div>
        <p className="font-script text-[clamp(1.3rem,5vw,2.1rem)] leading-none text-[#5c4026]">{BRAND.presenter}</p>
        <h1 className="poster-title mt-3 font-cinzel uppercase leading-[.95] tracking-[-.045em] text-[#2a1b10]" aria-label={BRAND.event}><span>{brandTitleLineOne}</span>{brandTitleLineTwo&&<span>{brandTitleLineTwo}</span>}</h1>
        <p className="mt-4 font-cinzel text-sm font-semibold tracking-[.24em] text-[#5c4026] sm:text-base">{BRAND.subtitle}</p>
        <p className="mt-3 font-cormorant text-xl italic text-[#5c4026]">{BRAND.segment}</p>
        <p className="mt-6 max-w-md border-l-2 border-[#8b2e1f] pl-4 font-cormorant text-lg leading-relaxed text-[#2a1b10]">One code for the captain. No map to follow. Listen for the Siren and trust the 39-Second Oracle.</p>
        <TallShip/>
      </section>
      <section className="paper-card relative mx-auto w-full max-w-md p-6 sm:p-8">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="label">{BRAND.organiser.toUpperCase()} · CAPTAIN ACCESS</p><h2 className="mt-1 font-cinzel text-xl">Enter your team code</h2></div><Compass className="mt-1 shrink-0 text-[#5c4026]" size={24} strokeWidth={1.3}/></div>
        <div className="mb-4 flex min-h-6 items-center gap-2 text-[10px] uppercase tracking-[.12em]" role="status" aria-live="polite" data-testid="status-service-health"><span className={`h-1.5 w-1.5 rounded-full ${health.isError?'bg-[#c1440e]':health.isLoading?'bg-[#d4af37]':'bg-[#73c999]'}`}/>{health.isError?'Oracle connection unavailable':health.isLoading?'Checking the oracle connection':'Oracle connection ready'}{health.isError&&<button type="button" className="ml-auto min-h-10 px-2 text-[#f2d98a] underline" onClick={()=>void health.refetch()} data-testid="button-retry-service-health">Retry</button>}</div>
        {waiting && <div className="mb-5 border border-[#9c7a4b] bg-[#e8d6b0] p-4" data-testid="status-event-waiting"><p className="font-cinzel text-sm">The hunt hasn’t started yet</p><p className="mt-1 text-xs leading-relaxed">Hold position. Your crew can set sail when the volunteers open the event.</p></div>}
        {error && <div className="mb-4"><ErrorNotice error={error}/></div>}
        <form onSubmit={(e)=>void submit(e)} className="space-y-4">
          <label className="block"><span className="label mb-2 block">Team access code</span><input required autoFocus autoComplete="one-time-code" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" maxLength={9} className="field font-coordinate text-center text-2xl font-semibold tracking-[.22em]" placeholder="K7MQ-4XPD" value={accessCode} onChange={e=>{const formatted=formatTeamCode(e.target.value);setAccessCode(formatted);setError('');if(normalizeTeamCode(formatted).length===8&&!needsCaptainName)window.setTimeout(()=>void submit(undefined,formatted),0);}} aria-label="Eight-character team access code" data-testid="input-team-access-code"/></label>
          {needsCaptainName&&<label className="block"><span className="label mb-2 block">Captain’s name</span><input required autoComplete="name" autoFocus className="field" placeholder="Name of the captain" value={captainName} onChange={e=>{setCaptainName(e.target.value);submittedCode.current='';}} data-testid="input-captain-name"/></label>}
          <GoldButton type="submit" disabled={login.isPending||normalizeTeamCode(accessCode).length!==8||(needsCaptainName&&!captainName.trim())} data-testid="button-begin-voyage">{login.isPending?'Checking the code…':needsCaptainName?'Claim this phone':'Continue'}<ArrowRight size={17}/></GoldButton>
        </form>
        <div className="mt-5 flex items-start gap-2 border-t border-[#9c7a4b80] pt-4 text-xs leading-relaxed text-[#5c4026]"><Shield size={14} className="mt-0.5 shrink-0"/>Captain only. Keep this phone with your team. Ask an IET NITK organiser if you lose your code or phone.</div>
        <div className="organiser-tag mt-5 flex items-center gap-3"><LogoUploadSlot surface="tag" slot="login-organiser"/><span className="label">Organised by<br/><strong className="mt-1 block text-[#2a1b10]">{BRAND.organiser}</strong></span></div>
      </section>
    </div>
    <footer className="relative z-10 text-center font-cormorant text-base italic text-[#5c4026]">{BRAND.event} · {BRAND.subtitle}</footer>
  </main>;
}

function useWakeLock() {
  const lock = useRef<WakeLockSentinel | null>(null);
  const requested=useRef(false);
  const request=async()=>{
    try{
      if('wakeLock' in navigator&&document.visibilityState==='visible'){
        lock.current=await navigator.wakeLock.request('screen');
        requested.current=true;
      }
    }catch{requested.current=false;}
  };
  useEffect(()=>{
    const onVisibility=()=>{if(document.visibilityState==='visible'&&requested.current)void request();};
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{document.removeEventListener('visibilitychange',onVisibility);void lock.current?.release();};
  },[]);
  return request;
}
function haversine(a: GeolocationCoordinates | null, lat: number, lng: number) {
  if(!a)return null; const R=6371000, rad=(n:number)=>n*Math.PI/180, dLat=rad(lat-a.latitude),dLng=rad(lng-a.longitude);
  const x=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function bearing(a: GeolocationCoordinates, lat:number,lng:number) {
  const r=(n:number)=>n*Math.PI/180, y=Math.sin(r(lng-a.longitude))*Math.cos(r(lat)), x=Math.cos(r(a.latitude))*Math.sin(r(lat))-Math.sin(r(a.latitude))*Math.cos(r(lat))*Math.cos(r(lng-a.longitude));
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function direction(deg:number) { return ['North','North-East','East','South-East','South','South-West','West','North-West'][Math.round(deg/45)%8]; }
function Voyage() {
  const [,setLocation]=useLocation(); const qc=useQueryClient();
  const user=useGetCurrentUser({query:{queryKey:getGetCurrentUserQueryKey(),retry:false}});
  const game=useGetGameState({query:{queryKey:getGetGameStateQueryKey(),enabled:!!user.data?.user&&user.data.user.role==='TEAM',retry:false,refetchInterval:15000}});
  const start=useStartVoyage(); const logout=useLogout();
  const [gps,setGps]=useState<'searching'|'ready'|'lost'|'denied'>('searching');
  const [bearingText,setBearingText]=useState('—'); const [distanceBand,setDistanceBand]=useState('Waiting for a signal');
  const [remaining,setRemaining]=useState(39); const [songOn,setSongOn]=useState(false); const [muted,setMuted]=useState(false); const [volume,setVolume]=useState(40);
  const [audioLevel,setAudioLevel]=useState(0);const [audioNeedsGesture,setAudioNeedsGesture]=useState(false);const [audioUnavailable,setAudioUnavailable]=useState(false);
  const [compassAngle,setCompassAngle]=useState(0);const [orientationPermission,setOrientationPermission]=useState<'unknown'|'granted'|'denied'|'unavailable'>('unknown');
  const [permissionError,setPermissionError]=useState('');const [starting,setStarting]=useState(false);
  const debugEnabled=import.meta.env.DEV&&new URLSearchParams(window.location.search).get('debug')==='1';
  const pos=useRef<GeolocationCoordinates|null>(null);const targetRef=useRef<GameState['currentCheckpoint']>(null);const siren=useRef<SirenAudioEngine|null>(null);const geo=useRef<number|undefined>(undefined);const heading=useRef<number|null>(null);const volumeRef=useRef(volume);const mutedRef=useRef(muted);const audioLevelRef=useRef(-1);const lastCompletions=useRef<number|null>(null);const simModeRef=useRef(false);const [simMode,setSimMode]=useState(false);const [arrival,setArrival]=useState<{name:string;at:string}|null>(null);const [socketError,setSocketError]=useState('');
  const lastMovementAt=useRef(Date.now());const lastMotionCoords=useRef<{lat:number;lng:number}|null>(null);const lastSocketEmitAt=useRef(0);const lastArrivalTargetId=useRef<string|null>(null);
  const requestWakeLock=useWakeLock();
  const updateSiren=(distanceM:number|null,radiusM:number)=>{
    if(!siren.current)return;
    const state=siren.current.setProximity(distanceM,radiusM,volumeRef.current/100,mutedRef.current);
    setSongOn(state.active);
    if(state.level!==audioLevelRef.current){audioLevelRef.current=state.level;setAudioLevel(state.level);}
  };
  const handlePosition=(position:GeolocationPosition)=>{
    if(simModeRef.current)return;
    const coords=position.coords,previous=lastMotionCoords.current;
    if(previous){const moved=haversine(coords,previous.lat,previous.lng);if(moved!==null&&moved>=5)lastMovementAt.current=Date.now();}
    else lastMovementAt.current=Date.now();
    lastMotionCoords.current={lat:coords.latitude,lng:coords.longitude};
    pos.current=coords;
    setGps((current)=>current==='ready'?current:'ready');
    const target=targetRef.current;
    if(target){const distance=haversine(coords,target.lat,target.lng);updateSiren(distance,target.radiusM);}
  };
  const handlePositionError=(error:GeolocationPositionError)=>{
    pos.current=null;
    const denied=error.code===1;
    setGps(denied?'denied':'lost');
    setPermissionError(denied?'Location access is blocked. Allow precise location for this browser, then tap Begin your route again.':`GPS signal unavailable: ${error.message}`);
    updateSiren(null,targetRef.current?.radiusM??30);
  };
  const startLocationWatch=()=>{
    if(geo.current!==undefined)return;
    if(!navigator.geolocation){setGps('denied');throw new Error('This browser does not provide location services. Open the voyage in a browser with GPS access.');}
    geo.current=navigator.geolocation.watchPosition(handlePosition,handlePositionError,{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  };
  const requestCurrentPosition=()=>new Promise<GeolocationPosition>((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error('This browser does not provide location services.'));return;}
    navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  });
  const requestOrientationAccess=async()=>{
    const OrientationEvent=window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<'granted'|'denied'>})|undefined;
    if(!OrientationEvent){return 'unavailable' as const;}
    if(typeof OrientationEvent.requestPermission!=='function'){return 'granted' as const;}
    return (await OrientationEvent.requestPermission())==='granted'?'granted' as const:'denied' as const;
  };
  const teamSocket=useOdysseySocket(user.data?.user?.role==='TEAM',{
    'target:update':()=>{void qc.invalidateQueries({queryKey:getGetGameStateQueryKey()});},
    'checkpoint:captured':()=>{void qc.invalidateQueries({queryKey:getGetGameStateQueryKey()});},
    'voyage:complete':()=>{void qc.invalidateQueries({queryKey:getGetGameStateQueryKey()});},
    'event:status':()=>{void qc.invalidateQueries({queryKey:getGetGameStateQueryKey()});},
    'error:flagged':(payload)=>setSocketError(typeof payload==='string'?payload:(payload&&typeof payload==='object'&&'message'in payload&&typeof payload.message==='string'?payload.message:'A location signal was flagged. Your progress remains with the volunteers.')),
  },()=>{void qc.invalidateQueries({queryKey:getGetGameStateQueryKey()});});
  useEffect(()=>{if(user.isError)setLocation('/');},[user.isError,setLocation]);
  useEffect(()=>{const target=game.data?.currentCheckpoint||null;targetRef.current=target;const currentId=target?.id??null;if(lastArrivalTargetId.current&&lastArrivalTargetId.current!==currentId)lastArrivalTargetId.current=null;const distance=pos.current&&target?haversine(pos.current,target.lat,target.lng):null;updateSiren(distance,target?.radiusM??30);if(game.data){const count=game.data.completions?.length??0;if(lastCompletions.current===null)lastCompletions.current=count;else if(count>lastCompletions.current){const c=game.data.completions[count-1];setArrival({name:c.checkpointName,at:c.completedAt});if('vibrate'in navigator)navigator.vibrate([70,35,120]);void siren.current?.playChime();lastCompletions.current=count;}else if(count<lastCompletions.current)lastCompletions.current=count;}},[game.data]);
  useEffect(()=>{volumeRef.current=volume;mutedRef.current=muted;const target=targetRef.current;const distance=pos.current&&target?haversine(pos.current,target.lat,target.lng):null;updateSiren(distance,target?.radiusM??30);},[volume,muted]);
  useEffect(()=>{if(!game.data?.currentCheckpoint)return;try{startLocationWatch();}catch(error){handlePositionError({code:2,message:apiErr(error),PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3} as GeolocationPositionError);}return()=>{if(geo.current!==undefined&&navigator.geolocation){navigator.geolocation.clearWatch(geo.current);geo.current=undefined;}};},[game.data?.currentCheckpoint?.id]);
  useEffect(()=>()=>{siren.current?.destroy();},[]);
  useEffect(()=>{
    const onVisibility=()=>{
      if(document.visibilityState!=='visible'||!siren.current||mutedRef.current)return;
      void siren.current.resume().then((resumed)=>{setAudioNeedsGesture(!resumed);const target=targetRef.current;const distance=pos.current&&target?haversine(pos.current,target.lat,target.lng):null;updateSiren(distance,target?.radiusM??30);});
    };
    document.addEventListener('visibilitychange',onVisibility);
    return()=>document.removeEventListener('visibilitychange',onVisibility);
  },[]);
  useEffect(()=>{
    const targetId=game.data?.currentCheckpoint?.id;
    if(!targetId||arrival){setRemaining(39);return;}
    let startAt=performance.now(),raf=0,lastSecond=39;
    const tick=()=>{
      const elapsed=(performance.now()-startAt)/1000,seconds=Math.max(0,Math.ceil(39-elapsed));
      if(seconds!==lastSecond){lastSecond=seconds;setRemaining(seconds);}
      if(elapsed>=39){
        const target=targetRef.current,point=pos.current;
        if(point&&target){
          const absoluteBearing=bearing(point,target.lat,target.lng),distance=haversine(point,target.lat,target.lng);
          setBearingText(direction(absoluteBearing));
          setCompassAngle((absoluteBearing-(heading.current??0)+360)%360);
          setDistanceBand(distance===null?'Waiting for a signal':distance>150?'Far':distance>70?'Near':distance>25?'Close':'Very close');
        }else{setBearingText('—');setCompassAngle(0);setDistanceBand('Waiting for a signal');}
        startAt=performance.now();lastSecond=39;
      }
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[game.data?.currentCheckpoint?.id,arrival]);
  useEffect(()=>{
    const onOrientation=(e:DeviceOrientationEvent)=>{const h=(e as DeviceOrientationEvent & {webkitCompassHeading?:number}).webkitCompassHeading??(e.alpha===null?null:360-e.alpha);if(h!==null)heading.current=h;};
    window.addEventListener('deviceorientationabsolute',onOrientation as EventListener);window.addEventListener('deviceorientation',onOrientation);return()=>{window.removeEventListener('deviceorientationabsolute',onOrientation as EventListener);window.removeEventListener('deviceorientation',onOrientation);};
  },[]);
  const playTone=async()=>{try{if(!siren.current){try{siren.current=createSirenAudio();}catch{setAudioUnavailable(true);return;}}await siren.current.unlock();setAudioUnavailable(false);setAudioNeedsGesture(false);setMuted(false);mutedRef.current=false;const target=targetRef.current,distance=pos.current&&target?haversine(pos.current,target.lat,target.lng):null;updateSiren(distance,target?.radiusM??30);}catch{setSongOn(false);setAudioNeedsGesture(true);}};
  const applySimPosition=(lat:number,lng:number)=>{const coords={latitude:lat,longitude:lng,accuracy:4,altitude:null,altitudeAccuracy:null,heading:null,speed:null} as GeolocationCoordinates;const previous=lastMotionCoords.current;if(!previous||((haversine(coords,previous.lat,previous.lng)??0)>=5))lastMovementAt.current=Date.now();lastMotionCoords.current={lat,lng};pos.current=coords;setGps('ready');const target=targetRef.current;if(target){const d=haversine(coords,target.lat,target.lng);updateSiren(d,target.radiusM);setDistanceBand(d===null?'Waiting for a signal':d>150?'Far':d>70?'Near':d>25?'Close':'Very close');const absoluteBearing=bearing(coords,target.lat,target.lng);setBearingText(direction(absoluteBearing));setCompassAngle((absoluteBearing-(heading.current??0)+360)%360);}};
  const toggleSimulator=()=>{const enabled=!simModeRef.current;simModeRef.current=enabled;setSimMode(enabled);if(enabled){const target=targetRef.current;if(target)applySimPosition(pos.current?.latitude??target.lat+0.00045,pos.current?.longitude??target.lng);}};
  const walkTowardTarget=()=>{const target=targetRef.current;if(!target)return;const here=pos.current;if(!here){applySimPosition(target.lat+0.00045,target.lng);return;}const north=(target.lat-here.latitude)*111320;const east=(target.lng-here.longitude)*111320*Math.cos(target.lat*Math.PI/180);const distance=Math.hypot(north,east);if(distance<1){applySimPosition(target.lat,target.lng);return;}const stride=Math.min(12,distance);applySimPosition(here.latitude+(north/distance*stride)/111320,here.longitude+(east/distance*stride)/(111320*Math.cos(target.lat*Math.PI/180)));};
  useEffect(()=>{const onVisibility=()=>{if(document.visibilityState==='visible'&&teamSocket.connection==='connected')lastSocketEmitAt.current=0;};document.addEventListener('visibilitychange',onVisibility);return()=>document.removeEventListener('visibilitychange',onVisibility);},[teamSocket.connection]);
  useEffect(()=>{
    if(teamSocket.connection!=='connected')return;
    const sendLatest=()=>{
      if(document.visibilityState!=='visible'||!pos.current)return;
      const now=Date.now(),moving=now-lastMovementAt.current<30000,interval=moving?7000:20000;
      if(now-lastSocketEmitAt.current<interval)return;
      const point=pos.current,target=targetRef.current,socket=teamSocket.socketRef.current;
      if(!socket)return;
      socket.emit('location:update',{lat:point.latitude,lng:point.longitude,accuracy:point.accuracy,...(heading.current!==null?{heading:heading.current}:{}),ts:now},(ack?:{qualifies?:boolean})=>{
        if(ack?.qualifies&&target&&targetRef.current?.id===target.id&&lastArrivalTargetId.current!==target.id){
          socket.emit('checkpoint:arrive',{});
          lastArrivalTargetId.current=target.id;
        }
      });
      lastSocketEmitAt.current=now;
    };
    const timer=window.setInterval(sendLatest,1000);
    const onVisibility=()=>{if(document.visibilityState==='visible')sendLatest();};
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);};
  },[teamSocket.connection,teamSocket.socketRef]);
  const doStart=async()=>{
    setPermissionError('');setStarting(true);
    try{
      let audioReady=Promise.resolve();
      try{
        if(!siren.current)siren.current=createSirenAudio();
        audioReady=siren.current.unlock().then(()=>{setAudioUnavailable(false);setAudioNeedsGesture(false);}).catch(()=>{setAudioNeedsGesture(true);});
      }catch{setAudioUnavailable(true);setAudioNeedsGesture(true);}
      const locationReady=requestCurrentPosition();
      const orientationReady=requestOrientationAccess();
      const [locationResult,orientationResult]=await Promise.allSettled([locationReady,orientationReady]);
      if(locationResult.status==='rejected'){
        const denied=typeof locationResult.reason==='object'&&locationResult.reason!==null&&'code'in locationResult.reason&&locationResult.reason.code===1;
        setGps(denied?'denied':'lost');
        setPermissionError(denied?'The oracle needs precise location to guide your crew. Allow location for this browser, then tap Begin your route again.':apiErr(locationResult.reason));
        return;
      }
      await audioReady;
      if(orientationResult.status==='fulfilled')setOrientationPermission(orientationResult.value);
      else setOrientationPermission('denied');
      handlePosition(locationResult.value);
      startLocationWatch();
      await requestWakeLock();
      if('vibrate'in navigator)navigator.vibrate(40);
      await start.mutateAsync();
      await qc.invalidateQueries({queryKey:getGetGameStateQueryKey()});
    }catch(error){setPermissionError(apiErr(error));}
    finally{setStarting(false);}
  };
  const st=game.data;
  const waiting=st?.eventStatus!=='ACTIVE'&&st?.team?.status!=='FINISHED';
  const durationMs=st?.team?.startedAt&&st.team.finishedAt?Math.max(0,new Date(st.team.finishedAt).getTime()-new Date(st.team.startedAt).getTime()):null;
  const totalDuration=durationMs===null?'Unavailable':`${Math.floor(durationMs/3600000)}h ${Math.floor((durationMs%3600000)/60000)}m ${Math.floor((durationMs%60000)/1000)}s`;
  if(user.isLoading||game.isLoading) return <main className="relative min-h-[100dvh] p-6"><Header/><div className="mx-auto mt-16 max-w-md"><Loading text="The oracle is listening…"/></div></main>;
  if(user.isError)return <main className="relative min-h-[100dvh] p-6"><Header/><div className="mx-auto mt-12 max-w-md"><ErrorNotice error={user.error} retry={()=>void user.refetch()}/><Link className="mt-5 inline-flex min-h-12 items-center gap-2 text-[#f2d98a]" href="/">Return to your pass <ArrowLeft size={16}/></Link></div></main>;
  if(game.isError)return <main className="relative min-h-[100dvh] p-6"><Header/><div className="mx-auto mt-12 max-w-md"><ErrorNotice error={game.error} retry={()=>void game.refetch()}/></div></main>;
  if(st?.team?.status==='FINISHED'||(st&&st.progress>=st.total&&st.total>0))return <main className="relative min-h-[100dvh] px-5 py-8"><Header/><section className="panel relative mx-auto mt-10 max-w-lg p-8 text-center"><Sparkles className="mx-auto text-[#f2d98a]" size={34}/><h1 className="mt-5 font-cinzel text-3xl text-[#f2d98a]">The Odyssey Is Complete</h1><p className="mt-3 font-cormorant text-xl text-[#ede6d6]">The Fates Have Spoken. Your crew has earned its place among the stars.</p><p className="mt-4 border-y border-[#d4af3725] py-3 text-sm text-[#f2d98a]" data-testid="text-total-voyage-time">Total voyage time · {totalDuration}</p><div className="mt-5 space-y-3 text-left">{st.completions?.map((c,i)=><div key={c.id} className="flex justify-between border-b border-[#d4af3728] py-3 text-sm" data-testid={`completion-${c.id}`}><span>{String(i+1).padStart(2,'0')} · {c.checkpointName}</span><span className="text-[#b9c4d5]">{new Date(c.completedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div>)}</div><Link href="/" className="mt-8 inline-flex min-h-12 items-center gap-2 text-[#f2d98a]" onClick={()=>void logout.mutateAsync()} data-testid="link-sign-out">Leave the voyage <ArrowRight size={16}/></Link></section></main>;
  if(waiting)return <main className="relative min-h-[100dvh] px-5 pb-12 pt-5"><Header/><section className="relative z-10 mx-auto mt-16 max-w-md text-center"><div className="mx-auto grid h-24 w-24 animate-[pulse-gold_4s_ease-in-out_infinite] place-items-center rounded-full border border-[#d4af3766] text-[#f2d98a]"><Waves size={39}/></div><p className="label mt-8 text-[#d4af37]">THE TIDE IS TURNING</p><h1 className="mt-3 font-cinzel text-2xl sm:text-3xl">The Gods Are Still Sleeping</h1><p className="mt-4 font-cormorant text-xl leading-relaxed text-[#bdc7d6]">Your crew is aboard, {st?.team?.name || 'voyager'}. The volunteers will call you when the sea is open.</p><div className="panel mt-8 flex items-center justify-between p-4 text-left"><span><span className="label block">Crew</span><span className="font-cinzel text-sm">{st?.team?.name}</span></span><span className="rounded-full border border-[#d4af3750] px-3 py-1 text-xs uppercase text-[#f2d98a]">{statusLabel(st?.eventStatus)}</span></div><button onClick={()=>void logout.mutateAsync(undefined,{onSuccess:()=>{void qc.invalidateQueries({queryKey:getGetCurrentUserQueryKey()});setLocation('/');}})} className="mt-8 min-h-12 text-sm text-[#b9c4d5] underline underline-offset-4" data-testid="button-signout-waiting">Sign out</button></section><div className="wave"/></main>;
  if(arrival)return <main className="relative min-h-[100dvh] px-5 py-7"><Header/><section className="panel relative mx-auto mt-12 max-w-md p-8 text-center" data-testid="status-arrival"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-[#d4af37] text-[#f2d98a]"><Flag size={30}/></div><p className="label mt-6 text-[#d4af37]">OFFERING ACCEPTED</p><h1 className="mt-3 font-cinzel text-2xl">You Have Reached the Destination</h1><p className="mt-3 font-cormorant text-2xl text-[#f2d98a]">{arrival.name}</p><p className="mt-2 text-xs text-[#91a0b7]">{new Date(arrival.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p><GoldButton className="mt-8" onClick={()=>{setArrival(null);void game.refetch();}} data-testid="button-continue-voyage">Continue the Voyage <ArrowRight size={17}/></GoldButton></section></main>;
  return <main className="relative min-h-[100dvh] overflow-hidden px-5 pb-[max(26px,env(safe-area-inset-bottom))] pt-4">
    <header className="relative z-10 flex items-center justify-between border-b border-[#d4af3725] pb-4"><Brand/><div className="text-right"><div className="label">VOYAGER</div><div className="mt-1 font-cinzel text-sm">{st?.team?.name}</div></div></header>
    <div className="relative z-10 mx-auto max-w-md pt-5">
      {start.isError&&<div className="mb-4"><ErrorNotice error={start.error}/></div>}
      {permissionError&&<div className="mb-4"><ErrorNotice error={permissionError}/></div>}
      <div className={`mb-4 flex items-center gap-2 border px-3 py-2 text-xs ${gps==='ready'?'border-[#71aa8b50] bg-[#71aa8b10] text-[#a7d7bd]':'border-[#c1440e70] bg-[#c1440e12] text-[#f0b39b]'}`} data-testid="status-gps"><span className={`h-2 w-2 rounded-full ${gps==='ready'?'bg-[#73c999]':'bg-[#c1440e]'}`}/>{gps==='ready'?'The heavens are clear':gps==='lost'?'Hades’ Veil descends — GPS signal lost':gps==='denied'?'Location access needed to follow the oracle':'Seeking a clear signal'}{simMode&&<span className="ml-auto border border-[#d4af3770] px-2 py-0.5 text-[9px] tracking-widest text-[#f2d98a]">SIMULATED</span>}</div>
       {(gps==='denied'||gps==='lost')&&<div className="mb-4 border border-[#c1440e55] bg-[#c1440e10] p-3 text-xs leading-relaxed text-[#f0b39b]" role="alert" data-testid="status-gps-help"><p className="font-cinzel text-sm text-[#f2d98a]">{gps==='denied'?'The oracle needs your location':'The signal has gone quiet'}</p><p className="mt-1">Allow precise location while using this page. On iPhone, check Safari website location permissions; on Android, allow location for your browser and enable precise location, then return here.</p></div>}
       {orientationPermission==='denied'&&<div className="mb-4 border border-[#d4af3755] bg-[#d4af3710] p-3 text-xs leading-relaxed text-[#f2d98a]" role="status" data-testid="status-compass-permission">Compass motion access was declined. The Oracle will keep giving direction hints; enable Motion &amp; Orientation Access in your browser settings for a moving compass.</div>}
       {orientationPermission==='unavailable'&&<div className="mb-4 border border-[#d4af3755] bg-[#d4af3710] p-3 text-xs leading-relaxed text-[#f2d98a]" role="status" data-testid="status-compass-unavailable">This device has no compass sensor. Follow the direction hint and the Siren’s Song instead.</div>}
      <div className={`mb-4 flex items-center gap-2 text-[10px] ${teamSocket.connection==='connected'?'text-[#a7d7bd]':'text-[#d4af37]'}`} data-testid="status-team-socket" aria-live="polite"><span className={`h-1.5 w-1.5 rounded-full ${teamSocket.connection==='connected'?'bg-[#73c999]':'bg-[#d4af37]'}`}/>{teamSocket.connection==='connected'?'Crew link secure':teamSocket.connection==='connecting'?'Rejoining the crew link…':'Offline · location will resume when connected'}</div>
       {socketError&&<div className="mb-4 border border-[#c1440e70] bg-[#c1440e12] p-3 text-xs text-[#f0b39b]" role="alert" data-testid="status-socket-warning">{socketError}</div>}
       {audioUnavailable&&<div className="mb-4 border border-[#d4af3755] bg-[#d4af3710] p-3 text-xs leading-relaxed text-[#f2d98a]" role="status" data-testid="status-audio-unavailable">Sound is unavailable in this browser. Your route and direction hints still work.</div>}
       {!st?.currentCheckpoint&&!start.isPending?<section className="panel mt-8 p-7 text-center"><Compass className="mx-auto text-[#d4af37]" size={38}/><h1 className="mt-4 font-cinzel text-xl">Your route awaits</h1><p className="mt-2 font-cormorant text-lg text-[#b9c4d5]">The oracle will reveal one destination at a time.</p><GoldButton className="mt-6" onClick={()=>void doStart()} disabled={starting||start.isPending} data-testid="button-start-route">{starting?'Preparing your instruments…':'Begin your route'}<ArrowRight size={16}/></GoldButton></section>:<>
      <div className="flex items-center justify-between"><p className="label text-[#d4af37]">THE 39-SECOND ORACLE</p><span className="text-xs text-[#b9c4d5]" data-testid="text-progress">{st?.progress??0} / {st?.total??0} waypoints</span></div>
      <div className="mt-3 flex flex-col items-center">
        <div className="relative grid h-[min(76vw,300px)] w-[min(76vw,300px)] place-items-center" role="img" aria-label={`Compass pointing ${bearingText}, refresh in ${remaining} seconds`} data-testid="status-compass">
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="101" fill="none" stroke="#263d62" strokeWidth="2"/><circle cx="110" cy="110" r="101" fill="none" stroke="#d4af37" strokeWidth="3" strokeDasharray={`${(remaining/39)*634} 634`} strokeLinecap="round"/></svg>
          <div className="compass-ring absolute inset-[5%] rounded-full border border-[#d4af3733]"/>
          <span className="absolute top-[9%] font-cinzel text-[10px] text-[#d4af37]">N</span><span className="absolute right-[9%] font-cinzel text-[10px] text-[#d4af37]">E</span><span className="absolute bottom-[9%] font-cinzel text-[10px] text-[#d4af37]">S</span><span className="absolute left-[9%] font-cinzel text-[10px] text-[#d4af37]">W</span>
          <div className="compass-needle absolute h-[55%] w-[55%]" style={{transform:`rotate(${compassAngle}deg)`}}><div className="absolute left-1/2 top-[3%] h-[47%] w-[2px] -translate-x-1/2 bg-gradient-to-b from-[#fff0ae] to-[#d4af37]"/><div className="absolute left-1/2 top-[50%] h-[38%] w-[2px] -translate-x-1/2 bg-[#557093]"/><div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f2d98a] bg-[#102344]"/></div>
          <div className="absolute bottom-[26%] text-center"><span className="font-cinzel text-[10px] tracking-widest text-[#c2ccdb]">{remaining.toString().padStart(2,'0')} SEC</span></div>
        </div>
        <p className="mt-2 font-cormorant text-xl italic text-[#f2d98a]" data-testid="text-oracle-direction">{pos.current?`The Oracle whispers: ${bearingText}`:'The Oracle awaits a clear sky'}</p>
        <p className="mt-1 text-xs text-[#b9c4d5]">{distanceBand} · bearing renews every 39 seconds</p>
      </div>
      <section className="panel mt-5 p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Siren size={17} className="text-[#f2d98a]"/><div><p className="label">THE SIREN’S SONG</p><p className="mt-1 font-cormorant text-lg text-[#ede6d6]">{songOn?'A song draws nearer':'Listen for the song'}</p></div></div><div className="flex gap-1" role="img" aria-label={`Siren intensity ${audioLevel} of 5`}>{[0,1,2,3,4].map(i=><span key={i} className={`h-5 w-1 rounded-full ${i<audioLevel?'bg-[#d4af37]':'bg-[#435573]'}`} style={{transform:`scaleY(${i<audioLevel?0.45+((i*17+remaining)%5)/10:0.25})`,transition:'transform .25s'}}/>)}</div></div>
        <div className="mt-3 flex items-center gap-3"><button onClick={()=>{if(muted){void playTone();}else{setMuted(true);setSongOn(false);}}} className="grid h-11 w-11 shrink-0 place-items-center border border-[#31486d] text-[#f2d98a]" aria-label={muted?'Enable sound':'Mute sound'} data-testid="button-toggle-audio">{muted?<VolumeX size={17}/>:<Volume2 size={17}/>}</button><label className="flex flex-1 items-center gap-2"><span className="sr-only">Siren volume</span><input type="range" min="0" max="100" value={volume} onChange={e=>setVolume(Number(e.target.value))} className="w-full accent-[#d4af37]" aria-label="Siren volume" data-testid="input-siren-volume"/></label>{(!songOn||audioNeedsGesture)&&!audioUnavailable&&<button onClick={()=>void playTone()} className="min-h-11 px-3 text-xs text-[#f2d98a] underline" data-testid="button-hear-sirens"><Headphones size={14} className="mr-1 inline"/>{audioNeedsGesture?'Tap to resume':'Tap to hear'}</button>}</div></section>
      <div className="mt-5 border-t border-[#d4af3725] pt-4"><div className="flex items-start gap-3"><MapPin size={17} className="mt-0.5 text-[#d4af37]"/><div><p className="label">CURRENT DESTINATION</p><p className="mt-1 font-cinzel text-base">{st?.currentCheckpoint?.name||'Setting the course…'}</p>{st?.currentCheckpoint?.hint&&<p className="mt-1 font-cormorant text-lg italic text-[#aebdd0]">{st.currentCheckpoint.hint}</p>}</div></div></div>
      </>}
      {debugEnabled&&<section className="mt-5 border border-dashed border-[#d4af3770] bg-[#d4af3709] p-4" data-testid="panel-gps-simulator"><div className="flex items-center justify-between"><div><p className="label text-[#d4af37]">DEBUG · GPS SIMULATOR</p><p className="mt-1 text-xs text-[#b9c4d5]">Local signal only · current target only</p></div><button onClick={toggleSimulator} className={`min-h-11 border px-3 text-xs ${simMode?'border-[#73c99970] text-[#a7d7bd]':'border-[#d4af3750] text-[#f2d98a]'}`} data-testid="button-toggle-gps-simulator">{simMode?'Disable simulator':'Enable simulator'}</button></div><button disabled={!simMode} onClick={walkTowardTarget} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 border border-[#31486d] text-sm text-[#ede6d6] disabled:opacity-40" data-testid="button-walk-toward-target"><Crosshair size={15}/> Walk 12 metres toward target</button></section>}
      <div className="mt-5 flex justify-between text-[11px] text-[#8191a8]"><span>NO MAP. NO SHORTCUTS.</span><span>WALK TOGETHER</span></div>
    </div><div className="wave"/>
  </main>;
}

const adminNav=[{href:'/admin',label:'God’s Eye',icon:Eye},{href:'/admin/checkpoints',label:'Checkpoints',icon:MapPin},{href:'/admin/teams',label:'Teams',icon:Users},{href:'/admin/settings',label:'Settings',icon:Settings}];
const volunteerAccountsNav={href:'/admin/volunteers',label:'Volunteers',icon:Shield};
function AdminShell({children,title}:{children:ReactNode;title:string}) {
  const [,setLocation]=useLocation();const qc=useQueryClient();const user=useGetCurrentUser({query:{queryKey:getGetCurrentUserQueryKey(),retry:false}});const logout=useLogout();const [mobile,setMobile]=useState(false);const [captureNotice,setCaptureNotice]=useState('');
  const navigation=user.data?.user?.role==='ADMIN'?[...adminNav,volunteerAccountsNav]:adminNav;
  const canOpenAdmin=user.data?.user?.role==='ADMIN'||user.data?.user?.role==='VOLUNTEER';
  const adminSocket=useOdysseySocket(canOpenAdmin,{
    'admin:snapshot':(payload)=>{
      const value=payload as {teams?:unknown;overview?:unknown;teamCount?:unknown};
      const snapshotTeams=Array.isArray(payload)?payload:Array.isArray(value?.teams)?value.teams:null;
      if(snapshotTeams)qc.setQueryData(getGetTeamsQueryKey(),snapshotTeams as AdminTeam[]);
      const snapshotOverview=value?.overview&&typeof value.overview==='object'?value.overview:(typeof value?.teamCount==='number'?payload:null);
      if(snapshotOverview)qc.setQueryData(getGetAdminOverviewQueryKey(),snapshotOverview as AdminOverview);
      if(!snapshotTeams)void qc.invalidateQueries({queryKey:getGetTeamsQueryKey()});
      if(!snapshotOverview)void qc.invalidateQueries({queryKey:getGetAdminOverviewQueryKey()});
    },
    'admin:team:update':()=>{void qc.invalidateQueries({queryKey:getGetTeamsQueryKey()});void qc.invalidateQueries({queryKey:getGetAdminOverviewQueryKey()});},
    'admin:completion:new':(payload)=>{const item=payload&&typeof payload==='object'?payload as {teamName?:string;checkpointName?:string;team?:{name?:string};checkpoint?:{name?:string}}:{};const teamName=item.teamName||item.team?.name;const stopName=item.checkpointName||item.checkpoint?.name;setCaptureNotice(teamName&&stopName?`${teamName} reached ${stopName}`:'A crew has reached a checkpoint');window.setTimeout(()=>setCaptureNotice(''),5500);void qc.invalidateQueries({queryKey:getGetTeamsQueryKey()});void qc.invalidateQueries({queryKey:getGetAdminOverviewQueryKey()});},
  },()=>{void qc.invalidateQueries({queryKey:getGetTeamsQueryKey()});void qc.invalidateQueries({queryKey:getGetAdminOverviewQueryKey()});});
  useEffect(()=>{if(user.isError)setLocation('/admin/login');else if(user.data?.user?.role==='TEAM')setLocation('/');},[user.isError,user.data,setLocation]);
  const signout=()=>logout.mutate(undefined,{onSuccess:()=>{void qc.invalidateQueries({queryKey:getGetCurrentUserQueryKey()});setLocation('/admin/login');}});
  return <div className="admin-shell relative min-h-[100dvh] md:flex">
     <aside className="hidden w-[248px] shrink-0 border-r border-[#d4af3725] bg-[#071229] p-5 md:flex md:flex-col"><div className="mb-8"><Brand darkSurface/><div className="mt-5" data-testid="logo-upload-slot"><LogoUploadSlot surface="tag" slot="admin-sidebar"/></div></div><p className="label mb-3 pl-3">VOLUNTEER CONSOLE</p><nav className="space-y-1">{navigation.map(n=><Link href={n.href} key={n.href} className={`nav-item ${title===n.label?'active':''}`} data-testid={`link-admin-${n.label.toLowerCase().replaceAll(' ','-')}`}><n.icon size={17}/>{n.label}</Link>)}</nav><div className="mt-auto border-t border-[#d4af3725] pt-4"><div className="mb-4 flex items-center gap-3"><div className="grid h-9 w-9 place-items-center border border-[#d4af3750] font-cinzel text-[#f2d98a]">{user.data?.user?.name?.slice(0,1)||'I'}</div><div><div className="text-sm">{user.data?.user?.name||'IET Volunteer'}</div><div className="label">{user.data?.user?.role==='ADMIN'?'ADMINISTRATOR':'VOLUNTEER'}</div></div></div><button onClick={signout} className="min-h-11 w-full text-left text-sm text-[#b9c4d5]" data-testid="button-admin-signout">Sign out</button></div></aside>
    <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-[#d4af3725] bg-[#050b1fee] px-4 backdrop-blur md:px-8"><div className="flex items-center gap-3"><button className="grid h-11 w-11 place-items-center text-[#f2d98a] md:hidden" onClick={()=>setMobile(!mobile)} aria-label="Open navigation" data-testid="button-mobile-menu">{mobile?<X/>:<Menu/>}</button><div className="md:hidden"><Brand compact/></div><span className="hidden font-cinzel text-sm tracking-widest md:block">{BRAND.event} <span className="text-[#8191a8]">/</span> {title.toUpperCase()}</span></div><div className="flex items-center gap-3"><span className={`hidden items-center gap-2 text-xs sm:flex ${adminSocket.connection==='connected'?'text-[#a7d7bd]':'text-[#d4af37]'}`} data-testid="status-admin-socket"><span className={`h-2 w-2 rounded-full ${adminSocket.connection==='connected'?'bg-[#73c999]':'bg-[#d4af37]'}`}/>{adminSocket.connection==='connected'?'LIVE CONSOLE':'RECONNECTING'}</span><LogoUploadSlot small slot="admin-header"/><button onClick={signout} className="hidden min-h-10 text-xs text-[#b9c4d5] md:block" data-testid="button-signout-top">Sign out</button></div></header>
      {captureNotice&&<div className="fixed right-4 top-[76px] z-40 max-w-[calc(100vw-2rem)] border border-[#73c99970] bg-[#0a1f35] px-4 py-3 text-sm text-[#c3ead1] shadow-xl" role="status" aria-live="polite" data-testid="toast-checkpoint-captured"><span className="mr-2 text-[#f2d98a]">OFFERING ACCEPTED</span>{captureNotice}</div>}
       {mobile&&<nav className="relative z-20 grid grid-cols-2 gap-2 border-b border-[#d4af3725] bg-[#08152c] p-3 md:hidden">{navigation.map(n=><Link key={n.href} href={n.href} className={`nav-item ${title===n.label?'active':''}`} onClick={()=>setMobile(false)} data-testid={`link-mobile-${n.label.toLowerCase().replaceAll(' ','-')}`}><n.icon size={16}/>{n.label}</Link>)}<button onClick={signout} className="nav-item" data-testid="button-mobile-signout">Sign out</button></nav>}
      <main className="mx-auto max-w-[1500px] p-4 pb-12 sm:p-6 md:p-8">{children}</main>
    </div>
  </div>;
}
function AdminLogin() {
  const [,setLocation]=useLocation();const qc=useQueryClient();const current=useGetCurrentUser({query:{queryKey:getGetCurrentUserQueryKey(),retry:false}});const login=useAdminLogin();
  const [username,setUsername]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');
  useEffect(()=>{const role=current.data?.user?.role;if(role==='ADMIN'||role==='VOLUNTEER')setLocation('/admin');},[current.data,setLocation]);
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setError('');try{await login.mutateAsync({data:{username:username.trim(),password}});await qc.invalidateQueries({queryKey:getGetCurrentUserQueryKey()});setLocation('/admin');}catch(e){setError(apiErr(e));}};
  return <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden px-5 py-8"><div className="absolute left-0 right-0 top-0"><Header label="VOLUNTEER ACCESS"/></div><div className="panel relative z-10 w-full max-w-md p-6 sm:p-9"><div className="mb-7 flex items-center justify-between"><div><p className="label text-[#d4af37]">IET NITK VOLUNTEERS</p><h1 className="mt-2 font-cinzel text-2xl">God’s Eye access</h1></div><Shield className="text-[#f2d98a]" size={25}/></div><p className="mb-6 font-cormorant text-xl text-[#b9c4d5]">Steady hands guide the voyage. Sign in to open the live console.</p>{error&&<div className="mb-4"><ErrorNotice error={error}/></div>}<form onSubmit={submit} className="space-y-4"><label className="block"><span className="label mb-2 block">Volunteer username</span><input className="field" required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} data-testid="input-admin-username"/></label><label className="block"><span className="label mb-2 block">Password</span><input className="field" required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} data-testid="input-admin-password"/></label><GoldButton type="submit" disabled={login.isPending} data-testid="button-admin-login">{login.isPending?'Opening console…':'Enter the console'}<ArrowRight size={16}/></GoldButton></form><Link href="/" className="mt-6 inline-flex min-h-12 items-center gap-2 text-sm text-[#b9c4d5]" data-testid="link-team-pass"><ArrowLeft size={15}/> Team pass</Link></div><p className="absolute bottom-5 font-cormorant text-lg italic text-[#8191a8]">Presented by IET NITK</p></main>;
}
function AdminMap({teams}:{teams:AdminTeam[]}) {
  const positioned=teams.flatMap(t=>[
    ...(t.lastLat!==null&&t.lastLng!==null?[{lat:t.lastLat,lng:t.lastLng,label:t.name,kind:'team' as const}]:[]),
    ...(t.assignedRoute||[]).filter(p=>p.isActive).map(p=>({lat:p.lat,lng:p.lng,label:p.checkpointName,kind:'checkpoint' as const})),
  ]);
  const coords=positioned.length?positioned:[{lat:13.0108,lng:74.7943,label:'NITK campus',kind:'checkpoint' as const}];
  const lats=coords.map(p=>p.lat),lngs=coords.map(p=>p.lng);
  const padLat=Math.max((Math.max(...lats)-Math.min(...lats))*.2,.0016),padLng=Math.max((Math.max(...lngs)-Math.min(...lngs))*.2,.0018);
  const minLat=Math.min(...lats)-padLat,maxLat=Math.max(...lats)+padLat,minLng=Math.min(...lngs)-padLng,maxLng=Math.max(...lngs)+padLng;
  const bbox=[minLng,minLat,maxLng,maxLat].map(n=>n.toFixed(6)).join('%2C');
  const src=`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
  return <section className="panel mt-6 overflow-hidden" data-testid="admin-live-map">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d4af3725] p-4"><div><p className="label text-[#d4af37]">GOD’S EYE · ADMIN ONLY</p><h2 className="mt-1 font-cinzel text-lg">Campus field view</h2></div><div className="flex items-center gap-3 text-xs text-[#b9c4d5]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#d4af37]"/>Teams</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full border border-[#a7d7bd]"/>Assigned stops</span></div></div>
    <div className="relative h-[360px] overflow-hidden bg-[#0b2035] sm:h-[480px]"><iframe title="OpenStreetMap campus view for IET NITK volunteers" src={src} className="absolute inset-0 h-full w-full border-0 opacity-80 grayscale-[.35]" loading="lazy" referrerPolicy="no-referrer" data-testid="iframe-openstreetmap"/>
      <div className="pointer-events-none absolute inset-0" aria-label="Team and checkpoint positions">{positioned.map((p,i)=>{const x=Math.max(2,Math.min(98,(p.lng-minLng)/(maxLng-minLng)*100));const y=Math.max(4,Math.min(96,(maxLat-p.lat)/(maxLat-minLat)*100));return <div key={`${p.kind}-${i}`} className="absolute" style={{left:`${x}%`,top:`${y}%`,transform:'translate(-50%,-50%)'}} title={p.label} data-testid={`${p.kind}-map-marker-${i}`}><span className={`block h-3.5 w-3.5 rounded-full border-2 shadow-md ${p.kind==='team'?'border-[#07152f] bg-[#d4af37]':'border-[#a7d7bd] bg-[#0c203c]'}`}/><span className="mt-1 block whitespace-nowrap rounded-sm bg-[#07152fe8] px-1.5 py-0.5 text-[9px] text-[#ede6d6]">{p.label}</span></div>;})}</div>
    </div><div className="border-t border-[#d4af3725] px-4 py-2 text-[10px] text-[#91a0b7]">Map is visible to volunteers only. Team devices never receive route destinations beyond their current checkpoint.</div>
  </section>;
}
function VolunteerAccountsPage() {
  const [,setLocation]=useLocation();
  const user=useGetCurrentUser({query:{queryKey:getGetCurrentUserQueryKey(),retry:false}});
  useEffect(()=>{if(user.data?.user?.role==='VOLUNTEER')setLocation('/admin');},[user.data,setLocation]);
  return <AdminShell title="Volunteers">
    <PageTitle eyebrow="ACCESS CONTROL" title="Volunteer Accounts" detail="Create separate console logins. Volunteers can edit event operations, but only administrators can manage accounts."/>
    {user.data?.user?.role==='ADMIN'?<><p className="mb-6 max-w-3xl text-sm leading-relaxed text-[#b9c4d5]">When the event starts, every registered team gets a random checkpoint order. Starting checkpoints are spread as evenly as possible across active checkpoints.</p><VolunteerAccountsPanel/></>:<Loading text="Checking account permissions…"/>}
  </AdminShell>;
}

function AdminOverviewPage() {
  const overview=useGetAdminOverview({query:{queryKey:getGetAdminOverviewQueryKey(),refetchInterval:6000}});
  const teams=useGetTeams({query:{queryKey:getGetTeamsQueryKey(),refetchInterval:6000}});
  const [search,setSearch]=useState('');const [filter,setFilter]=useState('ALL');const [expanded,setExpanded]=useState<string|null>(null);const [showMap,setShowMap]=useState(false);
  const data=overview.data;const list=useMemo(()=>{const arr=teams.data||[];return arr.filter(t=>(filter==='ALL'||t.status===filter)&&(t.name.toLowerCase().includes(search.toLowerCase())||String(t.currentCheckpoint||'').toLowerCase().includes(search.toLowerCase())));},[teams.data,filter,search]);
  return <AdminShell title="God’s Eye"><PageTitle eyebrow="LIVE EVENT TELEMETRY" title="God’s Eye View" detail="Every crew, every signal, every step across the campus."/>
    {(overview.isLoading||teams.isLoading)&&<Loading text="Gathering signals from the fleet…"/>}
    {(overview.isError||teams.isError)&&<ErrorNotice error={overview.error||teams.error} retry={()=>{void overview.refetch();void teams.refetch();}}/>}
    {data&&<><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs text-[#a7d7bd]" data-testid="status-live"><span className="h-2 w-2 animate-pulse rounded-full bg-[#73c999]"/>UPDATING EVERY 6 SECONDS <span className="ml-2 rounded-full border border-[#d4af3740] px-2 py-1 uppercase text-[#f2d98a]">{statusLabel(data.eventStatus)}</span></div><div className="flex gap-2"><button onClick={()=>setShowMap(!showMap)} className="flex min-h-11 items-center gap-2 border border-[#d4af3740] px-4 text-sm text-[#f2d98a]" aria-expanded={showMap} data-testid="button-toggle-admin-map"><Map size={15}/>{showMap?'Hide map':'Field map'}</button><Link href="/admin/settings" className="flex min-h-11 items-center gap-2 border border-[#d4af3740] px-4 text-sm text-[#f2d98a]" data-testid="link-event-controls"><Settings size={15}/> Event controls</Link></div></div>{showMap&&<AdminMap teams={teams.data||[]}/>}
     <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">{[{label:'Teams in the fleet',value:data.teamCount,icon:Users},{label:'In voyage',value:data.activeCount,icon:Navigation},{label:'Stalled crews',value:data.stalledCount,icon:Gauge},{label:'Voyages complete',value:data.finishedCount,icon:Check},{label:'Waypoints found',value:data.completionCount,icon:Flag}].map(stat=><div className="panel p-4 sm:p-5" key={stat.label} data-testid={`stat-${stat.label.toLowerCase().replaceAll(' ','-')}`}><div className="flex items-center justify-between"><span className="label">{stat.label}</span><stat.icon size={17} className="text-[#d4af37]"/></div><div className="mt-3 font-cinzel text-3xl text-[#f2d98a]">{stat.value}</div>{stat.label==='Stalled crews'&&<p className="mt-1 text-[10px] text-[#8191a8]">No location update for 90+ seconds</p>}</div>)}</div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[1.55fr_.75fr]"><section className="panel min-w-0 p-4 sm:p-5"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-cinzel text-lg">Crews on the move</h2><p className="mt-1 text-xs text-[#91a0b7]">Latest volunteer telemetry</p></div><div className="flex w-full gap-2 sm:w-auto"><label className="relative min-w-0 flex-1 sm:w-48"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8191a8]"/><input className="field h-10 min-h-10 pl-9 text-sm" placeholder="Find a team…" value={search} onChange={e=>setSearch(e.target.value)} data-testid="input-team-search"/></label><select className="field h-10 min-h-10 w-32 px-2 text-xs" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter teams" data-testid="select-team-filter"><option value="ALL">All teams</option><option value="ACTIVE">Active</option><option value="NOT_STARTED">Waiting</option><option value="FINISHED">Finished</option></select></div></div>
    {teams.isLoading?<Loading/>:list.length===0?<div className="border border-dashed border-[#d4af3733] p-8 text-center"><Users className="mx-auto text-[#8191a8]" size={24}/><p className="mt-3 font-cormorant text-xl text-[#b9c4d5]">No crews match this signal.</p><Link href="/admin/teams" className="mt-2 inline-block text-sm text-[#f2d98a] underline">Manage teams</Link></div>:<div className="space-y-2">{list.map(t=><TeamRow team={t} key={t.id} expanded={expanded===t.id} onExpand={()=>setExpanded(expanded===t.id?null:t.id)}/>)}</div>}</section>
    <section className="panel p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="font-cinzel text-lg">Live leaderboard</h2><p className="mt-1 text-xs text-[#91a0b7]">Waypoint progress</p></div><Activity size={18} className="text-[#d4af37]"/></div>{!data.leaderboard?.length?<p className="py-8 text-center font-cormorant text-lg text-[#91a0b7]">The tide has not turned yet.</p>:<ol className="mt-4 space-y-2">{data.leaderboard.slice(0,8).map((t,i)=><li key={t.id} className="flex items-center gap-3 border-b border-[#d4af3718] py-3" data-testid={`leaderboard-${t.id}`}><span className="font-cinzel text-sm text-[#d4af37]">{String(i+1).padStart(2,'0')}</span><div className="min-w-0 flex-1"><p className="truncate text-sm">{t.name}</p><p className="mt-1 text-[10px] text-[#91a0b7]">{t.completionCount} waypoint{t.completionCount===1?'':'s'}</p></div><span className="font-cinzel text-sm text-[#f2d98a]">{t.totalCheckpoints?t.currentIndex+'/'+t.totalCheckpoints:'—'}</span></li>)}</ol>}</section></div>
    <section className="panel mt-6 p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><Sparkles size={17} className="text-[#d4af37]"/><h2 className="font-cinzel text-lg">Newly claimed</h2><span className="ml-auto label">RECENT ARRIVALS</span></div>{!data.recentCompletions?.length?<p className="py-4 font-cormorant text-lg text-[#91a0b7]">The first offering is yet to arrive.</p>:<div className="divide-y divide-[#d4af371c]">{data.recentCompletions.slice(0,6).map((c,i)=><div key={`${c.teamName}-${c.completedAt}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" data-testid={`completion-event-${i}`}><div><span className="text-[#f2d98a]">{c.teamName}</span><ChevronRight className="mx-2 inline text-[#8191a8]" size={14}/>{c.checkpointName}</div><span className="text-xs text-[#91a0b7]">{timeAgo(c.completedAt)}</span></div>)}</div>}</section></>}
  </AdminShell>;
}
function TeamRow({team:t,expanded,onExpand}:{team:Team;expanded:boolean;onExpand:()=>void}) {
  const freshness=t.lastSeenAt?Math.floor((Date.now()-new Date(t.lastSeenAt).getTime())/1000):Infinity;
  const route=[...(t.assignedRoute||[])].sort((a,b)=>a.orderIndex-b.orderIndex);
   const completions:Completion[]=t.completions||[];
  return <article className="border border-[#d4af3720] bg-[#08162d]"><button className="flex min-h-[76px] w-full items-center gap-3 p-3 text-left sm:gap-4 sm:p-4" onClick={onExpand} data-testid={`button-expand-team-${t.id}`}><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.status==='ACTIVE'?(freshness>90?'bg-[#c1440e]':freshness>30?'bg-[#d4af37]':'bg-[#73c999]'):t.status==='FINISHED'?'bg-[#77a6d8]':'bg-[#617089]'}`}/><span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.name}</span><span className="mt-1 block truncate text-xs text-[#91a0b7]">{t.currentCheckpoint||'No destination assigned'}</span></span><span className="hidden min-w-[95px] text-xs text-[#b9c4d5] sm:block">{t.lastSeenAt?timeAgo(t.lastSeenAt):'Not started'}</span><span className="w-14 text-right font-cinzel text-sm text-[#f2d98a]">{t.totalCheckpoints?`${t.currentIndex}/${t.totalCheckpoints}`:'—'}</span><ChevronRight size={15} className={`text-[#8191a8] transition-transform ${expanded?'rotate-90':''}`}/></button>{expanded&&<div className="grid gap-4 border-t border-[#d4af3720] p-4 text-xs sm:grid-cols-2"><div><span className="label block">Position · Admin only</span><p className="mt-1 text-[#ede6d6]">{t.lastLat?.toFixed(6)??'—'}, {t.lastLng?.toFixed(6)??'—'}</p></div><div><span className="label block">Accuracy / last seen</span><p className="mt-1 text-[#ede6d6]">{t.lastAccuracy?`${Math.round(t.lastAccuracy)} m`: '—'} · {timeAgo(t.lastSeenAt)}</p></div><div><span className="label block">Crew status</span><p className="mt-1 uppercase text-[#f2d98a]">{statusLabel(t.status)}</p></div>{t.suspicious&&<p className="flex items-center gap-2 text-[#f0b39b]" data-testid={`status-suspicious-${t.id}`}><Flag size={14}/>Signal flagged for review</p>}<div className="sm:col-span-2"><div className="h-1.5 overflow-hidden bg-[#182b49]"><div className="h-full bg-[#d4af37]" style={{width:`${t.totalCheckpoints?Math.min(100,t.currentIndex/t.totalCheckpoints*100):0}%`}}/></div></div>
    <section className="border-t border-[#d4af3720] pt-3 sm:col-span-2" data-testid={`route-detail-${t.id}`}><div className="mb-2 flex items-center justify-between"><span className="label">Assigned route · volunteer view</span><span className="text-[10px] text-[#8191a8]">{route.length} stops</span></div>{!route.length?<p className="text-[#8191a8]">No route assigned yet.</p>:<ol className="grid gap-2 sm:grid-cols-2">{route.map((stop,i)=>{const captured=completions.find(c=>c.checkpointName===stop.checkpointName);return <li key={`${stop.checkpointId}-${stop.orderIndex}`} className="flex items-start gap-2 border border-[#d4af3718] bg-[#07152f] p-2.5" data-testid={`route-stop-${t.id}-${stop.orderIndex}`}><span className={`grid h-5 w-5 shrink-0 place-items-center border text-[9px] ${captured?'border-[#73c99980] text-[#a7d7bd]':'border-[#d4af3750] text-[#f2d98a]'}`}>{String(i+1).padStart(2,'0')}</span><span className="min-w-0 flex-1"><span className="block truncate text-[#ede6d6]">{stop.checkpointName}</span><span className="mt-1 block text-[10px] text-[#8191a8]">{stop.lat.toFixed(6)}, {stop.lng.toFixed(6)} · radius {stop.radiusM}m · {stop.isActive?'active':'inactive'}</span>{captured&&<span className="mt-1 block text-[10px] text-[#a7d7bd]">Reached {new Date(captured.completedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · {Math.round(captured.distanceAtCaptureM)}m away · ±{Math.round(captured.accuracyM)}m</span>}</span></li>;})}</ol>}</section>
    <section className="border-t border-[#d4af3720] pt-3 sm:col-span-2" data-testid={`completion-log-${t.id}`}><div className="mb-2 flex items-center justify-between"><span className="label">Completion log</span><span className="text-[10px] text-[#8191a8]">{completions.length} captured</span></div>{!completions.length?<p className="text-[#8191a8]">No checkpoints captured so far.</p>:<ul className="space-y-1.5">{completions.map((c,i)=><li key={`${c.checkpointName}-${c.completedAt}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d4af3712] py-2"><span className="text-[#ede6d6]">{String(i+1).padStart(2,'0')} · {c.checkpointName}</span><span className="text-right text-[#91a0b7]">{new Date(c.completedAt).toLocaleString([], {hour:'2-digit',minute:'2-digit'})} · {Math.round(c.distanceAtCaptureM)}m · ±{Math.round(c.accuracyM)}m</span></li>)}</ul>}</section>
  </div>}</article>;
}
function CheckpointsPage() {
  const qc=useQueryClient();const q=useGetCheckpoints({query:{queryKey:getGetCheckpointsQueryKey(),refetchInterval:15000}});const teams=useGetTeams({query:{queryKey:getGetTeamsQueryKey(),enabled:true}});
  const create=useCreateCheckpoint();const update=useUpdateCheckpoint();const deactivate=useDeactivateCheckpoint();
  const [editing,setEditing]=useState<Checkpoint|null>(null);const [form,setForm]=useState({name:'',lat:'',lng:'',radiusM:'30',hint:''});const [paste,setPaste]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const reset=()=>{setEditing(null);setForm({name:'',lat:'',lng:'',radiusM:'30',hint:''});setError('');};
  const edit=(c:Checkpoint)=>{setEditing(c);setForm({name:c.name,lat:String(c.lat),lng:String(c.lng),radiusM:String(c.radiusM),hint:c.hint||''});setError('');};
  const useMyLocation=()=>navigator.geolocation?.getCurrentPosition(p=>setForm(f=>({...f,lat:p.coords.latitude.toFixed(6),lng:p.coords.longitude.toFixed(6)})),e=>setError(e.message),{enableHighAccuracy:true,timeout:15000});
  const parsePaste=()=>{const matches=paste.match(/-?\d+(?:\.\d+)?/g);if(matches&&matches.length>=2)setForm(f=>({...f,lat:matches[0],lng:matches[1]}));else setError('Paste coordinates as latitude, longitude.');};
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setError('');const lat=Number(form.lat),lng=Number(form.lng),radiusM=Number(form.radiusM);if(!Number.isFinite(lat)||lat < -90||lat>90||!Number.isFinite(lng)||lng < -180||lng>180||radiusM<5||radiusM>200){setError('Check coordinates and radius. Latitude must be −90 to 90, longitude −180 to 180, radius 5–200 m.');return;}setBusy(true);try{const data={name:form.name.trim(),lat,lng,radiusM,hint:form.hint.trim()||null};if(editing)await update.mutateAsync({id:editing.id,data});else await create.mutateAsync({data});await qc.invalidateQueries({queryKey:getGetCheckpointsQueryKey()});reset();}catch(e){setError(apiErr(e));}finally{setBusy(false);}};
  const toggle=(c:Checkpoint)=>{if(c.isActive){if(window.confirm(`Deactivate ${c.name}? Teams may move off this checkpoint.`))deactivate.mutate({id:c.id},{onSuccess:()=>void qc.invalidateQueries({queryKey:getGetCheckpointsQueryKey()})});}else{edit(c);setForm(f=>({...f,name:c.name,lat:String(c.lat),lng:String(c.lng),radiusM:String(c.radiusM),hint:c.hint||''}));}};
  return <AdminShell title="Checkpoints"><PageTitle eyebrow="ROUTE CARTOGRAPHY" title="Checkpoint manager" detail="Set the places the oracle may reveal. Team devices only receive their current destination."/>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#b9c4d5]"><span className="font-cinzel text-xl text-[#f2d98a]">{q.data?.filter(c=>c.isActive).length??'—'}</span> active <span className="mx-2 text-[#526784]">/</span>{teams.data?.length??'—'} crews</p><p className="border border-[#d4af3750] px-3 py-2 text-xs text-[#f2d98a]">{(q.data?.filter(c=>c.isActive).length??0)<(teams.data?.length??0)?'Fewer checkpoints than teams':'Route count looks ready'}</p></div>
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <section className="panel p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-cinzel text-lg">Known waypoints</h2><button onClick={reset} className="flex min-h-11 items-center gap-2 border border-[#d4af3750] px-3 text-sm text-[#f2d98a]" data-testid="button-new-checkpoint"><Plus size={15}/> New checkpoint</button></div>{q.isLoading?<Loading/>:q.isError?<ErrorNotice error={q.error} retry={()=>void q.refetch()}/>:!q.data?.length?<div className="border border-dashed border-[#d4af3733] p-8 text-center"><MapPin className="mx-auto text-[#8191a8]"/><p className="mt-3 font-cormorant text-xl">No waypoints have been marked.</p><button onClick={reset} className="mt-3 text-sm text-[#f2d98a] underline">Add the first checkpoint</button></div>:<div className="space-y-2">{q.data.map(c=><article key={c.id} className="flex flex-wrap items-center gap-3 border border-[#d4af3720] bg-[#08162d] p-3 sm:p-4" data-testid={`row-checkpoint-${c.id}`}><div className={`grid h-9 w-9 shrink-0 place-items-center border ${c.isActive?'border-[#d4af3750] text-[#f2d98a]':'border-[#526784] text-[#8191a8]'}`}><MapPin size={16}/></div><div className="min-w-0 flex-1"><p className="truncate font-medium">{c.name}</p><p className="mt-1 text-xs text-[#91a0b7]">{c.lat.toFixed(5)}, {c.lng.toFixed(5)} · {c.radiusM}m</p></div><span className={`text-[10px] uppercase ${c.isActive?'text-[#a7d7bd]':'text-[#91a0b7]'}`}>{c.isActive?'Active':'Inactive'}</span><button onClick={()=>edit(c)} className="min-h-10 px-3 text-xs text-[#f2d98a] underline" data-testid={`button-edit-checkpoint-${c.id}`}>Edit</button>{c.isActive&&<button onClick={()=>toggle(c)} className="min-h-10 px-3 text-xs text-[#b9c4d5] underline" data-testid={`button-toggle-checkpoint-${c.id}`}>Deactivate</button>}</article>)}</div>}</section>
      <section className="panel p-4 sm:p-5"><div className="mb-5 flex items-start justify-between"><div><p className="label text-[#d4af37]">{editing?'EDIT WAYPOINT':'NEW WAYPOINT'}</p><h2 className="mt-1 font-cinzel text-lg">{editing?editing.name:'Mark a destination'}</h2></div>{editing&&<button onClick={reset} aria-label="Close edit" className="grid h-10 w-10 place-items-center text-[#b9c4d5]" data-testid="button-cancel-edit-checkpoint"><X size={18}/></button>}</div>
        {error&&<div className="mb-4"><ErrorNotice error={error}/></div>}
        <form onSubmit={submit} className="space-y-3"><label className="block"><span className="label mb-1.5 block">Checkpoint name</span><input required maxLength={100} className="field" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="A familiar landmark" data-testid="input-checkpoint-name"/></label>
        <label className="block"><span className="label mb-1.5 block">Paste coordinates</span><span className="flex gap-2"><input className="field min-w-0" value={paste} onChange={e=>setPaste(e.target.value)} placeholder="13.011, 74.794" data-testid="input-paste-coordinates"/><button type="button" onClick={parsePaste} className="min-h-12 border border-[#d4af3750] px-3 text-xs text-[#f2d98a]" data-testid="button-parse-coordinates">Use</button></span></label>
        <div className="grid grid-cols-2 gap-3"><label><span className="label mb-1.5 block">Latitude</span><input required type="number" step="any" min="-90" max="90" className="field" value={form.lat} onChange={e=>setForm({...form,lat:e.target.value})} data-testid="input-checkpoint-latitude"/></label><label><span className="label mb-1.5 block">Longitude</span><input required type="number" step="any" min="-180" max="180" className="field" value={form.lng} onChange={e=>setForm({...form,lng:e.target.value})} data-testid="input-checkpoint-longitude"/></label></div>
        <button type="button" onClick={useMyLocation} className="flex min-h-11 w-full items-center justify-center gap-2 border border-[#31486d] text-sm text-[#f2d98a]" data-testid="button-use-current-location"><Navigation size={15}/> Use my current location</button>
        <label className="block"><span className="label mb-1.5 block">Arrival radius · metres</span><input required type="number" min="5" max="200" className="field" value={form.radiusM} onChange={e=>setForm({...form,radiusM:e.target.value})} data-testid="input-checkpoint-radius"/></label>
        <label className="block"><span className="label mb-1.5 block">Hint / lore <span className="normal-case tracking-normal text-[#8191a8]">optional</span></span><textarea maxLength={500} rows={3} className="field resize-y" value={form.hint} onChange={e=>setForm({...form,hint:e.target.value})} placeholder="A small clue for the crew…" data-testid="input-checkpoint-hint"/></label>
        <GoldButton type="submit" disabled={busy} data-testid="button-save-checkpoint">{busy?'Saving…':editing?'Save checkpoint':'Add checkpoint'}<Check size={16}/></GoldButton></form>
      </section></div>
  </AdminShell>;
}
function TeamsPage() {
  const qc=useQueryClient();const q=useGetTeams({query:{queryKey:getGetTeamsQueryKey(),refetchInterval:12000}});
  const create=useCreateTeam();const bulk=useBulkCreateTeams();const update=useUpdateTeam();const del=useDeleteTeam();const reset=useResetTeam();const release=useReleaseTeamLogin();const regenerate=useRegenerateTeamCode();
  const [name,setName]=useState('');const [members,setMembers]=useState('');const [bulkNames,setBulkNames]=useState('');const [editId,setEditId]=useState<string|null>(null);const [notice,setNotice]=useState<{title:string;items:{name:string;passcode:string}[]}|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [tab,setTab]=useState<'single'|'bulk'>('single');const [search,setSearch]=useState('');
  const refresh=()=>qc.invalidateQueries({queryKey:getGetTeamsQueryKey()});
  const submitSingle=async(e:FormEvent)=>{e.preventDefault();setError('');setBusy(true);try{if(editId){await update.mutateAsync({id:editId,data:{name:name.trim(),members:members.trim()||null}});setNotice({title:'Crew details saved',items:[]});setEditId(null);}else{const r=await create.mutateAsync({data:{name:name.trim(),members:members.trim()||null}});setNotice({title:'Offering Accepted · Save this passcode now',items:[{name:r.team.name,passcode:r.passcode}]});}setName('');setMembers('');await refresh();}catch(e){setError(apiErr(e));}finally{setBusy(false);}};
  const submitBulk=async(e:FormEvent)=>{e.preventDefault();setError('');const names=bulkNames.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!names.length){setError('Add at least one team name, one per line.');return;}setBusy(true);try{const r=await bulk.mutateAsync({data:{names:names.join('\n')}});setNotice({title:`${r.length} crew passes issued · shown once`,items:r.map(x=>({name:x.team.name,passcode:x.passcode}))});setBulkNames('');await refresh();}catch(e){setError(apiErr(e));}finally{setBusy(false);}};
  const issueReset=(team:AdminTeam)=>{if(!window.confirm(`Reset ${team.name}’s checkpoint progress and issue a new code? This cannot be undone.`))return;reset.mutate({id:team.id},{onSuccess:(r)=>{setNotice({title:'New code · shown once',items:[{name:r.team.name,passcode:r.passcode}]});void refresh();},onError:e=>setError(apiErr(e))});};
  const issueRegenerate=(team:AdminTeam)=>{if(!window.confirm(`Issue a new code for ${team.name}? Their checkpoint progress stays unchanged, but the current phone will be signed out.`))return;regenerate.mutate({id:team.id},{onSuccess:(r)=>{setNotice({title:'New code issued · progress preserved · shown once',items:[{name:r.team.name,passcode:r.passcode}]});void refresh();},onError:e=>setError(apiErr(e))});};
  const releaseLogin=(team:AdminTeam)=>{if(!window.confirm(`Release ${team.name}’s captain phone? Checkpoint progress and the access code stay unchanged.`))return;release.mutate({id:team.id},{onSuccess:()=>void refresh(),onError:e=>setError(apiErr(e))});};
  const remove=(team:AdminTeam)=>{if(!window.confirm(`Permanently remove ${team.name}?`))return;del.mutate({id:team.id},{onSuccess:()=>void refresh(),onError:e=>setError(apiErr(e))});};
  const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);}catch{setError('Clipboard unavailable. Select and copy the passcode manually.');}};
  const downloadPasses=()=>{if(!notice?.items.length)return;const csv=[['event','team','access_code'],...notice.items.map(x=>[BRAND.event,x.name,x.passcode])].map(row=>row.map(value=>`"${value.replaceAll('"','""')}"`).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${brandFileStem}-codes.csv`;link.click();URL.revokeObjectURL(url);};
  const visible=(q.data||[]).filter(t=>t.name.toLowerCase().includes(search.toLowerCase()));
  return <AdminShell title="Teams"><PageTitle eyebrow="CREW MANIFEST" title="Team manager" detail="Provision passes, track crews and keep every team ready for the crossing."/>
    {error&&<div className="mb-5"><ErrorNotice error={error}/></div>}
     {notice&&<section className="passcode-notice mb-6 border border-[#d4af3775] bg-[#d4af3710] p-4 sm:p-5" data-testid="status-passcode-result">
       <div className="passcode-screen-heading flex items-start justify-between gap-4"><div><p className="label text-[#d4af37]">TEAM ACCESS CODES</p><h2 className="mt-1 font-cinzel text-lg text-[#f2d98a]">{notice.title}</h2></div><button onClick={()=>setNotice(null)} aria-label="Dismiss codes" className="grid h-10 w-10 place-items-center text-[#b9c4d5]" data-testid="button-dismiss-passcodes"><X size={17}/></button></div>
       {notice.items.length>0&&<>
         <div className="print-pass-slips mt-4">{notice.items.map((it,i)=><article key={`${it.name}-${i}`} className="access-code-slip">
           <header className="flex items-center gap-3 border-b border-[#9c7a4b] pb-2"><img src={BRAND.logoPath} alt={BRAND.organiser} className="h-10 w-16 object-contain"/><div><p className="font-script text-sm">{BRAND.presenter}</p><p className="font-cinzel text-sm font-bold">{BRAND.event}</p><p className="label">{BRAND.subtitle} · TEAM PASS</p></div></header>
           <p className="mt-3 truncate font-cinzel text-sm">{it.name}</p><code className="mt-1 block font-coordinate text-2xl font-bold tracking-[.18em]" data-testid={`text-passcode-${i}`}>{it.passcode}</code><p className="mt-2 text-[10px] leading-relaxed">One code · one captain · one phone. Keep this code with your crew. Ask an IET NITK organiser if you lose access.</p>
           <p className="mt-auto pt-2 text-[9px] uppercase tracking-wider">{BRAND.segment}</p>
         </article>)}</div>
         <div className="passcode-screen-controls">
           <p className="mt-3 text-xs text-[#b9c4d5]">Codes are displayed once. Download or print these slips now, keep them private, and hand one to each team’s captain.</p>
           <div className="mt-3 flex flex-wrap gap-4"><button onClick={downloadPasses} className="flex min-h-11 items-center gap-2 text-sm text-[#f2d98a] underline" data-testid="button-download-passcodes"><Download size={15}/>Download codes CSV</button><button onClick={()=>window.print()} className="flex min-h-11 items-center gap-2 text-sm text-[#f2d98a] underline" data-testid="button-print-passcodes">Print pass slips</button></div>
         </div>
       </>}
     </section>}
    <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
      <section className="panel p-4 sm:p-5"><div className="mb-5 flex items-center justify-between"><div><p className="label text-[#d4af37]">{editId?'EDIT CREW':'PROVISION'}</p><h2 className="mt-1 font-cinzel text-lg">{editId?'Update team':'Add teams'}</h2></div>{editId&&<button onClick={()=>{setEditId(null);setName('');setMembers('');}} className="grid h-10 w-10 place-items-center text-[#b9c4d5]" data-testid="button-cancel-team-edit"><X size={17}/></button>}</div>
        {!editId&&<div className="mb-4 grid grid-cols-2 gap-2"><button onClick={()=>setTab('single')} className={`min-h-11 border text-xs uppercase tracking-wider ${tab==='single'?'border-[#d4af37] text-[#f2d98a]':'border-[#31486d] text-[#91a0b7]'}`} data-testid="button-single-team-tab">Single team</button><button onClick={()=>setTab('bulk')} className={`min-h-11 border text-xs uppercase tracking-wider ${tab==='bulk'?'border-[#d4af37] text-[#f2d98a]':'border-[#31486d] text-[#91a0b7]'}`} data-testid="button-bulk-team-tab">Bulk add</button></div>}
        {editId||tab==='single'?<form onSubmit={submitSingle} className="space-y-3"><label className="block"><span className="label mb-1.5 block">Team name</span><input required maxLength={80} className="field" value={name} onChange={e=>setName(e.target.value)} placeholder="The Ithaca crew" data-testid="input-new-team-name"/></label><label className="block"><span className="label mb-1.5 block">Crew members <span className="normal-case tracking-normal text-[#8191a8]">optional</span></span><textarea maxLength={500} rows={3} className="field" value={members} onChange={e=>setMembers(e.target.value)} placeholder="Names or student IDs" data-testid="input-team-members"/></label><GoldButton type="submit" disabled={busy} data-testid="button-save-team">{busy?'Saving…':editId?'Save team':'Create team & issue pass'}<Plus size={16}/></GoldButton></form>:<form onSubmit={submitBulk} className="space-y-3"><label className="block"><span className="label mb-1.5 block">Team names · one per line</span><textarea required rows={7} className="field resize-y" value={bulkNames} onChange={e=>setBulkNames(e.target.value)} placeholder={'Aegean Runners\\nThe Returning Tide\\nCrew Three'} data-testid="input-bulk-team-names"/></label><p className="text-xs text-[#91a0b7]">Each crew receives its own one-time passcode.</p><GoldButton type="submit" disabled={busy} data-testid="button-bulk-create-teams">{busy?'Issuing passes…':'Create teams & issue passes'}<Users size={16}/></GoldButton></form>}
      </section>
      <section className="panel p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-cinzel text-lg">Registered crews</h2><p className="mt-1 text-xs text-[#91a0b7]">{q.data?.length??0} teams in the manifest</p></div><label className="relative w-full sm:w-56"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8191a8]"/><input className="field min-h-10 pl-9 text-sm" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search crews" data-testid="input-search-teams"/></label></div>
         {q.isLoading ? <Loading/> : q.isError ? <ErrorNotice error={q.error} retry={()=>void q.refetch()}/> : !visible.length ? <div className="border border-dashed border-[#d4af3733] p-8 text-center"><Users className="mx-auto text-[#8191a8]"/><p className="mt-3 font-cormorant text-xl">{q.data?.length ? 'No crews found.' : 'No crews in the manifest yet.'}</p></div> : <div className="space-y-2">{visible.map(t => <article key={t.id} className="border border-[#d4af3720] bg-[#08162d] p-3 sm:p-4" data-testid={`row-team-${t.id}`}>
           <div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate font-medium">{t.name}</p><p className="mt-1 text-xs text-[#91a0b7]">{t.members || 'Crew members not listed'}</p><p className="mt-2 text-xs">Code · <code className="font-coordinate tracking-wider">{t.codeHint || '—'}••••••</code> · {t.claimedAt ? `Captain ${t.leaderName || 'name not recorded'}` : 'Unclaimed'}</p><p className="mt-1 text-[10px] text-[#91a0b7]">Last seen: {timeAgo(t.lastLoginAt)}{t.userAgent ? ` · ${t.userAgent.slice(0, 55)}` : ''}</p></div>
             <span className="rounded-full border border-[#d4af372b] px-2.5 py-1 text-[10px] uppercase text-[#f2d98a]">{statusLabel(t.status)}</span>
             <div className="flex w-full flex-wrap gap-2 border-t border-[#d4af3717] pt-2 sm:w-auto sm:border-0 sm:pt-0">
               <button onClick={()=>{setEditId(t.id);setName(t.name);setMembers(t.members||'');setTab('single');}} className="min-h-10 px-2 text-xs text-[#f2d98a] underline" data-testid={`button-edit-team-${t.id}`}>Edit</button>
               <button onClick={()=>issueRegenerate(t)} className="flex min-h-10 items-center gap-1 px-2 text-xs text-[#f2d98a] underline" data-testid={`button-regenerate-team-code-${t.id}`}>New code · keep progress</button>
               {t.claimedAt&&<button onClick={()=>releaseLogin(t)} className="flex min-h-10 items-center gap-1 px-2 text-xs text-[#f2d98a] underline" data-testid={`button-release-team-login-${t.id}`}>Release phone</button>}
               <button onClick={()=>issueReset(t)} className="flex min-h-10 items-center gap-1 px-2 text-xs text-[#b9c4d5] underline" data-testid={`button-reset-team-${t.id}`}><RotateCcw size={13}/>Reset progress</button>
               <button onClick={()=>remove(t)} className="flex min-h-10 items-center gap-1 px-2 text-xs text-[#f0b39b] underline" data-testid={`button-delete-team-${t.id}`}><Trash2 size={13}/>Delete</button>
             </div></div><div className="mt-3 h-1 overflow-hidden bg-[#1a2d4b]"><div className="h-full bg-[#d4af37]" style={{width:`${t.totalCheckpoints ? Math.min(100,t.currentIndex/t.totalCheckpoints*100) : 0}%`}}/></div>
           </article>)}</div>}
      </section>
    </div>
  </AdminShell>;
}
function SettingsPage() {
  const qc=useQueryClient();const settings=useGetGameSettings({query:{queryKey:getGetGameSettingsQueryKey()}});const overview=useGetAdminOverview({query:{queryKey:getGetAdminOverviewQueryKey(),refetchInterval:12000}});
  const update=useUpdateGameSettings();const start=useStartEvent();const pause=usePauseEvent();const end=useEndEvent();const exportQuery=useExportResults({query:{queryKey:getExportResultsQueryKey(),enabled:false}});
  const settingsPayload:GameSettings|undefined=settings.data;
  const [values,setValues]=useState({defaultRadiusM:'30',accuracySlackM:'40',maxAccuracyM:'200'});const [message,setMessage]=useState('');const [error,setError]=useState('');
  useEffect(()=>{if(settingsPayload)setValues({defaultRadiusM:String(settingsPayload.defaultRadiusM),accuracySlackM:String(settingsPayload.accuracySlackM),maxAccuracyM:String(settingsPayload.maxAccuracyM)});},[settingsPayload]);
  const invalidate=()=>{void qc.invalidateQueries({queryKey:getGetGameSettingsQueryKey()});void qc.invalidateQueries({queryKey:getGetAdminOverviewQueryKey()});};
  const save=async(e:FormEvent)=>{e.preventDefault();setMessage('');setError('');const v={defaultRadiusM:Number(values.defaultRadiusM),accuracySlackM:Number(values.accuracySlackM),maxAccuracyM:Number(values.maxAccuracyM)};if(v.defaultRadiusM<5||v.defaultRadiusM>200||v.accuracySlackM<0||v.accuracySlackM>200||v.maxAccuracyM<10||v.maxAccuracyM>300){setError('One or more values are outside the permitted range.');return;}try{await update.mutateAsync({data:v});invalidate();setMessage('Offering Accepted · Game settings saved.');}catch(e){setError(apiErr(e));}};
  const eventAction=async(action:'start'|'pause'|'end')=>{setError('');setMessage('');if(action==='end'&&!window.confirm('End the event for every team? This cannot be undone.'))return;try{if(action==='start')await start.mutateAsync();else if(action==='pause')await pause.mutateAsync();else await end.mutateAsync();invalidate();setMessage(action==='start'?'The event is now open.':action==='pause'?'The event is paused.':'The event has ended.');}catch(e){setError(apiErr(e));}};
  const exportCsv=async()=>{setError('');try{const {data}=await exportQuery.refetch();if(data){const blob=new Blob([data],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${brandFileStem}-results.csv`;a.click();URL.revokeObjectURL(url);}}catch(e){setError(apiErr(e));}};
  const status=overview.data?.eventStatus||'NOT_STARTED';
  return <AdminShell title="Settings"><PageTitle eyebrow="EVENT STEWARDSHIP" title="Settings & controls" detail="Open the crossing, tune the arrival threshold and take a record of the voyage."/>
    {(settings.isLoading||overview.isLoading)&&<Loading text="Reading the event instruments…"/>}
    {(settings.isError||overview.isError)&&<ErrorNotice error={settings.error||overview.error} retry={()=>{void settings.refetch();void overview.refetch();}}/>}
    {error&&<div className="mb-5"><ErrorNotice error={error}/></div>}{message&&<div className="mb-5 border border-[#73c99955] bg-[#73c99912] p-3 text-sm text-[#a7d7bd]" role="status" data-testid="status-settings-success">{message}</div>}
    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="panel p-4 sm:p-6"><div className="mb-5 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-[#d4af3750] text-[#f2d98a]"><Activity size={18}/></div><div><p className="label text-[#d4af37]">THE EVENT</p><h2 className="font-cinzel text-lg">Event controls</h2></div></div><div className="mb-5 flex items-center justify-between border border-[#d4af3728] bg-[#07152f] p-4"><div><span className="label block">Current event state</span><span className="mt-1 block font-cinzel uppercase text-[#f2d98a]" data-testid="status-event-state">{statusLabel(status)}</span></div><span className={`h-3 w-3 rounded-full ${status==='ACTIVE'?'animate-pulse bg-[#73c999]':'bg-[#d4af37]'}`}/></div><div className="grid gap-2 sm:grid-cols-3"><button className="flex min-h-12 items-center justify-center gap-2 border border-[#73c99970] text-sm text-[#a7d7bd] disabled:opacity-40" disabled={status==='ACTIVE'||start.isPending} onClick={()=>void eventAction('start')} data-testid="button-start-event"><Play size={15}/> Start event</button><button className="flex min-h-12 items-center justify-center gap-2 border border-[#d4af3770] text-sm text-[#f2d98a] disabled:opacity-40" disabled={status!=='ACTIVE'||pause.isPending} onClick={()=>void eventAction('pause')} data-testid="button-pause-event"><Pause size={15}/> Pause event</button><button className="flex min-h-12 items-center justify-center gap-2 border border-[#c1440e70] text-sm text-[#f0b39b] disabled:opacity-40" disabled={status==='ENDED'||end.isPending} onClick={()=>void eventAction('end')} data-testid="button-end-event"><X size={15}/> End event</button></div><p className="mt-4 text-xs leading-relaxed text-[#91a0b7]">Pausing suspends team arrivals. Ending closes the event for all crews.</p></section>
      <section className="panel p-4 sm:p-6"><div className="mb-5 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-[#d4af3750] text-[#f2d98a]"><Gauge size={18}/></div><div><p className="label text-[#d4af37]">GPS THRESHOLDS</p><h2 className="font-cinzel text-lg">Game settings</h2></div></div><form onSubmit={save} className="space-y-4"><label className="block"><span className="label mb-1.5 block">Default arrival radius · m</span><input type="number" min="5" max="200" required className="field" value={values.defaultRadiusM} onChange={e=>setValues({...values,defaultRadiusM:e.target.value})} data-testid="input-setting-radius"/><span className="mt-1 block text-xs text-[#8191a8]">5–200 m. Used for newly created checkpoints.</span></label><label className="block"><span className="label mb-1.5 block">Accuracy slack · m</span><input type="number" min="0" max="200" required className="field" value={values.accuracySlackM} onChange={e=>setValues({...values,accuracySlackM:e.target.value})} data-testid="input-setting-slack"/><span className="mt-1 block text-xs text-[#8191a8]">Campus GPS can drift near buildings and tree cover.</span></label><label className="block"><span className="label mb-1.5 block">Maximum accepted accuracy · m</span><input type="number" min="10" max="300" required className="field" value={values.maxAccuracyM} onChange={e=>setValues({...values,maxAccuracyM:e.target.value})} data-testid="input-setting-max-accuracy"/></label><GoldButton type="submit" disabled={update.isPending||settings.isLoading} data-testid="button-save-settings">{update.isPending?'Saving…':'Save thresholds'}<Check size={16}/></GoldButton></form></section>
      <section className="panel p-4 sm:p-6 xl:col-span-2"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-[#d4af3750] text-[#f2d98a]"><Download size={18}/></div><div><p className="label text-[#d4af37]">EVENT RECORD</p><h2 className="font-cinzel text-lg">Export results</h2><p className="mt-1 text-sm text-[#91a0b7]">Download team progress and checkpoint completions as CSV.</p></div></div><button onClick={()=>void exportCsv()} disabled={exportQuery.isFetching} className="flex min-h-12 items-center justify-center gap-2 border border-[#d4af3770] px-5 text-sm text-[#f2d98a] disabled:opacity-50" data-testid="button-export-results"><Download size={15}/>{exportQuery.isFetching?'Preparing…':'Download CSV'}</button></div></section>
    </div><div className="mt-8 flex items-start gap-3 border-t border-[#d4af3725] pt-5 text-xs leading-relaxed text-[#8191a8]"><CircleHelp size={15} className="mt-0.5 shrink-0 text-[#d4af37]"/>Event-day note: check every location in person before opening the route. Respect changing weather and keep the crew together.</div>
  </AdminShell>;
}
export default App;
