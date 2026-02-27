import { useState, useEffect, useMemo, useRef, useCallback } from "react";

// ─── Supabase Config ───
const SUPABASE_URL = "https://taipasfrhybokmywgvhi.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaXBhc2ZyaHlib2tteXdndmhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMDI5MzUsImV4cCI6MjA4Nzc3ODkzNX0.DiNGtnm2-bm_JqNsUONhI6XbnsjrC2FPtRLjfN6WrT4";
const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};
const sb = async (table, method = "GET", body = null, query = "") => {
  const opts = { method, headers: { ...sbHeaders } };
  if (method === "DELETE" || method === "GET") {
    const h = { ...sbHeaders };
    delete h.Prefer;
    opts.headers = h;
  }
  if (body) opts.body = JSON.stringify(body);
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    throw new Error(`Network error: ${e.message}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (method === "DELETE") return null;
  return res.json();
};

// ─── Constants ───
const CATEGORIES = [
  { id: "groceries", name: "Groceries", icon: "🥬", color: "#4CAF50" },
  { id: "housing", name: "Housing", icon: "🏠", color: "#795548" },
  { id: "sports", name: "Sports", icon: "🏃", color: "#FF5722" },
  { id: "travel", name: "Travel", icon: "✈️", color: "#2196F3" },
  { id: "eating_out", name: "Eating Out", icon: "🍽️", color: "#E91E63" },
  { id: "shopping", name: "Shopping", icon: "🛍️", color: "#9C27B0" },
  { id: "subscriptions", name: "Subscriptions", icon: "🔄", color: "#607D8B" },
  { id: "transport", name: "Transport", icon: "🚇", color: "#FF9800" },
  { id: "income", name: "Income", icon: "💰", color: "#00C853" },
  { id: "other", name: "Other", icon: "📦", color: "#78909C" },
];

const CURRENCIES = [
  { code: "CAD", symbol: "$", name: "Canadian Dollar" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "MXN", symbol: "$", name: "Mexican Peso" },
];

const getCat = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[9];
const getCur = (code) => CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (n, cur = "CAD") => {
  const c = getCur(cur);
  const abs = Math.abs(n).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${c.symbol}${abs}`;
};
const fmtShort = (n) => {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return fmt(n);
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthKey = (d) => d.slice(0, 7);

// ─── Theme ───
const T = {
  bg: "#0D0F11", surface: "#161A1F", surfaceHover: "#1C2127",
  border: "#252B33", text: "#E8ECF0", textMuted: "#7A8694",
  accent: "#5BA4F5", accentDim: "rgba(91,164,245,0.12)",
  danger: "#F44771", success: "#34D399", income: "#34D399", expense: "#F44771",
};

const baseInput = {
  background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10,
  color: T.text, padding: "10px 14px", fontSize: 14, outline: "none",
  width: "100%", boxSizing: "border-box", transition: "border-color 0.15s",
  fontFamily: "'DM Sans', sans-serif",
};
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 6 };
const primaryBtn = {
  padding: "12px 20px", borderRadius: 10, border: "none",
  background: T.accent, color: "#fff", fontSize: 14, fontWeight: 600,
  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "opacity 0.15s",
};
const navBtn = {
  width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`,
  background: T.surface, color: T.text, fontSize: 18, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif",
};

// ─── CSV Parser via Sonnet ───
async function parseCSVWithAI(csvText) {
  const lines = csvText.trim().split("\n");
  const header = lines[0];
  const dataLines = lines.slice(1).filter(l => l.trim());
  const BATCH = 50;
  const all = [];
  for (let i = 0; i < dataLines.length; i += BATCH) {
    const batch = [header, ...dataLines.slice(i, i + BATCH)].join("\n");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 4000,
        system: `Parse this bank CSV into a JSON array of transactions. Each object: {"amount": number (negative=expense, positive=income), "description": string (clean merchant name), "category": one of groceries/housing/sports/travel/eating_out/shopping/subscriptions/transport/income/other, "currency": "CAD" default, "date": "YYYY-MM-DD"}. Clean up descriptions (e.g. "AMZN*MARKETPLACE"→"Amazon"). Infer categories intelligently. Return ONLY JSON array.`,
        messages: [{ role: "user", content: batch }],
      }),
    });
    const data = await res.json();
    const text = data.content?.map(b => b.text || "").join("") || "";
    try { const txs = JSON.parse(text.replace(/```json|```/g, "").trim()); if (Array.isArray(txs)) all.push(...txs); } catch {}
  }
  return all;
}

// ─── AI Transaction Manager ───
async function aiTransactionManager(input, transactions) {
  const td = todayStr();
  const yd = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  const txSummary = transactions.map(t => ({ id: t.id, amount: t.amount, description: t.description, category: t.category, date: t.date, currency: t.currency }));
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 2000,
      system: `You are a financial transaction assistant. Today is ${td}. Yesterday was ${yd}.
You perform 3 action types: ADD (new transactions), DELETE (by ID), UPDATE (modify fields by ID).
Categories: groceries, housing, sports, travel, eating_out, shopping, subscriptions, transport, income, other
Return ONLY JSON: {"actions":[{"type":"add","transaction":{"amount":-4.50,"description":"Coffee","category":"eating_out","currency":"CAD","date":"${td}"}},{"type":"delete","id":"xxx","reason":"..."},{"type":"update","id":"xxx","changes":{"category":"sports"}}],"summary":"Brief description"}
Rules: negative=expense, positive=income. Default CAD. Fuzzy match descriptions. If no match found, say so in summary with empty actions. No markdown.`,
      messages: [{ role: "user", content: `Transactions:\n${JSON.stringify(txSummary)}\n\nInstruction: ${input}` }],
    }),
  });
  const data = await res.json();
  const text = data.content?.map(b => b.text || "").join("") || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ─── Shared Components ───
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 2, background: T.surface, borderRadius: 12, padding: 3 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          flex: 1, padding: "10px 4px", borderRadius: 10, border: "none",
          background: active === t.id ? T.accent : "transparent",
          color: active === t.id ? "#fff" : T.textMuted,
          fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function MonthPicker({ value, onChange }) {
  const shift = (dir) => { const d = new Date(value + "-15"); d.setMonth(d.getMonth() + dir); onChange(d.toISOString().slice(0, 7)); };
  const label = new Date(value + "-15").toLocaleDateString("en-CA", { month: "long", year: "numeric" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={() => shift(-1)} style={navBtn}>‹</button>
      <span style={{ fontSize: 14, fontWeight: 600, color: T.text, minWidth: 130, textAlign: "center" }}>{label}</span>
      <button onClick={() => shift(1)} style={navBtn}>›</button>
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn 0.2s" }} onClick={onClose}>
      <div style={{ background: T.bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "88vh", overflow: "auto", padding: "20px 20px 32px", animation: "slideUp 0.25s ease-out" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: T.text, fontSize: 17, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: T.surface, color: T.textMuted, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ open, onClose, onConfirm, message }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Confirm">
      <p style={{ color: T.textMuted, fontSize: 14, margin: "0 0 20px" }}>{message}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onClose} style={{ ...primaryBtn, background: T.surface, color: T.text, flex: 1 }}>Cancel</button>
        <button onClick={onConfirm} style={{ ...primaryBtn, background: T.danger, flex: 1 }}>Delete</button>
      </div>
    </Modal>
  );
}

function SpendingBar({ spent, budget, color }) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  return (
    <div style={{ height: 6, borderRadius: 3, background: T.border, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: spent > budget && budget > 0 ? T.danger : color || T.accent, transition: "width 0.4s ease-out" }} />
    </div>
  );
}

function PieChart({ data, size = 160 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMuted, fontSize: 13 }}>No data</div>;
  const cx = size / 2, cy = size / 2, r = size / 2 - 4;
  let cum = -90;
  const slices = data.map(d => {
    const angle = (d.value / total) * 360;
    const start = cum; cum += angle;
    const s = (start * Math.PI) / 180, e = ((start + angle) * Math.PI) / 180;
    const path = data.length === 1
      ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
      : `M ${cx} ${cy} L ${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)} A ${r} ${r} 0 ${angle > 180 ? 1 : 0} 1 ${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)} Z`;
    return { ...d, path };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke={T.bg} strokeWidth={2} />)}
      <circle cx={cx} cy={cy} r={r * 0.55} fill={T.bg} />
      <text x={cx} y={cy - 6} textAnchor="middle" fill={T.text} fontSize={16} fontWeight="700" fontFamily="DM Sans">{fmt(total)}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill={T.textMuted} fontSize={10} fontFamily="DM Sans">spent</text>
    </svg>
  );
}

function DailyChart({ txs, month }) {
  const days = new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0).getDate();
  const daily = Array.from({ length: days }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { day: i + 1, total: txs.filter(t => t.date === date).reduce((s, t) => s + Math.abs(t.amount), 0) };
  });
  const max = Math.max(...daily.map(d => d.total), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100 }}>
      {daily.map(d => (
        <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }} title={`Day ${d.day}: ${fmt(d.total)}`}>
          <div style={{ width: "100%", minWidth: 3, maxWidth: 12, height: Math.max((d.total / max) * 100, d.total > 0 ? 3 : 0), borderRadius: 2, background: d.total > 0 ? T.accent : "transparent", opacity: d.total > 0 ? 0.8 : 0.2, transition: "height 0.3s" }} />
        </div>
      ))}
    </div>
  );
}

// ─── Net Worth Chart (SVG line) ───
function NetWorthChart({ snapshots }) {
  if (snapshots.length < 2) return <div style={{ color: T.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>Add at least 2 snapshots to see a chart</div>;
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map(s => s.net_worth);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 400, H = 140, pad = 30;
  const points = sorted.map((s, i) => ({
    x: pad + (i / (sorted.length - 1)) * (W - pad * 2),
    y: pad + (1 - (s.net_worth - min) / range) * (H - pad * 2),
    ...s,
  }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${line} L ${points[points.length - 1].x} ${H - pad} L ${points[0].x} ${H - pad} Z`;
  const latest = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : latest;
  const change = latest - prev;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>Net Worth</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.text }}>{fmt(latest)}</div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: change >= 0 ? T.income : T.danger }}>
          {change >= 0 ? "↑" : "↓"} {fmt(Math.abs(change))}
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        <defs><linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.accent} stopOpacity="0.3" /><stop offset="100%" stopColor={T.accent} stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#nwGrad)" />
        <path d={line} fill="none" stroke={T.accent} strokeWidth={2.5} strokeLinejoin="round" />
        {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={T.accent} stroke={T.bg} strokeWidth={2} />)}
        {points.filter((_, i) => i === 0 || i === points.length - 1 || points.length <= 6).map((p, i) => (
          <text key={i} x={p.x} y={H - 8} textAnchor="middle" fill={T.textMuted} fontSize={9} fontFamily="DM Sans">
            {new Date(p.date + "T12:00:00").toLocaleDateString("en-CA", { month: "short", year: "2-digit" })}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Transaction Form ───
function TransactionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { date: todayStr(), amount: "", description: "", category: "other", currency: "CAD", type: "expense" });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const handleSave = () => {
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt === 0) return;
    onSave({ ...form, amount: form.type === "expense" ? -Math.abs(amt) : Math.abs(amt) });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 2, background: T.surface, borderRadius: 10, padding: 3 }}>
        {["expense", "income"].map(t => (
          <button key={t} onClick={() => { upd("type", t); if (t === "income") upd("category", "income"); }}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: form.type === t ? (t === "expense" ? T.expense : T.income) : "transparent", color: form.type === t ? "#fff" : T.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>{t === "expense" ? "Expense" : "Income"}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Amount</label>
          <input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => upd("amount", e.target.value)} style={{ ...baseInput, fontSize: 22, fontWeight: 700, padding: "12px 14px" }} />
        </div>
        <div style={{ width: 90 }}>
          <label style={labelStyle}>Currency</label>
          <select value={form.currency} onChange={e => upd("currency", e.target.value)} style={{ ...baseInput, padding: "12px 8px" }}>
            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
      </div>
      <div><label style={labelStyle}>Description</label><input type="text" placeholder="Coffee, rent, freelance..." value={form.description} onChange={e => upd("description", e.target.value)} style={baseInput} /></div>
      <div><label style={labelStyle}>Date</label><input type="date" value={form.date} onChange={e => upd("date", e.target.value)} style={baseInput} /></div>
      <div>
        <label style={labelStyle}>Category</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CATEGORIES.filter(c => form.type === "income" ? c.id === "income" : c.id !== "income").map(cat => (
            <button key={cat.id} onClick={() => upd("category", cat.id)} style={{
              padding: "7px 12px", borderRadius: 8,
              border: form.category === cat.id ? `2px solid ${cat.color}` : `1px solid ${T.border}`,
              background: form.category === cat.id ? cat.color + "18" : T.surface,
              color: form.category === cat.id ? cat.color : T.textMuted,
              fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans', sans-serif",
            }}><span>{cat.icon}</span> {cat.name}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ ...primaryBtn, background: T.surface, color: T.text, flex: 1 }}>Cancel</button>
        <button onClick={handleSave} style={{ ...primaryBtn, flex: 1 }}>Save</button>
      </div>
    </div>
  );
}

