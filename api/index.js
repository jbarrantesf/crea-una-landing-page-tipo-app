const express = require('express');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(helmet());

// CORS Configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3001', // Allow requests only from your frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));

// JSON Body Parser
app.use(express.json());

// Rate Limiting for all requests to prevent abuse
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use(generalLimiter);

// --- Data Store (In-memory for simplicity, replace with a database in production) ---
let inquiries = [];
let nextId = 1;

// --- Helper for consistent error responses ---
const sendErrorResponse = (res, statusCode, message, errors = []) => {
  res.status(statusCode).json({
    success: false,
    message,
    errors
  });
};

// --- Routes ---

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'API is running smoothly!', uptime: process.uptime() });
});

// CREATE - Submit a new inquiry
app.post(
  '/api/inquiries',
  [
    body('name')
      .trim()
      .isLength({ min: 1 })
      .withMessage('Name is required.')
      .isString()
      .withMessage('Name must be a string.'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Valid email is required.')
      .normalizeEmail(),
    body('message')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Message must be between 10 and 500 characters.')
      .isString()
      .withMessage('Message must be a string.'),
    body('serviceInterest')
      .optional()
      .trim()
      .isString()
      .withMessage('Service interest must be a string.'),
    body('budget')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Budget must be a non-negative integer.')
      .toInt()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendErrorResponse(res, 400, 'Validation failed.', errors.array());
    }

    const { name, email, message, serviceInterest, budget } = req.body;

    const newInquiry = {
      id: nextId++,
      name,
      email,
      message,
      serviceInterest: serviceInterest || 'General',
      budget: budget || null,
      createdAt: new Date().toISOString(),
      status: 'new' // 'new', 'contacted', 'resolved'
    };

    inquiries.push(newInquiry);
    res.status(201).json({
      success: true,
      message: 'Inquiry submitted successfully! We will get back to you soon.',
      inquiry: newInquiry
    });
  }
);

// READ ALL - Get all inquiries (Admin only in a real app)
app.get('/api/inquiries', (req, res) => {
  // In a real application, you'd add authentication and authorization here
  // to ensure only authorized personnel can view all inquiries.
  res.status(200).json({
    success: true,
    message: 'All inquiries retrieved.',
    data: inquiries
  });
});

// READ ONE - Get a single inquiry by ID (Admin only in a real app)
app.get('/api/inquiries/:id', (req, res) => {
  const { id } = req.params;
  const inquiry = inquiries.find(q => q.id === parseInt(id));

  if (!inquiry) {
    return sendErrorResponse(res, 404, `Inquiry with ID ${id} not found.`);
  }

  res.status(200).json({
    success: true,
    message: `Inquiry with ID ${id} retrieved.`,
    data: inquiry
  });
});

// UPDATE - Update an inquiry (Admin only in a real app)
app.put(
  '/api/inquiries/:id',
  [
    body('name')
      .optional()
      .trim()
      .isString()
      .withMessage('Name must be a string.'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Valid email is required.')
      .normalizeEmail(),
    body('message')
      .optional()
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Message must be between 10 and 500 characters.')
      .isString()
      .withMessage('Message must be a string.'),
    body('serviceInterest')
      .optional()
      .trim()
      .isString()
      .withMessage('Service interest must be a string.'),
    body('budget')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Budget must be a non-negative integer.')
      .toInt(),
    body('status')
      .optional()
      .isIn(['new', 'contacted', 'resolved'])
      .withMessage('Status must be one of: new, contacted, resolved.')
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendErrorResponse(res, 400, 'Validation failed.', errors.array());
    }

    const { id } = req.params;
    const inquiryIndex = inquiries.findIndex(q => q.id === parseInt(id));

    if (inquiryIndex === -1) {
      return sendErrorResponse(res, 404, `Inquiry with ID ${id} not found.`);
    }

    const updatedInquiry = { ...inquiries[inquiryIndex], ...req.body, updatedAt: new Date().toISOString() };
    inquiries[inquiryIndex] = updatedInquiry;

    res.status(200).json({
      success: true,
      message: `Inquiry with ID ${id} updated successfully.`,
      data: updatedInquiry
    });
  }
);

// DELETE - Delete an inquiry (Admin only in a real app)
app.delete('/api/inquiries/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = inquiries.length;
  inquiries = inquiries.filter(q => q.id !== parseInt(id));

  if (inquiries.length === initialLength) {
    return sendErrorResponse(res, 404, `Inquiry with ID ${id} not found.`);
  }

  res.status(204).send(); // 204 No Content for successful deletion
});

// --- General Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  sendErrorResponse(res, 500, 'Something went wrong on the server.');
});

// Catch-all for undefined routes
app.use((req, res) => {
  sendErrorResponse(res, 404, `Cannot ${req.method} ${req.originalUrl}. Route not found.`);
});

// --- Start the Server ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend URL allowed: ${corsOptions.origin}`);
});