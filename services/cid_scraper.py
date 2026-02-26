import asyncio
import json
import logging
import re
import shutil
import time
from pathlib import Path
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

CID_URL = "https://ised-isde.canada.ca/app/ixb/cid-bdic/importingCountryResults.html"


def get_country_list():
    return [
        "Afghanistan", "Albania", "Algeria", "Argentina", "Australia",
        "Austria", "Bangladesh", "Belgium", "Brazil", "Cambodia",
        "Cameroon", "Chile", "China", "Colombia", "Costa Rica",
        "Czech Republic", "Denmark", "Ecuador", "Egypt", "El Salvador",
        "Ethiopia", "Finland", "France (incl. Monaco, French Antilles)",
        "Germany", "Ghana", "Greece", "Guatemala", "Honduras",
        "Hong Kong", "Hungary", "India", "Indonesia", "Iran", "Iraq",
        "Ireland", "Israel", "Italy (incl. Vatican City State)",
        "Jamaica", "Japan", "Jordan", "Kenya", "Korea, South",
        "Kuwait", "Malaysia", "Mexico", "Morocco", "Netherlands",
        "New Zealand", "Nigeria", "Norway", "Pakistan", "Panama",
        "Peru", "Philippines", "Poland", "Portugal", "Romania",
        "Russia", "Saudi Arabia", "Singapore", "South Africa", "Spain",
        "Sri Lanka", "Sweden", "Switzerland", "Taiwan", "Thailand",
        "Tunisia", "Turkey", "Ukraine", "United Arab Emirates",
        "United Kingdom", "United States", "Uruguay", "Venezuela",
        "Vietnam", "Zimbabwe"
    ]


async def scrape_cid_by_country(country, max_companies=None,
                                  progress_callback=None):
    companies = []
    chromium_path = shutil.which("chromium") or shutil.which("chromium-browser")

    async with async_playwright() as p:
        launch_kwargs = {
            "headless": True,
            "args": ["--no-sandbox", "--disable-dev-shm-usage",
                     "--disable-gpu"],
        }
        if chromium_path:
            launch_kwargs["executable_path"] = chromium_path

        browser = await p.chromium.launch(**launch_kwargs)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            viewport={"width": 1920, "height": 1080},
            locale="en-CA",
            timezone_id="America/Toronto",
        )
        page = await context.new_page()
        await page.add_init_script(
            'Object.defineProperty(navigator, "webdriver", { get: () => false });'
        )

        try:
            if progress_callback:
                progress_callback("Loading ISED Canadian Importers Database...")

            await page.goto(CID_URL, wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(3000)

            select_el = page.locator("select").first
            if await select_el.count() == 0:
                raise Exception("Could not find country dropdown on page")

            if progress_callback:
                progress_callback(f"Selecting country: {country}...")

            options = await select_el.locator("option").all()
            target_value = None
            for opt in options:
                text = (await opt.text_content() or "").strip()
                if text.lower() == country.lower():
                    target_value = await opt.get_attribute("value")
                    break

            if target_value is None:
                for opt in options:
                    text = (await opt.text_content() or "").strip()
                    if country.lower() in text.lower():
                        target_value = await opt.get_attribute("value")
                        break

            if target_value is None:
                raise Exception(f"Country '{country}' not found in dropdown")

            await select_el.select_option(value=target_value)
            await page.wait_for_timeout(500)

            submit_btn = page.locator("button[type='submit']")
            if await submit_btn.count() > 0:
                await submit_btn.click()
            else:
                raise Exception("Could not find submit button")

            if progress_callback:
                progress_callback("Waiting for results to load...")

            await page.wait_for_timeout(10000)

            show_entries = page.locator("select")
            selects = await show_entries.all()
            for sel in selects:
                opts = await sel.locator("option").all_text_contents()
                if "100" in opts:
                    await sel.select_option(value="100")
                    await page.wait_for_timeout(3000)
                    break

            page_num = 1
            while True:
                if progress_callback:
                    progress_callback(
                        f"Scraping page {page_num}... "
                        f"({len(companies)} companies found so far)"
                    )

                rows = page.locator("#wb-auto-5 tbody tr, table tbody tr")
                row_count = await rows.count()

                if row_count == 0:
                    break

                for i in range(row_count):
                    row = rows.nth(i)
                    cells = row.locator("td")
                    cell_count = await cells.count()
                    if cell_count < 2:
                        continue
                    cell_texts = []
                    for j in range(cell_count):
                        text = (await cells.nth(j).text_content() or "").strip()
                        cell_texts.append(text)
                    company = {
                        "source": "ISED_CID",
                        "country_of_origin_selected": country,
                        "cid_company_name": cell_texts[0] if len(cell_texts) > 0 else "",
                        "cid_city": cell_texts[1] if len(cell_texts) > 1 else "",
                        "cid_province": cell_texts[2] if len(cell_texts) > 2 else "",
                        "cid_postal_code": cell_texts[3] if len(cell_texts) > 3 else "",
                        "cid_business_number": cell_texts[4] if len(cell_texts) > 4 else None,
                        "cid_products": cell_texts[5] if len(cell_texts) > 5 else "",
                        "cid_page_url": CID_URL,
                    }
                    if company["cid_company_name"]:
                        companies.append(company)

                if max_companies and len(companies) >= max_companies:
                    companies = companies[:max_companies]
                    break

                next_btn = page.locator("a:has-text('Next')")
                if await next_btn.count() > 0:
                    is_visible = await next_btn.first.is_visible()
                    parent_class = await next_btn.first.evaluate(
                        "el => el.parentElement ? el.parentElement.className : ''"
                    )
                    if is_visible and "disabled" not in parent_class:
                        await next_btn.first.click()
                        await page.wait_for_timeout(2000)
                        page_num += 1
                    else:
                        break
                else:
                    break

        except Exception as e:
            logger.error(f"Error scraping CID: {e}")
            raise
        finally:
            await browser.close()

    return companies
