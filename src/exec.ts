import WebSocket = require('isomorphic-ws');
import querystring = require('querystring');
import stream = require('stream');

import { KubeConfig } from './config';
import { WebSocketHandler, WebSocketInterface } from './web-socket-handler';

export class Exec {
    public 'handler1': WebSocketInterface;
    public 'handler2': WebSocketInterface;

    public constructor(config: KubeConfig, wsInterface?: WebSocketInterface) {
        if (wsInterface) {
            this.handler1 = wsInterface;
            this.handler2 = wsInterface;
        } else {
            this.handler1 = new WebSocketHandler(config);
            this.handler2 = new WebSocketHandler(config);
        }
    }

    // TODO: make command an array and support multiple args
    public async exec(namespace: string, podName: string, containerName: string, command: string,
                      stdout: stream.Writable | any, stderr: stream.Writable | any, stdin: stream.Readable | any,
                      tty: boolean, endStream = true): Promise<void> {
        const query = {
            stdout: stdout != null,
            stderr: stderr != null,
            stdin: stdin != null,
            tty,
            command,
            container: containerName,
        };
        const queryStr = querystring.stringify(query);
        const path1 = `/api/v1/namespaces/${namespace}/pods/${podName}/exec?${queryStr}`;
        const connect = async (handler, path) => {
            const conn = await this.handler1.connect(path, null, (streamNum: number, buff: Buffer): boolean => {
                const result = WebSocketHandler.handleStandardStreams(streamNum, buff, stdout, stderr, false) as string;
                if (result) {
                    if (result.indexOf('126') > 0) {
                        query.command = 'sh';
                        const queryStr2 = querystring.stringify(query);
                        const path2 = `/api/v1/namespaces/${namespace}/pods/${podName}/exec?${queryStr2}`;
                        stdin.removeAllListeners();
                        connect(this.handler2, path2);
                    } else {
                        if (stdout) {
                            stdout.end();
                        }
                        if (stderr) {
                            stderr.end();
                        }
                    }
                }
                return true;
            });
            if (stdin != null) {
                WebSocketHandler.handleStandardInput(conn, stdin);
            }
        };
        connect(this.handler1, path1);
    }
}
