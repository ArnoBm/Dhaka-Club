import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Activity, BarChart3, CalendarCheck, Gavel, HeartHandshake, TrendingUp } from 'lucide-react'
import api from '../api/axios'

function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const response = await api.get('/analytics/dashboard')
        setData(response.data)
      } catch (error) {
        toast.error('Failed to load analytics.')
      } finally {
        setLoading(false)
      }
    }

    loadAnalytics()
  }, [])

  if (loading) {
    return <Skeleton />
  }

  const cards = [
    { label: 'Venue Usage %', value: `${data?.cards?.venue_usage_percent || 0}%`, icon: BarChart3, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Monthly Active Members', value: data?.cards?.monthly_active_members || 0, icon: Activity, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Event Attendance Trend', value: data?.cards?.event_attendance_total || 0, icon: CalendarCheck, tone: 'bg-violet-50 text-violet-700' },
    { label: 'Membership Renewal Trend', value: data?.cards?.renewal_total || 0, icon: TrendingUp, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Community Request Trend', value: data?.cards?.community_request_total || 0, icon: HeartHandshake, tone: 'bg-rose-50 text-rose-700' },
    { label: 'Auction Participation %', value: `${data?.cards?.auction_participation_percent || 0}%`, icon: Gavel, tone: 'bg-slate-100 text-slate-700' },
  ]

  return (
    <section>
      <h2 className="text-2xl font-semibold text-slate-950">Analytics Dashboard</h2>
      <p className="mt-1 text-sm text-slate-500">Club-wide performance trends and participation insights.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <StatCard key={card.label} card={card} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartPanel title="Event Attendance Trend" type="line" data={data?.charts?.event_attendance_trend || []} />
        <ChartPanel title="Membership Renewal Trend" type="bar" data={data?.charts?.membership_renewal_trend || []} />
        <ChartPanel title="Community Request Trend" type="bar" data={data?.charts?.community_request_trend || []} />
        <PiePanel title="Auction Participation" data={data?.charts?.auction_participation || []} />
      </div>
    </section>
  )
}

function StatCard({ card }) {
  const Icon = card.icon
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{card.label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{card.value}</p>
        </div>
        <div className={`rounded-lg p-3 ${card.tone}`}>
          <Icon size={24} />
        </div>
      </div>
    </article>
  )
}

function ChartPanel({ title, data }) {
  const max = Math.max(...data.map((item) => Number(item.value || 0)), 1)
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <div className="mt-5 flex h-56 items-end gap-3">
        {data.length ? data.map((item) => (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-md bg-[#1e2a45]"
              style={{ height: `${Math.max((Number(item.value || 0) / max) * 180, 8)}px` }}
              title={`${item.label}: ${item.value}`}
            />
            <span className="w-full truncate text-center text-xs text-slate-500">{item.label}</span>
          </div>
        )) : <Empty />}
      </div>
    </section>
  )
}

function PiePanel({ title, data }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-950">{title}</h3>
      <div className="mt-6 grid gap-5 sm:grid-cols-[180px_1fr]">
        <div className="grid h-44 w-44 place-items-center rounded-full bg-[conic-gradient(#1e2a45_var(--p),#e2e8f0_0)] text-xl font-semibold text-slate-950" style={{ '--p': `${total ? (Number(data[0]?.value || 0) / total) * 100 : 0}%` }}>
          {total ? Math.round((Number(data[0]?.value || 0) / total) * 100) : 0}%
        </div>
        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.label} className="flex justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Empty() {
  return <p className="text-sm text-slate-500">No chart data available.</p>
}

function Skeleton() {
  return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />
}

export default Analytics
