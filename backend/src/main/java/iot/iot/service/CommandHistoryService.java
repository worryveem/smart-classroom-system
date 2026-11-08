package iot.iot.service;

import iot.iot.dto.ControlTarget;
import iot.iot.dto.response.CommandHistoryResponse;
import iot.iot.dto.response.HistoryPageResponse;
import iot.iot.entity.CommandLog;
import iot.iot.exception.InvalidHistoryQueryException;
import iot.iot.repository.CommandLogRepository;
import iot.iot.repository.HistorySpecifications;
import java.time.LocalDateTime;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CommandHistoryService {
    private final CommandLogRepository repository;
    public CommandHistoryService(CommandLogRepository repository) { this.repository = repository; }

    public HistoryPageResponse<CommandHistoryResponse> history(int page, int size, String deviceId,
            ControlTarget target, String triggerBy, LocalDateTime from, LocalDateTime to) {
        HistoryQueryValidation.range(from, to);
        HistoryQueryValidation.text(deviceId, "deviceId");
        HistoryQueryValidation.text(triggerBy, "triggerBy");
        HistoryQueryValidation.bounded(page, 0, Integer.MAX_VALUE, "page");
        HistoryQueryValidation.bounded(size, 1, 100, "size");
        if ((long) page * size > Integer.MAX_VALUE) {
            throw new InvalidHistoryQueryException("Pagination offset is too large");
        }
        var filter = HistorySpecifications.<CommandLog>filter(deviceId, from, to)
            .and(HistorySpecifications.equal("target", target == null ? null : target.name()))
            .and(HistorySpecifications.equal("triggerBy", triggerBy));
        var rows = repository.findAll(filter, PageRequest.of(page, size, HistoryQueryValidation.NEWEST_FIRST));
        return HistoryPageResponse.from(rows.map(CommandHistoryResponse::from));
    }
}
