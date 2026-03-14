// Vercel serverless function — proxies Anthropic API calls server-side
// Avoids all browser CORS / dangerous-header restrictions

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { key, prompt } = req.body;
  if (!key) return res.status(400).json({ error: { type: "no_key", message: "No API key provided" } });

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: { type: "proxy_error", message: err.message } });
  }
}
