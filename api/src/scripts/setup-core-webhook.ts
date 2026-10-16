// Cadastra no Core o endereço que recebe os avisos de pagamento. Rode uma vez por ambiente:
//   CORE_API_KEY=fk_... pnpm --filter @moldura/api core:webhook https://api.molduraeleitoral.com
// O segredo (whsec_...) sai só aqui, numa linha CORE_WEBHOOK_SECRET=...: guarde direto no ambiente da api.
import { CoreApiError, createClient } from "@felipepasc/core-sdk";

const apiUrl = process.argv[2]?.replace(/\/+$/, "");

if (!apiUrl || !/^https?:\/\//.test(apiUrl)) {
  console.error("Uso: core:webhook <endereço público da api, ex.: https://api.molduraeleitoral.com>");
  process.exit(1);
}

const core = createClient({ baseUrl: process.env.CORE_API_URL ?? "https://felipepasc.com", apiKey: process.env.CORE_API_KEY ?? "" });

try {
  const { service } = await core.ping();
  console.error(`Serviço no Core: ${service.name}`);

  const endpoint = await core.webhooks.create({
    url: `${apiUrl}/webhooks/core`,
    events: ["charge.paid"],
    description: "Moldura Eleitoral: pedido pago",
  });

  console.error(`Endereço ${endpoint.id} cadastrado: ${endpoint.url}`);
  console.log(`CORE_WEBHOOK_SECRET=${endpoint.secret}`);
} catch (error) {
  if (error instanceof CoreApiError) {
    console.error(`Core respondeu ${error.status} (${error.code}): ${error.message}`);
    process.exit(1);
  }

  throw error;
}
