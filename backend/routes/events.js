const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');
const writeAuditLog = require('../utils/auditLog');
const { storeUploadedFile } = require('../utils/fileStorage');
const { getMemberAccess, getPrivilegeBlockMessage } = require('../utils/memberAccess');

const router = express.Router();
const coverDir = path.join(__dirname, '..', 'uploads', 'event-covers');

fs.mkdirSync(coverDir, { recursive: true });

const coverUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, callback) => {
            callback(null, coverDir);
        },
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
            callback(null, `event-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
        },
    }),
    fileFilter: (req, file, callback) => {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            callback(new Error('Only image files are allowed.'));
            return;
        }

        callback(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

router.use(auth);

const eventFields = [
    'title',
    'description',
    'event_date',
    'venue',
    'ticket_price',
    'total_seats',
    'available_seats',
    'requires_ticket',
    'cover_image',
    'status',
];

router.get('/', async (req, res) => {
    const { status } = req.query;
    const replacements = {};
    let whereClause = '';

    if (status) {
        whereClause = 'WHERE status = :status';
        replacements.status = status;
    }

    try {
        await ensureEventTables();

        const events = await sequelize.query(
            `SELECT * FROM events ${whereClause} ORDER BY event_date ASC`,
            {
                replacements,
                type: QueryTypes.SELECT,
            }
        );

        return res.json(await attachEventVariants(events));
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch events.', error: error.message });
    }
});

router.get('/my-passes', async (req, res) => {
    const memberId = req.admin && req.admin.id;
    const tokenType = req.admin && req.admin.type;

    if (tokenType !== 'member' || !memberId) {
        return res.status(403).json({ message: 'Only members can view event passes.' });
    }

    try {
        await ensureEventTables();

        const passes = await sequelize.query(
            `SELECT
                event_registrations.id,
                event_registrations.event_id,
                event_registrations.ticket_count,
                event_registrations.total_amount,
                event_registrations.payment_status,
                event_registrations.rsvp_status,
                event_registrations.entry_code,
                event_registrations.entry_status,
                event_registrations.entry_used_at,
                event_registrations.registered_at,
                events.title,
                events.event_date,
                events.venue,
                events.ticket_price,
                events.status
             FROM event_registrations
             INNER JOIN events ON events.id = event_registrations.event_id
             WHERE event_registrations.member_id = :member_id
                AND event_registrations.entry_status <> 'Cancelled'
                AND event_registrations.payment_status IN ('Paid', 'Free')
                AND NOW() < DATE_ADD(DATE(events.event_date), INTERVAL 4 DAY)
             ORDER BY events.event_date ASC`,
            {
                replacements: { member_id: memberId },
                type: QueryTypes.SELECT,
            }
        );

        const passesWithItems = await attachRegistrationItems(passes);

        return res.json(passesWithItems.map(addQrPayload));
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch event passes.', error: error.message });
    }
});

router.post('/entry/verify', async (req, res) => {
    const tokenType = req.admin && req.admin.type;
    const { entry_code } = req.body;

    if (tokenType === 'member') {
        return res.status(403).json({ message: 'Only admins can verify entry passes.' });
    }

    if (!entry_code) {
        return res.status(400).json({ message: 'entry_code is required.' });
    }

    try {
        await ensureEventTables();

        const registrations = await sequelize.query(
            `SELECT
                event_registrations.id,
                event_registrations.ticket_count,
                event_registrations.payment_status,
                event_registrations.entry_status,
                event_registrations.entry_used_at,
                members.full_name,
                members.member_id,
                events.title,
                events.event_date,
                events.venue
             FROM event_registrations
             INNER JOIN members ON members.id = event_registrations.member_id
             INNER JOIN events ON events.id = event_registrations.event_id
             WHERE event_registrations.entry_code = :entry_code
             LIMIT 1`,
            {
                replacements: { entry_code },
                type: QueryTypes.SELECT,
            }
        );

        const registration = registrations[0];

        if (!registration) {
            return res.status(404).json({ message: 'Entry pass not found.' });
        }

        if (!['Paid', 'Free'].includes(registration.payment_status)) {
            return res.status(400).json({ message: 'Payment is not completed for this pass.' });
        }

        if (registration.entry_status === 'Used') {
            return res.status(409).json({ message: 'This entry pass has already been used.', registration });
        }

        if (registration.entry_status !== 'Valid') {
            return res.status(400).json({ message: 'This entry pass is not valid.', registration });
        }

        const validity = getEntryPassValidity(registration.event_date);

        if (new Date() < validity.startsAt) {
            return res.status(400).json({ message: 'This entry pass is not valid yet.', registration });
        }

        if (new Date() > validity.expiresAt) {
            return res.status(400).json({ message: 'This entry pass has expired.', registration });
        }

        await sequelize.query(
            `UPDATE event_registrations
             SET entry_status = 'Used', entry_used_at = NOW()
             WHERE id = :id`,
            {
                replacements: { id: registration.id },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({
            message: 'Entry verified successfully.',
            registration: {
                ...registration,
                entry_status: 'Used',
                entry_used_at: new Date(),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to verify entry pass.', error: error.message });
    }
});

router.get('/:id/registrations', async (req, res) => {
    try {
        await ensureEventTables();

        const registrations = await sequelize.query(
            `SELECT
                event_registrations.id,
                event_registrations.event_id,
                members.full_name,
                members.member_id,
                members.phone,
                event_registrations.ticket_count,
                event_registrations.total_amount,
                event_registrations.rsvp_status,
                event_registrations.payment_status,
                event_registrations.entry_code,
                event_registrations.entry_status,
                event_registrations.registered_at
             FROM event_registrations
             INNER JOIN members ON members.id = event_registrations.member_id
             WHERE event_registrations.event_id = :id
             ORDER BY event_registrations.registered_at DESC`,
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        return res.json(await attachRegistrationItems(registrations));
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch event registrations.', error: error.message });
    }
});

router.put('/registrations/:registrationId/cancel', async (req, res) => {
    const tokenType = req.admin && req.admin.type;

    if (tokenType === 'member') {
        return res.status(403).json({ message: 'Only admins can cancel event purchases.' });
    }

        await ensureEventTables();

    const transaction = await sequelize.transaction();

    try {
        const registrations = await sequelize.query(
            `SELECT
                event_registrations.id,
                event_registrations.event_id,
                event_registrations.ticket_count,
                event_registrations.entry_status,
                events.total_seats,
                events.available_seats
             FROM event_registrations
             INNER JOIN events ON events.id = event_registrations.event_id
             WHERE event_registrations.id = :id
             LIMIT 1
             FOR UPDATE`,
            {
                replacements: { id: req.params.registrationId },
                type: QueryTypes.SELECT,
                transaction,
            }
        );

        const registration = registrations[0];

        if (!registration) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Registration not found.' });
        }

        if (registration.entry_status === 'Cancelled') {
            await transaction.rollback();
            return res.status(409).json({ message: 'This purchase is already cancelled.' });
        }

        if (registration.entry_status === 'Used') {
            await transaction.rollback();
            return res.status(400).json({ message: 'Used entry passes cannot be cancelled.' });
        }

        await sequelize.query(
            `UPDATE event_registrations
             SET entry_status = 'Cancelled', rsvp_status = 'Not Attending'
             WHERE id = :id`,
            {
                replacements: { id: registration.id },
                type: QueryTypes.UPDATE,
                transaction,
            }
        );

        await sequelize.query(
            `UPDATE events
             SET available_seats = LEAST(total_seats, available_seats + :ticket_count)
             WHERE id = :event_id`,
            {
                replacements: {
                    ticket_count: registration.ticket_count,
                    event_id: registration.event_id,
                },
                type: QueryTypes.UPDATE,
                transaction,
            }
        );

        const updatedEvents = await sequelize.query(
            'SELECT * FROM events WHERE id = :id LIMIT 1',
            {
                replacements: { id: registration.event_id },
                type: QueryTypes.SELECT,
                transaction,
            }
        );

        await transaction.commit();

        return res.json({
            message: 'Purchase cancelled and seats restored successfully.',
            event: updatedEvents[0],
        });
    } catch (error) {
        await transaction.rollback();
        return res.status(500).json({ message: 'Failed to cancel purchase.', error: error.message });
    }
});

router.post('/:id/register', async (req, res) => {
    const memberId = req.admin && req.admin.id;
    const tokenType = req.admin && req.admin.type;
    const requestedItems = parsePurchaseItems(req.body.ticket_items);
    const ticketCount = Number(req.body.ticket_count || 1);

    if (tokenType !== 'member' || !memberId) {
        return res.status(403).json({ message: 'Only members can register for events.' });
    }

    if (!requestedItems.length && (!Number.isInteger(ticketCount) || ticketCount < 1)) {
        return res.status(400).json({ message: 'ticket_count must be at least 1.' });
    }

    await ensureEventTables();

    const transaction = await sequelize.transaction();

    try {
        const access = await getMemberAccess(memberId, transaction);

        if (!access.can_use_privileges) {
            await transaction.rollback();
            return res.status(403).json({ message: getPrivilegeBlockMessage(access) });
        }

        const events = await sequelize.query(
            `SELECT id, title, ticket_price, total_seats, available_seats, requires_ticket, status
             FROM events
             WHERE id = :id
             LIMIT 1
             FOR UPDATE`,
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
                transaction,
            }
        );

        const event = events[0];

        if (!event) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Event not found.' });
        }

        if (event.status !== 'Ongoing') {
            await transaction.rollback();
            return res.status(400).json({ message: 'Ticket purchase is only available for ongoing events.' });
        }

        const existingRegistrations = await sequelize.query(
            `SELECT id, entry_status
             FROM event_registrations
             WHERE event_id = :event_id AND member_id = :member_id
             LIMIT 1`,
            {
                replacements: {
                    event_id: event.id,
                    member_id: memberId,
                },
                type: QueryTypes.SELECT,
                transaction,
            }
        );

        const existingRegistration = existingRegistrations[0];

        if (existingRegistration && existingRegistration.entry_status !== 'Cancelled') {
            await transaction.rollback();
            return res.status(409).json({ message: 'You have already registered for this event.' });
        }

        const activeVariants = await getEventVariants(event.id, transaction);
        const purchase = buildPurchaseSummary({
            event,
            variants: activeVariants,
            requestedItems,
            ticketCount,
        });

        if (event.available_seats < purchase.seatCount) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Not enough seats available.' });
        }

        const totalAmount = purchase.totalAmount;
        const paymentStatus = totalAmount > 0 ? 'Paid' : 'Free';
        const entryCode = createEntryCode(event.id, memberId);

        let registrationId = existingRegistration && existingRegistration.id;

        if (existingRegistration) {
            await sequelize.query(
                `UPDATE event_registrations
                 SET ticket_count = :ticket_count,
                    total_amount = :total_amount,
                    payment_status = :payment_status,
                    payment_verified_at = :payment_verified_at,
                    rsvp_status = 'Attending',
                    entry_code = :entry_code,
                    entry_status = 'Valid',
                    entry_used_at = NULL,
                    registered_at = CURRENT_TIMESTAMP
                 WHERE id = :id`,
                {
                    replacements: {
                        id: existingRegistration.id,
                        ticket_count: purchase.seatCount,
                        total_amount: totalAmount,
                        payment_status: paymentStatus,
                        payment_verified_at: totalAmount > 0 ? new Date() : null,
                        entry_code: entryCode,
                    },
                    type: QueryTypes.UPDATE,
                    transaction,
                }
            );
        } else {
            const insertResult = await sequelize.query(
                `INSERT INTO event_registrations
                    (event_id, member_id, ticket_count, total_amount, payment_status, payment_verified_at, rsvp_status, entry_code, entry_status)
                 VALUES
                    (:event_id, :member_id, :ticket_count, :total_amount, :payment_status, :payment_verified_at, 'Attending', :entry_code, 'Valid')`,
                {
                    replacements: {
                        event_id: event.id,
                        member_id: memberId,
                        ticket_count: purchase.seatCount,
                        total_amount: totalAmount,
                        payment_status: paymentStatus,
                        payment_verified_at: totalAmount > 0 ? new Date() : null,
                        entry_code: entryCode,
                    },
                    type: QueryTypes.INSERT,
                    transaction,
                }
            );

            registrationId = insertResult[0];
        }

        await sequelize.query(
            'DELETE FROM event_registration_items WHERE registration_id = :registration_id',
            {
                replacements: { registration_id: registrationId },
                type: QueryTypes.DELETE,
                transaction,
            }
        );

        for (const item of purchase.items) {
            await sequelize.query(
                `INSERT INTO event_registration_items
                    (registration_id, ticket_variant_id, ticket_name_snapshot, unit_price_snapshot, seat_count_snapshot, quantity, line_total)
                 VALUES
                    (:registration_id, :ticket_variant_id, :ticket_name_snapshot, :unit_price_snapshot, :seat_count_snapshot, :quantity, :line_total)`,
                {
                    replacements: {
                        registration_id: registrationId,
                        ticket_variant_id: item.ticket_variant_id,
                        ticket_name_snapshot: item.ticket_name_snapshot,
                        unit_price_snapshot: item.unit_price_snapshot,
                        seat_count_snapshot: item.seat_count_snapshot,
                        quantity: item.quantity,
                        line_total: item.line_total,
                    },
                    type: QueryTypes.INSERT,
                    transaction,
                }
            );
        }

        await sequelize.query(
            `UPDATE events
             SET available_seats = available_seats - :seat_count
             WHERE id = :event_id`,
            {
                replacements: {
                    seat_count: purchase.seatCount,
                    event_id: event.id,
                },
                type: QueryTypes.UPDATE,
                transaction,
            }
        );

        const updatedEvents = await sequelize.query(
            'SELECT * FROM events WHERE id = :id LIMIT 1',
            {
                replacements: { id: event.id },
                type: QueryTypes.SELECT,
                transaction,
            }
        );

        const registrations = await sequelize.query(
            `SELECT
                event_registrations.id,
                event_registrations.event_id,
                event_registrations.ticket_count,
                event_registrations.total_amount,
                event_registrations.payment_status,
                event_registrations.rsvp_status,
                event_registrations.entry_code,
                event_registrations.entry_status,
                event_registrations.registered_at,
                events.title,
                events.event_date,
                events.venue,
                events.ticket_price,
                events.status
             FROM event_registrations
             INNER JOIN events ON events.id = event_registrations.event_id
             WHERE event_registrations.id = :id
             LIMIT 1`,
            {
                replacements: { id: registrationId },
                type: QueryTypes.SELECT,
                transaction,
            }
        );

        await transaction.commit();
        const passesWithItems = await attachRegistrationItems(registrations);

        return res.status(201).json({
            message: totalAmount > 0 ? 'Demo payment completed. Your entry pass is ready.' : 'Event registration successful. Your entry pass is ready.',
            event: updatedEvents[0],
            pass: addQrPayload(passesWithItems[0]),
        });
    } catch (error) {
        await transaction.rollback();
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }

        return res.status(500).json({ message: 'Failed to register for event.', error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        await ensureEventTables();

        const events = await sequelize.query(
            'SELECT * FROM events WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!events[0]) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        const eventsWithVariants = await attachEventVariants(events);

        return res.json(eventsWithVariants[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch event.', error: error.message });
    }
});

router.post('/', coverUpload.single('cover_image_file'), async (req, res) => {
    const data = pickFields(req.body, eventFields);
    if (req.file) {
        data.cover_image = await storeUploadedFile(req.file, {
            folder: 'dhaka-club/event-covers',
            fallbackPath: `/uploads/event-covers/${req.file.filename}`,
            resourceType: 'image',
        });
    }
    normalizeEventData(data);

    const createdBy = req.admin && req.admin.id;
    const requiredFields = ['title', 'event_date', 'venue', 'total_seats', 'available_seats'];
    const missingField = requiredFields.find((field) => data[field] === undefined || data[field] === null || data[field] === '');

    if (missingField) {
        return res.status(400).json({ message: `${missingField} is required.` });
    }

    if (!createdBy) {
        return res.status(401).json({ message: 'Authentication token is invalid.' });
    }

    try {
        await ensureEventTables();

        const insertData = {
            ...data,
            created_by: createdBy,
        };
        const columns = Object.keys(insertData);
        const placeholders = columns.map((column) => `:${column}`);

        const result = await sequelize.query(
            `INSERT INTO events (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            {
                replacements: insertData,
                type: QueryTypes.INSERT,
            }
        );

        const events = await sequelize.query(
            'SELECT * FROM events WHERE id = :id LIMIT 1',
            {
                replacements: { id: result[0] },
                type: QueryTypes.SELECT,
            }
        );

        await saveEventVariants(result[0], parseTicketVariants(req.body.ticket_variants), null);
        const eventsWithVariants = await attachEventVariants(events);

        writeAuditLog({
            module: 'Events',
            action: 'Event Changed',
            entityId: result[0],
            description: `Created event ${events[0]?.title || result[0]}`,
            adminId: req.admin.id,
        });

        return res.status(201).json(eventsWithVariants[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to create event.', error: error.message });
    }
});

