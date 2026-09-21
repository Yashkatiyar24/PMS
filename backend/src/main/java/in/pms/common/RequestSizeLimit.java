package in.pms.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * No JSON body is anywhere near a megabyte. Refusing larger ones before they are read keeps an anonymous caller
 * on a public endpoint from making the server buffer whatever it likes; multipart uploads have their own limit.
 */
@Component
public class RequestSizeLimit extends OncePerRequestFilter {
    static final long MAX_BODY_BYTES = 1024 * 1024;

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String type = req.getContentType();
        boolean multipart = type != null && type.toLowerCase().startsWith("multipart/");
        if (!multipart && req.getContentLengthLong() > MAX_BODY_BYTES) {
            res.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write("{\"error\":\"Request too large\"}");
            return;
        }
        chain.doFilter(req, res);
    }
}
