
type Handler = (msg: Uint8Array, topic: string) => any;

export class Node {
    paths = new Map<string, Node>();
    handlers = new Set<Handler>();
    add([head, ...rest]: string[], h: Handler) {
        if(!head) {
            this.handlers.add(h);
        } else {
            if(!this.paths.has(head)) this.paths.set(head, new Node());
            this.paths.get(head).add(rest, h);
        }
    }
    rm([head, ...rest]: string[], h?: Handler) {
        if(!head) {
            if(h) this.handlers.delete(h);
            else this.handlers = new Set();
        } else if(this.paths.has(head)) {
            this.paths.get(head).rm(rest, h);
            if(this.paths.get(head).handlers.size < 1) this.paths.delete(head);
        }
    }
    get([head, ...rest]: string[]): Handler[] {
        if(!head) return [...this.handlers];
        const a = this.paths.get(head)?.get(rest) || [];
        const b = this.paths.get("+")?.get(rest) || [];
        return [...a, ...b];
    }
}

export default class Dispatcher {
    root = new Node();
    emit(topic: string, msg: Uint8Array) {
        for(let h of this.root.get(topic.split("/"))) h(msg, topic);
    }
    on(topic: string, h: Handler) {
        this.root.add(topic.split("/"), h);
    }
    removeListener(topic: string, h?: Handler) {
        this.root.rm(topic.split("/"), h)
    }
};