package iot.iot;

import iot.iot.entity.DeviceStatus;
import iot.iot.entity.DeviceStatusConverter;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DeviceStatusConverterTests {
    @Test
    void preservesSharedNodeRedStatusValues() {
        var converter = new DeviceStatusConverter();
        String[] sql = {"Active", "Offline", "Suspended"};
        DeviceStatus[] java = {DeviceStatus.ACTIVE, DeviceStatus.OFFLINE, DeviceStatus.SUSPENDED};
        for (int i = 0; i < sql.length; i++) {
            assertEquals(sql[i], converter.convertToDatabaseColumn(java[i]));
            assertEquals(java[i], converter.convertToEntityAttribute(sql[i]));
        }
        assertNull(converter.convertToDatabaseColumn(null));
        assertNull(converter.convertToEntityAttribute(null));
        assertThrows(IllegalArgumentException.class, () -> converter.convertToEntityAttribute("ACTIVE"));
    }
}
