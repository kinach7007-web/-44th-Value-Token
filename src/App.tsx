import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, 
  Send, 
  History, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  Users, 
  Search,
  TrendingUp,
  LayoutDashboard,
  Settings,
  Bell,
  MessageSquare,
  Award,
  Zap,
  ChevronRight,
  Star,
  Loader2,
  Check,
  Coins,
  Trophy,
  X,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfDay, subDays, isSameDay, startOfWeek, startOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User, Transaction, INITIAL_USERS } from './types';
import confetti from 'canvas-confetti';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { collection, doc, onSnapshot, setDoc, writeBatch, query, orderBy } from 'firebase/firestore';
import { db, auth, signInAnonymously } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getUserLevel = (cumulativeValue: number) => {
  if (cumulativeValue >= 1000) return { level: 4, name: '마스터', color: 'bg-purple-100 text-purple-700 border-purple-200', emoji: '☀️' };
  if (cumulativeValue >= 100) return { level: 3, name: '프로', color: 'bg-blue-100 text-blue-700 border-blue-200', emoji: '🌳' };
  if (cumulativeValue >= 50) return { level: 2, name: '챌린저', color: 'bg-green-100 text-green-700 border-green-200', emoji: '🌸' };
  return { level: 1, name: '비기너', color: 'bg-orange-100 text-orange-700 border-orange-200', emoji: '🌱' };
};

