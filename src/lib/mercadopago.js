const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const MP_READY = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function fetchMPBalance() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mp-balance`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}
