package iot.iot.security.user;

import iot.iot.repository.UserRepository;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomUserDetailsService implements UserDetailsService {
    private final UserRepository users;
    public CustomUserDetailsService(UserRepository users) { this.users = users; }

    @Override
    @Transactional(readOnly = true)
    public CustomUserDetails loadUserByUsername(String username) {
        return users.findByUsername(username).map(CustomUserDetails::new)
            .orElseThrow(() -> new UsernameNotFoundException("Invalid username or password"));
    }
}
