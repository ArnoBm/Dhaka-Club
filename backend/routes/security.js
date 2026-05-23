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
                SUM(entry_allowed = 0) AS blocked_entries,
                SUM(qr_type IN ('Visitor', 'RFID')) AS visitor_entries
             FROM entry_logs
             WHERE DATE(scanned_at) = :date`,
            { replacements: { date }, type: QueryTypes.SELECT }
        );

        const [visitorSummary] = await sequelize.query(
            `SELECT
                COUNT(*) AS total_visitors,
                SUM(entry_status = 'Inside') AS currently_inside,
                SUM(entry_status = 'Exited') AS exited_visitors
             FROM visitor_entries
             WHERE DATE(entry_time) = :date`,
            { replacements: { date }, type: QueryTypes.SELECT }
        );

        const [cardSummary] = await sequelize.query(
            `SELECT
                COUNT(*) AS total_cards,
                SUM(status = 'Available') AS available_cards,
                SUM(status = 'Assigned') AS assigned_cards,
                SUM(status IN ('Lost', 'Blocked')) AS blocked_cards
             FROM rfid_cards`,
            { type: QueryTypes.SELECT }
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
            visitor_entries: Number(summary.visitor_entries || 0),
            currently_inside: Number(visitorSummary.currently_inside || 0),
            exited_visitors: Number(visitorSummary.exited_visitors || 0),
            total_visitors: Number(visitorSummary.total_visitors || 0),
            total_cards: Number(cardSummary.total_cards || 0),
            available_cards: Number(cardSummary.available_cards || 0),
            assigned_cards: Number(cardSummary.assigned_cards || 0),
            blocked_cards: Number(cardSummary.blocked_cards || 0),
            recent,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch security dashboard.', error: error.message });
    }
});

router.get('/rfid-cards', async (req, res) => {
    const { status } = req.query;
    const replacements = {};
    const where = [];

    if (status) {
        where.push('status = :status');
        replacements.status = status;
    }

    try {
        await ensureTables();

        const cards = await sequelize.query(
            `SELECT rc.*,
                    ve.id AS active_visitor_id,
                    ve.visitor_name AS active_visitor_name,
                    ve.phone AS active_visitor_phone,
                    ve.entry_time AS active_entry_time
             FROM rfid_cards rc
             LEFT JOIN visitor_entries ve ON ve.rfid_card_id = rc.id AND ve.entry_status = 'Inside'
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY rc.created_at DESC, rc.id DESC`,
            { replacements, type: QueryTypes.SELECT }
        );

        return res.json(cards);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch RFID cards.', error: error.message });
    }
});

router.post('/rfid-cards', async (req, res) => {
    const cardUid = normalizeCardUid(req.body.card_uid);

    if (!cardUid) {
        return res.status(400).json({ message: 'RFID card UID is required.' });
    }

    try {
        await ensureTables();

        const [result] = await sequelize.query(
            `INSERT INTO rfid_cards (card_uid, card_label, status, notes, updated_at)
             VALUES (:card_uid, :card_label, :status, :notes, NOW())`,
            {
                replacements: {
                    card_uid: cardUid,
                    card_label: req.body.card_label || null,
                    status: req.body.status || 'Available',
                    notes: req.body.notes || null,
                },
                type: QueryTypes.INSERT,
            }
        );

        return res.status(201).json({ id: result, card_uid: cardUid, message: 'RFID card saved.' });
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This RFID card UID already exists.' });
        }

        return res.status(500).json({ message: 'Failed to save RFID card.', error: error.message });
    }
});

router.put('/rfid-cards/:id', async (req, res) => {
    const cardUid = normalizeCardUid(req.body.card_uid);

    if (!cardUid) {
        return res.status(400).json({ message: 'RFID card UID is required.' });
    }

    try {
        await ensureTables();

        const [activeVisitor] = await sequelize.query(
            `SELECT id FROM visitor_entries WHERE rfid_card_id = :id AND entry_status = 'Inside' LIMIT 1`,
            { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
        );

        if (activeVisitor && ['Available', 'Lost', 'Blocked'].includes(req.body.status)) {
            return res.status(400).json({ message: 'This card is assigned to an active visitor. Mark exit first.' });
        }

        await sequelize.query(
            `UPDATE rfid_cards
             SET card_uid = :card_uid,
                 card_label = :card_label,
                 status = :status,
                 notes = :notes,
                 updated_at = NOW()
             WHERE id = :id`,
            {
                replacements: {
                    id: req.params.id,
                    card_uid: cardUid,
                    card_label: req.body.card_label || null,
                    status: req.body.status || 'Available',
                    notes: req.body.notes || null,
                },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({ message: 'RFID card updated.' });
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This RFID card UID already exists.' });
        }

        return res.status(500).json({ message: 'Failed to update RFID card.', error: error.message });
    }
});

router.get('/visitors', async (req, res) => {
    const { search, date, status } = req.query;
    const replacements = {};
    const where = [];

    if (date) {
        where.push('DATE(ve.entry_time) = :date');
        replacements.date = date;
    }

    if (status) {
        where.push('ve.entry_status = :status');
        replacements.status = status;
    }

    if (search) {
        where.push('(ve.visitor_name LIKE :search OR ve.phone LIKE :search OR ve.host_name LIKE :search OR ve.vehicle_number LIKE :search OR rc.card_uid LIKE :search OR rc.card_label LIKE :search)');
        replacements.search = `%${search}%`;
    }

    try {
        await ensureTables();

        const visitors = await sequelize.query(
            `SELECT ve.*, rc.card_uid, rc.card_label, a.name AS created_by_name
             FROM visitor_entries ve
             LEFT JOIN rfid_cards rc ON rc.id = ve.rfid_card_id
             LEFT JOIN admins a ON a.id = ve.created_by
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY ve.entry_time DESC
             LIMIT 300`,
            { replacements, type: QueryTypes.SELECT }
        );

        return res.json(visitors);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch visitor entries.', error: error.message });
    }
});

router.post('/visitors', async (req, res) => {
    const {
        visitor_name,
        phone,
        id_number,
        visitor_type,
        visit_purpose,
        host_name,
        host_phone,
        host_department,
        vehicle_number,
        rfid_card_id,
        security_note,
    } = req.body;

    if (!visitor_name || !visit_purpose || !rfid_card_id) {
        return res.status(400).json({ message: 'Visitor name, purpose, and RFID card are required.' });
    }

    const transaction = await sequelize.transaction();

    try {
        await ensureTables();

        const [card] = await sequelize.query(
            `SELECT * FROM rfid_cards WHERE id = :id FOR UPDATE`,
            { replacements: { id: rfid_card_id }, type: QueryTypes.SELECT, transaction }
        );

        if (!card) {
            await transaction.rollback();
            return res.status(404).json({ message: 'RFID card was not found.' });
        }

        if (card.status !== 'Available') {
            await transaction.rollback();
            return res.status(400).json({ message: `RFID card is ${card.status}. Choose an available card.` });
        }

        const [result] = await sequelize.query(
            `INSERT INTO visitor_entries
             (visitor_name, phone, id_number, visitor_type, visit_purpose, host_name, host_phone, host_department, vehicle_number, rfid_card_id, entry_status, entry_allowed, entry_time, security_note, created_by, updated_at)
             VALUES
             (:visitor_name, :phone, :id_number, :visitor_type, :visit_purpose, :host_name, :host_phone, :host_department, :vehicle_number, :rfid_card_id, 'Inside', 1, NOW(), :security_note, :created_by, NOW())`,
            {
                replacements: {
                    visitor_name,
                    phone: phone || null,
                    id_number: id_number || null,
                    visitor_type: visitor_type || 'Walk-in',
                    visit_purpose,
                    host_name: host_name || null,
                    host_phone: host_phone || null,
                    host_department: host_department || null,
                    vehicle_number: vehicle_number || null,
                    rfid_card_id,
                    security_note: security_note || null,
                    created_by: req.admin.id,
                },
                type: QueryTypes.INSERT,
                transaction,
            }
        );

        await sequelize.query(
            `UPDATE rfid_cards SET status = 'Assigned', updated_at = NOW() WHERE id = :id`,
            { replacements: { id: rfid_card_id }, type: QueryTypes.UPDATE, transaction }
        );

        await logRfidScan({
            rfid_card_id,
            visitor_entry_id: result,
            card_uid: card.card_uid,
            scan_type: 'Entry',
            entry_allowed: true,
            message: 'Visitor pass assigned and entry recorded.',
            scanned_by: req.admin.id,
            transaction,
        });

        await logEntry({
            qr_type: 'Visitor',
            scanned_code: card.card_uid,
            name: visitor_name,
            membership_group: visitor_type || 'Visitor',
            guest_count: 1,
            status: 'Inside',
            entry_allowed: true,
            vehicle_number,
            visit_purpose,
            scanned_by: req.admin.id,
            transaction,
        });

        await transaction.commit();

        return res.status(201).json({ id: result, message: 'Visitor pass assigned and entry recorded.' });
    } catch (error) {
        await transaction.rollback();
        return res.status(500).json({ message: 'Failed to assign visitor pass.', error: error.message });
    }
});

router.put('/visitors/:id/exit', async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        await ensureTables();

        const [visitor] = await sequelize.query(
            `SELECT ve.*, rc.card_uid
             FROM visitor_entries ve
             LEFT JOIN rfid_cards rc ON rc.id = ve.rfid_card_id
             WHERE ve.id = :id
             LIMIT 1`,
            { replacements: { id: req.params.id }, type: QueryTypes.SELECT, transaction }
        );

        if (!visitor) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Visitor entry was not found.' });
        }

        if (visitor.entry_status !== 'Inside') {
            await transaction.rollback();
            return res.status(400).json({ message: 'This visitor has already exited.' });
        }

        await markVisitorExit(visitor, req.admin.id, transaction);
        await transaction.commit();

        return res.json({ message: 'Visitor exit recorded and RFID card released.' });
    } catch (error) {
        await transaction.rollback();
        return res.status(500).json({ message: 'Failed to mark visitor exit.', error: error.message });
    }
});

router.post('/rfid-scan', async (req, res) => {
    const cardUid = normalizeCardUid(req.body.card_uid);

    if (!cardUid) {
        return res.status(400).json({ message: 'RFID card UID is required.' });
    }

    const transaction = await sequelize.transaction();

    try {
        await ensureTables();

        const [card] = await sequelize.query(
            `SELECT * FROM rfid_cards WHERE card_uid = :card_uid FOR UPDATE`,
            { replacements: { card_uid: cardUid }, type: QueryTypes.SELECT, transaction }
        );

        if (!card) {
            await logRfidScan({
                card_uid: cardUid,
                scan_type: 'Denied',
                entry_allowed: false,
                message: 'RFID card is not registered.',
                scanned_by: req.admin.id,
                transaction,
            });
            await transaction.commit();
            return res.status(404).json({ entry_allowed: false, action: 'Denied', message: 'RFID card is not registered.' });
        }

        if (['Lost', 'Blocked'].includes(card.status)) {
            await logRfidScan({
                rfid_card_id: card.id,
                card_uid: cardUid,
                scan_type: 'Denied',
                entry_allowed: false,
                message: `RFID card is ${card.status}.`,
                scanned_by: req.admin.id,
                transaction,
            });
            await transaction.commit();
            return res.status(403).json({ entry_allowed: false, action: 'Denied', message: `RFID card is ${card.status}.` });
        }

        const [visitor] = await sequelize.query(
            `SELECT ve.*, rc.card_uid
             FROM visitor_entries ve
             JOIN rfid_cards rc ON rc.id = ve.rfid_card_id
             WHERE ve.rfid_card_id = :card_id AND ve.entry_status = 'Inside'
             ORDER BY ve.entry_time DESC
             LIMIT 1`,
            { replacements: { card_id: card.id }, type: QueryTypes.SELECT, transaction }
        );

        if (visitor) {
            await markVisitorExit(visitor, req.admin.id, transaction);
            await transaction.commit();

            return res.json({
                entry_allowed: true,
                action: 'Exit',
                message: `${visitor.visitor_name} exit recorded. RFID card released.`,
                visitor,
            });
        }

        await logRfidScan({
            rfid_card_id: card.id,
            card_uid: cardUid,
            scan_type: 'Denied',
            entry_allowed: false,
            message: 'RFID card is available but not assigned to any active visitor.',
            scanned_by: req.admin.id,
            transaction,
        });

        await transaction.commit();
        return res.status(400).json({ entry_allowed: false, action: 'Unassigned', message: 'RFID card is available but not assigned to any active visitor.' });
    } catch (error) {
        await transaction.rollback();
        return res.status(500).json({ message: 'Failed to process RFID scan.', error: error.message });
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
            transaction: entry.transaction,
        }
    );
}

async function markVisitorExit(visitor, adminId, transaction) {
    await sequelize.query(
        `UPDATE visitor_entries
         SET entry_status = 'Exited',
             exit_time = NOW(),
             updated_at = NOW()
         WHERE id = :id`,
        { replacements: { id: visitor.id }, type: QueryTypes.UPDATE, transaction }
    );

    if (visitor.rfid_card_id) {
        await sequelize.query(
            `UPDATE rfid_cards SET status = 'Available', updated_at = NOW() WHERE id = :id`,
            { replacements: { id: visitor.rfid_card_id }, type: QueryTypes.UPDATE, transaction }
        );
    }

    await logRfidScan({
        rfid_card_id: visitor.rfid_card_id,
        visitor_entry_id: visitor.id,
        card_uid: visitor.card_uid,
        scan_type: 'Exit',
        entry_allowed: true,
        message: 'Visitor exit recorded and RFID card released.',
        scanned_by: adminId,
        transaction,
    });

    await logEntry({
        qr_type: 'RFID',
        scanned_code: visitor.card_uid,
        name: visitor.visitor_name,
        membership_group: visitor.visitor_type || 'Visitor',
        guest_count: 1,
        status: 'Exited',
        entry_allowed: true,
        vehicle_number: visitor.vehicle_number,
        visit_purpose: visitor.visit_purpose,
        scanned_by: adminId,
        transaction,
    });
}

async function logRfidScan(scan) {
    await sequelize.query(
        `INSERT INTO rfid_scan_logs
         (rfid_card_id, visitor_entry_id, card_uid, scan_type, entry_allowed, message, scanned_by)
         VALUES
         (:rfid_card_id, :visitor_entry_id, :card_uid, :scan_type, :entry_allowed, :message, :scanned_by)`,
        {
            replacements: {
                rfid_card_id: scan.rfid_card_id || null,
                visitor_entry_id: scan.visitor_entry_id || null,
                card_uid: scan.card_uid,
                scan_type: scan.scan_type || 'Lookup',
                entry_allowed: scan.entry_allowed ? 1 : 0,
                message: scan.message || null,
                scanned_by: scan.scanned_by || null,
            },
            type: QueryTypes.INSERT,
            transaction: scan.transaction,
        }
    );
}

function normalizeCardUid(value) {
    return String(value || '').trim().toUpperCase();
}

function ensureTables() {
    if (!setupPromise) {
        setupPromise = (async () => {
            await sequelize.query(
                `CREATE TABLE IF NOT EXISTS guest_requests (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    guest_name VARCHAR(150) NOT NULL,
                    phone VARCHAR(30) NULL,
                    host_relation VARCHAR(80) NULL,
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
            );

            await sequelize.query(
                `ALTER TABLE guest_requests
                 ADD COLUMN host_relation VARCHAR(80) NULL AFTER phone`
            ).catch((error) => {
                if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
                    return null;
                }

                throw error;
            });

            await sequelize.query(
                `CREATE TABLE IF NOT EXISTS entry_logs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                qr_type ENUM('Member', 'Guest', 'Event', 'Visitor', 'RFID') NOT NULL DEFAULT 'Member',
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
            );

            await sequelize.query(
                `ALTER TABLE entry_logs
                 ADD COLUMN guest_count INT UNSIGNED NOT NULL DEFAULT 1 AFTER membership_group`
            ).catch((error) => {
                if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
                    return null;
                }

                throw error;
            });

            await sequelize.query(
                `ALTER TABLE entry_logs
                 MODIFY qr_type ENUM('Member', 'Guest', 'Event', 'Visitor', 'RFID') NOT NULL DEFAULT 'Member'`
            ).catch(() => null);

            await sequelize.query(
                `CREATE TABLE IF NOT EXISTS rfid_cards (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    card_uid VARCHAR(120) NOT NULL,
                    card_label VARCHAR(120) NULL,
                    status ENUM('Available', 'Assigned', 'Lost', 'Blocked') NOT NULL DEFAULT 'Available',
                    notes VARCHAR(255) NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NULL,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_rfid_cards_uid (card_uid),
                    KEY idx_rfid_cards_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
            );

            await sequelize.query(
                `INSERT IGNORE INTO rfid_cards (card_uid, card_label, status, notes, updated_at)
                 VALUES
                 ('RFID-001', 'Gate Card 01', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-002', 'Gate Card 02', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-003', 'Gate Card 03', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-004', 'Gate Card 04', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-005', 'Gate Card 05', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-006', 'Gate Card 06', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-007', 'Gate Card 07', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-008', 'Gate Card 08', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-009', 'Gate Card 09', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-010', 'Gate Card 10', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-011', 'Gate Card 11', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-012', 'Gate Card 12', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-013', 'Gate Card 13', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-014', 'Gate Card 14', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-015', 'Gate Card 15', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-016', 'Gate Card 16', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-017', 'Gate Card 17', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-018', 'Gate Card 18', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-019', 'Gate Card 19', 'Available', 'Default gate RFID card', NOW()),
                 ('RFID-020', 'Gate Card 20', 'Available', 'Default gate RFID card', NOW())`
            );

            await sequelize.query(
                `CREATE TABLE IF NOT EXISTS visitor_entries (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    visitor_name VARCHAR(150) NOT NULL,
                    phone VARCHAR(30) NULL,
                    id_number VARCHAR(80) NULL,
                    visitor_type ENUM('Walk-in', 'Vendor', 'Delivery', 'Contractor', 'Service Provider', 'Interview / Meeting', 'Other') NOT NULL DEFAULT 'Walk-in',
                    visit_purpose VARCHAR(255) NOT NULL,
                    host_name VARCHAR(150) NULL,
                    host_phone VARCHAR(30) NULL,
                    host_department VARCHAR(120) NULL,
                    vehicle_number VARCHAR(80) NULL,
                    rfid_card_id BIGINT UNSIGNED NULL,
                    entry_status ENUM('Inside', 'Exited', 'Denied', 'Overdue') NOT NULL DEFAULT 'Inside',
                    entry_allowed BOOLEAN NOT NULL DEFAULT TRUE,
                    entry_time DATETIME NOT NULL,
                    exit_time DATETIME NULL,
                    security_note VARCHAR(255) NULL,
                    created_by BIGINT UNSIGNED NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NULL,
                    PRIMARY KEY (id),
                    KEY idx_visitor_entries_status (entry_status),
                    KEY idx_visitor_entries_entry_time (entry_time),
                    KEY idx_visitor_entries_card (rfid_card_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
            );

            await sequelize.query(
                `CREATE TABLE IF NOT EXISTS rfid_scan_logs (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    rfid_card_id BIGINT UNSIGNED NULL,
                    visitor_entry_id BIGINT UNSIGNED NULL,
                    card_uid VARCHAR(120) NOT NULL,
                    scan_type ENUM('Entry', 'Exit', 'Denied', 'Lookup') NOT NULL DEFAULT 'Lookup',
                    entry_allowed BOOLEAN NOT NULL DEFAULT FALSE,
                    message VARCHAR(255) NULL,
                    scanned_by BIGINT UNSIGNED NULL,
                    scanned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_rfid_scan_logs_card (rfid_card_id),
                    KEY idx_rfid_scan_logs_visitor (visitor_entry_id),
                    KEY idx_rfid_scan_logs_scanned_at (scanned_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
            );
        })().catch((error) => {
            setupPromise = null;
            throw error;
        });
    }

    return setupPromise;
}

module.exports = router;
