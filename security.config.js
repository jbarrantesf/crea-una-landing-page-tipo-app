const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csurf = require('csurf');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const xss = require('xss');
const { body, validationResult } = require('express-validator');
const fileUpload = require('express-fileupload');
const morgan = require('morgan');

// --- Environment Configuration ---
const isProduction = process.env.NODE_ENV === 'production';
const APP_NAME = process.env.APP_NAME || 'Orbit Agents';
const DOMAIN = process.env.DOMAIN || 'localhost';
const PORT = process.env.PORT || 3000;

// --- Security Constants ---
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-prod';
const JWT_ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || '15m'; // 15 minutes
const JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || '7d';  // 7 days
const CSRF_COOKIE_NAME = '__Host-CSRF-Token'; // secure cookie name prefix
const API_KEY_HEADER = 'x-api-key';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10); // 5 MB
const MAX_REQUEST_BODY_SIZE = process.env.MAX_REQUEST_BODY_SIZE || '1mb'; // 1 MB

// --- Allowed Origins for CORS ---
const allowedOrigins = isProduction
    ? [
        `https://${DOMAIN}`,
        `https://www.${DOMAIN}`,
        // Add any other production domains here
    ]
    : [
        `http://localhost:${PORT}`,
        `http://localhost:3000`, // Default for dev if different from PORT
        `http://localhost:5173`, // Typical for Vite dev server
        // Add any other development origins here
    ];

// --- CSP Configuration ---
const cspDirectives = {
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"], // Adjust as needed for analytics, etc.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://picsum.photos"], // Example external image sources
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"], // Restrict XHR, WebSockets etc.
        frameSrc: ["'none'"], // No iframes from other origins
        objectSrc: ["'none'"], // Disallow <object>, <embed>, <applet>
        upgradeInsecureRequests: [], // Automatically rewrite HTTP to HTTPS
    },
    reportOnly: false, // Set to true to test CSP without blocking
};

// --- CORS Configuration ---
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Allow cookies to be sent with requests
    optionsSuccessStatus: 204, // For legacy browser support
};

// --- Rate Limiting Configuration ---
const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req) => req.ip, // Use IP address to identify clients
});

const authApiRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // Limit each IP to 20 requests per windowMs for auth endpoints
    message: 'Too many authentication attempts from this IP, please try again after 5 minutes',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
});

// --- Helmet.js Headers Configuration ---
const helmetConfig = helmet.contentSecurityPolicy(cspDirectives);
// Other Helmet middleware are applied directly later in the app setup

// --- Input Sanitization Functions ---
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    // Basic HTML escaping for XSS prevention
    let sanitized = xss(input, {
        whiteList: {}, // Remove all tags
        stripIgnoreTag: true, // Strip out all HTML tags
        stripIgnoreTagContHtml: true, // Also strip out HTML content within ignored tags
    });
    // Basic SQL-like injection prevention (more robust validation should be done using ORMs/prepared statements)
    // This is a last resort and not a complete solution for SQLi.
    sanitized = sanitized.replace(/['";\-\\]/g, (match) => `\\${match}`);
    return sanitized;
};

// Middleware for sanitizing request body, query, and params
const sanitizeMiddleware = (req, res, next) => {
    if (req.body) req.body = deepSanitize(req.body);
    if (req.query) req.query = deepSanitize(req.query);
    if (req.params) req.params = deepSanitize(req.params);
    next();
};

const deepSanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
        return sanitizeInput(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(deepSanitize);
    }

    const sanitizedObj = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            sanitizedObj[key] = deepSanitize(obj[key]);
        }
    }
    return sanitizedObj;
};

// --- CSRF Token Configuration ---
const csrfProtection = csurf({
    cookie: {
        key: CSRF_COOKIE_NAME,
        httpOnly: true,
        secure: isProduction, // Set to true in production
        sameSite: 'Lax', // 'Strict' or 'Lax'
        maxAge: 3600, // 1 hour
    },
});

// CSRF token generation and retrieval for client
const generateCsrfToken = (req) => {
    if (req.csrfToken) {
        return req.csrfToken();
    }
    return null; // Should not happen if `csrfProtection` middleware is applied
};

// --- Secure Cookie Configuration ---
const getSecureCookieOptions = (expiresInDays = 7) => ({
    httpOnly: true, // Prevent JavaScript access to the cookie
    secure: isProduction, // Send only over HTTPS in production
    sameSite: 'Lax', // Protect against CSRF attacks ('Strict' or 'Lax')
    path: '/', // Accessible from anywhere on the domain
    maxAge: expiresInDays * 24 * 60 * 60 * 1000, // Convert days to milliseconds
});

// --- Password Hashing Configuration ---
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    return bcrypt.hash(password, salt);
};

