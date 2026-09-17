package in.pms.auth;

import in.pms.config.PmsProperties;
import jakarta.servlet.DispatcherType;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Stateless API security: our own cookie-backed sessions (see {@link SessionAuthFilter}), method-level role
 * checks, JSON 401/403, and no server-side HTTP session. Only login, health and signed file links are public.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    /**
     * The desk app runs on its own origin and sends the session cookie, so the browser demands an explicit
     * allow-list: a credentialed request may not use a wildcard origin. Only the methods and headers the app
     * actually uses are permitted, and {@code X-Requested-With} is among them because the CSRF check in
     * {@link SessionAuthFilter} depends on a header a cross-site form cannot set without this preflight.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(PmsProperties props) {
        var config = new CorsConfiguration();
        config.setAllowedOrigins(props.allowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "X-Requested-With"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    // Spring MVC contributes a CorsConfigurationSource of its own, so the one above is asked for by name.
    @Bean
    SecurityFilterChain api(HttpSecurity http, SessionService sessions,
                            @Qualifier("corsConfigurationSource") CorsConfigurationSource cors) throws Exception {
        return http
                .cors(c -> c.configurationSource(cors))
                .csrf(csrf -> csrf.disable()) // replaced by the X-Requested-With check in SessionAuthFilter
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .formLogin(f -> f.disable()).httpBasic(b -> b.disable()).logout(l -> l.disable())
                .headers(h -> h.frameOptions(f -> f.deny()))
                .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .authorizeHttpRequests(a -> a
                        // A 403 makes the container forward to /error. That forward re-enters this chain with
                        // no authentication, and without this line anyRequest().denyAll() would answer 401,
                        // overwriting the 403. The app reads 401 as "your session ended", so a staff member
                        // tapping something they may not do would be signed out instead of simply refused.
                        .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.ASYNC, DispatcherType.FORWARD).permitAll()
                        .requestMatchers("/api/auth/otp/**", "/api/auth/login", "/api/health", "/api/files/**", "/actuator/health/**").permitAll()
                        .requestMatchers("/api/admin/**").hasRole("SUPER_ADMIN")
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().denyAll())
                .addFilterBefore(new SessionAuthFilter(sessions), AnonymousAuthenticationFilter.class)
                .build();
    }
}
