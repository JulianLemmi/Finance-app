const MP_TOKEN = import.meta.env.VITE_MP_ACCESS_TOKEN;
export const MP_READY = Boolean(MP_TOKEN);

export async function fetchMPBalance() {
  if (!MP_TOKEN) throw new Error("Token no configurado");
  const res = await fetch("https://api.mercadopago.com/v1/account/balance", {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}
