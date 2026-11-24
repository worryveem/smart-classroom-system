package iot.iot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.seed")
public class SeedProperties {
    private boolean enabled;
    private String adminPassword;
    private String teacherPassword;
    private String studentPassword;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getAdminPassword() { return adminPassword; }
    public void setAdminPassword(String value) { adminPassword = value; }
    public String getTeacherPassword() { return teacherPassword; }
    public void setTeacherPassword(String value) { teacherPassword = value; }
    public String getStudentPassword() { return studentPassword; }
    public void setStudentPassword(String value) { studentPassword = value; }
}
