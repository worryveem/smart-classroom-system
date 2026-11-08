ALTER TABLE classroom_bookings
    ADD COLUMN expires_at DATETIME NULL,
    ADD INDEX idx_booking_expiration (status,expires_at),
    DROP CHECK chk_booking_status,
    ADD CONSTRAINT chk_booking_status CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED'));

UPDATE classroom_bookings
SET expires_at=LEAST(DATE_ADD(created_at, INTERVAL 24 HOUR), starts_at)
WHERE status='PENDING';

CREATE TABLE classroom_booking_context (
    booking_id BIGINT PRIMARY KEY,
    sensor_device_id VARCHAR(50) NULL,
    temperature_limit DOUBLE NOT NULL,
    minimum_lux DOUBLE NOT NULL,
    captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_booking_context_booking FOREIGN KEY (booking_id) REFERENCES classroom_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
