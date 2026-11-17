"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

function formatTokens(num) {
  if (num === null || num === undefined) return "Unlimited";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

function formatExact(num) {
  if (num === null || num === undefined) return "Unlimited";
  return Number(num).toLocaleString();
}

export default function PortalClient() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedKeyId, setCopiedKeyId] = useState(null);
  const [modelSearch, setModelSearch] = useState("");
  const [activeSnippetTab, setActiveSnippetTab] = useState("curl");

  const fetchPortalData = async () => {
    try {
      const res = await fetch("/api/portal/me");
      if (res.status === 401 || res.status === 403) {
        router.push("/portal/login");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load portal data");
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message || "Error loading dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortalData();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/portal/auth/logout", { method: "POST" });
    } catch {}
    router.push("/portal/login");
  };

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-text-muted">
          <span className="material-symbols-outlined text-3xl animate-spin text-amber-500">
            progress_activity
          </span>
          <p className="text-sm">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0d0f12] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-neutral-900 border border-red-500/30 rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-4xl text-red-500 mb-2">error</span>
          <h2 className="text-lg font-semibold mb-2">Unable to Load Portal</h2>
          <p className="text-xs text-text-muted mb-4">{error || "User data unavailable"}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { user, summary, keys, accessibleModels } = data;
  const filteredModels = (accessibleModels || []).filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const gatewayUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:20228/v1`
    : "http://your-server:20228/v1";

  return (
    <div className="min-h-screen bg-[#0d0f12] text-white">
      {/* Top Navigation */}
      <header className="border-b border-white/10 bg-neutral-900/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-neutral-950 font-bold shadow-md">
              <span className="material-symbols-outlined text-[22px]">token</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight">9Router Client Portal</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Client
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-medium text-white font-mono">{user.username}</span>
              {user.name && <span className="text-[11px] text-text-muted">{user.name}</span>}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs text-text-muted hover:text-white transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Metric Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Remaining Tokens */}
          <div className="bg-neutral-900/80 border border-white/10 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-text-muted mb-2">
              <span className="text-xs font-medium">Tokens Remaining</span>
              <span className="material-symbols-outlined text-green-400 text-[20px]">savings</span>
            </div>
            <div className="text-2xl font-bold tracking-tight text-white font-mono">
              {summary.hasUnlimited ? "Unlimited" : formatTokens(summary.totalRemainingTokens)}
            </div>
            <p className="text-[11px] text-text-muted mt-1">
              {summary.hasUnlimited ? "No quota enforced" : `${formatExact(summary.totalRemainingTokens)} tokens left`}
            </p>
          </div>

          {/* Card 2: Used Tokens */}
          <div className="bg-neutral-900/80 border border-white/10 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-text-muted mb-2">
              <span className="text-xs font-medium">Tokens Consumed</span>
              <span className="material-symbols-outlined text-amber-400 text-[20px]">data_usage</span>
            </div>
            <div className="text-2xl font-bold tracking-tight text-white font-mono">
              {formatTokens(summary.totalUsedTokens)}
            </div>
            <p className="text-[11px] text-text-muted mt-1">
              {formatExact(summary.totalUsedTokens)} tokens used
            </p>
          </div>

          {/* Card 3: Total Allocated Quota */}
          <div className="bg-neutral-900/80 border border-white/10 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-text-muted mb-2">
              <span className="text-xs font-medium">Total Quota Allocated</span>
              <span className="material-symbols-outlined text-blue-400 text-[20px]">tune</span>
            </div>
            <div className="text-2xl font-bold tracking-tight text-white font-mono">
              {summary.hasUnlimited ? "Unlimited" : formatTokens(summary.totalMaxTokens)}
            </div>
            <p className="text-[11px] text-text-muted mt-1">
              {summary.hasUnlimited ? "Unrestricted key included" : `${formatExact(summary.totalMaxTokens)} total`}
            </p>
          </div>

          {/* Card 4: Active Keys */}
          <div className="bg-neutral-900/80 border border-white/10 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-text-muted mb-2">
              <span className="text-xs font-medium">Assigned Keys</span>
              <span className="material-symbols-outlined text-purple-400 text-[20px]">key</span>
            </div>
            <div className="text-2xl font-bold tracking-tight text-white font-mono">
              {summary.activeKeys} <span className="text-xs text-text-muted font-normal">/ {summary.totalKeys}</span>
            </div>
            <p className="text-[11px] text-text-muted mt-1">
              {summary.activeKeys === summary.totalKeys ? "All keys active" : `${summary.totalKeys - summary.activeKeys} suspended`}
            </p>
          </div>
        </section>

        {/* Global Progress Bar (if not unlimited) */}
        {!summary.hasUnlimited && summary.totalMaxTokens > 0 && (
          <section className="bg-neutral-900/50 border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-white/80">Cumulative Quota Usage</span>
              <span className="font-mono text-amber-400 font-semibold">{summary.usagePercent}% used</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden border border-white/10">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  summary.usagePercent >= 90
                    ? "bg-red-500"
                    : summary.usagePercent >= 75
                      ? "bg-amber-500"
                      : "bg-green-500"
                }`}
                style={{ width: `${Math.min(100, summary.usagePercent)}%` }}
              />
            </div>
          </section>
        )}

        {/* API Keys Table */}
        <section className="bg-neutral-900/80 border border-white/10 rounded-xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Your API Keys</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Each key connects your coding tools (Claude Code, Cursor, Codex) to 9Router
              </p>
            </div>
          </div>

          {keys.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-xs">
              No API keys have been assigned to your account yet. Please contact your administrator.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-text-muted border-b border-white/10 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-5">Key Name</th>
                    <th className="py-3 px-5">Key Prefix</th>
                    <th className="py-3 px-5">Token Quota</th>
                    <th className="py-3 px-5">Remaining</th>
                    <th className="py-3 px-5">Model Restrictions</th>
                    <th className="py-3 px-5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {keys.map((k) => (
                    <tr key={k.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-5 font-medium text-white">
                        {k.name}
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-amber-400/90 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                            {k.keyMasked}
                          </code>
                          <button
                            onClick={() => copyText(k.keyMasked, k.id)}
                            title="Copy key prefix"
                            className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-white transition-colors cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {copiedKeyId === k.id ? "check" : "content_copy"}
                            </span>
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        {k.maxTokens ? (
                          <div>
                            <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                              <span>{formatTokens(k.usedTokens)}</span>
                              <span className="text-text-muted">/ {formatTokens(k.maxTokens)}</span>
                            </div>
                            <div className="w-28 bg-white/10 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  k.usagePercent >= 90 ? "bg-red-500" : "bg-amber-500"
                                }`}
                                style={{ width: `${Math.min(100, k.usagePercent)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-text-muted">Unlimited</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 font-mono">
                        {k.remainingTokens !== null ? (
                          <span className={k.remainingTokens === 0 ? "text-red-400 font-semibold" : "text-green-400"}>
                            {formatTokens(k.remainingTokens)}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        {k.isRestricted ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {k.allowedModels.map((m) => (
                              <span
                                key={m}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            All Models
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            k.isActive
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          <span className={`size-1.5 rounded-full ${k.isActive ? "bg-green-400" : "bg-red-400"}`} />
                          {k.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Accessible Models Section */}
        <section className="bg-neutral-900/80 border border-white/10 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-semibold">Accessible AI Models</h2>
              <p className="text-xs text-text-muted mt-0.5">
                AI models you are permitted to invoke with your active keys
              </p>
            </div>
            <div className="w-full sm:w-64">
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          {accessibleModels.length === 1 && accessibleModels[0] === "*" ? (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span><strong>Unrestricted Access:</strong> Your keys are permitted to call all enabled models on this proxy.</span>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-xs">
              No matching models found.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredModels.map((m) => (
                <div
                  key={m}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2 text-xs font-mono text-white/90 hover:border-amber-500/30 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px] text-amber-500">smart_toy</span>
                  <span className="truncate">{m}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Connection & Setup Instructions */}
        <section className="bg-neutral-900/80 border border-white/10 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-1">Quick Connection Guide</h2>
          <p className="text-xs text-text-muted mb-4">
            Point your CLI tools or client libraries to this proxy endpoint:
          </p>

          <div className="flex gap-2 border-b border-white/10 mb-4 pb-2">
            {[
              { id: "curl", label: "cURL" },
              { id: "python", label: "Python (OpenAI SDK)" },
              { id: "claude", label: "Claude Code CLI" },
              { id: "cursor", label: "Cursor IDE" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSnippetTab(tab.id)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  activeSnippetTab === tab.id
                    ? "bg-amber-500 text-neutral-950 font-semibold"
                    : "text-text-muted hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative bg-neutral-950 rounded-lg p-4 font-mono text-xs text-amber-400 overflow-x-auto border border-white/5">
            {activeSnippetTab === "curl" && (
              <pre>{`curl ${gatewayUrl}/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${accessibleModels[0] === "*" ? "claude-3-7-sonnet" : accessibleModels[0] || "gpt-4o"}",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</pre>
            )}

            {activeSnippetTab === "python" && (
              <pre>{`from openai import OpenAI

client = OpenAI(
    base_url="${gatewayUrl}",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="${accessibleModels[0] === "*" ? "claude-3-7-sonnet" : accessibleModels[0] || "gpt-4o"}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`}</pre>
            )}

            {activeSnippetTab === "claude" && (
              <pre>{`# Configure Claude Code CLI:
export ANTHROPIC_BASE_URL="${gatewayUrl}"
export ANTHROPIC_API_KEY="YOUR_API_KEY"

claude`}</pre>
            )}

            {activeSnippetTab === "cursor" && (
              <pre>{`# In Cursor Settings -> Models:
# 1. Enable "Override OpenAI Base URL"
# 2. Base URL: ${gatewayUrl}
# 3. API Key: YOUR_API_KEY`}</pre>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
