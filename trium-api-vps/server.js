#!/usr/bin/env node
/**
 * API Trium - Scraping des ventes via Puppeteer connecté à Browserless
 * POST /scrape avec { triumUser1, triumPass1, triumUser2, triumPass2 }
 * Réponse: { events: [...] }
 */
import express from 'express';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

const BROWSERLESS_WS = process.env.BROWSERLESS_WS || 'wss://browserless.lcoproduction.fr?token=TriumBrowser2025';
const PORT = process.env.PORT || 3100;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

app.post('/scrape', async (req, res) => {
    // VÉRIFICATION : créer un fichier immédiatement pour confirmer que le serveur est appelé
    const debugDir = path.join(__dirname);
    try {
        fs.writeFileSync(path.join(debugDir, 'debug-scrape-called.txt'), `Requête reçue à ${new Date().toISOString()}\n`, 'utf8');
        console.log('[/scrape] Requête reçue à', new Date().toISOString());
    } catch (e) {
        console.error('[/scrape] Erreur écriture debug-scrape-called:', e.message);
    }

    const { triumUser1, triumPass1, triumUser2, triumPass2 } = req.body;
    if (!triumUser2 || !triumPass2) {
        return res.status(400).json({ events: [], error: 'Credentials manquants' });
    }

    let browser;
    try {
        browser = await puppeteer.connect({
            browserWSEndpoint: BROWSERLESS_WS,
            defaultViewport: { width: 1280, height: 800 }
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        await page.goto('https://stats.trium.fr/auth/');
        await delay(2000);

        await page.type('input[name="uid"]', triumUser1 || 'ticketnet');
        await delay(500);
        await page.evaluate(() => {
            const form = document.querySelector('form');
            if (form) form.submit();
        });
        await delay(3000);

        await page.type('input[name="pswd"]', triumPass1 || '');
        await delay(500);
        await page.evaluate(() => {
            const form = document.querySelector('form');
            if (form) form.submit();
        });
        await delay(3000);

        await page.goto('https://stats.trium.fr/auth/xvpns.html');
        await delay(6000);

        await page.evaluate((u2, p2) => {
            const userEl = document.querySelector('#LoginBilletterie_UserName');
            const passEl = document.querySelector('#LoginBilletterie_Password');
            if (userEl) userEl.value = u2;
            if (passEl) passEl.value = p2;
        }, triumUser2, triumPass2);
        await delay(500);

        await page.evaluate(() => {
            if (typeof __doPostBack === 'function') {
                __doPostBack('LoginBilletterie$btnLogin', '');
            }
        });
        await delay(10000);

        // Attendre le tableau si présent (max 30 s)
        try {
            await page.waitForSelector('table', { timeout: 30000 });
            await delay(2000);
        } catch (e) {
            console.log('[DEBUG] Aucun tableau trouvé après 30s:', e.message);
        }

        // DEBUG: sauvegarder HTML et capture pour diagnostic
        const debugDir = path.join(__dirname);
        const html = await page.content();
        const pageUrl = page.url();
        fs.writeFileSync(path.join(debugDir, 'debug-trium.html'), html, 'utf8');
        await page.screenshot({ path: path.join(debugDir, 'debug-trium.png') });
        console.log('[DEBUG] Fichiers sauvegardés dans', debugDir, '| URL page:', pageUrl);

        const data = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tr');
            const events = [];
            const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
            let debugStats = { totalRows: rows.length, rowsWith9Cells: 0, rowsWithValidDate: 0, sampleCells: [] };
            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 9) {
                    debugStats.rowsWith9Cells++;
                    const dateDebut = cells[1].innerText.trim();
                    if (dateRegex.test(dateDebut)) {
                        debugStats.rowsWithValidDate++;
                        if (debugStats.sampleCells.length === 0) {
                            debugStats.sampleCells = [...cells].slice(0, 9).map(c => c.innerText.trim());
                        }
                        events.push({
                            manifestation: cells[0].innerText.trim(),
                            dateDebut,
                            lieu: cells[3].innerText.trim(),
                            ville: cells[4].innerText.trim(),
                            vendu: parseInt(cells[5].innerText.trim()) || 0,
                            ca: parseFloat(cells[8].innerText.trim().replace(',', '.')) || 0
                        });
                    }
                }
            });
            return { events, _debug: debugStats };
        });

        // Sauvegarder les stats de debug
        const debugInfo = {
            pageUrl,
            eventsCount: data.events?.length ?? data.length ?? 0,
            stats: data._debug || {},
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync(path.join(debugDir, 'debug-trium-info.json'), JSON.stringify(debugInfo, null, 2), 'utf8');
        console.log('[DEBUG]', JSON.stringify(debugInfo, null, 2));

        const events = Array.isArray(data.events) ? data.events : data;
        res.json({ events });
    } catch (err) {
        res.status(500).json({ events: [], error: err.message });
    } finally {
        if (browser) await browser.disconnect();
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'trium-api' });
});

// Pour tester si le serveur est joignable : GET /debug-ping → crée debug-ping.txt
app.get('/debug-ping', (req, res) => {
    const debugDir = path.join(__dirname);
    try {
        fs.writeFileSync(path.join(debugDir, 'debug-ping.txt'), `Ping à ${new Date().toISOString()}\n`, 'utf8');
        console.log('[/debug-ping] Requête reçue');
        res.json({ ok: true, message: 'Fichier debug-ping.txt créé', dir: debugDir });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Trium API running on port ${PORT}`);
});
