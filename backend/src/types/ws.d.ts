// Minimal ambient typings for the `ws` WebSocket library that the backend
// consumes (so `tsc` doesn't fall back to `any`). We don't need every method
// the client/server expose — only what the routes/hub touch.

declare module 'ws' {
  export interface WebSocket {
    readonly OPEN: number;
    readonly CLOSED: number;
    readonly readyState: number;
    send(data: string | Buffer | ArrayBuffer, cb?: (err?: Error) => void): void;
    send(data: string | Buffer | ArrayBuffer, options: { mask?: boolean; binary?: boolean }, cb?: (err?: Error) => void): void;
    ping(data?: any, mask?: boolean, cb?: () => void): void;
    pong(data?: any): void;
    close(code?: number, reason?: string | Buffer): void;
    terminate(): void;
    destroy(): void;
    on(event: 'open', listener: () => void): any;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): any;
    on(event: 'message', listener: (data: any, isBinary: boolean) => void): any;
    on(event: 'pong', listener: () => void): any;
    on(event: 'ping', listener: () => void): any;
    on(event: 'error', listener: (err: Error) => void): any;
    on(event: string, listener: (...args: any[]) => void): any;
    addListener(event: string, listener: (...args: any[]) => void): any;
    removeListener(event: string, listener: (...args: any[]) => void): any;
    removeAllListeners(event?: string): any;
  }

  export class WebSocketServer {
    constructor(options?: any);
    handleUpgrade(
      req: import('http').IncomingMessage,
      socket: import('net').Socket,
      head: Buffer,
      cb: (ws: WebSocket) => void,
    ): void;
    close(cb?: (err?: Error) => void): void;
    emit(event: 'connection', ws: WebSocket, req: import('http').IncomingMessage): boolean;
    on(event: 'connection', listener: (ws: WebSocket, req: import('http').IncomingMessage) => void): this;
    on(event: 'listening', listener: () => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }
}
