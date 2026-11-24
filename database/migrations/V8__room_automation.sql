CREATE TABLE room_automation (
    room_id INT NOT NULL PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    enabled_by BIGINT NULL,
    fan_on DOUBLE NOT NULL DEFAULT 30,
    fan_off DOUBLE NOT NULL DEFAULT 28,
    light_on DOUBLE NOT NULL DEFAULT 150,
    light_off DOUBLE NOT NULL DEFAULT 250,
    empty_seconds INT NOT NULL DEFAULT 300,
    fan_action VARCHAR(3) NULL,
    light_action VARCHAR(3) NULL,
    fan_changed_at DATETIME NULL,
    light_changed_at DATETIME NULL,
    in_flight BOOLEAN NOT NULL DEFAULT FALSE,
    message VARCHAR(500) NOT NULL DEFAULT 'Chế độ thủ công',
    checked_at DATETIME NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(id),
    FOREIGN KEY (enabled_by) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (fan_off < fan_on),
    CHECK (light_on < light_off)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO room_automation(room_id) VALUES (101);
