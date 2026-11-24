-- Application-owned tables; existing Node-RED tables and wire contracts stay unchanged.
CREATE TABLE classroom_settings (
    id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sensor_device_id VARCHAR(50) NOT NULL,
    temperature_limit DOUBLE NOT NULL,
    minimum_lux DOUBLE NOT NULL,
    sustained_seconds INT NOT NULL,
    offline_seconds INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO classroom_settings VALUES (1, 'Phòng học thực nghiệm', 'node1_sensor', 32, 150, 120, 300);

CREATE TABLE classroom_bookings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    owner_id BIGINT NOT NULL,
    owner_name VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    decision_note VARCHAR(500) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_booking_overlap (status, starts_at, ends_at),
    INDEX idx_booking_owner (owner_id, starts_at),
    CONSTRAINT chk_booking_time CHECK (ends_at > starts_at),
    CONSTRAINT chk_booking_status CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE classroom_alerts (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    kind VARCHAR(30) NOT NULL,
    message VARCHAR(500) NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at DATETIME NULL,
    acknowledged_by VARCHAR(50) NULL,
    ended_at DATETIME NULL,
    INDEX idx_alert_active (kind, ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE classroom_incidents (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    reporter_id BIGINT NOT NULL,
    reporter_name VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    device_id VARCHAR(50) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    resolution VARCHAR(2000) NOT NULL DEFAULT '',
    updated_by VARCHAR(50) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_incident_status CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE classroom_incident_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    incident_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    note VARCHAR(2000) NOT NULL,
    actor VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES classroom_incidents(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE classroom_command_attempts (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    actor_id BIGINT NOT NULL,
    actor_name VARCHAR(50) NOT NULL,
    booking_id BIGINT NULL,
    target VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    log_status VARCHAR(20) NOT NULL DEFAULT 'NOT_RECORDED',
    message VARCHAR(500) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    INDEX idx_attempt_booking (booking_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
