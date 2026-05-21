import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ShieldAlert, ShieldCheck, UserCheck, Users } from 'lucide-react'
import api from '../api/axios'

function SecurityGate() {
  const [data, setData] = useState(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    api.get('/security/dashboard', { params: { date } })
      .then((response) => setData(response.data))
      .catch(() => toast.error('Failed to load security gate dashboard.'))
  }, [date])

  const cards = [
    { label: "Today's Entries", value: data?.todays_entries || 0, icon: Users, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Guest Entries', value: data?.guest_entries || 0, icon: UserCheck, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Blocked Member Alert', value: data?.blocked_entries || 0, icon: ShieldAlert, tone: 'bg-red-50 text-red-700' },
    { label: 'Live QR Verification', value: 'Active', icon: ShieldCheck, tone: 'bg-slate-100 text-slate-700' },
  ]

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Security Gate Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">Live gate activity, blocked alerts, and recent entry history.</p>
        </div>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <Card key={card.label} card={card} />)}
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-950">Recent Entry Activity</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {(data?.recent || []).map((entry) => (
            <article key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <h4 className="font-medium text-slate-950">{entry.name || 'Unknown'}</h4>
                <p className="text-sm text-slate-500">{entry.qr_type} • {entry.membership_group || '-'} • {new Date(entry.scanned_at).toLocaleTimeString()}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${entry.entry_allowed ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-red-50 text-red-700 ring-red-600/20'}`}>
                {entry.entry_allowed ? 'Allowed' : 'Blocked'}
              </span>
            </article>
          ))}
          {!(data?.recent || []).length && <p className="px-5 py-8 text-sm text-slate-500">No entry activity found.</p>}
        </div>
      </section>
    </section>
  )
}

function Card({ card }) {
  const Icon = card.icon
  return <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-slate-500">{card.label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p></div><div className={`rounded-lg p-3 ${card.tone}`}><Icon size={24} /></div></div></article>
}

export default SecurityGate
