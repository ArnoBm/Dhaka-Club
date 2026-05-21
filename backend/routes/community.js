const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

const allowedRequestTypes = ['Blood', 'Medical Help', 'Fund Collection', 'Other'];

router.get('/', async (req, res) => {
    const { type, status } = req.query;
    const where = [];
    const replacements = {};

    if (type) {
        where.push('community_requests.request_type = :type');
        replacements.type = type;
    }

    if (status) {
        where.push('community_requests.status = :status');
        replacements.status = status;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    try {
        const requests = await sequelize.query(
            `SELECT
                community_requests.*,
                members.full_name AS requester_full_name,
                members.member_id AS requester_member_id,
                members.phone AS requester_phone
             FROM community_requests
             INNER JOIN members ON members.id = community_requests.member_id
             ${whereClause}
             ORDER BY community_requests.created_at DESC`,
            {
                replacements,
                type: QueryTypes.SELECT,
            }
        );

        return res.json(requests);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch community requests.', error: error.message });
    }
});

router.post('/', async (req, res) => {
    const {
        member_id,
        request_type,
        blood_group_needed,
        description,
        contact_number,
        location,
    } = req.body;
    const requiredFields = {
        member_id,
        request_type,
        description,
        contact_number,
        location,
    };
    const missingField = Object.keys(requiredFields).find((field) => !requiredFields[field]);

    if (missingField) {
        return res.status(400).json({ message: `${missingField} is required.` });
    }

    if (!allowedRequestTypes.includes(request_type)) {
        return res.status(400).json({ message: 'Invalid request type.' });
    }

    if (request_type === 'Blood' && !blood_group_needed) {
        return res.status(400).json({ message: 'blood_group_needed is required for blood requests.' });
    }

    try {
        await ensureCommunityRequestTypes();

        const result = await sequelize.query(
            `INSERT INTO community_requests
                (member_id, request_type, blood_group_needed, description, contact_number, location)
             VALUES
                (:member_id, :request_type, :blood_group_needed, :description, :contact_number, :location)`,
            {
                replacements: {
                    member_id,
                    request_type,
                    blood_group_needed: blood_group_needed || null,
                    description,
                    contact_number,
                    location,
                },
                type: QueryTypes.INSERT,
            }
        );

        const requests = await sequelize.query(
            `SELECT
                community_requests.*,
                members.full_name AS requester_full_name,
                members.phone AS requester_phone
             FROM community_requests
             INNER JOIN members ON members.id = community_requests.member_id
             WHERE community_requests.id = :id
             LIMIT 1`,
            {
                replacements: { id: result[0] },
                type: QueryTypes.SELECT,
            }
        );

        return res.status(201).json(requests[0]);
    } catch (error) {
        const isEnumError = error.message && error.message.includes("Data truncated for column 'request_type'");
        const message = isEnumError
            ? 'Database needs the Fund Collection request type migration. Restart the backend and try again.'
            : 'Failed to create community request.';

        return res.status(500).json({ message, error: error.message });
    }
});

router.put('/:id/status', async (req, res) => {
    const { status } = req.body;

    if (!['Fulfilled', 'Closed'].includes(status)) {
        return res.status(400).json({ message: 'Status must be Fulfilled or Closed.' });
    }

    try {
        const requests = await sequelize.query(
            'SELECT id FROM community_requests WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!requests[0]) {
            return res.status(404).json({ message: 'Community request not found.' });
        }

        await sequelize.query(
            'UPDATE community_requests SET status = :status WHERE id = :id',
            {
                replacements: {
                    status,
                    id: req.params.id,
                },
                type: QueryTypes.UPDATE,
            }
        );

        const updatedRequests = await sequelize.query(
            `SELECT
                community_requests.*,
                members.full_name AS requester_full_name,
                members.phone AS requester_phone
             FROM community_requests
             INNER JOIN members ON members.id = community_requests.member_id
             WHERE community_requests.id = :id
             LIMIT 1`,
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        return res.json(updatedRequests[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update community request.', error: error.message });
    }
});

async function ensureCommunityRequestTypes() {
    const columns = await sequelize.query(
        `SELECT COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'community_requests'
            AND COLUMN_NAME = 'request_type'
         LIMIT 1`,
        { type: QueryTypes.SELECT }
    );
    const columnType = columns[0] && columns[0].COLUMN_TYPE;

    if (columnType && columnType.includes("'Fund Collection'")) {
        return;
    }

    await sequelize.query(
        "ALTER TABLE community_requests MODIFY request_type ENUM('Blood', 'Medical Help', 'Fund Collection', 'Other') NOT NULL",
        { type: QueryTypes.RAW }
    );
}

module.exports = router;
