# Aegis Launch Kit — getting users on free platforms

Everything here costs KES 0. Work the list top to bottom; each item has
copy you can paste as-is. Post from your own accounts for authenticity.

## The story (use it everywhere)

> My own credentials leaked on GitHub, so I built a payment firewall for AI
> agents. Every transaction an agent attempts is checked against a live
> policy before it touches money, and recorded to an immutable trail. If
> the gate is ever down, it blocks — never lets money pass silently.

Story > features. The leak-to-launch arc is what makes people share.

## 1. WhatsApp / Telegram dev groups (Kenya) — highest signal first

Kenyan dev groups (Nairobi devs, fintech groups, AI/ML KE communities) are
where an "M-Pesa + AI agents" product is genuinely novel.

> I built Aegis — a policy gate for AI agents, with M-Pesa rails built in.
> Before your agent moves money, it asks Aegis: over-limit gets blocked,
> everything lands in an immutable audit trail. Free API key in one click,
> playground you can test with zero signup: https://aegis-agent-4u79.onrender.com
> Would love feedback from anyone building agents on top of M-Pesa 🙏

Post in the morning (8–10am EAT). Reply to every comment within the hour.

## 2. X / Twitter — founder thread

Post the story as a thread, first tweet is the hook:

> Yesterday my API keys leaked on GitHub. Today I launched the fix: a
> fail-closed payment firewall for AI agents. Live, free, and it took a
> day. 🧵

Then: 2) the demo link 3) how the gate works 4) the honeypot story
(scanners that probe /.env get auto-jailed — people love that) 5) the
/security transparency page 6) CTA: "free key, one click, no email".

Tag #BuildInPublic #AIagents #KenyanTech. Reply to every reply.

## 3. Reddit — the honest launch

r/Kenya devs threads, r/AI_Agents, r/LocalLLaMA, r/Fintech. Reddit punishes
marketing; lead with the story and the demo:

> I kept leaking credentials, so I built a policy gate that AI agents must
> ask before moving money — and gave it a honeypot that auto-bans scanners.
> Free to use, built in Kenya, M-Pesa native. Roast welcome.

Use your real account, answer technical questions in detail. Do NOT post
the same text to 5 subreddits in one day — space it out across the week.

## 4. Show HN (news.ycombinator.com) — one shot, do it last

When the story is polished (after WhatsApp + X feedback):

> Show HN: Aegis – a fail-closed policy gate for autonomous agents

> A firewall between AI agents and payment rails. Agents register, get a
> key, and call the gate before every transaction; over-limit is blocked
> and everything is written to an immutable audit trail. Fail-closed: if
> the gate can't be reached, nothing passes. There's a transparency page
> showing every attack it has stopped: /security.

Post Tuesday–Thursday, ~9am EAT (overlap with US morning). Stay in the
comments all day.

## 5. LinkedIn — the professional angle

Your network already knows you build. 150 words: the leak story, what Aegis
does for businesses adopting AI agents (governance, audit trail, the
"what happens when the agent goes rogue" question), link + screenshot of
the console. Ask one question at the end to drive comments.

## 6. GitHub — make the repo sell

- Add topics: ai-agents, payments, mpesa, security, kenya, policy-engine
- README already shows the product — pin the repo on your profile
- The CHANGELOG reads like a serious engineering effort. It does.

## 7. Dev.to / Medium — the long-form (do this on week 2)

"How I built a payment firewall for AI agents in a day (and caught my own
attackers with a honeypot)" — full technical walkthrough. It's evergreen
SEO and feeds every other channel later.

## Free-tier reality (what scales and what breaks)

- Cold starts: first visitor after idle waits ~50s. Fix for free:
  create a UptimeRobot (uptimerobot.com) free account and monitor
  https://aegis-agent-4u79.onrender.com/health every 5 minutes. That keeps
  the instance awake all day at zero cost.
- Capacity: one 512MB instance handles thousands of requests/day;
  the 240 req/min per-IP ceiling protects it from any single abuser.
- Database: Atlas free tier (512MB) ≈ millions of audit records — fine.
- What breaks first under real viral load: concurrency (one instance).
  That's a good problem — upgrade ONLY when a launch actually spikes.

## Rule of thumb

One platform per day, one post per platform, answer every reply. Momentum
over a week beats dumping everything at once.
