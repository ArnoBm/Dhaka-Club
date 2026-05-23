const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

let setupPromise = null;

router.get('/', async (req, res) => {
    const { status, provider, search, source_type } = req.query;
    const where = [];
    const replacements = {};

    if (status) {
        where.push('ledger.status = :status');
        replacements.status = status;
    }

    if (provider) {
        where.push('ledger.provider = :provider');
        replacements.provider = provider;
    }

    if (source_type) {
        where.push('ledger.related_type = :source_type');
        replacements.source_type = source_type;
    }

    if (search) {
        where.push('(ledger.invoice_no LIKE :search OR ledger.reference_no LIKE :search OR ledger.full_name LIKE :search OR ledger.member_code LIKE :search OR ledger.purpose LIKE :search)');
        replacements.search = `%${search}%`;
    }

    try {
        await ensureTables();

        const payments = await sequelize.query(
            `SELECT *
             FROM (
                ${manualPaymentsSql()}
                UNION ALL
                ${eventPaymentsSql()}
                UNION ALL
                ${renewalPaymentsSql()}
                UNION ALL
                ${venuePaymentSql()}
             ) ledger
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY ledger.sort_date DESC, ledger.id DESC
             LIMIT 300`,
            { replacements, type: QueryTypes.SELECT }
        );

        return res.json(payments);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch payments.', error: error.message });
    }
});

