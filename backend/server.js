const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const sequelize = require('./config/db');
const { setupRealtime } = require('./utils/realtime');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const noticeRoutes = require('./routes/notices');
const eventRoutes = require('./routes/events');
const venueRoutes = require('./routes/venues');
const auctionRoutes = require('./routes/auctions');
const renewalRoutes = require('./routes/renewals');
const communityRoutes = require('./routes/community');
const securityRoutes = require('./routes/security');
const analyticsRoutes = require('./routes/analytics');
const broadcastRoutes = require('./routes/broadcasts');
const guestRoutes = require('./routes/guests');
const auditRoutes = require('./routes/audit');
const paymentRoutes = require('./routes/payments');
const memberUpdateRoutes = require('./routes/memberUpdates');
const demoPaymentRoutes = require('./routes/demoPayment');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error('Not allowed by CORS'));
    },
};
app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/renewals', renewalRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/member', memberUpdateRoutes);
app.use('/api/demo-payment', demoPaymentRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'Dhaka Club API is running' });
});

const startServer = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected successfully.');

        const server = http.createServer(app);
        setupRealtime(server, corsOptions);

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}.`);
        });
    } catch (error) {
        console.error('Unable to connect to the database:', error.message);
        process.exit(1);
    }
};

startServer();
