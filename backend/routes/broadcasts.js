const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');
const { emitToAdmins, emitToMember } = require('../utils/realtime');
const { storeUploadedFile } = require('../utils/fileStorage');
const { sendExpoPushNotifications } = require('../utils/pushNotifications');

const router = express.Router();
const attachmentDir = path.join(__dirname, '..', 'uploads', 'broadcast-attachments');

fs.mkdirSync(attachmentDir, { recursive: true });

const attachmentUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, callback) => {
            callback(null, attachmentDir);
        },
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname || '').toLowerCase() || '.bin';
            callback(null, `broadcast-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
        },
    }),
    fileFilter: (req, file, callback) => {
        const isAllowed = file.mimetype === 'application/pdf' || file.mimetype?.startsWith('image/');

        if (!isAllowed) {
            callback(new Error('Only image and PDF files are allowed.'));
            return;
        }

        callback(null, true);
    },
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});

router.use(auth);

let setupPromise = null;

router.get('/', async (req, res) => {
    try {
        await ensureTables();

        const broadcasts = await sequelize.query(
            `SELECT b.*, a.name AS created_by_name,
                    SUM(nd.status = 'Sent') AS sent_count,
                    SUM(nd.status = 'Delivered') AS delivered_count,
                    SUM(nd.status = 'Read') AS read_count
             FROM notification_broadcasts b
             LEFT JOIN admins a ON a.id = b.created_by
             LEFT JOIN notification_deliveries nd ON nd.broadcast_id = b.id
             GROUP BY b.id, a.name
             ORDER BY b.created_at DESC
             LIMIT 100`,
            { type: QueryTypes.SELECT }
        );

        return res.json(broadcasts);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch broadcasts.', error: error.message });
    }
});

router.post('/', attachmentUpload.single('attachment'), async (req, res) => {
    const { title, body, type, channel, target_type, target_value } = req.body;
    const attachmentUrl = req.file
        ? await storeUploadedFile(req.file, {
            folder: 'dhaka-club/broadcast-attachments',
            fallbackPath: `/uploads/broadcast-attachments/${req.file.filename}`,
        })
        : null;

    if (!title || !body || !type || !channel || !target_type) {
        return res.status(400).json({ message: 'Title, body, type, channel, and target are required.' });
    }

    try {
        await ensureTables();

        const recipients = await findRecipients(target_type, target_value);

        const result = await sequelize.query(
            `INSERT INTO notification_broadcasts
             (title, body, type, channel, target_type, target_value, attachment_url, created_by, recipient_count)
             VALUES (:title, :body, :type, :channel, :target_type, :target_value, :attachment_url, :created_by, :recipient_count)`,
            {
                replacements: {
                    title,
                    body,
                    type,
                    channel,
                    target_type,
                    target_value: target_value || null,
                    attachment_url: attachmentUrl,
                    created_by: req.admin.id,
                    recipient_count: recipients.length,
                },
                type: QueryTypes.INSERT,
            }
        );

        const broadcastId = result[0];

        const pushMessages = [];

        for (const recipient of recipients) {
            const notificationResult = await sequelize.query(
                `INSERT INTO notifications (member_id, title, body, type, attachment_url)
                 VALUES (:member_id, :title, :body, :notificationType, :attachment_url)`,
                {
                    replacements: { member_id: recipient.id, title, body, notificationType: mapNotificationType(type), attachment_url: attachmentUrl },
                    type: QueryTypes.INSERT,
                }
            );
            const notificationId = notificationResult[0];

            await sequelize.query(
                `INSERT INTO notification_deliveries (broadcast_id, notification_id, member_id, status)
                 VALUES (:broadcast_id, :notification_id, :member_id, 'Sent')`,
                {
                    replacements: { broadcast_id: broadcastId, notification_id: notificationId, member_id: recipient.id },
                    type: QueryTypes.INSERT,
                }
            );

            emitToMember(recipient.id, 'updates:new', {
                notification_id: notificationId,
                broadcast_id: broadcastId,
            });

            if (recipient.expo_push_token) {
                pushMessages.push({
                    to: recipient.expo_push_token,
                    title,
                    body,
                    sound: 'default',
                    data: {
                        type: 'broadcast',
                        notification_id: notificationId,
                        broadcast_id: broadcastId,
                    },
                });
            }
        }

        sendExpoPushNotifications(pushMessages).catch((pushError) => {
            console.error('Failed to send push notifications:', pushError.message);
        });

        emitToAdmins('broadcasts:changed', { broadcast_id: broadcastId });

        return res.status(201).json({ message: 'Broadcast sent.', broadcast_id: broadcastId, recipients: recipients.length, push_recipients: pushMessages.length });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to send broadcast.', error: error.message });
    }
});

router.get('/:id/deliveries', async (req, res) => {
    try {
        await ensureTables();

        const deliveries = await sequelize.query(
            `SELECT nd.*, m.full_name, m.member_id, m.phone
             FROM notification_deliveries nd
             JOIN members m ON m.id = nd.member_id
             WHERE nd.broadcast_id = :id
             ORDER BY nd.created_at DESC`,
            { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
        );

        return res.json(deliveries);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch delivery status.', error: error.message });
    }
});

async function findRecipients(targetType, targetValue) {
    if (targetType === 'Specific Member') {
        return sequelize.query(
            'SELECT id, expo_push_token FROM members WHERE id = :id AND status = "Active"',
            { replacements: { id: targetValue }, type: QueryTypes.SELECT }
        );
    }

    if (targetType === 'Membership Group') {
        return sequelize.query(
            'SELECT id, expo_push_token FROM members WHERE membership_group = :group AND status = "Active"',
            { replacements: { group: targetValue }, type: QueryTypes.SELECT }
        );
    }

    return sequelize.query(
        'SELECT id, expo_push_token FROM members WHERE status = "Active"',
        { type: QueryTypes.SELECT }
    );
}

function mapNotificationType(type) {
    const types = {
        'Notice Alert': 'Notice',
        'Event Reminder': 'Event',
        'Renewal Reminder': 'Renewal',
        'Push Notification': 'General',
    };

    return types[type] || 'General';
}

function ensureTables() {
    if (!setupPromise) {
        setupPromise = Promise.all([
            sequelize.query(
                `CREATE TABLE IF NOT EXISTS notification_broadcasts (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    title VARCHAR(180) NOT NULL,
                    body TEXT NOT NULL,
                    type ENUM('Push Notification', 'Notice Alert', 'Event Reminder', 'Renewal Reminder') NOT NULL,
                    channel ENUM('Push', 'Notice', 'Event', 'Renewal') NOT NULL DEFAULT 'Push',
                    target_type ENUM('All Members', 'Membership Group', 'Specific Member') NOT NULL,
                    target_value VARCHAR(150) NULL,
                    attachment_url VARCHAR(255) NULL,
                    recipient_count INT UNSIGNED NOT NULL DEFAULT 0,
                    created_by BIGINT UNSIGNED NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_notification_broadcasts_created_at (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
            ),
            sequelize.query(
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
            ),
            sequelize.query(
                `CREATE TABLE IF NOT EXISTS notification_targets (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    notification_id BIGINT UNSIGNED NOT NULL,
                    target_type ENUM('All Members', 'Membership Group', 'Specific Member') NOT NULL DEFAULT 'All Members',
                    target_value VARCHAR(150) NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_notification_targets_notification (notification_id),
                    KEY idx_notification_targets_target (target_type, target_value)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci`
            ),
            addDeliveryColumn('notification_id', 'BIGINT UNSIGNED NULL AFTER broadcast_id'),
            addBroadcastColumn('attachment_url', 'VARCHAR(255) NULL AFTER target_value'),
            addNotificationColumn('attachment_url', 'VARCHAR(255) NULL AFTER related_id'),
            addMemberColumn('expo_push_token', 'VARCHAR(255) NULL AFTER password'),
            addDeliveryIndex(),
        ]).catch((error) => {
            setupPromise = null;
            throw error;
        });
    }

    return setupPromise;
}

async function addMemberColumn(columnName, definition) {
    try {
        await sequelize.query(`ALTER TABLE members ADD COLUMN ${columnName} ${definition}`);
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
            return;
        }

        throw error;
    }
}

async function addDeliveryColumn(columnName, definition) {
    try {
        await sequelize.query(`ALTER TABLE notification_deliveries ADD COLUMN ${columnName} ${definition}`);
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
            return;
        }

        throw error;
    }
}

async function addBroadcastColumn(columnName, definition) {
    try {
        await sequelize.query(`ALTER TABLE notification_broadcasts ADD COLUMN ${columnName} ${definition}`);
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
            return;
        }

        throw error;
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

async function addDeliveryIndex() {
    try {
        await sequelize.query('ALTER TABLE notification_deliveries ADD KEY idx_notification_deliveries_notification (notification_id)');
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_KEYNAME') {
            return;
        }

        throw error;
    }
}

router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError || error.message) {
        return res.status(400).json({
            message: error.code === 'LIMIT_FILE_SIZE' ? 'Attachment must be 10MB or smaller.' : error.message,
        });
    }

    return next(error);
});

module.exports = router;