// ─── Budget Form ───
function BudgetForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || { category: "groceries", amount: "" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div><label style={labelStyle}>Category</label>
        <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={baseInput}>
          {CATEGORIES.filter(c => c.id !== "income").map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select></div>
      <div><label style={labelStyle}>Monthly Budget (CAD)</label>
        <input type="number" step="1" placeholder="500" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} style={baseInput} /></div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ ...primaryBtn, background: T.surface, color: T.text, flex: 1 }}>Cancel</button>
        <button onClick={() => { if (parseFloat(form.amount) > 0) onSave({ ...form, amount: parseFloat(form.amount) }); }} style={{ ...primaryBtn, flex: 1 }}>Save</button>
      </div>
    </div>
  );
}

// ─── Net Worth Snapshot Form ───
function NetWorthForm({ initial, onSave, onCancel }) {
  const [date, setDate] = useState(initial?.date || todayStr());
  const [entries, setEntries] = useState(initial?.entries || [
    { name: "Chequing", type: "asset", value: "" },
    { name: "Savings", type: "asset", value: "" },
    { name: "TFSA", type: "asset", value: "" },
    { name: "RRSP", type: "asset", value: "" },
  ]);
  const addEntry = () => setEntries(p => [...p, { name: "", type: "asset", value: "" }]);
  const upd = (i, k, v) => setEntries(p => p.map((e, j) => j === i ? { ...e, [k]: v } : e));
  const rm = (i) => setEntries(p => p.filter((_, j) => j !== i));
  const handleSave = () => {
    const filled = entries.filter(e => e.name && parseFloat(e.value));
    const mapped = filled.map(e => ({ ...e, value: parseFloat(e.value) }));
    const assets = mapped.filter(e => e.type === "asset").reduce((s, e) => s + e.value, 0);
    const liabilities = mapped.filter(e => e.type === "liability").reduce((s, e) => s + e.value, 0);
    onSave({ date, entries: mapped, total_assets: assets, total_liabilities: liabilities, net_worth: assets - liabilities });
  };
  const totalA = entries.filter(e => e.type === "asset").reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
  const totalL = entries.filter(e => e.type === "liability").reduce((s, e) => s + (parseFloat(e.value) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div><label style={labelStyle}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={baseInput} /></div>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>Assets & Liabilities</div>
      {entries.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="text" placeholder="Name" value={e.name} onChange={ev => upd(i, "name", ev.target.value)} style={{ ...baseInput, flex: 1 }} />
          <select value={e.type} onChange={ev => upd(i, "type", ev.target.value)} style={{ ...baseInput, width: 90, padding: "10px 6px", fontSize: 12 }}>
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
          </select>
          <input type="number" placeholder="0" value={e.value} onChange={ev => upd(i, "value", ev.target.value)} style={{ ...baseInput, width: 100 }} />
          <button onClick={() => rm(i)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 18, cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
      ))}
      <button onClick={addEntry} style={{ ...primaryBtn, background: T.surface, color: T.accent, padding: "8px", fontSize: 13 }}>+ Add Line</button>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 13, color: T.textMuted }}>Assets: <strong style={{ color: T.income }}>{fmt(totalA)}</strong></span>
        <span style={{ fontSize: 13, color: T.textMuted }}>Liabilities: <strong style={{ color: T.danger }}>{fmt(totalL)}</strong></span>
        <span style={{ fontSize: 13, color: T.text, fontWeight: 700 }}>Net: {fmt(totalA - totalL)}</span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ ...primaryBtn, background: T.surface, color: T.text, flex: 1 }}>Cancel</button>
        <button onClick={handleSave} style={{ ...primaryBtn, flex: 1 }}>Save Snapshot</button>
      </div>
    </div>
  );
}

