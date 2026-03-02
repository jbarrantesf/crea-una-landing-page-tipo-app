const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// It's recommended to use a library like 'dotenv' to manage environment variables.
// require('dotenv').config();

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS || 100;

// --- INITIALIZE EXPRESS APP ---
const app = express();

// --- CUSTOM ERROR CLASSES ---
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}

class ValidationError extends AppError {
    constructor(message = 'Invalid input') {
        super(message, 400);
    }
}

// --- MOCK DATABASE ---
// In a real application, this would come from a database.
const db = {
    projects: [
        { id: 'proj-01', name: 'StellarPay', description: 'A mobile payment platform for emerging markets.', techStack: ['React Native', 'Node.js', 'PostgreSQL'], category: 'FinTech' },
        { id: 'proj-02', name: 'HealthOrbit', description: 'A telemedicine app connecting patients with doctors.', techStack: ['Flutter', 'Firebase', 'WebRTC'], category: 'HealthTech' },
        { id: 'proj-03', name: 'ConnectSphere', description: 'A social networking app focused on local communities.', techStack: ['Vue.js', 'Express', 'MongoDB'], category: 'Social' },
        { id: 'proj-04', name: 'LogiTrack', description: 'Real-time logistics and fleet management system.', techStack: ['Angular', 'Java Spring Boot', 'MySQL'], category: 'Logistics' },
    ],
    team: [
        { id: 'team-01', name: 'Alex Orion', role: 'Lead Backend Engineer', avatarUrl: '/avatars/alex.jpg' },
        { id: 'team-02', name: 'Samantha Nova', role: 'Principal UI/UX Designer', avatarUrl: '/avatars/samantha.jpg' },
        { id: 'team-03', name: 'Leo Comet', role: 'Senior Frontend Developer', avatarUrl: '/avatars/leo.jpg' },
        { id: 'team-04', name: 'Zara Nebula', role: 'Project Manager & QA Lead', avatarUrl: '/avatars/zara.jpg' },
    ],
    services: [
        { id: 'serv-01', name: 'Mobile App Development', description: 'Crafting beautiful and performant apps for iOS and Android using native or cross-platform technologies.' },
        { id: 'serv-02', name: 'Web App & API Development', description: 'Building scalable and secure backends and responsive frontends for the modern web.' },
        { id: 'serv-03', name: 'UI/UX Design', description: 'Designing intuitive and elegant user interfaces that deliver an exceptional user experience.' },
        { id: 'serv-04', name: 'Cloud & DevOps', description: 'Deploying and managing your applications on the cloud with robust CI/CD pipelines.' },
    ],
    testimonials: [
        { id: 'test-01', author: 'CEO, StellarPay', quote: 'ORBIT delivered beyond our expectations. Their expertise and dedication are second to none.' },
        { id: 'test-02', author: 'Founder, HealthOrbit', quote: 'The team is professional, agile, and truly understands the nuances of product development.' },
    ],
    leads: [],
};


// --- MIDDLEWARES ---
app.use(cors({
    origin: CLIENT_ORIGIN
}));
app.use(express.json({
    limit: '10kb'
})); // Body parser, reading data from body into req.body
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'short'));

// Rate Limiter
const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again after a while.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api', apiLimiter);


// --- UTILITY FUNCTIONS ---

/**
 * Wraps async functions to catch errors and pass them to the global error handler.
 * @param {Function} fn - The async route handler function.
 * @returns {Function} - The wrapped function.
 */
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Sanitizes a string to prevent basic XSS attacks.
 * @param {string} str - The string to sanitize.
 * @returns {string} - The sanitized string.
 */
const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"'/]/g, (match) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    }[match]));
};

// --- VALIDATION MIDDLEWARES ---

/**
 * Validates and sanitizes the input for a new lead submission.
 */
const validateAndSanitizeLead = (req, res, next) => {
    const {
        name,
        email,
        message
    } = req.body;

    if (!name || !email || !message) {
        return next(new ValidationError('Name, email, and message are required.'));
    }

    if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string') {
        return next(new ValidationError('Invalid input types.'));
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return next(new ValidationError('Invalid email format.'));
    }
    
    // Sanitize inputs
    req.body.name = sanitizeString(name);
    req.body.email = sanitizeString(email);
    req.body.message = sanitizeString(message);

    next();
};


// --- ROUTE HANDLERS (CONTROLLERS) ---

// ** Health Check Handlers **
const healthCheckHandler = (req, res) => {
    res.status(200).json({
        success: true,
        data: {
            message: 'API is healthy',
            timestamp: new Date().toISOString()
        }
    });
};


// ** Leads Handlers **

/**
 * @route POST /api/leads
 * @description Submits a new lead from the contact form.
 * @param {object} req - Express request object.
 * @param {object} req.body - The body of the request.
 * @param {string} req.body.name - The user's name.
 * @param {string} req.body.email - The user's email.
 * @param {string} req.body.message - The user's message.
 * @param {object} res - Express response object.
 * @returns {object} JSON response indicating success.
 */
