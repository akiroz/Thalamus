import Thalamus from "../src";

(async () => {
    const thalamus = new Thalamus([{
        host: "broker.hivemq.com",
        protocol: "mqtt",
        port: 1883
    }]);

    const rpc = "068b883978a0f0d9ec9293f351aae431";
    thalamus.register(rpc, async (params) => {
        console.log("Handler", params);
        return params;
    });

    thalamus.once("connect", async () => {
        console.log("Connect");
        console.log("Call", await thalamus.call(rpc, { test: 123 }));
    });

})().catch(console.error);