// ─── Transaction Row ───
function TransactionRow({ tx, onEdit }) {
  const cat = getCat(tx.category);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.surface, borderRadius: 12, cursor: "pointer", transition: "background 0.15s" }} onClick={() => onEdit(tx)}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: cat.color + "1A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{cat.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.description || cat.name}</div>
        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{cat.name}{tx.currency !== "CAD" ? ` · ${tx.currency}` : ""}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: tx.amount > 0 ? T.income : T.text }}>{tx.amount > 0 ? "+" : ""}{fmt(tx.amount, tx.currency)}</div>
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{tx.date}</div>
      </div>
    </div>
  );
}

// ─── CSV Import Modal ───
function CSVImportModal({ open, onClose, onImport }) {
  const [parsed, setParsed] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setParsing(true); setError(""); setParsed([]);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const txs = await parseCSVWithAI(ev.target.result);
        if (txs.length === 0) setError("No transactions found.");
        else { setParsed(txs); setSelected(new Set(txs.map((_, i) => i))); }
      } catch { setError("Failed to parse CSV."); }
      setParsing(false);
    };
    reader.readAsText(file);
  };
  const doImport = () => {
    onImport(parsed.filter((_, i) => selected.has(i)).map(t => ({ ...t, id: uid() })));
    setParsed([]); setSelected(new Set()); setError(""); onClose();
  };
  return (
    <Modal open={open} onClose={() => { if (!parsing) { onClose(); setParsed([]); setSelected(new Set()); setError(""); } }} title="Import CSV">
      <div style={{ marginBottom: 16 }}>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} disabled={parsing} style={{ ...primaryBtn, background: T.surface, color: T.text, width: "100%", opacity: parsing ? 0.5 : 1 }}>
          {parsing ? "Parsing with AI..." : "Choose CSV File"}
        </button>
      </div>
      {parsing && (
        <div style={{ textAlign: "center", padding: "24px 0", color: T.textMuted }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>✨ Categorizing your transactions...</div>
          <div style={{ width: 120, height: 3, borderRadius: 2, background: T.border, margin: "0 auto", overflow: "hidden" }}>
            <div style={{ width: "40%", height: "100%", background: T.accent, borderRadius: 2, animation: "shimmer 1.2s infinite ease-in-out" }} />
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: T.danger, marginBottom: 12 }}>{error}</div>}
      {parsed.length > 0 && (<>
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 10 }}>{parsed.length} transactions · {selected.size} selected</div>
        <div style={{ maxHeight: 300, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {parsed.map((tx, i) => {
            const cat = getCat(tx.category);
            return (
              <div key={i} onClick={() => { const s = new Set(selected); s.has(i) ? s.delete(i) : s.add(i); setSelected(s); }} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: selected.has(i) ? T.accentDim : T.surface,
                borderRadius: 8, cursor: "pointer", border: `1px solid ${selected.has(i) ? T.accent + "44" : T.border}`,
              }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected.has(i) ? T.accent : T.border}`, background: selected.has(i) ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{selected.has(i) && "✓"}</div>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{cat.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.description || "No description"}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{cat.name} · {tx.date}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: tx.amount > 0 ? T.income : T.text, flexShrink: 0 }}>{fmt(tx.amount, tx.currency)}</div>
              </div>
            );
          })}
        </div>
        <button onClick={doImport} style={{ ...primaryBtn, width: "100%", marginTop: 14 }}>Import {selected.size} Transactions</button>
      </>)}
    </Modal>
  );
}

// ─── NL Input ───
function NLInput({ transactions, onApplyActions }) {
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const handleSubmit = async () => {
    if (!input.trim() || parsing) return;
    setParsing(true); setError(""); setResult(null);
    try {
      const res = await aiTransactionManager(input.trim(), transactions);
      if (res.actions?.length > 0) setResult(res);
      else setError(res.summary || "Couldn't understand that.");
    } catch { setError("AI request failed."); }
    setParsing(false);
  };
  const confirm = () => { if (result) { onApplyActions(result.actions); setInput(""); setResult(null); } };
  const actionLabel = (a) => {
    if (a.type === "add") return { icon: "+", color: T.income, text: `Add: ${a.transaction.description} ${fmt(a.transaction.amount, a.transaction.currency)}` };
    if (a.type === "delete") return { icon: "−", color: T.danger, text: `Delete: ${a.reason || a.id}` };
    if (a.type === "update") return { icon: "✎", color: T.accent, text: `Update: ${Object.entries(a.changes || {}).map(([k, v]) => `${k} → ${v}`).join(", ")}` };
    return { icon: "?", color: T.textMuted, text: "Unknown" };
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input type="text" placeholder="coffee 4.50 · recategorize Uber as transport · delete the $50 income..."
            value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            style={{ ...baseInput, fontSize: 13, paddingLeft: 36, background: T.accentDim, borderColor: T.accent + "33" }} />
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.6 }}>✨</span>
        </div>
        <button onClick={handleSubmit} disabled={parsing || !input.trim()} style={{ ...navBtn, width: 40, height: 40, fontSize: 13, background: T.accent, color: "#fff", border: "none", opacity: parsing || !input.trim() ? 0.5 : 1 }}>
          {parsing ? "•••" : "→"}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: T.danger, marginTop: 8 }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 10, background: T.surface, borderRadius: 12, padding: 12, border: `1px solid ${T.accent}33` }}>
          <div style={{ fontSize: 13, color: T.text, marginBottom: 10, lineHeight: 1.4 }}>{result.summary}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {result.actions.map((a, i) => {
              const l = actionLabel(a);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: T.bg, borderRadius: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: l.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: l.color, flexShrink: 0 }}>{l.icon}</div>
                  <div style={{ fontSize: 12, color: T.textMuted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.text}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => { setResult(null); setInput(""); }} style={{ ...primaryBtn, background: T.bg, color: T.textMuted, flex: 1, padding: "9px 12px", fontSize: 13, border: `1px solid ${T.border}` }}>Cancel</button>
            <button onClick={confirm} style={{ ...primaryBtn, flex: 1, padding: "9px 12px", fontSize: 13 }}>Apply{result.actions.length > 1 ? ` (${result.actions.length})` : ""}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ─── MAIN APP ───
// ═══════════════════════════════════════════════════════
export default function FinanceApp() {
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState("ledger");
  const [month, setMonth] = useState(monthKey(todayStr()));
  const [showAdd, setShowAdd] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [showCSV, setShowCSV] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editBudget, setEditBudget] = useState(null);
  const [showNWForm, setShowNWForm] = useState(false);
  const [editSnap, setEditSnap] = useState(null);
  const [deleteTx, setDeleteTx] = useState(null);
  const [deleteBudget, setDeleteBudget] = useState(null);
  const [deleteSnap, setDeleteSnap] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncError, setSyncError] = useState("");

  // ── Load from Supabase ──
  useEffect(() => {
    (async () => {
      try {
        const [txs, bgs, snaps] = await Promise.all([
          sb("transactions", "GET", null, "?order=date.desc,created_at.desc"),
          sb("budgets"),
          sb("net_worth_snapshots", "GET", null, "?order=date.desc"),
        ]);
        setTransactions(txs || []);
        setBudgets(bgs || []);
        setSnapshots(snaps || []);
      } catch (e) {
        setSyncError("Load failed: " + e.message);
        console.error("Supabase load error:", e);
      }
      setLoading(false);
    })();
  }, []);

  // ── Transaction CRUD ──
  const addTx = async (tx) => {
    const newTx = { ...tx, id: uid() };
    setTransactions(p => [newTx, ...p]);
    setShowAdd(false);
    try { await sb("transactions", "POST", newTx); } catch (e) { setSyncError("Sync failed"); }
  };

  const updateTx = async (tx) => {
    setTransactions(p => p.map(t => t.id === tx.id ? tx : t));
    setEditTx(null);
    try { await sb("transactions", "PATCH", tx, `?id=eq.${tx.id}`); } catch (e) { setSyncError("Sync failed"); }
  };

  const removeTx = async (id) => {
    setTransactions(p => p.filter(t => t.id !== id));
    setDeleteTx(null); setEditTx(null);
    try { await sb("transactions", "DELETE", null, `?id=eq.${id}`); } catch (e) { setSyncError("Sync failed"); }
  };

  const importTxs = async (txs) => {
    setTransactions(p => [...txs, ...p]);
    try { await sb("transactions", "POST", txs); } catch (e) { setSyncError("Sync failed"); }
  };

  const applyActions = async (actions) => {
    const adds = [], delIds = [], updates = [];
    for (const a of actions) {
      if (a.type === "add" && a.transaction) { const t = { ...a.transaction, id: uid() }; adds.push(t); }
      else if (a.type === "delete" && a.id) delIds.push(a.id);
      else if (a.type === "update" && a.id && a.changes) updates.push(a);
    }
    setTransactions(prev => {
      let next = [...prev];
      adds.forEach(t => next.unshift(t));
      next = next.filter(t => !delIds.includes(t.id));
      updates.forEach(u => { next = next.map(t => t.id === u.id ? { ...t, ...u.changes } : t); });
      return next;
    });
    try {
      if (adds.length) await sb("transactions", "POST", adds);
      for (const id of delIds) await sb("transactions", "DELETE", null, `?id=eq.${id}`);
      for (const u of updates) await sb("transactions", "PATCH", u.changes, `?id=eq.${u.id}`);
    } catch (e) { setSyncError("Sync failed"); }
  };

  // ── Budget CRUD ──
  const saveBudget = async (b) => {
    if (editBudget) {
      const updated = { ...editBudget, ...b };
      setBudgets(p => p.map(x => x.id === editBudget.id ? updated : x));
      setEditBudget(null); setShowBudgetForm(false);
      try { await sb("budgets", "PATCH", b, `?id=eq.${editBudget.id}`); } catch (e) { setSyncError("Sync failed"); }
    } else {
      const newB = { ...b, id: uid() };
      setBudgets(p => [...p, newB]);
      setShowBudgetForm(false);
      try { await sb("budgets", "POST", newB); } catch (e) { setSyncError("Sync failed"); }
    }
  };

  const removeBudget = async (id) => {
    setBudgets(p => p.filter(b => b.id !== id));
    setDeleteBudget(null);
    try { await sb("budgets", "DELETE", null, `?id=eq.${id}`); } catch (e) { setSyncError("Sync failed"); }
  };

  // ── Net Worth CRUD ──
  const saveSnapshot = async (s) => {
    if (editSnap) {
      const updated = { ...editSnap, ...s };
      setSnapshots(p => p.map(x => x.id === editSnap.id ? updated : x));
      setEditSnap(null); setShowNWForm(false);
      try { await sb("net_worth_snapshots", "PATCH", s, `?id=eq.${editSnap.id}`); } catch (e) { setSyncError("Sync failed"); }
    } else {
      const newS = { ...s, id: uid() };
      setSnapshots(p => [newS, ...p]);
      setShowNWForm(false);
      try { await sb("net_worth_snapshots", "POST", newS); } catch (e) { setSyncError("Sync failed"); }
    }
  };

  const removeSnapshot = async (id) => {
    setSnapshots(p => p.filter(s => s.id !== id));
    setDeleteSnap(null);
    try { await sb("net_worth_snapshots", "DELETE", null, `?id=eq.${id}`); } catch (e) { setSyncError("Sync failed"); }
  };

  // ── Computed ──
  const monthTxs = useMemo(() => transactions.filter(t => monthKey(t.date) === month).sort((a, b) => b.date.localeCompare(a.date) || (b.id || "").localeCompare(a.id || "")), [transactions, month]);
  const filteredTxs = useMemo(() => {
    if (!searchQuery.trim()) return monthTxs;
    const q = searchQuery.toLowerCase();
    return monthTxs.filter(t => (t.description || "").toLowerCase().includes(q) || getCat(t.category).name.toLowerCase().includes(q));
  }, [monthTxs, searchQuery]);
  const monthIncome = useMemo(() => monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0), [monthTxs]);
  const monthExpense = useMemo(() => monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0), [monthTxs]);
  const categorySpending = useMemo(() => {
    const map = {};
    monthTxs.filter(t => t.amount < 0).forEach(t => { map[t.category] = (map[t.category] || 0) + Math.abs(Number(t.amount)); });
    return Object.entries(map).map(([id, value]) => ({ id, value, ...getCat(id) })).sort((a, b) => b.value - a.value);
  }, [monthTxs]);
  const groupedTxs = useMemo(() => {
    const groups = {};
    filteredTxs.forEach(t => { if (!groups[t.date]) groups[t.date] = []; groups[t.date].push(t); });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTxs]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: T.textMuted, fontSize: 14 }}>Loading...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 480, margin: "0 auto", paddingBottom: 100 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${T.bg}; overflow-x: hidden; }
        input:focus, select:focus { border-color: ${T.accent} !important; }
        select { appearance: none; }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes shimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(350%) } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }
      `}</style>

      {/* Sync error banner */}
      {syncError && (
        <div style={{ padding: "8px 20px", background: T.danger + "22", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: T.danger }}>{syncError}</span>
          <button onClick={() => setSyncError("")} style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "20px 20px 16px", position: "sticky", top: 0, background: T.bg, zIndex: 50 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>Finance</h1>
          {tab !== "networth" && <MonthPicker value={month} onChange={setMonth} />}
        </div>
        <TabBar
          tabs={[
            { id: "ledger", label: "Transactions" },
            { id: "budget", label: "Budget" },
            { id: "analysis", label: "Analysis" },
            { id: "networth", label: "Net Worth" },
          ]}
          active={tab} onChange={setTab}
        />
      </div>

      {/* ═══ LEDGER ═══ */}
      {tab === "ledger" && (
        <div style={{ padding: "0 20px" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Income", value: monthIncome, color: T.income, prefix: "+" },
              { label: "Expenses", value: monthExpense, color: T.expense, prefix: "-" },
              { label: "Net", value: monthIncome - monthExpense, color: monthIncome - monthExpense >= 0 ? T.income : T.expense },
            ].map(c => (
              <div key={c.label} style={{ flex: 1, padding: "14px 12px", background: T.surface, borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: c.color }}>{c.prefix || ""}{fmt(Math.abs(c.value))}</div>
              </div>
            ))}
          </div>
          <NLInput transactions={transactions} onApplyActions={applyActions} />
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...baseInput, paddingLeft: 36, fontSize: 13 }} />
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.textMuted, fontSize: 14 }}>🔍</span>
            </div>
            <button onClick={() => setShowCSV(true)} style={{ ...navBtn, width: 40, height: 40, fontSize: 14 }} title="Import CSV">📎</button>
          </div>
          {groupedTxs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: T.textMuted }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📒</div>
              <div style={{ fontSize: 14 }}>No transactions this month</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {groupedTxs.map(([date, txs]) => (
                <div key={date}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, padding: "0 4px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.textMuted }}>{new Date(date + "T12:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</span>
                    <span style={{ fontSize: 12, color: T.textMuted }}>{fmt(txs.reduce((s, t) => s + Number(t.amount), 0))}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {txs.map(tx => <TransactionRow key={tx.id} tx={tx} onEdit={setEditTx} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ BUDGET ═══ */}
      {tab === "budget" && (
        <div style={{ padding: "0 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>Total Budget</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(budgets.reduce((s, b) => s + Number(b.amount), 0))}</div>
            </div>
            <button onClick={() => { setEditBudget(null); setShowBudgetForm(true); }} style={{ ...primaryBtn, padding: "8px 16px", fontSize: 13 }}>+ Add Budget</button>
          </div>
          {budgets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: T.textMuted }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 14 }}>No budgets set</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {budgets.map(b => {
                const cat = getCat(b.category);
                const spent = categorySpending.find(c => c.id === b.category)?.value || 0;
                const pct = Number(b.amount) > 0 ? Math.round((spent / Number(b.amount)) * 100) : 0;
                const over = spent > Number(b.amount);
                return (
                  <div key={b.id} style={{ padding: 16, background: T.surface, borderRadius: 14, cursor: "pointer" }} onClick={() => { setEditBudget(b); setShowBudgetForm(true); }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.color + "1A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{cat.icon}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{cat.name}</div>
                          <div style={{ fontSize: 12, color: T.textMuted }}>{fmt(spent)} / {fmt(Number(b.amount))}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: over ? T.danger : pct > 80 ? "#FFA726" : T.income }}>{pct}%</div>
                    </div>
                    <SpendingBar spent={spent} budget={Number(b.amount)} color={cat.color} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: T.textMuted }}>{over ? `Over by ${fmt(spent - Number(b.amount))}` : `${fmt(Number(b.amount) - spent)} remaining`}</span>
                      <button onClick={e => { e.stopPropagation(); setDeleteBudget(b.id); }} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ ANALYSIS ═══ */}
      {tab === "analysis" && (
        <div style={{ padding: "0 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>Savings Rate</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: monthIncome > 0 && (monthIncome - monthExpense) / monthIncome > 0 ? T.income : T.danger }}>
                {monthIncome > 0 ? Math.round(((monthIncome - monthExpense) / monthIncome) * 100) : 0}%
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>Net Flow</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: monthIncome - monthExpense >= 0 ? T.income : T.danger }}>
                {monthIncome - monthExpense >= 0 ? "+" : ""}{fmt(monthIncome - monthExpense)}
              </div>
            </div>
          </div>
          <div style={{ background: T.surface, borderRadius: 16, padding: 20, marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 16, alignSelf: "flex-start" }}>Spending by Category</div>
            <PieChart data={categorySpending} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, justifyContent: "center" }}>
              {categorySpending.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.textMuted }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />{c.name}
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 12 }}>Category Breakdown</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {categorySpending.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 20px", color: T.textMuted, fontSize: 13 }}>No expenses this month</div>
            ) : categorySpending.map(c => {
              const budget = budgets.find(b => b.category === c.id);
              return (
                <div key={c.id} style={{ padding: "14px 16px", background: T.surface, borderRadius: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 15 }}>{c.icon}</span><span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span></div>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(c.value)}</span>
                  </div>
                  {budget && <SpendingBar spent={c.value} budget={Number(budget.amount)} color={c.color} />}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: T.textMuted }}>{monthExpense > 0 ? Math.round((c.value / monthExpense) * 100) : 0}% of spending</span>
                    {budget && <span style={{ fontSize: 11, color: c.value > Number(budget.amount) ? T.danger : T.textMuted }}>{fmt(c.value)} / {fmt(Number(budget.amount))}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {monthTxs.filter(t => t.amount < 0).length > 0 && (
            <div style={{ background: T.surface, borderRadius: 16, padding: 20, marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 16 }}>Daily Spending</div>
              <DailyChart txs={monthTxs.filter(t => t.amount < 0)} month={month} />
            </div>
          )}
        </div>
      )}

      {/* ═══ NET WORTH ═══ */}
      {tab === "networth" && (
        <div style={{ padding: "0 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Net Worth Tracker</div>
            <button onClick={() => { setEditSnap(null); setShowNWForm(true); }} style={{ ...primaryBtn, padding: "8px 16px", fontSize: 13 }}>+ Snapshot</button>
          </div>

          {snapshots.length > 0 && (
            <div style={{ background: T.surface, borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <NetWorthChart snapshots={snapshots} />
            </div>
          )}

          {snapshots.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: T.textMuted }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📈</div>
              <div style={{ fontSize: 14 }}>No snapshots yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Add your first net worth snapshot</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...snapshots].sort((a, b) => b.date.localeCompare(a.date)).map(s => (
                <div key={s.id} style={{ padding: 16, background: T.surface, borderRadius: 14, cursor: "pointer" }}
                  onClick={() => { setEditSnap(s); setShowNWForm(true); }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{new Date(s.date + "T12:00:00").toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: Number(s.net_worth) >= 0 ? T.income : T.danger }}>{fmt(Number(s.net_worth))}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: T.textMuted }}>Assets: <strong style={{ color: T.income }}>{fmtShort(Number(s.total_assets))}</strong></span>
                    <span style={{ fontSize: 12, color: T.textMuted }}>Liabilities: <strong style={{ color: T.danger }}>{fmtShort(Number(s.total_liabilities))}</strong></span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(s.entries || []).map((e, i) => (
                      <span key={i} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: e.type === "asset" ? T.income + "18" : T.danger + "18", color: e.type === "asset" ? T.income : T.danger }}>
                        {e.name}: {fmtShort(e.value)}
                      </span>
                    ))}
                  </div>
                  <div style={{ textAlign: "right", marginTop: 8 }}>
                    <button onClick={e => { e.stopPropagation(); setDeleteSnap(s.id); }} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <button onClick={() => { if (tab === "networth") { setEditSnap(null); setShowNWForm(true); } else setShowAdd(true); }}
        style={{
          position: "fixed", bottom: 24, right: "max(24px, calc(50% - 216px))",
          width: 56, height: 56, borderRadius: 16, border: "none",
          background: T.accent, color: "#fff", fontSize: 28,
          cursor: "pointer", boxShadow: "0 4px 20px rgba(91,164,245,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 40, fontFamily: "'DM Sans', sans-serif",
        }}>+</button>

      {/* ── Modals ── */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Transaction">
        <TransactionForm onSave={addTx} onCancel={() => setShowAdd(false)} />
      </Modal>

      <Modal open={!!editTx} onClose={() => setEditTx(null)} title="Edit Transaction">
        {editTx && <>
          <TransactionForm initial={{ ...editTx, amount: Math.abs(Number(editTx.amount)).toString(), type: Number(editTx.amount) > 0 ? "income" : "expense" }}
            onSave={tx => updateTx({ ...tx, id: editTx.id })} onCancel={() => setEditTx(null)} />
          <button onClick={() => setDeleteTx(editTx.id)} style={{ ...primaryBtn, background: "transparent", color: T.danger, width: "100%", marginTop: 10, border: `1px solid ${T.danger}33` }}>Delete Transaction</button>
        </>}
      </Modal>

      <Modal open={showBudgetForm} onClose={() => { setShowBudgetForm(false); setEditBudget(null); }} title={editBudget ? "Edit Budget" : "Add Budget"}>
        <BudgetForm initial={editBudget ? { category: editBudget.category, amount: Number(editBudget.amount).toString() } : undefined}
          onSave={saveBudget} onCancel={() => { setShowBudgetForm(false); setEditBudget(null); }} />
      </Modal>

      <Modal open={showNWForm} onClose={() => { setShowNWForm(false); setEditSnap(null); }} title={editSnap ? "Edit Snapshot" : "New Net Worth Snapshot"}>
        <NetWorthForm initial={editSnap} onSave={saveSnapshot} onCancel={() => { setShowNWForm(false); setEditSnap(null); }} />
      </Modal>

      <CSVImportModal open={showCSV} onClose={() => setShowCSV(false)} onImport={importTxs} />

      <ConfirmModal open={!!deleteTx} onClose={() => setDeleteTx(null)} onConfirm={() => removeTx(deleteTx)} message="Delete this transaction?" />
      <ConfirmModal open={!!deleteBudget} onClose={() => setDeleteBudget(null)} onConfirm={() => removeBudget(deleteBudget)} message="Delete this budget?" />
      <ConfirmModal open={!!deleteSnap} onClose={() => setDeleteSnap(null)} onConfirm={() => removeSnapshot(deleteSnap)} message="Delete this snapshot?" />
    </div>
  );
}