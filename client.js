let currentTransport, streamNumber, currentTransportDatagramWriter;
let fghex = "9942029c06af74dbfd87d84d85404f1b53806670b5a637a287aa21135bb09e54";
let fingerprint = [];
let bidiStreamCount = 0;
for (let c = 0; c < fghex.length - 1; c += 2) {
  fingerprint.push(parseInt(fghex.substring(c, c + 2), 16));
}
var auto_test_suc_cnt = 0;
const randomData_tosend = new Set();
let LogTimeSpent = 0;
let LogQueue = [];
var Button_timeout = 20;
// "Connect" button handler.
async function connect() {
  var transport;
  generateRandomString();
  randomString = generateRandomString(10);
  const url = document.getElementById('url').value;
  try {
    transport = new WebTransport(url, {
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
  // console.log(transport);
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
  currentTransport = transport;
  streamNumber = 1;
  try {
    currentTransportDatagramWriter = transport.datagrams.writable.getWriter();
    addToEventLog('Datagram writer ready.');
  } catch (e) {
    addToEventLog('Sending datagrams not supported: ' + e, 'error');
    return;
  }
  readDatagrams(transport);
  acceptUnidirectionalStreams(transport);
  document.forms.sending.elements.send.disabled = false;
  document.getElementById('connect').disabled = true;
  document.getElementById('autotest').disabled = false; // Enable Auto test button

  Button_checker();

  flushLogQueue();
}

function Button_checker() {
  // 这里要设置默认值 因为stream的上限是不同的
  // 需要注意 这里uni_stream发的过多会超限（约100左右）
  document.getElementById('unidi-stream').addEventListener('change', function () {
    if (this.value === 'unidi') {
      document.getElementById('autotest-count').value = '64'; 
      Button_timeout = 100;
    }
  });

  document.getElementById('bidi-stream').addEventListener('change', function () {
    if (this.value === 'bidi') {
      document.getElementById('autotest-count').value = '64'; 
      Button_timeout = 100;
    }
  });
  document.getElementById('datagram').addEventListener('change', function () {
    if (this.value === 'datagram') {
      document.getElementById('autotest-count').value = '2048'; 
      Button_timeout = 20;
    }
  });
}
// "Send data" button handler.

async function sendDataHandler() {
  sendData();


  await new Promise(r => setTimeout(r, 10));
  flushLogQueue();
  
}

async function sendData() {
  let form = document.forms.sending.elements;
  let encoder = new TextEncoder('utf-8');
  let random_gen_data = generateRandomString(10); // Generate and store random string
  let data = encoder.encode(random_gen_data);
  let transport = currentTransport;
  try {
    switch (form.sendtype.value) {
      case 'datagram': {
        randomData_tosend.add(random_gen_data);
        await currentTransportDatagramWriter.write(data);
        addToEventLog('Sent datagram: ' + random_gen_data);
        break;
      }
      case 'unidi': {
        let stream = await transport.createUnidirectionalStream();
        let writer = stream.getWriter();
        randomData_tosend.add(random_gen_data);
        await writer.write(data);
        await writer.close();
        addToEventLog('Sent a unidirectional stream with data: ' + random_gen_data);
        break;
      }
      case 'bidi': {
        let stream = await transport.createBidirectionalStream();
        let number = streamNumber++;
        acceptBidirectionalStreams(transport, stream, random_gen_data);
        let writer = stream.writable.getWriter();
        await writer.write(data);
        await writer.close();
        addToEventLog(
          'Opened bidirectional stream #' + number +
          ' with data: ' + random_gen_data);
        break;
      }
    }
  } catch (e) {
    addToEventLog('Error while sending data: ' + e, 'error');
  }
}
// Reads datagrams from |transport| into the event log until EOF is reached.
async function readDatagrams(transport) {
  try {
    var datagram_reader = transport.datagrams.readable.getReader();
    addToEventLog('Datagram reader ready.');
  } catch (e) {
    addToEventLog('Receiving datagrams not supported: ' + e, 'error');
    return;
  }
  let decoder = new TextDecoder('utf-8');
  try {
    while (true) {
      const { value, done } = await datagram_reader.read();
      if (done) {
        addToEventLog('Done reading datagrams!');
        return;
      }
      let data = decoder.decode(value);
      addToEventLog('Echo Datagram received: ' + data);
      validateData(data);
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
      validateData(value);
      readFromIncomingStream(stream, number);
    }
  } catch (e) {
    addToEventLog('Error while accepting streams: ' + e, 'error');
  }
}
async function acceptBidirectionalStreams(transport, bidiStream, expectedData) {
  addToEventLog('Waiting for incoming bidirectional streams...');
  let decoder = new TextDecoderStream('utf-8');
  let reader = bidiStream.readable.pipeThrough(decoder).getReader();
  let data = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        bidiStreamCount++;
        addToEventLog('Recv data on bidirectional stream: ' + bidiStreamCount + ' : ' + data);
        validateData(data, expectedData);
        addToEventLog('Done accepting bidirectional streams!');
        return;
      }
      data = value;
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
      await validateData(data, expectedData);
    }
  } catch (e) {
    addToEventLog(
      'Error while reading from stream #' + number + ': ' + e, 'error');
    addToEventLog('    ' + e.message);
  }
}
function validateData(receivedData, expectedData) {
  if (randomData_tosend.has(receivedData)) {
    randomData_tosend.delete(receivedData);
    auto_test_suc_cnt += 1;
    return;
  }
  if (receivedData === expectedData) auto_test_suc_cnt += 1;
}

