import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, BarChart3, Calendar, Clock, Gavel, HeartHandshake, TrendingUp, Users } from 'lucide-react'
import api from '../api/axios'

const initialDashboard = {
  members: [],
  upcomingEvents: [],
  pendingBookings: [],
  expiringMemberships: [],
  notices: [],
  analytics: null,
}

function Dashboard() {
  const [dashboard, setDashboard] = useState(initialDashboard)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const [
          membersResponse,
          eventsResponse,
          bookingsResponse,
          expiringResponse,
          noticesResponse,
          analyticsResponse,
        ] = await Promise.all([
          api.get('/members'),
          api.get('/events?status=Upcoming'),
          api.get('/venues/bookings?status=Pending'),
          api.get('/renewals/expiring'),
          api.get('/notices'),
          api.get('/analytics/dashboard').catch(() => ({ data: null })),
        ])

        setDashboard({
          members: membersResponse.data || [],
          upcomingEvents: eventsResponse.data || [],
          pendingBookings: bookingsResponse.data || [],
          expiringMemberships: expiringResponse.data || [],
          notices: noticesResponse.data || [],
          analytics: analyticsResponse.data,
        })
      } catch (error) {
        toast.error('Failed to load dashboard data.')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [])

  if (loading) {
    return <DashboardSkeleton />
  }

  const stats = [
    {
      label: 'Total Members',
      value: dashboard.members.length,
      icon: Users,
      tone: 'bg-slate-100 text-slate-700',
    },
    {
      label: 'Upcoming Events',
      value: dashboard.upcomingEvents.length,
      icon: Calendar,
      tone: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Pending Bookings',
      value: dashboard.pendingBookings.length,
      icon: Clock,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Expiring Memberships',
      value: dashboard.expiringMemberships.length,
      icon: AlertTriangle,
      tone: 'bg-red-50 text-red-700',
    },
  ]

  const analyticsStats = [
    {
      label: 'Venue Usage',
      value: `${dashboard.analytics?.cards?.venue_usage_percent || 0}%`,
      icon: BarChart3,
      tone: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Monthly Active Members',
      value: dashboard.analytics?.cards?.monthly_active_members || 0,
      icon: Users,
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Event Attendance',
      value: dashboard.analytics?.cards?.event_attendance_total || 0,
      icon: Calendar,
      tone: 'bg-violet-50 text-violet-700',
    },
    {
      label: 'Renewal Trend',
      value: dashboard.analytics?.cards?.renewal_total || 0,
      icon: TrendingUp,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Community Requests',
      value: dashboard.analytics?.cards?.community_request_total || 0,
      icon: HeartHandshake,
      tone: 'bg-rose-50 text-rose-700',
    },
    {
      label: 'Auction Participation',
      value: `${dashboard.analytics?.cards?.auction_participation_percent || 0}%`,
      icon: Gavel,
      tone: 'bg-slate-100 text-slate-700',
    },
  ]

  return (
    <section>
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">
          Key activity across Dhaka Club at a glance.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      <div className="mt-6">
        <h3 className="text-lg font-semibold text-slate-950">Advanced Analytics</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {analyticsStats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <PreviewPanel title="Recent Notices">
          {dashboard.notices.slice(0, 5).map((notice) => (
            <PreviewItem
              key={notice.id}
              title={notice.title}
              meta={notice.created_by_name || 'Admin'}
              date={notice.created_at}
            />
          ))}
          {!dashboard.notices.length && <EmptyState label="No notices found." />}
        </PreviewPanel>

        <PreviewPanel title="Upcoming Events">
          {dashboard.upcomingEvents.slice(0, 5).map((event) => (
            <PreviewItem
              key={event.id}
              title={event.title}
              meta={event.venue}
              date={event.event_date}
            />
          ))}
          {!dashboard.upcomingEvents.length && (
            <EmptyState label="No upcoming events found." />
          )}
        </PreviewPanel>
      </div>
    </section>
  )
}

function StatCard({ stat }) {
  const Icon = stat.icon

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{stat.label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{stat.value}</p>
        </div>
        <div className={`rounded-lg p-3 ${stat.tone}`}>
          <Icon size={24} />
        </div>
      </div>
    </article>
  )
}

function PreviewPanel({ title, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="font-semibold text-slate-950">{title}</h3>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  )
}

function PreviewItem({ title, meta, date }) {
  return (
    <article className="px-5 py-4">
      <h4 className="font-medium text-slate-950">{title}</h4>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
        {meta && <span>{meta}</span>}
        {date && <span>{formatDate(date)}</span>}
      </div>
    </article>
  )
}

function EmptyState({ label }) {
  return <p className="px-5 py-6 text-sm text-slate-500">{label}</p>
}

function DashboardSkeleton() {
  return (
    <section>
      <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-slate-100" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-32 animate-pulse rounded-lg border border-slate-200 bg-white p-5"
          >
            <div className="h-4 w-28 rounded bg-slate-100" />
            <div className="mt-4 h-8 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {[1, 2].map((item) => (
          <div
            key={item}
            className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white"
          />
        ))}
      </div>
    </section>
  )
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

export default Dashboard
