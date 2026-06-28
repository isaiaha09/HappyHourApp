This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

To enable Cloudflare Turnstile on the dashboard login and contact form, set these values in your local environment:

```bash
CLOUDFLARE_TURNSTILE_SITE_KEY=your_turnstile_site_key
CLOUDFLARE_TURNSTILE_SECRET_KEY=your_turnstile_secret_key
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

`CLOUDFLARE_TURNSTILE_SITE_KEY` is used by the browser widget. `CLOUDFLARE_TURNSTILE_SECRET_KEY` is used only by the Next.js server routes that verify each token before login or contact form submission is allowed.

Optional Sentry variables for the Vercel deployment:

```bash
NEXT_PUBLIC_SENTRY_DSN=your_browser_or_fullstack_dsn
SENTRY_DSN=your_server_dsn
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0
NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1
```

If you want Vercel builds to upload source maps to Sentry, also set:

```bash
SENTRY_AUTH_TOKEN=your_sentry_auth_token
SENTRY_ORG=your_sentry_org_slug
SENTRY_PROJECT=your_sentry_project_slug
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
