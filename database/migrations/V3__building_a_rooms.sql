CREATE TABLE classroom_rooms (
    id INT PRIMARY KEY,
    building VARCHAR(30) NOT NULL DEFAULT 'Nhà A',
    floor_number INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    capacity INT NOT NULL DEFAULT 40,
    equipment VARCHAR(500) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    maintenance_note VARCHAR(500) NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_room_status CHECK (status IN ('ACTIVE','MAINTENANCE','INACTIVE')),
    CONSTRAINT chk_room_capacity CHECK (capacity BETWEEN 1 AND 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO classroom_rooms(id,floor_number,name) VALUES
(101,1,'Phòng 101'),(102,1,'Phòng 102'),(103,1,'Phòng 103'),(104,1,'Phòng 104'),(105,1,'Phòng 105'),
(201,2,'Phòng 201'),(202,2,'Phòng 202'),(203,2,'Phòng 203'),(204,2,'Phòng 204'),(205,2,'Phòng 205'),
(301,3,'Phòng 301'),(302,3,'Phòng 302'),(303,3,'Phòng 303'),(304,3,'Phòng 304'),(305,3,'Phòng 305');

-- Existing one-room records belong to the physical room 101; no sensor values are generated.
ALTER TABLE classroom_bookings ADD COLUMN room_id INT NOT NULL DEFAULT 101,
    ADD COLUMN expected_attendees INT NOT NULL DEFAULT 1,
    ADD CONSTRAINT fk_booking_room FOREIGN KEY(room_id) REFERENCES classroom_rooms(id) ON DELETE RESTRICT,
    ADD INDEX idx_booking_room_time(room_id,status,starts_at,ends_at);
ALTER TABLE classroom_incidents ADD COLUMN room_id INT NOT NULL DEFAULT 101,
    ADD CONSTRAINT fk_incident_room FOREIGN KEY(room_id) REFERENCES classroom_rooms(id) ON DELETE RESTRICT;
ALTER TABLE classroom_alerts ADD COLUMN room_id INT NOT NULL DEFAULT 101,
    ADD CONSTRAINT fk_alert_room FOREIGN KEY(room_id) REFERENCES classroom_rooms(id) ON DELETE RESTRICT;
ALTER TABLE classroom_command_attempts ADD COLUMN room_id INT NOT NULL DEFAULT 101,
    ADD CONSTRAINT fk_attempt_room FOREIGN KEY(room_id) REFERENCES classroom_rooms(id) ON DELETE RESTRICT;

CREATE TABLE classroom_room_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    room_id INT NOT NULL,
    actor VARCHAR(50) NOT NULL,
    message VARCHAR(1500) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(room_id) REFERENCES classroom_rooms(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
