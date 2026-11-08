package iot.iot.repository;

import iot.iot.entity.Telemetry;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;

public interface TelemetryRepository extends JpaRepository<Telemetry, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<Telemetry> {
    List<Telemetry> findByDevice_DeviceIdOrderByTimestampDescIdDesc(String deviceId);
    List<Telemetry> findByTimestampBetweenOrderByTimestampDescIdDesc(LocalDateTime from, LocalDateTime to);
    List<Telemetry> findByDevice_DeviceIdAndTimestampBetweenOrderByTimestampDescIdDesc(String deviceId, LocalDateTime from, LocalDateTime to);
    Optional<Telemetry> findFirstByDevice_DeviceIdOrderByTimestampDescIdDesc(String deviceId);
    Optional<Telemetry> findFirstByOrderByTimestampDescIdDesc();
}
