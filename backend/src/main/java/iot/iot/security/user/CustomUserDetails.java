package iot.iot.security.user;

import com.fasterxml.jackson.annotation.JsonIgnore;
import iot.iot.entity.User;
import iot.iot.entity.UserRole;
import java.util.Collection;
import java.util.List;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

public final class CustomUserDetails implements UserDetails, CredentialsContainer {
    private final Long id;
    private final String username;
    private final UserRole role;
    private final long credentialsVersion;
    private String passwordHash;

    public CustomUserDetails(User user) {
        this.id = user.getId();
        this.username = user.getUsername();
        this.role = user.getRole();
        this.credentialsVersion = user.getCredentialsVersion();
        this.passwordHash = user.getPasswordHash();
    }
    public Long getId() { return id; }
    public UserRole getRole() { return role; }
    @JsonIgnore public long getCredentialsVersion() { return credentialsVersion; }
    @Override public String getUsername() { return username; }
    @JsonIgnore
    @Override public String getPassword() { return passwordHash; }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }
    @Override public void eraseCredentials() { passwordHash = null; }
}
