const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');
const { emitToAdmins, emitToMember } = require('../utils/realtime');

const router = express.Router();

router.use(auth);

let setupPromise = null;

router.get('/updates', async (req, res) => {
    try {
        const member = await getActiveMember(req);

        if (!member) {
            return res.status(403).json({ message: 'Only members can view updates.' });
        }

        await ensureUpdateTables();

        const updates = await sequelize.query(
            `${baseUpdateQuery(member)}
             ORDER BY FIELD(priority, 'Critical', 'Important', 'Normal'), sent_at DESC
             LIMIT 300`,
            {
                replacements: memberReplacements(member),
                type: QueryTypes.SELECT,
            }
        );

        await markDeliveries(updates.map((update) => update.id), member.id, 'Delivered');

        return res.json(updates.map(formatUpdate));
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch member updates.', error: error.message });
    }
});

router.get('/updates/unread', async (req, res) => {
    try {
        const member = await getActiveMember(req);

        if (!member) {
            return res.status(403).json({ message: 'Only members can view unread updates.' });
        }

        await ensureUpdateTables();

        const rows = await sequelize.query(
            `SELECT COUNT(*) AS count
             FROM (${baseUpdateQuery(member)}) AS updates
             WHERE is_read = 0`,
            {
                replacements: memberReplacements(member),
                type: QueryTypes.SELECT,
            }
        );

        return res.json({ count: Number(rows[0]?.count || 0) });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch unread updates.', error: error.message });
    }
});

router.put('/updates/read/:id', async (req, res) => {
    const isRead = req.body.is_read !== false;

    try {
        const member = await getActiveMember(req);

        if (!member) {
            return res.status(403).json({ message: 'Only members can update read status.' });
        }

        await ensureUpdateTables();
        await upsertReadState(req.params.id, member.id, { is_read: isRead });
        await markDeliveries([req.params.id], member.id, isRead ? 'Read' : 'Delivered');
        emitToMember(member.id, 'updates:changed', { notification_id: Number(req.params.id) });
        emitToAdmins('broadcasts:changed', { notification_id: Number(req.params.id) });

        return res.json({ message: isRead ? 'Update marked as read.' : 'Update marked as unread.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update read status.', error: error.message });
    }
});

router.put('/updates/read-all', async (req, res) => {
    try {
        const member = await getActiveMember(req);

        if (!member) {
            return res.status(403).json({ message: 'Only members can mark updates as read.' });
        }

        await ensureUpdateTables();

        const updates = await sequelize.query(
            baseUpdateQuery(member),
            {
                replacements: memberReplacements(member),
                type: QueryTypes.SELECT,
            }
        );

        await Promise.all(updates.map((update) => upsertReadState(update.id, member.id, { is_read: true })));
        await markDeliveries(updates.map((update) => update.id), member.id, 'Read');
        emitToMember(member.id, 'updates:changed', { all: true });
        emitToAdmins('broadcasts:changed', { all: true });

        return res.json({ message: 'All updates marked as read.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to mark all updates as read.', error: error.message });
    }
});

router.put('/updates/save/:id', async (req, res) => {
    try {
        const member = await getActiveMember(req);

        if (!member) {
            return res.status(403).json({ message: 'Only members can save updates.' });
        }

        await ensureUpdateTables();
        await upsertReadState(req.params.id, member.id, { is_saved: req.body.is_saved !== false });

        return res.json({ message: 'Update save status changed.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to save update.', error: error.message });
    }
});

router.put('/updates/delete/:id', async (req, res) => {
    try {
        const member = await getActiveMember(req);

        if (!member) {
            return res.status(403).json({ message: 'Only members can delete updates.' });
        }

        await ensureUpdateTables();
        await upsertReadState(req.params.id, member.id, { is_deleted: true });
        emitToMember(member.id, 'updates:changed', { notification_id: Number(req.params.id) });
        emitToAdmins('broadcasts:changed', { notification_id: Number(req.params.id) });

        return res.json({ message: 'Update deleted locally.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to delete update.', error: error.message });
    }
});

async function getActiveMember(req) {
    if (!req.admin || req.admin.type !== 'member') {
        return null;
    }

    const members = await sequelize.query(
        `SELECT id, member_id, full_name, membership_group, status
         FROM members
         WHERE id = :id
         LIMIT 1`,
        {
            replacements: { id: req.admin.id },
            type: QueryTypes.SELECT,
        }
    );

    return members[0] && members[0].status === 'Active' ? members[0] : null;
}

