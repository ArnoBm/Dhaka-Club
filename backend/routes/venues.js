const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');
const writeAuditLog = require('../utils/auditLog');
const { getMemberAccess, getPrivilegeBlockMessage } = require('../utils/memberAccess');

const router = express.Router();

router.use(auth);

const VENUE_SHIFTS = {
    Morning: {
        label: 'Morning (11:00 AM - 5:00 PM)',
        start_time: '11:00:00',
        end_time: '17:00:00',
    },
    Evening: {
        label: 'Evening (6:00 PM - 12:00 AM)',
        start_time: '18:00:00',
        end_time: '23:59:00',
    },
};

const ACTIVE_BOOKING_STATUSES = ['Pending', 'Confirmed'];

router.get('/', async (req, res) => {
    try {
        await ensureVenueBookingSchema();

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
        await ensureVenueBookingSchema();

        const venues = await sequelize.query(
            `SELECT
                venues.*,
                COALESCE(booked_venues.booked_shift_count, 0) AS booked_shift_count,
                COALESCE(booked_venues.morning_status, 'Available') AS morning_status,
                COALESCE(booked_venues.evening_status, 'Available') AS evening_status,
                CASE
                    WHEN COALESCE(booked_venues.booked_shift_count, 0) = 0 THEN 'Available'
                    WHEN COALESCE(booked_venues.booked_shift_count, 0) >= 2 THEN 'Booked'
                    ELSE 'Partially Booked'
                END AS availability
             FROM venues
             LEFT JOIN (
                SELECT
                    venue_id,
                    COUNT(DISTINCT booking_shift) AS booked_shift_count,
                    MAX(CASE WHEN booking_shift = 'Morning' THEN status END) AS morning_status,
                    MAX(CASE WHEN booking_shift = 'Evening' THEN status END) AS evening_status
                FROM venue_bookings
                WHERE booking_date = :date AND status IN ('Pending', 'Confirmed')
                GROUP BY venue_id
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
        await ensureVenueBookingSchema();

        const bookings = await sequelize.query(
            `SELECT
                venue_bookings.id,
                venue_bookings.member_id,
                venue_bookings.venue_id,
                members.full_name AS member_full_name,
                venues.name AS venue_name,
                venue_bookings.booking_date,
                venue_bookings.booking_shift,
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
        booking_shift,
        purpose,
        total_charge,
    } = req.body;

    const selectedShift = normalizeBookingShift(booking_shift, start_time, end_time);

    const requiredFields = {
        venue_id,
        member_id,
        booking_date,
        booking_shift: selectedShift,
        purpose,
    };
    const missingField = Object.keys(requiredFields).find((field) => !requiredFields[field]);

    if (missingField) {
        return res.status(400).json({ message: `${missingField} is required.` });
    }

    try {
        await ensureVenueBookingSchema();

        if (req.admin && req.admin.type === 'member') {
            const access = await getMemberAccess(req.admin.id);

            if (!access.can_use_privileges) {
                return res.status(403).json({ message: getPrivilegeBlockMessage(access) });
            }
        }

        const conflict = await findBookingConflict({
            venueId: venue_id,
            bookingDate: booking_date,
            shift: selectedShift,
        });

        if (conflict) {
            return res.status(409).json({
                message: `${conflict.venue_name || 'This venue'} is already booked for ${shiftLabel(selectedShift)} on this date.`,
            });
        }

        const shift = VENUE_SHIFTS[selectedShift];

        const result = await sequelize.query(
            `INSERT INTO venue_bookings
                (venue_id, member_id, booking_date, booking_shift, start_time, end_time, purpose, total_charge)
             VALUES
                (:venue_id, :member_id, :booking_date, :booking_shift, :start_time, :end_time, :purpose, :total_charge)`,
            {
                replacements: {
                    venue_id,
                    member_id,
                    booking_date,
                    booking_shift: selectedShift,
                    start_time: shift.start_time,
                    end_time: shift.end_time,
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
        await ensureVenueBookingSchema();

        const bookings = await sequelize.query(
            `SELECT venue_bookings.id, venue_bookings.venue_id, venue_bookings.booking_date,
                    venue_bookings.booking_shift, venues.name AS venue_name
             FROM venue_bookings
             INNER JOIN venues ON venues.id = venue_bookings.venue_id
             WHERE venue_bookings.id = :id
             LIMIT 1`,
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!bookings[0]) {
            return res.status(404).json({ message: 'Venue booking not found.' });
        }

        if (status === 'Confirmed') {
            const conflict = await findBookingConflict({
                venueId: bookings[0].venue_id,
                bookingDate: bookings[0].booking_date,
                shift: bookings[0].booking_shift,
                excludeId: req.params.id,
            });

            if (conflict) {
                return res.status(409).json({
                    message: `${bookings[0].venue_name || 'This venue'} already has a booking for ${shiftLabel(bookings[0].booking_shift)} on this date.`,
                });
            }
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

async function ensureVenueBookingSchema() {
    await addVenueBookingColumn('booking_shift', "ENUM('Morning', 'Evening') NULL AFTER booking_date");

    await sequelize.query(
        `UPDATE venue_bookings
         SET booking_shift = CASE
            WHEN TIME(start_time) = '11:00:00' AND TIME(end_time) = '17:00:00' THEN 'Morning'
            WHEN TIME(start_time) >= '18:00:00' THEN 'Evening'
            ELSE 'Morning'
         END
         WHERE booking_shift IS NULL`
    );

    await sequelize.query(
        `UPDATE venue_bookings
         SET start_time = CASE booking_shift
            WHEN 'Morning' THEN '11:00:00'
            WHEN 'Evening' THEN '18:00:00'
            ELSE start_time
         END,
         end_time = CASE booking_shift
            WHEN 'Morning' THEN '17:00:00'
            WHEN 'Evening' THEN '23:59:00'
            ELSE end_time
         END
         WHERE booking_shift IN ('Morning', 'Evening')`
    );

    await sequelize.query(
        `ALTER TABLE venue_bookings
         MODIFY booking_shift ENUM('Morning', 'Evening') NOT NULL`
    ).catch(() => null);

    await addVenueBookingIndex();
}

async function addVenueBookingColumn(columnName, definition) {
    try {
        await sequelize.query(`ALTER TABLE venue_bookings ADD COLUMN ${columnName} ${definition}`);
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
            return;
        }

        throw error;
    }
}

async function addVenueBookingIndex() {
    try {
        await sequelize.query('ALTER TABLE venue_bookings ADD KEY idx_venue_bookings_shift (venue_id, booking_date, booking_shift, status)');
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_KEYNAME') {
            return;
        }

        throw error;
    }
}

async function findBookingConflict({ venueId, bookingDate, shift, excludeId = null }) {
    const rows = await sequelize.query(
        `SELECT venue_bookings.id, venues.name AS venue_name
         FROM venue_bookings
         INNER JOIN venues ON venues.id = venue_bookings.venue_id
         WHERE venue_bookings.venue_id = :venueId
           AND venue_bookings.booking_date = :bookingDate
           AND venue_bookings.booking_shift = :shift
           AND venue_bookings.status IN (:activeStatuses)
           ${excludeId ? 'AND venue_bookings.id != :excludeId' : ''}
         LIMIT 1`,
        {
            replacements: {
                venueId,
                bookingDate,
                shift,
                activeStatuses: ACTIVE_BOOKING_STATUSES,
                excludeId,
            },
            type: QueryTypes.SELECT,
        }
    );

    return rows[0] || null;
}

function normalizeBookingShift(bookingShift, startTime, endTime) {
    if (VENUE_SHIFTS[bookingShift]) {
        return bookingShift;
    }

    const start = String(startTime || '').slice(0, 5);
    const end = String(endTime || '').slice(0, 5);

    if (start === '11:00' && end === '17:00') {
        return 'Morning';
    }

    if (start === '18:00' && (end === '23:59' || end === '00:00')) {
        return 'Evening';
    }

    return null;
}

function shiftLabel(shift) {
    return VENUE_SHIFTS[shift]?.label || shift || 'selected shift';
}

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
