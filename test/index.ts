import "ts-mocha";
import Thalamus from "../src";
import Dispatcher, { Node } from "../src/dispatcher";
import assert from "assert";

describe("Dispatcher", () => {
    const h = () => {};
    const h2 = () => {};
    const h3 = () => {};
    let node = new Node();
    let disp = new Dispatcher();

    beforeEach(() => {
        node = new Node();
        disp = new Dispatcher();
    });

    it("add handler", () => {
        node.add(["a"], h);
        assert.deepStrictEqual([h], node.get(["a"]));
    });

    it("add multi-level handler", () => {
        node.add(["a", "b", "c"], h);
        assert.deepStrictEqual([h], node.get(["a", "b", "c"]));
    });

    it("add wildcard handler", () => {
        node.add(["+"], h);
        assert.deepStrictEqual([h], node.get(["a"]));
    });

    it("add multiple handler", () => {
        node.add(["a", "b", "c"], h);
        node.add(["a", "b", "c"], h2);
        assert.deepStrictEqual([h, h2], node.get(["a", "b", "c"]));
    });

    it("add multi-level wildcard handler", () => {
        node.add(["a", "b", "c"], h);
        node.add(["a", "+", "c"], h2);
        node.add(["a", "+", "+"], h3);
        assert.deepStrictEqual([h, h2, h3], node.get(["a", "b", "c"]));
    });

    it("remove handler", () => {
        node.add(["a", "b", "c"], h);
        node.add(["a", "+", "c"], h2);
        node.rm(["a", "b", "c"]);
        node.rm(["a", "+", "c"]);
        assert.deepStrictEqual([], node.get(["a", "b", "c"]));
    });

});

describe("Thalamus", () => {
    const rpcTopic = "068b883978/a0f0d9ec9293f/351aae431";
    const thalamus = new Thalamus([{
        host: "broker.hivemq.com",
        protocol: "mqtt",
        port: 1883
    }]);

    before(async () => {
        return new Promise(r => thalamus.once("connect", r));
    });

    it("register RPC", async () => {
        await thalamus.register(rpcTopic, async (params) => {
            return params;
        });
    });

    it("call RPC", async () => {
        const testData = {
            bool: true,
            str: "foo",
            int: 1,
            float: Math.PI,
            buf: Buffer.from([1, 2, 3, 4, 5]),
            map: { foo: "bar" },
            arr: [true, 1, "a"],
        };
        const result = await thalamus.call(rpcTopic, testData);
        assert.deepStrictEqual(testData, result);
    });

    after(() => thalamus.close(true));
});