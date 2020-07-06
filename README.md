# Thalamus

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

TODO: Add Docs
