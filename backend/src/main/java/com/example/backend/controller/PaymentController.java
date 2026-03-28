package com.example.backend.controller;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.backend.config.AppProperties;
import com.example.backend.config.MomoProperties;
import com.example.backend.model.EApprovalStatus;
import com.example.backend.model.PaymentTransaction;
import com.example.backend.model.Story;
import com.example.backend.model.User;
import com.example.backend.payload.request.MomoTopUpRequest;
import com.example.backend.payload.response.MessageResponse;
import com.example.backend.repository.PaymentTransactionRepository;
import com.example.backend.repository.StoryRepository;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.services.UserDetailsImpl;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/payments")
public class PaymentController {
    private static final String PROVIDER_MOMO = "MOMO";
    private static final String PROVIDER_WALLET = "WALLET";
    private static final String TYPE_TOP_UP = "TOP_UP";
    private static final String TYPE_UNLOCK_STORY = "UNLOCK_STORY";
    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String STATUS_FAILED = "FAILED";

    @Autowired
    UserRepository userRepository;

    @Autowired
    StoryRepository storyRepository;

    @Autowired
    PaymentTransactionRepository paymentTransactionRepository;

    @Autowired
    AppProperties appProperties;

    @Autowired
    MomoProperties momoProperties;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    @GetMapping("/wallet")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> getWalletSummary() {
        User user = requireCurrentUserEntity();
        List<PaymentTransaction> recentTransactions =
                paymentTransactionRepository.findTop10ByUserIdOrderByCreatedAtDesc(user.getId());

        return ResponseEntity.ok(Map.of(
                "balance", safeWalletBalance(user),
                "purchasedStoryIds", safePurchasedStoryIds(user),
                "transactions", recentTransactions));
    }

    @PostMapping("/stories/{storyId}/unlock")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> unlockLicensedStory(@PathVariable String storyId) {
        UserDetailsImpl currentUser = requireCurrentUser();
        boolean admin = isAdmin(currentUser);

        Optional<Story> storyOpt = storyRepository.findById(storyId);
        if (storyOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        Story story = storyOpt.get();
        if (!canViewStory(story, currentUser, admin)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new MessageResponse("Error: Story not found!"));
        }

        if (!Boolean.TRUE.equals(story.getLicensed()) || normalizeAmount(story.getUnlockPrice()) <= 0L) {
            return ResponseEntity.ok(Map.of(
                    "unlocked", true,
                    "balance", safeWalletBalance(requireCurrentUserEntity())));
        }

        if (admin || isOwner(story, currentUser)) {
            return ResponseEntity.ok(Map.of(
                    "unlocked", true,
                    "balance", safeWalletBalance(requireCurrentUserEntity())));
        }

        User user = requireCurrentUserEntity();
        List<String> purchasedStoryIds = safePurchasedStoryIds(user);
        if (purchasedStoryIds.contains(storyId)) {
            return ResponseEntity.ok(Map.of(
                    "unlocked", true,
                    "balance", safeWalletBalance(user)));
        }

        long unlockPrice = normalizeAmount(story.getUnlockPrice());
        long currentBalance = safeWalletBalance(user);
        if (currentBalance < unlockPrice) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(Map.of(
                    "message", "So du khong du de mua truyen nay.",
                    "balance", currentBalance,
                    "requiredAmount", unlockPrice));
        }

        user.setWalletBalance(currentBalance - unlockPrice);
        purchasedStoryIds.add(storyId);
        user.setPurchasedStoryIds(purchasedStoryIds);
        userRepository.save(user);

        PaymentTransaction transaction = new PaymentTransaction();
        transaction.setUserId(user.getId());
        transaction.setStoryId(storyId);
        transaction.setType(TYPE_UNLOCK_STORY);
        transaction.setProvider(PROVIDER_WALLET);
        transaction.setStatus(STATUS_COMPLETED);
        transaction.setAmount(unlockPrice);
        transaction.setOrderId(buildCompactId("unlock"));
        transaction.setRequestId(buildCompactId("unlock_req"));
        transaction.setMessage("Unlock story successfully.");
        transaction.setCreatedAt(new Date());
        transaction.setUpdatedAt(new Date());
        paymentTransactionRepository.save(transaction);

