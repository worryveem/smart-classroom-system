package iot.iot.repository;

import java.time.LocalDateTime;
import java.util.ArrayList;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;

public final class HistorySpecifications {
    private HistorySpecifications() {}

    public static <T> Specification<T> filter(String deviceId, LocalDateTime from, LocalDateTime to) {
        return (root, query, cb) -> {
            var predicates = new ArrayList<Predicate>();
            if (deviceId != null) predicates.add(cb.equal(root.get("device").get("deviceId"), deviceId));
            if (from != null) predicates.add(cb.greaterThanOrEqualTo(root.<LocalDateTime>get("timestamp"), from));
            if (to != null) predicates.add(cb.lessThanOrEqualTo(root.<LocalDateTime>get("timestamp"), to));
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    public static <T> Specification<T> equal(String field, String value) {
        return (root, query, cb) -> value == null ? cb.conjunction() : cb.equal(root.get(field), value);
    }
}
