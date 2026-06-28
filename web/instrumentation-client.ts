import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim(),
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE?.trim() || "0"),
    replaysSessionSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE?.trim() || "0"),
    replaysOnErrorSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE?.trim() || "1"),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;