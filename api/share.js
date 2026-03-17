export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const token = process.env.GH_REPORTS_TOKEN;
  if (!token) return res.status(500).json({ error: "GH_REPORTS_TOKEN not configured" });

  const { html, date } = req.body || {};
  if (!html || !date) return res.status(400).json({ error: "Missing html or date" });

  const filename = `marketbeat-${date}.html`;
  const encoded = Buffer.from(html).toString("base64");

  // Check if file exists to get SHA for update
  let sha;
  try {
    const check = await fetch(
      `https://api.github.com/repos/jonah-sdm/sdm-reports/contents/${filename}`,
      { headers: { Authorization: `token ${token}`, "User-Agent": "sdm-marketbeat" } }
    );
    if (check.ok) { const j = await check.json(); sha = j.sha; }
  } catch {}

  const resp = await fetch(
    `https://api.github.com/repos/jonah-sdm/sdm-reports/contents/${filename}`,
    {
      method: "PUT",
      headers: { Authorization: `token ${token}`, "Content-Type": "application/json", "User-Agent": "sdm-marketbeat" },
      body: JSON.stringify({ message: `MarketBeat ${date}`, content: encoded, ...(sha ? { sha } : {}) }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    return res.status(500).json({ error: err });
  }

  const url = `https://htmlpreview.github.io/?https://raw.githubusercontent.com/jonah-sdm/sdm-reports/main/${filename}`;
  return res.status(200).json({ url });
}
