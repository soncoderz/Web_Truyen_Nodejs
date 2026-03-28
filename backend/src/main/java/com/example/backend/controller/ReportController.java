package com.example.backend.controller;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import com.example.backend.model.Report;
import com.example.backend.payload.request.ReportRequest;
import com.example.backend.payload.response.MessageResponse;
import com.example.backend.repository.ReportRepository;
import com.example.backend.security.services.UserDetailsImpl;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/reports")
public class ReportController {

    @Autowired
    ReportRepository reportRepository;

    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> createReport(@Valid @RequestBody ReportRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();

        Report report = new Report(userDetails.getId(), request.getStoryId(),
                request.getChapterId(), request.getReason());
        reportRepository.save(report);
        return ResponseEntity.ok(new MessageResponse("Report submitted successfully!"));
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<Report>> getAllReports() {
        return ResponseEntity.ok(reportRepository.findAllByOrderByCreatedAtDesc());
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> updateReportStatus(@PathVariable String id,
            @RequestBody java.util.Map<String, String> payload) {
        return reportRepository.findById(id).map(report -> {
            report.setStatus(payload.get("status"));
            reportRepository.save(report);
            return ResponseEntity.ok(new MessageResponse("Report status updated!"));
        }).orElse(ResponseEntity.badRequest().body(new MessageResponse("Error: Report not found!")));
    }
}
