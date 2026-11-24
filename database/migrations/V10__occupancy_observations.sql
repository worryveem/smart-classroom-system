CREATE TABLE ai_occupancy_observations (
    history_id BIGINT NOT NULL PRIMARY KEY,
    observer_id BIGINT NOT NULL,
    people_count INT NOT NULL,
    observed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_observation_history FOREIGN KEY (history_id) REFERENCES ai_suggestion_history(id) ON DELETE CASCADE,
    CONSTRAINT fk_observation_user FOREIGN KEY (observer_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_observation_people CHECK (people_count BETWEEN 0 AND 1000)
);
