const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');
const writeAuditLog = require('../utils/auditLog');
const { getMemberAccess, getPrivilegeBlockMessage } = require('../utils/memberAccess');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const venues = await sequelize.query(
            'SELECT * FROM venues ORDER BY name ASC',
            { type: QueryTypes.SELECT }
        );

        return res.json(venues);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch venues.', error: error.message });
    }
});

router.get('/availability', async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ message: 'date query parameter is required.' });
    }

    const bookingDate = parseDateParam(date);

    if (!bookingDate) {
        return res.status(400).json({ message: 'date must be in YYYY-MM-DD or DD-MM-YYYY format.' });
    }

    try {
        const venues = await sequelize.query(
            `SELECT
                venues.*,
                CASE
                    WHEN booked_venues.venue_id IS NULL THEN 'Available'
                    ELSE 'Booked'
                END AS availability
             FROM venues
             LEFT JOIN (
                SELECT DISTINCT venue_id
                FROM venue_bookings
                WHERE booking_date = :date AND status = 'Confirmed'
             ) AS booked_venues ON booked_venues.venue_id = venues.id
             ORDER BY venues.name ASC`,
            {
                replacements: { date: bookingDate },
                type: QueryTypes.SELECT,
            }
        );

        return res.json(venues);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch venue availability.', error: error.message });
    }
});

router.get('/bookings', async (req, res) => {
    const { status } = req.query;
    const replacements = {};
    let whereClause = '';

    if (status) {
        whereClause = 'WHERE venue_bookings.status = :status';
        replacements.status = status;
    }

    try {
        const bookings = await sequelize.query(
            `SELECT
                venue_bookings.id,
                venue_bookings.member_id,
                venue_bookings.venue_id,
                members.full_name AS member_full_name,
                venues.name AS venue_name,
                venue_bookings.booking_date,
                venue_bookings.start_time,
                venue_bookings.end_time,
                venue_bookings.purpose,
                venue_bookings.total_charge,
                venue_bookings.status,
                venue_bookings.created_at
             FROM venue_bookings
             INNER JOIN members ON members.id = venue_bookings.member_id
             INNER JOIN venues ON venues.id = venue_bookings.venue_id
             ${whereClause}
             ORDER BY venue_bookings.booking_date DESC, venue_bookings.start_time ASC`,
            {
                replacements,
                type: QueryTypes.SELECT,
            }
        );

        return res.json(bookings);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch venue bookings.', error: error.message });
    }
});

router.post('/bookings', async (req, res) => {
    const {
        venue_id,
        member_id,
        booking_date,
        start_time,
        end_time,
        purpose,
        total_charge,
    } = req.body;

    const requiredFields = {
        venue_id,
        member_id,
        booking_date,
        start_time,
        end_time,
        purpose,
    };
    const missingField = Object.keys(requiredFields).find((field) => !requiredFields[field]);

    if (missingField) {
        return res.status(400).json({ message: `${missingField} is required.` });
    }

    try {
        if (req.admin && req.admin.type === 'member') {
            const access = await getMemberAccess(req.admin.id);

            if (!access.can_use_privileges) {
                return res.status(403).json({ message: getPrivilegeBlockMessage(access) });
            }
        }

        const result = await sequelize.query(
            `INSERT INTO venue_bookings
                (venue_id, member_id, booking_date, start_time, end_time, purpose, total_charge)
             VALUES
                (:venue_id, :member_id, :booking_date, :start_time, :end_time, :purpose, :total_charge)`,
            {
                replacements: {
                    venue_id,
                    member_id,
                    booking_date,
                    start_time,
                    end_time,
                    purpose,
                    total_charge: total_charge || 0,
                },
                type: QueryTypes.INSERT,
            }
        );

        const bookings = await sequelize.query(
            `SELECT
                venue_bookings.*,
                members.full_name AS member_full_name,
                venues.name AS venue_name
             FROM venue_bookings
             INNER JOIN members ON members.id = venue_bookings.member_id
             INNER JOIN venues ON venues.id = venue_bookings.venue_id
             WHERE venue_bookings.id = :id
             LIMIT 1`,
            {
                replacements: { id: result[0] },
                type: QueryTypes.SELECT,
            }
        );

        return res.status(201).json(bookings[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to create venue booking.', error: error.message });
    }
});

router.put('/bookings/:id', async (req, res) => {
    const { status } = req.body;

    if (!['Confirmed', 'Cancelled'].includes(status)) {
        return res.status(400).json({ message: 'Status must be Confirmed or Cancelled.' });
    }

    try {
        const bookings = await sequelize.query(
            'SELECT id FROM venue_bookings WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!bookings[0]) {
            return res.status(404).json({ message: 'Venue booking not found.' });
        }

        await sequelize.query(
            'UPDATE venue_bookings SET status = :status WHERE id = :id',
            {
                replacements: {
                    status,
                    id: req.params.id,
                },
                type: QueryTypes.UPDATE,
            }
        );

        const updatedBookings = await sequelize.query(
            `SELECT
                venue_bookings.*,
                members.full_name AS member_full_name,
                venues.name AS venue_name
             FROM venue_bookings
             INNER JOIN members ON members.id = venue_bookings.member_id
             INNER JOIN venues ON venues.id = venue_bookings.venue_id
             WHERE venue_bookings.id = :id
             LIMIT 1`,
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        writeAuditLog({
            module: 'Bookings',
            action: 'Booking Updated',
            entityId: req.params.id,
            description: `Venue booking marked as ${status}`,
            adminId: req.admin.id,
        });

        return res.json(updatedBookings[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update venue booking.', error: error.message });
    }
});

module.exports = router;

function parseDateParam(date) {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return validateDateParts(year, month, day);
    }

    const dayFirstMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(date);

    if (!dayFirstMatch) {
        return null;
    }

    const [, day, month, year] = dayFirstMatch;
    return validateDateParts(year, month, day);
}

function validateDateParts(year, month, day) {
    const parsedDate = new Date(`${year}-${month}-${day}T00:00:00Z`);

    if (
        parsedDate.getUTCFullYear() !== Number(year) ||
        parsedDate.getUTCMonth() + 1 !== Number(month) ||
        parsedDate.getUTCDate() !== Number(day)
    ) {
        return null;
    }

    return `${year}-${month}-${day}`;
}
