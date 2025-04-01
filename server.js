const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT = 3000;

app.use(cors());

app.get('/screenshot', async (req, res) => {
    const { url, width = 720, height = 1280, format = 'png' } = req.query;

    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.setViewport({ width: parseInt(width), height: parseInt(height) });
        await page.goto(url, { waitUntil: 'networkidle2' });

        const screenshot = await page.screenshot({ type: format, fullPage: true });
        await browser.close();

        res.setHeader('Content-Type', `image/${format}`);
        res.send(screenshot);
    } catch (error) {
        res.status(500).json({ error: 'Failed to capture screenshot', details: error.message });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