router.put('/:id', coverUpload.single('cover_image_file'), async (req, res) => {
    const data = pickFields(req.body, eventFields);
    if (req.file) {
        data.cover_image = await storeUploadedFile(req.file, {
            folder: 'dhaka-club/event-covers',
            fallbackPath: `/uploads/event-covers/${req.file.filename}`,
            resourceType: 'image',
        });
    }
    normalizeEventData(data);

    const fields = Object.keys(data);

    if (!fields.length) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        await ensureEventTables();

        const existingEvents = await sequelize.query(
            'SELECT id FROM events WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!existingEvents[0]) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        const setClause = fields.map((field) => `${field} = :${field}`).join(', ');

        await sequelize.query(
            `UPDATE events SET ${setClause} WHERE id = :id`,
            {
                replacements: {
                    ...data,
                    id: req.params.id,
                },
                type: QueryTypes.UPDATE,
            }
        );

        await saveEventVariants(req.params.id, parseTicketVariants(req.body.ticket_variants), null);

        const events = await sequelize.query(
            'SELECT * FROM events WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );
        const eventsWithVariants = await attachEventVariants(events);

        writeAuditLog({
            module: 'Events',
            action: 'Event Changed',
            entityId: req.params.id,
            description: `Updated event ${events[0]?.title || req.params.id}`,
            adminId: req.admin.id,
        });

        return res.json(eventsWithVariants[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update event.', error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const existingEvents = await sequelize.query(
            'SELECT id FROM events WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!existingEvents[0]) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        await sequelize.query(
            `DELETE event_registration_items FROM event_registration_items
             INNER JOIN event_registrations ON event_registrations.id = event_registration_items.registration_id
             WHERE event_registrations.event_id = :id`,
            {
                replacements: { id: req.params.id },
                type: QueryTypes.DELETE,
            }
        );

        await sequelize.query(
            'DELETE FROM event_registrations WHERE event_id = :id',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.DELETE,
            }
        );

        await sequelize.query(
            'DELETE FROM event_ticket_variants WHERE event_id = :id',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.DELETE,
            }
        );

        await sequelize.query(
            'DELETE FROM events WHERE id = :id',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.DELETE,
            }
        );

        writeAuditLog({
            module: 'Events',
            action: 'Event Changed',
            entityId: req.params.id,
            description: `Deleted event #${req.params.id}`,
            adminId: req.admin.id,
        });

        return res.json({ message: 'Event and registrations deleted successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to delete event.', error: error.message });
    }
});