const createLeadHandler = (req, res) => {
    const { name, email, message } = req.body;
    const newLead = {
        id: `lead-${Date.now()}`,
        name,
        email,
        message,
        createdAt: new Date().toISOString(),
    };

    // In a real app, you would save this to a database and send an email notification.
    db.leads.push(newLead);
    console.log('New lead received:', newLead);

    res.status(201).json({
        success: true,
        data: {
            message: "Thank you for your message. We'll be in touch shortly!"
        }
    });
};


// ** Projects Handlers **

/**
 * @route GET /api/projects
 * @description Gets a list of projects with pagination and search support.
 * @param {object} req - Express request object.
 * @param {object} req.query - The query parameters.
 * @param {string} [req.query.limit=10] - The number of items to return.
 * @param {string} [req.query.offset=0] - The number of items to skip.
 * @param {string} [req.query.q] - A search query to filter projects by name or description.
 * @param {object} res - Express response object.
 * @returns {object} JSON response with a list of projects.
 */
const getAllProjectsHandler = (req, res) => {
    let results = [...db.projects];
    const { q, limit: limitStr, offset: offsetStr } = req.query;

    // Filtering by search query
    if (q && typeof q === 'string') {
        const searchTerm = q.toLowerCase();
        results = results.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            p.description.toLowerCase().includes(searchTerm)
        );
    }

    // Pagination
    const limit = parseInt(limitStr, 10) || 10;
    const offset = parseInt(offsetStr, 10) || 0;
    const paginatedResults = results.slice(offset, offset + limit);

    res.status(200).json({
        success: true,
        data: {
            projects: paginatedResults,
            total: results.length,
            limit,
            offset
        }
    });
};

/**
 * @route GET /api/projects/:id
 * @description Gets a single project by its ID.
 * @param {object} req - Express request object.
 * @param {object} req.params - The route parameters.
 * @param {string} req.params.id - The ID of the project to retrieve.
 * @param {object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 * @returns {object} JSON response with the project data.
 */
const getProjectByIdHandler = (req, res, next) => {
    const { id } = req.params;
    const project = db.projects.find(p => p.id === id);

    if (!project) {
        return next(new NotFoundError(`Project with ID ${id} not found.`));
    }

    res.status(200).json({
        success: true,
        data: project
    });
};


// ** Team, Services, Testimonials Handlers (Simple Getters) **

/**
 * @route GET /api/team
 * @description Gets the list of team members.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {object} JSON response with team members.
 */
const getTeamHandler = (req, res) => {
    res.status(200).json({ success: true, data: db.team });
};

/**
 * @route GET /api/services
 * @description Gets the list of services.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {object} JSON response with services.
 */
const getServicesHandler = (req, res) => {
    res.status(200).json({ success: true, data: db.services });
};

/**
 * @route GET /api/testimonials
 * @description Gets the list of testimonials.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @returns {object} JSON response with testimonials.
 */
const getTestimonialsHandler = (req, res) => {
    res.status(200).json({ success: true, data: db.testimonials });
};


// --- ROUTERS ---
const apiRouter = express.Router();
const leadsRouter = express.Router();
const projectsRouter = express.Router();

// Lead routes
leadsRouter.post('/', validateAndSanitizeLead, asyncHandler(createLeadHandler));

// Project routes
projectsRouter.get('/', asyncHandler(getAllProjectsHandler));
projectsRouter.get('/:id', asyncHandler(getProjectByIdHandler));

// Mount resource routers
apiRouter.use('/leads', leadsRouter);
apiRouter.use('/projects', projectsRouter);
apiRouter.get('/team', asyncHandler(getTeamHandler));
apiRouter.get('/services', asyncHandler(getServicesHandler));
apiRouter.get('/testimonials', asyncHandler(getTestimonialsHandler));


// --- APP ROUTE MOUNTING ---
app.get('/api/health', healthCheckHandler);
app.use('/api', apiRouter);


// --- GLOBAL ERROR HANDLING ---

// Handle 404 for any other route
app.all('*', (req, res, next) => {
    next(new NotFoundError(`Can't find ${req.originalUrl} on this server!`));
});

// Global error handling middleware
app.use((err, req, res, next) => {
    // If the error is not one we've defined, log it and set a generic 500 status.
    if (!err.isOperational) {
        console.error('UNEXPECTED ERROR: ', err);
        err.statusCode = 500;
        err.message = 'Something went very wrong!';
    }
    
    // In production, we don't want to send detailed error messages to the client
    // unless it's an operational error we trust.
    const errorMessage = NODE_ENV === 'production' && !err.isOperational
        ? 'Internal Server Error'
        : err.message;

    res.status(err.statusCode || 500).json({
        success: false,
        error: errorMessage,
    });
});


// --- SERVER START ---
const server = app.listen(PORT, () => {
    console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`);
    console.log(`Accepting requests from: ${CLIENT_ORIGIN}`);
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! Shutting down...');
    console.error(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});

module.exports = app;