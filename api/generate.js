// Vercel serverless function — proxies Anthropic API server-to-server

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { key, prompt } = req.body || {};
  if (!key) return res.status(400).json({ error: { type: "no_key", message: "No API key provided" } });

  // Log first 12 chars of key so we can verify it's arriving correctly
  console.log("key prefix:", key.slice(0, 12), "prompt length:", prompt?.length);

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key.trim(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await upstream.json();
    console.log("Anthropic status:", upstream.status, "error:", data?.error?.type);
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: { type: "proxy_error", message: err.message } });
  }
}
