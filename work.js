let currentTransport, streamNumber;
let fghex = "0655b419d075115ce038e910344e067a0a2a2d16b143e5b5d2b27bfe53ba2c2a";
let fingerprint = [];
let bidiStreamCount = 0;
for (let c = 0; c < fghex.length - 1; c += 2) {
    fingerprint.push(parseInt(fghex.substring(c, c + 2), 16));
}
let auto_test_suc_cnt = 0;
let auto_test_flag = 0;
const randomData_tosend = new Set();
const recv_data_for_auto_test = new Set();
let LogTimeSpent = 0;
let LogQueue = [];
let Button_timeout = 20;
let ClientList = [];
let encoder = new TextEncoder('utf-8');
let decoder = new TextDecoder('utf-8');
let currentWriter;

let addToEventLog = (msg, type = 'info') => {
    self.postMessage({
        cmd: 'event',
        type: type,
        msg: msg
    });
}

async function readDatagrams() {
    try {
        var datagram_reader = transport.datagrams.readable.getReader();
        addToEventLog('Datagram reader ready.');
    } catch (e) {
        addToEventLog('Receiving datagrams not supported: ' + e, 'error');
        return;
    }
    try {
        while (true) {
            const { value, done } = await datagram_reader.read();
            if (done) {
                addToEventLog('Done reading datagrams!');
                return;
            }
            let data = decoder.decode(value);
            if (auto_test_flag != 1)
                addToEventLog('Echo Datagram received: ' + data);
            // console.log('Echo Datagram received: ' + data);
            validateData(data);
            recv_data_for_auto_test.add(data);
        }
    } catch (e) {
        addToEventLog('Error while reading datagrams: ' + e, 'error');
    }
}

async function acceptUnidirectionalStreams(transport) {
    addToEventLog('Waiting for incoming unidirectional streams...');
    let reader = transport.incomingUnidirectionalStreams.getReader();
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                addToEventLog('Done accepting unidirectional streams!');
                return;
            }
            let stream = value; // ReadableStream
            let number = streamNumber++; // stream_id
            // validateData(value);
            readFromIncomingStream(stream, number);
        }
    } catch (e) {
        addToEventLog('Error while accepting streams: ' + e, 'error');
    }
}

async function readFromIncomingStream(stream, number) {
    let decoder = new TextDecoderStream('utf-8');
    let reader = stream.pipeThrough(decoder).getReader();
    let form = document.forms.sending.elements;
    let expectedData = randomData_tosend; // Use the global randomData_tosend
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                addToEventLog('Stream #' + number + ' closed');
                return;
            }
            let data = value;
            addToEventLog('Received data on stream #' + number + ': ' + data);
            validateData(data, expectedData);
            if (data.length > 2)
                recv_data_for_auto_test.add(data);

        }
    } catch (e) {
        addToEventLog(
            'Error while reading from stream #' + number + ': ' + e, 'error');
        addToEventLog('    ' + e.message);
    }
}

function validateData(receivedData, expectedData) {
    if (randomData_tosend.has(receivedData)) {
        // randomData_tosend.delete(receivedData);
        auto_test_suc_cnt += 1;
        return;
    }
    if (receivedData === expectedData) auto_test_suc_cnt += 1;
}

let connect = async () => {
    try {
        await transport.ready;
        addToEventLog('Connection ready.');
    } catch (e) {
        addToEventLog('Connection failed. ' + e, 'error');
        return;
    }
    transport.closed
        .then(() => {
            addToEventLog('Connection closed normally.');
        })
        .catch(() => {
            addToEventLog('Connection closed abruptly.', 'error');
        });
    streamNumber = 1;
    try {
        currentWriter = transport.datagrams.writable.getWriter();
        addToEventLog('Datagram writer ready.');
    } catch (e) {
        addToEventLog('Sending datagrams not supported: ' + e, 'error');
        return;
    }
    readDatagrams(transport);
    acceptUnidirectionalStreams(transport);
}

function generateRandomString(length = 10) {
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    // let form = document.forms.sending.elements;
    // form.data.value = result;  // Update the input field
    return result;  // Return the generated string
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

self.addEventListener('message', async function (e) {
    const data = e.data;

    switch (data.cmd) {
        case 'connect':
            try {
                transport = new WebTransport(data.url, {
                    serverCertificateHashes: [
                        {
                            algorithm: 'sha-256',
                            value: new Uint8Array(fingerprint)
                        }
                    ]
                });
                addToEventLog('Initiating connection...');
            } catch (e) {
                addToEventLog('Failed to create connection object. ' + e, 'error');
                return;
            }
            currentTransport = transport;
            await connect();
            break;
        case 'stop':
            addToEventLog('Stopping connection...');
            self.close(); // Terminates the worker.
            break;
        case 'send':
            if (!currentTransport) {
                addToEventLog('No connection available.', 'error');
                return;
            }
            addToEventLog('Sending data: ' + data.data);
            const dataToSend = encoder.encode(data.data);
            randomData_tosend.add(dataToSend);
            await currentWriter.write(dataToSend);
            break;
        case 'autotest':
            if (!currentTransport) {
                addToEventLog('No connection available.', 'error');
                return;
            }
            auto_test_flag = 1;
            auto_test_suc_cnt = 0;
            let autoTestCount = parseInt(data.count, 10);
            LogTimeSpent = 0;
            let sendQueue = [];
            randomData_tosend.clear();
            for (let i = 0; i < autoTestCount; i++) {
                const str = generateRandomString();
                sendQueue.push(encoder.encode(str));
                randomData_tosend.add(str);
            }
            let record_timestamp = performance.now();
            for (let i = 0; i < autoTestCount; i++) {
                await currentWriter.write(sendQueue[i]);
            }
            // 计算总共耗时
            let time_diff = performance.now() - record_timestamp;
            await sleep(1000);

            if (auto_test_suc_cnt == autoTestCount) {
                addToEventLog('Auto test success! ' + auto_test_suc_cnt + '/' + autoTestCount);
                self.postMessage({
                    cmd: 'autosuccess',
                });
            } else {
                addToEventLog('Auto test failed! ' + auto_test_suc_cnt + '/' + autoTestCount);
                self.postMessage({
                    cmd: 'autofail',
                });
            }
            addToEventLog('Total time: ' + time_diff + 'ms', 'summary');
            randomData_tosend.clear();
            recv_data_for_auto_test.clear();
            auto_test_flag = 0;
            break;
        default:
            addToEventLog('Unknown command: ' + data.cmd, 'error');
            break;
    };
}, false);