export default function App() {
  // State
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(true);
  const [authUser, setAuthUser] = useState<any>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('currentUserId');
    } catch (e) {
      return null;
    }
  });
  
  const activeUser = useMemo(() => users.find(u => u.id === currentUserId) || users[0], [users, currentUserId]);

  // Member Selection Screen
  if (!currentUserId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100 p-4">
        <h1 className="text-2xl font-bold mb-6">멤버를 선택해주세요</h1>
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          {users.map(user => (
            <button
              key={user.id}
              onClick={() => {
                try {
                  localStorage.setItem('currentUserId', user.id);
                  window.location.reload();
                } catch (e) {
                  console.error("Failed to save to localStorage", e);
                }
              }}
              className="p-4 bg-white rounded-lg shadow hover:bg-blue-50 transition text-center"
            >
              {user.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchPos, setLaunchPos] = useState({ x: window.innerWidth / 2, y: window.innerHeight });
  const [sendTargetId, setSendTargetId] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendNote, setSendNote] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'badges'>('dashboard');
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);
  const [isLevelUpAnimating, setIsLevelUpAnimating] = useState(false);
  const [isWeeklyContributionModalOpen, setIsWeeklyContributionModalOpen] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  
  // New UI States
  const [effectToggle, setEffectToggle] = useState(false);
  const [rankingTab, setRankingTab] = useState<'weekly' | 'monthly' | 'cumulative'>('cumulative');
  const [sendAmountType, setSendAmountType] = useState<'preset' | 'custom'>('preset');
  const [selectedPresetMessage, setSelectedPresetMessage] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // AI Chat State
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'ai', content: string}[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  console.log("App component rendering. isAuthReady:", isAuthReady);

  // Firebase Sync
  const handleLogout = async () => {
    try {
      await auth.signOut();
      setCurrentUserId(null);
      setAuthUser(null);
      localStorage.removeItem('currentUserId');
      window.location.reload();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      if (snapshot.empty) {
        // Initialize users if empty
        const batch = writeBatch(db);
        INITIAL_USERS.forEach(user => {
          const userRef = doc(db, 'users', user.id);
          batch.set(userRef, user);
        });
        batch.commit().catch(err => {
          console.error("Failed to initialize users:", err);
        });
      } else {
        const fetchedUsers = snapshot.docs.map(doc => doc.data() as User);
        setUsers(fetchedUsers);
      }
    }, (error) => {
      console.error("Error fetching users:", error);
    });

    const q = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'));
    const unsubscribeTransactions = onSnapshot(q, (snapshot) => {
      const fetchedTransactions = snapshot.docs.map(doc => doc.data() as Transaction);
      setTransactions(fetchedTransactions);
    }, (error) => {
      console.error("Error fetching transactions:", error);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeTransactions();
    };
  }, [isAuthReady]);

  // Check for unconfirmed transactions for current user
  useEffect(() => {
    const unconfirmed = transactions.filter(t => t.toId === activeUser.id && t.confirmed === false);
    if (unconfirmed.length > 0) {
      setPendingTransactions(unconfirmed);
    } else {
      setPendingTransactions([]);
    }
  }, [activeUser.id, transactions]);

  // Derived stats
  const myTransactions = useMemo(() => {
    return transactions
      .filter(t => t.fromId === activeUser.id || t.toId === activeUser.id)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions, activeUser.id]);

  const stats = useMemo(() => {
    const sent = transactions
      .filter(t => t.fromId === activeUser.id)
      .reduce((acc, t) => acc + t.amount, 0);
    const received = transactions
      .filter(t => t.toId === activeUser.id)
      .reduce((acc, t) => acc + t.amount, 0);
    return { sent, received };
  }, [transactions, activeUser.id]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(startOfDay(new Date()), 6 - i);
      return {
        date: format(date, 'MM/dd'),
        rawDate: date,
        received: 0,
        sent: 0
      };
    });

    transactions.forEach(tx => {
      const txDate = startOfDay(new Date(tx.timestamp));
      const dayData = last7Days.find(d => isSameDay(d.rawDate, txDate));
      if (dayData) {
        if (tx.toId === activeUser.id) dayData.received += tx.amount;
        if (tx.fromId === activeUser.id) dayData.sent += tx.amount;
      }
    });

    return last7Days;
  }, [transactions, activeUser.id]);

  // Level calculation logic
  const calculateLevel = (cumulative: number) => {
    if (cumulative >= 1000) return 4;
    if (cumulative >= 100) return 3;
    if (cumulative >= 50) return 2;
    return 1;
  };

  const getLevelProgress = (cumulative: number) => {
    if (cumulative >= 1000) return 100;
    const levels = [0, 50, 100, 1000];
    const currentLevel = calculateLevel(cumulative);
    const min = levels[currentLevel - 1];
    const max = levels[currentLevel];
    const progress = ((cumulative - min) / (max - min)) * 100;
    return Math.min(100, Math.max(0, progress));
  };

  const getRankings = () => {
    const now = new Date();
    const startOfCurrentWeek = startOfWeek(now, { weekStartsOn: 1 });
    const startOfCurrentMonth = startOfMonth(now);

    const userScores = users.filter(u => u.id !== 'system').map(user => {
      let score = 0;
      if (rankingTab === 'cumulative') {
        score = user.cumulativeValue;
      } else {
        const relevantTransactions = transactions.filter(t => 
          t.toId === user.id && 
          t.confirmed && 
          (rankingTab === 'weekly' ? new Date(t.timestamp) >= startOfCurrentWeek : new Date(t.timestamp) >= startOfCurrentMonth)
        );
        score = relevantTransactions.reduce((sum, t) => sum + t.amount, 0);
      }
      return { ...user, score };
    });

    return userScores.sort((a, b) => b.score - a.score);
  };

  // AI Chat Handler
  const handleAIChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiLoading) return;

    const userMessage = aiInput;
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsAiLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = "gemini-3-flash-preview";
      
      const chat = ai.chats.create({
        model,
        config: {
          systemInstruction: `당신은 'Vibe Coding AI' 플랫폼의 '크랙타임' 전문 AI 상담사입니다. 
          사용자의 관점을 밝게 바꿔주고, 긍정적인 에너지를 불어넣어주는 조언을 해줍니다.
          친절하고 전문적인 어조로 답변하며, 한국어를 사용하세요.
          사용자 정보: ${activeUser.name} (ID: ${activeUser.id}, 잔액: ${activeUser.balance}만원)`
        }
      });

      const response = await chat.sendMessage({ message: userMessage });
      setAiMessages(prev => [...prev, { role: 'ai', content: response.text || '죄송합니다. 답변을 생성하지 못했습니다.' }]);
    } catch (error) {
      console.error('AI Error:', error);
      setAiMessages(prev => [...prev, { role: 'ai', content: 'AI와 연결하는 중 오류가 발생했습니다. 나중에 다시 시도해주세요.' }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const [isSending, setIsSending] = useState(false);

  // Actions
  const handleSendToken = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Get the button that triggered the submit
    const submitter = (e.nativeEvent as any).submitter as HTMLElement;
    const rect = submitter?.getBoundingClientRect();
    
    const amount = Number(sendAmount);
    const targetUser = users.find(u => u.id === sendTargetId);

    if (!targetUser || amount <= 0 || amount > activeUser.balance) {
      alert('유효하지 않은 금액이거나 잔액이 부족합니다.');
      return;
    }
    
    if (amount > 10) {
      alert('1건당 최대 10만원까지만 보낼 수 있습니다.');
      return;
    }

    setIsSending(true);

    const newTransaction: Transaction = {
      id: `tx-${Date.now()}`,
      fromId: activeUser.id,
      toId: targetUser.id,
      fromName: activeUser.name,
      toName: targetUser.name,
      amount,
      timestamp: Date.now(),
      note: sendNote || '가치 인정 토큰 전송',
      type: 'transfer',
      confirmed: false
    };

    // Update Firestore
    const batch = writeBatch(db);
    
    const txRef = doc(db, 'transactions', newTransaction.id);
    batch.set(txRef, newTransaction);
    
    const fromUserRef = doc(db, 'users', activeUser.id);
    batch.update(fromUserRef, { balance: activeUser.balance - amount });
    
    const toUserRef = doc(db, 'users', targetUser.id);
    batch.update(toUserRef, { unconfirmedValue: targetUser.unconfirmedValue + amount });
    
    try {
      console.log("Attempting batch commit. Auth state:", auth.currentUser?.uid);
      await batch.commit();
      
      // Reset form
      setIsSendModalOpen(false);
      setSendAmount('');
      setSendTargetId('');
      setSendNote('');
      setSelectedPresetMessage('');
      setCustomMessage('');
      setSearchQuery('');
      setSendAmountType('preset');
      
      // Trigger rocket effect
      triggerRocket(rect);
    } catch (err: any) {
      console.error("Failed to send token:", err);
      // Log detailed error info
      if (err.code === 'permission-denied' || (err.message && err.message.includes('permission'))) {
        alert("토큰 전송 권한이 없습니다. 관리자에게 문의하세요.");
      } else {
        alert(`토큰 전송에 실패했습니다: ${err.message}`);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmValue = async (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;

    const batch = writeBatch(db);
    
    const txRef = doc(db, 'transactions', txId);
    batch.update(txRef, { confirmed: true });

    const newCumulative = activeUser.cumulativeValue + tx.amount;
    const newLevel = calculateLevel(newCumulative);
    const levelUpOccurred = newLevel > activeUser.level;

    const userRef = doc(db, 'users', activeUser.id);
    batch.update(userRef, {
      cumulativeValue: newCumulative,
      unconfirmedValue: Math.max(0, activeUser.unconfirmedValue - tx.amount),
      level: newLevel,
      balance: activeUser.balance + tx.amount
    });

    try {
      await batch.commit();
    } catch (err: any) {
      console.error("Failed to confirm transaction:", err);
      alert(`가치 확인에 실패했습니다: ${err.message}`);
      return;
    }
    
    if (levelUpOccurred) {
      setIsLevelUpAnimating(true);
      setTimeout(() => setIsLevelUpAnimating(false), 3000);
    }
    
    if (effectToggle) {
      triggerHearts();
    } else {
      triggerFireworks();
    }
    setEffectToggle(!effectToggle);
  };

  const triggerRocket = (rect?: DOMRect) => {
    if (rect) {
      setLaunchPos({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    } else {
      setLaunchPos({ x: window.innerWidth / 2, y: window.innerHeight });
    }
    
    setIsLaunching(true);
    
    if (rect) {
      const originX = (rect.left + rect.width / 2) / window.innerWidth;
      const originY = (rect.top + rect.height / 2) / window.innerHeight;
      
      // Optimized Launch pad smoke (less particles, smaller scalar to prevent lag)
      confetti({
        particleCount: 80,
        spread: 100,
        startVelocity: 30,
        origin: { x: originX, y: originY },
        colors: ['#ffffff', '#f8fafc', '#e2e8f0'],
        scalar: 2,
        zIndex: 9998,
        disableForReducedMotion: true
      });
    }

    setTimeout(() => {
      setIsLaunching(false);
    }, 4500);
  };

  const triggerHearts = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 45, spread: 360, ticks: 100, zIndex: 100, shapes: ['circle'] as any, scalar: 1.5 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 100 * (timeLeft / duration);
      
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ['#ff4b4b', '#ff8f8f', '#ff1493']
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ['#ff4b4b', '#ff8f8f', '#ff1493']
      });
      confetti({
        ...defaults,
        particleCount: particleCount * 1.5,
        origin: { x: randomInRange(0.4, 0.6), y: Math.random() - 0.2 },
        colors: ['#ff4b4b', '#ff8f8f', '#ff1493']
      });
    }, 250);
  };

  const triggerFireworks = () => {
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 45, spread: 360, ticks: 100, zIndex: 100, scalar: 1.2 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 120 * (timeLeft / duration);
      
      // Big burst
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults,
        particleCount: particleCount * 1.5,
        origin: { x: randomInRange(0.4, 0.6), y: Math.random() - 0.2 }
      });

      // Side cannons
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 80,
        origin: { x: 0, y: 1 },
        colors: ['#6366f1', '#f43f5e', '#10b981'],
        startVelocity: 60,
        zIndex: 100
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 80,
        origin: { x: 1, y: 1 },
        colors: ['#6366f1', '#f43f5e', '#10b981'],
        startVelocity: 60,
        zIndex: 100
      });
    }, 250);
  };

  const handleMintTokens = async () => {
    const amount = 500;
    const newTransaction: Transaction = {
      id: `tx-${Date.now()}`,
      fromId: 'system',
      toId: activeUser.id,
      fromName: 'Vibe AI',
      toName: activeUser.name,
      amount,
      timestamp: Date.now(),
      note: '협업 기여 보상 지급',
      type: 'system',
      confirmed: true
    };

    const batch = writeBatch(db);
    
    const txRef = doc(db, 'transactions', newTransaction.id);
    batch.set(txRef, newTransaction);
    
    const userRef = doc(db, 'users', activeUser.id);
    batch.update(userRef, { balance: activeUser.balance + amount });
    
    try {
      await batch.commit();
    } catch (err: any) {
      console.error("Failed to mint token:", err);
      alert(`보상 지급에 실패했습니다: ${err.message}`);
    }
  };

  const handleConfirmTransactions = async () => {
    const batch = writeBatch(db);
    let totalAmountConfirmed = 0;
    
    transactions.forEach(t => {
      if (t.toId === activeUser.id && t.confirmed === false) {
        totalAmountConfirmed += t.amount;
        const txRef = doc(db, 'transactions', t.id);
        batch.update(txRef, { confirmed: true });
      }
    });
    
    const newCumulative = activeUser.cumulativeValue + totalAmountConfirmed;
    const newLevel = calculateLevel(newCumulative);
    const levelUpOccurred = newLevel > activeUser.level;

    const userRef = doc(db, 'users', activeUser.id);
    batch.update(userRef, {
      cumulativeValue: newCumulative,
      unconfirmedValue: Math.max(0, activeUser.unconfirmedValue - totalAmountConfirmed),
      level: newLevel,
      balance: activeUser.balance + totalAmountConfirmed
    });

    try {
      await batch.commit();
      setPendingTransactions([]);
    } catch (err: any) {
      console.error("Failed to confirm all transactions:", err);
      alert(`가치 확인에 실패했습니다: ${err.message}`);
      return;
    }

    if (levelUpOccurred) {
      setIsLevelUpAnimating(true);
      setTimeout(() => setIsLevelUpAnimating(false), 3000);
    }

    // Trigger dramatic fireworks launching from bottom corners
    const duration = 7 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 60, spread: 70, ticks: 120, zIndex: 100, colors: ['#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#10b981'] };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    // Initial powerful launch from both corners
    confetti({
      ...defaults,
      particleCount: 80,
      angle: 60,
      origin: { x: 0, y: 1 },
      scalar: 1.2
    });
    confetti({
      ...defaults,
      particleCount: 80,
      angle: 120,
      origin: { x: 1, y: 1 },
      scalar: 1.2
    });

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      // Launch from bottom left
      confetti({ 
        ...defaults, 
        particleCount: 25, 
        angle: randomInRange(55, 65),
        origin: { x: 0, y: 1 },
        gravity: 1,
        drift: randomInRange(0, 0.5)
      });
      
      // Launch from bottom right
      confetti({ 
        ...defaults, 
        particleCount: 25, 
        angle: randomInRange(115, 125),
        origin: { x: 1, y: 1 },
        gravity: 1,
        drift: randomInRange(-0.5, 0)
      });

      // Occasional center burst for extra drama
      if (Math.random() > 0.8) {
        confetti({
          ...defaults,
          particleCount: 40,
          startVelocity: 35,
          origin: { x: 0.5, y: 0.7 },
          scalar: 1.5,
          shapes: ['star']
        });
      }
    }, 250);
  };

  // Calculate weekly top contributors and receivers
  const weeklyStats = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday start
    const weeklyTransactions = transactions.filter(t => t.timestamp >= weekStart.getTime());
    
    const userStats = users.filter(u => u.id !== 'system').map(u => {
      const sent = weeklyTransactions
        .filter(t => t.fromId === u.id)
        .reduce((sum, t) => sum + t.amount, 0);
      const received = weeklyTransactions
        .filter(t => t.toId === u.id)
        .reduce((sum, t) => sum + t.amount, 0);
      return { ...u, sent, received };
    });

    const topContributors = [...userStats].sort((a, b) => b.sent - a.sent).slice(0, 3);
    const topReceivers = [...userStats].sort((a, b) => b.received - a.received).slice(0, 3);

    return { topContributors, topReceivers };
  }, [transactions, users]);

  const currentLevel = getUserLevel(activeUser.cumulativeValue);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-100 via-indigo-50 to-orange-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-indigo-600" size={48} />
          <p className="text-gray-500 font-medium animate-pulse">데이터를 불러오는 중입니다...</p>
        </div>
      </div>
    );
  }

  if (!currentUserId) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-gradient-to-b from-blue-100 via-indigo-50 to-orange-50 p-4">
        {/* Dreamy Background Elements */}
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-yellow-300 to-orange-400 blur-[120px] opacity-70 pointer-events-none" />
        <div className="absolute top-[15%] left-[-10%] w-[600px] h-[300px] rounded-full bg-white blur-[80px] opacity-90 pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[10%] w-[600px] h-[400px] rounded-full bg-pink-200 blur-[120px] opacity-50 pointer-events-none" />
        
        <div className="bg-white/80 backdrop-blur-xl p-8 rounded-[2rem] shadow-xl w-full max-w-md text-center relative z-10 border border-white/50">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200">
            <Coins size={32} fill="white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">가치토큰 놀이</h1>
          <p className="text-gray-500 mb-8 font-medium">로그인할 프로필을 선택해주세요</p>
          
          <div className="space-y-3">
            {users.filter(u => u.id !== 'system').map(u => (
              <button
                key={u.id}
                onClick={() => setCurrentUserId(u.id)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-2xl shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">
                  {getUserLevel(u.cumulativeValue).emoji}
                </div>
                <div className="text-left flex-1">
                  <p className="font-bold text-gray-900 text-lg">{u.name}</p>
                  <p className="text-xs text-gray-400 font-mono">ID: {u.id}</p>
                </div>
                <ChevronRight className="text-gray-300 group-hover:text-indigo-600 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-blue-100 via-indigo-50 to-orange-50 text-[#1A1A1A] font-sans selection:bg-indigo-100">
      {/* Level Up Animation Overlay */}
      <AnimatePresence>
        {isLevelUpAnimating && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ 
              opacity: [0, 1, 1, 0], 
              scale: [0.5, 1.2, 1, 1.5],
              rotate: [0, -5, 5, 0]
            }}
            exit={{ opacity: 0, scale: 2 }}
            transition={{ duration: 3, times: [0, 0.2, 0.8, 1] }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 bg-white/40 backdrop-blur-sm" />
            <motion.h1 
              animate={{ 
                textShadow: [
                  "0 0 20px #fff, 0 0 40px #ff0, 0 0 80px #ff0",
                  "0 0 40px #fff, 0 0 80px #f0f, 0 0 120px #f0f",
                  "0 0 20px #fff, 0 0 40px #0ff, 0 0 80px #0ff",
                  "0 0 20px #fff, 0 0 40px #ff0, 0 0 80px #ff0"
                ]
              }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-7xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 relative z-10 drop-shadow-2xl"
              style={{ WebkitTextStroke: '2px white' }}
            >
              LEVEL UP!
            </motion.h1>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dreamy Background Elements */}
      <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-yellow-300 to-orange-400 blur-[120px] opacity-70 pointer-events-none" />
      <div className="absolute top-[15%] left-[-10%] w-[600px] h-[300px] rounded-full bg-white blur-[80px] opacity-90 pointer-events-none" />
      <div className="absolute top-[45%] right-[-10%] w-[500px] h-[250px] rounded-full bg-white blur-[80px] opacity-80 pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[10%] w-[600px] h-[400px] rounded-full bg-pink-200 blur-[120px] opacity-50 pointer-events-none" />
      <div className="absolute top-[30%] left-[40%] w-[300px] h-[300px] rounded-full bg-blue-200 blur-[100px] opacity-60 pointer-events-none" />

      {/* Main Content */}
      <main className="relative z-10 p-4 lg:p-10 pb-10 max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col items-center justify-center mb-10 relative">
          <div className="absolute right-0 top-0 flex items-center gap-4">
            <button className="p-3 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all relative">
              <Bell size={20} />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
          
          <div className="text-center mt-4">
            <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-2">
              44기 마스터마인드 가치토큰 놀이
            </h1>
            <p className="text-gray-500 text-sm md:text-base font-medium mb-6">
              44기 대표님들 다같이 성공합시다!!
            </p>
            
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button 
                onClick={() => setIsLevelModalOpen(true)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-full border shadow-sm hover:shadow-md transition-all",
                  currentLevel.color
                )}
              >
                <Trophy size={16} />
                <span className="font-bold">레벨안내</span>
              </button>

              <button 
                onClick={() => setIsWeeklyContributionModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm hover:shadow-md transition-all"
              >
                <TrendingUp size={16} />
                <span className="font-bold">주간기여도</span>
              </button>

              <button 
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm hover:shadow-md hover:bg-gray-50 transition-all"
              >
                <LogOut size={16} />
                <span className="font-bold">로그아웃</span>
              </button>
            </div>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr] gap-8 items-start">
            {/* Left Column: User Profile & Level */}
            <div className="flex flex-col gap-6">
              <div className="bg-purple-50/80 backdrop-blur-xl p-6 rounded-[2.5rem] border border-purple-100/50 shadow-sm flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-[1.5rem] shadow-xl border-4 border-white bg-gray-50 flex items-center justify-center text-4xl">
                    {getUserLevel(activeUser.cumulativeValue).emoji}
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white w-8 h-8 rounded-xl flex items-center justify-center font-black shadow-lg text-xs">
                    Lv.{getUserLevel(activeUser.cumulativeValue).level}
                  </div>
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-1">{activeUser.name}</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-5">Professional Contributor</p>
                
                <div className="w-full space-y-3">
                  <div className="bg-indigo-50 p-3 rounded-2xl">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">지금까지 받은 금액</p>
                    <p className="text-xl font-black text-indigo-600">{activeUser.cumulativeValue.toLocaleString()} 만원</p>
                    <p className="text-[9px] font-bold text-indigo-400 mt-1">받은 확정된 가치</p>
                  </div>
                  
                  <div className="text-left px-1">
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                      <span>{activeUser.level < 5 ? `Next Level (Lv.${activeUser.level + 1})` : 'Max Level'}</span>
                      <span>{Math.round(getLevelProgress(activeUser.cumulativeValue))}%</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${getLevelProgress(activeUser.cumulativeValue)}%` }}
                        className="bg-indigo-600 h-full rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-pink-100/80 backdrop-blur-xl p-6 rounded-[2.5rem] text-pink-900 relative overflow-hidden shadow-xl shadow-pink-100/50 border border-pink-200/50 flex flex-col h-full min-h-[250px]">
                <div className="relative z-10 flex-1 flex flex-col">
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-80 mb-1.5">도착한 토큰</p>
                  <p className="text-3xl font-black mb-1">{activeUser.unconfirmedValue.toLocaleString()} 만원</p>
                  <p className="text-xs font-medium opacity-80 mb-5">아직 확정되지 않은 가치</p>
                  
                  <div className="space-y-2.5 mt-auto max-h-[180px] overflow-y-auto custom-scrollbar pr-2">
                    {transactions.filter(t => t.toId === activeUser.id && !t.confirmed).length === 0 ? (
                      <div className="text-center py-3 bg-pink-200/50 rounded-2xl">
                        <p className="text-xs font-medium opacity-80">도착한 토큰이 없습니다.</p>
                      </div>
                    ) : (
                      transactions.filter(t => t.toId === activeUser.id && !t.confirmed).map(tx => (
                        <motion.button 
                          key={tx.id}
                          onClick={() => handleConfirmValue(tx.id)}
                          animate={{ 
                            backgroundColor: ["rgba(255,255,255,0.5)", "rgba(255,255,255,0.95)", "rgba(255,255,255,0.5)"],
                            borderColor: ["rgba(244,114,182,0.3)", "rgba(244,114,182,0.8)", "rgba(244,114,182,0.3)"],
                            boxShadow: ["0px 0px 0px rgba(244,114,182,0)", "0px 0px 20px rgba(244,114,182,0.6)", "0px 0px 0px rgba(244,114,182,0)"]
                          }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
                          className="w-full text-pink-900 p-3 rounded-2xl font-bold transition-all flex justify-between items-center group backdrop-blur-sm border-2 relative overflow-hidden"
                        >
                          {/* Notification Ping Dot */}
                          <div className="absolute top-2 right-2 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-pink-500"></span>
                          </div>

                          <div className="relative z-10 flex flex-col items-start pr-2">
                            <span className="text-[10px] font-bold opacity-80 mb-0.5">{tx.fromName}님이 보냄</span>
                            <span className="text-xs line-clamp-1 text-left leading-relaxed">"{tx.note}"</span>
                          </div>
                          <div className="relative z-10 flex items-center gap-2 shrink-0 mr-3">
                            <span className="text-base font-black">{tx.amount}만원</span>
                            <div className="w-6 h-6 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                              <Check size={12} strokeWidth={3} />
                            </div>
                          </div>
                        </motion.button>
                      ))
                    )}
                  </div>
                </div>
                <Award className="absolute -right-4 -bottom-4 opacity-10 pointer-events-none" size={120} />
              </div>
            </div>

            {/* Center Column: Send Value Form */}
            <div>
              <div className="bg-gradient-to-br from-red-100/80 via-yellow-100/80 to-blue-100/80 backdrop-blur-xl p-10 rounded-[3rem] border border-white/50 shadow-sm">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                    <Send size={20} />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">가치 전달하기</h3>
                </div>

                <form onSubmit={handleSendToken} className="space-y-8">
                  <div>
                    <label className="block text-sm font-black text-gray-900 mb-4">누구의 가치를 인정하시나요?</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                      {users
                        .filter(u => u.id !== activeUser.id && u.id !== 'system')
                        .map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setSendTargetId(u.id)}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-2xl border-2 transition-all text-left",
                              sendTargetId === u.id 
                                ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/20" 
                                : "border-gray-50 bg-gray-50 hover:border-indigo-200"
                            )}
                          >
                            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-base shadow-sm border border-gray-100 shrink-0">
                              {getUserLevel(u.cumulativeValue).emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-gray-900 text-xs truncate">{u.name}</p>
                              <p className="text-[9px] text-gray-400 font-bold uppercase truncate">Lv.{getUserLevel(u.cumulativeValue).level}</p>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-black text-gray-900 mb-4">금액 선택 (만원)</label>
                    <div className="grid grid-cols-5 gap-3">
                      {[1, 3, 5, 7, 10].map(amount => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => {
                            setSendAmountType('preset');
                            setSendAmount(amount.toString());
                          }}
                          className={cn(
                            "py-4 rounded-2xl border-2 font-black transition-all",
                            sendAmountType === 'preset' && sendAmount === amount.toString() ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-50 bg-gray-50 text-gray-400 hover:border-indigo-200"
                          )}
                        >
                          {amount}만
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-black text-gray-900 mb-4">☆ 어떤 가치였나요? (선택)</label>
                    <div className="space-y-2 mb-4">
                      {[
                        "코칭 세션이 큰 도움이 됐어요!",
                        "빠른 피드백 덕분에 방향을 잡았어요!",
                        "통찰력 있는 조언이 문제 해결에 도움됐어요!",
                        "실행 가능한 구체적 방법을 제시해줘서 좋았어요!"
                      ].map(msg => (
                        <label key={msg} className={cn(
                          "flex items-center p-4 rounded-2xl border-2 cursor-pointer transition-all",
                          selectedPresetMessage === msg ? "border-indigo-600 bg-indigo-50" : "border-gray-50 hover:border-indigo-200 bg-gray-50"
                        )}>
                          <input 
                            type="radio" 
                            name="messagePreset" 
                            value={msg}
                            checked={selectedPresetMessage === msg}
                            onChange={() => {
                              setSelectedPresetMessage(msg);
                              setSendNote(msg);
                            }}
                            className="hidden"
                          />
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center",
                            selectedPresetMessage === msg ? "border-indigo-600" : "border-gray-300"
                          )}>
                            {selectedPresetMessage === msg && <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />}
                          </div>
                          <span className={cn("text-sm font-bold", selectedPresetMessage === msg ? "text-indigo-900" : "text-gray-600")}>{msg}</span>
                        </label>
                      ))}
                      
                      <label className={cn(
                        "flex items-center p-4 rounded-2xl border-2 cursor-pointer transition-all",
                        selectedPresetMessage === 'custom' ? "border-indigo-600 bg-indigo-50" : "border-gray-50 hover:border-indigo-200 bg-gray-50"
                      )}>
                        <input 
                          type="radio" 
                          name="messagePreset" 
                          value="custom"
                          checked={selectedPresetMessage === 'custom'}
                          onChange={() => {
                            setSelectedPresetMessage('custom');
                            setSendNote(customMessage);
                          }}
                          className="hidden"
                        />
                        <div className={cn(
                          "w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center",
                          selectedPresetMessage === 'custom' ? "border-indigo-600" : "border-gray-300"
                        )}>
                          {selectedPresetMessage === 'custom' && <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />}
                        </div>
                        <span className={cn("text-sm font-bold", selectedPresetMessage === 'custom' ? "text-indigo-900" : "text-gray-600")}>직접 입력</span>
                      </label>
                    </div>

                    {selectedPresetMessage === 'custom' && (
                      <textarea 
                        value={customMessage}
                        onChange={(e) => {
                          setCustomMessage(e.target.value);
                          setSendNote(e.target.value);
                        }}
                        placeholder="직접 메시지를 입력하세요..."
                        className="w-full bg-gray-50 border-2 border-indigo-600 rounded-2xl p-5 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium text-sm h-24 resize-none"
                      />
                    )}
                  </div>

                  <button 
                    type="submit"
                    disabled={!sendTargetId || !sendAmount || !sendNote || isSending}
                    className="w-full bg-indigo-600 text-white py-6 rounded-[2rem] font-black text-xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:bg-gray-300 flex items-center justify-center"
                  >
                    {isSending ? <Loader2 className="animate-spin" size={24} /> : '가치 인정하기'}
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Logs & Ranking */}
            <div className="flex flex-col gap-6">
              {/* Real-time Token Transfer Status */}
              <div className="bg-blue-50/80 backdrop-blur-xl rounded-[2rem] border border-blue-100/50 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-black text-gray-900">실시간 토큰전달현황</h3>
                  <div className="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center">
                    <History size={12} className="text-indigo-600" />
                  </div>
                </div>
                <div className="divide-y divide-gray-50 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                  {transactions.filter(t => isSameDay(new Date(t.timestamp), new Date())).length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">오늘 전달된 토큰이 없습니다.</p>
                  ) : (
                    transactions
                      .filter(t => isSameDay(new Date(t.timestamp), new Date()))
                      .slice(0, 10)
                      .map(tx => (
                        <div key={tx.id} className="py-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black text-indigo-600">{tx.fromName}</span>
                              <ChevronRight size={8} className="text-gray-300" />
                              <span className="text-[10px] font-black text-emerald-600">{tx.toName}</span>
                            </div>
                            <span className="text-[9px] font-bold text-gray-400">{format(tx.timestamp, 'HH:mm', { locale: ko })}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] text-gray-500 line-clamp-1 flex-1 pr-2">"{tx.note}"</p>
                            <span className="text-xs font-black text-gray-900 whitespace-nowrap">{tx.amount}만원</span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Contribution Ranking */}
              <div className="bg-red-50/80 backdrop-blur-xl rounded-[2rem] border border-red-100/50 shadow-sm p-5 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-black text-gray-900">기여순위</h3>
                  <TrendingUp size={12} className="text-gray-400" />
                </div>
                
                <div className="flex bg-gray-50 p-1 rounded-xl mb-3">
                  {(['weekly', 'monthly', 'cumulative'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setRankingTab(tab)}
                      className={cn(
                        "flex-1 py-1 text-[9px] font-bold rounded-lg transition-all",
                        rankingTab === tab ? "bg-white text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                      )}
                    >
                      {tab === 'weekly' ? '주간' : tab === 'monthly' ? '월간' : '누적'}
                    </button>
                  ))}
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pr-2">
                  {getRankings()
                    .map((user, i) => (
                      <div key={user.id} className="flex flex-col p-2.5 rounded-2xl bg-gray-50 hover:bg-indigo-50/50 transition-all border border-transparent hover:border-indigo-100">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={cn(
                            "w-4 h-4 rounded-md flex items-center justify-center text-[8px] font-black shadow-sm shrink-0",
                            i === 0 ? "bg-amber-100 text-amber-600" : 
                            i === 1 ? "bg-gray-200 text-gray-600" : 
                            i === 2 ? "bg-orange-100 text-orange-600" : "bg-white text-gray-400"
                          )}>
                            {i + 1}
                          </span>
                          <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-xs shadow-sm border border-gray-100 shrink-0">
                            {getUserLevel(user.cumulativeValue).emoji}
                          </div>
                          <div className="flex-1">
                            <span className="text-[10px] font-black text-gray-900 block leading-none mb-0.5">{user.name}</span>
                            <span className="text-[8px] font-bold text-indigo-500 uppercase tracking-wide">Lv.{getUserLevel(user.cumulativeValue).level}</span>
                          </div>
                        </div>
                        <div className="flex justify-end pl-8">
                          <p className="text-[10px] font-black text-indigo-600 bg-indigo-100/50 px-2 py-0.5 rounded-md">{user.score.toLocaleString()} 만원</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Send Modal */}
      <AnimatePresence>
        {isSendModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSendModalOpen(false)}
              className="absolute inset-0 bg-indigo-950/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative bg-white/90 backdrop-blur-2xl w-full max-w-md rounded-[3rem] p-10 shadow-2xl border border-white/50"
            >
              <h3 className="text-3xl font-black mb-8 tracking-tighter">가치 인정하기</h3>
              <form onSubmit={handleSendToken} className="flex flex-col gap-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Recipient</label>
                  <select 
                    required
                    value={sendTargetId}
                    onChange={(e) => setSendTargetId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-5 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-bold"
                  >
                    <option value="">팀원 선택</option>
                    {users.filter(u => u.id !== activeUser.id && u.id !== 'system').map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.id})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Amount (만원)</label>
                  <div className="relative">
                    <input 
                      required
                      type="text" 
                      placeholder="0"
                      value={sendAmount ? Number(sendAmount).toLocaleString() : ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/,/g, '');
                        if (!isNaN(Number(val))) {
                          setSendAmount(val);
                        }
                      }}
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-5 text-4xl font-black focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all tabular-nums"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-gray-300 text-xl">만원</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-3 ml-1 font-medium">현재 보유 잔액: <span className="text-indigo-600 font-bold">{activeUser.balance.toLocaleString()} 만원</span></p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Message</label>
                  <input 
                    type="text" 
                    placeholder="칭찬의 한마디를 남겨주세요"
                    value={sendNote}
                    onChange={(e) => setSendNote(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-5 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium"
                  />
                </div>

                <div className="flex gap-4 mt-6">
                  <button 
                    type="button"
                    onClick={() => setIsSendModalOpen(false)}
                    className="flex-1 py-5 font-black text-gray-400 hover:bg-gray-50 rounded-2xl transition-all"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    disabled={isSending}
                    className="flex-[2] bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center"
                  >
                    {isSending ? <Loader2 className="animate-spin" size={24} /> : '보내기'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Optimized Rocket Launch Animation */}
      <AnimatePresence>
        {isLaunching && (
          <motion.div
            initial={{ top: launchPos.y, left: launchPos.x, scale: 1, opacity: 1 }}
            animate={{ top: -200, scale: 1.5, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 4, ease: "easeInOut" }}
            className="fixed z-[9999] pointer-events-none drop-shadow-xl -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
            style={{ willChange: 'transform, top' }}
          >
            <div className="relative flex flex-col items-center">
              {/* Rocket pointing straight up - reduced size */}
              <span className="text-5xl inline-block -rotate-45 relative z-10">🚀</span>
              
              {/* Simplified Continuous Smoke and Fire Trail for better performance */}
              <motion.div 
                initial={{ height: 0, opacity: 1 }}
                animate={{ height: 400, opacity: 0 }}
                transition={{ duration: 4, delay: 0.1 }}
                className="absolute top-[80%] flex flex-col items-center w-16"
              >
                {/* Engine Fire - smaller blur */}
                <div className="w-6 h-12 bg-gradient-to-b from-yellow-200 via-orange-500 to-red-500 rounded-full blur-sm animate-pulse z-20" />
                
                {/* Simplified Smoke Trail - removed extreme blurs that cause lag */}
                <div className="absolute top-6 w-12 h-full bg-gradient-to-b from-white via-gray-200 to-transparent rounded-full blur-md opacity-80 z-10" />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level Modal */}
      <AnimatePresence>
        {isLevelModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setIsLevelModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl w-full max-w-md relative overflow-hidden z-10 border border-white/50"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <Trophy className="text-indigo-600" />
                  가치토큰 레벨 시스템
                </h3>
                <button 
                  onClick={() => setIsLevelModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-orange-50 border border-orange-100">
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-black text-2xl">🌱</div>
                  <div>
                    <h4 className="font-bold text-orange-900">Lv.1 비기너 (1만원~50만원)</h4>
                    <p className="text-sm text-orange-700/80">가치토큰 놀이를 막 시작한 단계입니다.</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-green-50 border border-green-100">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-black text-2xl">🌸</div>
                  <div>
                    <h4 className="font-bold text-green-900">Lv.2 챌린저 (50만원~100만원)</h4>
                    <p className="text-sm text-green-700/80">적극적으로 가치를 나누기 시작한 단계입니다.</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-blue-50 border border-blue-100">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black text-2xl">🌳</div>
                  <div>
                    <h4 className="font-bold text-blue-900">Lv.3 프로 (100만원~1000만원)</h4>
                    <p className="text-sm text-blue-700/80">팀원들에게 큰 영향을 미치는 핵심 멤버입니다.</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-purple-50 border border-purple-100">
                  <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-black text-2xl">☀️</div>
                  <div>
                    <h4 className="font-bold text-purple-900">Lv.4 마스터 (1000만원~1억)</h4>
                    <p className="text-sm text-purple-700/80">최고의 가치를 창출하는 마스터마인드입니다.</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-gray-50 border-t border-gray-100">
                <button 
                  onClick={() => setIsLevelModalOpen(false)}
                  className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors"
                >
                  확인
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Weekly Contribution Modal */}
      <AnimatePresence>
        {isWeeklyContributionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setIsWeeklyContributionModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl w-full max-w-lg relative overflow-hidden z-10 border border-white/50"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                  <TrendingUp className="text-indigo-600" />
                  주간 기여도 TOP 3
                </h3>
                <button 
                  onClick={() => setIsWeeklyContributionModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Top Contributors */}
                <div>
                  <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Send size={14} className="text-indigo-500" />
                    기여 준 사람 TOP 3
                  </h4>
                  <div className="space-y-3">
                    {weeklyStats.topContributors.map((user, idx) => (
                      <div key={user.id} className="flex items-center gap-4 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-black text-sm",
                          idx === 0 ? "bg-amber-100 text-amber-600" :
                          idx === 1 ? "bg-gray-200 text-gray-600" :
                          "bg-orange-100 text-orange-600"
                        )}>
                          {idx + 1}
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm border border-gray-100">
                          {getUserLevel(user.cumulativeValue).emoji}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-500">총 {user.sent.toLocaleString()} 만원 기여</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Receivers */}
                <div>
                  <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Award size={14} className="text-emerald-500" />
                    기여 받은 사람 TOP 3
                  </h4>
                  <div className="space-y-3">
                    {weeklyStats.topReceivers.map((user, idx) => (
                      <div key={user.id} className="flex items-center gap-4 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-black text-sm",
                          idx === 0 ? "bg-amber-100 text-amber-600" :
                          idx === 1 ? "bg-gray-200 text-gray-600" :
                          "bg-orange-100 text-orange-600"
                        )}>
                          {idx + 1}
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm border border-gray-100">
                          {getUserLevel(user.cumulativeValue).emoji}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-500">총 {user.received.toLocaleString()} 만원 받음</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
