package iot.iot.dto.response;

import java.util.List;
import org.springframework.data.domain.Page;

public record HistoryPageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {
    public static <T> HistoryPageResponse<T> from(Page<T> result) {
        return new HistoryPageResponse<>(result.getContent(), result.getNumber(), result.getSize(),
            result.getTotalElements(), result.getTotalPages());
    }
}
