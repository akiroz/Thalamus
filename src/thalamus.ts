import { EventEmitter } from "events";
import * as MQEmitter from "mqemitter";
import pAny from "p-any";
import * as MQTT from "async-mqtt";
import * as RPC from "@akiroz/pubsub-rpc";

type SubHandler = (payload: Uint8Array, topic: string) => Promise<void>;

export default class Thalamus extends EventEmitter {
    handlers = {} as { [topic: string]: Set<SubHandler> };
    // @ts-ignore emitter wrong type declaration
    emitter = new MQEmitter();
    servers: MQTT.AsyncMqttClient[];

    constructor(serverOptList: MQTT.IClientOptions[] = []) {
        super();
        if (serverOptList.length < 1) throw Error("No MQTT servers");
        this.servers = serverOptList.map(opt => MQTT.connect(opt));
        for (let i = 0; i < this.servers.length; i++) {
            this.servers[i].on("connect", () => this.emit("connect", i));
            this.servers[i].on("close", () => this.emit("close", i));
            this.servers[i].on("error", err => this.emit("error", err, i));
            // @ts-ignore emitter wrong type declaration
            this.servers[i].on("message", (topic, message) => this.emitter.emit({ topic, message }));
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

    async subscribe(topic: string, handler: SubHandler): Promise<void> {
        // @ts-ignore emitter wrong type declaration
        this.emitter.on(topic, handler);
        await pAny(this.servers.map(srv => srv.subscribe(topic)));
    }

    async unsubscribe(topic: string, handler?: SubHandler): Promise<void> {
        // @ts-ignore emitter wrong type declaration
        this.emitter.removeListener(topic, handler);
        await pAny(this.servers.map(srv => srv.unsubscribe(topic)));
    }

    async register<P extends RPC.RPCParamResult, R extends RPC.RPCParamResult>(
        topic: string,
        handler: RPC.RPCHandler<P, R>
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
