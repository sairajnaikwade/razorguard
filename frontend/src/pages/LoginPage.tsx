import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, ShieldCheck, User, Cpu, Activity } from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';

// ─── Canvas background: grid + particles + light rays ──────────────────────
function CyberBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let W = 0, H = 0;

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      r: number; alpha: number;
    }
    let particles: Particle[] = [];

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      spawn();
    };

    const spawn = () => {
      const n = Math.floor((W * H) / 12000);
      particles = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() * 1.4 + 0.4, alpha: Math.random() * 0.35 + 0.08,
      }));
    };

    const frame = () => {
      ctx.clearRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = 'rgba(30,62,100,0.25)';
      ctx.lineWidth = 0.5;
      const gs = 55;
      for (let x = 0; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y = 0; y < H; y += gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

      // Light rays from center-top
      const cx = W / 2, cy = -80;
      const rayCount = 6;
      for (let i = 0; i < rayCount; i++) {
        const angle = ((i / rayCount) - 0.5) * 1.2;
        const g = ctx.createLinearGradient(cx, cy, cx + Math.sin(angle) * W * 0.9, cy + Math.cos(angle) * H * 1.2);
        g.addColorStop(0,   'rgba(59,130,246,0.07)');
        g.addColorStop(0.5, 'rgba(59,130,246,0.025)');
        g.addColorStop(1,   'rgba(59,130,246,0)');
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.sin(angle - 0.06) * W, cy + Math.cos(angle - 0.06) * H * 1.5);
        ctx.lineTo(cx + Math.sin(angle + 0.06) * W, cy + Math.cos(angle + 0.06) * H * 1.5);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Particles
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(96,165,250,${p.alpha})`;
        ctx.fill();
      });

      // Connection lines
      ctx.lineWidth = 0.35;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 100) {
            ctx.strokeStyle = `rgba(59,130,246,${0.12 * (1 - d / 100)})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(frame);
    };

    resize();
    frame();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" aria-hidden />;
}

// ─── Logo with glow ─────────────────────────────────────────────────────────
function LogoWithGlow() {
  return (
    <div className="relative flex flex-col items-center px-4">
      {/* Outer glow rings - responsive sizing */}
      <div className="absolute w-48 h-48 sm:w-72 sm:h-72 rounded-full bg-blue-500/10 blur-2xl sm:blur-3xl logo-glow-outer" />
      <div className="absolute w-40 h-40 sm:w-56 sm:h-56 rounded-full bg-cyan-400/8 blur-xl sm:blur-2xl logo-glow-inner" />

      {/* Full RazorGuard logo (shield + wordmark + tagline) */}
      <div className="relative z-10 logo-breathe w-full max-w-[180px] sm:max-w-[240px] md:max-w-[280px] lg:max-w-[300px]">
        <img
          src="/razorguard-full.png"
          alt="RazorGuard — Fraud Intelligence"
          className="w-full h-auto select-none"
          draggable={false}
          style={{ filter: 'drop-shadow(0 0 20px rgba(59,130,246,0.35)) drop-shadow(0 0 34px rgba(59,130,246,0.45))' }}
          onError={(e) => {
            // Fallback to bundled vector logo if the raster asset is unavailable
            e.currentTarget.onerror = null;
            e.currentTarget.src = '/razorguard-logo-full.svg';
          }}
        />
      </div>
    </div>
  );
}

