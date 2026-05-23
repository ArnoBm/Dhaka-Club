const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');
const { requireRoles } = require('../middleware/roles');
const { storeUploadedFile } = require('../utils/fileStorage');
const { isExpoPushToken } = require('../utils/pushNotifications');
const { canAccessMemberApp, canUseMemberPrivileges, getMembershipState } = require('../utils/memberAccess');

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
    const identifier = String(req.body.phone || req.body.email || '').trim();
    const { password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ message: 'Mobile number/email and password are required.' });
    }

    try {
        await ensureAdminAccessColumns();

        const admins = await sequelize.query(
            `SELECT id, name, email, phone, password, role, status
             FROM admins
             WHERE phone = :identifier OR email = :identifier
             LIMIT 1`,
            {
                replacements: { identifier },
                type: QueryTypes.SELECT,
            }
        );

        const admin = admins[0];

        if (!admin) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        if (admin.status && admin.status !== 'Active') {
            return res.status(403).json({ message: 'Your admin account is inactive.' });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);
        const normalizedRole = admin.role === 'Staff' ? 'Security Staff' : admin.role;

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            {
                id: admin.id,
                email: admin.email,
                phone: admin.phone,
                role: normalizedRole,
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            token,
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                phone: admin.phone,
                role: normalizedRole,
                status: admin.status || 'Active',
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Login failed.', error: error.message });
    }
});

router.get('/admins', auth, requireRoles(['Super Admin']), async (req, res) => {
    try {
        await ensureAdminAccessColumns();

        const admins = await sequelize.query(
            `SELECT id, name, email, phone, role, status, created_at
             FROM admins
             ORDER BY created_at DESC, id DESC`,
            { type: QueryTypes.SELECT }
        );

        return res.json(admins.map((admin) => ({
            ...admin,
            role: admin.role === 'Staff' ? 'Security Staff' : admin.role,
        })));
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch admin users.', error: error.message });
    }
});

router.post('/admins', auth, requireRoles(['Super Admin']), async (req, res) => {
    const { name, email, phone, password, role, status } = req.body;
    const normalizedRole = normalizeAdminRole(role);

    if (!name || !phone || !password || !normalizedRole) {
        return res.status(400).json({ message: 'Name, mobile number, password, and role are required.' });
    }

    if (String(password).length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    try {
        await ensureAdminAccessColumns();

        const hashedPassword = await bcrypt.hash(password, 10);
        const [id] = await sequelize.query(
            `INSERT INTO admins (name, email, phone, password, role, status)
             VALUES (:name, :email, :phone, :password, :role, :status)`,
            {
                replacements: {
                    name,
                    email: email || null,
                    phone,
                    password: hashedPassword,
                    role: normalizedRole,
                    status: status || 'Active',
                },
                type: QueryTypes.INSERT,
            }
        );

        return res.status(201).json({ id, message: 'Admin user created.' });
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This email or mobile number is already used by another admin.' });
        }

        return res.status(500).json({ message: 'Failed to create admin user.', error: error.message });
    }
});

