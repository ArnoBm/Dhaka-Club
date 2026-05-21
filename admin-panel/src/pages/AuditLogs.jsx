import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../api/axios'

function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [filters, setFilters] = useState({ module: '', admin: '', date: '' })

  const loadLogs = useCallback(async () => {
    try {
      const response = await api.get('/audit', { params: filters })
      setLogs(response.data || [])
    } catch (error) {
      toast.error('Failed to load audit logs.')
    }
  }, [filters])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  return (
    <section>
      <h2 className="text-2xl font-semibold text-slate-950">Audit Log</h2>
      <p className="mt-1 text-sm text-slate-500">Track admin actions across members, events, notices, bookings, and renewals.</p>

      <div className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <select value={filters.module} onChange={(event) => setFilters({ ...filters, module: event.target.value })} className="rounded-md border border-slate-300 px-3 py-2.5 text-sm">
          <option value="">All Modules</option>
          {['Members', 'Events', 'Notices', 'Bookings', 'Renewals', 'Auctions', 'Community', 'Payments', 'Security'].map((item) => <option key={item}>{item}</option>)}
        </select>
        <input value={filters.admin} onChange={(event) => setFilters({ ...filters, admin: event.target.value })} placeholder="Admin ID" className="rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
        <input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} className="rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><Th>Date</Th><Th>Module</Th><Th>Action</Th><Th>Admin</Th><Th>Description</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <Td>{formatDate(log.created_at)}</Td>
                  <Td>{log.module}</Td>
                  <Td>{log.action}</Td>
                  <Td>{log.admin_name || log.admin_id || '-'}</Td>
                  <Td>{log.description || '-'}</Td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No audit logs found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function Th({ children }) { return <th className="px-4 py-3 font-semibold">{children}</th> }
function Td({ children }) { return <td className="px-4 py-3 text-slate-700">{children}</td> }
function formatDate(value) { return value ? new Date(value).toLocaleString() : '-' }

export default AuditLogs
