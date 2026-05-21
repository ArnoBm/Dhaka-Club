USE dhaka_club;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS notification_deliveries;
DROP TABLE IF EXISTS notification_broadcasts;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS entry_logs;
DROP TABLE IF EXISTS guest_requests;
DROP TABLE IF EXISTS card_renewals;
DROP TABLE IF EXISTS community_requests;
DROP TABLE IF EXISTS bids;
DROP TABLE IF EXISTS auction_items;
DROP TABLE IF EXISTS venue_bookings;
DROP TABLE IF EXISTS venues;
DROP TABLE IF EXISTS event_registration_items;
DROP TABLE IF EXISTS event_ticket_variants;
DROP TABLE IF EXISTS event_registrations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS notices;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS members;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE members (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    member_id VARCHAR(50) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    secondary_number VARCHAR(30) NULL,
    blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NULL,
    date_of_birth DATE NULL,
    occupation VARCHAR(150) NULL,
    address VARCHAR(255) NULL,
    profile_photo VARCHAR(255) NULL,
    password VARCHAR(255) NULL,
    expo_push_token VARCHAR(255) NULL,
    member_type ENUM('Life Member', 'General Member', 'Honorary Member', 'Special Member', 'Officers of Defense Forces') NOT NULL DEFAULT 'General Member',
    membership_group VARCHAR(100) NULL,
    membership_expiry DATE NULL,
    status ENUM('Active', 'Inactive', 'Suspended') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_members_member_id (member_id),
    UNIQUE KEY uq_members_email (email),
    KEY idx_members_status (status),
    KEY idx_members_membership_group (membership_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admins (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('Super Admin', 'Admin', 'Staff') NOT NULL DEFAULT 'Admin',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    target_group VARCHAR(100) NULL,
    attachment_url VARCHAR(255) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notices_created_by (created_by),
    KEY idx_notices_target_group (target_group),
    CONSTRAINT fk_notices_created_by
        FOREIGN KEY (created_by) REFERENCES admins (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    event_date DATETIME NOT NULL,
    venue VARCHAR(150) NOT NULL,
    ticket_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_seats INT UNSIGNED NOT NULL,
    available_seats INT UNSIGNED NOT NULL,
    requires_ticket BOOLEAN NOT NULL DEFAULT FALSE,
    cover_image VARCHAR(255) NULL,
    status ENUM('Upcoming', 'Ongoing', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Upcoming',
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_events_created_by (created_by),
    KEY idx_events_event_date (event_date),
    KEY idx_events_status (status),
    CONSTRAINT fk_events_created_by
        FOREIGN KEY (created_by) REFERENCES admins (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT chk_events_seats CHECK (available_seats <= total_seats)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_registrations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,
    ticket_count INT UNSIGNED NOT NULL DEFAULT 1,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    payment_status ENUM('Pending', 'Paid', 'Free') NOT NULL DEFAULT 'Pending',
    payment_verified_at DATETIME NULL,
    rsvp_status ENUM('Attending', 'Not Attending', 'Maybe') NOT NULL DEFAULT 'Attending',
    entry_code VARCHAR(120) NULL,
    entry_status ENUM('Valid', 'Used', 'Cancelled') NOT NULL DEFAULT 'Valid',
    entry_used_at DATETIME NULL,
    registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_registrations_event_member (event_id, member_id),
    UNIQUE KEY uq_event_registrations_entry_code (entry_code),
    KEY idx_event_registrations_member_id (member_id),
    CONSTRAINT fk_event_registrations_event_id
        FOREIGN KEY (event_id) REFERENCES events (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_event_registrations_member_id
        FOREIGN KEY (member_id) REFERENCES members (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_ticket_variants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(255) NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    seat_count INT UNSIGNED NOT NULL DEFAULT 1,
    max_quantity_per_order INT UNSIGNED NULL,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_event_ticket_variants_event_id (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_registration_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    registration_id BIGINT UNSIGNED NOT NULL,
    ticket_variant_id BIGINT UNSIGNED NULL,
    ticket_name_snapshot VARCHAR(150) NOT NULL,
    unit_price_snapshot DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    seat_count_snapshot INT UNSIGNED NOT NULL DEFAULT 1,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    line_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_event_registration_items_registration_id (registration_id),
    KEY idx_event_registration_items_variant_id (ticket_variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE venues (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    capacity INT UNSIGNED NOT NULL,
    per_day_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status ENUM('Available', 'Maintenance') NOT NULL DEFAULT 'Available',
    PRIMARY KEY (id),
    UNIQUE KEY uq_venues_name (name),
    KEY idx_venues_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO venues (name, description, capacity, per_day_charge, status) VALUES
('Royal Bengal Dining', 'Formal dining venue for club members and guests.', 120, 25000.00, 'Available'),
('Royal Bengal Lounge', 'Premium lounge space for social gatherings.', 80, 18000.00, 'Available'),
('Cigar Lounge', 'Private lounge area for small gatherings.', 35, 12000.00, 'Available'),
('Banquet & Dining Spaces', 'Large event and banquet venue.', 250, 50000.00, 'Available'),
('Seminar / Meeting Halls', 'Meeting and seminar rooms for club programs.', 100, 20000.00, 'Available'),
('Outdoor Lawn Areas', 'Open-air lawn space for outdoor events.', 300, 45000.00, 'Available'),
('Executive Lounge-style Seating Areas', 'Executive seating area for formal and informal meetings.', 60, 15000.00, 'Available')
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    capacity = VALUES(capacity),
    per_day_charge = VALUES(per_day_charge);

CREATE TABLE venue_bookings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    venue_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    purpose VARCHAR(200) NOT NULL,
    total_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status ENUM('Pending', 'Confirmed', 'Cancelled') NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_venue_bookings_venue_id (venue_id),
    KEY idx_venue_bookings_member_id (member_id),
    KEY idx_venue_bookings_date (booking_date),
    CONSTRAINT fk_venue_bookings_venue_id
        FOREIGN KEY (venue_id) REFERENCES venues (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_venue_bookings_member_id
        FOREIGN KEY (member_id) REFERENCES members (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT chk_venue_bookings_time CHECK (end_time > start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auction_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    starting_price DECIMAL(10,2) NOT NULL,
    current_bid DECIMAL(10,2) NULL,
    highest_bidder_id BIGINT UNSIGNED NULL,
    item_image VARCHAR(255) NULL,
    auction_start DATETIME NOT NULL,
    auction_end DATETIME NOT NULL,
    status ENUM('Draft', 'Active', 'Sold', 'Unsold') NOT NULL DEFAULT 'Draft',
    created_by BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_auction_items_highest_bidder_id (highest_bidder_id),
    KEY idx_auction_items_created_by (created_by),
    KEY idx_auction_items_status (status),
    CONSTRAINT fk_auction_items_highest_bidder_id
        FOREIGN KEY (highest_bidder_id) REFERENCES members (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT fk_auction_items_created_by
        FOREIGN KEY (created_by) REFERENCES admins (id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT chk_auction_items_dates CHECK (auction_end > auction_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bids (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    auction_item_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,
    bid_amount DECIMAL(10,2) NOT NULL,
    bid_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bids_auction_item_id (auction_item_id),
    KEY idx_bids_member_id (member_id),
    KEY idx_bids_bid_time (bid_time),
    CONSTRAINT fk_bids_auction_item_id
        FOREIGN KEY (auction_item_id) REFERENCES auction_items (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_bids_member_id
        FOREIGN KEY (member_id) REFERENCES members (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    member_id BIGINT UNSIGNED NOT NULL,
    request_type ENUM('Blood', 'Medical Help', 'Fund Collection', 'Other') NOT NULL,
    blood_group_needed ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NULL,
    description TEXT NOT NULL,
    contact_number VARCHAR(30) NOT NULL,
    location VARCHAR(150) NOT NULL,
    status ENUM('Open', 'Fulfilled', 'Closed') NOT NULL DEFAULT 'Open',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_community_requests_member_id (member_id),
    KEY idx_community_requests_status (status),
    KEY idx_community_requests_blood_group_needed (blood_group_needed),
    CONSTRAINT fk_community_requests_member_id
        FOREIGN KEY (member_id) REFERENCES members (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE card_renewals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    member_id BIGINT UNSIGNED NOT NULL,
    renewal_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    payment_status ENUM('Pending', 'Paid') NOT NULL DEFAULT 'Pending',
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    processed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_card_renewals_member_id (member_id),
    KEY idx_card_renewals_processed_by (processed_by),
    KEY idx_card_renewals_payment_status (payment_status),
    CONSTRAINT fk_card_renewals_member_id
        FOREIGN KEY (member_id) REFERENCES members (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT fk_card_renewals_processed_by
        FOREIGN KEY (processed_by) REFERENCES admins (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT chk_card_renewals_dates CHECK (expiry_date >= renewal_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    member_id BIGINT UNSIGNED NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    type ENUM('Notice', 'Event', 'Auction', 'Booking', 'Community', 'Renewal', 'General') NOT NULL,
    category ENUM('Notices', 'Events', 'Bookings', 'Membership', 'Community', 'Emergency', 'General') NULL,
    priority ENUM('Normal', 'Important', 'Critical') NOT NULL DEFAULT 'Normal',
    related_type ENUM('Notice', 'Event', 'Booking', 'Membership', 'Community', 'Venue', 'Renewal', 'General') NULL,
    related_id BIGINT UNSIGNED NULL,
    attachment_url VARCHAR(255) NULL,
    sender_admin_id BIGINT UNSIGNED NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notifications_member_id (member_id),
    KEY idx_notifications_type (type),
    KEY idx_notifications_is_read (is_read),
    CONSTRAINT fk_notifications_member_id
        FOREIGN KEY (member_id) REFERENCES members (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_reads (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    notification_id BIGINT UNSIGNED NOT NULL,
    member_id BIGINT UNSIGNED NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at DATETIME NULL,
    is_saved BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_notification_reads_member_notification (member_id, notification_id),
    KEY idx_notification_reads_member_read (member_id, is_read),
    KEY idx_notification_reads_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_targets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    notification_id BIGINT UNSIGNED NOT NULL,
    target_type ENUM('All Members', 'Membership Group', 'Specific Member') NOT NULL DEFAULT 'All Members',
    target_value VARCHAR(150) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notification_targets_notification (notification_id),
    KEY idx_notification_targets_target (target_type, target_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE guest_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    guest_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NULL,
    member_id BIGINT UNSIGNED NULL,
    visit_purpose VARCHAR(255) NOT NULL,
    vehicle_number VARCHAR(80) NULL,
    visit_date DATE NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
    qr_code VARCHAR(255) NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_guest_requests_qr_code (qr_code),
    KEY idx_guest_requests_status (status),
    KEY idx_guest_requests_visit_date (visit_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE entry_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    qr_type ENUM('Member', 'Guest', 'Event') NOT NULL DEFAULT 'Member',
    member_id BIGINT UNSIGNED NULL,
    guest_request_id BIGINT UNSIGNED NULL,
    scanned_code VARCHAR(255) NOT NULL,
    name VARCHAR(150) NULL,
    membership_group VARCHAR(100) NULL,
    guest_count INT UNSIGNED NOT NULL DEFAULT 1,
    status VARCHAR(50) NULL,
    entry_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    block_reason VARCHAR(255) NULL,
    vehicle_number VARCHAR(80) NULL,
    visit_purpose VARCHAR(255) NULL,
    scanned_by BIGINT UNSIGNED NULL,
    scanned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_entry_logs_scanned_at (scanned_at),
    KEY idx_entry_logs_qr_type (qr_type),
    KEY idx_entry_logs_allowed (entry_allowed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_broadcasts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(180) NOT NULL,
    body TEXT NOT NULL,
    type ENUM('Push Notification', 'Notice Alert', 'Event Reminder', 'Renewal Reminder') NOT NULL,
    channel ENUM('Push', 'Notice', 'Event', 'Renewal') NOT NULL DEFAULT 'Push',
    target_type ENUM('All Members', 'Membership Group', 'Specific Member') NOT NULL,
    target_value VARCHAR(150) NULL,
    attachment_url VARCHAR(255) NULL,
    recipient_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notification_broadcasts_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_deliveries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    broadcast_id BIGINT UNSIGNED NOT NULL,
    notification_id BIGINT UNSIGNED NULL,
    member_id BIGINT UNSIGNED NOT NULL,
    status ENUM('Sent', 'Delivered', 'Read') NOT NULL DEFAULT 'Sent',
    delivered_at DATETIME NULL,
    read_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notification_deliveries_broadcast (broadcast_id),
    KEY idx_notification_deliveries_notification (notification_id),
    KEY idx_notification_deliveries_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    module ENUM('Members', 'Events', 'Notices', 'Bookings', 'Renewals', 'Auctions', 'Community', 'Payments', 'Security') NOT NULL,
    action VARCHAR(120) NOT NULL,
    entity_id BIGINT UNSIGNED NULL,
    description TEXT NULL,
    admin_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_logs_module (module),
    KEY idx_audit_logs_admin (admin_id),
    KEY idx_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
