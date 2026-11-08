-- Shared MySQL contract. Flyway owns DDL; Node-RED writes through plain SQL.
CREATE TABLE users (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ADMIN','TEACHER','STUDENT') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uk_users_username UNIQUE (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE devices (
    device_id VARCHAR(50) NOT NULL,
    room_id INT NOT NULL,
    type ENUM('SENSOR','ACTUATOR') NOT NULL,
    mac_address VARCHAR(50) NULL,
    status ENUM('Active','Offline','Suspended') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE telemetry (
    id BIGINT NOT NULL AUTO_INCREMENT,
    device_id VARCHAR(50) NOT NULL,
    temp DOUBLE NULL,
    humid DOUBLE NULL,
    lux DOUBLE NULL,
    occupancy TINYINT(1) NULL,
    `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_telemetry_device FOREIGN KEY (device_id) REFERENCES devices(device_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_telemetry_device (device_id),
    INDEX idx_telemetry_timestamp (`timestamp`),
    INDEX idx_telemetry_device_timestamp (device_id, `timestamp`),
    CONSTRAINT chk_telemetry_occupancy CHECK (occupancy IS NULL OR occupancy IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE command_logs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    device_id VARCHAR(50) NOT NULL,
    target VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,
    trigger_by VARCHAR(50) NOT NULL,
    `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_command_logs_device FOREIGN KEY (device_id) REFERENCES devices(device_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_command_device (device_id),
    INDEX idx_command_timestamp (`timestamp`),
    INDEX idx_command_target (target),
    INDEX idx_command_trigger_by (trigger_by),
    INDEX idx_command_device_timestamp (device_id, `timestamp`),
    INDEX idx_command_target_timestamp (target, `timestamp`),
    INDEX idx_command_trigger_timestamp (trigger_by, `timestamp`),
    INDEX idx_command_target_trigger_timestamp (target, trigger_by, `timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
