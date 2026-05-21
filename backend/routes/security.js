const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

let setupPromise = null;

router.post('/verify', async (req, res) => {
    const { qr_code, qr_type } = req.body;

    if (!qr_code) {
        return res.status(400).json({ message: 'QR code is required.' });
    }

    try {
        await ensureTables();

        const result = await resolveQr(String(qr_code).trim(), qr_type);
        await logEntry({
            ...result,
            scanned_code: String(qr_code).trim(),
            scanned_by: req.admin.id,
        });

        return res.json(result);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to verify QR.', error: error.message });
    }
});

router.get('/entry-logs', async (req, res) => {
    const { search, date, type } = req.query;
    const where = [];
    const replacements = {};

    if (date) {
        where.push('DATE(el.scanned_at) = :date');
        replacements.date = date;
    }

    if (type) {
        where.push('el.qr_type = :type');
        replacements.type = type;
    }

    if (search) {
        where.push('(el.name LIKE :search OR el.membership_group LIKE :search OR el.scanned_code LIKE :search)');
        replacements.search = `%${search}%`;
    }

    try {
        await ensureTables();

        const logs = await sequelize.query(
            `SELECT el.*, a.name AS scanned_by_name
             FROM entry_logs el
             LEFT JOIN admins a ON a.id = el.scanned_by
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY el.scanned_at DESC
             LIMIT 300`,
            { replacements, type: QueryTypes.SELECT }
        );

        return res.json(logs);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch entry logs.', error: error.message });
    }
});

