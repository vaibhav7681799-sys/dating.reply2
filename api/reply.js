// Free models ki list: pehla model pehle try hoga, na chale to agla.
// IDs openrouter.ai/models se copy karke yahan daalo (2 se 4 models kaafi hain).
const MODELS = [
  "baidu/ernie-5.5-flash-preview:free",
  "inclusionai/ling-3.2-flash:free",
];

async function claude(system, user, maxTokens) {
  let lastErr = "no model";
  for (const model of MODELS) {
    try {
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
        signal: AbortSignal.timeout(8000), // 8 second mein jawab na aaye to agla model
      });
      if (!r.ok) {
        lastErr = model + " -> " + r.status;
        continue;
      }
      const d = await r.json();
      const text = d.choices && d.choices[0] && d.choices[0].message.content;
      if (text && text.trim()) return text.trim();
      lastErr = model + " -> empty";
    } catch (e) {
      lastErr = model + " -> " + e.message;
    }
  }
  throw new Error("Sab models fail: " + lastErr);
}

const ANALYZE = `You are an emotionally intelligent dating-chat coach. A guy pasted a message or chat from a girl he is talking to on a dating app.
Read it carefully and return ONLY JSON (no markdown) with these keys:
{"mood":"her emotional mood right now","interest":"low|medium|high and why in a few words","stage":"new match|getting to know|flirty|planning meetup|dying chat","her_style":"how she texts: length, humour, emojis","language":"exact language/style she writes in, e.g. Hinglish in Roman script, English","hidden_meaning":"what she is really hinting or asking","best_move":"what a confident, genuine guy would do next","avoid":"what would sound cringe or try-hard here"}`;

const WRITE = `You write dating-app replies that sound like a real, relaxed guy texting, not an AI and not a comedian.
You get her message and an analysis. Do this silently:
1. Draft a reply that fits her mood and the best_move.
2. Rules the reply must follow:
- NEVER invent facts about the guy's life, job, plans, location, sleep, food or past. You know nothing about him. If she asks what he is doing or how he is, give a short, simple, believable answer that is true for almost anyone (like "chilling, kuch khaas nahi" or "bas din nikal raha hu") and turn the question back to her with real curiosity.
- Match her length and energy. If her message is short and simple, the reply is short and simple (usually one line, under 12 words).
- No forced jokes, no teasing like "bored or just here to distract me", no assuming how she feels, no dramatic or poetic lines.
- Sound normal: casual, lowercase is fine, no perfect grammar, max one emoji and only if she used one.
- Not needy, not pushy, not manipulative.
3. Match her language and style exactly (if Hinglish in Roman script, write natural Hinglish, not textbook Hindi).
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
    console.error(e);
    res.status(500).json({ error: "Error: " + e.message });
  }
};
