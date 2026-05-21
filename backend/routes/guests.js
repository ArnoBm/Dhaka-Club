const crypto = require('crypto');
const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

let setupPromise = null;

router.get('/', async (req, res) => {
    const { status, search, date } = req.query;
    const where = [];
    const replacements = {};

    if (status) {
        where.push('gr.status = :status');
        replacements.status = status;
    }

    if (date) {
        where.push('gr.visit_date = :date');
        replacements.date = date;
    }

    if (search) {
        where.push('(gr.guest_name LIKE :search OR gr.phone LIKE :search OR m.full_name LIKE :search OR gr.vehicle_number LIKE :search)');
        replacements.search = `%${search}%`;
    }

    try {
        await ensureTables();

        const guests = await sequelize.query(
            `SELECT gr.*, m.full_name AS host_member_name, m.member_id AS host_member_id, a.name AS reviewed_by_name
             FROM guest_requests gr
             LEFT JOIN members m ON m.id = gr.member_id
             LEFT JOIN admins a ON a.id = gr.reviewed_by
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY gr.requested_at DESC
             LIMIT 300`,
            { replacements, type: QueryTypes.SELECT }
        );

        return res.json(guests);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch guest requests.', error: error.message });
    }
});

router.post('/', async (req, res) => {
    const { guest_name, phone, member_id, visit_purpose, vehicle_number, visit_date } = req.body;

    if (!guest_name || !visit_purpose || !visit_date) {
        return res.status(400).json({ message: 'Guest name, visit purpose, and visit date are required.' });
    }

    try {
        await ensureTables();

        const result = await sequelize.query(
            `INSERT INTO guest_requests
             (guest_name, phone, member_id, visit_purpose, vehicle_number, visit_date)
             VALUES (:guest_name, :phone, :member_id, :visit_purpose, :vehicle_number, :visit_date)`,
            {
                replacements: {
                    guest_name,
                    phone: phone || null,
                    member_id: member_id || null,
                    visit_purpose,
                    vehicle_number: vehicle_number || null,
                    visit_date,
                },
                type: QueryTypes.INSERT,
            }
        );

        return res.status(201).json({ id: result[0], message: 'Guest request created.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to create guest request.', error: error.message });
    }
});

router.put('/:id/approve', async (req, res) => {
    try {
        await ensureTables();

        const qrCode = `GUEST-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        await sequelize.query(
            `UPDATE guest_requests
             SET status = 'Approved', qr_code = :qrCode, reviewed_by = :adminId, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = :id`,
            {
                replacements: { qrCode, adminId: req.admin.id, id: req.params.id },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({ message: 'Guest approved.', qr_code: qrCode });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to approve guest.', error: error.message });
    }
});

router.put('/:id/reject', async (req, res) => {
    try {
        await ensureTables();

        await sequelize.query(
            `UPDATE guest_requests
             SET status = 'Rejected', reviewed_by = :adminId, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = :id`,
            {
                replacements: { adminId: req.admin.id, id: req.params.id },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({ message: 'Guest rejected.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to reject guest.', error: error.message });
    }
});

function ensureTables() {
    if (!setupPromise) {
        setupPromise = sequelize.query(
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        ).catch((error) => {
            setupPromise = null;
            throw error;
        });
    }

    return setupPromise;
}

module.exports = router;
