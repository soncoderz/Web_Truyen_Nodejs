package com.example.backend.service;

import com.sendgrid.Method;
import com.sendgrid.Request;
import com.sendgrid.Response;
import com.sendgrid.SendGrid;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.example.backend.config.AppProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * EmailService - Dịch vụ gửi email sử dụng SendGrid
 */
@Service
public class EmailService {
    private final AppProperties appProperties;

    public EmailService(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    @Value("${sendgrid.api.key}")
    private String sendgridApiKey;

    @Value("${sendgrid.from.email}")
    private String fromEmail;

    @Value("${sendgrid.from.name}")
    private String fromName;

    private SendGrid sendGrid;

    private SendGrid getSendGrid() {
        if (sendGrid == null) {
            sendGrid = new SendGrid(sendgridApiKey);
        }
        return sendGrid;
    }

    /**
     * Gửi email đơn giản
     *
     * @param toEmail Email người nhận
     * @param subject Tiêu đề email
     * @param content Nội dung email (HTML hoặc plain text)
     * @return true nếu gửi thành công, false nếu thất bại
     */
    public boolean sendSimpleEmail(String toEmail, String subject, String content) {
        try {
            JsonObject mail = buildMailJson(toEmail, null, subject, content);

            Request request = new Request();
            request.setMethod(Method.POST);
            request.setEndpoint("mail/send");
            request.setBody(mail.toString());

            Response response = getSendGrid().api(request);

            // Lấy status code để kiểm tra
            int statusCode = response.getStatusCode();
            System.out.println("SendGrid Response Status Code: " + statusCode);
            System.out.println("SendGrid Response Body: " + response.getBody());

            return statusCode >= 200 && statusCode < 300;

        } catch (IOException e) {
            System.err.println("Lỗi khi gửi email: " + e.getMessage());
            e.printStackTrace();
            return false;
        }
    }

    /**
     * Gửi email với HTML template
     *
     * @param toEmail Email người nhận
     * @param toName Tên người nhận
     * @param subject Tiêu đề email
     * @param htmlContent Nội dung HTML
     * @return true nếu gửi thành công, false nếu thất bại
     */
    public boolean sendHtmlEmail(String toEmail, String toName, String subject, String htmlContent) {
        try {
            JsonObject mail = buildMailJson(toEmail, toName, subject, htmlContent);

            Request request = new Request();
            request.setMethod(Method.POST);
            request.setEndpoint("mail/send");
            request.setBody(mail.toString());

            Response response = getSendGrid().api(request);

            int statusCode = response.getStatusCode();
            System.out.println("Email gửi thành công! Status: " + statusCode);

            return statusCode >= 200 && statusCode < 300;

        } catch (IOException e) {
            System.err.println("Lỗi khi gửi email: " + e.getMessage());
            e.printStackTrace();
            return false;
        }
    }

    /**
     * Helper method để xây dựng JSON body cho SendGrid API
     */
    private JsonObject buildMailJson(String toEmail, String toName, String subject, String content) {
        JsonObject mail = new JsonObject();

        // From field
        JsonObject from = new JsonObject();
        from.addProperty("email", fromEmail);
        from.addProperty("name", fromName);
        mail.add("from", from);

        // Subject
        mail.addProperty("subject", subject);

        // Personalization với recipient
        JsonObject personalization = new JsonObject();
        JsonArray toArray = new JsonArray();
        JsonObject toObj = new JsonObject();
        toObj.addProperty("email", toEmail);
        if (toName != null && !toName.isEmpty()) {
            toObj.addProperty("name", toName);
        }
        toArray.add(toObj);
        personalization.add("to", toArray);
        
        JsonArray personalizations = new JsonArray();
        personalizations.add(personalization);
        mail.add("personalizations", personalizations);

        // Content
        JsonArray contentArray = new JsonArray();
        JsonObject contentObj = new JsonObject();
        contentObj.addProperty("type", "text/html");
        contentObj.addProperty("value", content);
        contentArray.add(contentObj);
        mail.add("content", contentArray);

        return mail;
    }

    /**
     * Gửi email xác minh (verification email)
     *
     * @param toEmail Email người dùng
     * @param verificationLink Link xác minh
     * @return true nếu gửi thành công
     */
    public boolean sendVerificationEmail(String toEmail, String verificationLink) {
        String htmlContent = "<html><body>" +
                "<h2>Xác minh Email của Bạn</h2>" +
                "<p>Cảm ơn bạn đã đăng ký!</p>" +
                "<p>Vui lòng nhấp vào liên kết dưới đây để xác minh email của bạn:</p>" +
                "<a href=\"" + verificationLink + "\">Xác minh Email</a>" +
                "<p>Hoặc sao chép và dán URL này vào trình duyệt của bạn:</p>" +
                "<p>" + verificationLink + "</p>" +
                "<p>Này, hãy yên tâm - chúng tôi không bao giờ sẽ yêu cầu bạn xác minh lại email của mình.</p>" +
                "</body></html>";

        return sendSimpleEmail(toEmail, "Xác minh Email - Web Tuyển Online", htmlContent);
    }

    /**
     * Gửi email thông báo (notification email)
     *
     * @param toEmail Email người dùng
     * @param title Tiêu đề thông báo
     * @param message Nội dung thông báo
     * @return true nếu gửi thành công
     */
    public boolean sendNotificationEmail(String toEmail, String title, String message) {
        String htmlContent = "<html><body>" +
                "<h2>" + title + "</h2>" +
                "<p>" + message + "</p>" +
                "<p>---</p>" +
                "<p>Web Tuyển Online</p>" +
                "</body></html>";

        return sendSimpleEmail(toEmail, title, htmlContent);
    }

    /**
     * Gửi email đặt lại mật khẩu (reset password email)
     *
     * @param toEmail Email người dùng
     * @param resetToken Token đặt lại mật khẩu
     * @return true nếu gửi thành công
     */
    public boolean sendResetPasswordEmail(String toEmail, String resetToken) {
        String resetLink = buildFrontendUrl("/reset-password?token=" + resetToken);

        String htmlContent = "<html><body>" +
                "<h2>Yêu cầu Đặt lại Mật khẩu</h2>" +
                "<p>Bạn nhận được email này vì đã yêu cầu đặt lại mật khẩu cho tài khoản của mình.</p>" +
                "<p>Vui lòng sử dụng mã token hoặc nhấp vào liên kết dưới đây để đặt lại mật khẩu (Mã có hiệu lực trong 1 giờ):</p>" +
                "<h3>" + resetToken + "</h3>" +
                "<a href=\"" + resetLink + "\">Đặt lại Mật khẩu</a>" +
                "<p>Nếu bạn không yêu cầu điều này, vui lòng bỏ qua email này và mật khẩu của bạn sẽ không thay đổi.</p>" +
                "</body></html>";

        return sendSimpleEmail(toEmail, "Đặt lại Mật khẩu - Web Tuyển Online", htmlContent);
    }

    private String buildFrontendUrl(String path) {
        String frontendUrl = appProperties.getFrontendUrl();
        String normalizedFrontendUrl = frontendUrl.endsWith("/")
                ? frontendUrl.substring(0, frontendUrl.length() - 1)
                : frontendUrl;
        return normalizedFrontendUrl + path;
    }
}