// ─── Feature chip ──────────────────────────────────────────────────────────
function FeatureChip({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 sm:py-3 rounded-lg sm:rounded-xl bg-[#081A30]/70 border border-blue-900/40 backdrop-blur-sm text-center">
      <span className="text-blue-400">{icon}</span>
      <span className="text-[10px] sm:text-xs font-semibold text-slate-200 leading-tight">{label}</span>
      <span className="text-[8px] sm:text-[10px] text-slate-500 leading-tight hidden sm:block">{sub}</span>
    </div>
  );
}

// ─── Splash Intro Component ──────────────────────────────────────────────────
function SplashIntro({ onComplete }: { onComplete: () => void }) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    // Fade out after ~2.8s
    const fadeTimer = setTimeout(() => {
      setFadingOut(true);
    }, 2800);

    // Complete transition after ~3.3s
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 3300);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const handleSkip = () => {
    setFadingOut(true);
    setTimeout(onComplete, 400);
  };

  return (
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#040A15] text-white overflow-hidden cursor-pointer select-none transition-all duration-500 ease-out ${
        fadingOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background ambient lighting */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] sm:w-[650px] h-[350px] sm:h-[650px] rounded-full bg-blue-600/12 blur-[100px] sm:blur-[160px] animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] sm:w-[380px] h-[220px] sm:h-[380px] rounded-full bg-cyan-500/10 blur-[60px] sm:blur-[100px]" />
      </div>

      {/* Cyber Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e3e6415_1px,transparent_1px),linear-gradient(to_bottom,#1e3e6415_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Central Content Container */}
      <div className="relative z-10 flex flex-col items-center px-4 max-w-lg w-full text-center">
        {/* Shield Logo with glowing pulse */}
        <div className="relative mb-6 sm:mb-8 flex items-center justify-center">
          {/* Animated Blue Glow Rings */}
          <div className="absolute w-36 h-36 sm:w-52 sm:h-52 rounded-full bg-blue-500/25 blur-2xl logo-glow-outer" />
          <div className="absolute w-28 h-28 sm:w-40 sm:h-40 rounded-full bg-cyan-400/20 blur-xl logo-glow-inner" />

          {/* Shield Asset */}
          <div className="relative z-10 w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 flex items-center justify-center animate-splash-shield">
            <img
              src="/razorguard-shield.png"
              alt="RazorGuard Shield"
              className="w-full h-full object-contain filter drop-shadow-[0_0_25px_rgba(59,130,246,0.65)]"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = '/razorguard-full.png';
              }}
            />
          </div>
        </div>

        {/* Title: RAZORGUARD */}
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[0.25em] bg-gradient-to-r from-blue-400 via-sky-100 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(59,130,246,0.45)] uppercase mb-3.5 animate-splash-title">
          RAZORGUARD
        </h1>

        {/* Subtitle: AI-POWERED FRAUD INTELLIGENCE */}
        <p className="text-xs sm:text-sm font-semibold tracking-[0.3em] text-blue-400/90 uppercase text-center max-w-xs sm:max-w-md animate-splash-subtitle">
          AI-Powered Fraud Intelligence
        </p>

        {/* Progress bar */}
        <div className="mt-10 sm:mt-12 w-48 sm:w-64 h-0.5 bg-blue-950/80 rounded-full overflow-hidden relative">
          <div className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 rounded-full animate-splash-progress" />
        </div>

        {/* Skip note */}
        <p className="mt-4 text-[9px] sm:text-[10px] tracking-widest text-slate-500/60 uppercase">
          Click anywhere to skip
        </p>
      </div>
    </div>
  );
}

