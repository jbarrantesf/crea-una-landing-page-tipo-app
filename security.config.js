// security.config.js

const securityConfig = {
  // Content Security Policy (CSP)
  csp: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com", "https://i.imgur.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.example.com"], // Replace with your actual API endpoint
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
    // Set to true to automatically report violations to a reporting URI
    // reportOnly: process.env.NODE_ENV === 'production' ? false : true,
    // reportUri: '/report-violation', // Replace with your violation reporting endpoint
  },

  // Cross-Origin Resource Sharing (CORS)
  cors: {
    origin: process.env.CORS_ORIGIN || '*', // Adjust for production: e.g., 'https://your-domain.com'
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Foo'],
    credentials: true,
    maxAge: 3600, // Pre-flight cache duration in seconds
  },

  // Input Sanitization (using DOMPurify example, for server-side HTML sanitization)
  // For client-side, consider a similar library or framework-specific sanitization.
  sanitizer: {
    // Example options for DOMPurify
    // To be used with a library like 'dompurify' or 'xss'
    // This example assumes you'd integrate a sanitization library.
    // For Node.js, you might use 'xss' instead of DOMPurify directly.
    domPurifyOptions: {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onmouseover'],
    },
    // Server-side input validation is crucial in addition to sanitization.
  },

  // Rate Limiting (using express-rate-limit example)
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Customize key generator if needed (e.g., based on user ID for authenticated routes)
    // keyGenerator: (req, res) => req.ip,
  },

  // JSON Web Token (JWT) Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your_super_secret_jwt_key', // **IMPORTANT: Use a strong, production-ready secret from environment variables**
    expiresIn: '1h', // Token expiration time
    issuer: 'orbit-app', // Issuer of the token
    audience: 'orbit-users', // Audience of the token
    algorithm: 'HS256', // Hashing algorithm
    // Additional options for `jsonwebtoken` library
    options: {
      // noTimestamp: false,
      // allowInvalidAsymmetricKeyTypes: false,
    },
  },
};

module.exports = securityConfig;