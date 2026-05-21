const { QueryTypes } = require('sequelize');
const sequelize = require('./config/db');

const venues = [
    {
        name: 'Royal Bengal Dining',
        description: 'Formal dining venue for club members and guests.',
        capacity: 120,
        per_day_charge: 25000,
    },
    {
        name: 'Royal Bengal Lounge',
        description: 'Premium lounge space for social gatherings.',
        capacity: 80,
        per_day_charge: 18000,
    },
    {
        name: 'Cigar Lounge',
        description: 'Private lounge area for small gatherings.',
        capacity: 35,
        per_day_charge: 12000,
    },
    {
        name: 'Banquet & Dining Spaces',
        description: 'Large event and banquet venue.',
        capacity: 250,
        per_day_charge: 50000,
    },
    {
        name: 'Seminar / Meeting Halls',
        description: 'Meeting and seminar rooms for club programs.',
        capacity: 100,
        per_day_charge: 20000,
    },
    {
        name: 'Outdoor Lawn Areas',
        description: 'Open-air lawn space for outdoor events.',
        capacity: 300,
        per_day_charge: 45000,
    },
    {
        name: 'Executive Lounge-style Seating Areas',
        description: 'Executive seating area for formal and informal meetings.',
        capacity: 60,
        per_day_charge: 15000,
    },
];

const seedVenues = async () => {
    try {
        await sequelize.authenticate();

        for (const venue of venues) {
            await sequelize.query(
                `INSERT INTO venues (name, description, capacity, per_day_charge, status)
                 VALUES (:name, :description, :capacity, :per_day_charge, 'Available')
                 ON DUPLICATE KEY UPDATE
                    description = VALUES(description),
                    capacity = VALUES(capacity),
                    per_day_charge = VALUES(per_day_charge)`,
                {
                    replacements: venue,
                    type: QueryTypes.INSERT,
                }
            );
        }

        console.log(`${venues.length} venues seeded successfully.`);
        process.exit(0);
    } catch (error) {
        console.error('Failed to seed venues:', error.message);
        process.exit(1);
    }
};

seedVenues();
