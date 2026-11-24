CREATE TABLE ai_suggestion_history (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    room_id INT NOT NULL,
    result_json JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_history_room FOREIGN KEY (room_id) REFERENCES classroom_rooms(id),
    INDEX idx_ai_history_user_room (user_id, room_id, id)
);
