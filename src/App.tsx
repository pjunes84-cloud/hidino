/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Layout, 
  Image as ImageIcon, 
  Settings, 
  Plus, 
  Trash2, 
  LogOut, 
  Menu, 
  X, 
  Instagram, 
  MessageCircle, 
  ArrowRight,
  ChevronRight,
  BarChart3,
  FileText,
  Palette,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types ---
interface SiteSettings {
  siteTitle: string;
  accentColor: string;
  contactEmail: string;
  kakaoUrl: string;
  instaUrl: string;
}

interface PortfolioItem {
  id: string;
  title: string;
  category: string;
  imageUrl: string;
  description: string;
  order: number;
}

interface Notice {
  id: string;
  title: string;
  content: string;
  createdAt: any;
}

interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  createdAt: any;
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error?.message?.includes('Firestore Error')) {
        setHasError(true);
        try {
          const info = JSON.parse(event.error.message);
          setErrorMessage(`데이터베이스 오류: ${info.error}`);
        } catch {
          setErrorMessage('알 수 없는 데이터베이스 오류가 발생했습니다.');
        }
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999] p-4">
        <div className="bg-zinc-900 border border-red-500/50 p-8 rounded-2xl max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-red-500 mb-4">오류 발생</h2>
          <p className="text-zinc-400 mb-6">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-red-500 text-white px-6 py-2 rounded-full font-medium"
          >
            새로고침
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const [settings, setSettings] = useState<SiteSettings>({
    siteTitle: '상상점포',
    accentColor: '#8A2BE2',
    contactEmail: 'pjunes84@gmail.com',
    kakaoUrl: '',
    instaUrl: ''
  });
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);

  // --- Firebase Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Check if admin (simple check for this demo, usually handled by custom claims or a user doc)
        // For this app, we'll check the email directly as per rules
        if (u.email === 'pjunes84@gmail.com' && u.emailVerified) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // --- Firestore Listeners ---
  useEffect(() => {
    if (!isAuthReady) return;

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'settings', 'global'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firebase connection failed. Check config.");
        }
      }
    };
    testConnection();

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as SiteSettings);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/global'));

    const qPortfolio = query(collection(db, 'portfolio'), orderBy('order', 'asc'));
    const unsubPortfolio = onSnapshot(qPortfolio, (snap) => {
      setPortfolio(snap.docs.map(d => ({ id: d.id, ...d.data() } as PortfolioItem)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'portfolio'));

    const qNotices = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
    const unsubNotices = onSnapshot(qNotices, (snap) => {
      setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notices'));

    const qInquiries = query(collection(db, 'inquiries'), orderBy('createdAt', 'desc'));
    const unsubInquiries = onSnapshot(qInquiries, (snap) => {
      setInquiries(snap.docs.map(d => ({ id: d.id, ...d.data() } as Inquiry)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inquiries'));

    return () => {
      unsubSettings();
      unsubPortfolio();
      unsubNotices();
      unsubInquiries();
    };
  }, [isAuthReady]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setShowAdmin(false);
  };

  // --- Admin Actions ---
  const updateSettings = async (newSettings: Partial<SiteSettings>) => {
    try {
      await setDoc(doc(db, 'settings', 'global'), { ...settings, ...newSettings });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/global');
    }
  };

  const addPortfolioItem = async () => {
    try {
      await addDoc(collection(db, 'portfolio'), {
        title: '새 프로젝트',
        category: 'Logo Design',
        imageUrl: 'https://picsum.photos/seed/design/800/600',
        description: '프로젝트 설명을 입력하세요.',
        order: portfolio.length
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'portfolio');
    }
  };

  const deletePortfolioItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'portfolio', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `portfolio/${id}`);
    }
  };

  const addNotice = async () => {
    try {
      await addDoc(collection(db, 'notices'), {
        title: '새 공지사항',
        content: '내용을 입력하세요.',
        createdAt: Timestamp.now()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notices');
    }
  };

  const deleteNotice = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notices', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notices/${id}`);
    }
  };

  const deleteInquiry = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'inquiries', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `inquiries/${id}`);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-brand-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-black text-white selection:bg-brand-purple/30">
        {/* Navigation */}
        <nav className="fixed top-0 w-full z-50 bg-black/50 backdrop-blur-xl border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-purple rounded-lg flex items-center justify-center font-bold text-xl">상</div>
              <span className="text-xl font-bold tracking-tighter">{settings.siteTitle}</span>
            </div>
            
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
              <a href="#services" className="hover:text-white transition-colors">Services</a>
              <a href="#portfolio" className="hover:text-white transition-colors">Portfolio</a>
              <a href="#contact" className="hover:text-white transition-colors">Contact</a>
              {isAdmin && (
                <button 
                  onClick={() => setShowAdmin(!showAdmin)}
                  className="flex items-center gap-2 text-brand-purple hover:text-brand-purple/80 transition-colors"
                >
                  <Settings size={16} />
                  {showAdmin ? 'Close Admin' : 'Admin Panel'}
                </button>
              )}
              {!user ? (
                <button onClick={handleLogin} className="bg-white text-black px-5 py-2 rounded-full hover:bg-zinc-200 transition-colors">Login</button>
              ) : (
                <div className="flex items-center gap-4">
                  <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-white/10" alt="" />
                  <button onClick={handleLogout} className="hover:text-white transition-colors"><LogOut size={18} /></button>
                </div>
              )}
            </div>
          </div>
        </nav>

        <AnimatePresence mode="wait">
          {showAdmin ? (
            <AdminPanel 
              settings={settings} 
              portfolio={portfolio} 
              notices={notices}
              inquiries={inquiries}
              updateSettings={updateSettings}
              addPortfolioItem={addPortfolioItem}
              deletePortfolioItem={deletePortfolioItem}
              addNotice={addNotice}
              deleteNotice={deleteNotice}
              deleteInquiry={deleteInquiry}
            />
          ) : (
            <MainContent 
              settings={settings} 
              portfolio={portfolio} 
              notices={notices}
            />
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="bg-zinc-950 border-t border-white/5 py-20">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-brand-purple rounded-lg flex items-center justify-center font-bold text-xl">상</div>
                <span className="text-xl font-bold tracking-tighter">{settings.siteTitle}</span>
              </div>
              <p className="text-zinc-500 max-w-sm leading-relaxed">
                상상점포는 브랜드의 가치를 시각적으로 구현하는 프리미엄 디자인 에이전시입니다. 
                당신의 상상을 현실로 만드는 가장 세련된 방법을 제안합니다.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-6">Contact</h4>
              <ul className="space-y-4 text-zinc-500 text-sm">
                <li>{settings.contactEmail}</li>
                <li className="flex items-center gap-2">
                  <MessageCircle size={14} /> KakaoTalk
                </li>
                <li className="flex items-center gap-2">
                  <Instagram size={14} /> Instagram
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6">Legal</h4>
              <ul className="space-y-4 text-zinc-500 text-sm">
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
                <li>© 2026 Sangsang Store.</li>
              </ul>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

// --- Sub-components ---

function MainContent({ settings, portfolio, notices }: { settings: SiteSettings, portfolio: PortfolioItem[], notices: Notice[] }) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Hero Section - Redesigned for "Imagination Store" */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden pt-20">
        {/* Atmospheric Background Layers */}
        <div className="absolute inset-0 bg-purple-glow pointer-events-none z-0" />
        
        {/* Floating Creative Particles/Shapes */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                x: Math.random() * 100 + "%", 
                y: Math.random() * 100 + "%",
                opacity: 0,
                scale: 0.5
              }}
              animate={{ 
                y: [null, "-20px", "20px", "0px"],
                x: [null, "10px", "-10px", "0px"],
                opacity: [0.1, 0.3, 0.1],
                scale: [0.5, 1, 0.5],
                rotate: [0, 10, -10, 0]
              }}
              transition={{ 
                duration: 10 + Math.random() * 10, 
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 2
              }}
              className="absolute w-64 h-64 bg-brand-purple/10 blur-[80px] rounded-full"
            />
          ))}
          
          {/* Geometric Accents */}
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
            className="absolute top-1/4 -left-20 w-80 h-80 border border-brand-purple/10 rounded-full opacity-20"
          />
          <motion.div 
            animate={{ rotate: -360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] border border-brand-purple/5 rounded-[100px] opacity-10"
          />
        </div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 items-center gap-12">
          <div className="text-left">
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-3 px-4 py-2 rounded-full glass-card text-brand-purple text-xs font-bold uppercase tracking-[0.2em] mb-8"
            >
              <span className="w-2 h-2 bg-brand-purple rounded-full animate-pulse" />
              Imagination to Reality
            </motion.div>
            
            <motion.h1 
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="text-7xl md:text-9xl font-black tracking-tighter leading-[0.85] mb-8 text-glow"
            >
              상상은 <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-brand-purple to-purple-400">
                현실이 된다.
              </span>
            </motion.h1>
            
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-zinc-400 text-lg md:text-xl max-w-xl mb-12 leading-relaxed font-light"
            >
              상상점포는 당신의 머릿속에만 머물던 아이디어를 <br className="hidden md:block" />
              가장 세련되고 감각적인 비주얼로 구체화합니다. 
              우리는 단순한 디자인이 아닌, 브랜드의 영혼을 창조합니다.
            </motion.p>
            
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row items-center gap-6"
            >
              <button className="group relative w-full sm:w-auto px-10 py-5 rounded-2xl font-bold text-lg overflow-hidden transition-all active:scale-95">
                <div className="absolute inset-0 bg-brand-purple transition-transform group-hover:scale-110" />
                <div className="relative flex items-center justify-center gap-3 text-white">
                  프로젝트 시작하기 <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
              <button className="w-full sm:w-auto px-10 py-5 rounded-2xl font-bold text-lg glass-card hover:bg-white/5 transition-colors">
                포트폴리오 탐색
              </button>
            </motion.div>
          </div>
          
          {/* Visual Element - Floating "Imagination" Card */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, rotateY: 20 }}
            animate={{ scale: 1, opacity: 1, rotateY: 0 }}
            transition={{ delay: 0.6, duration: 1 }}
            className="hidden lg:block relative"
          >
            <div className="relative z-10 w-full aspect-square glass-card rounded-[40px] p-12 flex flex-col justify-between overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-brand-purple/20 blur-[100px] -mr-32 -mt-32 group-hover:bg-brand-purple/30 transition-colors" />
              
              <div className="space-y-6">
                <div className="w-16 h-16 bg-brand-purple rounded-2xl flex items-center justify-center shadow-2xl shadow-brand-purple/40">
                  <Palette size={32} className="text-white" />
                </div>
                <h3 className="text-4xl font-black tracking-tighter leading-tight">
                  CREATIVE <br />
                  SYNERGY.
                </h3>
              </div>
              
              <div className="space-y-4">
                <div className="h-1 w-20 bg-brand-purple rounded-full" />
                <p className="text-zinc-500 text-sm leading-relaxed">
                  우리는 고객의 비전과 우리의 상상력을 결합하여 <br />
                  세상에 없던 새로운 가치를 만들어냅니다.
                </p>
                <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="w-8 h-8 rounded-full border border-white/10 bg-white/5" />
                  ))}
                </div>
              </div>
            </div>
            
            {/* Decorative background circle */}
            <div className="absolute -inset-10 bg-brand-purple/5 blur-[100px] rounded-full -z-10" />
          </motion.div>
        </div>
        
        {/* Scroll Indicator */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-zinc-600"
        >
          <span className="text-[10px] uppercase tracking-[0.3em] font-bold">Scroll</span>
          <motion.div 
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-px h-12 bg-gradient-to-b from-brand-purple to-transparent"
          />
        </motion.div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-32 px-6 bg-zinc-950">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8">
            <div>
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-4">OUR SERVICES</h2>
              <p className="text-zinc-500 max-w-md">상상점포가 제공하는 전문적인 디자인 솔루션입니다.</p>
            </div>
            <div className="text-zinc-400 text-sm font-mono uppercase tracking-widest">01 / Services</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: 'Logo Design', desc: '브랜드의 첫인상을 결정짓는 감각적인 로고 디자인.', icon: Palette },
              { title: 'Web Development', desc: '최신 트렌드를 반영한 반응형 웹사이트 제작.', icon: Layout },
              { title: 'Brand Identity', desc: '통일성 있는 브랜드 아이덴티티 구축 및 가이드라인.', icon: CheckCircle2 },
            ].map((s, i) => (
              <div key={i} className="group p-10 rounded-3xl bg-zinc-900/50 border border-white/5 hover:border-brand-purple/30 transition-all duration-500">
                <div className="w-14 h-14 bg-brand-purple/10 rounded-2xl flex items-center justify-center text-brand-purple mb-8 group-hover:scale-110 transition-transform">
                  <s.icon size={28} />
                </div>
                <h3 className="text-2xl font-bold mb-4">{s.title}</h3>
                <p className="text-zinc-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio Section */}
      <section id="portfolio" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8">
            <div>
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-4">PORTFOLIO</h2>
              <p className="text-zinc-500 max-w-md">우리가 완성한 프로젝트들을 확인해보세요.</p>
            </div>
            <div className="text-zinc-400 text-sm font-mono uppercase tracking-widest">02 / Portfolio</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {portfolio.length > 0 ? portfolio.map((item) => (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="group cursor-pointer"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-3xl mb-6 bg-zinc-900">
                  <img 
                    src={item.imageUrl} 
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-black">
                      <ChevronRight size={32} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-brand-purple uppercase tracking-widest mb-2 block">{item.category}</span>
                    <h3 className="text-2xl font-bold">{item.title}</h3>
                  </div>
                  <div className="text-zinc-500 text-sm">{item.description}</div>
                </div>
              </motion.div>
            )) : (
              <div className="col-span-2 py-20 text-center text-zinc-600 border border-dashed border-zinc-800 rounded-3xl">
                등록된 포트폴리오가 없습니다.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Notice Section */}
      <section className="py-32 px-6 bg-zinc-950">
        <div className="max-w-7xl mx-auto">
          <div className="mb-20">
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter mb-4">NOTICE</h2>
            <p className="text-zinc-500">상상점포의 새로운 소식을 전해드립니다.</p>
          </div>

          <div className="space-y-4">
            {notices.map((notice) => (
              <div key={notice.id} className="p-8 rounded-2xl bg-zinc-900/30 border border-white/5 hover:bg-zinc-900/50 transition-colors">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold mb-2">{notice.title}</h3>
                    <div className="text-zinc-500 prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{notice.content}</ReactMarkdown>
                    </div>
                  </div>
                  <div className="text-zinc-600 text-sm whitespace-nowrap">
                    {notice.createdAt?.toDate().toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
            <div>
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter mb-8">LET'S WORK <br /> <span className="text-brand-purple text-glow">TOGETHER.</span></h2>
              <p className="text-zinc-400 text-lg mb-12 max-w-md leading-relaxed">
                새로운 프로젝트를 시작할 준비가 되셨나요? <br />
                지금 바로 문의하고 당신의 브랜드 가치를 높이세요.
              </p>
              
              <div className="flex flex-col gap-6">
                <a href={`mailto:${settings.contactEmail}`} className="flex items-center gap-4 group">
                  <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center text-brand-purple group-hover:bg-brand-purple group-hover:text-white transition-all">
                    <FileText size={20} />
                  </div>
                  <span className="font-bold text-lg">{settings.contactEmail}</span>
                </a>
                <a href={settings.kakaoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-4 group">
                  <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center text-brand-purple group-hover:bg-brand-purple group-hover:text-white transition-all">
                    <MessageCircle size={20} />
                  </div>
                  <span className="font-bold text-lg">KakaoTalk</span>
                </a>
                <a href={settings.instaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-4 group">
                  <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center text-brand-purple group-hover:bg-brand-purple group-hover:text-white transition-all">
                    <Instagram size={20} />
                  </div>
                  <span className="font-bold text-lg">Instagram</span>
                </a>
              </div>
            </div>

            <div className="glass-card p-10 rounded-[40px]">
              <ContactForm />
            </div>
          </div>
        </div>
      </section>
    </motion.main>
  );
}

function ContactForm() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'inquiries'), {
        ...formData,
        createdAt: Timestamp.now()
      });
      setIsSuccess(true);
      setFormData({ name: '', email: '', phone: '', message: '' });
    } catch (err) {
      console.error('Inquiry submission failed', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center py-10">
        <div className="w-20 h-20 bg-brand-purple/20 text-brand-purple rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={40} />
        </div>
        <h3 className="text-2xl font-bold mb-2">문의가 접수되었습니다!</h3>
        <p className="text-zinc-500 mb-8">빠른 시일 내에 답변 드리겠습니다.</p>
        <button 
          onClick={() => setIsSuccess(false)}
          className="text-brand-purple font-bold hover:underline"
        >
          새로운 문의 작성하기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">이름</label>
          <input 
            required
            type="text" 
            placeholder="홍길동"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:border-brand-purple outline-none transition-colors"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">이메일</label>
          <input 
            required
            type="email" 
            placeholder="example@email.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:border-brand-purple outline-none transition-colors"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">핸드폰 번호</label>
        <input 
          type="tel" 
          placeholder="010-0000-0000"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:border-brand-purple outline-none transition-colors"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">문의 내용</label>
        <textarea 
          required
          placeholder="프로젝트에 대해 설명해주세요."
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:border-brand-purple outline-none transition-colors h-40 resize-none"
        />
      </div>
      <button 
        disabled={isSubmitting}
        className="w-full bg-brand-purple text-white py-5 rounded-2xl font-bold text-lg hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:scale-100"
      >
        {isSubmitting ? '보내는 중...' : '문의 보내기'}
      </button>
    </form>
  );
}

function AdminPanel({ 
  settings, 
  portfolio, 
  notices,
  inquiries,
  updateSettings,
  addPortfolioItem,
  deletePortfolioItem,
  addNotice,
  deleteNotice,
  deleteInquiry
}: { 
  settings: SiteSettings, 
  portfolio: PortfolioItem[], 
  notices: Notice[],
  inquiries: Inquiry[],
  updateSettings: (s: Partial<SiteSettings>) => void,
  addPortfolioItem: () => void,
  deletePortfolioItem: (id: string) => void,
  addNotice: () => void,
  deleteNotice: (id: string) => void,
  deleteInquiry: (id: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'settings' | 'portfolio' | 'notices' | 'inquiries'>('settings');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="pt-32 pb-20 px-6 max-w-7xl mx-auto"
    >
      <div className="flex items-center justify-between mb-12">
        <h2 className="text-4xl font-black tracking-tighter">ADMIN DASHBOARD</h2>
        <div className="flex bg-zinc-900 p-1 rounded-xl overflow-x-auto">
          <button 
            onClick={() => setActiveTab('settings')}
            className={cn("px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'settings' ? "bg-brand-purple text-white" : "text-zinc-500 hover:text-white")}
          >
            Settings
          </button>
          <button 
            onClick={() => setActiveTab('portfolio')}
            className={cn("px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'portfolio' ? "bg-brand-purple text-white" : "text-zinc-500 hover:text-white")}
          >
            Portfolio
          </button>
          <button 
            onClick={() => setActiveTab('notices')}
            className={cn("px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'notices' ? "bg-brand-purple text-white" : "text-zinc-500 hover:text-white")}
          >
            Notices
          </button>
          <button 
            onClick={() => setActiveTab('inquiries')}
            className={cn("px-6 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap", activeTab === 'inquiries' ? "bg-brand-purple text-white" : "text-zinc-500 hover:text-white")}
          >
            Inquiries
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Stats Summary */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-8 rounded-3xl bg-zinc-900 border border-white/5">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-brand-purple/10 rounded-xl flex items-center justify-center text-brand-purple">
                <BarChart3 size={24} />
              </div>
              <div>
                <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Overview</h4>
                <p className="font-bold">Site Statistics</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 rounded-xl bg-black/20">
                <span className="text-zinc-500 text-sm">Total Projects</span>
                <span className="font-bold">{portfolio.length}</span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-xl bg-black/20">
                <span className="text-zinc-500 text-sm">Active Notices</span>
                <span className="font-bold">{notices.length}</span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-xl bg-black/20">
                <span className="text-zinc-500 text-sm">New Inquiries</span>
                <span className="font-bold text-brand-purple">{inquiries.length}</span>
              </div>
            </div>
          </div>

          <div className="p-8 rounded-3xl bg-brand-purple/10 border border-brand-purple/20">
            <h4 className="font-bold mb-2">Quick Tip</h4>
            <p className="text-zinc-400 text-sm leading-relaxed">
              모든 변경사항은 실시간으로 저장되며, 즉시 웹사이트에 반영됩니다. 
              이미지 URL은 외부 CDN 주소를 사용하세요.
            </p>
          </div>
        </div>

        {/* Tab Content */}
        <div className="lg:col-span-2">
          {activeTab === 'settings' && (
            <div className="p-8 rounded-3xl bg-zinc-900 border border-white/5 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Site Title</label>
                  <input 
                    type="text" 
                    value={settings.siteTitle}
                    onChange={(e) => updateSettings({ siteTitle: e.target.value })}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:border-brand-purple outline-none transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Accent Color</label>
                  <div className="flex gap-4">
                    <input 
                      type="color" 
                      value={settings.accentColor}
                      onChange={(e) => updateSettings({ accentColor: e.target.value })}
                      className="w-12 h-12 bg-black border border-white/10 rounded-xl cursor-pointer"
                    />
                    <input 
                      type="text" 
                      value={settings.accentColor}
                      onChange={(e) => updateSettings({ accentColor: e.target.value })}
                      className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-3 focus:border-brand-purple outline-none transition-colors"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Contact Email</label>
                  <input 
                    type="email" 
                    value={settings.contactEmail}
                    onChange={(e) => updateSettings({ contactEmail: e.target.value })}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:border-brand-purple outline-none transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Kakao URL</label>
                  <input 
                    type="text" 
                    value={settings.kakaoUrl}
                    onChange={(e) => updateSettings({ kakaoUrl: e.target.value })}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 focus:border-brand-purple outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'portfolio' && (
            <div className="space-y-6">
              <button 
                onClick={addPortfolioItem}
                className="w-full py-4 rounded-2xl border border-dashed border-zinc-700 hover:border-brand-purple hover:text-brand-purple transition-all flex items-center justify-center gap-2 font-bold"
              >
                <Plus size={20} /> Add New Project
              </button>
              
              <div className="space-y-4">
                {portfolio.map((item) => (
                  <div key={item.id} className="p-6 rounded-2xl bg-zinc-900 border border-white/5 flex items-center gap-6">
                    <img src={item.imageUrl} className="w-20 h-20 rounded-xl object-cover" alt="" referrerPolicy="no-referrer" />
                    <div className="flex-1 space-y-2">
                      <input 
                        type="text" 
                        value={item.title}
                        onChange={(e) => {
                          const newPortfolio = [...portfolio];
                          const idx = newPortfolio.findIndex(p => p.id === item.id);
                          newPortfolio[idx].title = e.target.value;
                          setDoc(doc(db, 'portfolio', item.id), newPortfolio[idx]);
                        }}
                        className="bg-transparent font-bold outline-none focus:text-brand-purple w-full"
                      />
                      <input 
                        type="text" 
                        value={item.category}
                        onChange={(e) => {
                          const newPortfolio = [...portfolio];
                          const idx = newPortfolio.findIndex(p => p.id === item.id);
                          newPortfolio[idx].category = e.target.value;
                          setDoc(doc(db, 'portfolio', item.id), newPortfolio[idx]);
                        }}
                        className="bg-transparent text-sm text-zinc-500 outline-none w-full"
                      />
                    </div>
                    <button 
                      onClick={() => deletePortfolioItem(item.id)}
                      className="p-3 text-zinc-600 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'notices' && (
            <div className="space-y-6">
              <button 
                onClick={addNotice}
                className="w-full py-4 rounded-2xl border border-dashed border-zinc-700 hover:border-brand-purple hover:text-brand-purple transition-all flex items-center justify-center gap-2 font-bold"
              >
                <Plus size={20} /> Add New Notice
              </button>

              <div className="space-y-4">
                {notices.map((notice) => (
                  <div key={notice.id} className="p-6 rounded-2xl bg-zinc-900 border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <input 
                        type="text" 
                        value={notice.title}
                        onChange={(e) => {
                          const newNotices = [...notices];
                          const idx = newNotices.findIndex(n => n.id === notice.id);
                          newNotices[idx].title = e.target.value;
                          setDoc(doc(db, 'notices', notice.id), newNotices[idx]);
                        }}
                        className="bg-transparent font-bold outline-none focus:text-brand-purple flex-1"
                      />
                      <button 
                        onClick={() => deleteNotice(notice.id)}
                        className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <textarea 
                      value={notice.content}
                      onChange={(e) => {
                        const newNotices = [...notices];
                        const idx = newNotices.findIndex(n => n.id === notice.id);
                        newNotices[idx].content = e.target.value;
                        setDoc(doc(db, 'notices', notice.id), newNotices[idx]);
                      }}
                      className="w-full bg-black/50 border border-white/5 rounded-xl p-4 text-sm text-zinc-400 outline-none focus:border-brand-purple/30 h-32 resize-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'inquiries' && (
            <div className="space-y-4">
              {inquiries.length > 0 ? inquiries.map((inquiry) => (
                <div key={inquiry.id} className="p-8 rounded-3xl bg-zinc-900 border border-white/5 space-y-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold mb-1">{inquiry.name}</h3>
                      <div className="flex flex-wrap gap-4 text-sm text-zinc-500">
                        <span className="flex items-center gap-1"><FileText size={14} /> {inquiry.email}</span>
                        <span className="flex items-center gap-1"><MessageCircle size={14} /> {inquiry.phone}</span>
                        <span className="flex items-center gap-1"><BarChart3 size={14} /> {inquiry.createdAt?.toDate().toLocaleString()}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteInquiry(inquiry.id)}
                      className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                  <div className="p-6 rounded-2xl bg-black/40 text-zinc-300 leading-relaxed">
                    {inquiry.message}
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center text-zinc-600 border border-dashed border-zinc-800 rounded-3xl">
                  접수된 문의가 없습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
