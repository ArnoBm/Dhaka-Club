const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();
const profilePhotoDir = path.join(__dirname, '..', 'uploads', 'profile-photos');

fs.mkdirSync(profilePhotoDir, { recursive: true });

const profilePhotoUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, callback) => {
            callback(null, profilePhotoDir);
        },
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
            callback(null, `member-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
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
        fileSize: 3 * 1024 * 1024,
    },
});

const memberSelectFields = `
    id,
    member_id,
    full_name,
    phone,
    email,
    blood_group,
    date_of_birth,
    occupation,
    address,
    member_type,
    membership_group,
    membership_expiry,
    status,
    profile_photo,
    secondary_number
`;

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const admins = await sequelize.query(
            'SELECT id, name, email, password, role FROM admins WHERE email = :email LIMIT 1',
            {
                replacements: { email },
                type: QueryTypes.SELECT,
            }
        );

        const admin = admins[0];

        if (!admin) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            {
                id: admin.id,
                email: admin.email,
                role: admin.role,
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            token,
            admin: {
                id: admin.id,
                name: admin.name,
                role: admin.role,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Login failed.', error: error.message });
    }
});

router.post('/member-login', async (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).json({ message: 'Phone and password are required.' });
    }

    try {
        await ensureMemberProfileColumns();

        const members = await sequelize.query(
            `SELECT ${memberSelectFields}, password
             FROM members
             WHERE phone = :phone
             LIMIT 1`,
            {
                replacements: { phone },
                type: QueryTypes.SELECT,
            }
        );

        const member = members[0];

        if (!member || !member.password) {
            return res.status(401).json({ message: 'Invalid phone or password.' });
        }

        if (member.status !== 'Active') {
            return res.status(403).json({ message: 'Your account is not active' });
        }

        const isPasswordValid = await bcrypt.compare(password, member.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid phone or password.' });
        }

        const token = jwt.sign(
            {
                id: member.id,
                member_id: member.member_id,
                phone: member.phone,
                type: 'member',
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        delete member.password;

        return res.json({
            token,
            member,
        });
    } catch (error) {
        return res.status(500).json({ message: 'Member login failed.', error: error.message });
    }
});

router.post('/member-register', async (req, res) => {
    const { member_id, full_name, phone, password } = req.body;

    if (!member_id || !full_name || !phone || !password) {
        return res.status(400).json({ message: 'member_id, full_name, phone, and password are required.' });
    }

    try {
        await ensureMemberProfileColumns();

        const members = await sequelize.query(
            `SELECT id, member_id, full_name, phone
             FROM members
             WHERE member_id = :member_id AND phone = :phone
             LIMIT 1`,
            {
                replacements: {
                    member_id,
                    phone,
                },
                type: QueryTypes.SELECT,
            }
        );

        const member = members[0];

        if (!member) {
            return res.status(404).json({ message: 'Member not found with the provided member ID and phone.' });
        }

        if (member.full_name.trim().toLowerCase() !== full_name.trim().toLowerCase()) {
            return res.status(400).json({ message: 'Member name does not match our records.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await sequelize.query(
            `UPDATE members
             SET password = :password
             WHERE id = :id`,
            {
                replacements: {
                    password: hashedPassword,
                    id: member.id,
                },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({ message: 'Member password set successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Member registration failed.', error: error.message });
    }
});

router.get('/member-profile', auth, async (req, res) => {
    const memberId = req.admin && req.admin.id;
    const tokenType = req.admin && req.admin.type;

    if (tokenType !== 'member' || !memberId) {
        return res.status(403).json({ message: 'Only members can view member profile.' });
    }

    try {
        await ensureMemberProfileColumns();
        const members = await sequelize.query(
            `SELECT ${memberSelectFields}
             FROM members
             WHERE id = :id
             LIMIT 1`,
            {
                replacements: { id: memberId },
                type: QueryTypes.SELECT,
            }
        );

        if (!members[0]) {
            return res.status(404).json({ message: 'Member not found.' });
        }

        return res.json(members[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch member profile.', error: error.message });
    }
});

router.put('/member-profile', auth, profilePhotoUpload.single('profile_photo'), async (req, res) => {
    const memberId = req.admin && req.admin.id;
    const tokenType = req.admin && req.admin.type;

    if (tokenType !== 'member' || !memberId) {
        return res.status(403).json({ message: 'Only members can update member profile.' });
    }

    try {
        await ensureMemberProfileColumns();

        if (Object.prototype.hasOwnProperty.call(req.body, 'email') && !req.body.email) {
            return res.status(400).json({ message: 'Email is required.' });
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'phone') && !req.body.phone) {
            return res.status(400).json({ message: 'Primary phone number is required.' });
        }

        const allowedFields = ['email', 'phone', 'secondary_number', 'occupation', 'address'];
        const data = allowedFields.reduce((picked, field) => {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                picked[field] = req.body[field] || null;
            }

            return picked;
        }, {});

        if (req.file) {
            data.profile_photo = `/uploads/profile-photos/${req.file.filename}`;
        }

        const fields = Object.keys(data);

        if (!fields.length) {
            return res.status(400).json({ message: 'No profile fields provided.' });
        }

        const setClause = fields.map((field) => `${field} = :${field}`).join(', ');

        await sequelize.query(
            `UPDATE members
             SET ${setClause}
             WHERE id = :id`,
            {
                replacements: {
                    ...data,
                    id: memberId,
                },
                type: QueryTypes.UPDATE,
            }
        );

        const members = await sequelize.query(
            `SELECT ${memberSelectFields}
             FROM members
             WHERE id = :id
             LIMIT 1`,
            {
                replacements: { id: memberId },
                type: QueryTypes.SELECT,
            }
        );

        return res.json({
            message: 'Profile updated successfully.',
            member: members[0],
        });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update profile.', error: error.message });
    }
});

router.post('/member-change-password', auth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const memberId = req.admin && req.admin.id;
    const tokenType = req.admin && req.admin.type;

    if (tokenType !== 'member' || !memberId) {
        return res.status(403).json({ message: 'Only members can change member password.' });
    }

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current password and new password are required.' });
    }

    if (String(newPassword).length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    try {
        await ensureMemberProfileColumns();

        const members = await sequelize.query(
            'SELECT id, password FROM members WHERE id = :id LIMIT 1',
            {
                replacements: { id: memberId },
                type: QueryTypes.SELECT,
            }
        );

        const member = members[0];

        if (!member || !member.password) {
            return res.status(404).json({ message: 'Member password is not set.' });
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, member.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Current password is incorrect.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await sequelize.query(
            'UPDATE members SET password = :password WHERE id = :id',
            {
                replacements: {
                    password: hashedPassword,
                    id: memberId,
                },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({ message: 'Password changed successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Member password change failed.', error: error.message });
    }
});

router.post('/change-password', auth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.admin && req.admin.id;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current password and new password are required.' });
    }

    if (!adminId) {
        return res.status(401).json({ message: 'Authentication token is invalid.' });
    }

    try {
        const admins = await sequelize.query(
            'SELECT id, password FROM admins WHERE id = :adminId LIMIT 1',
            {
                replacements: { adminId },
                type: QueryTypes.SELECT,
            }
        );

        const admin = admins[0];

        if (!admin) {
            return res.status(404).json({ message: 'Admin account not found.' });
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Current password is incorrect.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await sequelize.query(
            'UPDATE admins SET password = :password WHERE id = :adminId',
            {
                replacements: {
                    password: hashedPassword,
                    adminId,
                },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({ message: 'Password changed successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Password change failed.', error: error.message });
    }
});

async function ensureMemberPasswordColumn() {
    const columns = await sequelize.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'members'
            AND COLUMN_NAME = 'password'
         LIMIT 1`,
        { type: QueryTypes.SELECT }
    );

    if (columns.length) {
        return;
    }

    await sequelize.query(
        'ALTER TABLE members ADD COLUMN password VARCHAR(255) NULL AFTER profile_photo'
    );
}

async function ensureMemberProfileColumns() {
    const columns = await sequelize.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'members'
            AND COLUMN_NAME IN ('password', 'secondary_number')`,
        { type: QueryTypes.SELECT }
    );
    const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));

    if (!existingColumns.has('password')) {
        await sequelize.query(
            'ALTER TABLE members ADD COLUMN password VARCHAR(255) NULL AFTER profile_photo'
        );
    }

    if (!existingColumns.has('secondary_number')) {
        await sequelize.query(
            'ALTER TABLE members ADD COLUMN secondary_number VARCHAR(30) NULL AFTER phone'
        );
    }
}

module.exports = router;
