package com.example.backend.payload.response;

public class DistributionItem {
    private String label;
    private long value;

    public DistributionItem() {}

    public DistributionItem(String label, long value) {
        this.label = label;
        this.value = value;
    }

    public String getLabel() { return label; }
    public void setLabel(String v) { this.label = v; }

    public long getValue() { return value; }
    public void setValue(long v) { this.value = v; }
}
