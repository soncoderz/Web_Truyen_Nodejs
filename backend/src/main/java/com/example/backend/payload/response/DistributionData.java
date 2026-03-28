package com.example.backend.payload.response;

import java.util.List;

public class DistributionData {
    private List<DistributionItem> byType;
    private List<DistributionItem> byStatus;
    private List<DistributionItem> byRole;

    public DistributionData() {}

    public DistributionData(List<DistributionItem> byType, List<DistributionItem> byStatus, List<DistributionItem> byRole) {
        this.byType = byType;
        this.byStatus = byStatus;
        this.byRole = byRole;
    }

    public List<DistributionItem> getByType() { return byType; }
    public void setByType(List<DistributionItem> v) { this.byType = v; }

    public List<DistributionItem> getByStatus() { return byStatus; }
    public void setByStatus(List<DistributionItem> v) { this.byStatus = v; }

    public List<DistributionItem> getByRole() { return byRole; }
    public void setByRole(List<DistributionItem> v) { this.byRole = v; }
}
