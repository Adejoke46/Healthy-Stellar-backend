import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

const isDev = process.env.NODE_ENV === 'development';
const isStaging = process.env.NODE_ENV === 'staging';

/**
 * Swagger UI requires 'unsafe-inline' for styles and several CDN script/style
 * sources.  These are only relaxed in development; production uses strict
 * 'self'-only directives (Issue #653).
 */
const swaggerAssets = isDev
  ? {
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'cdn.jsdelivr.net', 'validator.swagger.io'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
    }
  : {
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
    };

export const buildHelmetOptions = (): Parameters<typeof helmet>[0] => ({
  contentSecurityPolicy: {
    // In staging use report-only mode so violations are logged without blocking (Issue #653)
    reportOnly: isStaging,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      workerSrc: ["'none'"],
      // Directive values vary by environment (see above)
      scriptSrc: [
        ...swaggerAssets.scriptSrc,
        (_req, res: any) => `'nonce-${res.locals.nonce}'`,
      ],
      styleSrc: swaggerAssets.styleSrc,
      imgSrc: swaggerAssets.imgSrc,
      fontSrc: swaggerAssets.fontSrc,
      // Report CSP violations to the /csp-report endpoint
      ...(isStaging && { reportUri: ['/csp-report'] }),
    },
  },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  referrerPolicy: { policy: 'no-referrer' },
});

export function applySecurityHeaders(app: INestApplication): void {
  app.use(helmet(buildHelmetOptions()));
  app.use((_req, res, next) => {
    res.setHeader('X-XSS-Protection', '0');
    next();
  });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
}
