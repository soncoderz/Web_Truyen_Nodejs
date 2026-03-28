package com.example.backend.controller;

import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.backend.model.ERole;
import com.example.backend.model.Role;
import com.example.backend.model.User;
import com.example.backend.payload.request.ForgotPasswordRequest;
import com.example.backend.payload.request.GoogleLoginRequest;
import com.example.backend.payload.request.LoginRequest;
import com.example.backend.payload.request.ResetPasswordRequest;
import com.example.backend.payload.request.SignupRequest;
import com.example.backend.payload.response.JwtResponse;
import com.example.backend.payload.response.MessageResponse;
import com.example.backend.repository.RoleRepository;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.jwt.JwtUtils;
import com.example.backend.security.services.UserDetailsImpl;
import com.example.backend.service.EmailService;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    @Autowired
    AuthenticationManager authenticationManager;

    @Autowired
    UserRepository userRepository;

    @Autowired
    RoleRepository roleRepository;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    JwtUtils jwtUtils;

    @Autowired
    EmailService emailService;

    @Value("${google.client.id}")
    private String googleClientId;

    @PostMapping("/signin")
    public ResponseEntity<?> authenticateUser(@Valid @RequestBody LoginRequest loginRequest) {

        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(loginRequest.getUsername(), loginRequest.getPassword()));

        SecurityContextHolder.getContext().setAuthentication(authentication);
        String jwt = jwtUtils.generateJwtToken(authentication);

        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();
        List<String> roles = userDetails.getAuthorities().stream()
                .map(item -> item.getAuthority())
                .collect(Collectors.toList());

        // Fetch avatar from DB
        String avatar = null;
        User dbUser = userRepository.findById(userDetails.getId()).orElse(null);
        if (dbUser != null) {
            avatar = dbUser.getAvatar();
        }

        return ResponseEntity.ok(new JwtResponse(jwt,
                userDetails.getId(),
                userDetails.getUsername(),
                userDetails.getEmail(),
                roles,
                avatar));
    }

    @PostMapping("/signup")
    public ResponseEntity<?> registerUser(@Valid @RequestBody SignupRequest signUpRequest) {
        if (userRepository.existsByUsername(signUpRequest.getUsername())) {
            return ResponseEntity
                    .badRequest()
                    .body(new MessageResponse("Error: Username is already taken!"));
        }

        if (userRepository.existsByEmail(signUpRequest.getEmail())) {
            return ResponseEntity
                    .badRequest()
                    .body(new MessageResponse("Error: Email is already in use!"));
        }

        User user = new User(signUpRequest.getUsername(),
                signUpRequest.getEmail(),
                encoder.encode(signUpRequest.getPassword()));

        Set<String> strRoles = signUpRequest.getRoles();
        Set<Role> roles = new HashSet<>();

        if (strRoles == null) {
            Role userRole = roleRepository.findByName(ERole.ROLE_USER)
                    .orElseThrow(() -> new RuntimeException("Error: Role is not found."));
            roles.add(userRole);
        } else {
            strRoles.forEach(role -> {
                switch (role) {
                    case "admin":
                        Role adminRole = roleRepository.findByName(ERole.ROLE_ADMIN)
                                .orElseThrow(() -> new RuntimeException("Error: Role is not found."));
                        roles.add(adminRole);
                        break;
                    default:
                        Role userRole = roleRepository.findByName(ERole.ROLE_USER)
                                .orElseThrow(() -> new RuntimeException("Error: Role is not found."));
                        roles.add(userRole);
                }
            });
        }

        user.setRoles(roles);
        userRepository.save(user);

        return ResponseEntity.ok(new MessageResponse("User registered successfully!"));
    }

    @PostMapping("/google")
    public ResponseEntity<?> googleLogin(@Valid @RequestBody GoogleLoginRequest googleLoginRequest) {
        try {
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(
                    new NetHttpTransport(), GsonFactory.getDefaultInstance())
                    .setAudience(Collections.singletonList(googleClientId))
                    .build();

            GoogleIdToken idToken = verifier.verify(googleLoginRequest.getCredential());

            if (idToken == null) {
                return ResponseEntity.badRequest()
                        .body(new MessageResponse("Error: Invalid Google token!"));
            }

            GoogleIdToken.Payload payload = idToken.getPayload();
            String googleId = payload.getSubject();
            String email = payload.getEmail();
            String pictureUrl = (String) payload.get("picture");

            // Find user by Google ID or email
            User user = userRepository.findByGoogleId(googleId).orElse(null);

            if (user == null) {
                // Check if user exists with same email
                user = userRepository.findByEmail(email).orElse(null);

                if (user != null) {
                    // Link Google account to existing user
                    user.setGoogleId(googleId);
                    user.setProvider("google");
                    if (pictureUrl != null) {
                        user.setAvatar(pictureUrl);
                    }
                    userRepository.save(user);
                } else {
                    // Create new user
                    String username = email.split("@")[0];
                    // Ensure unique username
                    String baseUsername = username;
                    int counter = 1;
                    while (userRepository.existsByUsername(username)) {
                        username = baseUsername + counter;
                        counter++;
                    }

                    user = new User();
                    user.setUsername(username);
                    user.setEmail(email);
                    user.setPassword(encoder.encode(UUID.randomUUID().toString()));
                    user.setGoogleId(googleId);
                    user.setProvider("google");
                    user.setAvatar(pictureUrl);

                    Set<Role> roles = new HashSet<>();
                    Role userRole = roleRepository.findByName(ERole.ROLE_USER)
                            .orElseThrow(() -> new RuntimeException("Error: Role is not found."));
                    roles.add(userRole);
                    user.setRoles(roles);

                    userRepository.save(user);
                }
            } else {
                // Existing Google user — sync avatar from Google
                if (pictureUrl != null) {
                    user.setAvatar(pictureUrl);
                    userRepository.save(user);
                }
            }

            // Generate JWT for this user
            UserDetailsImpl userDetails = UserDetailsImpl.build(user);
            Authentication authentication = new UsernamePasswordAuthenticationToken(
                    userDetails, null, userDetails.getAuthorities());
            SecurityContextHolder.getContext().setAuthentication(authentication);
            String jwt = jwtUtils.generateJwtToken(authentication);

            List<String> roles = userDetails.getAuthorities().stream()
                    .map(item -> item.getAuthority())
                    .collect(Collectors.toList());

            return ResponseEntity.ok(new JwtResponse(jwt,
                    userDetails.getId(),
                    userDetails.getUsername(),
                    userDetails.getEmail(),
                    roles,
                    user.getAvatar()));

        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(new MessageResponse("Error: Google authentication failed! " + e.getMessage()));
        }
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElse(null);

        if (user == null) {
            return ResponseEntity
                    .badRequest()
                    .body(new MessageResponse("Error: Email not found!"));
        }

        String token = UUID.randomUUID().toString();
        user.setResetToken(token);
        // Token expires in 1 hour
        user.setResetTokenExpiry(new Date(System.currentTimeMillis() + 3600 * 1000));
        userRepository.save(user);

        boolean emailSent = emailService.sendResetPasswordEmail(user.getEmail(), token);

        if (emailSent) {
            return ResponseEntity.ok(new MessageResponse("Password reset email sent successfully."));
        } else {
            return ResponseEntity.internalServerError().body(new MessageResponse("Error: Could not send email."));
        }
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        User user = userRepository.findByResetToken(request.getToken())
                .orElse(null);

        if (user == null) {
            return ResponseEntity
                    .badRequest()
                    .body(new MessageResponse("Error: Invalid Token!"));
        }

        if (user.getResetTokenExpiry() != null && user.getResetTokenExpiry().before(new Date())) {
            return ResponseEntity
                    .badRequest()
                    .body(new MessageResponse("Error: Token expired!"));
        }

        user.setPassword(encoder.encode(request.getNewPassword()));
        user.setResetToken(null);
        user.setResetTokenExpiry(null);
        userRepository.save(user);

        return ResponseEntity.ok(new MessageResponse("Password reset successfully!"));
    }
}
