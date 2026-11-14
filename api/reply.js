async function claude(system, user, maxTokens) {
  const model = "openai/gpt-4o-mini"; // openrouter.ai/models se apna model ka naam copy karo
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
    },
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error("OpenRouter error " + r.status);
  const d = await r.json();
  return d.choices[0].message.content.trim();
}

const ANALYZE = `You are an emotionally intelligent dating-chat coach. A guy pasted a message or chat from a girl he is talking to on a dating app.
Read it carefully and return ONLY JSON (no markdown) with these keys:
{"mood":"her emotional mood right now","interest":"low|medium|high and why in a few words","stage":"new match|getting to know|flirty|planning meetup|dying chat","her_style":"how she texts: length, humour, emojis","language":"exact language/style she writes in, e.g. Hinglish in Roman script, English","hidden_meaning":"what she is really hinting or asking","best_move":"what a confident, genuine guy would do next","avoid":"what would sound cringe or try-hard here"}`;

const WRITE = `You write dating-app replies that sound like a real, confident, relaxed guy texting, not an AI.
You get her message and an analysis. Do this silently:
1. Draft a reply that fits the mood and the best_move.
2. Check it against this list and rewrite if it fails: cringe pickup line, cliche, too long (max 1-3 short lines), too eager or needy, generic (could be sent to anyone), sounds formal or like a robot, more than one emoji, overly perfect punctuation for a casual chat, pushy or manipulative.
3. Match her language and texting style exactly (if Hinglish in Roman script, write natural Hinglish, not textbook Hindi).
Return ONLY the final reply text. No quotes, no explanation.`;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const message = String(body.message || "").trim().slice(0, 2000);
    const last = String(body.last || "").slice(0, 500);
    if (!message) return res.status(400).json({ error: "Message khali hai" });

    const analysis = await claude(ANALYZE, "Her message / chat:\n" + message, 500);
    const reply = await claude(
      WRITE,
      "Her message / chat:\n" + message + "\n\nAnalysis:\n" + analysis +
        (last ? "\n\nDo not repeat this earlier reply, write a different one:\n" + last : ""),
      300
    );
    res.status(200).json({ reply: reply.replace(/^["“]|["”]$/g, "") });
  } catch (e) {
    res.status(500).json({ error: "Kuch gadbad hui, dobara try karo." });
  }