function baseUpdateQuery(member) {
    return `
        SELECT
            n.id,
            n.title,
            n.body,
            n.type,
            COALESCE(n.category, map_category.category) AS category,
            COALESCE(n.priority, 'Normal') AS priority,
            n.related_type,
            n.related_id,
            n.attachment_url,
            n.sent_at,
            COALESCE(a.name, 'Dhaka Club Admin') AS sender_name,
            COALESCE(nr.is_read, n.is_read, 0) AS is_read,
            COALESCE(nr.is_saved, 0) AS is_saved
        FROM notifications n
        LEFT JOIN admins a ON a.id = n.sender_admin_id
        LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.member_id = :memberId
        LEFT JOIN (
            SELECT 'Notice' AS notification_type, 'Notices' AS category UNION ALL
            SELECT 'Event', 'Events' UNION ALL
            SELECT 'Booking', 'Bookings' UNION ALL
            SELECT 'Renewal', 'Membership' UNION ALL
            SELECT 'Community', 'Community' UNION ALL
            SELECT 'Auction', 'General' UNION ALL
            SELECT 'General', 'General'
        ) AS map_category ON map_category.notification_type = n.type
        WHERE COALESCE(nr.is_deleted, 0) = 0
          AND (
              n.member_id = :memberId
              OR (
                  n.member_id IS NULL
                  AND (
                      NOT EXISTS (SELECT 1 FROM notification_targets nt WHERE nt.notification_id = n.id)
                      OR EXISTS (
                          SELECT 1
                          FROM notification_targets nt
                          WHERE nt.notification_id = n.id
                            AND (
                                nt.target_type = 'All Members'
                                OR (nt.target_type = 'Membership Group' AND nt.target_value = :membershipGroup)
                                OR (nt.target_type = 'Specific Member' AND nt.target_value = :memberIdString)
                            )
                      )
                  )
              )
          )`;
}

function memberReplacements(member) {
    return {
        memberId: member.id,
        memberIdString: String(member.id),
        membershipGroup: member.membership_group || '',
    };
}

async function upsertReadState(notificationId, memberId, state) {
    const replacements = {
        notificationId,
        memberId,
        is_read: state.is_read === undefined ? 0 : state.is_read ? 1 : 0,
        read_at: state.is_read ? new Date() : null,
        is_saved: state.is_saved === undefined ? 0 : state.is_saved ? 1 : 0,
        is_deleted: state.is_deleted === undefined ? 0 : state.is_deleted ? 1 : 0,
    };

    const existing = await sequelize.query(
        `SELECT id, is_read, is_saved, is_deleted
         FROM notification_reads
         WHERE notification_id = :notificationId AND member_id = :memberId
         LIMIT 1`,
        {
            replacements,
            type: QueryTypes.SELECT,
        }
    );

    if (!existing[0]) {
        await sequelize.query(
            `INSERT INTO notification_reads
             (notification_id, member_id, is_read, read_at, is_saved, is_deleted)
             VALUES (:notificationId, :memberId, :is_read, :read_at, :is_saved, :is_deleted)`,
            {
                replacements,
                type: QueryTypes.INSERT,
            }
        );
        return;
    }

    const updates = [];
    const updateReplacements = { notificationId, memberId };

    if (state.is_read !== undefined) {
        updates.push('is_read = :is_read', 'read_at = :read_at');
        updateReplacements.is_read = state.is_read ? 1 : 0;
        updateReplacements.read_at = state.is_read ? new Date() : null;
    }

    if (state.is_saved !== undefined) {
        updates.push('is_saved = :is_saved');
        updateReplacements.is_saved = state.is_saved ? 1 : 0;
    }

    if (state.is_deleted !== undefined) {
        updates.push('is_deleted = :is_deleted');
        updateReplacements.is_deleted = state.is_deleted ? 1 : 0;
    }

    if (!updates.length) {
        return;
    }

    await sequelize.query(
        `UPDATE notification_reads
         SET ${updates.join(', ')}
         WHERE notification_id = :notificationId AND member_id = :memberId`,
        {
            replacements: updateReplacements,
            type: QueryTypes.UPDATE,
        }
    );
}

async function markDeliveries(notificationIds, memberId, status) {
    const ids = [...new Set(notificationIds.map((id) => Number(id)).filter(Boolean))];

    if (!ids.length) {
        return;
    }

    await ensureDeliveryLinkColumn();

    const timestampColumn = status === 'Read' ? 'read_at' : 'delivered_at';
    const currentStatuses = status === 'Read' ? ['Sent', 'Delivered', 'Read'] : ['Sent'];

    await sequelize.query(
        `UPDATE notification_deliveries
         SET status = :status, ${timestampColumn} = COALESCE(${timestampColumn}, CURRENT_TIMESTAMP)
         WHERE member_id = :memberId
           AND notification_id IN (:ids)
           AND status IN (:currentStatuses)`,
        {
            replacements: {
                status,
                memberId,
                ids,
                currentStatuses,
            },
            type: QueryTypes.UPDATE,
        }
    );

    await sequelize.query(
        `UPDATE notification_deliveries nd
         JOIN notification_broadcasts nb ON nb.id = nd.broadcast_id
         JOIN notifications n ON n.id IN (:ids)
            AND n.member_id = nd.member_id
            AND n.title = nb.title
            AND n.body = nb.body
         SET nd.notification_id = n.id,
             nd.status = :status,
             nd.${timestampColumn} = COALESCE(nd.${timestampColumn}, CURRENT_TIMESTAMP)
         WHERE nd.member_id = :memberId
           AND nd.notification_id IS NULL
           AND nd.status IN (:currentStatuses)`,
        {
            replacements: {
                status,
                memberId,
                ids,
                currentStatuses,
            },
            type: QueryTypes.UPDATE,
        }
    );
}

