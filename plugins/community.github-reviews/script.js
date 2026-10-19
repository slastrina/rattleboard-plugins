// GitHub reviews: three numbers from the GitHub REST API, fetched together: pull requests
// waiting for your review, your own open pull requests, and unread notifications. Red when a
// review is waiting, yellow for unread notifications only, green when there's nothing.

const API = "https://api.github.com";

export default async function (ctx) {
  if (!ctx.hasSecret("token")) return { text: "GitHub\nAdd a token in this source's settings", color: "white" };
  const headers = {
    Authorization: `Bearer ${ctx.secret("token")}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const org = String(ctx.settings.org || "").trim();
  if (org !== "" && !/^[A-Za-z0-9-]{1,39}$/.test(org)) return "GitHub\nThat isn't an organisation or user name";
  const scope = org ? ` org:${org}` : "";
  const search = (q) => ctx.fetch(`${API}/search/issues?per_page=1&q=${encodeURIComponent(q + scope)}`, { headers });

  // Three requests at once: they wait together, not one after another.
  const [reviews, mine, notes] = await Promise.all([
    search("is:open is:pr archived:false review-requested:@me"),
    search("is:open is:pr archived:false author:@me"),
    ctx.fetch(`${API}/notifications?per_page=50`, { headers }),
  ]);
  if (reviews.status === 401) return { text: "GitHub\nThe token was refused: check it in settings", color: "red" };
  for (const r of [reviews, mine]) if (!r.ok) throw new Error(`GitHub answered HTTP ${r.status}`);
  const waiting = (await reviews.json()).total_count;
  const open = (await mine.json()).total_count;
  // A fine-grained token can't read notifications: show a dash then.
  const unread = notes.ok ? (await notes.json()).length : null;
  ctx.log(`reviews ${waiting}, mine ${open}, unread ${unread === null ? `n/a (HTTP ${notes.status})` : unread}`);

  const n = (v, cap) => (v === null ? "-" : v >= cap ? `${cap}+` : String(v));
  const color = waiting > 0 ? "red" : unread > 0 ? "yellow" : "green";
  // Every row the same width (blank tiles, {0}, never squeezed), so the centred rows line up.
  const row = (label, value) => label + "{0}".repeat(8 - label.length) + "{0}".repeat(Math.max(0, 4 - value.length)) + value;
  const counts = [row("Reviews", n(waiting, 1000)), row("My PRs", n(open, 1000)), row("Unread", n(unread, 50))];
  const rows = ctx.board.rows >= 5 ? ["GitHub" + (org ? " " + org : ""), "", ...counts] : counts;
  return { text: rows.join("\n"), color, link: waiting > 0 ? "https://github.com/pulls/review-requested" : "https://github.com/pulls" };
}
