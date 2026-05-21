const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

const auctionFields = [
    'title',
    'description',
    'starting_price',
    'item_image',
    'auction_start',
    'auction_end',
    'status',
];

router.get('/', async (req, res) => {
    const { status } = req.query;
    const replacements = {};
    let whereClause = '';

    if (status) {
        whereClause = 'WHERE auction_items.status = :status';
        replacements.status = status;
    }

    try {
        const auctions = await sequelize.query(
            `SELECT
                auction_items.*,
                COALESCE(
                    (SELECT MAX(bid_amount) FROM bids WHERE bids.auction_item_id = auction_items.id),
                    auction_items.current_bid
                ) AS highest_bid,
                (
                    SELECT members.full_name
                    FROM bids
                    INNER JOIN members ON members.id = bids.member_id
                    WHERE bids.auction_item_id = auction_items.id
                    ORDER BY bids.bid_amount DESC, bids.bid_time ASC
                    LIMIT 1
                ) AS highest_bidder_name
             FROM auction_items
             ${whereClause}
             ORDER BY auction_items.auction_end ASC`,
            {
                replacements,
                type: QueryTypes.SELECT,
            }
        );

        return res.json(auctions);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch auctions.', error: error.message });
    }
});

router.get('/:id/bids', async (req, res) => {
    try {
        const bids = await sequelize.query(
            `SELECT
                bids.*,
                members.full_name AS bidder_full_name,
                members.member_id AS bidder_member_id
             FROM bids
             INNER JOIN members ON members.id = bids.member_id
             WHERE bids.auction_item_id = :id
             ORDER BY bids.bid_amount DESC`,
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        return res.json(bids);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch auction bids.', error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const auctions = await sequelize.query(
            `SELECT
                auction_items.*,
                highest_bidder.full_name AS highest_bidder_name
             FROM auction_items
             LEFT JOIN members AS highest_bidder ON highest_bidder.id = auction_items.highest_bidder_id
             WHERE auction_items.id = :id
             LIMIT 1`,
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!auctions[0]) {
            return res.status(404).json({ message: 'Auction item not found.' });
        }

        return res.json(auctions[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch auction item.', error: error.message });
    }
});

router.post('/', async (req, res) => {
    const data = pickFields(req.body, auctionFields);
    const createdBy = req.admin && req.admin.id;
    const requiredFields = ['title', 'starting_price', 'auction_start', 'auction_end'];
    const missingField = requiredFields.find((field) => data[field] === undefined || data[field] === null || data[field] === '');

    if (missingField) {
        return res.status(400).json({ message: `${missingField} is required.` });
    }

    if (!createdBy) {
        return res.status(401).json({ message: 'Authentication token is invalid.' });
    }

    try {
        const insertData = {
            ...data,
            created_by: createdBy,
        };
        const columns = Object.keys(insertData);
        const placeholders = columns.map((column) => `:${column}`);

        const result = await sequelize.query(
            `INSERT INTO auction_items (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
            {
                replacements: insertData,
                type: QueryTypes.INSERT,
            }
        );

        const auctions = await sequelize.query(
            'SELECT * FROM auction_items WHERE id = :id LIMIT 1',
            {
                replacements: { id: result[0] },
                type: QueryTypes.SELECT,
            }
        );

        return res.status(201).json(auctions[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to create auction item.', error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    const data = pickFields(req.body, auctionFields);
    const fields = Object.keys(data);

    if (!fields.length) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        const existingAuctions = await sequelize.query(
            'SELECT id FROM auction_items WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        if (!existingAuctions[0]) {
            return res.status(404).json({ message: 'Auction item not found.' });
        }

        const setClause = fields.map((field) => `${field} = :${field}`).join(', ');

        await sequelize.query(
            `UPDATE auction_items SET ${setClause} WHERE id = :id`,
            {
                replacements: {
                    ...data,
                    id: req.params.id,
                },
                type: QueryTypes.UPDATE,
            }
        );

        const auctions = await sequelize.query(
            'SELECT * FROM auction_items WHERE id = :id LIMIT 1',
            {
                replacements: { id: req.params.id },
                type: QueryTypes.SELECT,
            }
        );

        return res.json(auctions[0]);
    } catch (error) {
        return res.status(500).json({ message: 'Failed to update auction item.', error: error.message });
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

module.exports = router;
