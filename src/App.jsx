import { useEffect, useState, useCallback } from 'react'

const fmtKES = (n) =>
  new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(n ?? 0)
const fmtUSD = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n ?? 0)

function StatTile({ label, value, tone = 'primary', loading }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/80 p-5 shadow-glow animate-slideIn">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 font-mono">{label}</p>
      <p key={String(value)} className={`mt-2 font-mono text-3xl font-semibold animate-countPop ${tone === 'accent' ? 'text-accent-400' : tone === 'warn' ? 'text-warn-400' : 'text-primary-300'}`}>
        {loading ? '····' : value}
      </p>
    </div>
  )
}

export default function App() {
  const [metrics, setMetrics] = useState(null)
  const [config, setConfig] = useState(null)
  const [audits, setAudits] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [verdict, setVerdict] = useState(null)
  const [auditing, setAuditing] = useState(false)
  const [intercepting, setIntercepting] = useState(false)
  const [tolling, setTolling] = useState(false)
  const [flash, setFlash] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [m, c, a] = await Promise.all([
        fetch('/api/metrics').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch('/api/config').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch('/api/audit/recent').then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      ])
      setMetrics(m)
      setConfig(c)
      setAudits(Array.isArray(a) ? a : [])
      setError(null)
    } catch {
      setError('Cloud telemetry link interrupted — retrying…')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  const runAudit = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setAuditing(true)
    setVerdict(null)
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: fd.get('agentId') || undefined,
          amount: Number(fd.get('amount')),
          currency: fd.get('currency') || 'KES',
        }),
      })
      const data = await res.json()
      setVerdict(data)
      if (res.ok) {
        form.reset()
        setFlash({ tone: 'accent', text: `Audit APPROVED — toll ${data.tollKES} KES recorded.` })
      } else {
        setFlash({ tone: 'danger', text: data.reason || 'Audit BLOCKED by sovereign policy.' })
      }
      setTimeout(() => setFlash(null), 5000)
      refresh()
    } catch {
      setVerdict({ status: 'BLOCKED', reason: 'Gateway unreachable — defensive freeze.' })
    } finally {
      setAuditing(false)
    }
  }

  const interceptBot = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setIntercepting(true)
    try {
      const res = await fetch('/api/intercept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: fd.get('botId') || undefined,
          reason: fd.get('reason') || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      setFlash({ tone: 'danger', text: `Rogue agent ${fd.get('botId') || 'auto-id'} quarantined.` })
      form.reset()
      refresh()
    } catch {
      setFlash({ tone: 'danger', text: 'Firewall intercept failed — engine unreachable.' })
    } finally {
      setIntercepting(false)
      setTimeout(() => setFlash(null), 4000)
    }
  }

  const settleToll = async (e) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    setTolling(true)
    try {
      const res = await fetch('/api/transaction/toll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountKSH: Number(fd.get('amountKSH')) || undefined,
          yieldUSD: Number(fd.get('yieldUSD')) || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      setFlash({ tone: 'accent', text: 'Settlement recorded. Sovereign yield accrued.' })
      form.reset()
      refresh()
    } catch {
      setFlash({ tone: 'danger', text: 'Settlement layer timeout — retry.' })
    } finally {
      setTolling(false)
      setTimeout(() => setFlash(null), 4000)
    }
  }

  const bots = [...(metrics?.rogueBotsCaught ?? [])].reverse().slice(0, 12)
  const policy = config?.policy
  const live = !!config && !error

  return (
    <div className="min-h-screen bg-ink-950 text-slate-200 font-sans">
      {/* Top console bar */}
      <header className="sticky top-0 z-10 border-b border-ink-700 bg-ink-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary-500/40 bg-ink-800 shadow-glow">
              <span className="text-primary-300">🛡️</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide text-slate-100">
                Sovereign Policy Grid
              </h1>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-mono">
                AEGIS Security Console
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-4 py-1.5">
            <span className={`h-2 w-2 rounded-full ${live ? 'bg-accent-400 animate-pulseDot' : 'bg-danger-400'}`} />
            <span className="text-xs font-mono text-slate-300">
              {live ? config.gateway : 'LINK DOWN'}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {error && (
          <div className="rounded-lg border border-danger-500/40 bg-danger-500/10 px-4 py-3 text-sm text-danger-400 font-mono shadow-dangerGlow">
            {error}
          </div>
        )}
        {flash && (
          <div
            className={`rounded-lg px-4 py-3 text-sm font-mono animate-slideIn ${
              flash.tone === 'accent'
                ? 'border border-accent-500/40 bg-accent-500/10 text-accent-400'
                : 'border border-danger-500/40 bg-danger-500/10 text-danger-400'
            }`}
          >
            {flash.text}
          </div>
        )}

        {/* Telemetry tiles */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Tasks Audited" value={fmtKES(metrics?.totalTasksAudited)} loading={loading} />
          <StatTile label="Revenue — KES" value={fmtKES(metrics?.totalRevenueKSH)} tone="warn" loading={loading} />
          <StatTile label="Sovereign Yield — USD" value={fmtUSD(metrics?.sovereignYieldUSD)} tone="accent" loading={loading} />
          <StatTile
            label="Policy Ceiling"
            value={policy ? `${fmtKES(policy.maxAmountLimitKES)} KES` : '····'}
            loading={loading}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Audit gate */}
          <section className="lg:col-span-2 space-y-4">
            <form onSubmit={runAudit} className="rounded-xl border border-primary-500/30 bg-ink-900/80 p-5 space-y-3 shadow-glow">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 font-mono">
                Transaction Audit Gate
              </h2>
              <input
                name="agentId"
                placeholder="Agent ID (e.g. AlphaBot)"
                className="w-full rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:border-primary-400 focus:outline-none"
              />
              <div className="flex gap-3">
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="Amount"
                  className="w-full rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:border-primary-400 focus:outline-none"
                />
                <select
                  name="currency"
                  className="rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-sm font-mono text-slate-200 focus:border-primary-400 focus:outline-none"
                >
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={auditing}
                className="w-full rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-400 disabled:opacity-50"
              >
                {auditing ? 'Auditing…' : 'Audit Transaction'}
              </button>
              <p className="text-[10px] leading-relaxed text-slate-600">
                Agents call this gate before touching payment rails. Failures block by default.
              </p>
            </form>

            {verdict && (
              <div
                className={`rounded-xl border p-4 animate-slideIn ${
                  verdict.status === 'APPROVED'
                    ? 'border-accent-500/50 bg-accent-500/10 shadow-glow'
                    : 'border-danger-500/50 bg-danger-500/10 shadow-dangerGlow'
                }`}
              >
                <p className={`font-mono text-sm font-semibold ${verdict.status === 'APPROVED' ? 'text-accent-400' : 'text-danger-400'}`}>
                  {verdict.status === 'APPROVED' ? '✔ VERDICT: APPROVED' : '✖ VERDICT: BLOCKED'}
                </p>
                <p className="mt-1 text-xs text-slate-400">{verdict.reason}</p>
                {verdict.tollKES != null && (
                  <p className="mt-1 text-[10px] font-mono text-slate-500">
                    Toll {verdict.tollKES} KES · audit {verdict.auditId}
                  </p>
                )}
              </div>
            )}

            <form onSubmit={interceptBot} className="rounded-xl border border-ink-700 bg-ink-900/80 p-5 space-y-3 shadow-dangerGlow">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 font-mono">
                Log Intercept
              </h2>
              <input
                name="botId"
                placeholder="Bot ID (auto)"
                className="w-full rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:border-primary-400 focus:outline-none"
              />
              <input
                name="reason"
                placeholder="Violation reason"
                className="w-full rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:border-primary-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={intercepting}
                className="w-full rounded-md border border-danger-500/50 bg-danger-500/15 px-4 py-2 text-sm font-semibold text-danger-400 transition hover:bg-danger-500/25 disabled:opacity-50 animate-ring"
              >
                {intercepting ? 'Isolating…' : 'Quarantine Agent'}
              </button>
            </form>

            <form onSubmit={settleToll} className="rounded-xl border border-ink-700 bg-ink-900/80 p-5 space-y-3 shadow-glow">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 font-mono">
                Transaction Toll
              </h2>
              <input
                name="amountKSH"
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount (KES)"
                className="w-full rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:border-primary-400 focus:outline-none"
              />
              <input
                name="yieldUSD"
                type="number"
                min="0"
                step="0.01"
                placeholder="Sovereign yield (USD)"
                className="w-full rounded-md border border-ink-600 bg-ink-850 px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 focus:border-primary-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={tolling}
                className="w-full rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-400 disabled:opacity-50"
              >
                {tolling ? 'Settling…' : 'Settle Transaction'}
              </button>
              <p className="text-[10px] leading-relaxed text-slate-600">
                Simulation only — 0.50 KES per approved audit. No live payment bridge.
              </p>
            </form>
          </section>

          {/* Threat radar */}
          <section className="relative overflow-hidden rounded-xl border border-ink-700 bg-ink-900/80 lg:col-span-3">
            <div className="pointer-events-none absolute inset-x-0 h-24 animate-scanline bg-gradient-to-b from-transparent via-primary-500/5 to-transparent" />
            <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 font-mono">
                Threat Radar
              </h2>
              <span className="text-[10px] font-mono text-slate-500">
                {bots.length ? `${bots.length} recent intercept${bots.length > 1 ? 's' : ''}` : 'no rogue traffic'}
              </span>
            </div>
            <ul className="divide-y divide-ink-700/60">
              {bots.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-slate-500 font-mono">
                  Perimeter quiet. No rogue agents detected.
                </li>
              )}
              {bots.map((b, i) => (
                <li key={`${b.botId}-${i}`} className="flex items-center justify-between gap-4 px-5 py-3 animate-slideIn">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-danger-400">{b.botId}</p>
                    <p className="truncate text-xs text-slate-500">{b.reason}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-mono text-slate-400">{b.payloadRiskScore}</p>
                    <p className="text-[10px] font-mono text-slate-600">
                      {new Date(b.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Audit trail */}
        <section className="rounded-xl border border-ink-700 bg-ink-900/80">
          <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300 font-mono">
              Immutable Audit Trail
            </h2>
            <span className="text-[10px] font-mono text-slate-500">last 15 verdicts</span>
          </div>
          {audits.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-500 font-mono">
              No transactions audited yet. Send one through the gate.
            </p>
          ) : (
            <ul className="divide-y divide-ink-700/60">
              {audits.map((a) => (
                <li key={a.id || a._id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 animate-slideIn">
                  <span className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${a.decision === 'APPROVED' ? 'bg-accent-500/15 text-accent-400' : 'bg-danger-500/15 text-danger-400'}`}>
                    {a.decision}
                  </span>
                  <span className="font-mono text-sm text-slate-200">{a.amount} {a.currency}</span>
                  <span className="font-mono text-xs text-slate-500">{a.agentId}</span>
                  <span className="ml-auto text-[10px] font-mono text-slate-600">
                    {new Date(a.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="border-t border-ink-700 pt-4 text-center text-[10px] font-mono uppercase tracking-[0.2em] text-slate-600">
          {config?.environment ?? 'environment sync pending'}
        </footer>
      </main>
    </div>
  )
}
