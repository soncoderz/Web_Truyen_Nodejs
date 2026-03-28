package com.example.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.example.backend.model.User;

@Repository
public interface UserRepository extends MongoRepository<User, String> {
    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    Boolean existsByUsername(String username);

    Boolean existsByEmail(String email);

    Optional<User> findByResetToken(String resetToken);

    Optional<User> findByGoogleId(String googleId);

    List<User> findByFollowedStoryIdsContaining(String storyId);

    long countByCreatedAtGreaterThan(java.util.Date date);

}
