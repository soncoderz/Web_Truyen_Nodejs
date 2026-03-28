package com.example.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.example.backend.model.PaymentTransaction;

public interface PaymentTransactionRepository extends MongoRepository<PaymentTransaction, String> {
    Optional<PaymentTransaction> findByOrderId(String orderId);
    List<PaymentTransaction> findTop10ByUserIdOrderByCreatedAtDesc(String userId);
}
