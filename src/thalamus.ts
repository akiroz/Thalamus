import { EventEmitter } from "events";
import MQEmitter, { Message } from "@akiroz/mqemitter";
import pAny from "p-any";
import * as MQTT from "async-mqtt";
import * as RPC from "@akiroz/pubsub-rpc";

type SubHandler = (payload: Uint8Array, topic: string) => Promise<void>;
type MQHandler = (message: { topic: string; message: Uint8Array }, done: () => void) => void;
type SubDebounceState = {
    topics: string[];
    event: EventEmitter;
    promise: Promise<void>;
    timeout: NodeJS.Timeout;
};


export default class Thalamus extends EventEmitter {
    subDebounceWindow = 100;
    subDebounceState = null as SubDebounceState;
    emitter = MQEmitter();
    servers: MQTT.AsyncMqttClient[];
    handlers = new WeakMap<SubHandler, MQHandler>();

    constructor(serverOptList: MQTT.IClientOptions[] = []) {
        super();
        if (serverOptList.length < 1) throw Error("No MQTT servers");
        this.servers = serverOptList.map((opt) => MQTT.connect(opt));
        for (let i = 0; i < this.servers.length; i++) {
            this.servers[i].on("connect", () => this.emit("connect", i));
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

    async sendSubscribe(subDebounceState: SubDebounceState) {
        try {
            await pAny(this.servers.map((srv) => srv.subscribe(subDebounceState.topics)));
            subDebounceState.event.emit("sub");
        } catch (err) {
            subDebounceState.event.emit("err", err);
        }
    }

    async subscribe(topic: string, handler: SubHandler): Promise<void> {
        const h = ({ topic, message }, done) => (done(), handler(message, topic));
        this.handlers.set(handler, h);
        this.emitter.on(topic, h);
        if (this.subDebounceState) {
            this.subDebounceState.topics.push(topic);
            clearTimeout(this.subDebounceState.timeout);
            this.subDebounceState.timeout = setTimeout(() => {
                this.sendSubscribe(this.subDebounceState);
                this.subDebounceState = null;
            }, this.subDebounceWindow);
        } else {
            const event = new EventEmitter();
            this.subDebounceState = {
                topics: [topic],
                event: event,
                promise: new Promise((rsov, rjct) => {
                    event.once("sub", rsov);
                    event.once("err", rjct);
                }),
                timeout: setTimeout(() => {
                    this.sendSubscribe(this.subDebounceState);
                    this.subDebounceState = null;
                }, this.subDebounceWindow),
            };
        }
        await this.subDebounceState.promise;
    }

    async unsubscribe(topic: string, handler?: SubHandler): Promise<void> {
        this.emitter.removeListener(topic, handler && this.handlers.get(handler));
        await pAny(this.servers.map((srv) => srv.unsubscribe(topic)));
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
