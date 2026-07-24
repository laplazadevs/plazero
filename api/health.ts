// Health endpoint, also served at / and /health via vercel.json rewrites.
// This is the natural future home for a Discord HTTP interactions endpoint.
export function GET(): Response {
    return Response.json({
        ok: true,
        service: 'plazero',
        time: new Date().toISOString(),
    });
}
