package iot.iot.ai;

import iot.iot.dto.ControlAction;

/** Quy tắc có vùng trễ; null nghĩa là giữ nguyên, không phát lệnh. */
public final class AutomationPolicy {
    private AutomationPolicy() {}
    public static ControlAction decide(double value, double on, double off, boolean fan) {
        if (!Double.isFinite(value)) return null;
        if (fan) return value >= on ? ControlAction.ON : value <= off ? ControlAction.OFF : null;
        return value <= on ? ControlAction.ON : value >= off ? ControlAction.OFF : null;
    }
}
