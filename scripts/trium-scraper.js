#!/usr/bin/env node
/**
 * Script Trium - Scraping des ventes via Puppeteer
 * Usage: node triump-scraper.js user1 pass1 user2 pass2
 * Sortie: JSON { events: [...] } sur stdout
 */
const puppeteer = require('puppeteer');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const [triumUser1, triumPass1, triumUser2, triumPass2] = process.argv.slice(2);
    if (!triumUser2 || !triumPass2) {
        console.log(JSON.stringify({ events: [], error: 'Credentials manquants' }));
        process.exit(0);
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        await page.setViewport({ width: 1280, height: 800 });

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

        const data = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tr');
            const events = [];
            const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 9) {
                    const dateDebut = cells[1].innerText.trim();
                    if (dateRegex.test(dateDebut)) {
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
            return events;
        });

        console.log(JSON.stringify({ events: data }));
    } catch (err) {
        console.log(JSON.stringify({ events: [], error: err.message }));
    } finally {
        if (browser) await browser.close();
    }
}

main();
