const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');
const writeAuditLog = require('../utils/auditLog');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const renewals = await sequelize.query(
            `SELECT
                card_renewals.*,
                members.full_name,
                members.phone,
                admins.name AS processed_by_name
             FROM card_renewals
             INNER JOIN members ON members.id = card_renewals.member_id
             LEFT JOIN admins ON admins.id = card_renewals.processed_by
             ORDER BY card_renewals.created_at DESC`,
            { type: QueryTypes.SELECT }
        );

        return res.json(renewals);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch renewals.', error: error.message });
    }
});

router.get('/expiring', async (req, res) => {
    try {
        const members = await sequelize.query(
            `SELECT id, member_id, full_name, phone, membership_expiry
             FROM members
             WHERE status = 'Active'
                AND membership_expiry IS NOT NULL
                AND membership_expiry BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
             ORDER BY membership_expiry ASC`,
            { type: QueryTypes.SELECT }
        );

        return res.json(members);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch expiring memberships.', error: error.message });
    }
});

router.post('/', async (req, res) => {
    const { member_id, renewal_date, expiry_date, amount } = req.body;
    const processedBy = req.admin && req.admin.id;
    const requiredFields = { member_id, renewal_date, expiry_date, amount };
    const missingField = Object.keys(requiredFields).find((field) => requiredFields[field] === undefined || requiredFields[field] === null || requiredFields[field] === '');

    if (missingField) {
        return res.status(400).json({ message: `${missingField} is required.` });
    }

    if (!processedBy) {
        return res.status(401).json({ message: 'Authentication token is invalid.' });
    }

    const transaction = await sequelize.transaction();

    try {
        const members = await sequelize.query(
            'SELECT id FROM members WHERE id = :member_id LIMIT 1',
            {
                replacements: { member_id },
                type: QueryTypes.SELECT,
                transaction,
            }
        );

        if (!members[0]) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Member not found.' });
        }

        const result = await sequelize.query(
            `INSERT INTO card_renewals
                (member_id, renewal_date, expiry_date, amount, processed_by)
             VALUES
                (:member_id, :renewal_date, :expiry_date, :amount, :processed_by)`,
            {
                replacements: {
                    member_id,
                    renewal_date,
                    expiry_date,
                    amount,
                    processed_by: processedBy,
                },
                type: QueryTypes.INSERT,
                transaction,
            }
        );

        await sequelize.query(
            'UPDATE members SET membership_expiry = :expiry_date WHERE id = :member_id',
            {
                replacements: {
                    expiry_date,
                    member_id,
                },
                type: QueryTypes.UPDATE,
                transaction,
            }
        );

        await transaction.commit();

        const renewals = await sequelize.query(
            `SELECT
                card_renewals.*,
                members.full_name,
                members.phone
             FROM card_renewals
             INNER JOIN members ON members.id = card_renewals.member_id
             WHERE card_renewals.id = :id
             LIMIT 1`,
            {
                replacements: { id: result[0] },
                type: QueryTypes.SELECT,
            }
        );

        return res.status(201).json(renewals[0]);
    } catch (error) {
        await transaction.rollback();
        return res.status(500).json({ message: 'Failed to create renewal.', error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    const { payment_status } = req.body;

    if (!['Pending', 'Paid'].includes(payment_status)) {
        return res.status(400).json({ message: 'payment_status must be Pending or Paid.' });
    }

    try {
        const renewals = await sequelize.query(
            'SELECT id FROM card_renewals WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!renewals[0]) {
            return res.status(404).json({ message: 'Renewal not found.' });
        }

        await sequelize.query(
            'UPDATE card_renewals SET payment_status = :payment_status WHERE id = :id',
            {
                replacements: {
                    payment_status,
                    id: req.params.id,
                },
                type: QueryTypes.UPDATE,
            }
        );

        const updatedRenewals = await sequelize.query(
            `SELECT
                card_renewals.*,
                members.full_name,
                members.phone
             FROM card_renewals
             INNER JOIN members ON members.id = card_renewals.member_id
             WHERE card_renewals.id = :id
             LIMIT 1`,
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        writeAuditLog({
            module: 'Renewals',
            action: 'Renewal Updated',
            entityId: req.params.id,
            description: `Renewal payment status changed to ${payment_status}`,
            adminId: req.admin.id,
        });

        return res.json(updatedRenewals[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update renewal.', error: error.message });
    }
});

module.exports = router;