function pickFields(source, fields) {
    return fields.reduce((picked, field) => {
        if (Object.prototype.hasOwnProperty.call(source, field)) {
            picked[field] = source[field];
        }

        return picked;
    }, {});
}

function normalizeEventData(data) {
    if (Object.prototype.hasOwnProperty.call(data, 'requires_ticket')) {
        data.requires_ticket = ['true', '1', 'on', 'yes'].includes(String(data.requires_ticket).toLowerCase()) ? 1 : 0;
    }

    if (Object.prototype.hasOwnProperty.call(data, 'cover_image') && !data.cover_image) {
        data.cover_image = null;
    }
}

async function ensureEventTables() {
    await ensureEventRegistrationPassColumns();
    await addRegistrationColumn('payment_verified_at', 'DATETIME NULL AFTER payment_status');
    await sequelize.query(
        `CREATE TABLE IF NOT EXISTS event_ticket_variants (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            event_id BIGINT UNSIGNED NOT NULL,
            name VARCHAR(150) NOT NULL,
            description VARCHAR(255) NULL,
            price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            seat_count INT UNSIGNED NOT NULL DEFAULT 1,
            max_quantity_per_order INT UNSIGNED NULL,
            sort_order INT UNSIGNED NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL,
            PRIMARY KEY (id),
            KEY idx_event_ticket_variants_event_id (event_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
    );
    await sequelize.query(
        `CREATE TABLE IF NOT EXISTS event_registration_items (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            registration_id BIGINT UNSIGNED NOT NULL,
            ticket_variant_id BIGINT UNSIGNED NULL,
            ticket_name_snapshot VARCHAR(150) NOT NULL,
            unit_price_snapshot DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            seat_count_snapshot INT UNSIGNED NOT NULL DEFAULT 1,
            quantity INT UNSIGNED NOT NULL DEFAULT 1,
            line_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_event_registration_items_registration_id (registration_id),
            KEY idx_event_registration_items_variant_id (ticket_variant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
    );
}

function getPublicBaseURL() {
    return (process.env.PUBLIC_API_BASE_URL || process.env.APP_PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
}

async function attachEventVariants(events, transaction) {
    if (!events.length) {
        return events;
    }

    const variants = await sequelize.query(
        `SELECT *
         FROM event_ticket_variants
         WHERE event_id IN (:ids)
         ORDER BY sort_order ASC, id ASC`,
        {
            replacements: { ids: events.map((event) => event.id) },
            type: QueryTypes.SELECT,
            transaction,
        }
    );
    const variantsByEvent = variants.reduce((mapped, variant) => {
        const eventId = Number(variant.event_id);
        mapped[eventId] = mapped[eventId] || [];
        mapped[eventId].push(formatVariant(variant));
        return mapped;
    }, {});

    return events.map((event) => ({
        ...event,
        ticket_variants: variantsByEvent[Number(event.id)] || [],
    }));
}

async function attachRegistrationItems(registrations, transaction) {
    if (!registrations.length) {
        return registrations;
    }

    const items = await sequelize.query(
        `SELECT *
         FROM event_registration_items
         WHERE registration_id IN (:ids)
         ORDER BY id ASC`,
        {
            replacements: { ids: registrations.map((registration) => registration.id) },
            type: QueryTypes.SELECT,
            transaction,
        }
    );
    const itemsByRegistration = items.reduce((mapped, item) => {
        const registrationId = Number(item.registration_id);
        mapped[registrationId] = mapped[registrationId] || [];
        mapped[registrationId].push({
            ...item,
            unit_price_snapshot: Number(item.unit_price_snapshot || 0),
            seat_count_snapshot: Number(item.seat_count_snapshot || 0),
            quantity: Number(item.quantity || 0),
            line_total: Number(item.line_total || 0),
        });
        return mapped;
    }, {});

    return registrations.map((registration) => ({
        ...registration,
        ticket_items: itemsByRegistration[Number(registration.id)] || [],
    }));
}

async function getEventVariants(eventId, transaction) {
    const variants = await sequelize.query(
        `SELECT *
         FROM event_ticket_variants
         WHERE event_id = :event_id AND is_active = TRUE
         ORDER BY sort_order ASC, id ASC`,
        {
            replacements: { event_id: eventId },
            type: QueryTypes.SELECT,
            transaction,
        }
    );

    return variants.map(formatVariant);
}

async function saveEventVariants(eventId, variants, transaction) {
    await sequelize.query(
        'DELETE FROM event_ticket_variants WHERE event_id = :event_id',
        {
            replacements: { event_id: eventId },
            type: QueryTypes.DELETE,
            transaction,
        }
    );

    for (const [index, variant] of variants.entries()) {
        await sequelize.query(
            `INSERT INTO event_ticket_variants
                (event_id, name, description, price, seat_count, max_quantity_per_order, sort_order, is_active)
             VALUES
                (:event_id, :name, :description, :price, :seat_count, :max_quantity_per_order, :sort_order, :is_active)`,
            {
                replacements: {
                    event_id: eventId,
                    name: variant.name,
                    description: variant.description || null,
                    price: variant.price,
                    seat_count: variant.seat_count,
                    max_quantity_per_order: variant.max_quantity_per_order || null,
                    sort_order: variant.sort_order ?? index,
                    is_active: variant.is_active ? 1 : 0,
                },
                type: QueryTypes.INSERT,
                transaction,
            }
        );
    }
}

function parseTicketVariants(value) {
    const rawVariants = parseJsonArray(value);

    return rawVariants
        .map((variant, index) => ({
            name: String(variant.name || '').trim(),
            description: String(variant.description || '').trim(),
            price: Number(variant.price || 0),
            seat_count: Math.max(Number(variant.seat_count || 0), 0),
            max_quantity_per_order: variant.max_quantity_per_order ? Number(variant.max_quantity_per_order) : null,
            sort_order: Number.isFinite(Number(variant.sort_order)) ? Number(variant.sort_order) : index,
            is_active: variant.is_active !== false,
        }))
        .filter((variant) => variant.name && Number.isFinite(variant.price) && variant.price >= 0);
}

function parsePurchaseItems(value) {
    return parseJsonArray(value)
        .map((item) => ({
            ticket_variant_id: Number(item.ticket_variant_id || item.id || 0),
            quantity: Number(item.quantity || 0),
        }))
        .filter((item) => Number.isInteger(item.ticket_variant_id) && item.ticket_variant_id > 0 && Number.isInteger(item.quantity) && item.quantity > 0);
}

function parseJsonArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function buildPurchaseSummary({ event, variants, requestedItems, ticketCount }) {
    if (!variants.length) {
        const unitPrice = Number(event.ticket_price || 0);
        return {
            seatCount: ticketCount,
            totalAmount: unitPrice * ticketCount,
            items: [
                {
                    ticket_variant_id: null,
                    ticket_name_snapshot: 'Entry Ticket',
                    unit_price_snapshot: unitPrice,
                    seat_count_snapshot: 1,
                    quantity: ticketCount,
                    line_total: unitPrice * ticketCount,
                },
            ],
        };
    }

    if (!requestedItems.length) {
        const error = new Error('Select at least one ticket option.');
        error.statusCode = 400;
        throw error;
    }

    const variantsById = new Map(variants.map((variant) => [Number(variant.id), variant]));
    const items = requestedItems.map((item) => {
        const variant = variantsById.get(item.ticket_variant_id);

        if (!variant) {
            const error = new Error('One or more selected ticket options are unavailable.');
            error.statusCode = 400;
            throw error;
        }

        if (variant.max_quantity_per_order && item.quantity > variant.max_quantity_per_order) {
            const error = new Error(`${variant.name} allows maximum ${variant.max_quantity_per_order} per order.`);
            error.statusCode = 400;
            throw error;
        }

        const unitPrice = Number(variant.price || 0);
        const seatCount = getVariantSeatCount(variant);

        return {
            ticket_variant_id: variant.id,
            ticket_name_snapshot: variant.name,
            unit_price_snapshot: unitPrice,
            seat_count_snapshot: seatCount,
            quantity: item.quantity,
            line_total: unitPrice * item.quantity,
        };
    });
    const seatCount = items.reduce((sum, item) => sum + (item.seat_count_snapshot * item.quantity), 0);
    const entryItemCount = items.filter((item) => item.seat_count_snapshot > 0).length;

    if (variants.some(isEntryVariant) && seatCount < 1) {
        const error = new Error('Select at least one entry ticket.');
        error.statusCode = 400;
        throw error;
    }

    if (entryItemCount > 1) {
        const error = new Error('Select only one entry ticket type.');
        error.statusCode = 400;
        throw error;
    }

    return {
        seatCount,
        totalAmount: items.reduce((sum, item) => sum + item.line_total, 0),
        items,
    };
}

function formatVariant(variant) {
    return {
        ...variant,
        price: Number(variant.price || 0),
        seat_count: getVariantSeatCount(variant),
        max_quantity_per_order: variant.max_quantity_per_order ? Number(variant.max_quantity_per_order) : null,
        sort_order: Number(variant.sort_order || 0),
        is_active: Boolean(variant.is_active),
    };
}

function isEntryVariant(variant) {
    return getVariantSeatCount(variant) > 0;
}

function getVariantSeatCount(variant) {
    const name = String(variant?.name || '').toLowerCase();
    const isAddOn = name.includes('driver') || name.includes('add-on') || name.includes('addon');

    if (isAddOn) {
        return 0;
    }

    return Number(variant?.seat_count || 0);
}

async function ensureEventRegistrationPassColumns() {
    const columns = await sequelize.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_registrations'
            AND COLUMN_NAME IN ('entry_code', 'entry_status', 'entry_used_at')`,
        { type: QueryTypes.SELECT }
    );
    const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));

    if (!existingColumns.has('entry_code')) {
        await sequelize.query(
            'ALTER TABLE event_registrations ADD COLUMN entry_code VARCHAR(120) NULL AFTER rsvp_status',
            { type: QueryTypes.RAW }
        );
    }

    if (!existingColumns.has('entry_status')) {
        await sequelize.query(
            "ALTER TABLE event_registrations ADD COLUMN entry_status ENUM('Valid', 'Used', 'Cancelled') NOT NULL DEFAULT 'Valid' AFTER entry_code",
            { type: QueryTypes.RAW }
        );
    }

    if (!existingColumns.has('entry_used_at')) {
        await sequelize.query(
            'ALTER TABLE event_registrations ADD COLUMN entry_used_at DATETIME NULL AFTER entry_status',
            { type: QueryTypes.RAW }
        );
    }

    const indexes = await sequelize.query(
        `SELECT INDEX_NAME
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'event_registrations'
            AND INDEX_NAME = 'uq_event_registrations_entry_code'`,
        { type: QueryTypes.SELECT }
    );

    if (!indexes.length) {
        await sequelize.query(
            'ALTER TABLE event_registrations ADD UNIQUE KEY uq_event_registrations_entry_code (entry_code)',
            { type: QueryTypes.RAW }
        );
    }
}

async function addRegistrationColumn(columnName, definition) {
    try {
        await sequelize.query(`ALTER TABLE event_registrations ADD COLUMN ${columnName} ${definition}`);
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
            return;
        }

        throw error;
    }
}

function createEntryCode(eventId, memberId) {
    const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase();
    return `DC-EVT-${eventId}-${memberId}-${Date.now()}-${randomPart}`;
}

function addQrPayload(pass) {
    if (!pass) {
        return pass;
    }

    const validity = getEntryPassValidity(pass.event_date);

    return {
        ...pass,
        valid_from: validity.startsAt,
        valid_until: validity.expiresAt,
        qr_payload: JSON.stringify({
            type: 'DhakaClubEventPass',
            entry_code: pass.entry_code,
            event_id: pass.event_id,
            registration_id: pass.id,
        }),
    };
}

function getEntryPassValidity(eventDate) {
    const date = new Date(eventDate);
    const startsAt = new Date(date);
    startsAt.setHours(0, 1, 0, 0);

    const expiresAt = new Date(date);
    expiresAt.setHours(23, 59, 59, 999);

    return { startsAt, expiresAt };
}

router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError || error.message) {
        return res.status(400).json({
            message: error.code === 'LIMIT_FILE_SIZE' ? 'Cover image must be 5MB or smaller.' : error.message,
        });
    }

    return next(error);
});

module.exports = router;
