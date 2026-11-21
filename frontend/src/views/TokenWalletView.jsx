import React, { useState, useEffect } from 'react';
import { Coins, ShoppingBag, TrendingUp, Zap, AlertCircle, CheckCircle, Loader } from 'lucide-react';

const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export default function TokenWalletView({ onNavigate }) {
  const [userId] = useState('user_' + Math.random().toString(36).slice(2, 8));
  const [wallet, setWallet] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [buyAmount, setBuyAmount] = useState(1000);
  const [mintProfit, setMintProfit] = useState(500);
  const [spendTokens, setSpendTokens] = useState(5);
  const [spendDesc, setSpendDesc] = useState('Premium analytics report');

  const fetchWallet = async () => {
    try {
      const r = await fetch(`${API}/tokens/wallet/${userId}`);
      const d = await r.json();
      if (d.success) setWallet(d.wallet);
    } catch {}
  };

  const fetchSummary = async () => {
    try {
      const r = await fetch(`${API}/tokens/summary`);
      const d = await r.json();
      if (d.success) setSummary(d.economy);
    } catch {}
  };

  useEffect(() => {
    fetchWallet();
    fetchSummary();
    const t = setInterval(() => { fetchWallet(); fetchSummary(); }, 10000);
    return () => clearInterval(t);
  }, []);

  const showMsg = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleBuyGold = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/tokens/buy-gold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amountINR: buyAmount })
      });
      const d = await r.json();
      if (!d.success) return showMsg(d.error, false);

      // Simulate payment verification (in real app: open Razorpay checkout)
      const verifyR = await fetch(`${API}/tokens/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          razorpay_order_id: d.order.id,
          razorpay_payment_id: 'pay_demo_' + Date.now(),
          razorpay_signature: 'demo_sig',  // real app: from Razorpay checkout callback
          amountINR: buyAmount
        })
      });
      const vd = await verifyR.json();
      showMsg(vd.message || vd.error, vd.success);
      await fetchWallet();
    } catch (e) {
      showMsg('Error: ' + e.message, false);
    } finally {
      setLoading(false);
    }
  };

  const handleMintTokens = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/tokens/mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, profitINR: mintProfit })
      });
      const d = await r.json();
      showMsg(d.message || d.error, d.success);
      await fetchWallet();
    } catch (e) {
      showMsg('Error: ' + e.message, false);
    } finally {
      setLoading(false);
    }
  };

  const handleSpendTokens = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/tokens/spend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tokens: spendTokens, description: spendDesc })
      });
      const d = await r.json();
      showMsg(d.message || d.error, d.success);
      await fetchWallet();
    } catch (e) {
      showMsg('Error: ' + e.message, false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
          <Coins className="w-6 h-6 text-amber-400" /> PRISM Token Economy
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Buy gold with Razorpay → Trade on MCX → Convert profits into PRISM tokens → Spend anywhere
        </p>
      </div>

      {/* Notification */}
      {msg && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${msg.ok ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-500/30' : 'bg-rose-900/60 text-rose-200 border border-rose-500/30'}`}>
          {msg.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Wallet Card */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Gold Held', value: wallet ? `${wallet.goldGrams}g` : '—', sub: wallet ? `≈ ₹${wallet.goldValueINR?.toLocaleString()}` : '', icon: TrendingUp, color: 'amber' },
          { label: 'PRISM Tokens', value: wallet ? wallet.PRISM_tokens ?? wallet.tokens ?? 0 : '—', sub: wallet ? `≈ ₹${((wallet.PRISM_tokens ?? 0) * 100).toLocaleString()}` : '', icon: Coins, color: 'violet' },
          { label: 'Invested', value: wallet ? `₹${wallet.investedINR?.toLocaleString()}` : '—', sub: 'Total INR', icon: Zap, color: 'sky' },
          { label: 'Platform Users', value: summary ? summary.totalUsers : '—', sub: summary ? `${summary.totalTokensCirculating} PRISM total` : '', icon: ShoppingBag, color: 'emerald' }
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`w-4 h-4 text-${color}-400`} />
              <span className="text-xs text-slate-400 uppercase font-bold">{label}</span>
            </div>
            <div className={`text-xl font-extrabold text-${color}-300`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="bg-slate-900/60 border border-amber-500/20 rounded-xl p-5">
        <h2 className="text-sm font-bold text-amber-300 mb-3 uppercase tracking-wider">How it works</h2>
        <div className="flex flex-col sm:flex-row gap-3 text-xs text-slate-300">
          {['1. Pay in INR via Razorpay → Gold credited to your wallet', '2. Use GoldPrism analytics to find profitable gold trades', '3. Profits auto-converted: ₹100 profit = 1 PRISM token', '4. Spend PRISM tokens on reports, signals, premium features'].map((s, i) => (
            <div key={i} className="flex-1 bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">{s}</div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Buy Gold */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-amber-400" /> Buy Gold</h3>
          <p className="text-xs text-slate-400">Pay via Razorpay. Gold credited instantly at ₹8,500/g.</p>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount (INR)</label>
            <input type="number" min={100} value={buyAmount} onChange={e => setBuyAmount(+e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
          </div>
          <div className="text-xs text-slate-500">≈ {(buyAmount / 8500).toFixed(4)}g of gold</div>
          <button onClick={handleBuyGold} disabled={loading}
            className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : null} Pay ₹{buyAmount} via Razorpay
          </button>
        </div>

        {/* Mint Tokens */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm flex items-center gap-2"><Coins className="w-4 h-4 text-violet-400" /> Mint PRISM Tokens</h3>
          <p className="text-xs text-slate-400">Convert gold trading profits into PRISM tokens. ₹100 profit = 1 token.</p>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Profit (INR)</label>
            <input type="number" min={100} value={mintProfit} onChange={e => setMintProfit(+e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500" />
          </div>
          <div className="text-xs text-slate-500">= {Math.floor(mintProfit / 100)} PRISM tokens</div>
          <button onClick={handleMintTokens} disabled={loading}
            className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : null} Mint Tokens
          </button>
        </div>

        {/* Spend Tokens */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-emerald-400" /> Spend PRISM Tokens</h3>
          <p className="text-xs text-slate-400">Use your tokens to purchase premium features, reports, or anything on the platform.</p>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tokens to spend</label>
            <input type="number" min={1} value={spendTokens} onChange={e => setSpendTokens(+e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">What to purchase</label>
            <input type="text" value={spendDesc} onChange={e => setSpendDesc(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <button onClick={handleSpendTokens} disabled={loading}
            className="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : null} Spend {spendTokens} PRISM
          </button>
        </div>
      </div>

      {/* Recent Transactions */}
      {wallet?.transactions?.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="font-bold text-white text-sm mb-3">Recent Transactions</h3>
          <div className="space-y-2">
            {wallet.transactions.slice().reverse().map((tx, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-slate-800 last:border-0">
                <span className={`font-mono px-2 py-0.5 rounded text-[10px] font-bold ${
                  tx.type === 'GOLD_PURCHASE' ? 'bg-amber-500/20 text-amber-300' :
                  tx.type === 'TOKEN_MINT' ? 'bg-violet-500/20 text-violet-300' :
                  'bg-emerald-500/20 text-emerald-300'
                }`}>{tx.type}</span>
                <span className="text-slate-300">
                  {tx.type === 'GOLD_PURCHASE' ? `₹${tx.amountINR} → ${tx.goldGrams?.toFixed(4)}g` :
                   tx.type === 'TOKEN_MINT' ? `₹${tx.profitINR} profit → ${tx.tokensMinted} PRISM` :
                   `${tx.tokensSpent} PRISM → ${tx.description}`}
                </span>
                <span className="text-slate-500">{new Date(tx.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
