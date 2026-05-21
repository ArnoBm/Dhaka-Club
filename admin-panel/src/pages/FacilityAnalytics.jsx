import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../api/axios'

function FacilityAnalytics() {
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get('/analytics/facilities')
      .then((response) => setData(response.data))
      .catch(() => toast.error('Failed to load facility analytics.'))
  }, [])

  const heatmap = data?.venue_heatmap || []
  const max = Math.max(...heatmap.map((item) => Number(item.bookings || 0)), 1)

  return (
    <section>
      <h2 className="text-2xl font-semibold text-slate-950">Facility Analytics</h2>
      <p className="mt-1 text-sm text-slate-500">Venue heatmap, peak hours, most used venue, least used venue, and booking trends.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Summary title="Most Used Venue" value={data?.most_used_venue?.name || '-'} meta={`${data?.most_used_venue?.bookings || 0} bookings`} />
        <Summary title="Least Used Venue" value={data?.least_used_venue?.name || '-'} meta={`${data?.least_used_venue?.bookings || 0} bookings`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-950">Venue Heatmap</h3>
          <div className="mt-5 space-y-3">
            {heatmap.map((venue) => (
              <div key={venue.id}>
                <div className="mb-1 flex justify-between text-sm"><span>{venue.name}</span><strong>{venue.bookings}</strong></div>
                <div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-[#1e2a45]" style={{ width: `${Math.max((Number(venue.bookings || 0) / max) * 100, 4)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <Chart title="Peak Hours" data={data?.peak_hours || []} />
        <Chart title="Booking Trends" data={data?.booking_trends || []} />
      </div>
    </section>
  )
}

function Summary({ title, value, meta }) {
  return <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{title}</p><h3 className="mt-2 text-xl font-semibold text-slate-950">{value}</h3><p className="mt-1 text-sm text-slate-500">{meta}</p></article>
}

function Chart({ title, data }) {
  const max = Math.max(...data.map((item) => Number(item.value || 0)), 1)
  return <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold text-slate-950">{title}</h3><div className="mt-5 flex h-56 items-end gap-3">{data.map((item) => <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2"><div className="w-full rounded-t-md bg-emerald-600" style={{ height: `${Math.max((Number(item.value || 0) / max) * 180, 8)}px` }} /><span className="w-full truncate text-center text-xs text-slate-500">{item.label}</span></div>)}</div></section>
}

export default FacilityAnalytics
