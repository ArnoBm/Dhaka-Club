const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

let setupPromise = null;

async function writeAuditLog({ module, action, entityId, description, adminId }) {
    try {
        await ensureTable();

        await sequelize.query(
            `INSERT INTO audit_logs (module, action, entity_id, description, admin_id)
             VALUES (:module, :action, :entityId, :description, :adminId)`,
            {
                replacements: {
                    module,
                    action,
                    entityId: entityId || null,
                    description: description || null,
                    adminId: adminId || null,
                },
                type: QueryTypes.INSERT,
            }
        );
    } catch (error) {
        console.error('Failed to write audit log:', error.message);
    }
}

function ensureTable() {
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

module.exports = writeAuditLog;
