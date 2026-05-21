import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { BrowserQRCodeReader } from '@zxing/browser'
import { QrCode, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import api from '../api/axios'

function QRScanner() {
  const [qrCode, setQrCode] = useState('')
  const [qrType, setQrType] = useState('')
  const [result, setResult] = useState(null)
  const [logs, setLogs] = useState([])
  const [filters, setFilters] = useState({ search: '', date: new Date().toISOString().slice(0, 10) })
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const controlsRef = useRef(null)

  const fetchLogs = useCallback(async () => {
    try {
      const response = await api.get('/security/entry-logs', { params: filters })
      setLogs(response.data || [])
    } catch (error) {
      toast.error('Failed to load entry logs.')
    }
  }, [filters])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    return () => stopCamera()
  }, [])

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera access is not available in this browser. Please use Chrome/Edge or manual input.')
      return
    }

    try {
      stopCamera()

      const scanner = new BrowserQRCodeReader()
      scannerRef.current = scanner
      setScanning(true)

      controlsRef.current = await scanner.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (scanResult, error) => {
          if (scanResult) {
            setQrCode(scanResult.getText())
            stopCamera()
            toast.success('QR code scanned.')
          } else if (error && error.name && !['NotFoundException', 'ChecksumException', 'FormatException'].includes(error.name)) {
            console.warn('QR scanner warning:', error)
          }
        },
      )
    } catch (error) {
      setScanning(false)
      toast.error('Unable to start camera scanner. Allow camera permission and try again.')
    }
  }

  const stopCamera = () => {
    controlsRef.current?.stop()
    controlsRef.current = null
    scannerRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setScanning(false)
  }

  const verifyQr = async (event) => {
    event.preventDefault()
    if (!qrCode.trim()) {
      toast.error('Please enter or scan a QR code.')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/security/verify', {
        qr_code: qrCode.trim(),
        qr_type: qrType || undefined,
      })
      setResult(response.data)
      setQrCode('')
      fetchLogs()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to verify QR.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <PageHeader
        title="QR Entry Verification"
        subtitle="Verify member, guest, and event entry QR codes at the gate."
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#1e2a45] p-3 text-white">
              <QrCode size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-950">Live Verification</h3>
              <p className="text-sm text-slate-500">Paste or type the scanned QR code.</p>
            </div>
          </div>

          <form onSubmit={verifyQr} className="mt-5 space-y-4">
            <div className="overflow-hidden rounded-lg bg-slate-950">
              <video ref={videoRef} className="h-52 w-full object-cover" muted playsInline />
            </div>
            <button
              type="button"
              onClick={scanning ? stopCamera : startCamera}
              className="w-full rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {scanning ? 'Stop Camera Scanner' : 'Start Camera Scanner'}
            </button>
            <select
              value={qrType}
              onChange={(event) => setQrType(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]"
            >
              <option value="">Auto Detect</option>
              <option value="Member">Member QR</option>
              <option value="Guest">Guest QR</option>
              <option value="Event">Event Ticket QR</option>
            </select>
            <input
              value={qrCode}
              onChange={(event) => setQrCode(event.target.value)}
              placeholder="Scan or enter QR code"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263657] disabled:opacity-60"
            >
              {loading ? 'Verifying...' : 'Verify Entry'}
            </button>
          </form>

          {result && (
            <div
              className={`mt-5 rounded-lg border p-4 ${
                result.entry_allowed
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {result.entry_allowed ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
                {result.entry_allowed ? 'Entry Allowed' : 'Entry Blocked'}
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <Info label={result.qr_type === 'Guest' ? 'Guest Name' : 'Member Name'} value={result.name} />
                {result.event_title && <Info label="Event" value={result.event_title} />}
                <Info label="Guests" value={result.guest_count || result.ticket_count || 1} />
                {result.venue && <Info label="Venue" value={result.venue} />}
                <Info label="Membership Group" value={result.membership_group || '-'} />
                <Info label="Status" value={result.status} />
                {result.payment_status && <Info label="Payment" value={result.payment_status} />}
                {result.block_reason && <Info label="Reason" value={result.block_reason} />}
              </dl>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1fr_180px]">
            <label className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Search logs"
                className="w-full rounded-md border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#1e2a45]"
              />
            </label>
            <input
              type="date"
              value={filters.date}
              onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))}
              className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <Th>Time</Th>
                  <Th>Type</Th>
                  <Th>Name</Th>
                  <Th>Purpose/Event</Th>
                  <Th>Guests</Th>
                  <Th>Group</Th>
                  <Th>Status</Th>
                  <Th>Entry</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <Td>{formatDateTime(log.scanned_at)}</Td>
                    <Td>{log.qr_type}</Td>
                    <Td>{log.name || '-'}</Td>
                    <Td>{log.visit_purpose || '-'}</Td>
                    <Td>{log.guest_count || 1}</Td>
                    <Td>{log.membership_group || '-'}</Td>
                    <Td>{log.status || '-'}</Td>
                    <Td>
                      <Badge tone={log.entry_allowed ? 'green' : 'red'}>
                        {log.entry_allowed ? 'Allowed' : 'Blocked'}
                      </Badge>
                    </Td>
                  </tr>
                ))}
                {!logs.length && (
                  <tr>
                    <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                      No entry logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

function PageHeader({ title, subtitle }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="font-semibold">{value || '-'}</dd>
    </div>
  )
}

function Badge({ children, tone }) {
  const colors = {
    green: 'bg-green-50 text-green-700 ring-green-600/20',
    red: 'bg-red-50 text-red-700 ring-red-600/20',
  }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${colors[tone]}`}>{children}</span>
}

function Th({ children }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>
}

function Td({ children }) {
  return <td className="whitespace-nowrap px-4 py-3 text-slate-700">{children}</td>
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '-'
}

export default QRScanner
