package com.example.backend.model;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.DBRef;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "users")
public class User {
    @Id
    private String id;

    @NotBlank
    @Size(max = 20)
    private String username;

    @NotBlank
    @Size(max = 50)
    @Email
    private String email;

    @Size(max = 120)
    private String password;

    private String googleId;
    private String provider; // "local" or "google"

    @DBRef
    private Set<Role> roles = new HashSet<>();

    private String avatar;

    private List<String> followedStoryIds = new ArrayList<>();

    private Long walletBalance = 0L;

    private List<String> purchasedStoryIds = new ArrayList<>();

    private String resetToken;

    private Date resetTokenExpiry;

    private Date createdAt = new Date();

    public User() {}

    public User(String username, String email, String password) {
        this.username = username;
        this.email = email;
        this.password = password;
        this.provider = "local";
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public Set<Role> getRoles() { return roles; }
    public void setRoles(Set<Role> roles) { this.roles = roles; }

    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }

    public List<String> getFollowedStoryIds() { return followedStoryIds; }
    public void setFollowedStoryIds(List<String> followedStoryIds) { this.followedStoryIds = followedStoryIds; }

    public Long getWalletBalance() { return walletBalance; }
    public void setWalletBalance(Long walletBalance) { this.walletBalance = walletBalance; }

    public List<String> getPurchasedStoryIds() { return purchasedStoryIds; }
    public void setPurchasedStoryIds(List<String> purchasedStoryIds) { this.purchasedStoryIds = purchasedStoryIds; }

    public String getResetToken() { return resetToken; }
    public void setResetToken(String resetToken) { this.resetToken = resetToken; }

    public Date getResetTokenExpiry() { return resetTokenExpiry; }
    public void setResetTokenExpiry(Date resetTokenExpiry) { this.resetTokenExpiry = resetTokenExpiry; }

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }

    public String getGoogleId() { return googleId; }
    public void setGoogleId(String googleId) { this.googleId = googleId; }

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
}
