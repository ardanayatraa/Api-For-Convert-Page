const express = require("express")
const puppeteer = require("puppeteer")
const cors = require("cors")
const dotenv = require("dotenv")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const rateLimit = require("express-rate-limit")
const swaggerJsdoc = require("swagger-jsdoc")
const swaggerUi = require("swagger-ui-express")
const path = require("path")
const fs = require("fs").promises
const { v4: uuidv4 } = require("uuid")

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3020
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this"

// In-memory storage (replace with database in production)
const users = []
const screenshots = []

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static("public"))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." },
})
app.use("/api/", limiter)

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Screenshot Service API",
      version: "1.0.0",
      description: "A powerful multi-user screenshot service API",
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./server.js"], // Path to the API docs
}

const specs = swaggerJsdoc(swaggerOptions)
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs))

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ error: "Access token required" })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" })
    }
    req.user = user
    next()
  })
}

/**
 * @swagger
 * /api/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: User already exists or invalid data
 */
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" })
    }

    // Check if user exists
    const existingUser = users.find((u) => u.email === email || u.username === username)
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const user = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      screenshotCount: 0,
    }

    users.push(user)

    // Generate token
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "24h" })

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: { id: user.id, username: user.username, email: user.email },
    })
  } catch (error) {
    res.status(500).json({ error: "Registration failed", details: error.message })
  }
})

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" })
    }

    // Find user
    const user = users.find((u) => u.email === email)
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    // Generate token
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "24h" })

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, username: user.username, email: user.email },
    })
  } catch (error) {
    res.status(500).json({ error: "Login failed", details: error.message })
  }
})

/**
 * @swagger
 * /api/screenshot:
 *   post:
 *     summary: Capture a screenshot
 *     tags: [Screenshots]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: URL to capture
 *               width:
 *                 type: integer
 *                 default: 1920
 *               height:
 *                 type: integer
 *                 default: 1080
 *               format:
 *                 type: string
 *                 enum: [png, jpeg]
 *                 default: png
 *               fullPage:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Screenshot captured successfully
 *       400:
 *         description: Invalid URL
 *       401:
 *         description: Unauthorized
 */
app.post("/api/screenshot", authenticateToken, async (req, res) => {
  let browser
  try {
    const { url, width = 1920, height = 1080, format = "png", fullPage = true } = req.body

    console.log(`User ${req.user.username} requesting screenshot for: ${url}`)

    if (!url || !url.startsWith("http")) {
      return res.status(400).json({ error: "Valid URL is required" })
    }

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    })

    const page = await browser.newPage()
    await page.setViewport({ width: Number.parseInt(width, 10), height: Number.parseInt(height, 10) })

    // Set user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    )

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 })

    const screenshot = await page.screenshot({
      type: format,
      fullPage: fullPage,
      quality: format === "jpeg" ? 90 : undefined,
    })

    // Save screenshot record
    const screenshotRecord = {
      id: uuidv4(),
      userId: req.user.id,
      url,
      width,
      height,
      format,
      fullPage,
      createdAt: new Date().toISOString(),
      size: screenshot.length,
    }

    screenshots.push(screenshotRecord)

    // Update user screenshot count
    const user = users.find((u) => u.id === req.user.id)
    if (user) {
      user.screenshotCount++
    }

    res.setHeader("Content-Type", `image/${format}`)
    res.setHeader("X-Screenshot-ID", screenshotRecord.id)
    res.send(screenshot)
  } catch (error) {
    console.error("Screenshot error:", error)
    res.status(500).json({ error: "Failed to capture screenshot", details: error.message })
  } finally {
    if (browser) await browser.close()
  }
})

/**
 * @swagger
 * /api/screenshots:
 *   get:
 *     summary: Get user's screenshot history
 *     tags: [Screenshots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of screenshots to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of screenshots to skip
 *     responses:
 *       200:
 *         description: Screenshot history retrieved successfully
 */
app.get("/api/screenshots", authenticateToken, (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query

    const userScreenshots = screenshots
      .filter((s) => s.userId === req.user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(Number.parseInt(offset), Number.parseInt(offset) + Number.parseInt(limit))

    const total = screenshots.filter((s) => s.userId === req.user.id).length

    res.json({
      screenshots: userScreenshots,
      total,
      limit: Number.parseInt(limit),
      offset: Number.parseInt(offset),
    })
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve screenshots", details: error.message })
  }
})

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 */
app.get("/api/profile", authenticateToken, (req, res) => {
  try {
    const user = users.find((u) => u.id === req.user.id)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      screenshotCount: user.screenshotCount,
      createdAt: user.createdAt,
    })
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve profile", details: error.message })
  }
})

// Serve the main application
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`🚀 Screenshot Service running on http://localhost:${PORT}`)
  console.log(`📚 API Documentation available at http://localhost:${PORT}/api-docs`)
})
