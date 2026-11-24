package iot.iot.repository;

import iot.iot.entity.Device;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface DeviceRepository extends JpaRepository<Device, String>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<Device> {
    Optional<Device> findByDeviceId(String deviceId);
    boolean existsByDeviceId(String deviceId);
}
