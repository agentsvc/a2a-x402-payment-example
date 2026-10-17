# Pay an A2A agent with x402

A minimal [A2A](https://a2a-protocol.org) client that pays per task with [x402](https://x402.org), following the [x402 extension for A2A](https://github.com/google-agentic-commerce/a2a-x402):

1. Read the agent card (`/.well-known/agent-card.json`) and find the JSON-RPC endpoint and the x402 extension.
2. `message/send` with a data part `{"service": "...", "input": {...}}`. The agent answers with a task in state `input-required` and `x402.payment.required` (price, accepted networks) in the status message metadata.
3. Sign one of the accepted payments (USDC, EIP-3009, no gas) and send it back with the same `taskId` in `x402.payment.payload`. The task comes back `completed`, with the result as an artifact and the receipt in `x402.payment.receipts`.

```bash
npm install
EVM_PRIVATE_KEY=0x... node client.mjs https://agentsvc.io service-finder '{"task": "convert a pdf to text", "limit": 3}'
```

```
agent: agentsvc.io, 126 skills, JSON-RPC https://agentsvc.io/a2a, x402 extension: yes
task 6f1c...: input-required, payment payment-required
price: 0.005 USDC on eip155:137
task 6f1c...: completed, payment payment-completed, payer 0x85E6...6ed6
{ "task": "convert a pdf to text", "count": 3, "results": [ ... ] }
```

The default agent is [agentsvc.io](https://agentsvc.io), which sells 126 web, data and crypto services this way (any skill from its agent card works as `service`). Use a separate wallet with a few dollars of USDC; `NETWORK=eip155:137` pays on Polygon, `eip155:42161` on Arbitrum, default is Base. Failed tasks are never charged.

Sending only a text part (no data part) gets a free answer with matching skills, so an agent can explore before it pays.

MIT licensed.
