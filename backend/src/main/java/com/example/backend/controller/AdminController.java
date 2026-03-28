package com.example.backend.controller;

import java.util.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.example.backend.model.EApprovalStatus;
import com.example.backend.model.ERole;
import com.example.backend.model.Role;
import com.example.backend.model.User;
import com.example.backend.payload.response.*;
import com.example.backend.repository.*;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Autowired
    StoryRepository storyRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    ChapterRepository chapterRepository;

    @Autowired
    CommentRepository commentRepository;

    @Autowired
    ReportRepository reportRepository;

    @Autowired
    RoleRepository roleRepository;

    // ===== BASIC STATS (existing) =====
    @GetMapping("/stats")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getDashboardStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalStories", storyRepository.count());
        stats.put("totalUsers", userRepository.count());
        stats.put("totalChapters", chapterRepository.count());
        stats.put("totalComments", commentRepository.count());
        stats.put("pendingReports", reportRepository.findByStatusOrderByCreatedAtDesc("PENDING").size());
        stats.put("pendingStories", storyRepository.countByApprovalStatus(EApprovalStatus.PENDING));
        stats.put("pendingChapters", chapterRepository.countByApprovalStatus(EApprovalStatus.PENDING));
        stats.put("recentStories", storyRepository.findAll().stream().limit(5).toList());
        return ResponseEntity.ok(stats);
    }

    // ===== TREND STATISTICS =====
    @GetMapping("/stats/trends")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getTrendStats() {
        Calendar cal = Calendar.getInstance();
        cal.setFirstDayOfWeek(Calendar.MONDAY);

        // Start of today
        cal.set(Calendar.HOUR_OF_DAY, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        Date startOfToday = cal.getTime();

        // Start of this week (Monday)
        cal.set(Calendar.DAY_OF_WEEK, Calendar.MONDAY);
        Date startOfWeek = cal.getTime();

        // Start of this month
        cal.set(Calendar.DAY_OF_MONTH, 1);
        Date startOfMonth = cal.getTime();

        TrendStats trends = new TrendStats(
            userRepository.countByCreatedAtGreaterThan(startOfToday),
            userRepository.countByCreatedAtGreaterThan(startOfWeek),
            userRepository.countByCreatedAtGreaterThan(startOfMonth),
            storyRepository.countByCreatedAtGreaterThan(startOfWeek),
            storyRepository.countByCreatedAtGreaterThan(startOfMonth),
            chapterRepository.countByCreatedAtGreaterThan(startOfWeek),
            chapterRepository.countByCreatedAtGreaterThan(startOfMonth)
        );

        return ResponseEntity.ok(trends);
    }

    // ===== HOT STORIES (Top N) =====
    @GetMapping("/stats/hot")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getHotStories() {
        List<com.example.backend.model.Story> topByViews = storyRepository.findTop10ByOrderByViewsDesc();
        List<com.example.backend.model.Story> topByRating = storyRepository.findTop10ByOrderByAverageRatingDesc();
        return ResponseEntity.ok(new HotStories(topByViews, topByRating));
    }

    // ===== DISTRIBUTION DATA (for pie charts) =====
    @GetMapping("/stats/distribution")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getDistributionData() {
        long mangaCount = storyRepository.countByType("MANGA");
        long novelCount = storyRepository.countByType("NOVEL");
        List<DistributionItem> byType = Arrays.asList(
            new DistributionItem("Manga", mangaCount),
            new DistributionItem("Novel", novelCount)
        );

        long ongoingCount = storyRepository.countByStatus("ONGOING");
        long completedCount = storyRepository.countByStatus("COMPLETED");
        long droppedCount = storyRepository.countByStatus("DROPPED");
        List<DistributionItem> byStatus = Arrays.asList(
            new DistributionItem("Đang ra", ongoingCount),
            new DistributionItem("Đã hoàn thành", completedCount),
            new DistributionItem("Đã drop", droppedCount)
        );

        // Count users by role via in-memory iteration
        List<User> allUsers = userRepository.findAll();
        long adminCount = 0;
        long userCount = 0;
        Role adminRole = roleRepository.findByName(ERole.ROLE_ADMIN).orElse(null);
        Role userRole = roleRepository.findByName(ERole.ROLE_USER).orElse(null);
        for (User u : allUsers) {
            boolean hasAdmin = adminRole != null && u.getRoles().stream()
                .anyMatch(r -> r.getName() == ERole.ROLE_ADMIN);
            if (hasAdmin) adminCount++;
            else userCount++;
        }
        List<DistributionItem> byRole = Arrays.asList(
            new DistributionItem("Admin", adminCount),
            new DistributionItem("User", userCount)
        );

        return ResponseEntity.ok(new DistributionData(byType, byStatus, byRole));
    }
}
