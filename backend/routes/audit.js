const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

let setupPromise = null;

router.get('/', async (req, res) => {
    const { module, admin, date } = req.query;
    const where = [];
    const replacements = {};

    if (module) {
        where.push('al.module = :module');
        replacements.module = module;
    }

    if (admin) {
        where.push('al.admin_id = :admin');
        replacements.admin = admin;
    }

    if (date) {
        where.push('DATE(al.created_at) = :date');
        replacements.date = date;
    }

    try {
        await ensureTables();

        const logs = await sequelize.query(
            `SELECT al.*, a.name AS admin_name
             FROM audit_logs al
             LEFT JOIN admins a ON a.id = al.admin_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY al.created_at DESC
             LIMIT 300`,
            { replacements, type: QueryTypes.SELECT }
        );

        return res.json(logs);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch audit logs.', error: error.message });
    }
});

router.post('/', async (req, res) => {
    const { module, action, entity_id, description } = req.body;

    if (!module || !action) {
        return res.status(400).json({ message: 'Module and action are required.' });
    }

    try {
        await ensureTables();

        await sequelize.query(
            `INSERT INTO audit_logs (module, action, entity_id, description, admin_id)
             VALUES (:module, :action, :entity_id, :description, :admin_id)`,
            {
                replacements: {
                    module,
                    action,
                    entity_id: entity_id || null,
                    description: description || null,
                    admin_id: req.admin.id,
                },
                type: QueryTypes.INSERT,
            }
        );

        return res.status(201).json({ message: 'Audit log created.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to create audit log.', error: error.message });
    }
});

function ensureTables() {
    if (!setupPromise) {
        setupPromise = sequelize.query(
            `CREATE TABLE IF NOT EXISTS audit_logs (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                module ENUM('Members', 'Events', 'Notices', 'Bookings', 'Renewals', 'Auctions', 'Community', 'Payments', 'Security') NOT NULL,
                action VARCHAR(120) NOT NULL,
                entity_id BIGINT UNSIGNED NULL,
                description TEXT NULL,
                admin_id BIGINT UNSIGNED NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_audit_logs_module (module),
                KEY idx_audit_logs_admin (admin_id),
                KEY idx_audit_logs_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        ).catch((error) => {
            setupPromise = null;
            throw error;
        });
    }

    return setupPromise;
}

module.exports = router;