const comparePassword = (password, hashedPassword) => {
    return bcrypt.compare(password, hashedPassword);
};

// --- JWT Token Configuration ---
const generateAccessToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRATION });
};

const generateRefreshToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRATION });
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null; // Token is invalid or expired
    }
};

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token) {
        return res.status(401).json({ message: 'Bearer token not found' });
    }

    const user = verifyToken(token);
    if (!user) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }

    req.user = user; // Attach user payload to request
    next();
};

// --- File Upload Validation Middleware ---
const fileUploadConfig = fileUpload({
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 }, // Convert MB to bytes
    abortOnLimit: true,
    responseOnLimit: 'File size limit exceeded (' + MAX_FILE_SIZE_MB + 'MB)',
    debug: !isProduction,
});

const validateFileUpload = (allowedMimeTypes) => (req, res, next) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ message: 'No files were uploaded.' });
    }

    for (const key in req.files) {
        if (Object.prototype.hasOwnProperty.call(req.files, key)) {
            const file = req.files[key];

            // Check MIME type
            if (!allowedMimeTypes.includes(file.mimetype)) {
                return res.status(400).json({
                    message: `Invalid file type for ${file.name}. Allowed types: ${allowedMimeTypes.join(', ')}`,
                });
            }

            // File size limit is handled by `fileUpload` middleware already, but we can add a redundant check
            if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                return res.status(400).json({
                    message: `File ${file.name} exceeds the maximum size of ${MAX_FILE_SIZE_MB}MB.`,
                });
            }
        }
    }
    next();
};

// --- API Key Validation Middleware ---
const validateApiKey = (allowedApiKeys) => (req, res, next) => {
    const apiKey = req.headers[API_KEY_HEADER];

    if (!apiKey) {
        return res.status(401).json({ message: 'API Key is required.' });
    }

    if (!allowedApiKeys.includes(apiKey)) {
        return res.status(403).json({ message: 'Invalid API Key.' });
    }

    next();
};

// --- Request Size Limits Middleware ---
// Handled by express.json() and express.urlencoded() directly to limit body size

// --- Security Audit Logging Function ---
const securityLogger = morgan((tokens, req, res) => {
    const logEntry = [
        `[AUDIT]`,
        new Date().toISOString(),
        req.ip,
        tokens.method(req, res),
        tokens.url(req, res),
        tokens.status(req, res),
        tokens['response-time'](req, res), 'ms',
        `- User: ${req.user ? req.user.id : 'N/A'}`,
        `- Agent: ${tokens['user-agent'](req, res)}`,
    ];

    if (res.statusCode >= 400) {
        logEntry.push(`- Error: ${res.statusMessage || 'Client Error'}`);
    }

    return logEntry.join(' ');
});

const securityAuditLog = (action, details = {}) => {
    const logDetails = {
        timestamp: new Date().toISOString(),
        action: action,
        ...details,
        environment: process.env.NODE_ENV,
        appName: APP_NAME,
    };
    // In a real application, you'd send this to a dedicated logging service (e.g., Splunk, ELK, CloudWatch Logs)
    console.log(JSON.stringify(logDetails));
};

// --- Security Helper Functions ---
const preventSensitiveDataLogging = (data) => {
    if (!data) return data;
    const sensitiveFields = ['password', 'confirmPassword', 'creditCard', 'ssn', 'apiKey', 'token'];
    const sanitizedData = { ...data };
    for (const field of sensitiveFields) {
        if (sanitizedData[field]) {
            sanitizedData[field] = '[REDACTED]';
        }
    }
    return sanitizedData;
};

// --- Module Exports ---
module.exports = {
    // Middleware
    corsMiddleware: cors(corsOptions),
    helmetConfig, // Specific CSP config, other helmet options applied explicitly
    globalRateLimiter,
    authApiRateLimiter,
    sanitizeMiddleware,
    csrfProtection,
    cookieParser: cookieParser(), // Initialize cookie-parser
    authenticateToken,
    fileUploadMiddleware: fileUploadConfig,
    validateFileUpload,
    validateApiKey,
    securityLogger,
    // Functions
    sanitizeInput,
    generateCsrfToken,
    getSecureCookieOptions,
    hashPassword,
    comparePassword,
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    securityAuditLog,
    preventSensitiveDataLogging,
    // Constants
    isProduction,
    APP_NAME,
    DOMAIN,
    PORT,
    JWT_ACCESS_EXPIRATION,
    JWT_REFRESH_EXPIRATION,
    BCRYPT_SALT_ROUNDS,
    MAX_FILE_SIZE_MB,
    MAX_REQUEST_BODY_SIZE,
    API_KEY_HEADER,
    CSRF_COOKIE_NAME,
};