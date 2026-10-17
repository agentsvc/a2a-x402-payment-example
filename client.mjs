// Minimal A2A client that pays with x402 (A2A x402 extension, github.com/google-agentic-commerce/a2a-x402).
//   1. Read the agent card and find the JSON-RPC endpoint.
//   2. message/send with a data part {service, input}  ->  task in state "input-required",
//      status.message.metadata["x402.payment.required"] holds the price and the accepted networks.
//   3. Sign one of the accepted payments and send it back with the same taskId
//      in metadata["x402.payment.payload"]  ->  task "completed", result in artifacts, receipt in metadata.
//
//   EVM_PRIVATE_KEY=0x... node client.mjs [agent-url] [service] [json-input]
import { x402Client } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const [agentUrl = 'https://agentsvc.io', service = 'service-finder', inputJson = '{"task": "convert a pdf to text", "limit": 3}'] = process.argv.slice(2);
if (!process.env.EVM_PRIVATE_KEY) { console.error('Set EVM_PRIVATE_KEY to a wallet with a little USDC (Base by default, NETWORK=eip155:137 for Polygon).'); process.exit(1); }
const NETWORK = process.env.NETWORK || 'eip155:8453';
const payer = new x402Client((_v, accepts) => accepts.find(a => a.network === NETWORK) || accepts[0]);
registerExactEvmScheme(payer, { signer: privateKeyToAccount(process.env.EVM_PRIVATE_KEY) });

// 1. Agent card
const card = await (await fetch(new URL('/.well-known/agent-card.json', agentUrl))).json();
const endpoint = card.preferredTransport === 'JSONRPC' ? card.url : (card.additionalInterfaces || []).find(i => i.transport === 'JSONRPC')?.url;
const x402 = card.capabilities?.extensions?.find(e => e.uri.includes('a2a-x402'));
console.log(`agent: ${card.name}, ${card.skills?.length ?? 0} skills, JSON-RPC ${endpoint}, x402 extension: ${x402 ? 'yes' : 'no'}`);

let id = 0;
const rpc = async (method, params) => {
  const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-A2A-Extensions': x402?.uri ?? '' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
};

// 2. Ask for the service
const task = await rpc('message/send', { message: { role: 'user', kind: 'message', messageId: crypto.randomUUID(), parts: [{ kind: 'data', data: { service, input: JSON.parse(inputJson) } }] } });
const meta = task.status.message?.metadata ?? {};
console.log(`task ${task.id}: ${task.status.state}, payment ${meta['x402.payment.status']}`);
if (meta['x402.payment.status'] !== 'payment-required') { console.log(JSON.stringify(task, null, 2)); process.exit(1); }
const required = meta['x402.payment.required'];
const offer = required.accepts.find(a => a.network === NETWORK) ?? required.accepts[0];
console.log(`price: ${Number(offer.amount) / 1e6} USDC on ${offer.network}`);

// 3. Pay and get the result
const payload = await payer.createPaymentPayload(required);
const done = await rpc('message/send', { message: { role: 'user', kind: 'message', messageId: crypto.randomUUID(), taskId: task.id, contextId: task.contextId,
  parts: [{ kind: 'text', text: 'payment attached' }], metadata: { 'x402.payment.status': 'payment-submitted', 'x402.payment.payload': payload } } });
const receipt = done.status.message?.metadata?.['x402.payment.receipts']?.[0];
console.log(`task ${done.id}: ${done.status.state}, payment ${done.status.message?.metadata?.['x402.payment.status']}, payer ${receipt?.payer}`);
console.log(JSON.stringify(done.artifacts?.[0]?.parts?.[0]?.data, null, 2).slice(0, 1500));
