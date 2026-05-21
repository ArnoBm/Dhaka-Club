const express = require('express');
const bcrypt = require('bcryptjs');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');
const writeAuditLog = require('../utils/auditLog');

const router = express.Router();

router.use(auth);

const memberTypes = [
    'Life Member',
    'General Member',
    'Honorary Member',
    'Special Member',
    'Officers of Defense Forces',
];

const legacyMemberTypeMap = {
    Regular: 'General Member',
    Life: 'Life Member',
    Honorary: 'Honorary Member',
    Associate: 'Special Member',
};

const memberFields = [
    'member_id',
    'full_name',
    'email',
    'phone',
    'blood_group',
    'date_of_birth',
    'occupation',
    'address',
    'member_type',
    'membership_group',
    'membership_expiry',
];

let memberTypeMigrationPromise = null;
let memberPasswordColumnPromise = null;

router.get('/', async (req, res) => {
    const { group, status, search } = req.query;
    const where = [];
    const replacements = {};

    if (group) {
        where.push('membership_group = :group');
        replacements.group = group;
    }

    if (status) {
        where.push('status = :status');
        replacements.status = status;
    }

    if (search) {
        where.push('(full_name LIKE :search OR phone LIKE :search OR member_id LIKE :search)');
        replacements.search = `%${search}%`;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    try {
        const members = await sequelize.query(
            `SELECT * FROM members ${whereClause} ORDER BY created_at DESC`,
            {
                replacements,
                type: QueryTypes.SELECT,
            }
        );

        return res.json(members);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch members.', error: error.message });
    }
});

router.get('/groups', async (req, res) => {
    try {
        const groups = await sequelize.query(
            `SELECT DISTINCT membership_group
             FROM members
             WHERE membership_group IS NOT NULL AND membership_group <> ''
             ORDER BY membership_group ASC`,
            { type: QueryTypes.SELECT }
        );

        return res.json(groups.map((row) => row.membership_group));
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch member groups.', error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const members = await sequelize.query(
            'SELECT * FROM members WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!members[0]) {
            return res.status(404).json({ message: 'Member not found.' });
        }

        return res.json(members[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch member.', error: error.message });
    }
});

router.post('/', async (req, res) => {
    const data = pickFields(req.body, memberFields);
    normalizeMemberPayload(data);
    const requiredFields = ['member_id', 'full_name', 'email', 'phone'];
    const missingField = requiredFields.find((field) => !data[field]);

    if (missingField) {
        return res.status(400).json({ message: `${missingField} is required.` });
    }

    try {
        await ensureMemberTypeEnum();
        await ensureMemberPasswordColumn();

        data.password = await bcrypt.hash('123456', 10);

        const columns = Object.keys(data);
        const placeholders = columns.map((column) => `:${column}`);

        const result = await sequelize.query(
            `INSERT INTO members (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            {
                replacements: data,
                type: QueryTypes.INSERT,
            }
        );

        const memberId = result[0];
        const members = await sequelize.query(
            'SELECT * FROM members WHERE id = :id LIMIT 1',
            {
                replacements: { id: memberId },
                type: QueryTypes.SELECT,
            }
        );

        return res.status(201).json(members[0]);
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Member ID or email already exists.' });
        }

        return res.status(500).json({ message: 'Failed to create member.', error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    const data = pickFields(req.body, [...memberFields, 'status']);
    normalizeMemberPayload(data);
    const fields = Object.keys(data);

    if (!fields.length) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        await ensureMemberTypeEnum();

        const existingMembers = await sequelize.query(
            'SELECT id FROM members WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!existingMembers[0]) {
            return res.status(404).json({ message: 'Member not found.' });
        }

        const setClause = fields.map((field) => `${field} = :${field}`).join(', ');

        await sequelize.query(
            `UPDATE members SET ${setClause} WHERE id = :id`,
            {
                replacements: {
                    ...data,
                    id: req.params.id,
                },
                type: QueryTypes.UPDATE,
            }
        );

        const members = await sequelize.query(
            'SELECT * FROM members WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        writeAuditLog({
            module: 'Members',
            action: 'Admin Edited Member',
            entityId: req.params.id,
            description: `Updated member ${members[0]?.member_id || req.params.id}`,
            adminId: req.admin.id,
        });

        return res.json(members[0]);
    } catch (error) {
        if (error.parent && error.parent.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Member ID or email already exists.' });
        }

        return res.status(500).json({ message: 'Failed to update member.', error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const existingMembers = await sequelize.query(
            'SELECT id FROM members WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!existingMembers[0]) {
            return res.status(404).json({ message: 'Member not found.' });
        }

        await sequelize.query(
            'UPDATE members SET status = :status WHERE id = :id',
            {
                replacements: {
                    status: 'Inactive',
                    id: req.params.id,
                },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({ message: 'Member marked as inactive.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to deactivate member.', error: error.message });
    }
});

function pickFields(source, fields) {
    return fields.reduce((picked, field) => {
        if (Object.prototype.hasOwnProperty.call(source, field)) {
            picked[field] = source[field];
        }

        return picked;
    }, {});
}

function normalizeMemberPayload(data) {
    if (Object.prototype.hasOwnProperty.call(data, 'member_type')) {
        data.member_type = normalizeMemberType(data.member_type);
    }
}

function normalizeMemberType(value) {
    if (!value) {
        return value;
    }

    return legacyMemberTypeMap[value] || value;
}

async function ensureMemberTypeEnum() {
    if (!memberTypeMigrationPromise) {
        memberTypeMigrationPromise = migrateMemberTypeEnum().catch((error) => {
            memberTypeMigrationPromise = null;
            throw error;
        });
    }

    return memberTypeMigrationPromise;
}

async function migrateMemberTypeEnum() {
    await sequelize.query(
        `ALTER TABLE members
         MODIFY member_type ENUM('Regular', 'Life', 'Honorary', 'Associate', 'Life Member', 'General Member', 'Honorary Member', 'Special Member', 'Officers of Defense Forces') NOT NULL DEFAULT 'General Member'`
    );

    await sequelize.query(
        `UPDATE members
         SET member_type = CASE member_type
             WHEN 'Regular' THEN 'General Member'
             WHEN 'Life' THEN 'Life Member'
             WHEN 'Honorary' THEN 'Honorary Member'
             WHEN 'Associate' THEN 'Special Member'
             ELSE member_type
         END
         WHERE member_type IN ('Regular', 'Life', 'Honorary', 'Associate')`
    );

    const enumValues = memberTypes.map((type) => `'${type.replace(/'/g, "''")}'`).join(', ');

    await sequelize.query(
        `ALTER TABLE members
         MODIFY member_type ENUM(${enumValues}) NOT NULL DEFAULT 'General Member'`
    );
}

async function ensureMemberPasswordColumn() {
    if (!memberPasswordColumnPromise) {
        memberPasswordColumnPromise = migrateMemberPasswordColumn().catch((error) => {
            memberPasswordColumnPromise = null;
            throw error;
        });
    }

    return memberPasswordColumnPromise;
}

async function migrateMemberPasswordColumn() {
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

module.exports = router;