async function addToEventLog(text, severity = 'info') {
  let log = document.getElementById('event-log');
  let mostRecentEntry = log.lastElementChild;
  let entry = document.createElement('li');

  let options = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };

  let timestamp = new Date().toLocaleTimeString() + '.' + new Date().getMilliseconds().toString().padStart(3, '0');
  entry.innerText = `[${timestamp}] ${text}`;


  if (severity === 'summary') {
    entry.style.fontWeight = 'bold';
    entry.style.color = 'red';
  } else {
    entry.className = 'log-' + severity;
  }
  // 根据不同的严重性级别添加不同的样式

  LogQueue.push(entry);
}

function flushLogQueue() {

  console.log('queue size = ' + LogQueue.length);
  let log = document.getElementById('event-log');
  if (LogQueue.length > 10) {
    for (let i = 0; i < 5; i++) {
      log.appendChild(LogQueue[i]);
    }
    let entry = document.createElement('li');
    entry.innerText = '...';
    log.appendChild(entry);
    for (let i = LogQueue.length - 5; i < LogQueue.length; i++) {
      log.appendChild(LogQueue[i]);
    }
  }
  else {
    for (let entry of LogQueue) {
      log.appendChild(entry);
    }
  }

  LogQueue = [];
  log.scrollTop = log.scrollHeight;
}
// 随机生成字符串 给输入框
function generateRandomString(length = 10) {
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  let form = document.forms.sending.elements;
  form.data.value = result;  // Update the input field
  return result;  // Return the generated string
}
async function AutoTest() {
  auto_test_suc_cnt = 0;
  let autoTestCount = parseInt(document.getElementById('autotest-count').value, 10);
  // 清空event-log
  // document.getElementById('event-log').innerHTML = '';
  LogTimeSpent = 0;
  let record_timestamp = performance.now();
  for (let i = 0; i < autoTestCount; i++) {
    await addToEventLog('Running auto test iteration ' + (i + 1), 1);
    // randomData_tosend = generateRandomString(); // Ensure generate new random data
    await sendData();
  }
  // 计算总共耗时
  let time_diff = performance.now() - record_timestamp;
  // wait for 0.2s to check the result
  await new Promise(r => setTimeout(r, 100));
  
  let stateLog = document.getElementById('state-log');
  if (auto_test_suc_cnt == autoTestCount) {
    addToEventLog('Auto test success! ' + auto_test_suc_cnt + '/' + autoTestCount, 'summary');
    stateLog.innerText = 'State: Success';
    stateLog.style.color = 'green';
  } else {
    addToEventLog('Auto test failed! ' + auto_test_suc_cnt + '/' + autoTestCount, 'summary');
    stateLog.innerText = 'State: Failed';
    stateLog.style.color = 'red';
  }
  addToEventLog('Total time: ' + time_diff + 'ms', 'summary');
  flushLogQueue();
}

function clearLog() {
  document.getElementById('event-log').innerHTML = '';
  document.getElementById('state-log').innerText = 'State: ';
  LogQueue = [];
}