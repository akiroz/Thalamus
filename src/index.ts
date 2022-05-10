import { EventEmitter } from "events";
import MQEmitter, { Message } from "@akiroz/mqemitter";
import * as MQTT from "./asyncWrapper";
import * as RPC from "./rpc";

type SubHandler = (payload: Uint8Array, topic: string) => Promise<void>;
type MQHandler = (message: { topic: string; message: Uint8Array }, done: () => void) => void;

export default class Thalamus extends EventEmitter {
    subDebounceWindow = 10;
    subDebounceState = null as {
        topics: Set<string>;
        event: EventEmitter;
        promise: Promise<void>;
        timeout: NodeJS.Timeout;
        doSubscribeLock: boolean;
    };
    emitter = MQEmitter();
    servers: MQTT.AsyncMqttClient[];
    persistantTopics = new Set<string>();
    handlers = new WeakMap<SubHandler, MQHandler>();

    constructor(serverOptList: MQTT.IClientOptions[] = []) {
        super();
        if (serverOptList.length < 1) throw Error("No MQTT servers");
        this.servers = serverOptList.map((opt) => {
            opt.resubscribe = false; // Disable MQTT.js resub, handle manually.
            return MQTT.connect(opt);
        });
        for (let i = 0; i < this.servers.length; i++) {
            this.servers[i].on("connect", async () => {
                this.emit("connect", i);
                if(this.persistantTopics.size > 0) {
                    try {
                        await this.servers[i].subscribeAsync([...this.persistantTopics], { qos: 0 });
                    } catch (err) {
                        console.warn(`[Thalamus] re-subscribe failed, reconnect...`, err);
                        this.servers[i].reconnect();
                    }
                }
            });
            this.servers[i].on("close", () => this.emit("close", i));
            this.servers[i].on("error", (err) => this.emit("error", err, i));
            this.servers[i].on("message", (topic, message) => this.emitter.emit({ topic, message } as Message));
        }
    }

    async publish(topic: string, payload: Uint8Array): Promise<void> {
        let published = false;
        for (let serv of this.servers) {
            if (serv.connected) {
                await serv.publish(topic, Buffer.from(payload));
                published = true;
                break;
            }
        }
        if (!published) {
            // Try publish on server 0 anyway
            await this.servers[0].publish(topic, Buffer.from(payload));
        }
    }

    async doSubscribe() {
        this.subDebounceState.doSubscribeLock = true;
        try {
            const conn = this.servers.filter(s => s.connected);
            await Promise.all(conn.map(async (srv) => {
                try {
                    await srv.subscribeAsync([...this.subDebounceState.topics], { qos: 0 });
                } catch (err) {
                    console.warn(`[Thalamus] doSubscribe failed, reconnect...`, err);
                    srv.reconnect();
                    throw err;
                }
            }));
            this.subDebounceState.event.emit("sub");
        } catch (err) {
            this.subDebounceState.event.emit("err", err);
        }
        this.subDebounceState = null;
    }

    async subscribe(
        topic: string,
        handler: SubHandler,
        opts: { persistent: boolean } = { persistent: true }
    ): Promise<void> {
        const h = ({ topic, message }, done) => (done(), handler(message, topic));

        if(opts.persistent) {
            this.persistantTopics.add(topic);
            this.handlers.set(handler, h);
            this.emitter.on(topic, h);
            if (this.subDebounceState) {
                if(this.subDebounceState.doSubscribeLock) throw Error("doSubscribe in progress");
                this.subDebounceState.topics.add(topic);
                clearTimeout(this.subDebounceState.timeout);
                this.subDebounceState.timeout = setTimeout(() => this.doSubscribe(), this.subDebounceWindow);
            } else {
                const ee = new EventEmitter();
                this.subDebounceState = {
                    topics: new Set([topic]),
                    event: ee,
                    promise: new Promise((rsov, rjct) => {
                        ee.once("sub", rsov);
                        ee.once("err", rjct);
                    }),
                    timeout: setTimeout(() => this.doSubscribe(), this.subDebounceWindow),
                    doSubscribeLock: false,
                };
            }
            await this.subDebounceState.promise;
        } else {
            const conn = this.servers.filter(s => s.connected);
            await Promise.all(conn.map(s => s.subscribeAsync(topic, { qos: 0 })));
            this.handlers.set(handler, h);
            this.emitter.on(topic, h);
        }
    }

    async unsubscribe(topic: string, handler?: SubHandler): Promise<void> {
        this.emitter.removeListener(topic, handler && this.handlers.get(handler));
        const conn = this.servers.filter(s => s.connected);
        await Promise.all(conn.map(s => s.unsubscribeAsync(topic)));
    }

    async register<P extends RPC.RPCParamResult, R extends RPC.RPCParamResult, C>(
        topic: string,
        handler: RPC.RPCHandler<P, R, C>
    ) {
        await RPC.register(this, topic, handler);
    }

    async call<P extends RPC.RPCParamResult, R extends RPC.RPCParamResult>(
        topic: string,
        params: P = {} as P,
        opt: Partial<typeof RPC.defaultCallOptions> = RPC.defaultCallOptions
    ): Promise<R> {
        return await RPC.call(this, topic, params, opt);
    }
}
