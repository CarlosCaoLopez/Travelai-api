import { SetMetadata } from '@nestjs/common';
import { QuotaConfig } from '../interfaces/quota-config.interface';
import { QUOTA_CONFIG_KEY } from '../constants/quota.constants';

export const DailyQuota = (config: QuotaConfig) =>
  SetMetadata(QUOTA_CONFIG_KEY, config);
