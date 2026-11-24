package iot.iot.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "username", length = 50, nullable = false, unique = true)
    private String username;

    @Column(name = "password_hash", length = 255, nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, columnDefinition = "ENUM('ADMIN','TEACHER','STUDENT')")
    private UserRole role;

    @Column(name="full_name",nullable=false,length=100)
    private String fullName="";
    @Column(nullable=false,length=254)
    private String email="";
    @Column(nullable=false,length=30)
    private String phone="";
    @Column(name="credentials_version",nullable=false)
    private long credentialsVersion=0;

    @org.hibernate.annotations.Generated(event = org.hibernate.generator.EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false, columnDefinition = "DATETIME")
    private LocalDateTime createdAt;

    public User() {}

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public UserRole getRole() { return role; }
    public void setRole(UserRole role) { this.role = role; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public String getFullName() { return fullName; }
    public void setFullName(String value) { fullName=value; }
    public String getEmail() { return email; }
    public void setEmail(String value) { email=value; }
    public String getPhone() { return phone; }
    public void setPhone(String value) { phone=value; }
    public long getCredentialsVersion() { return credentialsVersion; }
    public void invalidateCredentials() { credentialsVersion++; }
}
