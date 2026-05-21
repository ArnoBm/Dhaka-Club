const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

router.get('/dashboard', async (req, res) => {
    try {
        const [venueSummary, activeMembers, eventTrend, renewalTrend, communityTrend, auctionSummary] = await Promise.all([
            sequelize.query(
                `SELECT
                    COUNT(v.id) AS total_venues,
                    COUNT(DISTINCT CASE WHEN vb.status = 'Confirmed' THEN v.id END) AS used_venues
                 FROM venues v
                 LEFT JOIN venue_bookings vb ON vb.venue_id = v.id
                    AND vb.booking_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
                { type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT COUNT(*) AS count
                 FROM members
                 WHERE status = 'Active'
                   AND (membership_expiry IS NULL OR membership_expiry >= CURDATE())`,
                { type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT DATE_FORMAT(e.event_date, '%Y-%m') AS label,
                        COALESCE(SUM(er.ticket_count), 0) AS value
                 FROM events e
                 LEFT JOIN event_registrations er ON er.event_id = e.id AND er.entry_status <> 'Cancelled'
                 WHERE e.event_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                 GROUP BY DATE_FORMAT(e.event_date, '%Y-%m')
                 ORDER BY label ASC`,
                { type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT DATE_FORMAT(created_at, '%Y-%m') AS label, COUNT(*) AS value
                 FROM card_renewals
                 WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                 GROUP BY DATE_FORMAT(created_at, '%Y-%m')
                 ORDER BY label ASC`,
                { type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT status AS label, COUNT(*) AS value
                 FROM community_requests
                 GROUP BY status`,
                { type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT COUNT(DISTINCT b.member_id) AS participants, COUNT(DISTINCT m.id) AS members
                 FROM members m
                 LEFT JOIN bids b ON b.member_id = m.id
                 WHERE m.status = 'Active'`,
                { type: QueryTypes.SELECT }
            ),
        ]);

        const venues = venueSummary[0] || {};
        const auctions = auctionSummary[0] || {};

        return res.json({
            cards: {
                venue_usage_percent: percent(venues.used_venues, venues.total_venues),
                monthly_active_members: Number(activeMembers[0]?.count || 0),
                event_attendance_total: sumValues(eventTrend),
                renewal_total: sumValues(renewalTrend),
                community_request_total: sumValues(communityTrend),
                auction_participation_percent: percent(auctions.participants, auctions.members),
            },
            charts: {
                event_attendance_trend: eventTrend,
                membership_renewal_trend: renewalTrend,
                community_request_trend: communityTrend,
                auction_participation: [
                    { label: 'Participated', value: Number(auctions.participants || 0) },
                    { label: 'Not Participated', value: Math.max(Number(auctions.members || 0) - Number(auctions.participants || 0), 0) },
                ],
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch analytics.', error: error.message });
    }
});

router.get('/facilities', async (req, res) => {
    try {
        const [usage, peakHours, trend] = await Promise.all([
            sequelize.query(
                `SELECT v.id, v.name, COUNT(vb.id) AS bookings
                 FROM venues v
                 LEFT JOIN venue_bookings vb ON vb.venue_id = v.id AND vb.status = 'Confirmed'
                 GROUP BY v.id, v.name
                 ORDER BY bookings DESC`,
                { type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT HOUR(start_time) AS label, COUNT(*) AS value
                 FROM venue_bookings
                 WHERE status = 'Confirmed'
                 GROUP BY HOUR(start_time)
                 ORDER BY value DESC`,
                { type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT DATE_FORMAT(booking_date, '%Y-%m') AS label, COUNT(*) AS value
                 FROM venue_bookings
                 WHERE booking_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                 GROUP BY DATE_FORMAT(booking_date, '%Y-%m')
                 ORDER BY label ASC`,
                { type: QueryTypes.SELECT }
            ),
        ]);

        return res.json({
            venue_heatmap: usage,
            peak_hours: peakHours,
            most_used_venue: usage[0] || null,
            least_used_venue: usage[usage.length - 1] || null,
            booking_trends: trend,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch facility analytics.', error: error.message });
    }
});

function sumValues(rows) {
    return rows.reduce((total, row) => total + Number(row.value || 0), 0);
}

function percent(value, total) {
    const numericTotal = Number(total || 0);
    if (!numericTotal) {
        return 0;
    }

    return Math.round((Number(value || 0) / numericTotal) * 100);
}

module.exports = router;
