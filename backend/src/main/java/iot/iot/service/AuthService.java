package iot.iot.service;

import iot.iot.dto.request.LoginRequest;
import iot.iot.dto.response.LoginResponse;
import iot.iot.dto.response.UserResponse;
import iot.iot.security.jwt.JwtService;
import iot.iot.security.user.CustomUserDetails;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final AuthenticationManager manager;
    private final JwtService jwt;
    public AuthService(AuthenticationManager manager, JwtService jwt) { this.manager = manager; this.jwt = jwt; }

    public LoginResponse login(LoginRequest request) {
        var authentication = manager.authenticate(
            UsernamePasswordAuthenticationToken.unauthenticated(request.username(), request.password()));
        var user = (CustomUserDetails) authentication.getPrincipal();
        return new LoginResponse(jwt.generateToken(user), "Bearer", jwt.getExpiresInSeconds(), UserResponse.from(user));
    }
}
