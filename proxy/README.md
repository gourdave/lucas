# Making Dr. Umbra's Claude brain work for everyone

The game is a static page, so it can't keep an API key secret on its own.
This tiny Cloudflare Worker holds the key server-side: the game calls the
worker, the worker calls Claude. Players need zero setup.

## One-time setup (~5 minutes, all in the browser, free)

1. **Get an API key** at https://console.anthropic.com → *API Keys* →
   Create Key. Strongly recommended: *Settings → Limits* and set a small
   monthly spend limit (e.g. $5). A therapist reply costs ~$0.001, so $5
   is thousands of conversations.

2. **Create the worker** at https://dash.cloudflare.com (free account):
   - *Workers & Pages → Create → Create Worker*
   - Name it something like `bumpercrop-umbra`, hit **Deploy**
   - Click **Edit code**, delete the sample, paste the entire contents of
     [`worker.js`](./worker.js), hit **Deploy** again

3. **Add the key as a secret**: on the worker's page →
   *Settings → Variables and Secrets → Add* →
   type **Secret**, name `ANTHROPIC_API_KEY`, value `sk-ant-...` → Deploy.

4. **Copy the worker URL** (looks like
   `https://bumpercrop-umbra.YOURNAME.workers.dev`) and set it as
   `PROXY_URL` at the top of [`../js/therapist.js`](../js/therapist.js).
   Push — the game auto-deploys and everyone gets the real Claude therapist.

## Safety rails built into the worker

- Only the game's origin (`gourdave.github.io`) passes CORS
- Model is locked to Haiku and replies capped at 220 tokens
- Message count/length clamped, light per-IP rate limit
- The API key's own monthly spend limit is the final backstop

If the worker is ever down or unreachable, the game silently falls back to
the built-in therapist brain — nothing breaks.
