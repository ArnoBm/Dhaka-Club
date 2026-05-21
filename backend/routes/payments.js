const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

let setupPromise = null;

router.get('/', async (req, res) => {
    const { status, provider, search } = req.query;
    const where = [];
    const replacements = {};

    if (status) {
        where.push('p.status = :status');
        replacements.status = status;
    }

    if (provider) {
        where.push('p.provider = :provider');
        replacements.provider = provider;
    }

    if (search) {
        where.push('(p.invoice_no LIKE :search OR p.reference_no LIKE :search OR m.full_name LIKE :search OR m.member_id LIKE :search)');
        replacements.search = `%${search}%`;
    }

    try {
        await ensureTables();

        const payments = await sequelize.query(
            `SELECT p.*, m.full_name, m.member_id, a.name AS recorded_by_name
             FROM payments p
             LEFT JOIN members m ON m.id = p.member_id
             LEFT JOIN admins a ON a.id = p.recorded_by
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY p.created_at DESC
             LIMIT 300`,
            { replacements, type: QueryTypes.SELECT }
        );

        return res.json(payments);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch payments.', error: error.message });
    }
});

router.post('/', async (req, res) => {
    const { member_id, amount, provider, purpose, reference_no, payment_date, status } = req.body;

    if (!amount || !provider || !purpose || !payment_date) {
        return res.status(400).json({ message: 'Amount, provider, purpose, and payment date are required.' });
    }

    try {
        await ensureTables();

        const invoiceNo = `INV-${Date.now()}`;

        const result = await sequelize.query(
            `INSERT INTO payments
             (invoice_no, member_id, amount, provider, purpose, reference_no, payment_date, status, recorded_by)
             VALUES (:invoice_no, :member_id, :amount, :provider, :purpose, :reference_no, :payment_date, :status, :recorded_by)`,
            {
                replacements: {
                    invoice_no: invoiceNo,
                    member_id: member_id || null,
                    amount,
                    provider,
                    purpose,
                    reference_no: reference_no || null,
                    payment_date,
                    status: status || 'Paid',
                    recorded_by: req.admin.id,
                },
                type: QueryTypes.INSERT,
            }
        );

        return res.status(201).json({ id: result[0], invoice_no: invoiceNo, message: 'Payment recorded.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to record payment.', error: error.message });
    }
});

router.put('/:id/reconcile', async (req, res) => {
    const { status } = req.body;

    if (!['Pending', 'Paid', 'Failed', 'Refunded'].includes(status)) {
        return res.status(400).json({ message: 'Invalid payment status.' });
    }

    try {
        await ensureTables();

        await sequelize.query(
            'UPDATE payments SET status = :status, reconciled_at = CURRENT_TIMESTAMP WHERE id = :id',
            {
                replacements: { status, id: req.params.id },
                type: QueryTypes.UPDATE,
            }
        );

        return res.json({ message: 'Payment reconciled.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to reconcile payment.', error: error.message });
    }
});

function ensureTables() {
    if (!setupPromise) {
        setupPromise = sequelize.query(
            `CREATE TABLE IF NOT EXISTS payments (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                invoice_no VARCHAR(80) NOT NULL,
                member_id BIGINT UNSIGNED NULL,
                amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                provider ENUM('Manual', 'bKash', 'Nagad', 'Card') NOT NULL DEFAULT 'Manual',
                purpose VARCHAR(150) NOT NULL,
                reference_no VARCHAR(150) NULL,
                payment_date DATE NOT NULL,
                status ENUM('Pending', 'Paid', 'Failed', 'Refunded') NOT NULL DEFAULT 'Paid',
                recorded_by BIGINT UNSIGNED NULL,
                reconciled_at DATETIME NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_payments_invoice_no (invoice_no),
                KEY idx_payments_status (status),
                KEY idx_payments_provider (provider)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        ).catch((error) => {
            setupPromise = null;
            throw error;
        });
    }

    return setupPromise;
}

module.exports = router;
