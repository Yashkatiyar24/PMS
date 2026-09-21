package in.pms.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * What an unpaid subscription means for the desk, decided in one place.
 *
 * <p>{@code overdue} only warns; the app shows a banner. {@code readonly} refuses every write to the property,
 * so the desk can still look up a guest or read a bill but cannot check anyone in. {@code closed} refuses the
 * property altogether. Signing in and out, and asking who you are, keep working in every state so the person
 * sees the reason rather than a broken app; and the platform's own back office is never gated, since it is
 * where the state gets fixed.
 */
public class BillingGate extends OncePerRequestFilter {
    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        String path = req.getRequestURI();
        boolean gated = !path.startsWith("/api/auth/") && !path.startsWith("/api/admin/") && !path.startsWith("/api/public/") && !path.startsWith("/api/files/");
        if (gated && auth != null && auth.getPrincipal() instanceof CurrentUser u && u.propertyId() != null) {
            if ("closed".equals(u.billingStatus())) { refuse(res, "This property's account is closed. Contact support."); return; }
            if ("readonly".equals(u.billingStatus()) && !SAFE.contains(req.getMethod())) { refuse(res, "The subscription is unpaid, so this property is read-only. Contact support."); return; }
        }
        chain.doFilter(req, res);
    }

    /** 403 with the same JSON shape as every other refusal; the app shows the message and does not sign anyone out. */
    private static void refuse(HttpServletResponse res, String message) throws IOException {
        res.setStatus(HttpServletResponse.SC_FORBIDDEN);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
