export interface QuotaConfig {
  endpoint: string;
  skipPremium?: boolean; // Default: true
}

export interface QuotaInfo {
  hasQuota: boolean;
  currentUsageDay: number; // 0, 1, 2, 3...
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  resetsAt: string | null; // ISO timestamp (próximo día calendario)
  cycleResetsAt: string | null; // ISO timestamp (30 días desde firstUsedAt)
  isPremium?: boolean;
}

export interface QuotaCheckResult {
  allowed: boolean;
  info: QuotaInfo;
}
