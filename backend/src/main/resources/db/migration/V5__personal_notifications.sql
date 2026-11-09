CREATE TABLE app_notifications (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    recipient_id BIGINT NOT NULL,
    kind VARCHAR(40) NOT NULL,
    title VARCHAR(180) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    target_path VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL,
    read_at DATETIME NULL,
    CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notification_recipient (recipient_id,id),
    INDEX idx_notification_unread (recipient_id,read_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
