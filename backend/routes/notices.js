const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');
const writeAuditLog = require('../utils/auditLog');

const router = express.Router();
const attachmentDir = path.join(__dirname, '..', 'uploads', 'notice-attachments');

fs.mkdirSync(attachmentDir, { recursive: true });

const attachmentUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, callback) => {
            callback(null, attachmentDir);
        },
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname || '').toLowerCase() || '.bin';
            callback(null, `notice-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
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
        await ensureColumns();

        const notices = await sequelize.query(
            `SELECT notices.*, admins.name AS created_by_name
             FROM notices
             INNER JOIN admins ON admins.id = notices.created_by
             ORDER BY notices.created_at DESC`,
            { type: QueryTypes.SELECT }
        );

        return res.json(notices);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch notices.', error: error.message });
    }
});

router.post('/', attachmentUpload.single('attachment'), async (req, res) => {
    const { title, body, target_group } = req.body;
    const createdBy = req.admin && req.admin.id;
    const attachmentUrl = req.file ? `/uploads/notice-attachments/${req.file.filename}` : null;

    if (!title || !body) {
        return res.status(400).json({ message: 'Title and body are required.' });
    }

    if (!createdBy) {
        return res.status(401).json({ message: 'Authentication token is invalid.' });
    }

    try {
        await ensureColumns();

        const result = await sequelize.query(
            `INSERT INTO notices (title, body, target_group, attachment_url, created_by)
             VALUES (:title, :body, :target_group, :attachment_url, :created_by)`,
            {
                replacements: {
                    title,
                    body,
                    target_group: target_group || null,
                    attachment_url: attachmentUrl,
                    created_by: createdBy,
                },
                type: QueryTypes.INSERT,
            }
        );

        const notices = await sequelize.query(
            `SELECT notices.*, admins.name AS created_by_name
             FROM notices
             INNER JOIN admins ON admins.id = notices.created_by
             WHERE notices.id = :id
             LIMIT 1`,
            {
                replacements: { id: result[0] },
                type: QueryTypes.SELECT,
            }
        );

        return res.status(201).json(notices[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to create notice.', error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const notices = await sequelize.query(
            'SELECT id FROM notices WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!notices[0]) {
            return res.status(404).json({ message: 'Notice not found.' });
        }

        await sequelize.query(
            'DELETE FROM notices WHERE id = :id',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.DELETE,
            }
        );

        writeAuditLog({
            module: 'Notices',
            action: 'Notice Deleted',
            entityId: req.params.id,
            description: `Deleted notice #${req.params.id}`,
            adminId: req.admin.id,
        });

        return res.json({ message: 'Notice deleted successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to delete notice.', error: error.message });
    }
});

function ensureColumns() {
    if (!setupPromise) {
        setupPromise = addNoticeColumn('attachment_url', 'VARCHAR(255) NULL AFTER target_group').catch((error) => {
            setupPromise = null;
            throw error;
        });
    }

    return setupPromise;
}

async function addNoticeColumn(columnName, definition) {
    try {
        await sequelize.query(`ALTER TABLE notices ADD COLUMN ${columnName} ${definition}`);
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_FIELDNAME') {
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
