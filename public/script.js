// Global state
let currentUser = null
let authToken = localStorage.getItem("authToken")
let isLoginMode = true

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  initializeApp()
  setupEventListeners()
})

function initializeApp() {
  if (authToken) {
    validateToken()
  }
  showSection("home")
}

function setupEventListeners() {
  // Screenshot form
  document.getElementById("screenshotForm").addEventListener("submit", handleScreenshot)

  // Auth form
  document.getElementById("authForm").addEventListener("submit", handleAuth)

  // Modal close
  window.addEventListener("click", (event) => {
    const modal = document.getElementById("authModal")
    if (event.target === modal) {
      closeModal()
    }
  })
}

// Navigation functions
function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll(".section").forEach((section) => {
    section.classList.remove("active")
  })

  // Show selected section
  document.getElementById(sectionName + "Section").classList.add("active")

  // Load data for dashboard
  if (sectionName === "dashboard" && authToken) {
    loadUserProfile()
    loadScreenshots()
  }
}

function toggleNav() {
  const navMenu = document.getElementById("navMenu")
  navMenu.classList.toggle("active")
}

// Authentication functions
async function validateToken() {
  try {
    const response = await fetch("/api/profile", {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    if (response.ok) {
      const userData = await response.json()
      setAuthenticatedState(userData)
    } else {
      logout()
    }
  } catch (error) {
    console.error("Token validation failed:", error)
    logout()
  }
}

function setAuthenticatedState(userData) {
  currentUser = userData
  document.getElementById("navAuth").style.display = "none"
  document.getElementById("navUser").style.display = "flex"
  document.getElementById("dashboardLink").style.display = "block"
  document.getElementById("userName").textContent = userData.username
}

function showLogin() {
  isLoginMode = true
  updateAuthModal()
  document.getElementById("authModal").style.display = "block"
}

function showRegister() {
  isLoginMode = false
  updateAuthModal()
  document.getElementById("authModal").style.display = "block"
}

function updateAuthModal() {
  const title = document.getElementById("authTitle")
  const submitBtn = document.getElementById("authSubmit")
  const switchText = document.getElementById("authSwitchText")
  const registerFields = document.getElementById("registerFields")

  if (isLoginMode) {
    title.textContent = "Login"
    submitBtn.textContent = "Login"
    switchText.innerHTML = 'Don\'t have an account? <a href="#" onclick="toggleAuthMode()">Sign up</a>'
    registerFields.style.display = "none"
  } else {
    title.textContent = "Sign Up"
    submitBtn.textContent = "Sign Up"
    switchText.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthMode()">Login</a>'
    registerFields.style.display = "block"
  }
}

function toggleAuthMode() {
  isLoginMode = !isLoginMode
  updateAuthModal()
  document.getElementById("authForm").reset()
}

function closeModal() {
  document.getElementById("authModal").style.display = "none"
  document.getElementById("authForm").reset()
}

async function handleAuth(event) {
  event.preventDefault()

  const email = document.getElementById("email").value
  const password = document.getElementById("password").value
  const username = document.getElementById("username").value

  const endpoint = isLoginMode ? "/api/login" : "/api/register"
  const payload = isLoginMode ? { email, password } : { username, email, password }

  try {
    showLoading("Authenticating...")

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (response.ok) {
      authToken = data.token
      localStorage.setItem("authToken", authToken)
      setAuthenticatedState(data.user)
      closeModal()
      showAlert("success", isLoginMode ? "Login successful!" : "Registration successful!")
      showSection("dashboard")
    } else {
      showAlert("error", data.error || "Authentication failed")
    }
  } catch (error) {
    console.error("Auth error:", error)
    showAlert("error", "Network error. Please try again.")
  } finally {
    hideLoading()
  }
}

function logout() {
  authToken = null
  currentUser = null
  localStorage.removeItem("authToken")

  document.getElementById("navAuth").style.display = "flex"
  document.getElementById("navUser").style.display = "none"
  document.getElementById("dashboardLink").style.display = "none"

  showSection("home")
  showAlert("success", "Logged out successfully")
}

// Screenshot functions
async function handleScreenshot(event) {
  event.preventDefault()

  if (!authToken) {
    showAlert("error", "Please login to capture screenshots")
    showLogin()
    return
  }

  const url = document.getElementById("url").value
  const width = document.getElementById("width").value
  const height = document.getElementById("height").value
  const format = document.getElementById("format").value
  const fullPage = document.getElementById("fullPage").checked

  try {
    showLoading("Capturing screenshot...")

    const response = await fetch("/api/screenshot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ url, width, height, format, fullPage }),
    })

    if (response.ok) {
      const blob = await response.blob()
      const imageUrl = URL.createObjectURL(blob)
      const screenshotId = response.headers.get("X-Screenshot-ID")

      displayScreenshot(imageUrl, { url, width, height, format, fullPage, id: screenshotId })
      loadScreenshots() // Refresh history
      loadUserProfile() // Update stats
      showAlert("success", "Screenshot captured successfully!")
    } else {
      const error = await response.json()
      showAlert("error", error.error || "Failed to capture screenshot")
    }
  } catch (error) {
    console.error("Screenshot error:", error)
    showAlert("error", "Network error. Please try again.")
  } finally {
    hideLoading()
  }
}

function displayScreenshot(imageUrl, metadata) {
  const resultDiv = document.getElementById("screenshotResult")
  const displayDiv = document.getElementById("screenshotDisplay")

  displayDiv.innerHTML = `
        <div class="screenshot-display">
            <img src="${imageUrl}" alt="Screenshot" />
            <div class="screenshot-info">
                <div class="info-item">
                    <span class="info-label">URL:</span>
                    <span class="info-value">${metadata.url}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Dimensions:</span>
                    <span class="info-value">${metadata.width}x${metadata.height}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Format:</span>
                    <span class="info-value">${metadata.format.toUpperCase()}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Full Page:</span>
                    <span class="info-value">${metadata.fullPage ? "Yes" : "No"}</span>
                </div>
            </div>
            <div style="margin-top: 1rem;">
                <button class="btn btn-primary" onclick="downloadScreenshot('${imageUrl}', '${metadata.url}', '${metadata.format}')">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        </div>
    `

  resultDiv.style.display = "block"
  resultDiv.scrollIntoView({ behavior: "smooth" })
}

function downloadScreenshot(imageUrl, originalUrl, format) {
  const link = document.createElement("a")
  link.href = imageUrl
  link.download = `screenshot-${new Date().getTime()}.${format}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// User profile and history
async function loadUserProfile() {
  try {
    const response = await fetch("/api/profile", {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    if (response.ok) {
      const userData = await response.json()
      document.getElementById("totalScreenshots").textContent = userData.screenshotCount || 0
    }
  } catch (error) {
    console.error("Failed to load profile:", error)
  }
}

async function loadScreenshots() {
  try {
    const response = await fetch("/api/screenshots?limit=20", {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    if (response.ok) {
      const data = await response.json()
      displayScreenshotHistory(data.screenshots)
    } else {
      document.getElementById("screenshotHistory").innerHTML = '<div class="loading">Failed to load screenshots</div>'
    }
  } catch (error) {
    console.error("Failed to load screenshots:", error)
    document.getElementById("screenshotHistory").innerHTML = '<div class="loading">Failed to load screenshots</div>'
  }
}

function displayScreenshotHistory(screenshots) {
  const historyDiv = document.getElementById("screenshotHistory")

  if (screenshots.length === 0) {
    historyDiv.innerHTML = '<div class="loading">No screenshots yet. Capture your first screenshot above!</div>'
    return
  }

  const historyHTML = screenshots
    .map(
      (screenshot) => `
        <div class="history-item fade-in">
            <div class="history-header">
                <a href="${screenshot.url}" target="_blank" class="history-url">${screenshot.url}</a>
                <span class="history-date">${formatDate(screenshot.createdAt)}</span>
            </div>
            <div class="history-details">
                <span>${screenshot.width}x${screenshot.height}</span>
                <span>${screenshot.format.toUpperCase()}</span>
                <span>${formatFileSize(screenshot.size)}</span>
                <span>${screenshot.fullPage ? "Full Page" : "Viewport"}</span>
            </div>
        </div>
    `,
    )
    .join("")

  historyDiv.innerHTML = `<div class="history-grid">${historyHTML}</div>`
}

// Utility functions
function showLoading(message = "Loading...") {
  const overlay = document.getElementById("loadingOverlay")
  overlay.querySelector("p").textContent = message
  overlay.style.display = "flex"
}

function hideLoading() {
  document.getElementById("loadingOverlay").style.display = "none"
}

function showAlert(type, message) {
  // Remove existing alerts
  document.querySelectorAll(".alert").forEach((alert) => alert.remove())

  const alert = document.createElement("div")
  alert.className = `alert alert-${type}`
  alert.textContent = message

  // Insert at the top of the current section
  const activeSection = document.querySelector(".section.active")
  const container = activeSection.querySelector(".container") || activeSection
  container.insertBefore(alert, container.firstChild)

  // Auto remove after 5 seconds
  setTimeout(() => {
    alert.remove()
  }, 5000)
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString() + " " + date.toLocaleTimeString()
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function showDemo() {
  if (!authToken) {
    showAlert("warning", "Please sign up to try the demo")
    showRegister()
    return
  }

  // Pre-fill demo data
  document.getElementById("url").value = "https://example.com"
  document.getElementById("width").value = "1920"
  document.getElementById("height").value = "1080"
  document.getElementById("format").value = "png"
  document.getElementById("fullPage").checked = true

  showSection("dashboard")
  showAlert("success", 'Demo data loaded! Click "Capture Screenshot" to try it out.')
}