// ─── Main LoginPage ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const [showSplash, setShowSplash] = useState(true);
  const [username, setUsername]     = useState('');
  const [password, setPassword]     = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [remember, setRemember]     = useState(false);
  const [error, setError]           = useState('');
  const [shake, setShake]           = useState(false);
  const [loading, setLoading]       = useState(false);
  const [success, setSuccess]       = useState(false);
  const login    = useAuthStore(s => s.login);
  const navigate = useNavigate();

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 420);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter your username and password.');
      triggerShake();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { username, password });
      setSuccess(true);
      setTimeout(() => { login(data.user, data.access_token); navigate('/'); }, 700);
    } catch {
      setError('Invalid username or password. Please try again.');
      triggerShake();
      setLoading(false);
    }
  };

  const inputBase = `
    w-full bg-[#081220]/80 border rounded-xl pl-10 pr-4 py-3 text-sm text-white
    placeholder:text-slate-600
    focus:outline-none focus:ring-1
    transition-all duration-150
    hover:border-blue-800/60
  `;
  const inputNormal  = `${inputBase} border-[#1A2A45] focus:border-blue-500/70 focus:ring-blue-500/25`;
  const inputError   = `${inputBase} border-red-500/50 focus:border-red-500/70 focus:ring-red-500/20`;

  return (
    <>
      {showSplash && <SplashIntro onComplete={() => setShowSplash(false)} />}
      <div className="relative min-h-screen min-h-dvh bg-[#050D1A] flex flex-col items-center justify-center p-3 sm:p-4 overflow-hidden">
        {/* Canvas background */}
        <CyberBackground />

        {/* Radial glow blobs - responsive sizing */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-[-15%] left-[50%] -translate-x-1/2 w-[400px] sm:w-[700px] h-[300px] sm:h-[500px] rounded-full bg-blue-600/7 blur-[80px] sm:blur-[140px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] rounded-full bg-indigo-700/5 blur-[60px] sm:blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[200px] sm:w-[350px] h-[200px] sm:h-[350px] rounded-full bg-cyan-600/4 blur-[60px] sm:blur-[100px]" />
      </div>

      {/* ── Logo hero ──────────────────────────────────────────────────── */}
      <div className="relative z-10 mb-6 sm:mb-8 flex flex-col items-center">
        <LogoWithGlow />
        <div className="mt-4 sm:mt-6 text-center">
          <p className="text-[10px] sm:text-[11px] tracking-[0.22em] text-slate-500 uppercase">
            Enterprise Security Platform
          </p>
        </div>
      </div>

      {/* ── Glass login card ──────────────────────────────────────────────── */}
      <div
        className={`relative z-10 w-full max-w-sm sm:max-w-md px-3 sm:px-4 transition-all duration-600 ${success ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
        style={{ animation: 'cardEntrance 0.52s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        {/* Card glow border */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-blue-500/20 to-transparent pointer-events-none" />

        <div className="relative glass-card rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
          {/* Top accent */}
          <div className="h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

          <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 sm:pb-6">
            {/* Welcome */}
            <h2 className="text-lg sm:text-xl font-bold text-white text-center mb-1">Welcome Back</h2>
            <p className="text-slate-500 text-sm text-center mb-5 sm:mb-7">
              Sign in to continue to RazorGuard
            </p>

            {/* Error */}
            {error && (
              <div
                className={`flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm mb-4 sm:mb-5 animate-fade-in ${shake ? 'animate-shake' : ''}`}
                role="alert"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span className="text-xs sm:text-sm">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4" noValidate>
              {/* Username */}
              <div>
                <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 sm:mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="analyst@razorguard.com"
                    className={`${error ? inputError : inputNormal} text-xs sm:text-sm pl-9 sm:pl-10`}
                    disabled={loading || success}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 sm:mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={`${error ? inputError : inputNormal} text-xs sm:text-sm pl-9 sm:pl-10 pr-10 sm:pr-11`}
                    disabled={loading || success}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1 rounded"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2 sm:gap-2.5 py-0.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={remember}
                  onClick={() => setRemember(v => !v)}
                  style={{ width: 16, height: 16 }}
                  className={`sm:w-[18px] sm:h-[18px] rounded-md border flex items-center justify-center transition-all shrink-0 ${
                    remember
                      ? 'bg-blue-600 border-blue-500 shadow-sm shadow-blue-500/30'
                      : 'bg-[#081220] border-[#1A2A45] hover:border-blue-700/60'
                  }`}
                >
                  {remember && (
                    <svg width="9" height="7" viewBox="0 0 10 8" fill="none" className="sm:w-2.5 sm:h-2">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                <span className="text-xs sm:text-sm text-slate-400 select-none flex-1">Remember me</span>
                <span className="text-[10px] sm:text-xs text-blue-500/70 hover:text-blue-400 cursor-pointer transition-colors">
                  Forgot password?
                </span>
              </div>

              {/* Sign In button */}
              <button
                type="submit"
                disabled={loading || success}
                className={`
                  relative w-full flex items-center justify-center gap-2 sm:gap-2.5 py-2.5 sm:py-3 rounded-xl
                  text-xs sm:text-sm font-bold transition-all duration-200 overflow-hidden mt-1
                  focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1 focus:ring-offset-[#081220]
                  disabled:opacity-60 disabled:cursor-not-allowed
                  ${success
                    ? 'bg-green-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg shadow-blue-700/30 hover:shadow-blue-500/40'
                  }
                `}
              >
                {/* Shimmer sweep */}
                {!loading && !success && (
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                )}
                {success ? (
                  <><ShieldCheck size={16} /> Authenticated</>
                ) : loading ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"/>
                    </svg>
                    Authenticating…
                  </>
                ) : (
                  'Sign In →'
                )}
              </button>
            </form>

            {/* Footer */}
            <p className="mt-4 sm:mt-5 text-center text-[10px] sm:text-[11px] text-slate-600 flex items-center justify-center gap-1 sm:gap-1.5">
              <Lock size={8} className="sm:w-2.5 sm:h-2.5" />
              <span className="leading-tight">Secure login protected by enterprise-grade encryption</span>
            </p>
          </div>

          {/* Feature chips - responsive grid */}
          <div className="px-4 sm:px-8 pb-5 sm:pb-7 grid grid-cols-3 gap-1.5 sm:gap-2.5">
            <FeatureChip icon={<Cpu size={12} className="sm:w-3.5 sm:h-3.5" />} label="AI-Powered" sub="Advanced ML models" />
            <FeatureChip icon={<Activity size={12} className="sm:w-3.5 sm:h-3.5" />} label="Real-time" sub="Live fraud monitoring" />
            <FeatureChip icon={<ShieldCheck size={12} className="sm:w-3.5 sm:h-3.5"/>} label="Secure" sub="Bank-grade security" />
          </div>

          {/* Bottom bar */}
          <div className="h-px bg-gradient-to-r from-transparent via-blue-900/40 to-transparent" />
          <p className="text-center text-[9px] sm:text-[10px] text-slate-700 py-2.5 sm:py-3 px-2">
            © 2025 RazorGuard. All rights reserved.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes cardEntrance {
          from { opacity:0; transform: translateY(26px) scale(0.97); }
          to   { opacity:1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
    </>
  );
}
