# Thalamus

[![](https://img.shields.io/npm/v/@akiroz/thalamus)](https://www.npmjs.com/package/@akiroz/thalamus)
![test](https://github.com/akiroz/Thalamus/workflows/test/badge.svg)

An opinionated application messaging framework based on MQTT.

### Differences from plain MQTT

```diff
+ RPC support
+ Server redundancy / load-balancing
- Guaranteed delivery (MQTT QoS 1 / 2)
```

Messages requiring acknowledgement must use RPC and applications are expected to
implement their own retry mechanisms.

### API

#### `class Thalamus`

-  `constructor(serverOptList: MQTT.IClientOptions[])`

- `thalamus.servers` List of MQTT client objects

-  `async publish(topic: string, payload: Uint8Array)`
-  `async subscribe(topic: string, handler: SubHandler)`
-  `async unsubscribe(topic: string, handler?: SubHandler)`
-  `async call(topic: string, params: Param = {}, opt = defaultOptions): Promise<Result>`
-  `async register(topic: string, handler: (param, topic) => Result)`

- `thalamus.on("connect", (i) => {})` server `i` connected (i = 0-based index)
- `thalamus.on("close", (i) => {})` server `i` disconnected (i = 0-based index)
- `thalamus.on("error", (err, i) => {})` server `i` error (i = 0-based index)

