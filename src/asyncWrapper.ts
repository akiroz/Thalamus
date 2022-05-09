import * as MQTT from "mqtt";
export * from "mqtt";

export type AsyncMqttClient = MQTT.Client & {
    publishAsync(topic: string, message: string | Buffer, opts: MQTT.IClientPublishOptions): Promise<MQTT.Packet>;
    subscribeAsync(topic: string | string[], opts: MQTT.IClientSubscribeOptions): Promise<MQTT.ISubscriptionGrant[]>;
    unsubscribeAsync(topic: string | string[]): Promise<void>;
};

export function connect(brokerUrl?: string | any, opts?: MQTT.IClientOptions): AsyncMqttClient {
    const client = MQTT.connect(brokerUrl, opts) as AsyncMqttClient;

    client.publishAsync = function(...args): Promise<MQTT.Packet> {
        return new Promise((rsov, rjct) => {
            client.publish(...args, (err, res) => {
                if (err) rjct(err);
                else rsov(res);
            });
        });
    };

    client.subscribeAsync = function(...args): Promise<MQTT.ISubscriptionGrant[]> {
        return new Promise((rsov, rjct) => {
            client.subscribe(...args, (err, res) => {
                if (err) rjct(err);
                else rsov(res);
            });
        });
    };

    client.unsubscribeAsync = function(...args): Promise<void> {
        return new Promise((rsov, rjct) => {
            client.unsubscribe(...args, (err, res) => {
                if (err) rjct(err);
                else rsov(res);
            });
        });
    }

    return client;
}