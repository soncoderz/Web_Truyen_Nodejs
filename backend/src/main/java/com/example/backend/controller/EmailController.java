package com.example.backend.controller;

import com.example.backend.service.EmailService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * EmailController - API cho việc gửi email
 * Endpoints:
 * - POST /api/email/send-simple
 * - POST /api/email/send-html
 * - POST /api/email/send-verification
 * - POST /api/email/send-notification
 */
@RestController
@RequestMapping("/api/email")
public class EmailController {

    @Autowired
    private EmailService emailService;

    /**
     * Gửi email đơn giản
     * POST /api/email/send-simple
     */
    @PostMapping("/send-simple")
    public ResponseEntity<?> sendSimpleEmail(
            @RequestParam String toEmail,
            @RequestParam String subject,
            @RequestParam String content) {

        Map<String, Object> response = new HashMap<>();

        try {
            boolean result = emailService.sendSimpleEmail(toEmail, subject, content);

            if (result) {
                response.put("success", true);
                response.put("message", "Email đã được gửi thành công!");
                return ResponseEntity.ok(response);
            } else {
                response.put("success", false);
                response.put("message", "Không thể gửi email. Vui lòng kiểm tra API key.");
                return ResponseEntity.badRequest().body(response);
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Lỗi: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    /**
     * Gửi email HTML
     * POST /api/email/send-html
     */
    @PostMapping("/send-html")
    public ResponseEntity<?> sendHtmlEmail(
            @RequestParam String toEmail,
            @RequestParam String toName,
            @RequestParam String subject,
            @RequestParam String htmlContent) {

        Map<String, Object> response = new HashMap<>();

        try {
            boolean result = emailService.sendHtmlEmail(toEmail, toName, subject, htmlContent);

            if (result) {
                response.put("success", true);
                response.put("message", "Email HTML đã được gửi thành công!");
                return ResponseEntity.ok(response);
            } else {
                response.put("success", false);
                response.put("message", "Không thể gửi email. Vui lòng kiểm tra API key.");
                return ResponseEntity.badRequest().body(response);
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Lỗi: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    /**
     * Gửi email xác minh
     * POST /api/email/send-verification
     */
    @PostMapping("/send-verification")
    public ResponseEntity<?> sendVerificationEmail(
            @RequestParam String toEmail,
            @RequestParam String verificationLink) {

        Map<String, Object> response = new HashMap<>();

        try {
            boolean result = emailService.sendVerificationEmail(toEmail, verificationLink);

            if (result) {
                response.put("success", true);
                response.put("message", "Email xác minh đã được gửi thành công!");
                return ResponseEntity.ok(response);
            } else {
                response.put("success", false);
                response.put("message", "Không thể gửi email xác minh.");
                return ResponseEntity.badRequest().body(response);
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Lỗi: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    /**
     * Gửi email thông báo
     * POST /api/email/send-notification
     */
    @PostMapping("/send-notification")
    public ResponseEntity<?> sendNotificationEmail(
            @RequestParam String toEmail,
            @RequestParam String title,
            @RequestParam String message) {

        Map<String, Object> response = new HashMap<>();

        try {
            boolean result = emailService.sendNotificationEmail(toEmail, title, message);

            if (result) {
                response.put("success", true);
                response.put("message", "Email thông báo đã được gửi thành công!");
                return ResponseEntity.ok(response);
            } else {
                response.put("success", false);
                response.put("message", "Không thể gửi email thông báo.");
                return ResponseEntity.badRequest().body(response);
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "Lỗi: " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    /**
     * Health check endpoint
     * GET /api/email/health
     */
    @GetMapping("/health")
    public ResponseEntity<?> health() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "ok");
        response.put("message", "Email service is running");
        return ResponseEntity.ok(response);
    }
}