function formatUpdate(update) {
    return {
        ...update,
        priority: update.priority === 'Critical' ? 'Critical' : update.priority === 'Important' ? 'Important' : 'Normal',
        preview: String(update.body || '').slice(0, 120),
        is_read: Boolean(update.is_read),
        is_saved: Boolean(update.is_saved),
    };
}

function ensureUpdateTables() {
    if (!setupPromise) {
        setupPromise = migrateUpdateTables().catch((error) => {
            setupPromise = null;
            throw error;
        });
    }

    return setupPromise;
}

async function migrateUpdateTables() {
    await sequelize.query(
        `CREATE TABLE IF NOT EXISTS notification_reads (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            notification_id BIGINT UNSIGNED NOT NULL,
            member_id BIGINT UNSIGNED NOT NULL,
            is_read BOOLEAN NOT NULL DEFAULT FALSE,
            read_at DATETIME NULL,
            is_saved BOOLEAN NOT NULL DEFAULT FALSE,
            is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_notification_reads_member_notification (member_id, notification_id),
            KEY idx_notification_reads_member_read (member_id, is_read),
            KEY idx_notification_reads_deleted (is_deleted)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await sequelize.query(
        `CREATE TABLE IF NOT EXISTS notification_targets (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            notification_id BIGINT UNSIGNED NOT NULL,
            target_type ENUM('All Members', 'Membership Group', 'Specific Member') NOT NULL DEFAULT 'All Members',
            target_value VARCHAR(150) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_notification_targets_notification (notification_id),
            KEY idx_notification_targets_target (target_type, target_value)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await sequelize.query(
        `CREATE TABLE IF NOT EXISTS notification_broadcasts (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            title VARCHAR(180) NOT NULL,
            body TEXT NOT NULL,
            type ENUM('Push Notification', 'Notice Alert', 'Event Reminder', 'Renewal Reminder') NOT NULL,
            channel ENUM('Push', 'Notice', 'Event', 'Renewal') NOT NULL DEFAULT 'Push',
            target_type ENUM('All Members', 'Membership Group', 'Specific Member') NOT NULL,
            target_value VARCHAR(150) NULL,
            recipient_count INT UNSIGNED NOT NULL DEFAULT 0,
            created_by BIGINT UNSIGNED NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_notification_broadcasts_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await sequelize.query(
        `CREATE TABLE IF NOT EXISTS notification_deliveries (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            broadcast_id BIGINT UNSIGNED NOT NULL,
            notification_id BIGINT UNSIGNED NULL,
            member_id BIGINT UNSIGNED NOT NULL,
            status ENUM('Sent', 'Delivered', 'Read') NOT NULL DEFAULT 'Sent',
            delivered_at DATETIME NULL,
            read_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_notification_deliveries_broadcast (broadcast_id),
            KEY idx_notification_deliveries_notification (notification_id),
            KEY idx_notification_deliveries_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    await ensureDeliveryLinkColumn();

    await addNotificationColumn('category', "ENUM('Notices', 'Events', 'Bookings', 'Membership', 'Community', 'Emergency', 'General') NULL AFTER type");
    await addNotificationColumn('priority', "ENUM('Normal', 'Important', 'Critical') NOT NULL DEFAULT 'Normal' AFTER category");
    await addNotificationColumn('related_type', "ENUM('Notice', 'Event', 'Booking', 'Membership', 'Community', 'Venue', 'Renewal', 'General') NULL AFTER priority");
    await addNotificationColumn('related_id', 'BIGINT UNSIGNED NULL AFTER related_type');
    await addNotificationColumn('attachment_url', 'VARCHAR(255) NULL AFTER related_id');
    await addNotificationColumn('sender_admin_id', 'BIGINT UNSIGNED NULL AFTER attachment_url');
}

async function ensureDeliveryLinkColumn() {
    try {
        await sequelize.query('ALTER TABLE notification_deliveries ADD COLUMN notification_id BIGINT UNSIGNED NULL AFTER broadcast_id');
    } catch (error) {
        if (!error.parent || error.parent.code !== 'ER_DUP_FIELDNAME') {
            throw error;
        }
    }

    try {
        await sequelize.query('ALTER TABLE notification_deliveries ADD KEY idx_notification_deliveries_notification (notification_id)');
    } catch (error) {
        if (!error.parent || error.parent.code !== 'ER_DUP_KEYNAME') {
            throw error;
        }
    }
}

async function addNotificationColumn(columnName, definition) {
    try {
        await sequelize.query(`ALTER TABLE notifications ADD COLUMN ${columnName} ${definition}`);
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
            return;
        }

        throw error;
    }
}

module.exports = router;
