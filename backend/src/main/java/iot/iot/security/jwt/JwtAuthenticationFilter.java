package iot.iot.security.jwt;

import io.jsonwebtoken.JwtException;
import iot.iot.security.SecurityResponseWriter;
import iot.iot.security.user.CustomUserDetails;
import iot.iot.security.user.CustomUserDetailsService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.dao.DataAccessException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwt;
    private final CustomUserDetailsService users;
    private final SecurityResponseWriter writer;
    public JwtAuthenticationFilter(JwtService jwt, CustomUserDetailsService users, SecurityResponseWriter writer) {
        this.jwt = jwt; this.users = users; this.writer = writer;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return "OPTIONS".equals(request.getMethod())
            || ("POST".equals(request.getMethod()) && "/api/auth/login".equals(request.getServletPath()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null) { chain.doFilter(request, response); return; }
        if (!header.regionMatches(true, 0, "Bearer ", 0, 7) || header.length() <= 7 || header.length() > 8192) {
            writer.write(response, 401, "Unauthorized"); return;
        }
        try {
            if (SecurityContextHolder.getContext().getAuthentication() == null) {
                var claims = jwt.validateAndGetClaims(header.substring(7));
                String username = claims.getSubject();
                // Always reload authorities from MySQL; the JWT role claim is informational.
                CustomUserDetails user = users.loadUserByUsername(username);
                if (!user.getId().equals(claims.get("userId", Long.class))) throw new JwtException("Invalid identity");
                Long credentialsVersion=claims.get("credentialsVersion",Long.class);
                if(user.getCredentialsVersion()!=(credentialsVersion==null?0L:credentialsVersion)) throw new JwtException("Credentials have changed");
                user.eraseCredentials();
                var authentication = UsernamePasswordAuthenticationToken.authenticated(user, null, user.getAuthorities());
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                var context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(authentication);
                SecurityContextHolder.setContext(context);
            }
        } catch (JwtException | IllegalArgumentException | AuthenticationException error) {
            SecurityContextHolder.clearContext();
            writer.write(response, 401, "Unauthorized"); return;
        } catch (DataAccessException error) {
            SecurityContextHolder.clearContext();
            writer.write(response, 500, "Internal server error"); return;
        }
        chain.doFilter(request, response);
    }
}
