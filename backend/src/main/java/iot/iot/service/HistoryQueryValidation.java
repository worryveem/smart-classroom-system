package iot.iot.service;

import iot.iot.exception.InvalidHistoryQueryException;
import java.time.LocalDateTime;
import org.springframework.data.domain.Sort;

final class HistoryQueryValidation {
    static final Sort NEWEST_FIRST = Sort.by(Sort.Direction.DESC, "timestamp", "id");
    private HistoryQueryValidation() {}

    static void range(LocalDateTime from, LocalDateTime to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new InvalidHistoryQueryException("from must be less than or equal to to");
        }
    }

    static void text(String value, String name) {
        if (value != null && (value.isBlank() || value.length() > 50)) {
            throw new InvalidHistoryQueryException(name + " must contain 1 to 50 characters");
        }
    }

    static void bounded(int value, int min, int max, String name) {
        if (value < min || value > max) {
            throw new InvalidHistoryQueryException(name + " must be between " + min + " and " + max);
        }
    }
}
