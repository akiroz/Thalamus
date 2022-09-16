import * as MsgPack from "@msgpack/msgpack";
import { Base64 } from "js-base64";

function generateCallId(size: number): Uint8Array {
    if (typeof window !== 'undefined') {
        const id = new Uint8Array(size);
        if (window.crypto) window.crypto.getRandomValues(id);
        else {
            console.warn("[RiceRPC] No crypto module, using Math.random for call ID")
            for (let i = 0; i < size; i++) {
                id[i] = Math.floor(Math.random() * 265);
            }
        }
        return id;
    } else {
        return require("crypto").randomBytes(size);
    }
}

// Dedups last 100 message received by ID
const idDedup = {
    arr: [] as string[],
    set: new Set<string>(),
    max: 100,
    put(key: string) {
        if(this.set.has(key)) return;
        this.set.add(key);
        this.arr.push(key);
        if(this.arr.length > this.max) {
            const elem = this.arr.shift();
            this.set.delete(elem);
        }
    },
    has(key: string): boolean {
        return this.set.has(key);
    }
};

export type RPCParamResult = { [k: string]: any };
export type RPCRequest<P extends RPCParamResult> = { id: Uint8Array; params: P };
export type RPCResponse<R extends RPCParamResult> = { result: R } & { error: { message: string; data?: any } };
export type RPCHandler<
    P extends RPCParamResult,
    R extends RPCParamResult,
    C
> = (param: P, topic: string, ctx?: C) => Promise<R | void>;
export type PubSubClient<C> = {
    publish(topic: string, payload: Uint8Array): Promise<void>;
    subscribe(
        topic: string,
        handler: (payload: Uint8Array, topic: string, ctx?: C) => Promise<void>,
        opts?: { persistent: boolean },
    ): Promise<void>;
    unsubscribe(topic: string): Promise<void>;
};

export const defaultCallOptions = {
    timeout: 10000, // ms
    idSize: 16, // bytes
};

export async function call<P extends RPCParamResult, R extends RPCParamResult>(
    client: PubSubClient<void>,
    topic: string,
    params: P = {} as P,
    opt: Partial<typeof defaultCallOptions> = defaultCallOptions
): Promise<R> {
    opt = Object.assign({}, defaultCallOptions, opt);
    const id = generateCallId(opt.idSize);
    const strId = Base64.fromUint8Array(id, true);
    const responseTopic = `${topic}/${strId}`;
    const msg = await new Promise<Uint8Array>((rsov, rjct) => {
        const timeoutId = setTimeout(() => {
            client.unsubscribe(responseTopic);
            rjct({ message: "timeout", data: { topic, params, opt, id } });
        }, opt.timeout);
        client.subscribe(responseTopic, async (msg) => {
            clearTimeout(timeoutId);
            client.unsubscribe(responseTopic);
            rsov(msg);
        }, { persistent: false }).then(() => {
            return client.publish(topic, MsgPack.encode({ id, params }));
        }).catch((err) => {
            clearTimeout(timeoutId);
            client.unsubscribe(responseTopic);
            rjct({ message: "pub/sub error", data: err });
        });
    });
    const { result, error } = MsgPack.decode(msg) as RPCResponse<R>;
    if (error) throw error;
    return result;
}

export async function register<P extends RPCParamResult, R extends RPCParamResult, C>(
    client: PubSubClient<C>,
    topic: string,
    handler: RPCHandler<P, R, C>
) {
    await client.subscribe(topic, async (payload, msgTopic, ctx) => {
        if (!(payload instanceof Uint8Array)) throw Error(`Invalid payload: ${payload}`);
        const msg = MsgPack.decode(payload) as RPCRequest<P>;
        if (!msg) throw Error(`Invalid payload: ${payload}`);
        const { id, params } = msg;
        if (!id) throw Error("Missing id in RPC call");
        const strId = Base64.fromUint8Array(id, true);
        if (idDedup.has(strId)) throw Error("Duplicate call request");
        idDedup.put(strId);
        const response = await handler(params, msgTopic, ctx)
            .then((r) => ({ result: r || {} }))
            .catch((error) => ({ error }));
        await client.publish(`${msgTopic}/${strId}`, MsgPack.encode(response));
    });
}