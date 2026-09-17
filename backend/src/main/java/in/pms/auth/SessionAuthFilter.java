package in.pms.auth;

import in.pms.tenant.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Turns the session cookie into a {@link CurrentUser} and sets the tenant for the request.
 *
 * <p>Two things happen here and nowhere else: the tenant is taken from the session (never from the request),
 * and it is cleared in a {@code finally} so a pooled thread never carries it into the next request.
 * Mutating requests must also carry {@code X-Requested-With: pms}; a cross-site form cannot add that header
 * without a CORS preflight, which is refused, so this is the CSRF defence for cookie auth.
 */
public class SessionAuthFilter extends OncePerRequestFilter {
    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");
    private final SessionService sessions;

    public SessionAuthFilter(SessionService sessions) { this.sessions = sessions; }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String token = cookie(req, sessions.cookieName());
        var user = sessions.resolve(token);
        if (user.isEmpty()) { chain.doFilter(req, res); return; }

        if (!SAFE.contains(req.getMethod()) && !"pms".equals(req.getHeader("X-Requested-With"))) {
            res.sendError(HttpServletResponse.SC_FORBIDDEN, "Missing X-Requested-With header");
            return;
        }

        CurrentUser u = user.get();
        var auth = new UsernamePasswordAuthenticationToken(u, null, authorities(u));
        SecurityContextHolder.getContext().setAuthentication(auth);
        try {
            if (u.propertyId() != null) TenantContext.runAs(u.propertyId(), () -> { doChain(chain, req, res); });
            else doChain(chain, req, res);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private static void doChain(FilterChain chain, HttpServletRequest req, HttpServletResponse res) {
        try { chain.doFilter(req, res); } catch (IOException | ServletException e) { throw new RuntimeException(e); }
    }

    /** Roles are cumulative: an owner also holds MANAGER and STAFF, so {@code hasRole('STAFF')} means "any member". */
    static List<GrantedAuthority> authorities(CurrentUser u) {
        List<GrantedAuthority> out = new ArrayList<>();
        out.add(new SimpleGrantedAuthority("ROLE_USER"));
        if (u.superAdmin()) out.add(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN"));
        if (u.role() != null) for (CurrentUser.Role r : CurrentUser.Role.values()) if (u.role().atLeast(r)) out.add(new SimpleGrantedAuthority("ROLE_" + r.name()));
        return out;
    }

    private static String cookie(HttpServletRequest req, String name) {
        Cookie[] cs = req.getCookies();
        if (cs == null) return null;
        for (Cookie c : cs) if (name.equals(c.getName())) return c.getValue();
        return null;
    }
}
