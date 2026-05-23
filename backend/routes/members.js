const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');
const writeAuditLog = require('../utils/auditLog');

const router = express.Router();
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 2 * 1024 * 1024,
    },
});

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
    'secondary_number',
    'blood_group',
    'date_of_birth',
    'occupation',
    'address',
    'profile_photo',
    'member_type',
    'membership_group',
    'membership_expiry',
    'status',
];

const csvHeaders = [
    'member_id',
    'full_name',
    'email',
    'phone',
    'secondary_number',
    'blood_group',
    'date_of_birth',
    'occupation',
    'address',
    'profile_photo',
    'member_type',
    'membership_group',
    'membership_expiry',
    'status',
];

const validBloodGroups = new Set(['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const validStatuses = new Set(['Active', 'Inactive', 'Suspended']);

let memberTypeMigrationPromise = null;
let memberPasswordColumnPromise = null;

router.get('/', async (req, res) => {
    const { group, member_type, status, search, sort_by, membership_expired, expired_window } = req.query;
    const where = [];
    const replacements = {};
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    if (group) {
        where.push('membership_group = :group');
        replacements.group = group;
    }

    if (member_type) {
        where.push('member_type = :member_type');
        replacements.member_type = member_type;
    }

    if (status) {
        where.push('status = :status');
        replacements.status = status;
    }

    if (membership_expired === '1' || membership_expired === 'true') {
        where.push('membership_expiry IS NOT NULL AND membership_expiry < CURDATE()');

        if (expired_window === '2_months') {
            where.push('membership_expiry >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)');
        }
    }

    if (search) {
        where.push('(full_name LIKE :search OR phone LIKE :search OR member_id LIKE :search)');
        replacements.search = `%${search}%`;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sortColumns = {
        newest: 'CAST(member_id AS UNSIGNED)',
        created_at: 'created_at',
        member_id: 'CAST(member_id AS UNSIGNED)',
        full_name: 'full_name',
        phone: 'phone',
        member_type: 'member_type',
        membership_group: 'membership_group',
        membership_expiry: 'membership_expiry',
        status: 'status',
    };
    const sortColumn = sortColumns[sort_by] || 'created_at';
    const sortDirection = sort_by === 'newest' ? 'DESC' : 'ASC';

    try {
        const [summary] = await sequelize.query(
            `SELECT COUNT(*) AS total FROM members ${whereClause}`,
            {
                replacements,
                type: QueryTypes.SELECT,
            }
        );

        const members = await sequelize.query(
            `SELECT * FROM members ${whereClause} ORDER BY ${sortColumn} ${sortDirection} LIMIT :limit OFFSET :offset`,
            {
                replacements: {
                    ...replacements,
                    limit,
                    offset,
                },
                type: QueryTypes.SELECT,
            }
        );

        return res.json({
            data: members,
            pagination: {
                page,
                limit,
                total: Number(summary.total || 0),
                total_pages: Math.max(Math.ceil(Number(summary.total || 0) / limit), 1),
            },
        });
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

router.get('/import-template', (req, res) => {
    const rows = [
        csvHeaders,
        [
            'DC-1001',
            'Abdullah Khan',
            'abdullah@example.com',
            '01711111111',
            '01811111111',
            'A+',
            '12-03-1985',
            'Businessperson',
            'Gulshan, Dhaka',
            '',
            'General Member',
            'Executive',
            '31-12-2027',
            'Active',
        ],
        [
            'DC-1002',
            'Sadia Rahman',
            'sadia@example.com',
            '01722222222',
            '',
            'O+',
            '20-08-1990',
            'Doctor',
            'Banani, Dhaka',
            '',
            'Life Member',
            'Premium',
            '31-12-2030',
            'Active',
        ],
    ];
    const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="dhaka-club-members-template.csv"');
    return res.send(csv);
});

router.post('/import-csv', csvUpload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'CSV file is required.' });
    }

    try {
        await ensureMemberTypeEnum();
        await ensureMemberPasswordColumn();

        const csvText = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
        const parsedRows = parseCsv(csvText);

        if (parsedRows.length < 2) {
            return res.status(400).json({ message: 'CSV file must include a header row and at least one member row.' });
        }

        const headers = parsedRows[0].map((header) => String(header || '').trim());
        const missingHeaders = ['member_id', 'full_name', 'email', 'phone', 'member_type', 'status'].filter((header) => !headers.includes(header));

        if (missingHeaders.length) {
            return res.status(400).json({ message: `Missing required CSV columns: ${missingHeaders.join(', ')}` });
        }

        const defaultPassword = await bcrypt.hash('123456', 10);
        const errors = [];
        const inserted = [];
        let skipped = 0;

        for (let index = 1; index < parsedRows.length; index += 1) {
            const row = parsedRows[index];
            const rowNumber = index + 1;

            if (!row.some((cell) => String(cell || '').trim())) {
                continue;
            }

            const data = headers.reduce((picked, header, headerIndex) => {
                if (csvHeaders.includes(header)) {
                    picked[header] = String(row[headerIndex] || '').trim();
                }

                return picked;
            }, {});

            normalizeMemberPayload(data);
            normalizeCsvMemberPayload(data);

            const validationError = validateCsvMember(data);

            if (validationError) {
                skipped += 1;
                errors.push({ row: rowNumber, member_id: data.member_id || null, message: validationError });
                continue;
            }

            const existingMembers = await sequelize.query(
                `SELECT id, member_id, email, phone
                 FROM members
                 WHERE member_id = :member_id OR email = :email OR phone = :phone
                 LIMIT 1`,
                {
                    replacements: {
                        member_id: data.member_id,
                        email: data.email,
                        phone: data.phone,
                    },
                    type: QueryTypes.SELECT,
                }
            );

            if (existingMembers[0]) {
                skipped += 1;
                errors.push({ row: rowNumber, member_id: data.member_id, message: 'Duplicate member_id, email, or phone. Row skipped.' });
                continue;
            }

            data.password = defaultPassword;
            const columns = Object.keys(data).filter((key) => data[key] !== undefined);
            const placeholders = columns.map((column) => `:${column}`);

            await sequelize.query(
                `INSERT INTO members (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
                {
                    replacements: data,
                    type: QueryTypes.INSERT,
                }
            );

            inserted.push(data.member_id);
        }

        return res.json({
            message: 'CSV import completed.',
            total_rows: parsedRows.length - 1,
            imported: inserted.length,
            skipped,
            default_password: '123456',
            errors,
        });
    } catch (error) {
        if (error instanceof multer.MulterError) {
            return res.status(400).json({ message: error.message });
        }

        return res.status(500).json({ message: 'Failed to import members.', error: error.message });
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

        const existingMembers = await sequelize.query(
            'SELECT id FROM members WHERE phone = :phone LIMIT 1',
            {
                replacements: { phone: data.phone },
                type: QueryTypes.SELECT,
            }
        );

        if (existingMembers[0]) {
            return res.status(409).json({ message: 'Phone number already belongs to another member.' });
        }

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
            return res.status(409).json({ message: 'Member ID, email, or phone already exists.' });
        }

        return res.status(500).json({ message: 'Failed to create member.', error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    const data = pickFields(req.body, [...memberFields, 'status']);
    normalizeMemberPayload(data);
    delete data.phone;
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

router.put('/bulk/status', async (req, res) => {
    const { member_ids, status } = req.body;

    if (!Array.isArray(member_ids) || !member_ids.length) {
        return res.status(400).json({ message: 'member_ids must be a non-empty array.' });
    }

    if (!validStatuses.has(status)) {
        return res.status(400).json({ message: 'Invalid status. Use Active, Inactive, or Suspended.' });
    }

    const ids = [...new Set(member_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];

    if (!ids.length) {
        return res.status(400).json({ message: 'No valid member IDs provided.' });
    }

    try {
        await sequelize.query(
            `UPDATE members
             SET status = :status
             WHERE id IN (:ids)`,
            {
                replacements: { status, ids },
                type: QueryTypes.UPDATE,
            }
        );

        writeAuditLog({
            module: 'Members',
            action: 'Bulk Member Status Updated',
            entityId: null,
            description: `Updated ${ids.length} members to ${status}`,
            adminId: req.admin.id,
        });

        return res.json({ message: 'Member statuses updated.', updated: ids.length, status });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update member statuses.', error: error.message });
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

function normalizeCsvMemberPayload(data) {
    csvHeaders.forEach((field) => {
        if (data[field] === '') {
            data[field] = null;
        }
    });

    if (!data.member_type) {
        data.member_type = 'General Member';
    }

    if (!data.status) {
        data.status = 'Active';
    }

    data.date_of_birth = normalizeCsvDate(data.date_of_birth);
    data.membership_expiry = normalizeCsvDate(data.membership_expiry);
    data.phone = normalizeBangladeshPhone(data.phone);
    data.secondary_number = normalizeBangladeshPhone(data.secondary_number);
}

function validateCsvMember(data) {
    const requiredFields = ['member_id', 'full_name', 'email', 'phone'];
    const missingField = requiredFields.find((field) => !data[field]);

    if (missingField) {
        return `${missingField} is required.`;
    }

    if (!memberTypes.includes(data.member_type)) {
        return `Invalid member_type. Use one of: ${memberTypes.join(', ')}.`;
    }

    if (!validStatuses.has(data.status)) {
        return 'Invalid status. Use Active, Inactive, or Suspended.';
    }

    if (data.blood_group && !validBloodGroups.has(data.blood_group)) {
        return 'Invalid blood_group.';
    }

    return null;
}

function normalizeCsvDate(value) {
    if (!value) {
        return null;
    }

    const normalizedValue = String(value).trim();
    if (/^\d{4,6}$/.test(normalizedValue)) {
        return normalizeExcelSerialDate(Number(normalizedValue));
    }

    const dateOnlyValue = normalizedValue.split(/[ T]/)[0];
    const dayFirstMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(dateOnlyValue);
    const yearFirstMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(dateOnlyValue);

    if (dayFirstMatch) {
        const [, day, month, year] = dayFirstMatch;
        const dayFirstDate = normalizeDateParts(expandYear(year), month, day);

        if (dayFirstDate) {
            return dayFirstDate;
        }

        return normalizeDateParts(expandYear(year), day, month);
    }

    if (yearFirstMatch) {
        const [, year, month, day] = yearFirstMatch;
        return normalizeDateParts(year, month, day);
    }

    const parsedDate = new Date(normalizedValue);

    if (!Number.isNaN(parsedDate.getTime())) {
        return [
            parsedDate.getFullYear(),
            String(parsedDate.getMonth() + 1).padStart(2, '0'),
            String(parsedDate.getDate()).padStart(2, '0'),
        ].join('-');
    }

    return null;
}

function normalizeDateParts(year, month, day) {
    const paddedDay = String(day).padStart(2, '0');
    const paddedMonth = String(month).padStart(2, '0');
    const normalized = `${year}-${paddedMonth}-${paddedDay}`;
    const date = new Date(`${normalized}T00:00:00Z`);

    if (
        Number.isNaN(date.getTime()) ||
        date.getUTCFullYear() !== Number(year) ||
        date.getUTCMonth() + 1 !== Number(paddedMonth) ||
        date.getUTCDate() !== Number(paddedDay)
    ) {
        return false;
    }

    return normalized;
}

function normalizeExcelSerialDate(serial) {
    if (!Number.isFinite(serial) || serial < 1) {
        return null;
    }

    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + serial * 24 * 60 * 60 * 1000);

    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

function expandYear(year) {
    if (String(year).length === 2) {
        return Number(year) > 40 ? `19${year}` : `20${year}`;
    }

    return year;
}

function normalizeBangladeshPhone(value) {
    if (!value) {
        return null;
    }

    const digits = String(value).trim().replace(/[^\d]/g, '');

    if (!digits) {
        return null;
    }

    if (/^01\d{9}$/.test(digits)) {
        return digits;
    }

    if (/^1\d{9}$/.test(digits)) {
        return `0${digits}`;
    }

    if (/^8801\d{9}$/.test(digits)) {
        return `0${digits.slice(3)}`;
    }

    return String(value).trim();
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const nextChar = text[index + 1];

        if (char === '"' && quoted && nextChar === '"') {
            cell += '"';
            index += 1;
            continue;
        }

        if (char === '"') {
            quoted = !quoted;
            continue;
        }

        if (char === ',' && !quoted) {
            row.push(cell);
            cell = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && nextChar === '\n') {
                index += 1;
            }

            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
            continue;
        }

        cell += char;
    }

    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }

    return rows;
}

function escapeCsvCell(value) {
    const text = String(value ?? '');

    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
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
