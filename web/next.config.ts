import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

const shouldUploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN?.trim() &&
  process.env.SENTRY_ORG?.trim() &&
  process.env.SENTRY_PROJECT?.trim(),
);

export default shouldUploadSourceMaps
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      disableLogger: true,
    })
  : nextConfig;
