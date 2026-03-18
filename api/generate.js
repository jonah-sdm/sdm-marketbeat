// Vercel serverless function — proxies Anthropic API using server-side key
// Client sends only the prompt; key never touches the browser.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: { type: "no_key", message: "ANTHROPIC_API_KEY not set in Vercel environment variables" } });
  }

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: { type: "no_prompt", message: "No prompt provided" } });

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(55000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key.trim(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: { type: "proxy_error", message: err.message } });
  }
}