router.get('/sources', async (req, res) => {
    try {
        await ensureTables();

        const [eventSources, renewalSources, venueSources] = await Promise.all([
            sequelize.query(
                `SELECT
                    'Event Registration' AS related_type,
                    er.id AS related_id,
                    er.member_id,
                    m.full_name,
                    m.member_id AS member_code,
                    er.total_amount AS amount,
                    CONCAT('Event Ticket: ', e.title) AS purpose,
                    er.entry_code AS reference_no,
                    er.payment_status AS status
                 FROM event_registrations er
                 INNER JOIN events e ON e.id = er.event_id
                 INNER JOIN members m ON m.id = er.member_id
                 WHERE er.entry_status <> 'Cancelled'
                    AND er.payment_status = 'Pending'
                    AND er.total_amount > 0
                    AND NOT EXISTS (
                        SELECT 1 FROM payments p
                        WHERE p.related_type = 'Event Registration'
                            AND p.related_id = er.id
                            AND p.status IN ('Paid', 'Pending')
                    )
                 ORDER BY er.registered_at DESC
                 LIMIT 100`,
                { type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT
                    'Card Renewal' AS related_type,
                    cr.id AS related_id,
                    cr.member_id,
                    m.full_name,
                    m.member_id AS member_code,
                    cr.amount,
                    CONCAT('Card Renewal: ', DATE_FORMAT(cr.renewal_date, '%Y-%m-%d')) AS purpose,
                    CONCAT('REN-', cr.id) AS reference_no,
                    cr.payment_status AS status
                 FROM card_renewals cr
                 INNER JOIN members m ON m.id = cr.member_id
                 WHERE cr.payment_status = 'Pending'
                    AND cr.amount > 0
                    AND NOT EXISTS (
                        SELECT 1 FROM payments p
                        WHERE p.related_type = 'Card Renewal'
                            AND p.related_id = cr.id
                            AND p.status IN ('Paid', 'Pending')
                    )
                 ORDER BY cr.created_at DESC
                 LIMIT 100`,
                { type: QueryTypes.SELECT }
            ),
            sequelize.query(
                `SELECT
                    'Venue Booking' AS related_type,
                    vb.id AS related_id,
                    vb.member_id,
                    m.full_name,
                    m.member_id AS member_code,
                    vb.total_charge AS amount,
                    CONCAT('Venue Booking: ', v.name, ' on ', DATE_FORMAT(vb.booking_date, '%Y-%m-%d')) AS purpose,
                    CONCAT('VEN-', vb.id) AS reference_no,
                    vb.status
                 FROM venue_bookings vb
                 INNER JOIN venues v ON v.id = vb.venue_id
                 INNER JOIN members m ON m.id = vb.member_id
                 WHERE vb.status <> 'Cancelled'
                    AND vb.total_charge > 0
                    AND NOT EXISTS (
                        SELECT 1 FROM payments p
                        WHERE p.related_type = 'Venue Booking'
                            AND p.related_id = vb.id
                            AND p.status IN ('Paid', 'Pending')
                    )
                 ORDER BY vb.created_at DESC
                 LIMIT 100`,
                { type: QueryTypes.SELECT }
            ),
        ]);

        return res.json([...eventSources, ...renewalSources, ...venueSources]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch payment sources.', error: error.message });
    }
});

router.post('/', async (req, res) => {
    const { member_id, amount, provider, purpose, reference_no, payment_date, status, related_type, related_id } = req.body;

    if (!amount || !provider || !purpose || !payment_date) {
        return res.status(400).json({ message: 'Amount, provider, purpose, and payment date are required.' });
    }

    if (related_type && !['Event Registration', 'Card Renewal', 'Venue Booking'].includes(related_type)) {
        return res.status(400).json({ message: 'Invalid related payment source.' });
    }

    const transaction = await sequelize.transaction();

    try {
        await ensureTables();

        const invoiceNo = `INV-${Date.now()}`;

        const result = await sequelize.query(
            `INSERT INTO payments
             (invoice_no, member_id, amount, provider, purpose, reference_no, payment_date, status, related_type, related_id, recorded_by)
             VALUES (:invoice_no, :member_id, :amount, :provider, :purpose, :reference_no, :payment_date, :status, :related_type, :related_id, :recorded_by)`,
            {
                replacements: {
                    invoice_no: invoiceNo,
                    member_id: member_id || null,
                    amount,
                    provider,
                    purpose,
                    reference_no: reference_no || null,
                    payment_date,
                    status: status || 'Paid',
                    related_type: related_type || 'Manual',
                    related_id: related_id || null,
                    recorded_by: req.admin.id,
                },
                type: QueryTypes.INSERT,
                transaction,
            }
        );

        if (related_type && related_id) {
            await updateLinkedPaymentStatus({ related_type, related_id, status: status || 'Paid', transaction });
        }

        await transaction.commit();
        return res.status(201).json({ id: result[0], invoice_no: invoiceNo, message: 'Payment recorded.' });
    } catch (error) {
        await transaction.rollback();
        return res.status(500).json({ message: 'Failed to record payment.', error: error.message });
    }
});

router.put('/:id/reconcile', async (req, res) => {
    const { status } = req.body;

    if (!['Pending', 'Paid', 'Failed', 'Refunded'].includes(status)) {
        return res.status(400).json({ message: 'Invalid payment status.' });
    }

    try {
        await ensureTables();

        const payments = await sequelize.query(
            'SELECT related_type, related_id FROM payments WHERE id = :id LIMIT 1',
            { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
        );

        await sequelize.query(
            'UPDATE payments SET status = :status, reconciled_at = CURRENT_TIMESTAMP WHERE id = :id',
            {
                replacements: { status, id: req.params.id },
                type: QueryTypes.UPDATE,
            }
        );

        if (payments[0]?.related_type && payments[0]?.related_id) {
            await updateLinkedPaymentStatus({
                related_type: payments[0].related_type,
                related_id: payments[0].related_id,
                status,
            });
        }

        return res.json({ message: 'Payment reconciled.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to reconcile payment.', error: error.message });
    }
});

function ensureTables() {
    if (!setupPromise) {
        setupPromise = (async () => {
            await sequelize.query(
            `CREATE TABLE IF NOT EXISTS payments (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                invoice_no VARCHAR(80) NOT NULL,
                member_id BIGINT UNSIGNED NULL,
                amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                provider ENUM('Manual', 'bKash', 'Nagad', 'Card') NOT NULL DEFAULT 'Manual',
                purpose VARCHAR(150) NOT NULL,
                reference_no VARCHAR(150) NULL,
                payment_date DATE NOT NULL,
                status ENUM('Pending', 'Paid', 'Failed', 'Refunded') NOT NULL DEFAULT 'Paid',
                related_type ENUM('Manual', 'Event Registration', 'Card Renewal', 'Venue Booking') NOT NULL DEFAULT 'Manual',
                related_id BIGINT UNSIGNED NULL,
                recorded_by BIGINT UNSIGNED NULL,
                reconciled_at DATETIME NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_payments_invoice_no (invoice_no),
                KEY idx_payments_status (status),
                KEY idx_payments_provider (provider),
                KEY idx_payments_related (related_type, related_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
            );

            await sequelize.query(
                `ALTER TABLE payments
                 ADD COLUMN related_type ENUM('Manual', 'Event Registration', 'Card Renewal', 'Venue Booking') NOT NULL DEFAULT 'Manual' AFTER status`
            ).catch((error) => {
                if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
                    return null;
                }

                throw error;
            });

            await sequelize.query(
                `ALTER TABLE payments
                 ADD COLUMN related_id BIGINT UNSIGNED NULL AFTER related_type`
            ).catch((error) => {
                if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
                    return null;
                }

                throw error;
            });

            await sequelize.query(
                `ALTER TABLE payments
                 MODIFY related_type ENUM('Manual', 'Event Registration', 'Card Renewal', 'Venue Booking') NOT NULL DEFAULT 'Manual'`
            ).catch(() => null);

            await sequelize.query(
                `ALTER TABLE payments
                 ADD KEY idx_payments_related (related_type, related_id)`
            ).catch(() => null);
        })().catch((error) => {
            setupPromise = null;
            throw error;
        });
    }

    return setupPromise;
}

function manualPaymentsSql() {
    return `SELECT
            p.id,
            p.invoice_no,
            p.member_id,
            p.amount,
            p.provider,
            p.purpose,
            p.reference_no,
            p.payment_date,
            p.status,
            p.related_type,
            p.related_id,
            p.recorded_by,
            p.reconciled_at,
            p.created_at,
            p.created_at AS sort_date,
            m.full_name,
            m.member_id AS member_code,
            a.name AS recorded_by_name,
            'Payment Record' AS source_label,
            1 AS can_reconcile
         FROM payments p
         LEFT JOIN members m ON m.id = p.member_id
         LEFT JOIN admins a ON a.id = p.recorded_by`;
}

function eventPaymentsSql() {
    return `SELECT
            CONCAT('event-', er.id) AS id,
            CONCAT('EVT-', er.id) AS invoice_no,
            er.member_id,
            er.total_amount AS amount,
            'Demo Gateway' AS provider,
            CONCAT('Event Ticket: ', e.title) AS purpose,
            er.entry_code AS reference_no,
            DATE(er.registered_at) AS payment_date,
            CASE
                WHEN er.payment_status IN ('Paid', 'Free') THEN 'Paid'
                ELSE 'Pending'
            END AS status,
            'Event Registration' AS related_type,
            er.id AS related_id,
            NULL AS recorded_by,
            er.payment_verified_at AS reconciled_at,
            er.registered_at AS created_at,
            er.registered_at AS sort_date,
            m.full_name,
            m.member_id AS member_code,
            NULL AS recorded_by_name,
            'Event Ticket' AS source_label,
            0 AS can_reconcile
         FROM event_registrations er
         INNER JOIN events e ON e.id = er.event_id
         INNER JOIN members m ON m.id = er.member_id
         WHERE er.entry_status <> 'Cancelled'
            AND er.total_amount > 0
            AND NOT EXISTS (
                SELECT 1 FROM payments p2
                WHERE p2.related_type = 'Event Registration'
                    AND p2.related_id = er.id
            )`;
}

function renewalPaymentsSql() {
    return `SELECT
            CONCAT('renewal-', cr.id) AS id,
            CONCAT('REN-', cr.id) AS invoice_no,
            cr.member_id,
            cr.amount,
            'Manual' AS provider,
            CONCAT('Card Renewal: ', DATE_FORMAT(cr.renewal_date, '%Y-%m-%d')) AS purpose,
            CONCAT('REN-', cr.id) AS reference_no,
            cr.renewal_date AS payment_date,
            cr.payment_status AS status,
            'Card Renewal' AS related_type,
            cr.id AS related_id,
            cr.processed_by AS recorded_by,
            CASE WHEN cr.payment_status = 'Paid' THEN cr.created_at ELSE NULL END AS reconciled_at,
            cr.created_at,
            cr.created_at AS sort_date,
            m.full_name,
            m.member_id AS member_code,
            a.name AS recorded_by_name,
            'Card Renewal' AS source_label,
            0 AS can_reconcile
         FROM card_renewals cr
         INNER JOIN members m ON m.id = cr.member_id
         LEFT JOIN admins a ON a.id = cr.processed_by
         WHERE cr.amount > 0
            AND NOT EXISTS (
                SELECT 1 FROM payments p2
                WHERE p2.related_type = 'Card Renewal'
                    AND p2.related_id = cr.id
            )`;
}

function venuePaymentSql() {
    return `SELECT
            CONCAT('venue-', vb.id) AS id,
            CONCAT('VEN-', vb.id) AS invoice_no,
            vb.member_id,
            vb.total_charge AS amount,
            'Manual' AS provider,
            CONCAT('Venue Booking: ', v.name, ' on ', DATE_FORMAT(vb.booking_date, '%Y-%m-%d')) AS purpose,
            CONCAT('VEN-', vb.id) AS reference_no,
            vb.booking_date AS payment_date,
            CASE
                WHEN vb.status = 'Cancelled' THEN 'Failed'
                ELSE 'Pending'
            END AS status,
            'Venue Booking' AS related_type,
            vb.id AS related_id,
            NULL AS recorded_by,
            NULL AS reconciled_at,
            vb.created_at,
            vb.created_at AS sort_date,
            m.full_name,
            m.member_id AS member_code,
            NULL AS recorded_by_name,
            'Venue Booking' AS source_label,
            0 AS can_reconcile
         FROM venue_bookings vb
         INNER JOIN venues v ON v.id = vb.venue_id
         INNER JOIN members m ON m.id = vb.member_id
         WHERE vb.total_charge > 0
            AND vb.status <> 'Cancelled'
            AND NOT EXISTS (
                SELECT 1 FROM payments p2
                WHERE p2.related_type = 'Venue Booking'
                    AND p2.related_id = vb.id
            )`;
}

async function updateLinkedPaymentStatus({ related_type, related_id, status, transaction }) {
    const linkedStatus = status === 'Paid' ? 'Paid' : 'Pending';

    if (related_type === 'Event Registration') {
        await sequelize.query(
            `UPDATE event_registrations
             SET payment_status = :payment_status,
                 payment_verified_at = CASE WHEN :payment_status = 'Paid' THEN NOW() ELSE NULL END
             WHERE id = :id`,
            {
                replacements: { id: related_id, payment_status: linkedStatus },
                type: QueryTypes.UPDATE,
                transaction,
            }
        );
    }

    if (related_type === 'Card Renewal') {
        await sequelize.query(
            `UPDATE card_renewals SET payment_status = :payment_status WHERE id = :id`,
            {
                replacements: { id: related_id, payment_status: linkedStatus },
                type: QueryTypes.UPDATE,
                transaction,
            }
        );
    }
}

module.exports = router;
