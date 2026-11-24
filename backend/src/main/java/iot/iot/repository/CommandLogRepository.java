package iot.iot.repository;

import iot.iot.entity.CommandLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;

public interface CommandLogRepository extends JpaRepository<CommandLog, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<CommandLog> {
    List<CommandLog> findByDevice_DeviceIdOrderByTimestampDescIdDesc(String deviceId);
    List<CommandLog> findByTargetOrderByTimestampDescIdDesc(String target);
    List<CommandLog> findByTriggerByOrderByTimestampDescIdDesc(String triggerBy);
    List<CommandLog> findByTimestampBetweenOrderByTimestampDescIdDesc(LocalDateTime from, LocalDateTime to);
    List<CommandLog> findByTargetAndTriggerByAndTimestampBetweenOrderByTimestampDescIdDesc(String target, String triggerBy, LocalDateTime from, LocalDateTime to);
}
