package iot.iot.service;

import iot.iot.dto.response.TelemetryResponse;
import iot.iot.repository.HistorySpecifications;
import iot.iot.repository.TelemetryRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TelemetryService {
    private final TelemetryRepository repository;
    public TelemetryService(TelemetryRepository repository) { this.repository = repository; }

    public List<TelemetryResponse> history(String deviceId, LocalDateTime from, LocalDateTime to, int limit) {
        HistoryQueryValidation.range(from, to);
        HistoryQueryValidation.text(deviceId, "deviceId");
        HistoryQueryValidation.bounded(limit, 1, 1000, "limit");
        // Fluent query applies SQL LIMIT without a separate COUNT query.
        return repository.findBy(HistorySpecifications.filter(deviceId, from, to),
            query -> query.sortBy(HistoryQueryValidation.NEWEST_FIRST).limit(limit).all())
            .stream().map(TelemetryResponse::from).toList();
    }
}
