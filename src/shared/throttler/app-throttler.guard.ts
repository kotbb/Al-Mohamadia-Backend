import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

const THROTTLE_BUCKETS = ['auth', 'publicPdf', 'global'] as const;
type ThrottleBucket = (typeof THROTTLE_BUCKETS)[number];

const LIMIT_ENV: Record<ThrottleBucket, string> = {
  auth: 'THROTTLE_AUTH_LIMIT',
  publicPdf: 'THROTTLE_PUBLIC_PDF_LIMIT',
  global: 'THROTTLE_GLOBAL_LIMIT',
};

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.THROTTLE_DISABLED === 'true') {
      return true;
    }

    const bucket = this.bucketFor(context);
    const throttler = bucket ? this.throttlers?.find((entry) => entry.name === bucket) : undefined;
    if (!bucket || !throttler || this.isBucketSkipped(context, bucket)) {
      return true;
    }
    if (typeof throttler.ttl !== 'number') {
      return true;
    }

    const configuredLimit = Number(process.env[LIMIT_ENV[bucket]] ?? throttler.limit);
    const limit = Number.isFinite(configuredLimit) ? configuredLimit : Number(throttler.limit);
    if (!Number.isFinite(limit)) {
      return true;
    }

    const requestProps: ThrottlerRequest = {
      context,
      limit,
      ttl: throttler.ttl,
      throttler,
      blockDuration: throttler.ttl,
      getTracker: this.commonOptions.getTracker ?? this.getTracker.bind(this),
      generateKey: this.commonOptions.generateKey ?? this.generateKey.bind(this),
    };
    return this.handleRequest(requestProps);
  }

  private bucketFor(context: ExecutionContext): ThrottleBucket | null {
    const request = context.switchToHttp().getRequest<{ method?: string; url?: string; originalUrl?: string }>();
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0];

    if (request.method === 'POST' && /^\/api\/v1\/auth\/(login|refresh|logout)$/.test(path)) {
      return 'auth';
    }
    if (request.method === 'GET' && /^\/api\/v1\/public\/sales-invoices\/[^/]+\/pdf$/.test(path)) {
      return 'publicPdf';
    }
    return 'global';
  }

  private isBucketSkipped(context: ExecutionContext, bucket: ThrottleBucket): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(`THROTTLER:SKIP${bucket}`, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}