router.put('/admins/:id', auth, requireRoles(['Super Admin']), async (req, res) => {
    const { name, email, phone, password, role, status } = req.body;
    const normalizedRole = normalizeAdminRole(role);

    if (!name || !phone || !normalizedRole) {
        return res.status(400).json({ message: 'Name, mobile number, and role are required.' });
    }

    if (String(req.params.id) === String(req.admin.id) && status === 'Inactive') {
        return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    try {
        await ensureAdminAccessColumns();

        const data = {
            id: req.params.id,
            name,
            email: email || null,
            phone,
            role: normalizedRole,
            status: status || 'Active',
        };
        const passwordSql = password ? ', password = :password' : '';

        if (password) {
            if (String(password).length < 6) {
                return res.status(400).json({ message: 'Password must be at least 6 characters.' });
            }

            data.password = await bcrypt.hash(password, 10);
        }

        await sequelize.query(
            `UPDATE admins
             SET name = :name,
                 email = :email,
                 phone = :phone,
                 role = :role,
                 status = :status
                 ${passwordSql}
             WHERE id = :id`,
            { replacements: data, type: QueryTypes.UPDATE }
        );

        return res.json({ message: 'Admin user updated.' });
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'This email or mobile number is already used by another admin.' });
        }

        return res.status(500).json({ message: 'Failed to update admin user.', error: error.message });
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

        if (!canAccessMemberApp(member)) {
            return res.status(403).json({ message: 'Your membership is suspended. Please contact Dhaka Club administration.' });
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
        member.membership_state = getMembershipState(member);
        member.can_use_privileges = canUseMemberPrivileges(member);

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

        const member = members[0];
        member.membership_state = getMembershipState(member);
        member.can_use_privileges = canUseMemberPrivileges(member);

        return res.json(member);
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
            data.profile_photo = await storeUploadedFile(req.file, {
                folder: 'dhaka-club/profile-photos',
                fallbackPath: `/uploads/profile-photos/${req.file.filename}`,
                resourceType: 'image',
            });
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
            member: {
                ...members[0],
                membership_state: getMembershipState(members[0]),
                can_use_privileges: canUseMemberPrivileges(members[0]),
            },
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

router.post('/member-push-token', auth, async (req, res) => {
    const memberId = req.admin && req.admin.id;
    const tokenType = req.admin && req.admin.type;
    const { expo_push_token } = req.body;

    if (tokenType !== 'member' || !memberId) {
        return res.status(403).json({ message: 'Only members can register push tokens.' });
    }

    if (!isExpoPushToken(expo_push_token)) {
        return res.status(400).json({ message: 'A valid Expo push token is required.' });
    }

    try {
        await ensureMemberPushTokenColumn();

        await sequelize.query(
            'UPDATE members SET expo_push_token = :expo_push_token WHERE id = :id',
            {
                replacements: {
                    expo_push_token,
                    id: memberId,
                },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({ message: 'Push token saved successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to save push token.', error: error.message });
    }
});

router.delete('/member-push-token', auth, async (req, res) => {
    const memberId = req.admin && req.admin.id;
    const tokenType = req.admin && req.admin.type;

    if (tokenType !== 'member' || !memberId) {
        return res.status(403).json({ message: 'Only members can remove push tokens.' });
    }

    try {
        await ensureMemberPushTokenColumn();

        await sequelize.query(
            'UPDATE members SET expo_push_token = NULL WHERE id = :id',
            {
                replacements: { id: memberId },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({ message: 'Push token removed successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to remove push token.', error: error.message });
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

async function ensureMemberPushTokenColumn() {
    const columns = await sequelize.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'members'
            AND COLUMN_NAME = 'expo_push_token'
         LIMIT 1`,
        { type: QueryTypes.SELECT }
    );

    if (columns.length) {
        return;
    }

    await sequelize.query(
        'ALTER TABLE members ADD COLUMN expo_push_token VARCHAR(255) NULL AFTER password'
    );
}

async function ensureAdminAccessColumns() {
    const columns = await sequelize.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'admins'
            AND COLUMN_NAME IN ('status', 'phone')`,
        { type: QueryTypes.SELECT }
    );
    const existingColumns = new Set(columns.map((column) => column.COLUMN_NAME));

    await sequelize.query(
        `ALTER TABLE admins
         MODIFY email VARCHAR(150) NULL`
    ).catch(() => null);

    await sequelize.query(
        `ALTER TABLE admins
         MODIFY role ENUM('Super Admin', 'Admin', 'Security Staff', 'Staff') NOT NULL DEFAULT 'Admin'`
    ).catch(() => null);

    if (!existingColumns.has('phone')) {
        await sequelize.query(
            `ALTER TABLE admins
             ADD COLUMN phone VARCHAR(30) NULL AFTER email`
        );
    }

    await sequelize.query(
        `ALTER TABLE admins
         ADD UNIQUE KEY uq_admins_phone (phone)`
    ).catch(() => null);

    if (!existingColumns.has('status')) {
        await sequelize.query(
            `ALTER TABLE admins
             ADD COLUMN status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active' AFTER role`
        );
    }
}

function normalizeAdminRole(role) {
    if (role === 'Staff') {
        return 'Security Staff';
    }

    if (['Super Admin', 'Admin', 'Security Staff'].includes(role)) {
        return role;
    }

    return null;
}

module.exports = router;
