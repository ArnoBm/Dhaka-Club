const bcrypt = require('bcryptjs');
const { QueryTypes } = require('sequelize');
const sequelize = require('./config/db');

const seedAdmin = async () => {
    try {
        await sequelize.authenticate();

        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);

        await sequelize.query(
            `INSERT INTO admins (name, email, phone, password, role)
             VALUES (:name, :email, :phone, :password, :role)`,
            {
                replacements: {
                    name: 'Super Admin',
                    email: 'admin@dhakaclub.com',
                    phone: '01700000000',
                    password: hashedPassword,
                    role: 'Super Admin',
                },
                type: QueryTypes.INSERT,
            }
        );

        console.log('Super Admin created successfully.');
        console.log('Email: admin@dhakaclub.com');
        console.log('Phone: 01700000000');
        console.log('Password: admin123');
        process.exit(0);
    } catch (error) {
        console.error('Failed to seed Super Admin:', error.message);
        process.exit(1);
    }
};

seedAdmin();
