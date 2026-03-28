package com.example.backend.config;

import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;

@Configuration
public class MongoConfig {

    @Value("${spring.data.mongodb.uri}")
    private String mongoUri;

    @Value("${app.mongodb.max-connection-pool-size:20}")
    private int maxConnectionPoolSize;

    @Value("${app.mongodb.min-connection-pool-size:0}")
    private int minConnectionPoolSize;

    @Value("${app.mongodb.max-connection-idle-time-ms:60000}")
    private long maxConnectionIdleTimeMs;

    @Value("${app.mongodb.max-connection-life-time-ms:300000}")
    private long maxConnectionLifeTimeMs;

    @Value("${app.mongodb.connect-timeout-ms:5000}")
    private int connectTimeoutMs;

    @Value("${app.mongodb.read-timeout-ms:10000}")
    private int readTimeoutMs;

    @Value("${app.mongodb.server-selection-timeout-ms:5000}")
    private int serverSelectionTimeoutMs;

    @Bean
    public MongoClient mongoClient() {
        ConnectionString connectionString = new ConnectionString(mongoUri);
        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString(connectionString)
                .applyToConnectionPoolSettings(builder -> builder
                        .maxSize(maxConnectionPoolSize)
                        .minSize(minConnectionPoolSize)
                        .maxConnectionIdleTime(maxConnectionIdleTimeMs, TimeUnit.MILLISECONDS)
                        .maxConnectionLifeTime(maxConnectionLifeTimeMs, TimeUnit.MILLISECONDS))
                .applyToSocketSettings(builder -> builder
                        .connectTimeout(connectTimeoutMs, TimeUnit.MILLISECONDS)
                        .readTimeout(readTimeoutMs, TimeUnit.MILLISECONDS))
                .applyToClusterSettings(builder -> builder
                        .serverSelectionTimeout(serverSelectionTimeoutMs, TimeUnit.MILLISECONDS))
                .build();
        return MongoClients.create(settings);
    }

    @Bean
    public MongoDatabaseFactory mongoDatabaseFactory(MongoClient mongoClient) {
        ConnectionString connectionString = new ConnectionString(mongoUri);
        String database = connectionString.getDatabase();
        if (database == null || database.isEmpty()) {
            database = "Tuyen";
        }
        return new SimpleMongoClientDatabaseFactory(mongoClient, database);
    }

    @Bean
    public MongoTemplate mongoTemplate(MongoDatabaseFactory mongoDatabaseFactory) {
        return new MongoTemplate(mongoDatabaseFactory);
    }
}
