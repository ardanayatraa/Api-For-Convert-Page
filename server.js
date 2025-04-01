const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const PORT =  3000;

app.use(cors());

app.get('/screenshot', async (req, res) => {
    let browser;
    try {
        const { url, width = 720, height = 1280, format = 'png' } = req.query;

        if (!url || !url.startsWith('http')) {
            return res.status(400).json({ error: 'Valid URL is required' });
        }

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: parseInt(width, 10), height: parseInt(height, 10) });
        await page.goto(url, { waitUntil: 'networkidle2' });

        const screenshot = await page.screenshot({ type: format, fullPage: true });

        res.setHeader('Content-Type', `image/${format}`);
        res.send(screenshot);
    } catch (error) {
        res.status(500).json({ error: 'Failed to capture screenshot', details: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