        return ResponseEntity.ok(Map.of(
                "unlocked", true,
                "balance", safeWalletBalance(user)));
    }

    @PostMapping("/momo/top-up")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> createMomoTopUp(@Valid @RequestBody MomoTopUpRequest request) {
        if (!isMomoReady()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(new MessageResponse("Error: MoMo is not configured."));
        }

        User user = requireCurrentUserEntity();
        long amount = normalizeAmount(request.getAmount());
        if (amount < 1000L) {
            return ResponseEntity.badRequest()
                    .body(new MessageResponse("Error: Minimum top-up amount is 1000 VND."));
        }

        String orderId = buildCompactId("topup");
        String requestId = buildCompactId("req");
        String redirectUrl = buildFrontendUrl(request.getReturnPath());
        String ipnUrl = normalizeBaseUrl(appProperties.getBackendUrl()) + "/api/payments/momo/ipn";
        String orderInfo = "Nap vi Web Tuyen Online";
        String extraData = encodeExtraData(Map.of(
                "userId", user.getId(),
                "type", TYPE_TOP_UP,
                "amount", amount));

        String rawSignature = "accessKey=" + momoProperties.getAccessKey()
                + "&amount=" + amount
                + "&extraData=" + extraData
                + "&ipnUrl=" + ipnUrl
                + "&orderId=" + orderId
                + "&orderInfo=" + orderInfo
                + "&partnerCode=" + momoProperties.getPartnerCode()
                + "&redirectUrl=" + redirectUrl
                + "&requestId=" + requestId
                + "&requestType=captureWallet";

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("partnerCode", momoProperties.getPartnerCode());
        payload.put("requestType", "captureWallet");
        payload.put("ipnUrl", ipnUrl);
        payload.put("redirectUrl", redirectUrl);
        payload.put("orderId", orderId);
        payload.put("amount", amount);
        payload.put("orderInfo", orderInfo);
        payload.put("requestId", requestId);
        payload.put("extraData", extraData);
        payload.put("lang", "vi");
        payload.put("signature", hmacSha256(rawSignature, momoProperties.getSecretKey()));
        if (hasText(momoProperties.getPartnerName())) {
            payload.put("partnerName", momoProperties.getPartnerName());
        }
        if (hasText(momoProperties.getStoreId())) {
            payload.put("storeId", momoProperties.getStoreId());
        }

        try {
            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(momoProperties.getEndpoint()))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();

            HttpResponse<String> momoResponse = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            Map<String, Object> responseBody = objectMapper.readValue(
                    momoResponse.body(),
                    new TypeReference<Map<String, Object>>() {});

            int resultCode = toInt(responseBody.get("resultCode"));
            String message = asText(responseBody.get("message"));
            String payUrl = asText(responseBody.get("payUrl"));

            if (momoResponse.statusCode() >= 400 || resultCode != 0 || !hasText(payUrl)) {
                return ResponseEntity.badRequest().body(Map.of(
                        "message", hasText(message) ? message : "Khong tao duoc link thanh toan MoMo.",
                        "resultCode", resultCode));
            }

            PaymentTransaction transaction = new PaymentTransaction();
            transaction.setUserId(user.getId());
            transaction.setType(TYPE_TOP_UP);
            transaction.setProvider(PROVIDER_MOMO);
            transaction.setStatus(STATUS_PENDING);
            transaction.setAmount(amount);
            transaction.setOrderId(orderId);
            transaction.setRequestId(requestId);
            transaction.setPayUrl(payUrl);
            transaction.setMessage(message);
            transaction.setCreatedAt(new Date());
            transaction.setUpdatedAt(new Date());
            paymentTransactionRepository.save(transaction);

            return ResponseEntity.ok(Map.of(
                    "payUrl", payUrl,
                    "orderId", orderId,
                    "requestId", requestId));
        } catch (Exception error) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(new MessageResponse("Error: Could not connect to MoMo. " + error.getMessage()));
        }
    }

    @PostMapping("/momo/ipn")
    public ResponseEntity<?> handleMomoIpn(@RequestBody Map<String, Object> payload) {
        return processMomoCallback(payload);
    }

    @PostMapping("/momo/confirm")
    public ResponseEntity<?> confirmMomoReturn(@RequestBody Map<String, Object> payload) {
        return processMomoCallback(payload);
    }

    private ResponseEntity<?> processMomoCallback(Map<String, Object> payload) {
        if (!momoProperties.isConfigured()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(new MessageResponse("Error: MoMo is not configured."));
        }

        String receivedSignature = asText(payload.get("signature"));
        if (!hasText(receivedSignature)) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Missing MoMo signature."));
        }

        String rawSignature = "accessKey=" + momoProperties.getAccessKey()
                + "&amount=" + asText(payload.get("amount"))
                + "&extraData=" + asText(payload.get("extraData"))
                + "&message=" + asText(payload.get("message"))
                + "&orderId=" + asText(payload.get("orderId"))
                + "&orderInfo=" + asText(payload.get("orderInfo"))
                + "&orderType=" + asText(payload.get("orderType"))
                + "&partnerCode=" + asText(payload.get("partnerCode"))
                + "&payType=" + asText(payload.get("payType"))
                + "&requestId=" + asText(payload.get("requestId"))
                + "&responseTime=" + asText(payload.get("responseTime"))
                + "&resultCode=" + asText(payload.get("resultCode"))
                + "&transId=" + asText(payload.get("transId"));

        String expectedSignature = hmacSha256(rawSignature, momoProperties.getSecretKey());
        if (!expectedSignature.equals(receivedSignature)) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Invalid MoMo signature."));
        }

        String orderId = asText(payload.get("orderId"));
        Optional<PaymentTransaction> transactionOpt = paymentTransactionRepository.findByOrderId(orderId);
        if (transactionOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new MessageResponse("Error: Payment transaction not found."));
        }

        PaymentTransaction transaction = transactionOpt.get();
        transaction.setProviderTransactionId(toLong(payload.get("transId")));
        transaction.setMessage(asText(payload.get("message")));
        transaction.setUpdatedAt(new Date());

        if (STATUS_COMPLETED.equals(transaction.getStatus())) {
            return ResponseEntity.ok(buildPaymentSummary(transaction));
        }

        int resultCode = toInt(payload.get("resultCode"));
        if (resultCode == 0) {
            if (TYPE_TOP_UP.equals(transaction.getType())) {
                Optional<User> userOpt = userRepository.findById(transaction.getUserId());
                if (userOpt.isPresent()) {
                    User user = userOpt.get();
                    user.setWalletBalance(safeWalletBalance(user) + normalizeAmount(transaction.getAmount()));
                    userRepository.save(user);
                }
            }
            transaction.setStatus(STATUS_COMPLETED);
        } else {
            transaction.setStatus(STATUS_FAILED);
        }

        paymentTransactionRepository.save(transaction);
        return ResponseEntity.ok(buildPaymentSummary(transaction));
    }

    private Map<String, Object> buildPaymentSummary(PaymentTransaction transaction) {
        Map<String, Object> response = new HashMap<>();
        response.put("status", transaction.getStatus());
        response.put("message", transaction.getMessage());
        response.put("amount", transaction.getAmount());

        if (hasText(transaction.getUserId())) {
            userRepository.findById(transaction.getUserId()).ifPresent(user ->
                    response.put("balance", safeWalletBalance(user)));
        }

        return response;
    }

    private boolean canViewStory(Story story, UserDetailsImpl currentUser, boolean admin) {
        return isApprovedForPublic(story) || admin || isOwner(story, currentUser);
    }

    private boolean isApprovedForPublic(Story story) {
        return story.getApprovalStatus() == null || story.getApprovalStatus() == EApprovalStatus.APPROVED;
    }

    private boolean isOwner(Story story, UserDetailsImpl currentUser) {
        return currentUser != null
                && story.getUploaderId() != null
                && story.getUploaderId().equals(currentUser.getId());
    }

    private boolean isAdmin(UserDetailsImpl currentUser) {
        return currentUser != null
                && currentUser.getAuthorities().stream()
                        .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
    }

    private User requireCurrentUserEntity() {
        UserDetailsImpl userDetails = requireCurrentUser();
        return userRepository.findById(userDetails.getId())
                .orElseThrow(() -> new RuntimeException("Authenticated user not found."));
    }

    private UserDetailsImpl requireCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserDetailsImpl userDetails)) {
            throw new RuntimeException("Authenticated user not found.");
        }
        return userDetails;
    }

    private List<String> safePurchasedStoryIds(User user) {
        if (user.getPurchasedStoryIds() == null) {
            return new ArrayList<>();
        }

        return new ArrayList<>(user.getPurchasedStoryIds());
    }

    private long safeWalletBalance(User user) {
        return user.getWalletBalance() == null ? 0L : user.getWalletBalance();
    }

    private long normalizeAmount(Long amount) {
        return amount == null || amount < 0L ? 0L : amount;
    }

    private String buildCompactId(String prefix) {
        String compactUuid = UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        return prefix + "_" + System.currentTimeMillis() + "_" + compactUuid;
    }

    private String buildFrontendUrl(String returnPath) {
        String baseUrl = normalizeBaseUrl(appProperties.getFrontendUrl());
        return baseUrl + normalizeReturnPath(returnPath);
    }

    private String normalizeReturnPath(String returnPath) {
        if (!hasText(returnPath) || !returnPath.startsWith("/") || returnPath.startsWith("//")) {
            return "/profile";
        }

        return returnPath;
    }

    private String normalizeBaseUrl(String value) {
        if (!hasText(value)) {
            return "";
        }

        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private String encodeExtraData(Map<String, Object> data) {
        try {
            return Base64.getEncoder().encodeToString(
                    objectMapper.writeValueAsBytes(data));
        } catch (Exception error) {
            throw new RuntimeException("Could not encode MoMo extra data.", error);
        }
    }

    private String hmacSha256(String rawData, String secretKey) {
        try {
            Mac hmacSha256 = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKeySpec = new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            hmacSha256.init(secretKeySpec);
            byte[] bytes = hmacSha256.doFinal(rawData.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte value : bytes) {
                builder.append(String.format("%02x", value));
            }
            return builder.toString();
        } catch (Exception error) {
            throw new RuntimeException("Could not sign MoMo request.", error);
        }
    }

    private int toInt(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }

        if (value == null) {
            return 0;
        }

        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException error) {
            return 0;
        }
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }

        if (value == null) {
            return null;
        }

        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException error) {
            return null;
        }
    }

    private String asText(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private boolean isMomoReady() {
        return momoProperties.isConfigured()
                && hasText(appProperties.getFrontendUrl())
                && hasText(appProperties.getBackendUrl());
    }
}