router.get('/dashboard', async (req, res) => {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    try {
        await ensureTables();

        const [summary] = await sequelize.query(
            `SELECT
                COUNT(*) AS todays_entries,
                SUM(qr_type = 'Guest') AS guest_entries,
                SUM(entry_allowed = 0) AS blocked_entries
             FROM entry_logs
             WHERE DATE(scanned_at) = :date`,
            { replacements: { date }, type: QueryTypes.SELECT }
        );

        const recent = await sequelize.query(
            `SELECT *
             FROM entry_logs
             WHERE DATE(scanned_at) = :date
             ORDER BY scanned_at DESC
             LIMIT 10`,
            { replacements: { date }, type: QueryTypes.SELECT }
        );

        return res.json({
            date,
            todays_entries: Number(summary.todays_entries || 0),
            guest_entries: Number(summary.guest_entries || 0),
            blocked_entries: Number(summary.blocked_entries || 0),
            recent,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch security dashboard.', error: error.message });
    }
});

async function resolveQr(code, requestedType) {
    const qrPayload = parseQrPayload(code);
    const lookupCode = qrPayload.entry_code || code;
    const registrationId = qrPayload.registration_id || null;

    const eventPasses = await sequelize.query(
        `SELECT er.*, e.title AS event_title, e.event_date, e.venue,
                m.id AS member_table_id, m.full_name, m.member_id AS member_code,
                m.membership_group, m.status AS member_status
         FROM event_registrations er
         JOIN events e ON e.id = er.event_id
         JOIN members m ON m.id = er.member_id
         WHERE er.entry_code = :code OR (:registrationId IS NOT NULL AND er.id = :registrationId)
         LIMIT 1`,
        { replacements: { code: lookupCode, registrationId }, type: QueryTypes.SELECT }
    );

    if (eventPasses[0] && (!requestedType || requestedType === 'Event' || qrPayload.type === 'DhakaClubEventPass')) {
        const pass = eventPasses[0];
        const allowed = pass.entry_status === 'Valid' && pass.payment_status === 'Paid' && pass.member_status === 'Active';
        return {
            qr_type: 'Event',
            name: pass.full_name,
            member_table_id: pass.member_table_id,
            member_id: pass.member_code,
            member_code: pass.member_code,
            membership_group: pass.membership_group,
            status: pass.entry_status,
            member_status: pass.member_status,
            event_title: pass.event_title,
            event_date: pass.event_date,
            venue: pass.venue,
            ticket_count: pass.ticket_count,
            guest_count: pass.ticket_count,
            payment_status: pass.payment_status,
            entry_allowed: allowed,
            block_reason: allowed ? null : getEventBlockReason(pass),
            visit_purpose: pass.event_title,
        };
    }

    const guests = await sequelize.query(
        `SELECT gr.*, m.full_name AS host_name, m.membership_group
         FROM guest_requests gr
         LEFT JOIN members m ON m.id = gr.member_id
         WHERE gr.qr_code = :code
         LIMIT 1`,
        { replacements: { code }, type: QueryTypes.SELECT }
    );

    if (guests[0] && (!requestedType || requestedType === 'Guest')) {
        const guest = guests[0];
        const allowed = guest.status === 'Approved';
        return {
            qr_type: 'Guest',
            guest_request_id: guest.id,
            name: guest.guest_name,
            membership_group: guest.membership_group || 'Guest',
            status: guest.status,
            entry_allowed: allowed,
            block_reason: allowed ? null : 'Guest request is not approved.',
            vehicle_number: guest.vehicle_number,
            visit_purpose: guest.visit_purpose,
            guest_count: 1,
        };
    }

    const members = await sequelize.query(
        `SELECT id, member_id, full_name, membership_group, status
         FROM members
         WHERE member_id = :code OR phone = :code OR CAST(id AS CHAR) = :code
         LIMIT 1`,
        { replacements: { code }, type: QueryTypes.SELECT }
    );

    if (members[0]) {
        const member = members[0];
        const allowed = member.status === 'Active';
        return {
            qr_type: 'Member',
            member_table_id: member.id,
            member_id: member.member_id,
            name: member.full_name,
            membership_group: member.membership_group,
            status: member.status,
            entry_allowed: allowed,
            block_reason: allowed ? null : 'Member account is not active.',
        };
    }

    return {
        qr_type: requestedType || 'Member',
        name: 'Unknown',
        membership_group: null,
        status: 'Not Found',
        entry_allowed: false,
        block_reason: 'QR code was not found.',
    };
}

function parseQrPayload(code) {
    try {
        const parsed = JSON.parse(code);

        if (parsed && typeof parsed === 'object') {
            return {
                type: parsed.type || null,
                entry_code: parsed.entry_code || parsed.entryCode || null,
                registration_id: parsed.registration_id || parsed.registrationId || null,
            };
        }
    } catch (error) {
        return {};
    }

    return {};
}

function getEventBlockReason(pass) {
    if (pass.member_status !== 'Active') {
        return 'Member account is not active.';
    }

    if (pass.payment_status !== 'Paid') {
        return 'Payment is not completed for this pass.';
    }

    if (pass.entry_status === 'Used') {
        return 'This entry pass has already been used.';
    }

    if (pass.entry_status === 'Cancelled') {
        return 'This entry pass has been cancelled.';
    }

    return 'Event pass is not valid.';
}

async function logEntry(entry) {
    await sequelize.query(
        `INSERT INTO entry_logs
         (qr_type, member_id, guest_request_id, scanned_code, name, membership_group, guest_count, status, entry_allowed, block_reason, vehicle_number, visit_purpose, scanned_by)
         VALUES
         (:qr_type, :member_table_id, :guest_request_id, :scanned_code, :name, :membership_group, :guest_count, :status, :entry_allowed, :block_reason, :vehicle_number, :visit_purpose, :scanned_by)`,
        {
            replacements: {
                qr_type: entry.qr_type || 'Member',
                member_table_id: entry.member_table_id || null,
                guest_request_id: entry.guest_request_id || null,
                scanned_code: entry.scanned_code,
                name: entry.name || null,
                membership_group: entry.membership_group || null,
                guest_count: Number(entry.guest_count || entry.ticket_count || 1),
                status: entry.status || null,
                entry_allowed: entry.entry_allowed ? 1 : 0,
                block_reason: entry.block_reason || null,
                vehicle_number: entry.vehicle_number || null,
                visit_purpose: entry.visit_purpose || null,
                scanned_by: entry.scanned_by || null,
            },
            type: QueryTypes.INSERT,
        }
    );
}

function ensureTables() {
    if (!setupPromise) {
        setupPromise = Promise.all([
            sequelize.query(
                `CREATE TABLE IF NOT EXISTS guest_requests (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    guest_name VARCHAR(150) NOT NULL,
                    phone VARCHAR(30) NULL,
                    member_id BIGINT UNSIGNED NULL,
                    visit_purpose VARCHAR(255) NOT NULL,
                    vehicle_number VARCHAR(80) NULL,
                    visit_date DATE NOT NULL,
                    status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
                    qr_code VARCHAR(255) NULL,
                    reviewed_by BIGINT UNSIGNED NULL,
                    reviewed_at DATETIME NULL,
                    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_guest_requests_qr_code (qr_code),
                    KEY idx_guest_requests_status (status),
                    KEY idx_guest_requests_visit_date (visit_date)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
            ),
            sequelize.query(
                `CREATE TABLE IF NOT EXISTS entry_logs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                qr_type ENUM('Member', 'Guest', 'Event') NOT NULL DEFAULT 'Member',
                member_id BIGINT UNSIGNED NULL,
                guest_request_id BIGINT UNSIGNED NULL,
                scanned_code VARCHAR(255) NOT NULL,
                name VARCHAR(150) NULL,
                membership_group VARCHAR(100) NULL,
                guest_count INT UNSIGNED NOT NULL DEFAULT 1,
                status VARCHAR(50) NULL,
                entry_allowed BOOLEAN NOT NULL DEFAULT FALSE,
                block_reason VARCHAR(255) NULL,
                vehicle_number VARCHAR(80) NULL,
                visit_purpose VARCHAR(255) NULL,
                scanned_by BIGINT UNSIGNED NULL,
                scanned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_entry_logs_scanned_at (scanned_at),
                KEY idx_entry_logs_qr_type (qr_type),
                KEY idx_entry_logs_allowed (entry_allowed)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
            ),
            sequelize.query(
                `ALTER TABLE entry_logs
                 ADD COLUMN guest_count INT UNSIGNED NOT NULL DEFAULT 1 AFTER membership_group`
            ).catch((error) => {
                if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
                    return null;
                }

                throw error;
            }),
        ]).catch((error) => {
            setupPromise = null;
            throw error;
        });
    }

    return setupPromise;
}

module.exports = router;
