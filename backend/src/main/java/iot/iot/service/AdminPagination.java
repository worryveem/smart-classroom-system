package iot.iot.service;

import iot.iot.exception.AdminOperationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

final class AdminPagination {
    private AdminPagination() {}
    static PageRequest of(int page, int size, String key) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
            throw new AdminOperationException(BAD_REQUEST, "Invalid pagination: page >= 0, size 1 to 100, offset <= 2147483647");
        }
        return PageRequest.of(page, size, Sort.by(key));
    }
}
