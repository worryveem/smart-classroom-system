package iot.iot.classroom;

import jakarta.validation.constraints.*;
import java.time.LocalDateTime;

public final class ClassroomDtos {
    private ClassroomDtos() {}
    public record BookingInput(@NotBlank @Size(max=150) String title,
        @NotNull LocalDateTime startsAt, @NotNull LocalDateTime endsAt,
        @Min(100) @Max(9999) Integer roomId, @Min(1) @Max(1000) Integer expectedAttendees) {}
    public enum Decision { APPROVED, REJECTED, CANCELLED }
    public record BookingDecision(@NotNull Decision status, @NotNull @Size(max=500) String note) {}
    public record Settings(@NotBlank @Size(max=100) String name,
        @NotBlank @Size(max=50) String sensorDeviceId,
        @NotNull @DecimalMin("0") @DecimalMax("60") Double temperatureLimit,
        @NotNull @DecimalMin("0") @DecimalMax("100000") Double minimumLux,
        @Min(30) @Max(3600) int sustainedSeconds,
        @Min(60) @Max(86400) int offlineSeconds) {}
    public record IncidentInput(@NotBlank @Size(max=150) String title,
        @NotBlank @Size(max=2000) String description, @Size(max=50) String deviceId,
        @Min(100) @Max(9999) Integer roomId) {}
    public enum IncidentStatus { OPEN, IN_PROGRESS, RESOLVED }
    public record IncidentUpdate(@NotNull IncidentStatus status,
        @NotBlank @Size(max=2000) String note) {}
    public enum RoomStatus { ACTIVE, MAINTENANCE, INACTIVE }
    public record RoomInput(@Min(100) @Max(9999) int roomId,
        @NotBlank @Size(max=100) String name, @Min(1) @Max(20) int floor,
        @Min(1) @Max(1000) int capacity, @NotNull @Size(max=500) String equipment,
        @NotNull RoomStatus status, @NotNull @Size(max=500) String note) {}
}
