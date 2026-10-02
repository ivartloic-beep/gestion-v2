import express from "express";
import puppeteer from "puppeteer-core";

const app = express();
const PORT = process.env.PORT || 3101;
const BROWSERLESS_WS = process.env.BROWSERLESS_WS;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "eventim-api" });
});

app.post("/scrape", async (req, res) => {
  const { eventimEmail, eventimPassword } = req.body || {};

  if (!eventimEmail || !eventimPassword) {
    return res.status(400).json({
      events: [],
      error: "eventimEmail et eventimPassword sont requis",
    });
  }

  if (!BROWSERLESS_WS) {
    return res.status(500).json({
      events: [],
      error: "BROWSERLESS_WS est manquant",
    });
  }

  let browser;
  let page;

  try {
    console.log("[EVENTIM] Connexion a Browserless...");
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    console.log("[EVENTIM] Etape 1 - Login...");
    await page.goto("https://www.eventim-light.com/fr/login", {
      waitUntil: "networkidle2",
    });
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
    await page.waitForSelector('input[type="password"]', { timeout: 30000 });

    await page.evaluate(
      ({ email, password }) => {
        const emailInput = document.querySelector('input[type="email"]');
        const passwordInput = document.querySelector('input[type="password"]');
        if (!emailInput || !passwordInput) {
          throw new Error("Formulaire de connexion introuvable");
        }

        const dispatchReactEvents = (el, value) => {
          el.focus();
          el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };

        dispatchReactEvents(emailInput, email);
        dispatchReactEvents(passwordInput, password);
      },
      { email: eventimEmail, password: eventimPassword }
    );

    const loginButtonSelector =
      'button[type="submit"], button[data-testid="login-button"]';
    await page.waitForSelector(loginButtonSelector, { timeout: 30000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
      page.click(loginButtonSelector),
    ]);
    await delay(2000);

    console.log("[EVENTIM] Etape 2 - Chargement de la liste des evenements...");
    await page.goto("https://www.eventim-light.com/fr/events", {
      waitUntil: "networkidle2",
    });
    await delay(1500);

    const eventLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const urls = anchors
        .map((a) => a.href)
        .filter((href) => {
          return (
            href.includes("/events/") &&
            !href.includes("/edit") &&
            !href.includes("/tickets")
          );
        });
      return [...new Set(urls)];
    });

    console.log(`[EVENTIM] ${eventLinks.length} evenement(s) trouve(s).`);

    if (eventLinks.length === 0) {
      return res.json({ events: [] });
    }

    const events = [];

    for (const eventUrl of eventLinks) {
      console.log(`[EVENTIM] Etape 3 - Navigation evenement: ${eventUrl}`);
      await page.goto(eventUrl, { waitUntil: "networkidle2" });
      await delay(1000);

      const eventData = await page.evaluate(() => {
        const text = (el) => (el?.textContent || "").trim();
        const normalize = (s) => s.replace(/\s+/g, " ").trim();
        const dateMatch = document.body.innerText.match(/\b\d{2}\/\d{2}\/\d{4}\b/);

        const titleCandidates = [
          "h1",
          '[data-testid="event-title"]',
          ".event-title",
        ];
        let manifestation = "";
        for (const selector of titleCandidates) {
          const candidate = document.querySelector(selector);
          if (candidate && text(candidate)) {
            manifestation = normalize(text(candidate));
            break;
          }
        }

        const infoBlocks = Array.from(
          document.querySelectorAll("p, span, div, li")
        ).map((el) => normalize(text(el)));

        const dateDebut = dateMatch ? dateMatch[0] : "";

        const villeCandidate = infoBlocks.find((line) =>
          /\b[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ' -]{1,}\b/.test(line)
        );

        const placeSelectors = [
          '[data-testid="venue-name"]',
          ".venue-name",
          ".location-name",
        ];
        let lieu = "";
        for (const selector of placeSelectors) {
          const candidate = document.querySelector(selector);
          if (candidate && text(candidate)) {
            lieu = normalize(text(candidate));
            break;
          }
        }

        if (!lieu) {
          const fallbackLieu = infoBlocks.find(
            (line) => line && line.length > 2 && !line.includes("/") && line !== manifestation
          );
          lieu = fallbackLieu || "";
        }

        const citySelectors = [
          '[data-testid="venue-city"]',
          ".venue-city",
          ".location-city",
        ];
        let ville = "";
        for (const selector of citySelectors) {
          const candidate = document.querySelector(selector);
          if (candidate && text(candidate)) {
            ville = normalize(text(candidate));
            break;
          }
        }
        if (!ville) {
          ville = villeCandidate || "";
        }

        return {
          manifestation,
          dateDebut,
          lieu,
          ville,
        };
      });

      console.log("[EVENTIM] Etape 4 - Extraction du tableau de vente...");

      const salesData = await page.evaluate(() => {
        const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
        const tables = Array.from(document.querySelectorAll("table"));

        for (const table of tables) {
          const headers = Array.from(table.querySelectorAll("thead th, th")).map((th) =>
            normalize(th.textContent || "").toLowerCase()
          );

          const totalIndex = headers.findIndex((h) => h === "total");
          const recettesIndex = headers.findIndex((h) => h.includes("recette"));
          if (totalIndex === -1 || recettesIndex === -1) {
            continue;
          }

          const rows = Array.from(table.querySelectorAll("tbody tr, tr"));
          const totalRow =
            rows.find((row) => {
              const firstCell = normalize(
                row.querySelector("td, th")?.textContent || ""
              ).toLowerCase();
              return firstCell === "total";
            }) || rows[rows.length - 1];

          if (!totalRow) {
            continue;
          }

          const cells = Array.from(totalRow.querySelectorAll("td, th")).map((cell) =>
            normalize(cell.textContent || "")
          );
          const venduRaw = cells[totalIndex] || "0";
          const caRaw = cells[recettesIndex] || "0";

          const vendu = parseInt(venduRaw.replace(/[^\d-]/g, ""), 10) || 0;
          const ca = Number.parseFloat(
            caRaw.replace(/[^\d,.-]/g, "").replace(",", ".")
          );

          return {
            vendu,
            ca: Number.isFinite(ca) ? ca : 0,
          };
        }

        return { vendu: 0, ca: 0 };
      });

      const normalizedEvent = {
        manifestation: eventData.manifestation || "",
        dateDebut: eventData.dateDebut || "",
        lieu: eventData.lieu || "",
        ville: eventData.ville || "",
        vendu: salesData.vendu ?? 0,
        ca: salesData.ca ?? 0,
      };

      console.log("[EVENTIM] Evenement extrait:", normalizedEvent);
      events.push(normalizedEvent);
    }

    return res.json({ events });
  } catch (error) {
    console.error("[EVENTIM] Erreur scrape:", error);
    return res.status(500).json({
      events: [],
      error: error?.message || "Erreur inconnue",
    });
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (_error) {
        // ignore
      }
    }
    if (browser) {
      try {
        browser.disconnect();
      } catch (_error) {
        // ignore
      }
    }
  }
});

app.listen(PORT, () => {
  console.log(`[EVENTIM] API demarree sur le port ${PORT}`);
});
