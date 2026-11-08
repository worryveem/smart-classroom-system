package iot.iot.repository;

import iot.iot.entity.Device;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

@Repository
public class DeviceInsertRepository {
    @PersistenceContext private EntityManager entityManager;

    public void insert(Device device) {
        // Assigned identifiers require persist rather than merge to preserve insert-only semantics.
        entityManager.persist(device);
        entityManager.flush();
    }
}
