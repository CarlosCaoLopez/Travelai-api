import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { QuotaGuard } from './guards/quota.guard';
import { QuotaCountingInterceptor } from './interceptors/quota-counting.interceptor';

@Module({
  providers: [QuotaService, QuotaGuard, QuotaCountingInterceptor],
  exports: [QuotaService, QuotaGuard, QuotaCountingInterceptor],
})
export class QuotaModule {}
