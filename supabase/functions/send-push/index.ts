// Stateless Web Push sender. The caller (the push_notification DB trigger via pg_net)
// supplies the VAPID keys (read from supabase_vault), the payload, and the recipient's
// subscriptions — so no secrets live in this function's code. Expired subscriptions
// (404/410) are deleted via the service-role REST API so they don't pile up.
// Deployed with verify_jwt=false (it only acts on inputs it's given; without the VAPID
// private key — vault-only — a caller can't forge a valid push).
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

async function deleteSubscription(endpoint: string) {
  if (!SUPABASE_URL || !SERVICE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    })
  } catch (_e) { /* best effort */ }
}

Deno.serve(async (req) => {
  try {
    const { vapid, payload, subscriptions } = await req.json()
    if (!vapid?.privateKey || !vapid?.publicKey || !Array.isArray(subscriptions)) {
      return new Response(JSON.stringify({ error: 'bad request' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    webpush.setVapidDetails(vapid.subject || 'mailto:noreply@example.com', vapid.publicKey, vapid.privateKey)
    const body = JSON.stringify(payload ?? {})

    const results = await Promise.allSettled(
      subscriptions.map((s: any) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
      )
    )

    const summary = await Promise.all(results.map(async (r, i) => {
      if (r.status === 'fulfilled') return { ok: true, status: (r.value as any)?.statusCode }
      const code = (r.reason as any)?.statusCode
      if (code === 404 || code === 410) await deleteSubscription(subscriptions[i].endpoint)
      return { ok: false, status: code, error: String((r.reason as any)?.body ?? r.reason) }
    }))

    return new Response(JSON.stringify({ sent: summary }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
